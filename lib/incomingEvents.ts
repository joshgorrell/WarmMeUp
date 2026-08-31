type IncomingHandler = (event?: string) => void;

const handlers = new Set<IncomingHandler>();

/**
 * Emit an incoming event to all registered handlers.
 * Used by AuthContext to broadcast realtime events (e.g. partner joined)
 * to UI components that subscribe via onIncoming.
 */
export function emitIncoming(event?: string): void {
  handlers.forEach((h) => {
    try {
      h(event);
    } catch {
      // ignore handler errors
    }
  });
}

/**
 * Subscribe to incoming events. Returns an unsubscribe function.
 */
export function onIncoming(handler: IncomingHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
