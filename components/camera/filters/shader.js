/**
 * GLSL for the filter pass, generated from the constants in colorMath.js so
 * the GPU and the JS reference share one definition of every threshold.
 *
 * WebGL 1 / GLSL ES 1.00 on purpose: it is the one version every phone this
 * app meets can compile, including older Android WebViews inside the SuperApp.
 * Everything is a single pass -- one full-screen quad, one texture read of the
 * camera frame plus the neighbour taps only the smoothing and glow filters
 * pay for (a uniform branch, so filters that do not use them skip the reads).
 */

import { PIPELINE, RING } from './colorMath.js';

/** A GLSL float literal: `1` must be written `1.0`. */
const f = (n) => {
  const s = String(Number(n));
  return /[.e]/.test(s) ? s : `${s}.0`;
};
const vec2 = ([x, y]) => `vec2(${f(x)}, ${f(y)})`;
const vec3 = ([x, y, z]) => `vec3(${f(x)}, ${f(y)}, ${f(z)})`;

// v_uv runs top-down (y = 0 at the top of the screen) because uploaded frames
// are stored top row first. Flipping here, rather than with
// UNPACK_FLIP_Y_WEBGL at upload, keeps video uploads on the browser's fast
// GPU path -- some WebKit builds copy through the CPU to honour the flag.
export const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const P = PIPELINE;
const nearTaps = RING.map((o, i) => `  vec3 n${i} = texture2D(u_frame, v_uv + ${vec2(o)} * step).rgb;`).join('\n');
const farTaps = RING.map((o) => `texture2D(u_frame, v_uv + ${vec2(o)} * far).rgb`).join(' + ');
const weights = RING.map((_, i) => `    float w${i} = similar(n${i}, c);`).join('\n');
const weighted = RING.map((_, i) => `n${i} * w${i}`).join(' + ');
const weightSum = RING.map((_, i) => `w${i}`).join(' + ');
const nearSum = RING.map((_, i) => `n${i}`).join(' + ');

export const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 v_uv;

uniform sampler2D u_frame;
uniform sampler2D u_overlay;
uniform sampler2D u_noise;
uniform float u_hasOverlay;
uniform vec2 u_texel;
uniform float u_radius;
uniform float u_exposure;
uniform vec3 u_balance;
uniform float u_contrast;
uniform float u_brightness;
uniform float u_saturation;
uniform float u_sepia;
uniform vec3 u_shadows;
uniform vec3 u_highlights;
uniform float u_fade;
uniform float u_vignette;
uniform float u_smooth;
uniform float u_glow;
uniform float u_grain;
uniform vec2 u_noiseScale;
uniform vec2 u_noiseOffset;

const vec3 LUMA = ${vec3(P.LUMA)};

float similar(vec3 a, vec3 b) {
  return 1.0 - smoothstep(0.0, ${f(P.EDGE)}, distance(a, b));
}

vec3 grade(vec3 c, float d) {
  c *= u_exposure;
  c *= u_balance;
  c = (c - 0.5) * u_contrast + 0.5 + u_brightness;
  float l = dot(c, LUMA);
  c = mix(vec3(l), c, u_saturation);
  vec3 sep = vec3(dot(c, ${vec3(P.SEPIA[0])}), dot(c, ${vec3(P.SEPIA[1])}), dot(c, ${vec3(P.SEPIA[2])}));
  c = mix(c, sep, u_sepia);
  float l2 = dot(clamp(c, 0.0, 1.0), LUMA);
  c += u_shadows * ((1.0 - l2) * (1.0 - l2)) + u_highlights * (l2 * l2);
  c = u_fade + c * (1.0 - u_fade);
  c *= 1.0 - u_vignette * smoothstep(${f(P.VIGNETTE_START)}, 1.0, d);
  return c;
}

void main() {
  vec3 c = texture2D(u_frame, v_uv).rgb;
  vec3 v = c;

  if (u_smooth > 0.0 || u_glow > 0.0) {
    vec2 step = u_texel * u_radius;
${nearTaps}

    if (u_smooth > 0.0) {
${weights}
      vec3 acc = c + ${weighted};
      float ws = 1.0 + ${weightSum};
      v = mix(v, acc / ws, u_smooth);
    }

    if (u_glow > 0.0) {
      vec2 far = step * ${f(P.GLOW_RING)};
      vec3 blur = (c + ${nearSum} + ${farTaps}) / 17.0;
      vec3 halo = clamp(max(blur - ${f(P.GLOW_THRESHOLD)}, 0.0) / ${f(1 - P.GLOW_THRESHOLD)} * u_glow * ${f(P.GLOW_GAIN)}, 0.0, 1.0);
      v = mix(v, blur, u_glow * ${f(P.GLOW_SOFTEN)});
      v = 1.0 - (1.0 - v) * (1.0 - halo);
    }
  }

  float d = distance(v_uv, vec2(0.5)) * ${f(Math.SQRT2)};
  vec3 outc = grade(v, d);

  if (u_grain > 0.0) {
    float n = texture2D(u_noise, v_uv * u_noiseScale + u_noiseOffset).r - 0.5;
    outc += n * u_grain * ${f(P.GRAIN_AMOUNT)};
  }
  outc = clamp(outc, 0.0, 1.0);

  if (u_hasOverlay > 0.5) {
    vec4 o = texture2D(u_overlay, v_uv);
    outc = mix(outc, o.rgb, o.a);
  }
  gl_FragColor = vec4(outc, 1.0);
}
`;

/** Every uniform the fragment shader declares, parsed from the source. */
export const UNIFORM_NAMES = (() => {
  // An exec loop rather than matchAll: the bundle targets es2015, and the
  // older WebViews it still has to run in have no String#matchAll.
  const names = [];
  const re = /^uniform\s+\w+\s+(\w+);/gm;
  let m;
  while ((m = re.exec(FRAGMENT_SHADER))) names.push(m[1]);
  return Object.freeze(names);
})();
