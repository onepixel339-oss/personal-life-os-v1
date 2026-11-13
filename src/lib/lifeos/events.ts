/* Tiny change bus: services emit store names they touched; the search index
   and other observers react. Keeps services decoupled from consumers. */

type Listener = (stores: string[]) => void;

const listeners = new Set<Listener>();

export function onDataChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitChange(stores: string[]): void {
  for (const fn of listeners) {
    try {
      fn(stores);
    } catch (e) {
      // observer errors must never break a write, but they are real bugs — log them
      console.error("change observer failed", stores, e);
    }
  }
}
