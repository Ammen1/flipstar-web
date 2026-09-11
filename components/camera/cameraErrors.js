/**
 * What to tell a person when the camera or the recorder fails.
 *
 * Browser exceptions ("NotReadableError: Could not start video source") are
 * logged for us and never shown: every failure is mapped to a kind, and each
 * kind has fixed, plain wording and says what the person can do next.
 */

export const CAMERA_ERROR = Object.freeze({
  PERMISSION_DENIED: 'permission-denied',
  NO_CAMERA: 'no-camera',
  CAMERA_BUSY: 'camera-busy',
  UNSUPPORTED: 'unsupported',
  UNKNOWN: 'unknown',
});

const BY_NAME = {
  NotAllowedError: CAMERA_ERROR.PERMISSION_DENIED,
  PermissionDeniedError: CAMERA_ERROR.PERMISSION_DENIED,
  // Also raised for insecure (http) pages, where the fix is the same from the
  // user's side: this page cannot use the camera.
  SecurityError: CAMERA_ERROR.PERMISSION_DENIED,
  NotFoundError: CAMERA_ERROR.NO_CAMERA,
  DevicesNotFoundError: CAMERA_ERROR.NO_CAMERA,
  OverconstrainedError: CAMERA_ERROR.NO_CAMERA,
  ConstraintNotSatisfiedError: CAMERA_ERROR.NO_CAMERA,
  NotReadableError: CAMERA_ERROR.CAMERA_BUSY,
  TrackStartError: CAMERA_ERROR.CAMERA_BUSY,
  AbortError: CAMERA_ERROR.CAMERA_BUSY,
  NotSupportedError: CAMERA_ERROR.UNSUPPORTED,
  TypeError: CAMERA_ERROR.UNSUPPORTED,
};

export function classifyCameraError(error) {
  if (error && typeof error.kind === 'string') return error.kind;
  return (error && BY_NAME[error.name]) || CAMERA_ERROR.UNKNOWN;
}

export const CAMERA_PERMISSION_REQUIRED = 'Camera access is required to record a video.';

/**
 * Title, message and next steps for a camera failure.
 * `permissionState` is navigator.permissions' answer when the browser gives
 * one: 'denied' means the choice is remembered and a new prompt will not
 * appear, so the person has to change it in settings.
 */
export function cameraErrorCopy(kind, { permissionState } = {}) {
  switch (kind) {
    case CAMERA_ERROR.PERMISSION_DENIED:
      return {
        title: 'Allow camera access',
        message:
          permissionState === 'denied'
            ? `${CAMERA_PERMISSION_REQUIRED} It is turned off for this app — turn it on in your browser or phone settings, then tap Try again.`
            : `${CAMERA_PERMISSION_REQUIRED} Tap Try again and choose Allow when asked.`,
        canRetry: true,
        suggestUpload: true,
      };
    case CAMERA_ERROR.NO_CAMERA:
      return {
        title: 'No camera found',
        message: "We couldn't find a camera on this device. You can still upload a photo or video.",
        canRetry: true,
        suggestUpload: true,
      };
    case CAMERA_ERROR.CAMERA_BUSY:
      return {
        title: 'Camera is in use',
        message: 'Another app may be using the camera. Close it, then tap Try again.',
        canRetry: true,
        suggestUpload: true,
      };
    case CAMERA_ERROR.UNSUPPORTED:
      return {
        title: "Camera isn't supported here",
        message: "This browser can't open the camera. You can still upload a photo or video from your gallery.",
        canRetry: false,
        suggestUpload: true,
      };
    default:
      return {
        title: "Camera didn't start",
        message: 'Something went wrong while starting the camera. Please try again.',
        canRetry: true,
        suggestUpload: true,
      };
  }
}

export const MIC_NOTICE = Object.freeze({
  denied: 'Microphone access is off, so videos will record without sound.',
  unavailable: 'No microphone was found, so videos will record without sound.',
});

export const RECORDING_ERROR = Object.freeze({
  UNSUPPORTED: "Video recording isn't supported in this browser. You can take a photo or upload a video instead.",
  FILTERS_UNSUPPORTED: "This device can't record with filters. Choose Normal to record, or upload a video instead.",
  FAILED: 'Recording stopped unexpectedly. Please try again.',
  EMPTY: 'The recording came out empty. Please try again.',
  INTERRUPTED: 'Recording stopped because the camera preview was interrupted. What you recorded so far has been kept.',
  SWITCH_FAILED: "Couldn't switch camera. Please try again.",
  FLASH_FAILED: "Couldn't turn on the flash.",
});
