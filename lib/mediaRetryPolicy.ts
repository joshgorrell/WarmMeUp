/** Pure upload retry policy shared by native streaming, XHR and thumbnails. */
export const RETRYABLE_UPLOAD_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Do not retry missing local files, authorization errors, or canceled transfers. */
export function shouldRetryUploadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (/stopped responding|permission|unauthorized|forbidden|not found|no such file|could not read|interrupted|cancelled|canceled/.test(message)) {
    return false;
  }
  return /network|timeout|timed out|connection|offline|failed to fetch|request failed|socket|transport/.test(message);
}
