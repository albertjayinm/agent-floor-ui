import type { Agent, FloorStore, Zone } from './protocol';

export const demoAgents: Agent[] = [
  { id: 'atlas', name: 'Atlas', role: 'Orchestrator', color: '#f37b57', status: 'working', task: 'Planning the next sprint', zone: 'meeting', floor: 'main', progress: 40, avatar: { hairStyle: 'short', accessory: 'glasses-beard', hair: '#2b2321', skin: '#efc19c' } },
  { id: 'nova', name: 'Nova', role: 'Frontend engineer', color: '#7c79df', status: 'working', task: 'Building the dashboard', zone: 'desks', floor: 'main', progress: 62, avatar: { hairStyle: 'bun', accessory: 'headset', hair: '#5b3a26', skin: '#f7d7bd' } },
  { id: 'sage', name: 'Sage', role: 'Research analyst', color: '#53b79b', status: 'thinking', task: 'Reviewing the architecture', zone: 'lounge', floor: 'loft', progress: 25, avatar: { hairStyle: 'hood', accessory: 'none', hair: '#3fb8b0', skin: '#f2c6a0' } },
  { id: 'pixel', name: 'Pixel', role: 'Product designer', color: '#eca847', status: 'working', task: 'Refining the design system', zone: 'desks', floor: 'main', progress: 78, avatar: { hairStyle: 'long', accessory: 'glasses', hair: '#9c5b34', skin: '#d9a07a' } },
  { id: 'echo', name: 'Echo', role: 'QA engineer', color: '#559cda', status: 'working', task: 'Running integration tests', zone: 'lab', floor: 'loft', progress: 55, avatar: { hairStyle: 'cap', accessory: 'none', hair: '#26313f', skin: '#b67a55' } },
  { id: 'orbit', name: 'Orbit', role: 'Backend engineer', color: '#d873a1', status: 'idle', task: 'Waiting for the next task', zone: 'lounge', floor: 'main', avatar: { hairStyle: 'spiky', accessory: 'beard', hair: '#2b2321', skin: '#8a5a3c' } },
];

const steps: { id: string; zone: Zone; floor?: string; task: string; status: Agent['status']; progress?: number; message: string }[] = [
  { id: 'nova', zone: 'meeting', task: 'Sharing the dashboard preview', status: 'working', progress: 70, message: 'Shared a dashboard preview with Atlas' },
  { id: 'sage', zone: 'lab', floor: 'main', task: 'Validating architecture decisions', status: 'thinking', progress: 45, message: 'Came down to the main floor for an architecture review' },
  { id: 'echo', zone: 'desks', floor: 'main', task: 'Verifying the dashboard build', status: 'working', progress: 30, message: 'Integration tests passed. Reviewing UI changes' },
  { id: 'orbit', zone: 'lab', task: 'Implementing the events API', status: 'working', progress: 15, message: 'Picked up the events API task' },
  { id: 'pixel', zone: 'meeting', task: 'Reviewing the design handoff', status: 'thinking', progress: 85, message: 'Requested a design review' },
  { id: 'atlas', zone: 'desks', task: 'Coordinating implementation', status: 'working', progress: 55, message: 'Assigned the next implementation milestone' },
  { id: 'nova', zone: 'desks', task: 'Building the dashboard', status: 'working', progress: 88, message: 'Returned to the dashboard implementation' },
  { id: 'sage', zone: 'lounge', floor: 'loft', task: 'Reviewing research findings', status: 'idle', message: 'Published architecture notes in the loft' },
  { id: 'echo', zone: 'lab', floor: 'loft', task: 'Running regression tests', status: 'working', progress: 20, message: 'Started a new regression suite' },
  { id: 'orbit', zone: 'lounge', task: 'Waiting for code review', status: 'blocked', progress: 60, message: 'Waiting for review of the events API' },
  { id: 'pixel', zone: 'desks', task: 'Refining the design system', status: 'working', progress: 92, message: 'Updated the component tokens' },
  { id: 'atlas', zone: 'meeting', task: 'Planning the next sprint', status: 'thinking', progress: 70, message: 'Preparing the next team checkpoint' },
];

export function seedDemo(store: FloorStore) {
  demoAgents.forEach(agent => store.dispatch({ type: 'agent.upsert', agent }));
  store.dispatch({ type: 'activity', id: 'atlas', message: 'Workspace is ready. Six agents checked in' });
  store.dispatch({ type: 'activity', id: 'pixel', message: 'Published the first design direction' });
  store.dispatch({ type: 'activity', id: 'nova', message: 'Started building the dashboard' });
}

export function startDemo(store: FloorStore) {
  let step = 0;
  const timer = window.setInterval(() => {
    const next = steps[step++ % steps.length];
    const agent = store.getSnapshot().agents.find(item => item.id === next.id);
    if (!agent) return;
    const { progress, ...current } = agent;
    store.dispatch({ type: 'agent.upsert', agent: { ...current, status: next.status, task: next.task, ...(next.progress === undefined ? {} : { progress: next.progress }) } });
    store.dispatch({ type: 'agent.move', id: next.id, zone: next.zone, ...(next.floor ? { floor: next.floor } : {}) });
    store.dispatch({ type: 'activity', id: next.id, message: next.message });
  }, 4200);
  return () => window.clearInterval(timer);
}