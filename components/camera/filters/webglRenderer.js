/**
 * GPU filter renderer: camera frame in, filtered frame out, one draw call.
 *
 * Per frame the only work is uploading the camera frame to a texture (a
 * GPU-to-GPU copy in modern browsers) and one full-screen pass. The overlay
 * texture (text stickers) is uploaded only when the overlays change, not every
 * frame -- the old 2D loop redrew every sticker, shadow blur included, 30-60
 * times a second.
 *
 * Interface shared with Canvas2DFilterRenderer:
 *   kind, supports(filter), setFilter(filter), setOverlay(canvas|null),
 *   setFixedSize(w, h), uploadFrame(source), draw(), render(source), destroy()
 */

import { FRAGMENT_SHADER, VERTEX_SHADER, UNIFORM_NAMES } from './shader.js';
import { samplingRadius, uniformsFor } from './colorMath.js';
import { fitWithin, sourceSize } from './frame.js';
import { getFilter } from './registry.js';

const CONTEXT_ATTRIBUTES = {
  // Opaque: nothing shows through the preview, and an opaque canvas is
  // cheaper to composite and to capture.
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  // false is the fast path. The one reader that needs the pixels after a
  // frame (a photo) draws and reads in the same task, before they are cleared.
  preserveDrawingBuffer: false,
};

const NOISE_SIZE = 64;

function getContext(canvas) {
  try {
    return (
      canvas.getContext('webgl', CONTEXT_ATTRIBUTES) ||
      canvas.getContext('experimental-webgl', CONTEXT_ATTRIBUTES)
    );
  } catch (_) {
    return null;
  }
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Filter shader failed to compile: ${log}`);
  }
  return shader;
}

function buildProgram(gl) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Filter shader failed to link: ${log}`);
  }
  return program;
}

let probed = null;

/**
 * Whether this device can run the filter shader, answered once per page on a
 * throwaway canvas. Probing on the real preview canvas would be a trap: a
 * canvas that has handed out a WebGL context can never give a 2D one, so a
 * driver that creates the context but fails to compile the shader would leave
 * no fallback at all.
 */
export function probeWebGL(doc = typeof document !== 'undefined' ? document : null) {
  if (probed !== null) return probed;
  probed = false;
  if (!doc) return probed;
  try {
    const gl = getContext(doc.createElement('canvas'));
    if (gl) {
      gl.deleteProgram(buildProgram(gl));
      probed = true;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  } catch (_) {
    probed = false;
  }
  return probed;
}

export class WebGLFilterRenderer {
  /** A renderer on `canvas`, or null when WebGL cannot be set up there. */
  static create(canvas, hooks = {}) {
    const gl = getContext(canvas);
    if (!gl) return null;
    const renderer = new WebGLFilterRenderer(canvas, gl, hooks);
    try {
      renderer._init();
    } catch (_) {
      renderer.destroy();
      return null;
    }
    return renderer;
  }

  constructor(canvas, gl, hooks) {
    this.kind = 'webgl';
    this.canvas = canvas;
    this.gl = gl;
    this.hooks = hooks;
    this.lost = false;
    this.fixedSize = null;
    this.overlaySource = null;
    this.srcW = 0;
    this.srcH = 0;
    this.setFilter(getFilter('none'));

    this._onLost = (e) => {
      // preventDefault is what makes the browser try to restore the context.
      e.preventDefault();
      this.lost = true;
      if (this.hooks.onContextLost) this.hooks.onContextLost();
    };
    this._onRestored = () => {
      try {
        this._init();
        this.lost = false;
        if (this.overlaySource) this._uploadOverlay();
        if (this.hooks.onContextRestored) this.hooks.onContextRestored();
      } catch (_) {
        // Stays lost; the owner already heard about it through onContextLost.
      }
    };
    canvas.addEventListener('webglcontextlost', this._onLost, false);
    canvas.addEventListener('webglcontextrestored', this._onRestored, false);
  }

  _init() {
    const gl = this.gl;
    this.program = buildProgram(gl);
    gl.useProgram(this.program);

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.loc = {};
    UNIFORM_NAMES.forEach((name) => {
      this.loc[name] = gl.getUniformLocation(this.program, name);
    });

    // No UNPACK_FLIP_Y_WEBGL: the vertex shader flips instead (see shader.js).
    const makeTexture = (unit, wrap) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    };

    // Camera frames are rarely power-of-two sized; WebGL 1 then only allows
    // CLAMP_TO_EDGE without mipmaps.
    this.frameTex = makeTexture(0, gl.CLAMP_TO_EDGE);
    this.overlayTex = makeTexture(1, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.noiseTex = makeTexture(2, gl.REPEAT);
    const noise = new Uint8Array(NOISE_SIZE * NOISE_SIZE);
    for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 256) | 0;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, NOISE_SIZE, NOISE_SIZE, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, noise);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

    gl.uniform1i(this.loc.u_frame, 0);
    gl.uniform1i(this.loc.u_overlay, 1);
    gl.uniform1i(this.loc.u_noise, 2);
    // A restored context has fresh textures; force the next upload to allocate.
    this.srcW = 0;
    this.srcH = 0;
  }

  supports() {
    return true;
  }

  setFilter(filter) {
    this.filter = filter;
    this.uniforms = uniformsFor(filter && filter.params);
  }

  /** Fix the output size (thumbnails); null returns to the source size. */
  setFixedSize(width, height) {
    this.fixedSize = width && height ? { width, height } : null;
  }

  setOverlay(source) {
    this.overlaySource = source || null;
    if (!this.lost) this._uploadOverlay();
  }

  _uploadOverlay() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    if (this.overlaySource) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.overlaySource);
    }
  }

  /** Size the canvas and upload `source`. False when there is nothing to draw. */
  uploadFrame(source) {
    if (this.lost) return false;
    const src = sourceSize(source);
    if (!src.width || !src.height) return false;

    const target = this.fixedSize || fitWithin(src.width, src.height);
    const canvas = this.canvas;
    if (canvas.width !== target.width || canvas.height !== target.height) {
      // Only on a real change: assigning width, even the same value, clears
      // the canvas and reallocates its buffers.
      canvas.width = target.width;
      canvas.height = target.height;
      if (this.hooks.onResize) this.hooks.onResize(target.width, target.height);
    }

    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    try {
      if (src.width === this.srcW && src.height === this.srcH) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        this.srcW = src.width;
        this.srcH = src.height;
      }
    } catch (_) {
      // A frame that is not decodable yet; the next one will be.
      return false;
    }
    return true;
  }

  draw() {
    if (this.lost) return;
    const gl = this.gl;
    const u = this.uniforms;
    const loc = this.loc;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.uniform1f(loc.u_hasOverlay, this.overlaySource ? 1 : 0);
    gl.uniform2f(loc.u_texel, 1 / Math.max(1, this.srcW), 1 / Math.max(1, this.srcH));
    gl.uniform1f(loc.u_radius, samplingRadius(this.srcW, this.srcH));
    gl.uniform1f(loc.u_exposure, u.u_exposure);
    gl.uniform3fv(loc.u_balance, u.u_balance);
    gl.uniform1f(loc.u_contrast, u.u_contrast);
    gl.uniform1f(loc.u_brightness, u.u_brightness);
    gl.uniform1f(loc.u_saturation, u.u_saturation);
    gl.uniform1f(loc.u_sepia, u.u_sepia);
    gl.uniform3fv(loc.u_shadows, u.u_shadows);
    gl.uniform3fv(loc.u_highlights, u.u_highlights);
    gl.uniform1f(loc.u_fade, u.u_fade);
    gl.uniform1f(loc.u_vignette, u.u_vignette);
    gl.uniform1f(loc.u_smooth, u.u_smooth);
    gl.uniform1f(loc.u_glow, u.u_glow);
    gl.uniform1f(loc.u_grain, u.u_grain);
    gl.uniform2f(loc.u_noiseScale, this.canvas.width / NOISE_SIZE, this.canvas.height / NOISE_SIZE);
    // A new offset per frame is what makes the grain move like film.
    gl.uniform2f(loc.u_noiseOffset, Math.random(), Math.random());

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  render(source) {
    if (!this.uploadFrame(source)) return false;
    this.draw();
    return true;
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this._onLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this._onRestored, false);
    const gl = this.gl;
    if (gl && !this.lost && !(gl.isContextLost && gl.isContextLost())) {
      [this.frameTex, this.overlayTex, this.noiseTex].forEach((t) => t && gl.deleteTexture(t));
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
    }
    // The context itself is left alone: the same canvas may get a new
    // renderer, and a canvas can never hand out a second context type.
    this.program = null;
    this.lost = true;
  }
}
