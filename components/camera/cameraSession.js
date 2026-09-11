/**
 * Opening the camera without nagging.
 *
 * The old code tried four constraint sets in a row whatever the error was, so
 * a person who pressed "Block" could be asked up to four times. Now each
 * failure decides the next step:
 *
 *   1. camera + microphone              -- the normal case
 *   2. camera only                      -- tells a refused/missing microphone
 *                                          apart from a refused camera
 *   3. any camera, no facing preference -- only for "not found / busy", never
 *                                          after the camera was refused
 *
 * A refused camera ends it at step 2: that is one prompt, and asking again
 * would only repeat the answer. A camera that comes up without a microphone is
 * still a working camera -- the caller records silent video and says so.
 *
 * Everything browser-specific is injected, so the tests drive it with fakes.
 */

import { CAMERA_ERROR, classifyCameraError } from './cameraErrors.js';

export class CameraError extends Error {
  constructor(kind, cause) {
    super(`camera: ${kind}`);
    this.name = 'CameraError';
    this.kind = kind;
    this.cause = cause;
  }
}

const defaultMediaDevices = () =>
  typeof navigator !== 'undefined' && navigator.mediaDevices ? navigator.mediaDevices : null;

const defaultCreateStream = (tracks) => new MediaStream(tracks);

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns `{ stream, audio, facingFallback }`:
 *   audio          'on' | 'denied' | 'unavailable'
 *   facingFallback true when the requested camera (front/back) was not
 *                  available and another one was opened instead
 * Throws CameraError.
 */
export async function openCamera({
  facingMode = 'user',
  mediaDevices = defaultMediaDevices(),
  createStream = defaultCreateStream,
  wait = pause,
  log = () => {},
} = {}) {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw new CameraError(CAMERA_ERROR.UNSUPPORTED);
  }
  const request = async (constraints, label) => {
    try {
      return await mediaDevices.getUserMedia(constraints);
    } catch (error) {
      log(`${label} failed: ${error && error.name}`);
      throw error;
    }
  };
  const video = { facingMode };

  let micError;
  try {
    return { stream: await request({ video, audio: true }, 'camera+mic'), audio: 'on', facingFallback: false };
  } catch (error) {
    micError = error;
  }

  const finish = async (stream, facingFallback) => {
    // A refused microphone was a decision: asking for it again straight away
    // would be a second prompt for the same thing.
    if (classifyCameraError(micError) === CAMERA_ERROR.PERMISSION_DENIED) {
      return { stream, audio: 'denied', facingFallback };
    }
    // Otherwise the first request may have failed on the camera side (busy,
    // no such facing mode). Permission is already settled either way, so this
    // does not prompt; it just picks the microphone up if there is one.
    try {
      const mic = await request({ audio: true, video: false }, 'mic');
      return {
        stream: createStream([...stream.getVideoTracks(), ...mic.getAudioTracks()]),
        audio: 'on',
        facingFallback,
      };
    } catch (error) {
      const refused = classifyCameraError(error) === CAMERA_ERROR.PERMISSION_DENIED;
      return { stream, audio: refused ? 'denied' : 'unavailable', facingFallback };
    }
  };

  let cameraError;
  try {
    return await finish(await request({ video, audio: false }, 'camera'), false);
  } catch (error) {
    cameraError = error;
  }

  const kind = classifyCameraError(cameraError);
  if (kind === CAMERA_ERROR.PERMISSION_DENIED || kind === CAMERA_ERROR.UNSUPPORTED) {
    throw new CameraError(kind, cameraError);
  }
  // Busy cameras are often released a moment later, when the previous track
  // finishes stopping.
  if (kind === CAMERA_ERROR.CAMERA_BUSY) await wait(300);

  let anyCamera;
  try {
    anyCamera = await request({ video: true, audio: false }, 'any camera');
  } catch (error) {
    throw new CameraError(classifyCameraError(error), error);
  }
  return finish(anyCamera, true);
}

/**
 * A video-only track for `facingMode` -- used to switch cameras while keeping
 * the microphone (and so a recording in progress) running.
 */
export async function openVideoTrack({ facingMode, mediaDevices = defaultMediaDevices() } = {}) {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw new CameraError(CAMERA_ERROR.UNSUPPORTED);
  }
  try {
    const stream = await mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
    const [track] = stream.getVideoTracks();
    if (!track) throw new CameraError(CAMERA_ERROR.NO_CAMERA);
    return track;
  } catch (error) {
    if (error instanceof CameraError) throw error;
    throw new CameraError(classifyCameraError(error), error);
  }
}

/** Whether `track` can drive a torch (rear cameras on Android Chrome). */
export function torchAvailable(track) {
  try {
    const caps = track && typeof track.getCapabilities === 'function' ? track.getCapabilities() : null;
    return !!(caps && caps.torch);
  } catch (_) {
    return false;
  }
}

export function setTorch(track, on) {
  return track.applyConstraints({ advanced: [{ torch: !!on }] });
}

/**
 * 'granted' | 'denied' | 'prompt' | 'unknown'. Best effort: Safari and older
 * WebViews either lack the Permissions API or do not know 'camera'.
 */
export async function cameraPermissionState(
  permissions = typeof navigator !== 'undefined' ? navigator.permissions : null
) {
  try {
    if (!permissions || typeof permissions.query !== 'function') return 'unknown';
    const status = await permissions.query({ name: 'camera' });
    return status && status.state ? status.state : 'unknown';
  } catch (_) {
    return 'unknown';
  }
}
