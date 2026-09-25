/**
 * Media type detection — one shared answer for "is this URL a video?".
 *
 * This used to be re-implemented at ten call sites with four different
 * behaviours. The important divergence: the feed matched `(\?|$)` after the
 * extension while the detail page anchored on `$`, so a media URL carrying a
 * query string (signed S3 links do) was a video in the feed and an image on
 * the page it navigated to — which rendered an <img> pointing at an mp4 and
 * left the viewer staring at a blank screen.
 *
 * Keep every caller on these helpers so the two can never disagree again.
 */

// Extensions seen across the codebase, unioned. The trailing group allows a
// query string or fragment, which signed URLs always carry.
const VIDEO_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv|3gp)(\?|#|$)/i;

// Path markers used by the media pipeline (Cloudinary-style `/video/upload/`,
// and the plain `/video/` segment older uploads use).
const VIDEO_PATH = /\/video\/|\/videos\//i;

/**
 * True only when the URL carries a video *file extension*.
 *
 * Distinct from `isVideoUrl` on purpose: the Cloudinary path fix-ups append
 * `.mp4` to `/video/upload/` URLs that lack an extension, so they must ask
 * about the extension alone — `isVideoUrl` would answer true on the path and
 * the extension would never be added.
 */
export function hasVideoExtension(url) {
  const s = typeof url === 'string' ? url : '';
  return s ? VIDEO_EXT.test(s) : false;
}

/** True when `url` points at a video. Accepts null/undefined safely. */
export function isVideoUrl(url) {
  const s = typeof url === 'string' ? url : '';
  if (!s) return false;
  return VIDEO_EXT.test(s) || VIDEO_PATH.test(s);
}

/**
 * True when the post's media is a video. Mirrors how callers pick a source:
 * `media` is the real upload, `image` is only ever a still.
 *
 * A post that is still processing has no `media` URL yet -- the original is
 * never served -- so its kind comes from `media_type` instead.
 */
export function isVideoPost(post) {
  if (!post) return false;
  if (post.media) return isVideoUrl(post.media);
  return post.media_type === 'video';
}

/**
 * Where a post's media is in the processing pipeline:
 *
 *   'READY'       encoded; `media` / `image` are what should be shown
 *   'PROCESSING'  uploaded, still being encoded -- nothing to play yet
 *   'FAILED'      could not be processed; `processing_error` says why
 *
 * Feeds only ever carry READY posts; the other two reach their author (their
 * own profile, a post they just made). A response without the field comes
 * from before the pipeline and is READY.
 */
export function mediaStatus(post) {
  const s = post?.processing_status;
  if (s === 'PROCESSING' || s === 'UPLOADING') return 'PROCESSING';
  if (s === 'FAILED') return 'FAILED';
  return 'READY';
}

/** True when the post has media that can be shown now. */
export function isMediaReady(post) {
  return mediaStatus(post) === 'READY';
}

/**
 * Pause every other <video> on the page. For pages where the viewer starts
 * playback themselves (controls) rather than a feed that picks the active
 * card: starting one video stops the rest, so two never play at once.
 */
export function pauseOtherVideos(playing, root = typeof document !== 'undefined' ? document : null) {
  if (!root) return;
  root.querySelectorAll('video').forEach((v) => {
    if (v !== playing && !v.paused) {
      try { v.pause(); } catch { /* detached */ }
    }
  });
}

// What `processing_error` codes mean, for the one person who sees them.
const FAILURE_TEXT = {
  invalid_media: "This file couldn't be read. Try exporting it again, or pick another.",
  video_too_long: 'This video is longer than allowed. Trim it and post again.',
  source_missing: "The upload didn't arrive completely. Please post it again.",
  long_video_unpaid: "You didn't have enough coins for a video this long.",
};

/** A sentence explaining a FAILED post to its author -- a reason they can act
 * on, never the exception behind it.
 *
 * The server's own sentence wins when it sent one. Some limits differ between
 * accounts -- a video may be refused at 60 seconds for one person and 120 for
 * another -- so the text has to come from whoever knows which applied. The map
 * above stays as the fallback for older servers and for codes that mean the
 * same thing to everybody. */
export function failureText(post) {
  return (
    post?.processing_error_message
    || FAILURE_TEXT[post?.processing_error]
    || 'Please try posting it again.'
  );
}

/**
 * How much room a post's media keeps while there is nothing to draw in it.
 *
 * Matches the "unavailable" and "no media" boxes, so every state where the
 * picture is absent is the same size and the card does not resize as it moves
 * between them.
 */
export const MEDIA_FRAME_MIN_HEIGHT = 260;

/**
 * Whether the media frame has to hold its own height.
 *
 * An <img> that has not loaded has no intrinsic size, so `width: 100%;
 * height: auto` computes to *zero* -- which is how a Home card came to show
 * nothing but the author's avatar and name with a caption underneath. The
 * reported bug was not a failure to load; it was the card collapsing while it
 * loaded, and again whenever the picture never came.
 *
 * Held for the whole time nothing is painted, and only released once real
 * media is on screen, so the frame then takes the media's natural shape
 * rather than a guessed one -- the feed does not know the dimensions (the API
 * sends none), and reserving an invented aspect ratio would crop or letterbox
 * every post that did not match it.
 */
export function holdsMediaFrame({ ready = true, source = '', failed = false, painted = false } = {}) {
  // Nothing is ever going to paint here: processing, failed, lost, or absent.
  if (!ready || failed || !source) return true;
  // Something will, but has not yet.
  return !painted;
}
