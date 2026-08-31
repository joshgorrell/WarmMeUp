export type UploadProgressState = {
  visible: boolean;
  label: string;
  pct: number;
};

type Listener = (state: UploadProgressState) => void;

let state: UploadProgressState = {
  visible: false,
  label: 'Uploading…',
  pct: 0,
};

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach(listener => listener(state));
}

export function getUploadProgressState(): UploadProgressState {
  return state;
}

export function subscribeUploadProgress(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function beginUploadProgress(label: string) {
  state = { visible: true, label, pct: 0 };
  emit();
}

export function setUploadProgressPct(pct: number) {
  const nextPct = Math.max(0, Math.min(100, Math.round(pct)));
  state = { ...state, visible: true, pct: nextPct };
  emit();
}

export function finishUploadProgress() {
  state = { ...state, pct: 100 };
  emit();
  setTimeout(() => {
    state = { visible: false, label: 'Uploading…', pct: 0 };
    emit();
  }, 500);
}

export function cancelUploadProgress() {
  state = { visible: false, label: 'Uploading…', pct: 0 };
  emit();
}
