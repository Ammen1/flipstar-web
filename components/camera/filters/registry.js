/**
 * Camera filters -- the one list every part of the camera reads.
 *
 * A filter is data, not code: a handful of colour and texture adjustments that
 * the renderer turns into shader uniforms (see shader.js). Adding a look means
 * adding an entry here; the recording component never needs to know what
 * "Warm" does, and nothing outside this file names a filter.
 *
 * `params` only lists what a filter changes -- everything else stays at
 * NEUTRAL. Every filter is checked against every other by the unit tests, so
 * two entries that render the same picture under different names fail CI.
 *
 * `css` is the approximation used when WebGL is unavailable and the preview
 * falls back to a 2D canvas with `ctx.filter`. It is `null` when the look
 * depends on neighbouring pixels (skin smoothing, glow), which CSS filters
 * cannot express cheaply; the fallback then hides that filter instead of
 * offering one that does not look like its name.
 *
 * `kind` is 'filter' for everything here. It is the extension point for the
 * effects that are not colour grades -- face, background, AR, stickers,
 * transitions: those need their own pipeline stage, and the renderer will
 * dispatch on `kind` rather than every caller growing special cases.
 */

/** Every adjustment at the value that leaves the picture untouched. */
export const NEUTRAL = Object.freeze({
  exposure: 0, // stops; the frame is multiplied by 2^exposure
  brightness: 0, // added after contrast, -1..1
  contrast: 1, // around mid-grey
  saturation: 1, // 0 = greyscale
  temperature: 0, // -1 cool .. +1 warm
  tint: 0, // -1 green .. +1 magenta
  sepia: 0, // 0..1
  shadows: Object.freeze([0, 0, 0]), // split-tone colour pushed into the darks
  highlights: Object.freeze([0, 0, 0]), // ... and into the lights
  fade: 0, // 0..1, lifts the blacks (matte)
  vignette: 0, // 0..1, darkens toward the corners
  smooth: 0, // 0..1, edge-preserving blur -- evens skin, keeps eyes sharp
  glow: 0, // 0..1, blooms the highlights
  grain: 0, // 0..1, animated film grain
});

/** Allowed range per numeric param, so a typo cannot ship a broken look. */
export const PARAM_RANGES = Object.freeze({
  exposure: [-1, 1],
  brightness: [-0.3, 0.3],
  contrast: [0.4, 2],
  saturation: [0, 2.5],
  temperature: [-1, 1],
  tint: [-1, 1],
  sepia: [0, 1],
  fade: [0, 0.4],
  vignette: [0, 1],
  smooth: [0, 1],
  glow: [0, 1],
  grain: [0, 1],
});

export const FILTER_CATEGORIES = Object.freeze([
  { id: 'basic', label: 'Basic' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'mood', label: 'Mood' },
  { id: 'color', label: 'Color' },
]);

export const DEFAULT_FILTER_ID = 'none';

const define = (id, name, category, params, css) =>
  Object.freeze({
    id,
    name,
    category,
    kind: 'filter',
    params: Object.freeze({ ...NEUTRAL, ...params }),
    css,
  });

export const VIDEO_FILTERS = Object.freeze([
  // ── Basic ──────────────────────────────────────────────────────────────
  // 'none' rather than 'normal': drafts already store 'none' for "no filter",
  // and the backend column defaults to it.
  define('none', 'Normal', 'basic', {}, 'none'),
  define('bright', 'Bright', 'basic',
    { exposure: 0.4, brightness: 0.02, contrast: 0.95, saturation: 1.05 },
    'brightness(1.3) contrast(0.95) saturate(1.05)'),
  define('warm', 'Warm', 'basic',
    { temperature: 0.55, tint: 0.08, saturation: 1.1, brightness: 0.01 },
    'sepia(0.25) saturate(1.3) hue-rotate(-10deg)'),
  define('cool', 'Cool', 'basic',
    { temperature: -0.55, tint: -0.04, contrast: 1.05, saturation: 0.95 },
    'saturate(0.95) hue-rotate(15deg) contrast(1.05) brightness(1.02)'),
  define('vivid', 'Vivid', 'basic',
    { saturation: 1.4, contrast: 1.2, vignette: 0.15 },
    'saturate(1.4) contrast(1.2)'),
  define('soft', 'Soft', 'basic',
    { contrast: 0.82, brightness: 0.04, saturation: 0.9, smooth: 0.3, fade: 0.05 },
    'contrast(0.82) brightness(1.05) saturate(0.9)'),

  // ── Portrait / beauty ──────────────────────────────────────────────────
  define('smooth', 'Smooth', 'portrait',
    { smooth: 0.9, brightness: 0.03, exposure: 0.05 },
    null),
  define('portrait', 'Portrait', 'portrait',
    { smooth: 0.45, temperature: 0.18, exposure: 0.12, contrast: 1.06, vignette: 0.45 },
    'sepia(0.1) contrast(1.06) brightness(1.08) saturate(1.05)'),
  define('glow', 'Glow', 'portrait',
    { glow: 0.7, smooth: 0.2, brightness: 0.03, saturation: 1.05 },
    null),
  define('natural', 'Natural', 'portrait',
    { smooth: 0.4, contrast: 1.08, saturation: 1.12, exposure: 0.08, temperature: 0.06 },
    'contrast(1.08) saturate(1.12) brightness(1.05)'),

  // ── Mood ───────────────────────────────────────────────────────────────
  define('vintage', 'Vintage', 'mood',
    { sepia: 0.35, fade: 0.18, contrast: 0.9, saturation: 0.75, temperature: 0.2, vignette: 0.5, grain: 0.35 },
    'sepia(0.5) contrast(0.9) saturate(0.8) brightness(1.05)'),
  define('cinema', 'Cinema', 'mood',
    {
      contrast: 1.2,
      saturation: 0.85,
      exposure: -0.05,
      // Teal shadows, orange highlights: the blockbuster grade.
      shadows: [-0.05, 0.02, 0.07],
      highlights: [0.07, 0.02, -0.06],
      vignette: 0.3,
    },
    'contrast(1.2) saturate(0.85) brightness(0.96)'),
  define('dream', 'Dream', 'mood',
    { glow: 0.55, smooth: 0.3, fade: 0.1, saturation: 0.88, tint: 0.2, brightness: 0.05, contrast: 0.9 },
    'contrast(0.9) brightness(1.1) saturate(0.88) hue-rotate(-12deg)'),
  define('bw', 'Black & White', 'mood',
    { saturation: 0, contrast: 1.2 },
    'grayscale(1) contrast(1.2)'),
  define('sepia', 'Sepia', 'mood',
    { sepia: 1, contrast: 1.05 },
    'sepia(1) contrast(1.05)'),

  // ── Colour ─────────────────────────────────────────────────────────────
  define('high-contrast', 'High Contrast', 'color',
    { contrast: 1.5, saturation: 1.05 },
    'contrast(1.5) saturate(1.05)'),
  define('low-contrast', 'Low Contrast', 'color',
    { contrast: 0.65 },
    'contrast(0.65)'),
  define('saturated', 'Saturated', 'color',
    { saturation: 1.8 },
    'saturate(1.8)'),
  define('desaturated', 'Desaturated', 'color',
    { saturation: 0.4 },
    'saturate(0.4)'),
]);

/**
 * Ids the camera used before this registry. Drafts saved then still carry
 * them in their `filter` field; they map to the nearest current look so a
 * resumed draft keeps a sensible label. Unknown ids fall back to Normal.
 */
export const LEGACY_FILTER_IDS = Object.freeze({
  grayscale: 'bw',
  vibrant: 'vivid',
  fade: 'soft',
  drama: 'high-contrast',
  golden: 'warm',
  neon: 'saturated',
});

const BY_ID = new Map(VIDEO_FILTERS.map((f) => [f.id, f]));

/** A known filter id for `id`, following legacy aliases; Normal otherwise. */
export function resolveFilterId(id) {
  if (typeof id !== 'string' || !id) return DEFAULT_FILTER_ID;
  if (BY_ID.has(id)) return id;
  const legacy = LEGACY_FILTER_IDS[id];
  return legacy && BY_ID.has(legacy) ? legacy : DEFAULT_FILTER_ID;
}

/** The filter for `id` (aliases honoured). Never undefined. */
export function getFilter(id) {
  return BY_ID.get(resolveFilterId(id));
}

export function filtersInCategory(categoryId, filters = VIDEO_FILTERS) {
  return filters.filter((f) => f.category === categoryId);
}

/** True when a filter changes nothing -- the recording needs no baking. */
export function isNeutralFilter(filter) {
  return !filter || filter.id === DEFAULT_FILTER_ID;
}
