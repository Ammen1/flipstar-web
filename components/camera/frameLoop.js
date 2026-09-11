/**
 * Drives the filter render once per camera frame.
 *
 * requestAnimationFrame runs at the display rate -- 60 or 120Hz -- while a
 * phone camera delivers 30fps, so a rAF loop does the upload and the filter
 * pass two to four times per real frame. requestVideoFrameCallback fires once
 * per new camera frame, which is exactly the work needed.
 *
 * rVFC is not everywhere (older Safari and WebViews), and engines may not
 * fire it at all for a video that is not visibly painted -- ours is a hidden
 * source for the canvas; measured in headless Chrome it sometimes fires at
 * the camera rate and sometimes never. So a rAF loop always runs as a
 * watchdog: while rVFC is firing it does nothing, and once rVFC has gone
 * quiet for `stallMs` it renders instead -- capped at `fallbackFps`, about a
 * camera's rate, rather than every display refresh.
 */

export function startFrameLoop(video, onFrame, env = {}) {
  const raf = env.requestAnimationFrame || ((cb) => requestAnimationFrame(cb));
  const caf = env.cancelAnimationFrame || ((id) => cancelAnimationFrame(id));
  const now = env.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const stallMs = env.stallMs == null ? 150 : env.stallMs;
  // A hair under 1000/32 so a 60Hz display lands every other tick (30fps).
  const minGapMs = 1000 / (env.fallbackFps || 32) - 1;

  let stopped = false;
  let rafId = null;
  let vfcId = null;
  let lastVideoFrame = -Infinity;
  let lastFallbackDraw = -Infinity;
  const hasVfc = typeof video.requestVideoFrameCallback === 'function';

  const drawIfReady = () => {
    // HAVE_CURRENT_DATA: there is a frame to upload.
    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) onFrame();
  };

  const onVideoFrame = () => {
    if (stopped) return;
    lastVideoFrame = now();
    drawIfReady();
    vfcId = video.requestVideoFrameCallback(onVideoFrame);
  };

  const onAnimationFrame = () => {
    if (stopped) return;
    const t = now();
    const vfcQuiet = !hasVfc || t - lastVideoFrame > stallMs;
    if (vfcQuiet && t - lastFallbackDraw >= minGapMs) {
      lastFallbackDraw = t;
      drawIfReady();
    }
    rafId = raf(onAnimationFrame);
  };

  if (hasVfc) vfcId = video.requestVideoFrameCallback(onVideoFrame);
  rafId = raf(onAnimationFrame);

  return function stop() {
    stopped = true;
    if (rafId != null) caf(rafId);
    if (vfcId != null && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(vfcId);
    }
  };
}
