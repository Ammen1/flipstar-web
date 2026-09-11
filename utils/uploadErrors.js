/**
 * Upload failures in words a person can act on.
 *
 * api.createPost rejects with `{ error: 'Network error' | 'Upload timed out' |
 * 'HTTP 413' | <message from the API> }`; code around it can also throw plain
 * browser errors ("Failed to fetch", "Load failed"). The API's own messages
 * are written for users and pass through; transport failures and raw
 * exceptions are replaced, and every message reminds the person their video
 * is still here -- the page keeps it for a retry.
 */

const KEPT = 'Your video is still here, so you can try again.';

export function friendlyUploadError(err) {
  const apiMessage = err && typeof err.error === 'string' ? err.error.trim() : '';
  const raw = apiMessage || (err && typeof err.message === 'string' ? err.message : '');

  if (/network error|failed to fetch|load failed|networkerror|internet/i.test(raw)) {
    return `No internet connection. Check your connection and try again. ${KEPT}`;
  }
  if (/timed out|timeout/i.test(raw)) {
    return `The upload took too long, which usually means a slow connection. ${KEPT}`;
  }
  if (/aborted/i.test(raw)) {
    return `The upload was interrupted. ${KEPT}`;
  }
  const status = /^HTTP (\d{3})$/.exec(raw);
  if (status) {
    const code = Number(status[1]);
    if (code === 413) return 'This video is too large to upload. Try a shorter video.';
    if (code >= 500) return `Our server couldn't finish the upload. Please try again in a moment. ${KEPT}`;
    return `The upload was rejected. Please try again. ${KEPT}`;
  }
  // A message from our API is meant to be read; a bare exception is not.
  if (apiMessage) return apiMessage;
  return `Upload failed. Please try again. ${KEPT}`;
}
