/**
 * A tiny square thumbnail of what is being posted, for the upload indicator.
 *
 * Made in the browser from the local preview while the upload runs -- the
 * server's thumbnail only exists once processing is done, and the indicator
 * is shown before that. A 96px JPEG data URL, a few kilobytes, so it can sit
 * in localStorage with the upload and survive a reload. Best effort: any
 * problem (a cross-origin draft, a codec the browser cannot decode, a slow
 * first frame) gives null and the indicator shows an icon instead.
 */
const SIZE = 96;
const TIMEOUT_MS = 2500;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function loadVideoFrame(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // The first decoded frame. No seek: a MediaRecorder WebM reports an
    // infinite duration, and seeking one can stall.
    video.onloadeddata = () => resolve(video);
    video.onerror = reject;
    video.src = src;
  });
}

export async function uploadThumbnail(src, isVideo) {
  if (!src || typeof document === 'undefined') return null;
  try {
    const source = await withTimeout(isVideo ? loadVideoFrame(src) : loadImage(src), TIMEOUT_MS);
    if (!source) return null;
    const width = source.videoWidth || source.naturalWidth;
    const height = source.videoHeight || source.naturalHeight;
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const scale = Math.max(SIZE / width, SIZE / height);
    canvas.getContext('2d').drawImage(
      source,
      (SIZE - width * scale) / 2,
      (SIZE - height * scale) / 2,
      width * scale,
      height * scale
    );
    const url = canvas.toDataURL('image/jpeg', 0.7);
    if (isVideo) source.removeAttribute('src');
    return url.startsWith('data:image/') ? url : null;
  } catch {
    return null;
  }
}
