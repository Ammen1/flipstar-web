/**
 * The app's one upload tracker (utils/uploadTracker.js), wired to the API,
 * localStorage, the other tabs and sign-out.
 *
 * When an upload in progress becomes READY the full post is announced as a
 * `flipstar:post-ready` window event (the home feed puts it in place) and the
 * cached /reels lists are dropped, so every page that loads next sees it.
 */
import api from '../api';
import { createUploadTracker } from '../utils/uploadTracker';

function browserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // storage blocked: tracking still works for this page
  }
}

export const uploadTracker = createUploadTracker({
  fetchStatuses: async (ids) => {
    const data = await api.request(`/posts/processing/?ids=${ids.join(',')}`, { skipCache: true });
    return Array.isArray(data?.posts) ? data.posts : [];
  },
  fetchPost: (id) => api.request(`/reels/${id}/`, { skipCache: true }),
  storage: browserStorage(),
  locks: typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null,
  listenStorage: typeof window !== 'undefined'
    ? (cb) => window.addEventListener('storage', (e) => cb(e.key))
    : null,
  onReady: (post) => {
    api.invalidateCache?.('/reels');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('flipstar:post-ready', { detail: post }));
    }
  },
});

/** Uploads processing on the server that this browser lost track of --
 * storage cleared, or made on another device. One request, at app start. */
export async function rediscoverUploads() {
  if (!api.hasToken()) return;
  try {
    const data = await api.request('/posts/processing/', { skipCache: true });
    uploadTracker.adopt(Array.isArray(data?.posts) ? data.posts : []);
  } catch {
    /* the list from storage is still followed */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('flipstar:signed-out', () => uploadTracker.clear());
}

// Anything left processing when the page was reloaded is followed again.
uploadTracker.resume();
