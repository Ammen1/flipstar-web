/**
 * An id for one submission of a post, sent as the `client_upload_id` form
 * field of /posts/create/.
 *
 * Mint one when the person first presses Post and keep it for every retry of
 * that same post. If an upload reached the server but the answer was lost --
 * a dropped connection, a timeout on a slow network, a second tap -- the
 * retry carries the same id and the API returns the post it already made
 * instead of creating (and charging for) a second one. A different post gets
 * a different id.
 *
 * The API accepts 8-64 characters of letters, digits and `_ . : -`; a UUID
 * and the fallbacks below all fit.
 */
export function newUploadId() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  // randomUUID needs a secure context; getRandomValues does not.
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* fall through */
    }
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// Ids of posts not yet confirmed, by file, for this tab (sessionStorage
// survives a reload of the tab but not closing it).
const STORE_KEY = 'flipstar.pendingUploadIds';
const PENDING_TTL_MS = 30 * 60 * 1000;

function defaultStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null; // storage blocked
  }
}

function fingerprint(file) {
  if (!file || typeof file.size !== 'number') return '';
  return [file.name || '', file.size, file.lastModified || 0, file.type || ''].join('|');
}

function readPending(storage) {
  try {
    const map = JSON.parse(storage.getItem(STORE_KEY) || '{}');
    return map && typeof map === 'object' ? map : {};
  } catch {
    return {};
  }
}

function writePending(storage, map) {
  try {
    storage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    /* full or blocked: the in-memory id still covers retries on this page */
  }
}

/**
 * The upload id for posting `file`, the same across a reload of the page.
 *
 * The case it exists for: Post is pressed, the upload reaches the server,
 * the answer is lost, and the person reloads and posts the same file from
 * their gallery again. With a fresh id that is a second post; with this one
 * the API returns the first. Kept for 30 minutes, and dropped as soon as the
 * post is confirmed (forgetUploadId), so posting the same photo again later
 * -- deliberately -- is a new post. A file without a usable identity (a
 * recording made on the page) just gets a new id.
 */
export function uploadIdFor(file, { storage = defaultStorage(), now = Date.now() } = {}) {
  const key = fingerprint(file);
  if (!key || !storage) return newUploadId();
  const pending = readPending(storage);
  for (const [k, entry] of Object.entries(pending)) {
    if (!entry || typeof entry.id !== 'string' || now - entry.at > PENDING_TTL_MS) delete pending[k];
  }
  const entry = pending[key] || { id: newUploadId(), at: now };
  pending[key] = entry;
  writePending(storage, pending);
  return entry.id;
}

/** The post for `file` is confirmed: a later post of it is a new one. */
export function forgetUploadId(file, { storage = defaultStorage() } = {}) {
  const key = fingerprint(file);
  if (!key || !storage) return;
  const pending = readPending(storage);
  if (key in pending) {
    delete pending[key];
    writePending(storage, pending);
  }
}
