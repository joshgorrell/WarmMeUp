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

// Invalidate delayed completion from an earlier upload when a new one begins.
let progressGeneration = 0;

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
  progressGeneration += 1;
  state = { visible: true, label, pct: 0 };
  emit();
}

export function setUploadProgressPct(pct: number) {
  const nextPct = Math.max(0, Math.min(100, Math.round(pct)));
  state = { ...state, visible: true, pct: nextPct };
  emit();
}

export function finishUploadProgress() {
  const generation = progressGeneration;
  state = { ...state, pct: 100 };
  emit();
  setTimeout(() => {
    if (generation !== progressGeneration) return;
    state = { visible: false, label: 'Uploading…', pct: 0 };
    emit();
  }, 500);
}

export function cancelUploadProgress() {
  progressGeneration += 1;
  state = { visible: false, label: 'Uploading…', pct: 0 };
  emit();
}

/**
 * Scoped progress prevents one concurrent upload from overwriting or hiding
 * another. The most recently started active upload owns the visible indicator;
 * when it finishes, an older active transfer becomes visible again.
 */
type ScopedTransfer = { label: string; pct: number };
const activeTransfers = new Map<number, ScopedTransfer>();
let nextTransferId = 0;
let scopedGeneration = 0;

function showActiveTransfer() {
  const latest = [...activeTransfers.values()].at(-1);
  if (latest) {
    state = { visible: true, label: latest.label, pct: latest.pct };
    emit();
  }
}

export function startScopedUpload(label: string): number {
  const id = ++nextTransferId;
  scopedGeneration += 1;
  activeTransfers.set(id, { label, pct: 0 });
  showActiveTransfer();
  return id;
}

export function updateScopedUpload(id: number, pct: number) {
  const transfer = activeTransfers.get(id);
  if (!transfer) return;
  transfer.pct = Math.max(0, Math.min(100, Math.round(pct)));
  if ([...activeTransfers.keys()].at(-1) === id) showActiveTransfer();
}

export function endScopedUpload(id: number, completed: boolean) {
  if (!activeTransfers.has(id)) return;
  const wasLatest = [...activeTransfers.keys()].at(-1) === id;
  activeTransfers.delete(id);
  const generation = ++scopedGeneration;
  if (activeTransfers.size) {
    if (wasLatest) showActiveTransfer();
    return;
  }
  if (completed) {
    state = { ...state, visible: true, pct: 100 };
    emit();
    setTimeout(() => {
      if (generation !== scopedGeneration || activeTransfers.size) return;
      state = { visible: false, label: 'Uploading…', pct: 0 };
      emit();
    }, 500);
  } else {
    state = { visible: false, label: 'Uploading…', pct: 0 };
    emit();
  }
}
