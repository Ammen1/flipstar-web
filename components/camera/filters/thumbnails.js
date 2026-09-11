/**
 * Filter thumbnails made from the live camera, not stock artwork.
 *
 * A small renderer of its own draws the current camera frame once per
 * filter and keeps each result as a data URL. It is refreshed every couple of
 * seconds while the tray is open and not at all otherwise, so the cost is a
 * handful of 96px renders per refresh rather than anything per frame.
 */

import { createFilterRenderer } from './createRenderer.js';
import { fitWithin, sourceSize } from './frame.js';

const THUMB_LONG_EDGE = 96;

export class FilterThumbnailer {
  constructor({ createCanvas = () => document.createElement('canvas'), create = createFilterRenderer } = {}) {
    this.canvas = createCanvas();
    this.renderer = create(this.canvas);
  }

  /** `{ [filterId]: dataUrl }` for the filters this renderer supports. */
  render(source, filters) {
    const src = sourceSize(source);
    if (!src.width || !src.height || !this.renderer) return {};
    const size = fitWithin(src.width, src.height, THUMB_LONG_EDGE);
    this.renderer.setFixedSize(size.width, size.height);
    const out = {};
    // Upload once, draw once per filter: only the uniforms change between
    // thumbnails. The 2D fallback redraws the frame itself on each draw().
    if (!this.renderer.uploadFrame(source)) return out;
    filters.forEach((filter) => {
      if (!this.renderer.supports(filter)) return;
      this.renderer.setFilter(filter);
      try {
        this.renderer.draw();
        // Read back in the same task as the draw: with
        // preserveDrawingBuffer off, the pixels are gone once composited.
        out[filter.id] = this.canvas.toDataURL('image/jpeg', 0.72);
      } catch (_) {
        // A tainted or lost canvas: that thumbnail falls back to its swatch.
      }
    });
    return out;
  }

  destroy() {
    if (this.renderer) this.renderer.destroy();
    this.renderer = null;
  }
}
