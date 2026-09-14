import { earliestExpiry } from './signedUrl.js';
import { isVideoPost } from './media.js';

/**
 * Keeping a post's media loadable: the client half of POST /posts/media/.
 *
 * A media URL can stop working while a page still shows it: on a private
 * bucket every URL is signed and runs out after an hour, and a post that is
 * edited or re-processed moves to new files while the old ones are removed.
 * Every player used to treat the first failed load as final -- the Reels card
 * hid its <video> for good and read "Video unavailable". Now a failed load
 * is reported, the server says why (and logs it), and the post's media comes
 * back signed now, less any rendition storage has lost:
 *
 *   freshen(post)      the post with the newest media the server has given
 *                      for it (every surface showing the post agrees)
 *   recover(post, {url, error, surface})
 *                      a load failed: report it and get something to load;
 *                      resolves {ok, reason, post}
 *   refresh(post)      fresh URLs without a failure -- they are about to run out
 *   refreshExpiring(posts, marginMs)
 *                      refresh() every post whose URLs run out within marginMs
 *
 * One POST carries everything asked within `batchMs` (20 posts at most);
 * concurrent failures of one post share one request; and a post is recovered
 * at most `maxAttempts` times per `attemptWindowMs`, so a file that is truly
 * broken ends in "unavailable" instead of a loop. Never an original: the
 * server does not hand one out, and nothing here builds a URL itself.
 */

export const MEDIA_FIELDS = [
  'media',
  'media_variants',
  'image',
  'image_variants',
  'image_webp_variants',
  'thumbnail',
  'blurhash',
  'duration',
  'media_type',
  'processing_status',
  'processing_progress',
  'processing_error',
];

const MAX_IDS = 20;
const MAX_FAILURES = 5;

/** A post's id and media fields: what freshen/recover need, small enough to
 * keep alongside a formatted feed item. */
export function mediaFieldsOf(post) {
  if (!post) return null;
  const out = { id: post.id };
  for (const field of MEDIA_FIELDS) {
    if (post[field] !== undefined) out[field] = post[field];
  }
  return out;
}

function hasSomethingToLoad(post) {
  if (isVideoPost(post)) return Boolean(post.media);
  return Boolean(post.image || post.media);
}

export function createMediaRecovery({
  request,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  batchMs = 30,
  maxAttempts = 2,
  attemptWindowMs = 10 * 60 * 1000,
} = {}) {
  const overrides = new Map(); // id -> { media, check, at }
  const listeners = new Set();
  const attempts = new Map(); // id -> [ms]
  const recovering = new Map(); // id -> Promise<result>
  let queue = new Map(); // id -> { failure, waiters }
  let timer = null;
  let version = 0;

  function notify() {
    version += 1;
    listeners.forEach((fn) => {
      try { fn(); } catch { /* a listener's own problem */ }
    });
  }

  function freshen(post) {
    if (!post || post.id === undefined || post.id === null) return post;
    const override = overrides.get(String(post.id));
    if (!override) return post;
    // The post may since have come back from the feed with newer media (an
    // edit, a later page): a signature's expiry says which set was issued
    // later, and the later one wins.
    const own = earliestExpiry(mediaFieldsOf(post));
    const theirs = earliestExpiry(override.media);
    if (own !== null && theirs !== null && own > theirs) return post;
    return { ...post, ...override.media };
  }

  function flush() {
    timer = null;
    const batch = queue;
    queue = new Map();
    const ids = [...batch.keys()];
    const now_ = ids.slice(0, MAX_IDS);
    // More than one request's worth: the rest go in the next one.
    for (const id of ids.slice(MAX_IDS)) queue.set(id, batch.get(id));
    if (queue.size && !timer) timer = setTimer(flush, batchMs);

    const failures = now_
      .map((id) => batch.get(id).failure)
      .filter(Boolean)
      .slice(0, MAX_FAILURES);
    Promise.resolve()
      .then(() => request({ ids: now_.map(Number), failures }))
      .then((data) => {
        const rows = new Map((data?.posts || []).map((row) => [String(row.id), row]));
        let changed = false;
        for (const id of now_) {
          const row = rows.get(id) || null;
          if (row) {
            overrides.set(id, { media: mediaFieldsOf(row), check: row.media_check || null, at: now() });
            changed = true;
          }
          batch.get(id).waiters.forEach((resolve) => resolve(row));
        }
        if (changed) notify();
      })
      .catch(() => {
        // Offline or a server error: nothing learned, nothing changed.
        for (const id of now_) batch.get(id).waiters.forEach((resolve) => resolve(undefined));
      });
  }

  function ask(id, failure) {
    return new Promise((resolve) => {
      const key = String(id);
      const entry = queue.get(key) || { failure: null, waiters: [] };
      if (failure && !entry.failure) entry.failure = failure;
      entry.waiters.push(resolve);
      queue.set(key, entry);
      if (!timer) timer = setTimer(flush, batchMs);
    });
  }

  function recover(post, { url = '', error = '', surface = '' } = {}) {
    if (!post || post.id === undefined || post.id === null) {
      return Promise.resolve({ ok: false, reason: 'no_post' });
    }
    const id = String(post.id);
    const inFlight = recovering.get(id);
    if (inFlight) return inFlight.then((r) => (r.ok ? { ...r, post: freshen(post) } : r));

    const t = now();
    const recent = (attempts.get(id) || []).filter((at) => t - at < attemptWindowMs);
    if (recent.length >= maxAttempts) {
      return Promise.resolve({ ok: false, reason: overrides.get(id)?.check?.reason || 'gave_up' });
    }
    recent.push(t);
    attempts.set(id, recent);

    const failure = {
      id: Number(id),
      url: String(url || '').slice(0, 2048),
      error: String(error ?? ''),
      surface: String(surface || ''),
    };
    const pending = ask(id, failure).then((row) => {
      recovering.delete(id);
      if (row === undefined) return { ok: false, reason: 'network' };
      if (row === null) return { ok: false, reason: 'gone' };
      const reason = row.media_check?.reason || null;
      if (row.processing_status && row.processing_status !== 'READY') {
        return { ok: false, reason: row.processing_status === 'FAILED' ? 'failed' : 'processing' };
      }
      const fresh = freshen(post);
      if (!hasSomethingToLoad(fresh)) return { ok: false, reason: reason || 'unavailable' };
      return { ok: true, reason, post: fresh };
    });
    recovering.set(id, pending);
    return pending;
  }

  function refresh(post) {
    if (!post || post.id === undefined || post.id === null) return Promise.resolve(null);
    return ask(post.id, null);
  }

  function refreshExpiring(posts, marginMs = 2 * 60 * 1000) {
    const t = now();
    let asked = 0;
    for (const post of posts || []) {
      if (!post || post.id === undefined || post.id === null) continue;
      const at = earliestExpiry(freshen(post));
      if (at !== null && at - t <= marginMs) {
        refresh(post);
        asked += 1;
      }
    }
    return asked;
  }

  return {
    freshen,
    recover,
    refresh,
    refreshExpiring,
    /** The server's last word on a post's media ({reason, repairing}), if any. */
    checkOf: (id) => overrides.get(String(id))?.check || null,
    /** A post's entry, the same object until it changes: a snapshot for
     * useSyncExternalStore that re-renders only that post's players. */
    overrideOf: (id) => (id === undefined || id === null ? null : overrides.get(String(id)) || null),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getVersion: () => version,
    /** Sign-out: another account's view of media is not this one's. */
    forget() {
      overrides.clear();
      attempts.clear();
      notify();
    },
  };
}

/**
 * The URL in `post` for the same file as `url` -- the same object, signed
 * anew -- or '' when the post no longer has that file (edited, re-processed,
 * or the rendition lost). Keeps a player on the rung it chose.
 */
export function sameRendition(post, url) {
  if (!post || typeof url !== 'string' || !url) return '';
  const path = url.split('?')[0];
  const candidates = [
    post.media,
    ...Object.values(post.media_variants || {}),
    post.image,
    ...Object.values(post.image_variants || {}),
    ...Object.values(post.image_webp_variants || {}),
  ];
  return candidates.find((u) => typeof u === 'string' && u.split('?')[0] === path) || '';
}

/**
 * Remember, on the element, whether someone wants it playing: true from a
 * `play` event, false from `ended` or a real `pause`. A src change resets
 * `paused` without a pause event, and a failed load pauses with `error` set
 * (Chrome) -- neither is anyone deciding to stop, so neither clears it. This
 * is what says, once new URLs are in, whether to play again.
 */
export function trackPlayIntent(video) {
  if (!video || video.__playIntent !== undefined) return;
  video.__playIntent = !video.paused;
  video.addEventListener('play', () => { video.__playIntent = true; });
  video.addEventListener('pause', () => { if (!video.error) video.__playIntent = false; });
  video.addEventListener('ended', () => { video.__playIntent = false; });
}

/** Play `video` again if someone wanted it playing and a src swap stopped it. */
export function replayIfWanted(video) {
  if (video && video.isConnected && video.__playIntent && video.paused) {
    video.play().catch(() => { /* autoplay policy */ });
  }
}

/** What a failed <video> or <img> was loading, for the report. `playing`:
 * play() had been asked for -- a source error leaves `paused` false. */
export function failedLoad(event) {
  const el = event?.currentTarget || event?.target || null;
  if (!el) return { url: '', src: '', error: '', element: null, time: 0, playing: false };
  const src = (el.getAttribute && el.getAttribute('src')) || '';
  const url = el.currentSrc || src;
  const error = el.error?.code ?? (el.tagName === 'IMG' ? 'img' : '');
  const playing = el.tagName === 'VIDEO' && (!el.paused || el.__playIntent === true);
  return { url, src, error, element: el, time: el.currentTime || 0, playing };
}

/**
 * After recovery: carry on where playback stopped. A changed src starts a
 * new load by itself; an unchanged one (the URL was fine all along) is
 * loaded again. A clip that was playing plays again once it can.
 */
export function resumeAfterRecovery(element, time = 0, playing = false, failedUrl = '') {
  if (!element || element.tagName !== 'VIDEO') return;
  if (time > 0) {
    element.addEventListener(
      'loadedmetadata',
      () => {
        try { element.currentTime = time; } catch { /* not seekable yet */ }
      },
      { once: true }
    );
  }
  // Wait for the new src to be in place -- React commits it on its own
  // schedule, and acting before would replay the dead URL, then have the
  // real change reset `paused` behind us. An unchanged src (the URL was fine
  // all along) is loaded again after a short wait. play() itself starts the
  // load, which a preload="none" player needs.
  let waited = 0;
  const attempt = () => {
    if (!element.isConnected) return;
    const src = element.getAttribute('src') || '';
    if (failedUrl && src === failedUrl && waited < 20) {
      waited += 1;
      setTimeout(attempt, 16);
      return;
    }
    if (element.error) {
      try { element.load(); } catch { /* detached */ }
    }
    if (playing && element.paused) element.play().catch(() => { /* autoplay policy */ });
  };
  setTimeout(attempt, 0);
}
