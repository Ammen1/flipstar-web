import { useCallback, useEffect, useReducer, useRef } from 'react';
import api from '../api';
import realtimeService from '../services/RealtimeService';
import {
  MAX_PAGE,
  PAGE_SIZE,
  describeFeedError,
  feedReducer,
  filterKey,
  initialFeed,
  trendingPath,
} from '../utils/explorerFeed';

// A focus or visibility change within this long of the last load does not
// re-fetch: switching tabs back and forth should not cost a request each time.
const REFRESH_AFTER_MS = 30000;

/**
 * The Explore grid for one filter: first page, infinite scroll, silent
 * refresh, retry.
 *
 * The category and time range go into every request, first page or tenth, so
 * a page can never come from another filter; and every request is tagged so
 * only the newest answer lands (see feedReducer). The API client runs its own
 * AbortController and does not take a caller's signal, so superseded requests
 * are dropped on arrival rather than cancelled.
 */
export function useExplorerFeed({ category, timeRange, enabled = true, categoryName = '' }) {
  const [state, dispatch] = useReducer(feedReducer, initialFeed);
  const stateRef = useRef(state);
  stateRef.current = state;
  const seq = useRef(0);
  const lastLoadedAt = useRef(0);
  const nameRef = useRef(categoryName);
  nameRef.current = categoryName;
  const key = filterKey({ category, timeRange });

  const run = useCallback(
    async (mode) => {
      const s = stateRef.current;
      let limit = PAGE_SIZE;
      let offset = 0;
      let append = false;
      const requestId = ++seq.current;

      if (mode === 'more') {
        if (s.key !== key || s.status !== 'ready' || !s.hasMore || s.loadingMore) return;
        offset = s.items.length;
        append = true;
        dispatch({ type: 'loadMore', key, requestId });
      } else if (mode === 'refresh' && s.key === key && s.status === 'ready') {
        // Re-fetch what is on screen in one go, so a refresh does not drop
        // the pages already scrolled through.
        limit = Math.min(MAX_PAGE, Math.max(PAGE_SIZE, s.items.length));
        dispatch({ type: 'refresh', key, requestId });
      } else {
        dispatch({ type: 'start', key, requestId });
      }

      try {
        const data = await api.request(trendingPath({ category, timeRange, limit, offset }), { skipCache: true });
        const items = Array.isArray(data) ? data : (data && data.results) || [];
        lastLoadedAt.current = Date.now();
        dispatch({ type: 'loaded', key, requestId, items, limit, append });
      } catch (err) {
        dispatch({ type: 'failed', key, requestId, append, error: describeFeedError(err, nameRef.current) });
      }
    },
    [key, category, timeRange]
  );

  const runRef = useRef(run);
  runRef.current = run;

  // A new filter: clear the grid and load page one.
  useEffect(() => {
    if (enabled) run('start');
  }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Coming back to the page, or a new post published elsewhere.
  useEffect(() => {
    if (!enabled) return undefined;
    const refresh = (force) => {
      if (!force && Date.now() - lastLoadedAt.current < REFRESH_AFTER_MS) return;
      const s = stateRef.current;
      if (s.status === 'loading' || s.loadingMore) return;
      runRef.current(s.status === 'ready' ? 'refresh' : 'start');
    };
    const onNewPost = () => refresh(true);
    const onFocus = () => refresh(false);
    const onVisible = () => { if (!document.hidden) refresh(false); };
    realtimeService.addEventListener('FEED_REFRESH', onNewPost);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      realtimeService.removeEventListener('FEED_REFRESH', onNewPost);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  const loadMore = useCallback(() => runRef.current('more'), []);
  const retry = useCallback(() => runRef.current('start'), []);

  return { ...state, loadMore, retry };
}
