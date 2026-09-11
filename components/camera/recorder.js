/**
 * MediaRecorder choices: container, bitrate, and what the device can record.
 *
 * Bitrate is set explicitly because the defaults vary by browser: Chrome
 * encodes at 2.5 Mbps whatever the frame size, Safari at considerably more.
 * The server re-encodes every upload to a 360/480/720p ladder
 * (api/tasks/media.py), so bits above what that ladder keeps are uploaded over
 * mobile data for nothing. The rate scales with the frame and is capped at
 * Chrome's old default, so no recording gets bigger than it used to be.
 */

export const MIME_CANDIDATES = Object.freeze([
  // mp4 first: its duration metadata is written properly, where WebM from
  // MediaRecorder reports Infinity until seeked.
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]);

const Recorder = () => (typeof MediaRecorder !== 'undefined' ? MediaRecorder : null);

/** The first container the browser can record, or '' to let it choose. */
export function pickMimeType(MR = Recorder()) {
  if (!MR || typeof MR.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATES.find((m) => {
    try {
      return MR.isTypeSupported(m);
    } catch (_) {
      return false;
    }
  }) || '';
}

export const MAX_VIDEO_BPS = 2500000;
export const MIN_VIDEO_BPS = 1000000;
// Bits per pixel per frame. ~0.15 keeps a phone-camera 480p image clean in
// VP8/H.264 at 30fps; the result is clamped either side.
const BITS_PER_PIXEL = 0.15;

export function videoBitrateFor(width, height, fps = 30) {
  const bps = Math.round(Math.max(1, width) * Math.max(1, height) * fps * BITS_PER_PIXEL);
  return Math.min(MAX_VIDEO_BPS, Math.max(MIN_VIDEO_BPS, bps));
}

export function recorderOptions({ mimeType = '', width, height } = {}) {
  const options = {
    videoBitsPerSecond: videoBitrateFor(width, height),
    audioBitsPerSecond: 128000,
  };
  if (mimeType) options.mimeType = mimeType;
  return options;
}

export function extensionFor(mimeType) {
  return String(mimeType || '').includes('mp4') ? 'mp4' : 'webm';
}

/**
 * What this browser can do:
 *   canRecord          MediaRecorder exists at all
 *   canRecordFiltered  it can also record the filtered canvas -- without
 *                      canvas.captureStream the only thing to record is the
 *                      raw camera, and a filter shown in the preview would be
 *                      missing from the video
 */
export function recordingSupport(canvas, MR = Recorder()) {
  const canRecord = typeof MR === 'function';
  const canRecordFiltered = canRecord && !!canvas && typeof canvas.captureStream === 'function';
  return { canRecord, canRecordFiltered };
}
