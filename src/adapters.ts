import { isFloorEvent, type FloorStore } from './protocol';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'invalid';

export function connectEventSource(store: FloorStore, url: string, onStatus: (status: ConnectionStatus) => void = () => {}) {
  const parsed = new URL(url, window.location.href);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an HTTP or HTTPS events endpoint.');
  onStatus('connecting');
  const source = new EventSource(parsed.href);
  source.onopen = () => onStatus('connected');
  source.onerror = () => onStatus('disconnected');
  source.onmessage = message => {
    try { onStatus(store.dispatch(JSON.parse(message.data)) ? 'connected' : 'invalid'); }
    catch { onStatus('invalid'); }
  };
  return () => { source.close(); onStatus('disconnected'); };
}

export function connectWindowMessages(store: FloorStore, allowedOrigin: string, sourceWindow: Window = window.parent) {
  if (allowedOrigin === '*' || !allowedOrigin) throw new Error('An exact trusted origin is required.');
  const listener = (message: MessageEvent) => {
    if (message.origin !== allowedOrigin || message.source !== sourceWindow) return;
    if (message.data?.source === 'agent-floor-ui' && isFloorEvent(message.data.event)) store.dispatch(message.data.event);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}