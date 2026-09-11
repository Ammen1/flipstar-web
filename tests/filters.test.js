import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_FILTER_ID,
  FILTER_CATEGORIES,
  NEUTRAL,
  PARAM_RANGES,
  VIDEO_FILTERS,
  filtersInCategory,
  getFilter,
  resolveFilterId,
} from '../components/camera/filters/registry.js';
import {
  meanAbsDiff,
  renderReference,
  uniformsFor,
  whiteBalance,
} from '../components/camera/filters/colorMath.js';
import { FRAGMENT_SHADER, UNIFORM_NAMES } from '../components/camera/filters/shader.js';
import { filterReducer, initialFilterState } from '../components/camera/filters/selection.js';
import { makeTestImage } from './helpers/testImage.js';

const REQUIRED = {
  basic: ['Normal', 'Bright', 'Warm', 'Cool', 'Vivid', 'Soft'],
  portrait: ['Smooth', 'Portrait', 'Glow', 'Natural'],
  mood: ['Vintage', 'Cinema', 'Dream', 'Black & White', 'Sepia'],
  color: ['High Contrast', 'Low Contrast', 'Saturated', 'Desaturated'],
};

describe('filter registry', () => {
  it('offers every required filter, in its category', () => {
    for (const [category, names] of Object.entries(REQUIRED)) {
      assert.deepEqual(
        filtersInCategory(category).map((f) => f.name),
        names,
        `category ${category}`
      );
    }
  });

  it('starts on Normal, the first Basic filter', () => {
    assert.equal(DEFAULT_FILTER_ID, 'none');
    assert.equal(getFilter(DEFAULT_FILTER_ID).name, 'Normal');
    assert.equal(filtersInCategory('basic')[0].id, DEFAULT_FILTER_ID);
  });

  it('has unique ids and names and only known categories', () => {
    const ids = VIDEO_FILTERS.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(VIDEO_FILTERS.map((f) => f.name)).size, ids.length);
    const categories = new Set(FILTER_CATEGORIES.map((c) => c.id));
    VIDEO_FILTERS.forEach((f) => assert.ok(categories.has(f.category), f.id));
  });

  it('keeps every param a known name within its range', () => {
    for (const f of VIDEO_FILTERS) {
      assert.deepEqual(Object.keys(f.params).sort(), Object.keys(NEUTRAL).sort(), f.id);
      for (const [key, [lo, hi]] of Object.entries(PARAM_RANGES)) {
        const v = f.params[key];
        assert.ok(v >= lo && v <= hi, `${f.id}.${key}=${v} outside ${lo}..${hi}`);
      }
      for (const key of ['shadows', 'highlights']) {
        assert.equal(f.params[key].length, 3);
        f.params[key].forEach((v) => assert.ok(Math.abs(v) <= 0.2, `${f.id}.${key}`));
      }
    }
  });

  it('only omits a CSS fallback for looks that need neighbouring pixels', () => {
    for (const f of VIDEO_FILTERS) {
      if (f.css === null) assert.ok(f.params.smooth > 0 || f.params.glow > 0, f.id);
      else assert.equal(typeof f.css, 'string', f.id);
    }
  });

  it('maps ids from older drafts, and anything unknown to Normal', () => {
    assert.equal(resolveFilterId('grayscale'), 'bw');
    assert.equal(resolveFilterId('vibrant'), 'vivid');
    assert.equal(resolveFilterId('warm'), 'warm');
    assert.equal(resolveFilterId('sepia'), 'sepia');
    assert.equal(resolveFilterId('no-such-filter'), 'none');
    assert.equal(resolveFilterId(undefined), 'none');
    assert.equal(getFilter('drama').id, 'high-contrast');
  });
});

describe('filters look different', () => {
  const image = makeTestImage();
  const rendered = new Map(VIDEO_FILTERS.map((f) => [f.id, renderReference(image, f.params)]));

  it('Normal leaves the picture untouched', () => {
    assert.ok(meanAbsDiff(rendered.get('none'), image) < 1e-6);
  });

  // "Meaningful" as a number: an average shift of at least 2% of the range
  // across the whole frame. Two filters that only differ by name, or by a
  // tweak nobody could see, fail here.
  const MIN_DIFFERENCE = 0.02;

  it('every filter visibly changes the picture', () => {
    for (const f of VIDEO_FILTERS) {
      if (f.id === 'none') continue;
      const d = meanAbsDiff(rendered.get(f.id), image);
      assert.ok(d >= MIN_DIFFERENCE, `${f.name} changes the frame by only ${d.toFixed(4)}`);
    }
  });

  it('no two filters look alike', () => {
    for (let i = 0; i < VIDEO_FILTERS.length; i++) {
      for (let j = i + 1; j < VIDEO_FILTERS.length; j++) {
        const a = VIDEO_FILTERS[i];
        const b = VIDEO_FILTERS[j];
        const d = meanAbsDiff(rendered.get(a.id), rendered.get(b.id));
        assert.ok(d >= MIN_DIFFERENCE, `${a.name} and ${b.name} differ by only ${d.toFixed(4)}`);
      }
    }
  });
});

describe('colour pipeline', () => {
  const pixelAt = (img, x, y) => {
    const i = (y * img.width + x) * 3;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  const image = makeTestImage();

  it('Black & White removes colour', () => {
    const out = renderReference(image, getFilter('bw').params);
    for (let p = 0; p < out.width * out.height; p++) {
      const [r, g, b] = [out.data[p * 3], out.data[p * 3 + 1], out.data[p * 3 + 2]];
      assert.ok(Math.abs(r - g) < 1e-6 && Math.abs(g - b) < 1e-6);
    }
  });

  it('Warm pushes red over blue and Cool the reverse', () => {
    const grey = { width: 1, height: 1, data: new Float32Array([0.5, 0.5, 0.5]) };
    const [wr, , wb] = renderReference(grey, getFilter('warm').params).data;
    const [cr, , cb] = renderReference(grey, getFilter('cool').params).data;
    assert.ok(wr > wb + 0.1, 'warm');
    assert.ok(cb > cr + 0.1, 'cool');
    assert.deepEqual(whiteBalance(0, 0), [1, 1, 1]);
  });

  it('Smooth evens out skin noise but keeps hard edges', () => {
    const out = renderReference(image, getFilter('smooth').params);
    const spread = (img) => {
      const values = [];
      for (let y = 30; y < 40; y++) for (let x = 4; x < 16; x++) values.push(pixelAt(img, x, y)[0]);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    };
    assert.ok(spread(out) < spread(image) * 0.7, 'skin noise reduced');
    // Stripe edge between x=3 (light) and x=4 (dark) survives.
    assert.ok(pixelAt(out, 1, 48)[0] - pixelAt(out, 5, 48)[0] > 0.6, 'edge kept');
  });

  it('Glow brightens the area around highlights', () => {
    const out = renderReference(image, getFilter('glow').params);
    // Just left of the white block, inside a dark stripe.
    assert.ok(pixelAt(out, 29, 48)[0] > pixelAt(image, 29, 48)[0] + 0.05);
  });

  it('Vignette darkens the corners, not the centre', () => {
    const flat = { width: 21, height: 21, data: new Float32Array(21 * 21 * 3).fill(0.6) };
    const out = renderReference(flat, { vignette: 0.8 });
    assert.ok(pixelAt(out, 0, 0)[0] < 0.45);
    assert.ok(Math.abs(pixelAt(out, 10, 10)[0] - 0.6) < 1e-6);
  });

  it('Fade lifts the blacks', () => {
    const black = { width: 1, height: 1, data: new Float32Array([0, 0, 0]) };
    assert.ok(renderReference(black, { fade: 0.2 }).data[0] >= 0.2 - 1e-6);
  });
});

describe('shader', () => {
  it('declares exactly the uniforms the renderer sets', () => {
    const fromFilter = Object.keys(uniformsFor(NEUTRAL));
    const renderer = ['u_frame', 'u_overlay', 'u_noise', 'u_hasOverlay', 'u_texel', 'u_radius', 'u_noiseScale', 'u_noiseOffset'];
    assert.deepEqual([...UNIFORM_NAMES].sort(), [...fromFilter, ...renderer].sort());
  });

  it('is plain GLSL ES 1.00 with float literals throughout', () => {
    assert.ok(!/#version/.test(FRAGMENT_SHADER));
    // An integer literal where GLSL ES 1.00 wants a float fails to compile on
    // strict mobile drivers: catch `x * 2)` style slips.
    const bare = FRAGMENT_SHADER.match(/[*/+-]\s*\d+\s*[;),]/g) || [];
    assert.deepEqual(bare, []);
  });

  it('turns exposure stops into a multiplier', () => {
    assert.equal(uniformsFor({ exposure: 1 }).u_exposure, 2);
    assert.equal(uniformsFor({}).u_exposure, 1);
  });
});

describe('filter selection', () => {
  it('starts on Normal with every filter allowed', () => {
    assert.equal(initialFilterState.filterId, 'none');
    assert.equal(initialFilterState.available, null);
  });

  it('selects and changes filters', () => {
    let s = filterReducer(initialFilterState, { type: 'select', id: 'warm' });
    assert.equal(s.filterId, 'warm');
    s = filterReducer(s, { type: 'select', id: 'bw' });
    assert.equal(s.filterId, 'bw');
    assert.equal(filterReducer(s, { type: 'select', id: 'bw' }), s, 'no-op keeps identity');
    assert.equal(filterReducer(s, { type: 'reset' }).filterId, 'none');
  });

  it('refuses filters the device cannot render', () => {
    let s = filterReducer(initialFilterState, { type: 'available', ids: ['none', 'warm'] });
    s = filterReducer(s, { type: 'select', id: 'glow' });
    assert.equal(s.filterId, 'none');
  });

  it('drops an undrawable selection back to Normal when the renderer is limited', () => {
    let s = filterReducer(initialFilterState, { type: 'select', id: 'smooth' });
    s = filterReducer(s, { type: 'available', ids: ['none', 'warm'] });
    assert.equal(s.filterId, 'none');
  });

  it('steps through the visible list without wrapping', () => {
    const ids = ['none', 'bright', 'warm'];
    let s = filterReducer(initialFilterState, { type: 'step', delta: 1, ids });
    assert.equal(s.filterId, 'bright');
    s = filterReducer(s, { type: 'step', delta: 5, ids });
    assert.equal(s.filterId, 'warm');
    s = filterReducer(s, { type: 'step', delta: -9, ids });
    assert.equal(s.filterId, 'none');
  });
});
