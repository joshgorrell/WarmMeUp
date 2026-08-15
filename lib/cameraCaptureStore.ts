export type CameraCaptureResult = {
  uri: string;
  mediaType: 'photo' | 'video';
  mimeType: string;
};

let pendingCapture: CameraCaptureResult | null = null;

export function setCameraCaptureResult(result: CameraCaptureResult) {
  pendingCapture = result;
}

export function consumeCameraCaptureResult(): CameraCaptureResult | null {
  const result = pendingCapture;
  pendingCapture = null;
  return result;
}

export function clearCameraCaptureResult() {
  pendingCapture = null;
}
