/**
 * Runs inside the browser (see run.mjs). Two kinds of checks:
 *
 *  1. The real WebGL shader against the JS reference in colorMath.js, pixel
 *     by pixel, for every filter.
 *  2. The real EnhancedPostPage, driven through its buttons with Chromium's
 *     fake camera: filters in the preview, filters in the recorded file,
 *     camera switching and pausing mid-take, review, posting, gallery
 *     uploads, and each camera failure the page must explain.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { EnhancedPostPage } from '../../pages/general/EnhancedPostPage';
import { VIDEO_FILTERS, getFilter } from '../../components/camera/filters/registry';
import { WebGLFilterRenderer } from '../../components/camera/filters/webglRenderer';
import { Canvas2DFilterRenderer } from '../../components/camera/filters/canvasRenderer';
import { meanAbsDiff, renderReference } from '../../components/camera/filters/colorMath';
import { fromRGBA8, makeTestImage, toRGBA8 } from '../helpers/testImage';
import { uploadTracker } from '../../services/uploadTracker';

// ── plumbing ────────────────────────────────────────────────────────────────

const log = (msg) => fetch('/__log', { method: 'POST', body: msg }).catch(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

class Skip extends Error {}

async function test(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    await log(`✔ ${name} (${Math.round(performance.now() - t0)}ms)${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    if (e instanceof Skip) {
      results.push({ name, ok: true, skipped: true, detail: e.message });
      await log(`↷ ${name}: skipped — ${e.message}`);
      return;
    }
    results.push({ name, ok: false, detail: String((e && e.stack) || e) });
    await log(`✘ ${name}: ${e && e.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// The app's text only: document.body also holds this bundle's inline source,
// which contains every string the page can show.
const pageText = () => (document.getElementById('root') || document.body).innerText || '';

// Surface GPU trouble in the run's output.
document.addEventListener('webglcontextlost', (e) => log(`! webglcontextlost on ${e.target && e.target.getAttribute && e.target.getAttribute('aria-label')}`), true);
document.addEventListener('webglcontextrestored', () => log('! webglcontextrestored'), true);
// Uncaught errors from the page fail the run: each one is a bug (the first
// this caught was the recorder assigning Infinity to currentTime).
const pageErrors = [];
window.addEventListener('error', (e) => {
  pageErrors.push(e.message);
  log(`! error: ${e.message}`);
});
window.addEventListener('unhandledrejection', (e) => log(`! unhandled rejection: ${e.reason && (e.reason.stack || e.reason)}`));

async function waitFor(fn, what, ms = 10000) {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch (_) { v = null; }
    if (v) return v;
    if (performance.now() - t0 > ms) {
      throw new Error(`timed out waiting for ${what}; page shows: "${pageText().replace(/\s+/g, ' ').slice(0, 240)}"`);
    }
    await sleep(50);
  }
}

const all = (sel) => Array.from(document.querySelectorAll('#root ' + sel));
const byLabel = (label) => all('[aria-label]').find((el) => el.getAttribute('aria-label') === label) || null;
const byText = (text, sel = 'button') => all(sel).find((el) => el.textContent.trim().includes(text)) || null;

function click(el, what) {
  assert(el, `no ${what} to click`);
  el.click();
}

// Keep WebGL canvases readable after compositing so the test can sample the
// live preview. Switched off for the photo test, which checks the page reads
// its own canvas correctly without this.
window.__preserve = true;
const realGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function getContext(type, attrs) {
  if ((type === 'webgl' || type === 'experimental-webgl') && window.__preserve) {
    return realGetContext.call(this, type, { ...(attrs || {}), preserveDrawingBuffer: true });
  }
  return realGetContext.call(this, type, attrs);
};

// Count filter passes per canvas, to measure the preview's render rate.
const drawCounts = new WeakMap();
const realDrawArrays = WebGLRenderingContext.prototype.drawArrays;
WebGLRenderingContext.prototype.drawArrays = function drawArrays(...args) {
  drawCounts.set(this.canvas, (drawCounts.get(this.canvas) || 0) + 1);
  return realDrawArrays.apply(this, args);
};

// Record the uniforms each canvas last drew with, by name.
const uniformNames = new WeakMap();
const lastUniforms = new WeakMap();
const realGetUniformLocation = WebGLRenderingContext.prototype.getUniformLocation;
WebGLRenderingContext.prototype.getUniformLocation = function getUniformLocation(program, name) {
  const loc = realGetUniformLocation.call(this, program, name);
  if (loc) uniformNames.set(loc, name);
  return loc;
};
['uniform1f', 'uniform2f', 'uniform3fv'].forEach((fn) => {
  const real = WebGLRenderingContext.prototype[fn];
  WebGLRenderingContext.prototype[fn] = function uniform(loc, ...values) {
    if (loc && uniformNames.has(loc)) {
      const m = lastUniforms.get(this.canvas) || {};
      m[uniformNames.get(loc)] = values.length === 1 ? Array.from([].concat(values[0])) : values;
      lastUniforms.set(this.canvas, m);
    }
    return real.call(this, loc, ...values);
  };
});

async function rates(canvas, video, ms = 2000) {
  const draws0 = drawCounts.get(canvas) || 0;
  let rafs = 0;
  let vfcs = 0;
  let stop = false;
  const onRaf = () => { if (stop) return; rafs++; requestAnimationFrame(onRaf); };
  const onVfc = () => { if (stop) return; vfcs++; video.requestVideoFrameCallback(onVfc); };
  requestAnimationFrame(onRaf);
  if (video && video.requestVideoFrameCallback) video.requestVideoFrameCallback(onVfc);
  await sleep(ms);
  stop = true;
  const per = (n) => Math.round((n * 1000) / ms);
  const track = video && video.srcObject && video.srcObject.getVideoTracks()[0];
  const cameraFps = track && track.getSettings ? track.getSettings().frameRate : null;
  return { renders: per((drawCounts.get(canvas) || 0) - draws0), rafs: per(rafs), vfcs: per(vfcs), cameraFps };
}

/** Colour statistics of an image source, 0..255 scale. */
function stats(source, w, h) {
  const c = document.createElement('canvas');
  const scale = Math.min(1, 96 / Math.max(w, h));
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d');
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sat = 0;
  let rb = 0;
  let lum = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    sat += Math.max(r, g, b) - Math.min(r, g, b);
    rb += r - b;
    lum += (r + g + b) / 3;
  }
  return { sat: sat / n, rb: rb / n, lum: lum / n };
}

const previewCanvas = () => document.querySelector('canvas[aria-label^="Camera preview"]');

async function previewStats() {
  const cvs = await waitFor(previewCanvas, 'camera preview canvas');
  await sleep(250); // a few frames with the current filter
  return stats(cvs, cvs.width, cvs.height);
}

function once(target, event, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${event} event`)), ms);
    target.addEventListener(event, function handler() {
      clearTimeout(t);
      target.removeEventListener(event, handler);
      resolve();
    });
  });
}

/** Duration and colour of a recorded file, from a frame part-way through. */
async function inspectVideo(url) {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  await once(v, 'loadedmetadata');
  if (!isFinite(v.duration) || !v.duration) {
    const settled = once(v, 'durationchange');
    v.currentTime = 1e101;
    await settled;
  }
  const duration = v.duration;
  const seeked = once(v, 'seeked');
  v.currentTime = Math.min(0.8, duration / 2);
  await seeked;
  return { duration, width: v.videoWidth, height: v.videoHeight, ...stats(v, v.videoWidth, v.videoHeight) };
}

async function imageStats(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight, ...stats(img, img.naturalWidth, img.naturalHeight) };
}

// ── a camera with known colours ─────────────────────────────────────────────
// A canvas painted with fixed colours and streamed like a camera, with an
// oscillator as the microphone. Chromium's own fake device animates its
// colours (so "is this warmer?" has no stable answer) and, on some runs,
// never delivers a frame at all. The page's camera code is unchanged: it gets
// a MediaStream from getUserMedia either way.
const synth = (() => {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 640;
  const g = c.getContext('2d');
  let n = 0;
  const paint = () => {
    g.fillStyle = 'rgb(200,150,120)'; // skin tone
    g.fillRect(0, 0, 240, 640);
    g.fillStyle = 'rgb(70,120,200)'; // blue
    g.fillRect(240, 0, 240, 640);
    g.fillStyle = 'rgb(128,128,128)'; // grey band
    g.fillRect(0, 0, 480, 160);
    // A moving marker so consecutive frames differ.
    n = (n + 1) % 40;
    g.fillStyle = '#fff';
    g.fillRect(20 + n * 10, 600, 16, 16);
  };
  paint();
  setInterval(paint, 33);
  const video = c.captureStream(30).getVideoTracks()[0];
  let audio = null;
  try {
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const dest = ac.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    audio = dest.stream.getAudioTracks()[0];
  } catch (_) {
    audio = null;
  }
  return {
    stream(constraints) {
      const tracks = [];
      if (constraints.video) tracks.push(video.clone());
      if (constraints.audio && audio) tracks.push(audio.clone());
      return new MediaStream(tracks);
    },
  };
})();

const md = navigator.mediaDevices;
const gumCalls = [];
/** Route getUserMedia to the synthetic camera; `decide` may fail a request. */
function useCamera(decide = () => null) {
  gumCalls.length = 0;
  md.getUserMedia = async (constraints) => {
    gumCalls.push(constraints);
    const failure = decide(constraints);
    if (failure) throw new DOMException('stubbed', failure);
    return synth.stream(constraints);
  };
}

// ── the page ───────────────────────────────────────────────────────────────

localStorage.setItem('authToken', 'e2e-token');
const container = document.getElementById('root');
let root = null;

function mountPage() {
  if (root) root.unmount();
  root = createRoot(container);
  root.render(
    <ThemeProvider>
      <EnhancedPostPage
        user={{ id: 1, username: 'tester' }}
        subscriptionStatus={{ has_subscription: true }}
        onBack={() => { window.__backed = true; }}
        onPostSuccess={(id) => { window.__postedId = id; }}
        onShowSubscription={() => {}}
        onShowCoinPurchase={() => {}}
        onRequireAuth={() => {}}
        onNavHome={() => {}}
        onNavReels={() => {}}
        onNavMessages={() => {}}
        onNavProfile={() => {}}
      />
    </ThemeProvider>
  );
}

/** The camera is up: the shutter is enabled and the canvas has a frame size. */
async function waitForCameraReady() {
  const cvs = await waitFor(previewCanvas, 'camera preview');
  await waitFor(() => {
    const shutter = byLabel('Start recording') || byLabel('Take photo');
    return shutter && !shutter.disabled && cvs.width > 2;
  }, 'the camera to start', 15000);
  // Real frames, not the empty canvas -- only readable with preserveDrawingBuffer.
  if (window.__preserve) {
    await waitFor(() => stats(cvs, cvs.width, cvs.height).lum > 8, 'camera frames in the preview', 15000);
  }
  return cvs;
}

const openCameraFromChooser = async (card = 'Record a video') => {
  const button = await waitFor(() => byText(card), `"${card}" on the chooser`);
  click(button, card);
  return waitForCameraReady();
};

async function openTray() {
  if (!document.querySelector('[role="radiogroup"]')) click(byLabel('Show filters'), 'Show filters');
  return waitFor(() => document.querySelector('[role="radiogroup"]'), 'the filter tray');
}

async function pickFilter(name) {
  const f = VIDEO_FILTERS.find((x) => x.name === name);
  await openTray();
  const tab = all('[role="group"][aria-label="Filter categories"] button').find(
    (b) => b.textContent.trim().toLowerCase() === { basic: 'basic', portrait: 'portrait', mood: 'mood', color: 'color' }[f.category]
  );
  if (tab && tab.getAttribute('aria-pressed') !== 'true') click(tab, `${f.category} tab`);
  const radio = await waitFor(() => all('[role="radio"]').find((r) => r.getAttribute('aria-label') === name), `${name} in the tray`);
  click(radio, name);
  await waitFor(() => radio.getAttribute('aria-checked') === 'true', `${name} selected`);
}

async function closeTray() {
  const done = byLabel('Close filters');
  if (done) click(done, 'Close filters');
}

async function record(ms, during) {
  // The page ignores a second shutter tap within 500ms (touch + click
  // double-fire); a person is never that quick between two takes.
  await sleep(600);
  click(await waitFor(() => byLabel('Start recording'), 'record button'), 'Start recording');
  await waitFor(() => byLabel('Stop recording'), 'recording to start');
  if (during) await during();
  else await sleep(ms);
  click(byLabel('Stop recording'), 'Stop recording');
  const review = await waitFor(() => document.querySelector('section[aria-label="Review your video"]'), 'the review screen', 15000);
  const video = review.querySelector('video');
  return video.getAttribute('src');
}

async function confirmDiscard(action) {
  click(byText(action), action);
  click(await waitFor(() => byText(action === 'Retake' ? 'Discard & retake' : 'Discard & pick filter'), 'discard confirmation'), 'discard');
}

async function setFile(file) {
  const input = await waitFor(() => document.querySelector('input[type="file"][accept="image/*,video/*"]'), 'file input');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const uploads = () => fetch('/__uploads').then((r) => r.json());

// What the API accepts as a submission id (api/services/media_pipeline.py).
const UPLOAD_ID = /^[A-Za-z0-9_.:-]{8,64}$/;

async function postAndWait() {
  const before = (await uploads()).length;
  window.__postedId = undefined;
  click(await waitFor(() => all('button').find((b) => b.textContent.trim() === 'Post'), 'Post button'), 'Post');
  // The API answers PROCESSING. The page hands straight back to the feed --
  // no success screen to sit through -- and the upload is now the corner
  // indicator's to follow.
  const id = await waitFor(() => window.__postedId, 'the page to hand over to the feed', 20000);
  assert(!/is Live|Posted!/.test(pageText()), 'a success screen held the page');
  const tracked = uploadTracker.getSnapshot().find((e) => String(e.id) === String(id));
  assert(tracked && tracked.status === 'PROCESSING', `the upload is not in the corner indicator: ${JSON.stringify(uploadTracker.getSnapshot())}`);
  uploadTracker.clear(); // the next test starts with an empty corner
  const list = await uploads();
  assert(list.length === before + 1, `expected one upload, got ${list.length - before}`);
  const upload = list[list.length - 1];
  assert(UPLOAD_ID.test(upload.fields.client_upload_id || ''), `no usable client_upload_id: ${JSON.stringify(upload.fields)}`);
  return upload;
}

// ── the tests ──────────────────────────────────────────────────────────────

async function run() {
  await log(`userAgent: ${navigator.userAgent}`);

  // 1. Shader == reference ------------------------------------------------
  await test('WebGL shader matches the JS reference for every filter', async () => {
    const image = makeTestImage();
    const rgba = toRGBA8(image);
    const quantised = fromRGBA8(rgba, image.width, image.height);
    const src = document.createElement('canvas');
    src.width = image.width;
    src.height = image.height;
    src.getContext('2d').putImageData(new ImageData(rgba, image.width, image.height), 0, 0);

    const out = document.createElement('canvas');
    const renderer = WebGLFilterRenderer.create(out);
    assert(renderer, 'WebGL renderer could not be created');
    const worst = [];
    for (const f of VIDEO_FILTERS) {
      const params = { ...f.params, grain: 0 }; // grain is random by design
      renderer.setFilter({ ...f, params });
      assert(renderer.render(src), `render failed for ${f.id}`);
      const gl = renderer.gl;
      const px = new Uint8Array(image.width * image.height * 4);
      gl.readPixels(0, 0, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // readPixels starts at the bottom row.
      const flipped = new Uint8ClampedArray(px.length);
      const row = image.width * 4;
      for (let y = 0; y < image.height; y++) flipped.set(px.subarray((image.height - 1 - y) * row, (image.height - y) * row), y * row);
      const gpu = fromRGBA8(flipped, image.width, image.height);
      const diff = meanAbsDiff(gpu, renderReference(quantised, params));
      worst.push(`${f.id}=${diff.toFixed(4)}`);
      assert(diff < 0.012, `${f.name}: GPU differs from reference by ${diff.toFixed(4)}`);
    }
    renderer.destroy();
    return worst.sort((a, b) => Number(b.split('=')[1]) - Number(a.split('=')[1])).slice(0, 3).join(', ');
  });

  await test('2D fallback renderer applies CSS filters', async () => {
    const src = document.createElement('canvas');
    src.width = 40;
    src.height = 40;
    const g = src.getContext('2d');
    g.fillStyle = '#20c040';
    g.fillRect(0, 0, 40, 40);
    const out = document.createElement('canvas');
    const r = Canvas2DFilterRenderer.create(out);
    assert(r.cssFilters, 'this browser has ctx.filter');
    r.setFilter(getFilter('bw'));
    r.render(src);
    const s = stats(out, 40, 40);
    assert(s.sat < 3, `expected grey, saturation ${s.sat.toFixed(1)}`);
  });

  // 2. The page with a camera ---------------------------------------------
  useCamera();
  mountPage();
  let normal;
  let bwTakeUrl;

  await test('camera opens on the WebGL renderer', async () => {
    const cvs = await openCameraFromChooser();
    assert(realGetContext.call(cvs, 'webgl'), 'preview canvas is not WebGL');
    return `${cvs.width}x${cvs.height}`;
  });

  await test('the preview renders once per camera frame', async () => {
    const cvs = previewCanvas();
    const video = document.querySelector('#root video');
    const r = await rates(cvs, video);
    const detail = `renders/s=${r.renders} camera fps=${r.cameraFps} rAF/s=${r.rafs} rVFC/s=${r.vfcs}`;
    assert(r.renders >= 20, `preview only renders ${r.renders}/s (${detail})`);
    // Not once per display refresh: the camera delivers ~30fps.
    assert(r.renders <= 36, `preview renders ${r.renders}/s, more than the camera delivers (${detail})`);
    return detail;
  });

  await test('filter tray shows live thumbnails and marks Normal as selected', async () => {
    await openTray();
    const normalRadio = all('[role="radio"]').find((r) => r.getAttribute('aria-label') === 'Normal');
    assert(normalRadio && normalRadio.getAttribute('aria-checked') === 'true', 'Normal is not the default');
    await waitFor(() => all('[role="radiogroup"] img[src^="data:image"]').length >= 5, 'live thumbnails');
    const categories = all('[role="group"][aria-label="Filter categories"] button').map((b) => b.textContent.trim());
    assert(categories.join() === 'Basic,Portrait,Mood,Color', `categories: ${categories}`);
  });

  await test('filters change the live preview', async () => {
    normal = await previewStats();
    await pickFilter('Black & White');
    const bw = await previewStats();
    assert(bw.sat < 10, `B&W preview still has colour (${bw.sat.toFixed(1)})`);
    await pickFilter('Warm');
    const warm = await previewStats();
    // What the preview drew with -- the uniforms, not just the pixels.
    const u = lastUniforms.get(previewCanvas()) || {};
    const balance = getFilter('warm') && u.u_balance;
    assert(balance && balance[0] > 1.1 && balance[2] < 0.9, `preview drew with balance ${JSON.stringify(balance)}`);
    // Warm multiplies red up and blue down. On the synthetic frame the
    // reference pipeline moves the mean red-blue gap by about +40.
    assert(warm.rb - normal.rb > 20, `Warm did not warm the preview (red-blue ${normal.rb.toFixed(1)} -> ${warm.rb.toFixed(1)})`);
    await pickFilter('Normal');
    const back = await previewStats();
    assert(Math.abs(back.sat - normal.sat) < 12, 'Normal did not restore the picture');
    return `lum=${normal.lum.toFixed(0)}; saturation normal=${normal.sat.toFixed(0)} bw=${bw.sat.toFixed(1)}; red-blue normal=${normal.rb.toFixed(1)} warm=${warm.rb.toFixed(1)}`;
  });

  await test('keyboard arrows move the selection in the tray', async () => {
    await pickFilter('Normal');
    const group = document.querySelector('[role="radiogroup"]');
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await waitFor(() => all('[role="radio"]').find((r) => r.getAttribute('aria-label') === 'Bright').getAttribute('aria-checked') === 'true', 'Bright selected by keyboard');
    await pickFilter('Normal');
  });

  await test('the recorded video keeps the filter', async () => {
    await pickFilter('Black & White');
    await closeTray();
    bwTakeUrl = await record(2200);
    const v = await inspectVideo(bwTakeUrl);
    assert(v.lum > 8, 'recording is black');
    assert(v.sat < 12, `recorded frames still have colour (${v.sat.toFixed(1)})`);
    assert(v.duration > 1.5, `recording too short (${v.duration})`);
    assert(/Black & White/.test(document.querySelector('section[aria-label="Review your video"]').textContent), 'review does not name the filter');
    return `${v.width}x${v.height}, ${v.duration.toFixed(1)}s, saturation ${v.sat.toFixed(1)}`;
  });

  // Keep that take for the gallery-upload regression below.
  const bwBlob = bwTakeUrl ? await fetch(bwTakeUrl).then((r) => r.blob()).catch(() => null) : null;

  await test('retake returns to the camera with the filter still selected', async () => {
    await confirmDiscard('Retake');
    await waitForCameraReady();
    await waitFor(() => byLabel('Filter: Black & White. Change filter'), 'active filter chip');
  });

  await test('switching camera mid-recording keeps the take going', async () => {
    await pickFilter('Warm');
    await closeTray();
    const url = await record(0, async () => {
      await sleep(1000);
      gumCalls.length = 0;
      click(byLabel('Switch camera'), 'Switch camera');
      await waitFor(() => gumCalls.length && byLabel('Switch camera'), 'switch to finish', 8000);
      assert(
        JSON.stringify(gumCalls[0]) === JSON.stringify({ video: { facingMode: 'environment' }, audio: false }),
        `switch asked for ${JSON.stringify(gumCalls)}`
      );
      await sleep(1500);
    });
    const v = await inspectVideo(url);
    assert(v.duration > 2, `take ended early (${v.duration.toFixed(2)}s)`);
    assert(v.rb - normal.rb > 15, `Warm missing from the recording (red-blue ${v.rb.toFixed(1)} vs normal ${normal.rb.toFixed(1)})`);
    return `${v.duration.toFixed(1)}s, red-blue ${v.rb.toFixed(1)} vs normal ${normal.rb.toFixed(1)}`;
  });

  await test('pause leaves the paused time out of the video', async () => {
    await confirmDiscard('Retake');
    await waitForCameraReady();
    const url = await record(0, async () => {
      await sleep(1300);
      click(byLabel('Pause recording'), 'Pause');
      await waitFor(() => /paused/i.test(pageText()), 'Paused label');
      await sleep(1800);
      click(byLabel('Resume recording'), 'Resume');
      await sleep(1300);
    });
    const v = await inspectVideo(url);
    assert(v.duration < 3.6, `paused time was recorded (${v.duration.toFixed(2)}s for ~2.6s of recording)`);
    assert(v.duration > 1.8, `too short (${v.duration.toFixed(2)}s)`);
    return `${v.duration.toFixed(1)}s recorded of 4.4s elapsed`;
  });

  await test('Next leads to the details page and Post uploads the recording', async () => {
    click(byText('Next'), 'Next');
    await waitFor(() => document.querySelector('textarea[placeholder="Describe your video..."]'), 'details page');
    assert(/Warm/.test(pageText()), 'details thumbnail does not name the filter');
    const upload = await postAndWait();
    const file = upload.files.find((f) => f.name === 'file');
    assert(file && /^video\//.test(file.type) && /^rec_/.test(file.filename), `unexpected upload ${JSON.stringify(upload.files)}`);
    assert(file.size > 10000, `upload is ${file.size} bytes`);
    return `${file.filename} ${file.type} ${Math.round(file.size / 1024)}KB`;
  });

  // Older Android Chrome and WebViews cannot record MP4 and fall back to WebM,
  // whose MediaRecorder files report Infinity for their duration.
  let webmBlob = null;
  await test('WebM recordings (older Android) review, measure and post', async () => {
    const MR = window.MediaRecorder;
    const realIsTypeSupported = MR.isTypeSupported;
    MR.isTypeSupported = (m) => !/mp4/.test(m) && realIsTypeSupported.call(MR, m);
    try {
      mountPage();
      await openCameraFromChooser();
      await pickFilter('Sepia');
      await closeTray();
      const url = await record(2000);
      await waitFor(
        () => /0:0[1-3]/.test(document.querySelector('section[aria-label="Review your video"]').innerText),
        'the review to work out the WebM duration'
      );
      webmBlob = await fetch(url).then((r) => r.blob());
      assert(/webm/.test(webmBlob.type), `recorded ${webmBlob.type}`);
      click(byText('Next'), 'Next');
      await waitFor(() => document.querySelector('textarea[placeholder="Describe your video..."]'), 'details page');
      const upload = await postAndWait();
      const file = upload.files.find((f) => f.name === 'file');
      assert(file && /^rec_.*\.webm$/.test(file.filename) && /^video\/webm/.test(file.type), JSON.stringify(upload.files));
      return `${file.type} ${Math.round(file.size / 1024)}KB`;
    } finally {
      MR.isTypeSupported = realIsTypeSupported;
    }
  });

  await test('a MediaRecorder WebM from the gallery is measured, not refused as too long', async () => {
    assert(webmBlob, 'no WebM recording to upload');
    mountPage();
    await waitFor(() => byText('Upload'), 'chooser');
    await setFile(new File([webmBlob], 'from-another-app.webm', { type: 'video/webm' }));
    await waitFor(() => document.querySelector('textarea[placeholder="Describe your video..."]'), 'details page', 15000);
    assert(!/exceeds/.test(pageText()), 'refused as longer than the limit');
    const upload = await postAndWait();
    assert(upload.files.some((f) => f.name === 'file' && /^video\/webm/.test(f.type)), JSON.stringify(upload.files));
  });

  await test('a photo carries the filter (read without preserveDrawingBuffer)', async () => {
    window.__preserve = false;
    try {
      mountPage();
      await openCameraFromChooser('Take a photo');
      await sleep(500);
      await pickFilter('Black & White');
      await closeTray();
      click(byLabel('Take photo'), 'Take photo');
      const img = await waitFor(() => document.querySelector('#root img[alt="preview"]'), 'photo on the details page');
      const s = await imageStats(img.src);
      assert(s.lum > 8, 'photo is black: the canvas was read after its pixels were cleared');
      assert(s.sat < 12, `photo has colour (${s.sat.toFixed(1)})`);
      return `${s.width}x${s.height}, lum ${s.lum.toFixed(0)}`;
    } finally {
      window.__preserve = true;
    }
  });

  await test('uploading a video from the gallery still works', async () => {
    assert(bwBlob, 'no recorded file to upload');
    mountPage();
    await waitFor(() => byText('Upload'), 'chooser');
    await setFile(new File([bwBlob], 'gallery.webm', { type: bwBlob.type || 'video/webm' }));
    await waitFor(() => document.querySelector('textarea[placeholder="Describe your video..."]'), 'details page', 15000);
    assert(!/Black & White/.test(document.querySelector('textarea').parentElement.parentElement.textContent), 'gallery file labelled with a camera filter');
    const upload = await postAndWait();
    const file = upload.files.find((f) => f.name === 'file');
    assert(file && /^video\//.test(file.type), `unexpected upload ${JSON.stringify(upload.files)}`);
  });

  let pngFile;
  await test('uploading an image from the gallery still works', async () => {
    mountPage();
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#3080e0';
    g.fillRect(0, 0, 120, 160);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    pngFile = new File([blob], 'gallery.png', { type: 'image/png' });
    await waitFor(() => byText('Upload'), 'chooser');
    await setFile(pngFile);
    await waitFor(() => document.querySelector('img[alt="preview"]'), 'image on the details page');
    const upload = await postAndWait();
    const file = upload.files.find((f) => f.name === 'file');
    assert(file && file.type === 'image/png', `unexpected upload ${JSON.stringify(upload.files)}`);
  });

  await test('a failed upload explains itself and keeps the post', async () => {
    mountPage();
    await waitFor(() => byText('Upload'), 'chooser');
    await setFile(pngFile);
    await waitFor(() => document.querySelector('img[alt="preview"]'), 'image on the details page');
    await fetch('/__control?failUpload=1');
    click(all('button').find((b) => b.textContent.trim() === 'Post'), 'Post');
    await waitFor(() => /server couldn't finish the upload/.test(pageText()), 'friendly upload error');
    await fetch('/__control?failUpload=0');
    assert(!/HTTP 500/.test(pageText()), 'raw status shown');
    click(byText('OK'), 'OK');
    assert(document.querySelector('img[alt="preview"]'), 'the post was lost');
  });

  // The failure above may have been a lost response to an upload the server
  // did take. The retry must say it is the same post, so the API can return
  // that one instead of creating -- and charging for -- a second.
  await test('retrying a post sends the same upload id; a new post gets a new one', async () => {
    const failed = (await uploads()).at(-1);
    const retried = await postAndWait();
    assert(
      retried.fields.client_upload_id === failed.fields.client_upload_id,
      `retry sent ${retried.fields.client_upload_id}, the failed attempt ${failed.fields.client_upload_id}`
    );

    mountPage();
    await waitFor(() => byText('Upload'), 'chooser');
    await setFile(pngFile);
    await waitFor(() => document.querySelector('img[alt="preview"]'), 'image on the details page');
    const next = await postAndWait();
    assert(next.fields.client_upload_id !== retried.fields.client_upload_id, 'a different post reused the id');
    return `${retried.fields.client_upload_id.slice(0, 8)}… reused on retry`;
  });

  // The upload reached the server, the answer was lost, and the person
  // reloaded and posted the same photo from their gallery again: that must
  // come back as the post already made, not a second one.
  await test('after a reload, posting the same file again reuses its upload id', async () => {
    const photo = new File([await pngFile.arrayBuffer()], 'IMG_reload.png', { type: 'image/png', lastModified: 1780000000000 });
    mountPage();
    await waitFor(() => byText('Upload'), 'chooser');
    await setFile(photo);
    await waitFor(() => document.querySelector('img[alt="preview"]'), 'image on the details page');
    await fetch('/__control?failUpload=1');
    click(all('button').find((b) => b.textContent.trim() === 'Post'), 'Post');
    await waitFor(() => /server couldn't finish the upload/.test(pageText()), 'friendly upload error');
    await fetch('/__control?failUpload=0');
    const lost = (await uploads()).at(-1);

    mountPage(); // what a reload leaves: a fresh page, the same tab's sessionStorage
    await waitFor(() => byText('Upload'), 'chooser');
    await setFile(new File([photo], photo.name, { type: photo.type, lastModified: photo.lastModified }));
    await waitFor(() => document.querySelector('img[alt="preview"]'), 'image on the details page');
    const again = await postAndWait();
    assert(
      again.fields.client_upload_id === lost.fields.client_upload_id,
      `after the reload the post was sent as ${again.fields.client_upload_id}, first as ${lost.fields.client_upload_id}`
    );
  });

  await test('the chosen category is sent with the post', async () => {
    mountPage();
    await waitFor(() => byText('Upload'), 'chooser');
    await setFile(pngFile);
    await waitFor(() => document.querySelector('img[alt="preview"]'), 'image on the details page');
    const comedy = await waitFor(() => all('button').find((b) => b.textContent.trim() === 'Comedy'), 'the category list');
    click(comedy, 'Comedy');
    await waitFor(() => comedy.getAttribute('aria-pressed') === 'true', 'Comedy to be selected');
    const upload = await postAndWait();
    assert(upload.fields.category === '7', `category sent as ${JSON.stringify(upload.fields.category)}`);
    return 'category=7 (Comedy)';
  });

  // 3. Failures -----------------------------------------------------------
  await test('camera refused: one prompt, the required message, and a retry', async () => {
    useCamera(() => 'NotAllowedError');
    try {
      mountPage();
      click(await waitFor(() => byText('Record a video'), 'chooser'), 'Record a video');
      await waitFor(() => /Camera access is required to record a video\./.test(pageText()), 'permission message');
      assert(gumCalls.length === 2, `asked ${gumCalls.length} times, expected 2 (camera+mic, then camera)`);
      click(byText('Try again'), 'Try again');
      await waitFor(() => gumCalls.length === 4 && /Camera access is required/.test(pageText()), 'retry to ask once more');
      assert(!/NotAllowedError|stubbed/.test(pageText()), 'raw exception shown');
      click(byText('Close camera'), 'Close camera');
      await waitFor(() => /What will you/.test(pageText()), 'back on the chooser');
    } finally {
      useCamera();
    }
  });

  await test('microphone refused: records without sound and says so', async () => {
    useCamera((c) => (c.audio ? 'NotAllowedError' : null));
    try {
      mountPage();
      await openCameraFromChooser();
      await waitFor(() => /Microphone access is off/.test(pageText()), 'microphone notice');
      const url = await record(1500);
      const v = await inspectVideo(url);
      assert(v.duration > 1, 'no recording');
    } finally {
      useCamera();
    }
  });

  await test('no camera: says so and offers the gallery', async () => {
    useCamera((c) => (c.video ? 'NotFoundError' : null));
    try {
      mountPage();
      click(await waitFor(() => byText('Record a video'), 'chooser'), 'Record a video');
      await waitFor(() => /No camera found/.test(pageText()), 'no-camera message');
      assert(byText('Upload from gallery'), 'no gallery option');
    } finally {
      useCamera();
    }
  });

  await test('camera busy: says so and retries once after a pause', async () => {
    useCamera((c) => (c.video ? 'NotReadableError' : null));
    try {
      mountPage();
      click(await waitFor(() => byText('Record a video'), 'chooser'), 'Record a video');
      await waitFor(() => /Camera is in use/.test(pageText()), 'camera-busy message');
      assert(gumCalls.length === 3, `asked ${gumCalls.length} times, expected 3`);
    } finally {
      useCamera();
    }
  });

  await test('unsupported browser: says so instead of breaking', async () => {
    md.getUserMedia = undefined;
    try {
      mountPage();
      click(await waitFor(() => byText('Record a video'), 'chooser'), 'Record a video');
      await waitFor(() => /Camera isn't supported here/.test(pageText()), 'unsupported message');
      assert(!byText('Try again'), 'offers a retry that cannot work');
    } finally {
      useCamera();
    }
  });

  await test('no MediaRecorder: recording says so, the camera still works', async () => {
    const MR = window.MediaRecorder;
    try {
      mountPage();
      await openCameraFromChooser();
      window.MediaRecorder = undefined;
      click(byLabel('Start recording'), 'Start recording');
      await waitFor(() => /Video recording isn't supported in this browser/.test(pageText()), 'unsupported recording message');
    } finally {
      window.MediaRecorder = MR;
    }
  });

  await test('closing the camera mid-recording drops the take', async () => {
    mountPage();
    await openCameraFromChooser();
    await sleep(600);
    click(byLabel('Start recording'), 'Start recording');
    await waitFor(() => byLabel('Stop recording'), 'recording to start');
    await sleep(1200);
    click(byLabel('Cancel recording and close camera'), 'close');
    await waitFor(() => /What will you/.test(pageText()), 'back on the chooser');
    await sleep(800);
    assert(!document.querySelector('section[aria-label="Review your video"]'), 'the cancelled take was kept');
    assert(!/Recording problem/.test(pageText()), 'cancelling showed an error');
  });

  // Chromium's own fake camera, through the real getUserMedia: the synthetic
  // camera above proves the page; this proves nothing between it and a real
  // capture device was stubbed away. Colour checks stay on the synthetic one.
  await test("Chromium's capture device records through the same path", async () => {
    delete md.getUserMedia;
    try {
      mountPage();
      click(await waitFor(() => byText('Record a video'), 'chooser'), 'Record a video');
      try {
        await waitForCameraReady();
      } catch (e) {
        // Chromium's fake device misbehaves on some runs (seen on Windows
        // headless) in two ways: it opens and never delivers a frame, or it
        // reports that no camera exists. Either is the test machine, not the
        // page. Any other camera error is still a failure.
        const video = document.querySelector('#root video');
        const cvs = previewCanvas();
        const alertEl = document.querySelector('#root [role="alert"]');
        const alertText = alertEl ? alertEl.innerText.replace(/\s+/g, ' ') : '';
        const track = video && video.srcObject && video.srcObject.getVideoTracks()[0];
        const state = `readyState=${video && video.readyState} videoWidth=${video && video.videoWidth} ` +
          `track=${track ? `${track.readyState}${track.muted ? ',muted' : ''}` : 'none'} canvas=${cvs && cvs.width}`;
        if (!alertEl && (!cvs || cvs.width <= 2)) {
          throw new Skip(`Chromium's fake capture device delivered no frames on this run (${state})`);
        }
        if (/No camera found/.test(alertText)) {
          throw new Skip(`Chromium's fake capture device was not found on this run (${state})`);
        }
        throw new Error(`${e.message}; ${state}; alert: ${alertText}`);
      }
      const url = await record(1500);
      const v = await inspectVideo(url);
      assert(v.duration > 1, 'no recording');
      return `${v.width}x${v.height}`;
    } finally {
      useCamera();
    }
  });

  await test('no uncaught errors from the page', async () => {
    assert(!pageErrors.length, pageErrors.join('\n'));
  });

  if (root) root.unmount();
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
}

run().catch(async (e) => {
  results.push({ name: 'harness', ok: false, detail: String((e && e.stack) || e) });
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
});
