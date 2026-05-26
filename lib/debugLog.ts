export type DebugEvent = {
  tag: string;
  timestamp: string;
  data: Record<string, unknown>;
};

const MAX_EVENTS = 50;
const events: DebugEvent[] = [];
let listeners: Array<() => void> = [];

export function logDebugEvent(tag: string, data: Record<string, unknown> = {}): void {
  const event: DebugEvent = { tag, timestamp: new Date().toISOString(), data };
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.splice(MAX_EVENTS);
  console.log(`[${tag}]`, data);
  listeners.forEach(fn => fn());
}

export function getDebugEvents(): DebugEvent[] {
  return [...events];
}

export function clearDebugEvents(): void {
  events.splice(0);
  listeners.forEach(fn => fn());
}

/** Subscribe to event additions. Returns an unsubscribe function. */
export function subscribeDebugEvents(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}
