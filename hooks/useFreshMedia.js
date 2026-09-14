import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  failedLoad,
  mediaRecovery,
  replayIfWanted,
  resumeAfterRecovery,
  trackPlayIntent,
} from '../services/mediaRecovery';
import { earliestExpiry, expiresWithin } from '../utils/signedUrl';

// Ask for new URLs this long before the current ones run out.
const REFRESH_AHEAD_MS = 2 * 60 * 1000;

/**
 * A post's media kept loadable, for a component that shows one post.
 *
 *   post          the post with the newest media the server has given
 *   onMediaError  for the <video>/<img> onError: reports the failure, loads
 *                 what comes back, resolves true when there is something to
 *                 try and false when there is not (unavailable is then set)
 *   unavailable   the post's media cannot be loaded; `reason` says why
 *
 * URLs that are signed are refreshed shortly before they run out, so a page
 * left open does not wait for a failed request to find out.
 */
export function useFreshMedia(post, surface) {
  const snapshot = useCallback(() => mediaRecovery.overrideOf(post?.id), [post?.id]);
  useSyncExternalStore(mediaRecovery.subscribe, snapshot, snapshot);
  const live = mediaRecovery.freshen(post);
  const [failure, setFailure] = useState({ id: null, reason: null });

  const expiry = earliestExpiry(live);
  useEffect(() => {
    if (!post?.id || expiry === null) return undefined;
    const wait = Math.max(0, expiry - Date.now() - REFRESH_AHEAD_MS);
    const timer = setTimeout(() => mediaRecovery.refresh(post), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, expiry]);

  const onMediaError = useCallback(
    async (event) => {
      if (!post) return false;
      const { url, src, error, element, time, playing } = failedLoad(event);
      const result = await mediaRecovery.recover(post, { url, error, surface });
      if (result.ok) {
        setFailure({ id: null, reason: null });
        resumeAfterRecovery(element, time, playing, src);
        return true;
      }
      setFailure({ id: post.id, reason: result.reason });
      return false;
    },
    [post, surface]
  );

  const unavailable = failure.id !== null && failure.id === post?.id;
  return { post: live, onMediaError, unavailable, reason: unavailable ? failure.reason : null };
}

/**
 * `src`, except while the element in `ref` is playing: a refreshed URL for
 * the same file would restart the clip, so the one playing stays until it
 * pauses, fails, or is about to run out (then a restart beats a 403).
 */
export function useSteadySrc(ref, src) {
  const held = useRef(src);
  const shown = useRef(src);
  const el = ref.current;
  const playing = Boolean(el && !el.paused && !el.ended && !el.error);
  if (held.current !== src && !(playing && held.current && !expiresWithin(held.current, 30 * 1000))) {
    held.current = src;
  }
  const chosen = held.current;
  // Swapping the file of a clip someone wants playing (its URL ran out, or
  // play was pressed just as fresh URLs arrived): the new load resets
  // `paused`, so play it again as soon as the new src is in the DOM --
  // otherwise the tap on play is simply lost.
  useLayoutEffect(() => {
    trackPlayIntent(ref.current);
    if (shown.current === chosen) return;
    shown.current = chosen;
    replayIfWanted(ref.current);
  });
  return chosen;
}
