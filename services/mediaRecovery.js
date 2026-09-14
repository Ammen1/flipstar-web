import api from '../api';
import { createMediaRecovery } from '../utils/mediaRecovery';

/**
 * The app's one media recovery (utils/mediaRecovery.js): every player asks
 * through it, so a post refreshed for one surface is fresh on all of them,
 * and a feed full of expiring URLs is one request, not one per card.
 */
export const mediaRecovery = createMediaRecovery({
  request: (body) =>
    api.request('/posts/media/', {
      method: 'POST',
      body: JSON.stringify(body),
      skipCache: true,
    }),
});

if (typeof window !== 'undefined') {
  window.addEventListener('flipstar:signed-out', () => mediaRecovery.forget());
}

export {
  failedLoad,
  mediaFieldsOf,
  replayIfWanted,
  resumeAfterRecovery,
  trackPlayIntent,
} from '../utils/mediaRecovery';
