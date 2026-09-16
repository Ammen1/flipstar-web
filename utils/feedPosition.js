// Where the user was in a feed, so returning from a single post puts them
// back there instead of at the top.
//
// The feeds already cache their posts; what was missing is the position. Home
// and Reels are separate routes from /post/:id, so opening a post unmounts the
// feed entirely: React state, scroll offset and any infinitely-scrolled pages
// go with it. On the way back the feed mounted fresh, refetched page one and
// snapped to the top -- the user landed on post 1 however deep they had been.
//
// sessionStorage, not localStorage: "where I was reading" belongs to this tab
// and this sitting. Restoring a day-old position in a new tab would be a
// surprise rather than a convenience, and two tabs open on the feed should not
// drag each other around.
//
// The anchor is the post id, with the pixel offset only as a fallback. Offsets
// lie as soon as anything above the anchor changes height -- an image finishes
// loading, a card measures differently on a narrower screen -- whereas the id
// still names the post the user was looking at.

const PREFIX = 'feed_position_';

/** How long a remembered position stays useful. Past this the user is coming
 *  back to a feed they have forgotten too, and the top is the honest answer. */
export const POSITION_TTL_MS = 30 * 60 * 1000;

/** sessionStorage, or null where it is unavailable (private mode, a browser
 *  that refuses storage, tests). Every caller below treats null as "no memory
 *  today", which degrades to the old behaviour rather than throwing. */
function sessionStore() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Remember where the user is in `feed` ('home' | 'reels').
 *
 * `postId` is the post at the top of the viewport (Home) or the one playing
 * (Reels). `offset` is the scroller's scrollTop, `page`/`count` describe how
 * much of the feed had been loaded, so the return does not start paginating
 * from zero again.
 */
export function rememberFeedPosition(feed, position, store = sessionStore()) {
  if (!feed || !store || !position) return false;
  const { postId = null, offset = 0, page = 0, count = 0 } = position;
  // A position with neither an anchor nor an offset says nothing; writing it
  // would only overwrite a good one -- which is exactly what happened when a
  // feed reset its scroll to zero on the way out.
  if (postId == null && !offset) return false;
  try {
    store.setItem(
      PREFIX + feed,
      JSON.stringify({
        ts: Date.now(),
        postId: postId == null ? null : String(postId),
        offset: Math.max(0, Math.round(offset)),
        page,
        count,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The remembered position for `feed`, or null when there is none, it has
 * expired, or the stored value is unreadable.
 */
export function recallFeedPosition(feed, options = {}) {
  const { now = Date.now(), maxAge = POSITION_TTL_MS, store = sessionStore() } = options;
  if (!feed || !store) return null;
  let raw;
  try {
    raw = store.getItem(PREFIX + feed);
  } catch {
    return null;
  }
  if (!raw) return null;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    forgetFeedPosition(feed, store);
    return null;
  }
  if (!saved || typeof saved !== 'object') {
    forgetFeedPosition(feed, store);
    return null;
  }
  if (typeof saved.ts !== 'number' || now - saved.ts > maxAge) {
    forgetFeedPosition(feed, store);
    return null;
  }
  const postId = saved.postId == null ? null : String(saved.postId);
  const offset = Number(saved.offset) || 0;
  if (postId == null && !offset) return null;
  return {
    postId,
    offset,
    page: Number(saved.page) || 0,
    count: Number(saved.count) || 0,
    ts: saved.ts,
  };
}

/** Drop the memory: the user asked for the top (tab re-tap, pull to refresh). */
export function forgetFeedPosition(feed, store = sessionStore()) {
  if (!feed || !store) return;
  try {
    store.removeItem(PREFIX + feed);
  } catch {
    /* nothing to do: a storage that cannot delete cannot have stored either */
  }
}

/**
 * The id of the post nearest the top of `container`, from elements carrying
 * `[data-post-id]` (Home) or `[data-video-id]` (Reels).
 *
 * Reading the DOM rather than tracking indices in state keeps this honest
 * about what is actually on screen, whatever reordering, filtering or
 * deduplication the feed has done since it loaded.
 */
export function visiblePostId(container, attribute = 'data-post-id') {
  if (!container || typeof container.querySelectorAll !== 'function') return null;
  const top = container.getBoundingClientRect ? container.getBoundingClientRect().top : 0;
  let best = null;
  let bestDistance = Infinity;
  for (const el of container.querySelectorAll(`[${attribute}]`)) {
    const box = el.getBoundingClientRect();
    // The card straddling the top edge wins; below that, the nearest one down.
    const distance = Math.abs(box.top - top);
    if (box.bottom > top && distance < bestDistance) {
      bestDistance = distance;
      best = el.getAttribute(attribute);
    }
  }
  return best;
}

/**
 * Put `container` back where `position` says, preferring the anchor post.
 * Returns true when it landed somewhere; false when the anchor is not in the
 * DOM yet and there is no usable offset, so the caller can try again after the
 * next batch of posts arrives.
 */
export function applyFeedPosition(container, position, attribute = 'data-post-id') {
  if (!container || !position) return false;
  const { postId, offset } = position;
  const scrollable = container.scrollHeight > container.clientHeight + 8;
  if (postId != null && typeof container.querySelector === 'function') {
    const anchor = container.querySelector(`[${attribute}="${CSS_escape(postId)}"]`);
    if (anchor) {
      // offsetTop is relative to the scroller when it is the offset parent;
      // measuring both rects instead works whatever the layout does.
      const top = () =>
        anchor.getBoundingClientRect().top -
        (container.getBoundingClientRect ? container.getBoundingClientRect().top : 0);
      container.scrollTop += top();
      // Only when it actually landed. A feed whose images have not loaded is
      // shorter than it will be, so the browser clamps the scroll and the
      // anchor stays where it was -- claiming success there is how a restore
      // silently becomes "back at the top".
      return scrollable && Math.abs(top()) < 4;
    }
  }
  if (offset > 0) {
    container.scrollTop = offset;
    return Math.abs(container.scrollTop - offset) < 4;
  }
  // Offset 0 with the anchor missing: nothing to do, and nothing to wait for.
  return postId == null;
}

/**
 * Put `container` back where `position` says, and keep correcting until it
 * sticks: the feed grows under the restore as images and videos load, which
 * moves the anchor after the first attempt.
 *
 * Calls `onDone(landed)` once, and returns a cancel function for the caller's
 * effect cleanup.
 */
export function restoreFeedPosition(container, position, options = {}) {
  const {
    attribute = 'data-post-id',
    deadlineMs = 1500,
    onDone,
    raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null,
    now = () => Date.now(),
  } = options;
  let cancelled = false;
  const started = now();

  const attempt = () => {
    if (cancelled) return;
    const landed = applyFeedPosition(container, position, attribute);
    if (landed || now() - started > deadlineMs || !raf) {
      cancelled = true;
      if (onDone) onDone(landed);
      return;
    }
    raf(attempt);
  };
  attempt();

  return () => {
    cancelled = true;
  };
}

/** CSS.escape where the browser has it; ids here are numeric, so the fallback
 *  only has to survive the characters an id could plausibly contain. */
function CSS_escape(value) {
  const text = String(value);
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replace(/["\\]/g, '\\$&');
}
