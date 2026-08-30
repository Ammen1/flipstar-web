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
 */
export function isVideoPost(post) {
  if (!post) return false;
  return Boolean(post.media) && isVideoUrl(post.media);
}
