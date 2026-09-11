/**
 * Picks the best renderer the device offers: WebGL, then a 2D canvas.
 *
 * Callers get one interface either way and ask `renderer.supports(filter)`
 * rather than checking `kind`, so the tray, the recorder and the thumbnails
 * all agree on which filters exist on this device.
 */

import { Canvas2DFilterRenderer } from './canvasRenderer.js';
import { WebGLFilterRenderer, probeWebGL } from './webglRenderer.js';

export function createFilterRenderer(canvas, { hooks = {}, webglAvailable = probeWebGL } = {}) {
  if (webglAvailable()) {
    const gpu = WebGLFilterRenderer.create(canvas, hooks);
    if (gpu) return gpu;
  }
  const flat = Canvas2DFilterRenderer.create(canvas, hooks);
  if (flat) return flat;
  throw new Error('This canvas offers neither a WebGL nor a 2D context.');
}

/** The filters `renderer` can draw faithfully, in registry order. */
export function availableFilters(renderer, filters) {
  return renderer ? filters.filter((f) => renderer.supports(f)) : filters;
}
