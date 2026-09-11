/**
 * Watching a post the author just made until its media is ready.
 *
 * /posts/create/ answers as soon as the upload is stored; the post is
 * PROCESSING while the worker encodes it, usually for seconds, sometimes a
 * minute or two for a long video. The author's own views (the post page they
 * land on, their profile grid) show a placeholder meanwhile and swap in the
 * real media when it arrives -- this is what tells them when.
 *
 * Plain functions with the timer injected, so the schedule can be tested
 * without React or real time.
 */
import { mediaStatus } from './media.js';

// Quick at first -- most images and short clips finish within seconds --
// then steady, so a long encode costs a request every 15s, not every 3s.
export const POLL_DELAYS_MS = [3000, 5000, 8000, 13000];
export const POLL_STEADY_MS = 15000;
// Past this the worker has given up or been re-driven long since; a reload
// will show whatever the post became.
export const POLL_GIVE_UP_MS = 15 * 60 * 1000;

export function pollDelay(attempt) {
  return attempt < POLL_DELAYS_MS.length ? POLL_DELAYS_MS[attempt] : POLL_STEADY_MS;
}

/**
 * Poll each PROCESSING post until it is READY or FAILED.
 *
 *   ids       post ids to watch
 *   fetchPost (id) => Promise<post>, uncached
 *   onUpdate  (post) => void, once per post, when it stops processing
 *
 * A post that disappears (404: deleted meanwhile) is dropped silently; any
 * other error is retried on the next tick. Returns a function that stops
 * everything, including a request already in flight reporting back.
 */
export function watchProcessing(
  ids,
  { fetchPost, onUpdate, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now },
) {
  const pending = new Set(ids);
  const started = now();
  let attempt = 0;
  let timer = null;
  let stopped = false;

  const tick = async () => {
    timer = null;
    await Promise.all(
      [...pending].map(async (id) => {
        try {
          const post = await fetchPost(id);
          if (stopped || !post) return;
          if (mediaStatus(post) !== 'PROCESSING') {
            pending.delete(id);
            onUpdate(post);
          }
        } catch (err) {
          if (err?.status === 404) pending.delete(id);
        }
      }),
    );
    if (stopped || pending.size === 0 || now() - started >= POLL_GIVE_UP_MS) return;
    attempt += 1;
    timer = setTimer(tick, pollDelay(attempt));
  };

  if (pending.size) timer = setTimer(tick, pollDelay(0));
  return () => {
    stopped = true;
    if (timer) clearTimer(timer);
  };
}
