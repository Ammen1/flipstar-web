import { useEffect, useRef } from 'react';
import api from '../api';
import { mediaStatus } from '../utils/media';
import { watchProcessing } from '../utils/processingPoll';

/**
 * Keep `posts` that are still PROCESSING up to date: each is re-fetched on a
 * backoff (utils/processingPoll.js) and handed to `onUpdate` once it is READY
 * or FAILED. Posts that are not processing cost nothing.
 *
 * Only an author ever holds PROCESSING posts -- feeds carry READY ones only --
 * so this runs on their own profile and on the page they land on after
 * posting, never on a feed.
 */
export function usePostProcessing(posts, onUpdate) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const list = Array.isArray(posts) ? posts : posts ? [posts] : [];
  const pendingKey = list
    .filter((p) => p && p.id != null && mediaStatus(p) === 'PROCESSING')
    .map((p) => p.id)
    .join(',');

  useEffect(() => {
    if (!pendingKey) return undefined;
    return watchProcessing(pendingKey.split(','), {
      fetchPost: (id) => api.request(`/reels/${id}/`, { skipCache: true }),
      onUpdate: (post) => {
        // Lists fetched while it was processing no longer describe it.
        api.invalidateCache?.('/reels');
        onUpdateRef.current?.(post);
      },
    });
  }, [pendingKey]);
}
