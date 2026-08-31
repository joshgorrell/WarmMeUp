export interface UploadProgressState {
  visible: boolean;
  label: string;
  pct: number;
}

let currentState: UploadProgressState = { visible: false, label: '', pct: 0 };
const subscribers = new Set<(s: UploadProgressState) => void>();

/**
 * Get the current upload progress state.
 */
export function getUploadProgressState(): UploadProgressState {
  return currentState;
}

/**
 * Subscribe to upload progress changes. Returns an unsubscribe function.
 */
export function subscribeUploadProgress(cb: (s: UploadProgressState) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Update the upload progress state and notify all subscribers.
 */
export function setUploadProgress(label: string, pct: number): void {
  currentState = { visible: true, label, pct };
  subscribers.forEach((cb) => cb(currentState));
}

/**
 * Hide the upload progress overlay.
 */
export function hideUploadProgress(): void {
  currentState = { visible: false, label: '', pct: 0 };
  subscribers.forEach((cb) => cb(currentState));
}
