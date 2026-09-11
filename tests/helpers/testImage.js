/**
 * A small synthetic frame that exercises every part of the filter pipeline:
 * a grey ramp (tone curves), a hue sweep (colour), a noisy skin patch
 * (smoothing), hard stripes (edge preservation) and a white block (glow).
 * Deterministic, so every run renders the same pixels.
 */

export const TEST_W = 40;
export const TEST_H = 56;

function hsv(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}

export function makeTestImage() {
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const data = new Float32Array(TEST_W * TEST_H * 3);
  for (let y = 0; y < TEST_H; y++) {
    for (let x = 0; x < TEST_W; x++) {
      let c;
      if (y < 14) {
        const g = x / (TEST_W - 1);
        c = [g, g, g];
      } else if (y < 28) {
        c = hsv(x / TEST_W, 0.8, 0.85);
      } else if (y < 42) {
        const n = (rand() - 0.5) * 0.08;
        c = x < TEST_W / 2 ? [0.85 + n, 0.62 + n, 0.5 + n] : [0.12 + n, 0.18 + n, 0.3 + n];
      } else if (x >= 30) {
        c = [1, 1, 1];
      } else {
        const on = Math.floor(x / 4) % 2 === 0;
        c = on ? [0.95, 0.95, 0.95] : [0.05, 0.05, 0.05];
      }
      const i = (y * TEST_W + x) * 3;
      data[i] = Math.min(1, Math.max(0, c[0]));
      data[i + 1] = Math.min(1, Math.max(0, c[1]));
      data[i + 2] = Math.min(1, Math.max(0, c[2]));
    }
  }
  return { width: TEST_W, height: TEST_H, data };
}

/** The image as 8-bit RGBA, quantised the way a canvas would store it. */
export function toRGBA8(image) {
  const out = new Uint8ClampedArray(image.width * image.height * 4);
  for (let p = 0; p < image.width * image.height; p++) {
    out[p * 4] = Math.round(image.data[p * 3] * 255);
    out[p * 4 + 1] = Math.round(image.data[p * 3 + 1] * 255);
    out[p * 4 + 2] = Math.round(image.data[p * 3 + 2] * 255);
    out[p * 4 + 3] = 255;
  }
  return out;
}

/** Back from 8-bit RGBA to the float image renderReference takes. */
export function fromRGBA8(rgba, width, height) {
  const data = new Float32Array(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    data[p * 3] = rgba[p * 4] / 255;
    data[p * 3 + 1] = rgba[p * 4 + 1] / 255;
    data[p * 3 + 2] = rgba[p * 4 + 2] / 255;
  }
  return { width, height, data };
}
