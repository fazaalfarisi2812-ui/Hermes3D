import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient, RedisClientType } from 'redis';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createServer } from 'http';

interface PluginMessage {
  id: string;
  type: string;
  payload: unknown;
}

interface PendingTask {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class PluginBridge {
  private wss: WebSocketServer;
  private pendingTasks = new Map<string, PendingTask>();
  private redis?: RedisClientType;
  private redisSubscriber?: RedisClientType;
  private instanceId: string;

  constructor(port: number = 4402, redisUrl?: string) {
    this.instanceId = `mcp-${randomUUID().slice(0, 8)}`;
    this.wss = new WebSocketServer({ port });
    this.setupWebSocket();
    if (redisUrl) this.setupRedis(redisUrl);
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (data: Buffer) => {
        try {
          const msg: PluginMessage = JSON.parse(data.toString());
          this.handleMessage(ws, msg);
        } catch (e) {
          ws.send(JSON.stringify({ id: randomUUID(), type: 'error', payload: { message: 'Invalid JSON' } }));
        }
      });
      ws.on('close', () => this.cleanup(ws));
    });
  }

  private async setupRedis(url: string) {
    this.redis = createClient({ url }) as RedisClientType;
    this.redisSubscriber = this.redis.duplicate();
    await this.redis.connect();
    await this.redisSubscriber.connect();
    await this.redisSubscriber.subscribe(`mcp:response:${this.instanceId}`, (msg) => {
      const response = JSON.parse(msg);
      this.resolvePending(response);
    });
  }

  private handleMessage(ws: WebSocket, msg: PluginMessage) {
    if (msg.type === 'response' && msg.payload && typeof msg.payload === 'object' && 'id' in msg.payload) {
      const payload = msg.payload as { id: unknown };
      if (typeof payload.id === 'string') {
        this.resolvePending(msg.payload as { id: string; result?: unknown; error?: string });
      }
    }
  }

  private resolvePending(response: { id: string; result?: unknown; error?: string }) {
    const pending = this.pendingTasks.get(response.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingTasks.delete(response.id);
      if (response.error) pending.reject(new Error(response.error));
      else pending.resolve(response.result);
    }
  }

  async dispatch(pluginId: string, type: string, payload: unknown): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingTasks.delete(id);
        reject(new Error('Plugin timeout'));
      }, 30000);
      this.pendingTasks.set(id, { resolve, reject, timeout });

      const message = { id, type, payload, target: pluginId };
      if (this.redis) {
        this.redis.publish('mcp:request', JSON.stringify(message));
      } else {
        this.wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    });
  }

  private cleanup(ws: WebSocket) {}

  getWss(): WebSocketServer {
    return this.wss;
  }
}

class TaskDispatcher {
  private bridge: PluginBridge;
  private plugins = new Map<string, WebSocket>();

  constructor(bridge: PluginBridge) {
    this.bridge = bridge;
  }

  registerPlugin(pluginId: string, ws: WebSocket) {
    this.plugins.set(pluginId, ws);
  }

  async execute(pluginId: string, tool: string, args: unknown) {
    return this.bridge.dispatch(pluginId, tool, args);
  }
}

const server = new McpServer({
  name: 'hermes3d-mcp',
  version: '1.0.0',
});

const bridge = new PluginBridge(4402, process.env.REDIS_URL);
const dispatcher = new TaskDispatcher(bridge);

server.registerTool('agents.list', {
  description: 'List all connected agents',
  inputSchema: z.object({}).shape,
}, async () => {
  return { content: [{ type: 'text', text: JSON.stringify({ agents: [] }) }] };
});

server.registerTool('agents.spawn', {
  description: 'Spawn a new agent',
  inputSchema: z.object({
    name: z.string(),
    role: z.string(),
    config: z.record(z.unknown()).optional(),
  }).shape,
}, async ({ name, role, config }) => {
  return { content: [{ type: 'text', text: JSON.stringify({ id: randomUUID(), name, role, config }) }] };
});

server.registerTool('office.enter', {
  description: 'Enter office mode (2D pixel)',
  inputSchema: z.object({
    agentId: z.string(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
  }).shape,
}, async ({ agentId, position }) => {
  return { content: [{ type: 'text', text: JSON.stringify({ agentId, position: position || { x: 0, y: 0 } }) }] };
});

server.registerTool('office.move', {
  description: 'Move agent in office',
  inputSchema: z.object({
    agentId: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
  }).shape,
}, async ({ agentId, position }) => {
  await dispatcher.execute('office-renderer', 'move', { agentId, position });
  return { content: [{ type: 'text', text: 'ok' }] };
});

server.registerTool('office.chat', {
  description: 'Send chat message in office',
  inputSchema: z.object({
    agentId: z.string(),
    message: z.string(),
    radius: z.number().optional(),
  }).shape,
}, async ({ agentId, message, radius }) => {
  await dispatcher.execute('office-renderer', 'chat', { agentId, message, radius });
  return { content: [{ type: 'text', text: 'sent' }] };
});

async function main() {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    if (req.url?.startsWith('/mcp')) {
      await transport.handleRequest(req as any, res);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  // Handle WebSocket upgrade for MCP
  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/mcp')) {
      bridge.getWss().handleUpgrade(request, socket, head, (ws) => {
        bridge.getWss().emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(3002, () => {
    console.log('Hermes3D MCP server running on http://localhost:3002/mcp');
    console.log('Plugin bridge WebSocket on ws://localhost:4402');
  });
}

main().catch(console.error);