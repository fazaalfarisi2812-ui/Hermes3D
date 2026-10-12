// Spatial index for office mode - inspired by Penpot's render-wasm/tiles.rs
// Tile-based spatial partitioning for efficient avatar proximity queries

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AgentSpatial {
  id: string;
  position: Point;
  radius: number;
  data: unknown;
}

const TILE_SIZE = 64; // pixels per tile (matches Penpot's tile rendering)

function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

function pointToTile(p: Point): { tx: number; ty: number } {
  return {
    tx: Math.floor(p.x / TILE_SIZE),
    ty: Math.floor(p.y / TILE_SIZE),
  };
}

function rectToTiles(rect: Rect): Array<{ tx: number; ty: number }> {
  const tiles: Array<{ tx: number; ty: number }> = [];
  const minTx = Math.floor(rect.x / TILE_SIZE);
  const maxTx = Math.floor((rect.x + rect.width) / TILE_SIZE);
  const minTy = Math.floor(rect.y / TILE_SIZE);
  const maxTy = Math.floor((rect.y + rect.height) / TILE_SIZE);

  for (let tx = minTx; tx <= maxTx; tx++) {
    for (let ty = minTy; ty <= maxTy; ty++) {
      tiles.push({ tx, ty });
    }
  }
  return tiles;
}

export class SpatialIndex {
  private tiles = new Map<string, Set<string>>();
  private agents = new Map<string, AgentSpatial>();

  insert(agent: AgentSpatial): void {
    this.agents.set(agent.id, agent);
    const tiles = this.getTilesForAgent(agent);
    for (const { tx, ty } of tiles) {
      const key = tileKey(tx, ty);
      if (!this.tiles.has(key)) this.tiles.set(key, new Set());
      this.tiles.get(key)!.add(agent.id);
    }
  }

  remove(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const tiles = this.getTilesForAgent(agent);
    for (const { tx, ty } of tiles) {
      const key = tileKey(tx, ty);
      const set = this.tiles.get(key);
      if (set) {
        set.delete(agentId);
        if (set.size === 0) this.tiles.delete(key);
      }
    }
    this.agents.delete(agentId);
  }

  updatePosition(agentId: string, newPosition: Point): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.remove(agentId);
    this.insert({ ...agent, position: newPosition });
  }

  private getTilesForAgent(agent: AgentSpatial): Array<{ tx: number; ty: number }> {
    const radius = agent.radius || 8;
    return rectToTiles({
      x: agent.position.x - radius,
      y: agent.position.y - radius,
      width: radius * 2,
      height: radius * 2,
    });
  }

  queryRadius(center: Point, radius: number): AgentSpatial[] {
    const rect: Rect = {
      x: center.x - radius,
      y: center.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
    const candidateIds = new Set<string>();
    for (const { tx, ty } of rectToTiles(rect)) {
      const set = this.tiles.get(tileKey(tx, ty));
      if (set) for (const id of set) candidateIds.add(id);
    }
    const results: AgentSpatial[] = [];
    const radiusSq = radius * radius;
    for (const id of candidateIds) {
      const agent = this.agents.get(id);
      if (!agent) continue;
      const dx = agent.position.x - center.x;
      const dy = agent.position.y - center.y;
      if (dx * dx + dy * dy <= radiusSq) results.push(agent);
    }
    return results;
  }

  queryRect(rect: Rect): AgentSpatial[] {
    const candidateIds = new Set<string>();
    for (const { tx, ty } of rectToTiles(rect)) {
      const set = this.tiles.get(tileKey(tx, ty));
      if (set) for (const id of set) candidateIds.add(id);
    }
    const results: AgentSpatial[] = [];
    for (const id of candidateIds) {
      const agent = this.agents.get(id);
      if (agent) results.push(agent);
    }
    return results;
  }

  getNearby(agentId: string, radius: number): AgentSpatial[] {
    const agent = this.agents.get(agentId);
    if (!agent) return [];
    return this.queryRadius(agent.position, radius).filter((a) => a.id !== agentId);
  }

  getAll(): AgentSpatial[] {
    return Array.from(this.agents.values());
  }

  clear(): void {
    this.tiles.clear();
    this.agents.clear();
  }

  size(): number {
    return this.agents.size;
  }
}

// Zone system for office areas (meeting rooms, focus zones, etc.)
export interface Zone {
  id: string;
  name: string;
  bounds: Rect;
  type: 'meeting' | 'focus' | 'social' | 'custom';
  capacity?: number;
}

export class ZoneManager {
  private zones = new Map<string, Zone>();
  private spatialIndex: SpatialIndex;

  constructor(spatialIndex: SpatialIndex) {
    this.spatialIndex = spatialIndex;
  }

  addZone(zone: Zone): void {
    this.zones.set(zone.id, zone);
  }

  removeZone(zoneId: string): void {
    this.zones.delete(zoneId);
  }

  getZoneAt(point: Point): Zone | null {
    for (const zone of this.zones.values()) {
      if (
        point.x >= zone.bounds.x &&
        point.x <= zone.bounds.x + zone.bounds.width &&
        point.y >= zone.bounds.y &&
        point.y <= zone.bounds.y + zone.bounds.height
      ) {
        return zone;
      }
    }
    return null;
  }

  getAgentsInZone(zoneId: string): AgentSpatial[] {
    const zone = this.zones.get(zoneId);
    if (!zone) return [];
    return this.spatialIndex.queryRect(zone.bounds);
  }

  getZones(): Zone[] {
    return Array.from(this.zones.values());
  }
}

// Chat radius system - messages only reach nearby agents
export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: number;
  radius: number;
  position: Point;
}

export class ChatRadiusManager {
  private spatialIndex: SpatialIndex;
  private messages: ChatMessage[] = [];

  constructor(spatialIndex: SpatialIndex) {
    this.spatialIndex = spatialIndex;
  }

  send(message: ChatMessage): AgentSpatial[] {
    this.messages.push(message);
    const recipients = this.spatialIndex.queryRadius(message.position, message.radius);
    return recipients.filter((a) => a.id !== message.senderId);
  }

  getHistory(limit = 100): ChatMessage[] {
    return this.messages.slice(-limit);
  }

  clear(): void {
    this.messages = [];
  }
}