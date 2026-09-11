/**
 * Fallback renderer for devices without usable WebGL: a 2D canvas using the
 * browser's own `ctx.filter`, which takes CSS filter syntax.
 *
 * It can only draw the looks that CSS filters can express, so `supports()`
 * answers honestly and the tray hides the rest; and on browsers without
 * `ctx.filter` at all it supports Normal only. Either way the camera and the
 * recording keep working -- this path exists so a missing GPU feature costs
 * the user filters, never the ability to record.
 */

import { fitWithin, sourceSize } from './frame.js';
import { getFilter, isNeutralFilter } from './registry.js';

export class Canvas2DFilterRenderer {
  static create(canvas, hooks = {}) {
    let ctx = null;
    try {
      ctx = canvas.getContext('2d', { alpha: false });
    } catch (_) {
      ctx = null;
    }
    return ctx ? new Canvas2DFilterRenderer(canvas, ctx, hooks) : null;
  }

  constructor(canvas, ctx, hooks) {
    this.kind = 'canvas2d';
    this.canvas = canvas;
    this.ctx = ctx;
    this.hooks = hooks;
    // Browsers without support leave `filter` undefined on the context.
    this.cssFilters = typeof ctx.filter === 'string';
    this.fixedSize = null;
    this.source = null;
    this.overlaySource = null;
    this.setFilter(getFilter('none'));
  }

  supports(filter) {
    return isNeutralFilter(filter) || (this.cssFilters && typeof filter.css === 'string');
  }

  setFilter(filter) {
    this.filter = filter;
    this.css = this.supports(filter) && filter && filter.css ? filter.css : 'none';
  }

  setFixedSize(width, height) {
    this.fixedSize = width && height ? { width, height } : null;
  }

  setOverlay(source) {
    this.overlaySource = source || null;
  }

  uploadFrame(source) {
    const src = sourceSize(source);
    if (!src.width || !src.height) return false;
    const target = this.fixedSize || fitWithin(src.width, src.height);
    if (this.canvas.width !== target.width || this.canvas.height !== target.height) {
      this.canvas.width = target.width;
      this.canvas.height = target.height;
      if (this.hooks.onResize) this.hooks.onResize(target.width, target.height);
    }
    this.source = source;
    return true;
  }

  draw() {
    if (!this.source) return;
    const { ctx, canvas } = this;
    if (this.cssFilters) ctx.filter = this.css;
    try {
      ctx.drawImage(this.source, 0, 0, canvas.width, canvas.height);
    } finally {
      if (this.cssFilters) ctx.filter = 'none';
    }
    if (this.overlaySource) ctx.drawImage(this.overlaySource, 0, 0, canvas.width, canvas.height);
  }

  render(source) {
    if (!this.uploadFrame(source)) return false;
    try {
      this.draw();
    } catch (_) {
      return false;
    }
    return true;
  }

  destroy() {
    this.source = null;
    this.overlaySource = null;
  }
}
