/**
 * Frame sizing shared by both renderers.
 *
 * The render canvas is also what MediaRecorder captures, so its size is the
 * recorded video's size. It is capped at 720p on the long edge: the media
 * pipeline's highest rung is 720p (api/tasks/media.py VIDEO_LADDER), so any
 * pixel above that is uploaded over mobile data only to be thrown away, and
 * every extra pixel is GPU work per frame on the phone.
 */

export const MAX_LONG_EDGE = 1280;

/** Intrinsic size of a <video>, <img> or <canvas>; 0x0 when not ready. */
export function sourceSize(source) {
  if (!source) return { width: 0, height: 0 };
  return {
    width: source.videoWidth || source.naturalWidth || source.width || 0,
    height: source.videoHeight || source.naturalHeight || source.height || 0,
  };
}

/**
 * `width` x `height` scaled down (never up) to fit `maxLong`, rounded to even
 * numbers -- H.264 encoders, Safari's MediaRecorder among them, reject odd
 * frame sizes.
 */
export function fitWithin(width, height, maxLong = MAX_LONG_EDGE) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = Math.max(w, h) > maxLong ? maxLong / Math.max(w, h) : 1;
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(w * scale), height: even(h * scale) };
}
