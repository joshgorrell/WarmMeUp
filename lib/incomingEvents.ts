type IncomingHandler = () => void;

const handlers = new Set<IncomingHandler>();

let lastEmitAt = 0;

/**
 * Fire a "something new came in from your partner" ping.
 * Debounced to ~1s so a burst of events only plays the slash once.
 */
export function emitIncoming() {
  const now = Date.now();
  if (now - lastEmitAt < 1000) return;
  lastEmitAt = now;
  handlers.forEach(h => {
    try { h(); } catch {}
  });
}

export function onIncoming(handler: IncomingHandler): () => void {
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}
