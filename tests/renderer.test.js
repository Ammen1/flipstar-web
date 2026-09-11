import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { availableFilters, createFilterRenderer } from '../components/camera/filters/createRenderer.js';
import { Canvas2DFilterRenderer } from '../components/camera/filters/canvasRenderer.js';
import { MAX_LONG_EDGE, fitWithin, sourceSize } from '../components/camera/filters/frame.js';
import { VIDEO_FILTERS, getFilter } from '../components/camera/filters/registry.js';
import { FilterThumbnailer } from '../components/camera/filters/thumbnails.js';
import { friendlyUploadError } from '../utils/uploadErrors.js';

/** A canvas whose 2D context records what was drawn with which filter. */
function fakeCanvas({ webgl = false, cssFilters = true } = {}) {
  const draws = [];
  const ctx = {
    drawImage: (src, x, y, w, h) => draws.push({ src, w, h, filter: ctx.filter }),
  };
  if (cssFilters) ctx.filter = 'none';
  let mode = null;
  return {
    width: 300,
    height: 150,
    draws,
    ctx,
    listeners: {},
    addEventListener() {},
    removeEventListener() {},
    getContext(type) {
      if (type === '2d') {
        if (mode && mode !== '2d') return null;
        mode = '2d';
        return ctx;
      }
      if (webgl) mode = 'webgl';
      return null;
    },
    toDataURL: () => `data:image/jpeg;base64,${draws.length}`,
  };
}

const video = (w = 480, h = 640) => ({ videoWidth: w, videoHeight: h });

describe('frame size', () => {
  it('keeps a phone camera frame as it is', () => {
    assert.deepEqual(fitWithin(480, 640), { width: 480, height: 640 });
  });

  it('caps at 720p on the long edge, keeping the aspect', () => {
    assert.deepEqual(fitWithin(1080, 1920), { width: 720, height: MAX_LONG_EDGE });
    assert.deepEqual(fitWithin(1920, 1080), { width: MAX_LONG_EDGE, height: 720 });
  });

  it('rounds to even sizes for the encoder', () => {
    const { width, height } = fitWithin(481, 641);
    assert.equal(width % 2, 0);
    assert.equal(height % 2, 0);
  });

  it('reads the size of videos, images and canvases', () => {
    assert.deepEqual(sourceSize(video()), { width: 480, height: 640 });
    assert.deepEqual(sourceSize({ naturalWidth: 10, naturalHeight: 20 }), { width: 10, height: 20 });
    assert.deepEqual(sourceSize(null), { width: 0, height: 0 });
  });
});

describe('renderer selection', () => {
  it('falls back to a 2D canvas when WebGL is unavailable', () => {
    const canvas = fakeCanvas();
    const r = createFilterRenderer(canvas, { webglAvailable: () => false });
    assert.equal(r.kind, 'canvas2d');
  });

  it('fails loudly when the canvas offers no context at all', () => {
    const canvas = fakeCanvas();
    canvas.getContext = () => null;
    assert.throws(() => createFilterRenderer(canvas, { webglAvailable: () => false }));
  });
});

describe('2D fallback renderer', () => {
  it('draws the camera frame through the filter, then the overlay unfiltered', () => {
    const canvas = fakeCanvas();
    const r = Canvas2DFilterRenderer.create(canvas);
    const overlay = { width: 480, height: 640 };
    r.setFilter(getFilter('bw'));
    r.setOverlay(overlay);
    assert.equal(r.render(video()), true);
    assert.equal(canvas.width, 480);
    assert.equal(canvas.height, 640);
    assert.equal(canvas.draws[0].filter, getFilter('bw').css);
    assert.equal(canvas.draws[1].src, overlay);
    assert.equal(canvas.draws[1].filter, 'none');
  });

  it('only resizes the canvas when the frame size changes', () => {
    const canvas = fakeCanvas();
    let resizes = 0;
    const r = Canvas2DFilterRenderer.create(canvas, { onResize: () => resizes++ });
    r.render(video());
    r.render(video());
    r.render(video(640, 480));
    assert.equal(resizes, 2);
  });

  it('draws nothing before the camera has a frame', () => {
    const canvas = fakeCanvas();
    const r = Canvas2DFilterRenderer.create(canvas);
    assert.equal(r.render(video(0, 0)), false);
    assert.equal(canvas.draws.length, 0);
  });

  it('offers only looks CSS filters can express', () => {
    const r = Canvas2DFilterRenderer.create(fakeCanvas());
    const ids = availableFilters(r, VIDEO_FILTERS).map((f) => f.id);
    assert.ok(ids.includes('warm'));
    assert.ok(!ids.includes('smooth'));
    assert.ok(!ids.includes('glow'));
  });

  it('offers Normal only where ctx.filter does not exist', () => {
    const canvas = fakeCanvas({ cssFilters: false });
    const r = Canvas2DFilterRenderer.create(canvas);
    assert.deepEqual(availableFilters(r, VIDEO_FILTERS).map((f) => f.id), ['none']);
    r.setFilter(getFilter('warm'));
    r.render(video());
    assert.equal(canvas.draws[0].filter, undefined, 'never assigned');
  });
});

describe('filter thumbnails', () => {
  it('renders one small thumbnail per drawable filter', () => {
    const canvas = fakeCanvas();
    const thumbs = new FilterThumbnailer({
      createCanvas: () => canvas,
      create: (c) => Canvas2DFilterRenderer.create(c),
    });
    const out = thumbs.render(video(), VIDEO_FILTERS);
    const expected = VIDEO_FILTERS.filter((f) => f.css !== null).map((f) => f.id);
    assert.deepEqual(Object.keys(out), expected);
    assert.equal(Math.max(canvas.width, canvas.height), 96);
    assert.ok(out.warm.startsWith('data:image/jpeg'));
  });

  it('returns nothing until the camera has a frame', () => {
    const thumbs = new FilterThumbnailer({
      createCanvas: () => fakeCanvas(),
      create: (c) => Canvas2DFilterRenderer.create(c),
    });
    assert.deepEqual(thumbs.render(video(0, 0), VIDEO_FILTERS), {});
  });
});

describe('upload error wording', () => {
  it('turns transport failures into plain words and keeps the video', () => {
    assert.match(friendlyUploadError({ error: 'Network error' }), /No internet connection.*still here/);
    assert.match(friendlyUploadError(new TypeError('Failed to fetch')), /No internet connection/);
    assert.match(friendlyUploadError({ error: 'Upload timed out' }), /took too long/);
    assert.match(friendlyUploadError({ error: 'HTTP 413' }), /too large/);
    assert.match(friendlyUploadError({ error: 'HTTP 502' }), /server/);
  });

  it('passes the API\'s own message through', () => {
    assert.equal(friendlyUploadError({ error: 'Caption is too long.' }), 'Caption is too long.');
  });

  it('never shows a raw exception', () => {
    const msg = friendlyUploadError(new Error("Cannot read properties of undefined (reading 'id')"));
    assert.doesNotMatch(msg, /undefined|properties/);
  });
});
