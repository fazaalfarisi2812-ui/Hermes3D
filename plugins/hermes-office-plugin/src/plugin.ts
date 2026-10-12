interface HermesPluginAPI {
  ui: {
    open: (options: { width: number; height: number; title: string }) => void;
    close: () => void;
    sendMessage: (message: PluginMessage) => void;
    onMessage: (handler: (message: PluginMessage) => void) => () => void;
  };
  agents: {
    list: () => Promise<Agent[]>;
    spawn: (config: AgentConfig) => Promise<Agent>;
    on: (event: 'spawn' | 'despawn' | 'move', handler: (agent: Agent) => void) => () => void;
  };
  office: {
    enter: (agentId: string, position?: { x: number; y: number }) => Promise<void>;
    leave: (agentId: string) => Promise<void>;
    move: (agentId: string, position: { x: number; y: number }) => Promise<void>;
    on: (event: 'enter' | 'leave' | 'move' | 'chat', handler: (data: OfficeEvent) => void) => () => void;
  };
  chat: {
    send: (message: ChatMessage) => Promise<void>;
    on: (handler: (message: ChatMessage) => void) => () => void;
  };
  theme: {
    get: () => 'light' | 'dark';
    on: (handler: (theme: 'light' | 'dark') => void) => () => void;
  };
}

interface Agent {
  id: string;
  name: string;
  role: string;
  position?: { x: number; y: number };
  status: 'idle' | 'working' | 'away';
}

interface AgentConfig {
  name: string;
  role: string;
  config?: Record<string, unknown>;
}

interface PluginMessage {
  type: string;
  payload: unknown;
}

interface OfficeEvent {
  agentId: string;
  position?: { x: number; y: number };
  message?: string;
}

interface ChatMessage {
  id: string;
  agentId: string;
  content: string;
  timestamp: number;
  radius?: number;
}

declare global {
  interface Window {
    hermes: HermesPluginAPI;
  }
}

class OfficePlugin {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private agents = new Map<string, Agent>();
  private localAgentId: string | null = null;
  private unsubscribe: Array<() => void> = [];

  async init() {
    await this.waitForHermes();
    this.setupUI();
    this.subscribeToEvents();
    this.renderLoop();
  }

  private waitForHermes(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (window.hermes) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }

  private setupUI() {
    window.hermes.ui.open({ width: 800, height: 600, title: 'Hermes Office' });
    this.canvas = document.createElement('canvas');
    this.canvas.width = 800;
    this.canvas.height = 600;
    this.canvas.style.border = '1px solid #ccc';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('click', this.handleClick.bind(this));
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private subscribeToEvents() {
    this.unsubscribe.push(
      window.hermes.agents.on('spawn', (agent) => this.agents.set(agent.id, agent)),
      window.hermes.agents.on('despawn', (agent) => this.agents.delete(agent.id)),
      window.hermes.agents.on('move', (agent) => this.agents.set(agent.id, agent)),
      window.hermes.office.on('enter', (e) => this.onAgentEnter(e)),
      window.hermes.office.on('leave', (e) => this.onAgentLeave(e)),
      window.hermes.office.on('move', (e) => this.onAgentMove(e)),
      window.hermes.office.on('chat', (e) => this.onChat(e)),
      window.hermes.chat.on((msg) => this.onChatMessage(msg)),
      window.hermes.theme.on((t) => this.onThemeChange(t))
    );
  }

  private async onAgentEnter(event: OfficeEvent) {
    const agent = this.agents.get(event.agentId);
    if (agent) {
      agent.position = event.position || { x: 0, y: 0 };
    }
  }

  private onAgentLeave(event: OfficeEvent) {
    this.agents.delete(event.agentId);
  }

  private onAgentMove(event: OfficeEvent) {
    const agent = this.agents.get(event.agentId);
    if (agent && event.position) agent.position = event.position;
  }

  private onChat(event: OfficeEvent) {
    console.log(`Chat from ${event.agentId}: ${event.message}`);
  }

  private onChatMessage(message: ChatMessage) {
    console.log(`[${message.agentId}] ${message.content}`);
  }

  private onThemeChange(theme: 'light' | 'dark') {
    this.render();
  }

  private handleClick(e: MouseEvent) {
    if (!this.localAgentId || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    window.hermes.office.move(this.localAgentId, { x, y });
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.localAgentId) return;
    const agent = this.agents.get(this.localAgentId);
    if (!agent || !agent.position) return;
    const step = 16;
    let { x, y } = agent.position;
    switch (e.key) {
      case 'ArrowUp': y -= step; break;
      case 'ArrowDown': y += step; break;
      case 'ArrowLeft': x -= step; break;
      case 'ArrowRight': x += step; break;
      default: return;
    }
    window.hermes.office.move(this.localAgentId, { x, y });
  }

  private render() {
    if (!this.ctx || !this.canvas) return;
    const theme = window.hermes.theme.get();
    this.ctx.fillStyle = theme === 'dark' ? '#1a1a1a' : '#f5f5f5';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'center';
    this.agents.forEach((agent) => {
      if (!agent.position) return;
      this.ctx!.fillStyle = agent.id === this.localAgentId ? '#4ade80' : '#60a5fa';
      this.ctx!.beginPath();
      this.ctx!.arc(agent.position.x, agent.position.y, 8, 0, Math.PI * 2);
      this.ctx!.fill();
      this.ctx!.fillStyle = theme === 'dark' ? '#fff' : '#000';
      this.ctx!.fillText(agent.name, agent.position.x, agent.position.y - 12);
    });
  }

  private renderLoop() {
    this.render();
    requestAnimationFrame(() => this.renderLoop());
  }

  destroy() {
    this.unsubscribe.forEach((fn) => fn());
    this.canvas?.remove();
    window.hermes.ui.close();
  }
}

const plugin = new OfficePlugin();
plugin.init().catch(console.error);

if (import.meta && typeof import.meta === 'object' && 'hot' in import.meta && import.meta.hot) {
  (import.meta.hot as { dispose: (fn: () => void) => void }).dispose(() => plugin.destroy());
}