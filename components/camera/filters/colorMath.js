/**
 * The colour pipeline, twice: once as the uniforms the GPU shader reads
 * (uniformsFor), once as a plain-JS reference of the same maths
 * (renderReference).
 *
 * The reference is what lets the filters be tested at all. Unit tests render
 * a synthetic image through every filter and assert each one really differs
 * from the others; the browser test renders the same image through the real
 * WebGL shader and checks the GPU agrees with this file. The shader is
 * generated from the constants below, so the two cannot drift silently.
 */

import { NEUTRAL } from './registry.js';

export const PIPELINE = Object.freeze({
  LUMA: [0.299, 0.587, 0.114],
  // Per-channel gain for white balance. Temperature trades red against blue;
  // tint trades green against magenta.
  TEMPERATURE_GAIN: 0.25,
  TINT_GREEN_GAIN: 0.12,
  TINT_MAGENTA_GAIN: 0.05,
  // The classic sepia matrix, rows = output r, g, b.
  SEPIA: [
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131],
  ],
  // Colour distance at which a neighbour stops counting as "the same surface"
  // for skin smoothing. Below it pixels are averaged; across it (an eyelash,
  // the edge of a lip) they are left alone.
  EDGE: 0.2,
  // Glow blooms whatever the blur finds above this level.
  GLOW_THRESHOLD: 0.5,
  GLOW_GAIN: 1.4,
  GLOW_SOFTEN: 0.2,
  // The outer ring used by glow sits this many radii out.
  GLOW_RING: 2.5,
  // Vignette starts this far from centre (0 = centre, 1 = corner).
  VIGNETTE_START: 0.3,
  GRAIN_AMOUNT: 0.1,
  // Sampling radius, in source texels, for a frame whose short side is 360px;
  // scaled with resolution so the look does not change with the camera.
  RADIUS_AT_360: 1.5,
  MIN_RADIUS: 1.5,
});

// Unit ring: 4 axis taps and 4 diagonals.
const D = Math.SQRT1_2;
export const RING = Object.freeze([
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [D, D], [-D, -D], [D, -D], [-D, D],
]);

export function whiteBalance(temperature, tint) {
  const P = PIPELINE;
  return [
    1 + P.TEMPERATURE_GAIN * temperature + P.TINT_MAGENTA_GAIN * tint,
    1 - P.TINT_GREEN_GAIN * tint,
    1 - P.TEMPERATURE_GAIN * temperature + P.TINT_MAGENTA_GAIN * tint,
  ];
}

export function samplingRadius(width, height) {
  const short = Math.max(1, Math.min(width, height));
  return Math.max(PIPELINE.MIN_RADIUS, (short / 360) * PIPELINE.RADIUS_AT_360);
}

/** Shader uniform values for a filter's params. */
export function uniformsFor(params) {
  const p = { ...NEUTRAL, ...(params || {}) };
  return {
    u_exposure: Math.pow(2, p.exposure),
    u_balance: whiteBalance(p.temperature, p.tint),
    u_contrast: p.contrast,
    u_brightness: p.brightness,
    u_saturation: p.saturation,
    u_sepia: p.sepia,
    u_shadows: [...p.shadows],
    u_highlights: [...p.highlights],
    u_fade: p.fade,
    u_vignette: p.vignette,
    u_smooth: p.smooth,
    u_glow: p.glow,
    u_grain: p.grain,
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Every per-pixel step after the spatial ones. `d` is the pixel's distance
 * from the frame centre, 0 at the centre and 1 at a corner.
 */
export function gradePixel(rgb, u, d) {
  const P = PIPELINE;
  let c = [rgb[0] * u.u_exposure, rgb[1] * u.u_exposure, rgb[2] * u.u_exposure];
  c = [c[0] * u.u_balance[0], c[1] * u.u_balance[1], c[2] * u.u_balance[2]];
  c = c.map((v) => (v - 0.5) * u.u_contrast + 0.5 + u.u_brightness);

  const l = dot(c, P.LUMA);
  c = mix([l, l, l], c, u.u_saturation);

  const sep = P.SEPIA.map((row) => dot(c, row));
  c = mix(c, sep, u.u_sepia);

  const l2 = dot(c.map(clamp01), P.LUMA);
  const lo = (1 - l2) * (1 - l2);
  const hi = l2 * l2;
  c = c.map((v, i) => v + u.u_shadows[i] * lo + u.u_highlights[i] * hi);

  c = c.map((v) => u.u_fade + v * (1 - u.u_fade));
  const vig = 1 - u.u_vignette * smoothstep(P.VIGNETTE_START, 1, d);
  return c.map((v) => clamp01(v * vig));
}

/**
 * Reference render of `image` ({ width, height, data: Float32Array rgb 0..1 })
 * through `params`. Mirrors the shader exactly, including bilinear sampling
 * with clamp-to-edge; the one omission is grain, which is random by design.
 */
export function renderReference(image, params) {
  const P = PIPELINE;
  const u = uniformsFor(params);
  const { width: w, height: h, data } = image;
  const out = new Float32Array(w * h * 3);
  const radius = samplingRadius(w, h);

  const texel = (x, y) => {
    const xi = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
    const yi = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
    const i = (yi * w + xi) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  // Bilinear, like a LINEAR-filtered texture: the sample point is in texel
  // space where integer coordinates are texel centres.
  const sample = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const a = texel(x0, y0);
    const b = texel(x0 + 1, y0);
    const c = texel(x0, y0 + 1);
    const d = texel(x0 + 1, y0 + 1);
    return [0, 1, 2].map(
      (k) => (a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (c[k] * (1 - fx) + d[k] * fx) * fy
    );
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = texel(x, y);
      let v = base;

      if (u.u_smooth > 0 || u.u_glow > 0) {
        const near = RING.map(([ox, oy]) => sample(x + ox * radius, y + oy * radius));

        if (u.u_smooth > 0) {
          let acc = [...base];
          let wsum = 1;
          for (const s of near) {
            const wgt = 1 - smoothstep(0, P.EDGE, dist(s, base));
            acc = [acc[0] + s[0] * wgt, acc[1] + s[1] * wgt, acc[2] + s[2] * wgt];
            wsum += wgt;
          }
          v = mix(v, [acc[0] / wsum, acc[1] / wsum, acc[2] / wsum], u.u_smooth);
        }

        if (u.u_glow > 0) {
          const far = RING.map(([ox, oy]) =>
            sample(x + ox * radius * P.GLOW_RING, y + oy * radius * P.GLOW_RING)
          );
          const sum = [...near, ...far].reduce(
            (s, t) => [s[0] + t[0], s[1] + t[1], s[2] + t[2]],
            [...base]
          );
          const blur = sum.map((s) => s / 17);
          const halo = blur.map((b) =>
            clamp01((Math.max(b - P.GLOW_THRESHOLD, 0) / (1 - P.GLOW_THRESHOLD)) * u.u_glow * P.GLOW_GAIN)
          );
          v = mix(v, blur, u.u_glow * P.GLOW_SOFTEN);
          v = v.map((c, i) => 1 - (1 - c) * (1 - halo[i]));
        }
      }

      // Distance from centre in normalised coordinates, as the shader sees it.
      const ux = (x + 0.5) / w - 0.5;
      const uy = (y + 0.5) / h - 0.5;
      const d = Math.hypot(ux, uy) * Math.SQRT2;
      const g = gradePixel(v, u, d);
      const o = (y * w + x) * 3;
      out[o] = g[0];
      out[o + 1] = g[1];
      out[o + 2] = g[2];
    }
  }
  return { width: w, height: h, data: out };
}

/** Mean absolute per-channel difference between two images, 0..1. */
export function meanAbsDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i] - b.data[i]);
  return s / a.data.length;
}
