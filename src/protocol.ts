export type AgentStatus = 'working' | 'thinking' | 'idle' | 'blocked';
export type Zone = 'desks' | 'meeting' | 'lounge' | 'lab';
export type Theme = 'studio' | 'midnight' | 'blueprint';
export type ArtStyle = 'soft' | 'voxel' | 'wireframe';
export type HairStyle = 'short' | 'long' | 'bun' | 'cap' | 'hood' | 'spiky' | 'bald';
export type Accessory = 'none' | 'glasses' | 'beard' | 'glasses-beard' | 'headset';

export interface Avatar { skin?: string; hair?: string; hairStyle?: HairStyle; accessory?: Accessory }

export interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  status: AgentStatus;
  task: string;
  zone: Zone;
  floor?: string;
  progress?: number;
  avatar?: Avatar;
}

export type FloorEvent =
  | { type: 'agent.upsert'; agent: Agent }
  | { type: 'agent.move'; id: string; zone: Zone; floor?: string }
  | { type: 'agent.remove'; id: string }
  | { type: 'activity'; id: string; message: string };

export interface Activity { key: number; id: string; message: string; time: number }
export interface FloorState { agents: Agent[]; activities: Activity[]; revision: number }

const zones = ['desks', 'meeting', 'lounge', 'lab'];
const statuses = ['working', 'thinking', 'idle', 'blocked'];
export const hairStyles: HairStyle[] = ['short', 'long', 'bun', 'cap', 'hood', 'spiky', 'bald'];
export const accessories: Accessory[] = ['none', 'glasses', 'beard', 'glasses-beard', 'headset'];
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 500;
const hex = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || check(value);
export const isFloorId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value);

function isAvatar(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const avatar = value as Record<string, unknown>;
  return optional(avatar.skin, hex) && optional(avatar.hair, hex)
    && optional(avatar.hairStyle, style => hairStyles.includes(style as HairStyle))
    && optional(avatar.accessory, item => accessories.includes(item as Accessory));
}

export function isFloorEvent(value: unknown): value is FloorEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (event.type === 'agent.upsert') {
    if (!event.agent || typeof event.agent !== 'object') return false;
    const agent = event.agent as Record<string, unknown>;
    return ['id', 'name', 'role', 'task'].every(key => text(agent[key]))
      && hex(agent.color) && zones.includes(String(agent.zone)) && statuses.includes(String(agent.status))
      && optional(agent.floor, isFloorId) && optional(agent.avatar, isAvatar)
      && optional(agent.progress, value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
  }
  if (!text(event.id)) return false;
  return event.type === 'agent.remove'
    || (event.type === 'agent.move' && zones.includes(String(event.zone)) && optional(event.floor, isFloorId))
    || (event.type === 'activity' && text(event.message));
}

export function createFloorStore(initialAgents: Agent[] = []) {
  let state: FloorState = { agents: initialAgents, activities: [], revision: 0 };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reset() {
      state = { agents: [], activities: [], revision: 0 };
      listeners.forEach(listener => listener());
    },
    dispatch(input: unknown) {
      if (!isFloorEvent(input)) return false;
      const event = input;
      let agents = state.agents;
      let activities = state.activities;
      if (event.type === 'agent.upsert') agents = agents.some(agent => agent.id === event.agent.id)
        ? agents.map(agent => agent.id === event.agent.id ? event.agent : agent)
        : [...agents, event.agent];
      if (event.type === 'agent.remove') agents = agents.filter(agent => agent.id !== event.id);
      if (event.type === 'agent.move') agents = agents.map(agent => agent.id === event.id ? { ...agent, zone: event.zone, ...(event.floor ? { floor: event.floor } : {}) } : agent);
      if (event.type === 'activity') activities = [{ key: state.revision + 1, id: event.id, message: event.message, time: Date.now() }, ...activities].slice(0, 60);
      state = { agents, activities, revision: state.revision + 1 };
      listeners.forEach(listener => listener());
      return true;
    },
  };
}

export type FloorStore = ReturnType<typeof createFloorStore>;