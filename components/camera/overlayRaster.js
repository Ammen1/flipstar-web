/**
 * Text stickers, drawn once into their own canvas.
 *
 * The renderer composites this canvas over every frame, so the stickers end
 * up in the recording exactly where the preview shows them. It is redrawn only
 * when the stickers or the frame size change -- not per frame.
 *
 * The drawing matches what the camera baked in before: bold system font on a
 * dark rounded pill with a soft shadow, sized relative to a 360px-wide frame.
 */

export function drawTextOverlays(ctx, overlays, width, height) {
  ctx.clearRect(0, 0, width, height);
  (overlays || []).forEach((ov) => {
    const px = (ov.x / 100) * width;
    const py = (ov.y / 100) * height;
    const fs = (ov.fontSize || 22) * (width / 360);
    ctx.save();
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(ov.text).width;
    const pad = fs * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px - tw / 2 - pad, py - fs / 2 - pad * 0.5, tw + pad * 2, fs + pad, fs * 0.3);
    else ctx.rect(px - tw / 2 - pad, py - fs / 2 - pad * 0.5, tw + pad * 2, fs + pad);
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = ov.color;
    ctx.fillText(ov.text, px, py);
    ctx.restore();
  });
}

/**
 * `canvas` (created on first use) holding `overlays` at `width` x `height`,
 * or null when there is nothing to draw -- the renderer then skips the
 * overlay entirely.
 */
export function rasterizeOverlays(overlays, width, height, canvas = null) {
  if (!overlays || !overlays.length || !width || !height) return null;
  const target = canvas || document.createElement('canvas');
  if (target.width !== width) target.width = width;
  if (target.height !== height) target.height = height;
  const ctx = target.getContext('2d');
  drawTextOverlays(ctx, overlays, width, height);
  return target;
}
