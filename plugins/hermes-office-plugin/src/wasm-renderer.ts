// WASM Renderer Bridge - TypeScript interface for Penpot's render-wasm
// Based on Penpot's render-wasm architecture (Skia + Rust + Emscripten)

export interface WasmRenderConfig {
  width: number;
  height: number;
  dpr: number;
  enableFeatureRenderWasm: boolean;
  enableRenderWasmDpr: boolean;
}

export interface RenderCommand {
  type: 'clear' | 'drawRect' | 'drawPath' | 'drawImage' | 'drawText' | 'drawTile';
  payload: unknown;
}

export interface Tile {
  x: number;
  y: number;
  width: number;
  height: number;
  commands: RenderCommand[];
  dirty: boolean;
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface Shape {
  id: string;
  type: 'rect' | 'ellipse' | 'path' | 'image' | 'text' | 'group';
  transform: number[]; // 3x3 matrix flattened
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  children?: Shape[];
  // Path specific
  pathData?: string;
  // Image specific
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  // Text specific
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface RenderState {
  shapes: Map<string, Shape>;
  viewport: Viewport;
  tiles: Map<string, Tile>;
  dirtyTiles: Set<string>;
}

declare global {
  interface Window {
    renderWasm?: {
      init: (config: WasmRenderConfig) => Promise<void>;
      render: (state: RenderState) => Promise<void>;
      resize: (width: number, height: number) => void;
      setViewport: (viewport: Viewport) => void;
      getTileCommands: (tileX: number, tileY: number) => RenderCommand[];
      profile: () => { frameTime: number; drawCalls: number; tilesRendered: number };
      dispose: () => void;
    };
  }
}

class WasmRenderer {
  private module: WebAssembly.Module | null = null;
  private instance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: WasmRenderConfig | null = null;
  private state: RenderState = {
    shapes: new Map(),
    viewport: { x: 0, y: 0, width: 800, height: 600, scale: 1 },
    tiles: new Map(),
    dirtyTiles: new Set(),
  };
  private animationFrame: number | null = null;
  private fallbackMode = false;

  async init(config: WasmRenderConfig, canvas: HTMLCanvasElement): Promise<void> {
    this.config = config;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = config.width * config.dpr;
    canvas.height = config.height * config.dpr;

    if (config.enableFeatureRenderWasm) {
      await this.loadWasmModule();
    } else {
      this.fallbackMode = true;
      console.log('WASM renderer disabled, using Canvas 2D fallback');
    }

    this.startRenderLoop();
  }

  private async loadWasmModule(): Promise<void> {
    try {
      // In production, this loads the compiled .wasm + .js glue from Penpot's build
      // For now, we simulate the interface
      const response = await fetch('/wasm/render_wasm.js');
      if (!response.ok) throw new Error('WASM module not found');
      
      const wasmJs = await response.text();
      // The actual Penpot build outputs a Module with:
      // - Module() constructor returning Promise<Instance>
      // - Instance.exports: render, resize, set_viewport, etc.
      // - HEAPU8/HEAPF32 for memory access
      
      // Simulated initialization
      console.log('WASM renderer module loaded (simulated)');
      this.setupWasmExports();
    } catch (e) {
      console.warn('Failed to load WASM renderer, falling back to Canvas 2D:', e);
      this.fallbackMode = true;
    }
  }

  private setupWasmExports(): void {
    // These would come from the actual WASM instance exports
    // window.renderWasm = {
    //   init: this.wasmInit.bind(this),
    //   render: this.wasmRender.bind(this),
    //   resize: this.wasmResize.bind(this),
    //   setViewport: this.wasmSetViewport.bind(this),
    //   getTileCommands: this.wasmGetTileCommands.bind(this),
    //   profile: this.wasmProfile.bind(this),
    //   dispose: this.wasmDispose.bind(this),
    // };
  }

  private startRenderLoop(): void {
    const loop = () => {
      this.renderFrame();
      this.animationFrame = requestAnimationFrame(loop);
    };
    loop();
  }

  private renderFrame(): void {
    if (!this.canvas || !this.ctx) return;

    if (this.fallbackMode) {
      this.renderFallback();
    } else {
      this.renderWasm();
    }
  }

  private renderFallback(): void {
    const { width, height } = this.canvas!;
    const ctx = this.ctx!;
    const dpr = this.config?.dpr || 1;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width / dpr, height / dpr);

    // Apply viewport transform
    const { x, y, scale } = this.state.viewport;
    ctx.translate(-x * scale, -y * scale);
    ctx.scale(scale, scale);

    // Render shapes (simplified - real implementation uses tile culling)
    for (const shape of this.state.shapes.values()) {
      this.drawShape(ctx, shape);
    }

    ctx.restore();
  }

  private drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
    ctx.save();
    
    // Apply transform
    const [a, b, c, d, e, f] = shape.transform;
    ctx.transform(a, b, c, d, e, f);

    ctx.globalAlpha = shape.opacity ?? 1;

    if (shape.fill) ctx.fillStyle = shape.fill;
    if (shape.stroke) {
      ctx.strokeStyle = shape.stroke;
      ctx.lineWidth = shape.strokeWidth ?? 1;
    }

    switch (shape.type) {
      case 'rect':
        // Assuming shape has x, y, width, height in payload
        break;
      case 'ellipse':
        break;
      case 'path':
        if (shape.pathData) {
          const path = new Path2D(shape.pathData);
          if (shape.fill) ctx.fill(path);
          if (shape.stroke) ctx.stroke(path);
        }
        break;
      case 'image':
        // Would need ImageBitmap or HTMLImageElement
        break;
      case 'text':
        if (shape.text) {
          ctx.font = `${shape.fontWeight || 'normal'} ${shape.fontSize || 12}px ${shape.fontFamily || 'monospace'}`;
          ctx.textAlign = shape.textAlign || 'left';
          if (shape.fill) ctx.fillText(shape.text, 0, 0);
          if (shape.stroke) ctx.strokeText(shape.text, 0, 0);
        }
        break;
      case 'group':
        if (shape.children) {
          for (const child of shape.children) {
            this.drawShape(ctx, child);
          }
        }
        break;
    }

    ctx.restore();
  }

  private renderWasm(): void {
    // In real implementation, this calls into WASM:
    // this.instance.exports.render(this.state);
    // Then copies result from WASM memory to canvas
    console.log('WASM render path (not implemented)');
  }

  // Public API
  addShape(shape: Shape): void {
    this.state.shapes.set(shape.id, shape);
    this.markDirtyForShape(shape);
  }

  removeShape(id: string): void {
    const shape = this.state.shapes.get(id);
    if (shape) {
      this.markDirtyForShape(shape);
      this.state.shapes.delete(id);
    }
  }

  updateShape(id: string, updates: Partial<Shape>): void {
    const shape = this.state.shapes.get(id);
    if (shape) {
      this.markDirtyForShape(shape);
      this.state.shapes.set(id, { ...shape, ...updates });
      this.markDirtyForShape(this.state.shapes.get(id)!);
    }
  }

  setViewport(viewport: Partial<Viewport>): void {
    this.state.viewport = { ...this.state.viewport, ...viewport };
    if (!this.fallbackMode && window.renderWasm?.setViewport) {
      window.renderWasm.setViewport(this.state.viewport);
    }
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.config) return;
    this.config.width = width;
    this.config.height = height;
    this.canvas.width = width * this.config.dpr;
    this.canvas.height = height * this.config.dpr;
    if (!this.fallbackMode && window.renderWasm?.resize) {
      window.renderWasm.resize(width, height);
    }
  }

  private markDirtyForShape(shape: Shape): void {
    // Calculate which tiles this shape touches and mark them dirty
    // Simplified: mark all tiles dirty for now
    this.state.dirtyTiles.clear();
    // Real implementation: compute tile bounds from shape transform + bounds
  }

  getProfile() {
    if (window.renderWasm?.profile) {
      return window.renderWasm.profile();
    }
    return { frameTime: 0, drawCalls: this.state.shapes.size, tilesRendered: 0 };
  }

  dispose(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    if (window.renderWasm?.dispose) window.renderWasm.dispose();
    this.canvas = null;
    this.ctx = null;
  }
}

export const wasmRenderer = new WasmRenderer();

// Helper to create shapes for office mode
export function createAgentShape(agent: { id: string; name: string; position: { x: number; y: number }; color: string }): Shape {
  return {
    id: `agent-${agent.id}`,
    type: 'group',
    transform: [1, 0, 0, 1, agent.position.x, agent.position.y],
    children: [
      {
        id: `agent-body-${agent.id}`,
        type: 'ellipse',
        transform: [1, 0, 0, 1, 0, 0],
        fill: agent.color,
        // Ellipse rendered as circle via transform scale
      },
      {
        id: `agent-label-${agent.id}`,
        type: 'text',
        transform: [1, 0, 0, 1, 0, -16],
        text: agent.name,
        fontFamily: 'monospace',
        fontSize: 10,
        fill: '#fff',
        textAlign: 'center',
      },
    ],
  };
}

export function createChatBubbleShape(message: { id: string; content: string; position: { x: number; y: number }; senderColor: string }): Shape {
  return {
    id: `chat-${message.id}`,
    type: 'group',
    transform: [1, 0, 0, 1, message.position.x, message.position.y - 30],
    children: [
      {
        id: `chat-bg-${message.id}`,
        type: 'rect',
        transform: [1, 0, 0, 1, -50, -20],
        fill: 'rgba(0,0,0,0.7)',
        // Rounded rect would need path
      },
      {
        id: `chat-text-${message.id}`,
        type: 'text',
        transform: [1, 0, 0, 1, 0, -10],
        text: message.content,
        fontFamily: 'monospace',
        fontSize: 10,
        fill: '#fff',
        textAlign: 'center',
      },
    ],
  };
}