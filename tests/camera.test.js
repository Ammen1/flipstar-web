import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMERA_ERROR,
  CAMERA_PERMISSION_REQUIRED,
  MIC_NOTICE,
  cameraErrorCopy,
  classifyCameraError,
} from '../components/camera/cameraErrors.js';
import {
  CameraError,
  cameraPermissionState,
  openCamera,
  openVideoTrack,
  setTorch,
  torchAvailable,
} from '../components/camera/cameraSession.js';
import {
  MAX_VIDEO_BPS,
  MIME_CANDIDATES,
  extensionFor,
  pickMimeType,
  recorderOptions,
  recordingSupport,
  videoBitrateFor,
} from '../components/camera/recorder.js';
import { startFrameLoop } from '../components/camera/frameLoop.js';

// ─── fakes ──────────────────────────────────────────────────────────────────

const domError = (name) => Object.assign(new Error(`${name}: raw browser text`), { name });

const track = (kind, extra = {}) => ({ kind, stopped: false, stop() { this.stopped = true; }, ...extra });

const fakeStream = (tracks) => ({
  tracks,
  getTracks: () => tracks,
  getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
});

/**
 * getUserMedia that answers each request from `decide(constraints)`: a
 * DOMException name to reject with, or nothing to succeed.
 */
function fakeDevices(decide) {
  const calls = [];
  return {
    calls,
    getUserMedia: async (constraints) => {
      calls.push(constraints);
      const failure = decide(constraints, calls.length);
      if (failure) throw domError(failure);
      const tracks = [];
      if (constraints.video) tracks.push(track('video'));
      if (constraints.audio) tracks.push(track('audio'));
      return fakeStream(tracks);
    },
  };
}

const open = (devices, extra = {}) =>
  openCamera({ mediaDevices: devices, createStream: fakeStream, wait: async () => {}, ...extra });

// ─── camera errors ──────────────────────────────────────────────────────────

describe('camera error wording', () => {
  it('classifies browser errors by name', () => {
    assert.equal(classifyCameraError(domError('NotAllowedError')), CAMERA_ERROR.PERMISSION_DENIED);
    assert.equal(classifyCameraError(domError('NotFoundError')), CAMERA_ERROR.NO_CAMERA);
    assert.equal(classifyCameraError(domError('NotReadableError')), CAMERA_ERROR.CAMERA_BUSY);
    assert.equal(classifyCameraError(domError('Weird')), CAMERA_ERROR.UNKNOWN);
    assert.equal(classifyCameraError(new CameraError(CAMERA_ERROR.NO_CAMERA)), CAMERA_ERROR.NO_CAMERA);
  });

  it('says camera access is required when permission is refused', () => {
    const copy = cameraErrorCopy(CAMERA_ERROR.PERMISSION_DENIED);
    assert.ok(copy.message.startsWith(CAMERA_PERMISSION_REQUIRED));
    assert.equal(CAMERA_PERMISSION_REQUIRED, 'Camera access is required to record a video.');
    assert.equal(copy.canRetry, true);
    assert.match(cameraErrorCopy(CAMERA_ERROR.PERMISSION_DENIED, { permissionState: 'denied' }).message, /settings/);
  });

  it('never shows the browser exception text', () => {
    for (const kind of Object.values(CAMERA_ERROR)) {
      const { title, message } = cameraErrorCopy(kind);
      assert.ok(title && message, kind);
      assert.doesNotMatch(`${title} ${message}`, /Error|raw browser text|undefined/, kind);
    }
  });

  it('has a notice for a missing or refused microphone', () => {
    assert.match(MIC_NOTICE.denied, /without sound/);
    assert.match(MIC_NOTICE.unavailable, /without sound/);
  });
});

// ─── opening the camera ─────────────────────────────────────────────────────

describe('camera initialisation', () => {
  it('opens camera and microphone together when both are allowed', async () => {
    const devices = fakeDevices(() => null);
    const result = await open(devices, { facingMode: 'environment' });
    assert.equal(result.audio, 'on');
    assert.equal(result.facingFallback, false);
    assert.deepEqual(devices.calls, [{ video: { facingMode: 'environment' }, audio: true }]);
    assert.equal(result.stream.getAudioTracks().length, 1);
  });

  it('records without sound when only the microphone is refused', async () => {
    const devices = fakeDevices((c) => (c.audio ? 'NotAllowedError' : null));
    const result = await open(devices);
    assert.equal(result.audio, 'denied');
    assert.equal(result.stream.getVideoTracks().length, 1);
    // One prompt for both, then camera only -- the refused mic is not asked again.
    assert.equal(devices.calls.length, 2);
    assert.deepEqual(devices.calls[1], { video: { facingMode: 'user' }, audio: false });
  });

  it('stops after the camera is refused instead of prompting again', async () => {
    const devices = fakeDevices(() => 'NotAllowedError');
    await assert.rejects(open(devices), (e) => e.kind === CAMERA_ERROR.PERMISSION_DENIED);
    assert.equal(devices.calls.length, 2);
  });

  it('reports a missing microphone as unavailable, not refused', async () => {
    const devices = fakeDevices((c) => (c.audio ? 'NotFoundError' : null));
    const result = await open(devices);
    assert.equal(result.audio, 'unavailable');
  });

  it('keeps the microphone when the first failure was the camera being busy', async () => {
    const devices = fakeDevices((c, n) => (c.video && n <= 2 ? 'NotReadableError' : null));
    const result = await open(devices);
    assert.equal(result.audio, 'on');
    assert.equal(result.facingFallback, true);
    assert.equal(result.stream.getAudioTracks().length, 1);
    assert.equal(result.stream.getVideoTracks().length, 1);
  });

  it('falls back to any camera when the requested one does not exist', async () => {
    const devices = fakeDevices((c) => (c.video && c.video.facingMode ? 'OverconstrainedError' : null));
    const result = await open(devices, { facingMode: 'environment' });
    assert.equal(result.facingFallback, true);
    assert.deepEqual(devices.calls[2], { video: true, audio: false });
  });

  it('says no camera when there is none at all', async () => {
    const devices = fakeDevices((c) => (c.video ? 'NotFoundError' : null));
    await assert.rejects(open(devices), (e) => e.kind === CAMERA_ERROR.NO_CAMERA);
  });

  it('reports a busy camera after retrying once', async () => {
    const devices = fakeDevices((c) => (c.video ? 'NotReadableError' : null));
    await assert.rejects(open(devices), (e) => e.kind === CAMERA_ERROR.CAMERA_BUSY);
    assert.equal(devices.calls.length, 3);
  });

  it('reports an unsupported browser without calling anything', async () => {
    await assert.rejects(openCamera({ mediaDevices: null }), (e) => e.kind === CAMERA_ERROR.UNSUPPORTED);
    await assert.rejects(openCamera({ mediaDevices: {} }), (e) => e.kind === CAMERA_ERROR.UNSUPPORTED);
  });
});

describe('camera switching', () => {
  it('opens a video-only track for the other camera', async () => {
    const devices = fakeDevices(() => null);
    const t = await openVideoTrack({ facingMode: 'environment', mediaDevices: devices });
    assert.equal(t.kind, 'video');
    assert.deepEqual(devices.calls, [{ video: { facingMode: 'environment' }, audio: false }]);
  });

  it('classifies a failed switch', async () => {
    const devices = fakeDevices(() => 'NotReadableError');
    await assert.rejects(
      openVideoTrack({ facingMode: 'user', mediaDevices: devices }),
      (e) => e.kind === CAMERA_ERROR.CAMERA_BUSY
    );
  });
});

describe('flash', () => {
  it('is only offered when the track reports a torch', () => {
    assert.equal(torchAvailable(track('video', { getCapabilities: () => ({ torch: true }) })), true);
    assert.equal(torchAvailable(track('video', { getCapabilities: () => ({}) })), false);
    assert.equal(torchAvailable(track('video')), false, 'no getCapabilities (Safari)');
    assert.equal(torchAvailable(null), false);
  });

  it('switches the torch through applyConstraints', async () => {
    let applied;
    await setTorch({ applyConstraints: async (c) => { applied = c; } }, true);
    assert.deepEqual(applied, { advanced: [{ torch: true }] });
  });
});

describe('permission state', () => {
  it('reads the Permissions API and tolerates its absence', async () => {
    assert.equal(await cameraPermissionState({ query: async () => ({ state: 'denied' }) }), 'denied');
    assert.equal(await cameraPermissionState(null), 'unknown');
    assert.equal(await cameraPermissionState({ query: async () => { throw new TypeError('camera'); } }), 'unknown');
  });
});

// ─── recording ──────────────────────────────────────────────────────────────

describe('recorder choices', () => {
  it('picks the first supported container', () => {
    const supports = (list) => ({ isTypeSupported: (m) => list.includes(m) });
    assert.equal(pickMimeType(supports(MIME_CANDIDATES)), 'video/mp4');
    assert.equal(pickMimeType(supports(['video/webm'])), 'video/webm');
    assert.equal(pickMimeType(supports([])), '');
    assert.equal(pickMimeType(null), '');
  });

  it('scales the bitrate with the frame and never exceeds the old default', () => {
    assert.equal(videoBitrateFor(480, 640), 1382400);
    assert.equal(videoBitrateFor(720, 1280), MAX_VIDEO_BPS);
    assert.equal(videoBitrateFor(1080, 1920), MAX_VIDEO_BPS);
    assert.equal(videoBitrateFor(120, 160), 1000000);
    const opts = recorderOptions({ mimeType: 'video/webm', width: 480, height: 640 });
    assert.deepEqual(opts, { videoBitsPerSecond: 1382400, audioBitsPerSecond: 128000, mimeType: 'video/webm' });
    assert.equal('mimeType' in recorderOptions({ width: 480, height: 640 }), false);
  });

  it('names the file after the container', () => {
    assert.equal(extensionFor('video/mp4;codecs=avc1'), 'mp4');
    assert.equal(extensionFor('video/webm;codecs=vp8,opus'), 'webm');
    assert.equal(extensionFor(''), 'webm');
  });

  it('knows when filtered recording is impossible', () => {
    function MR() {}
    assert.deepEqual(recordingSupport({ captureStream() {} }, MR), { canRecord: true, canRecordFiltered: true });
    assert.deepEqual(recordingSupport({}, MR), { canRecord: true, canRecordFiltered: false });
    assert.deepEqual(recordingSupport({ captureStream() {} }, undefined), { canRecord: false, canRecordFiltered: false });
  });
});

// ─── frame loop ─────────────────────────────────────────────────────────────

function clockedEnv() {
  let t = 0;
  let nextId = 1;
  const rafs = new Map();
  return {
    env: {
      now: () => t,
      requestAnimationFrame: (cb) => { const id = nextId++; rafs.set(id, cb); return id; },
      cancelAnimationFrame: (id) => rafs.delete(id),
    },
    tick(ms) {
      t += ms;
      const due = [...rafs.entries()];
      rafs.clear();
      due.forEach(([, cb]) => cb());
    },
    pending: () => rafs.size,
  };
}

const fakeVideo = (withVfc) => {
  const v = { readyState: 4, videoWidth: 480, videoHeight: 640, vfc: null };
  if (withVfc) {
    v.requestVideoFrameCallback = (cb) => { v.vfc = cb; return 1; };
    v.cancelVideoFrameCallback = () => { v.vfc = null; };
  }
  return v;
};

describe('frame loop', () => {
  it('renders once per camera frame when requestVideoFrameCallback works', () => {
    const clock = clockedEnv();
    const video = fakeVideo(true);
    let frames = 0;
    const stop = startFrameLoop(video, () => frames++, clock.env);
    for (let i = 0; i < 4; i++) {
      const cb = video.vfc;
      cb();
      clock.tick(16);
      clock.tick(16);
    }
    // Four camera frames, eight display frames: four renders, not eight.
    assert.equal(frames, 4);
    stop();
  });

  it('falls back to the display clock when requestVideoFrameCallback goes quiet', () => {
    const clock = clockedEnv();
    const video = fakeVideo(true);
    let frames = 0;
    startFrameLoop(video, () => frames++, { ...clock.env, stallMs: 150 });
    clock.tick(200);
    clock.tick(34);
    assert.equal(frames, 2);
  });

  it('caps the fallback at about a camera\'s rate, whatever the display rate', () => {
    for (const hz of [60, 120]) {
      const clock = clockedEnv();
      let frames = 0;
      startFrameLoop(fakeVideo(false), () => frames++, clock.env);
      for (let i = 0; i < hz; i++) clock.tick(1000 / hz);
      assert.ok(frames >= 29 && frames <= 33, `${hz}Hz display: ${frames} renders in 1s`);
    }
  });

  it('skips frames until the camera has one to show', () => {
    const clock = clockedEnv();
    const video = { ...fakeVideo(false), readyState: 1 };
    let frames = 0;
    startFrameLoop(video, () => frames++, clock.env);
    clock.tick(16);
    assert.equal(frames, 0);
  });

  it('stops cleanly', () => {
    const clock = clockedEnv();
    const video = fakeVideo(true);
    let frames = 0;
    const stop = startFrameLoop(video, () => frames++, clock.env);
    stop();
    assert.equal(clock.pending(), 0);
    assert.equal(video.vfc, null);
    clock.tick(500);
    assert.equal(frames, 0);
  });
});
