/**
 * The author's uploads that are still being processed, and the one poller
 * that watches them.
 *
 * After /posts/create/ accepts an upload the app goes straight to Home; the
 * worker encodes in the background and records its real progress on the post
 * (api/tasks/media.py _Progress). This keeps the list of those uploads and
 * asks GET /posts/processing/?ids=... about all of them in ONE request per
 * tick, for everything that wants to know:
 *
 *   the corner indicator     entries with show=true (uploads made here)
 *   pages holding posts      watch(ids, cb): the post page, profile grid,
 *                            campaign entries -- no page polls by itself
 *   other tabs               the list lives in localStorage, so a reload or a
 *                            second tab sees the same uploads; with Web Locks
 *                            only one tab polls, the others follow its writes
 *
 * When an upload is READY the full post is fetched once and handed to
 * onReady (the feeds put it in place), the indicator shows "Posted" briefly
 * and the entry goes. FAILED stays, with its code, until dismissed.
 *
 * Plain JavaScript with every dependency injected, so it runs under
 * `node --test`; services/uploadTracker.js wires it to the API and the page.
 */
import { mediaStatus } from './media.js';

export const STORE_KEY = 'flipstar.processingUploads.v1';
export const LOCK_NAME = 'flipstar-processing-poller';
/** How long "Posted" stays in the corner before the entry goes. */
export const READY_LINGER_MS = 2500;
/** An upload still processing after this is no longer followed here; the
 * server re-drives stuck posts, and the profile shows where it stands. */
export const MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Seconds between polls: brisk while an upload is new -- its bar is being
 * watched -- then easing off for the rare long one. */
export function pollInterval(ageMs) {
  if (ageMs < 3 * 60 * 1000) return 2000;
  if (ageMs < 20 * 60 * 1000) return 5000;
  return 15000;
}

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

function toEntry(raw) {
  if (!raw || raw.id == null) return null;
  return {
    id: raw.id,
    status: raw.status === 'READY' || raw.status === 'FAILED' ? raw.status : 'PROCESSING',
    progress: clampPercent(raw.progress),
    queued: Boolean(raw.queued),
    error: raw.error || null,
    errorMessage: raw.errorMessage || null,
    mediaType: raw.mediaType || null,
    show: Boolean(raw.show),
    thumb: typeof raw.thumb === 'string' && raw.thumb.startsWith('data:image/') ? raw.thumb : null,
    addedAt: Number(raw.addedAt) || 0,
    doneAt: raw.doneAt || null,
    post: raw.post && typeof raw.post === 'object' ? raw.post : null,
  };
}

export function createUploadTracker({
  fetchStatuses,
  fetchPost,
  storage = null,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
  locks = null,
  listenStorage = null,
  onReady = () => {},
} = {}) {
  let entries = load();
  const listeners = new Set();
  const watchers = new Map(); // id -> Set(callback), this tab only
  const lingering = new Map(); // id -> timer
  const removedHere = new Set(); // keys this tab dropped since it last saved
  let snapshot = visible();
  let timer = null;
  let running = false;
  let releaseLock = null;

  // ── state ────────────────────────────────────────────────────────────────

  function load() {
    try {
      const list = JSON.parse((storage && storage.getItem(STORE_KEY)) || '[]');
      return new Map((Array.isArray(list) ? list : []).map(toEntry).filter(Boolean).map((e) => [String(e.id), e]));
    } catch {
      return new Map();
    }
  }

  function forget(key) {
    if (entries.delete(key)) removedHere.add(key);
  }

  // Merged with what is stored, so an upload another tab tracked a moment ago
  // is not written over; only this tab's own removals take effect.
  function save() {
    if (!storage) return;
    try {
      for (const [key, theirs] of load()) {
        if (!entries.has(key) && !removedHere.has(key)) entries.set(key, theirs);
      }
      removedHere.clear();
      storage.setItem(STORE_KEY, JSON.stringify([...entries.values()]));
    } catch {
      /* full or blocked: this tab still tracks in memory */
    }
  }

  function visible() {
    return [...entries.values()].filter((e) => e.show).sort((a, b) => a.addedAt - b.addedAt);
  }

  function changed() {
    save();
    snapshot = visible();
    listeners.forEach((fn) => fn());
  }

  const pending = () => [...entries.values()].filter((e) => e.status === 'PROCESSING');

  function deliver(entry) {
    const payload = entry.status === 'READY'
      ? entry.post || { id: entry.id, processing_status: 'READY' }
      : {
          id: entry.id,
          processing_status: entry.status,
          processing_error: entry.error,
          processing_error_message: entry.errorMessage,
        };
    (watchers.get(String(entry.id)) || new Set()).forEach((cb) => {
      try { cb(payload); } catch { /* a page's handler must not stop the rest */ }
    });
    if (entry.status === 'READY') {
      try { onReady(payload); } catch { /* same */ }
    }
  }

  function settle(entry) {
    const key = String(entry.id);
    if (!entry.show) {
      if (!watchers.has(key)) forget(key);
      return;
    }
    if (lingering.has(key)) return;
    lingering.set(key, setTimer(() => {
      lingering.delete(key);
      const current = entries.get(key);
      if (current && current.status === 'READY') {
        forget(key);
        changed();
      }
    }, READY_LINGER_MS));
  }

  function expire() {
    const cutoff = now() - MAX_AGE_MS;
    for (const [key, e] of entries) {
      if (e.status === 'PROCESSING' && e.addedAt && e.addedAt < cutoff) forget(key);
    }
  }

  // ── polling ──────────────────────────────────────────────────────────────

  async function apply(rows, asked) {
    const byId = new Map((rows || []).map((row) => [String(row.id), row]));
    const finished = [];
    for (const key of asked) {
      const entry = entries.get(key);
      if (!entry) continue;
      const row = byId.get(key);
      if (!row) {
        // Deleted meanwhile, or not this user's: nothing left to follow.
        forget(key);
        continue;
      }
      const status = mediaStatus(row);
      entry.progress = clampPercent(row.processing_progress);
      entry.queued = Boolean(row.queued);
      entry.mediaType = row.media_type || entry.mediaType;
      if (status === 'READY') {
        let post = null;
        try { post = await fetchPost(entry.id); } catch { /* the id is enough */ }
        Object.assign(entry, { status: 'READY', progress: 100, post, doneAt: now() });
        finished.push(entry);
      } else if (status === 'FAILED') {
        Object.assign(entry, {
          status: 'FAILED',
          error: row.processing_error || null,
          errorMessage: row.processing_error_message || null,
          doneAt: now(),
        });
        finished.push(entry);
      }
    }
    finished.forEach(deliver);
    finished.filter((e) => e.status === 'READY').forEach(settle);
    changed();
  }

  async function tick() {
    timer = null;
    entries = mergeFromStorage();
    expire();
    const asked = pending().map((e) => String(e.id));
    if (asked.length) {
      try {
        const rows = await fetchStatuses(asked);
        await apply(rows, asked);
      } catch {
        /* offline or a server hiccup: ask again next time */
      }
    }
    const still = pending();
    if (!still.length || !running) {
      stop();
      return;
    }
    const youngest = Math.max(...still.map((e) => e.addedAt || now()));
    timer = setTimer(tick, pollInterval(now() - youngest));
  }

  function stop() {
    running = false;
    if (timer) clearTimer(timer);
    timer = null;
    if (releaseLock) {
      const release = releaseLock;
      releaseLock = null;
      release();
    }
  }

  /** Start this tab's poller if something is processing and none is running.
   * With Web Locks, one tab in the browser polls; the rest wait their turn
   * and follow its writes to localStorage. */
  function ensurePolling() {
    if (running || !pending().length) return;
    running = true;
    if (locks && typeof locks.request === 'function') {
      Promise.resolve(
        locks.request(LOCK_NAME, () => new Promise((resolve) => {
          releaseLock = resolve;
          tick();
        }))
      ).catch(() => { running = false; });
    } else {
      tick();
    }
  }

  // Entries written by another tab (its uploads, its poll results) merged with
  // ours; announces uploads that finished there to this tab's pages.
  function mergeFromStorage() {
    const stored = load();
    if (!storage) return entries;
    for (const [key, theirs] of stored) {
      const ours = entries.get(key);
      if (ours && ours.status === 'PROCESSING' && theirs.status !== 'PROCESSING') deliver(theirs);
      if (theirs.status === 'READY') settle(theirs);
    }
    return stored;
  }

  if (listenStorage) {
    listenStorage((key) => {
      if (key !== STORE_KEY) return;
      entries = mergeFromStorage();
      snapshot = visible();
      listeners.forEach((fn) => fn());
      ensurePolling();
    });
  }

  // A reload can land in the middle of a "Posted" linger: those still go.
  [...entries.values()].filter((e) => e.status === 'READY').forEach(settle);

  // ── the API ──────────────────────────────────────────────────────────────

  return {
    /** An upload the API accepted (the /posts/create/ response). */
    track(post, { thumb = null, show = true } = {}) {
      if (!post || post.id == null) return;
      const key = String(post.id);
      const existing = entries.get(key);
      const status = mediaStatus(post);
      const entry = toEntry({
        id: post.id,
        status,
        progress: status === 'READY' ? 100 : post.processing_progress,
        queued: status === 'PROCESSING',
        error: post.processing_error,
        errorMessage: post.processing_error_message || null,
        mediaType: post.media_type,
        show: show || (existing && existing.show),
        thumb: thumb || (existing && existing.thumb),
        addedAt: (existing && existing.addedAt) || now(),
        post: status === 'READY' ? post : null,
      });
      entries.set(key, entry);
      changed();
      if (status === 'READY') {
        deliver(entry);
        settle(entry);
      } else if (status === 'FAILED') {
        deliver(entry);
      }
      ensurePolling();
    },

    /** Uploads found on the server that this browser lost track of (storage
     * cleared, another device): shown like ones made here. */
    adopt(rows) {
      let added = false;
      for (const row of rows || []) {
        const key = String(row.id);
        if (entries.has(key) || mediaStatus(row) !== 'PROCESSING') continue;
        const created = Date.parse(row.created_at);
        entries.set(key, toEntry({
          id: row.id,
          status: 'PROCESSING',
          progress: row.processing_progress,
          queued: row.queued,
          mediaType: row.media_type,
          show: true,
          addedAt: Number.isFinite(created) ? created : now(),
        }));
        added = true;
      }
      if (added) {
        expire();
        changed();
        ensurePolling();
      }
    },

    /** Follow posts a page holds (no indicator); cb(post) once each is READY,
     * or cb({id, processing_status: 'FAILED', ...}). Returns an unwatch. */
    watch(ids, cb) {
      const keys = (ids || []).filter((id) => id != null).map(String);
      for (const key of keys) {
        if (!watchers.has(key)) watchers.set(key, new Set());
        watchers.get(key).add(cb);
        if (!entries.has(key)) {
          entries.set(key, toEntry({ id: Number.isNaN(Number(key)) ? key : Number(key), status: 'PROCESSING', addedAt: now() }));
        }
      }
      if (keys.length) {
        save();
        ensurePolling();
      }
      return () => {
        let removed = false;
        for (const key of keys) {
          const set = watchers.get(key);
          if (set) {
            set.delete(cb);
            if (!set.size) watchers.delete(key);
          }
          const entry = entries.get(key);
          if (entry && !entry.show && !watchers.has(key)) {
            forget(key);
            removed = true;
          }
        }
        if (removed) save();
      };
    },

    /** Take a finished or failed upload out of the corner. */
    dismiss(id) {
      const key = String(id);
      if (entries.has(key)) {
        forget(key);
        changed();
      }
    },

    /** Sign-out: forget everything. */
    clear() {
      [...entries.keys()].forEach(forget);
      lingering.forEach((t) => clearTimer(t));
      lingering.clear();
      stop();
      changed();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** The uploads the indicator shows; the same array until one changes. */
    getSnapshot: () => snapshot,

    /** Resume after a reload: anything still processing is polled again. */
    resume: ensurePolling,

    // For tests.
    _entries: () => [...entries.values()],
    _running: () => running,
  };
}
