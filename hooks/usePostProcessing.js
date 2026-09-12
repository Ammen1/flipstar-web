import { useEffect, useRef } from 'react';
import { mediaStatus } from '../utils/media';
import { uploadTracker } from '../services/uploadTracker';

/**
 * Keep `posts` that are still PROCESSING up to date: `onUpdate` gets each one
 * once it is READY (the full post) or FAILED ({id, processing_status,
 * processing_error}). Posts that are not processing cost nothing.
 *
 * It does not poll by itself. The posts join the app's one upload tracker
 * (services/uploadTracker.js), which asks about every processing post in a
 * single request per tick -- so the post page, the profile grid, campaign
 * entries and the corner indicator following the same upload make one
 * request between them, not one each.
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
    return uploadTracker.watch(pendingKey.split(','), (post) => onUpdateRef.current?.(post));
  }, [pendingKey]);
}
