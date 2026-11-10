import { createRoot } from 'react-dom/client';
import { AgentFloor, type AgentFloorProps } from './AgentFloor';
import { createFloorStore } from './protocol';

export { AgentFloor } from './AgentFloor';
export type { AgentFloorProps } from './AgentFloor';
export * from './protocol';
export { connectEventSource, connectWindowMessages } from './adapters';
export { createFloor, defaultFloors, surfaces, type FloorConfig, type Surface } from './floors';
export { resolveAvatar, type ResolvedAvatar } from './avatar';

export function mountAgentFloor(element: HTMLElement, options: Omit<AgentFloorProps, 'store'> & { store?: ReturnType<typeof createFloorStore> } = {}) {
  const store = options.store ?? createFloorStore();
  const root = createRoot(element);
  root.render(<AgentFloor {...options} store={store} />);
  return { store, dispatch: store.dispatch, unmount: () => root.unmount() };
}