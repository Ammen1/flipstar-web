/**
 * Explore feed: filter state, request building and the results reducer.
 *
 * Pure functions only, so the rules that decide what the grid shows are
 * tested without a browser (tests/explorerFeed.test.js).
 *
 * The filter is { category, timeRange }:
 *   category   'all', or a category id from /categories/ -- ids survive a
 *              rename, where names and slugs do not
 *   timeRange  '24h' | '7d' | '30d'
 *
 * The URL carries the slug instead (/explore?category=dance&range=7d): it is
 * what a person can read and share, and it is resolved to the id once the
 * category list has loaded.
 */

export const ALL = 'all';

export const TIME_RANGES = Object.freeze([
  { id: '24h', label: '24h', phrase: 'the last 24 hours' },
  { id: '7d', label: '7 Days', phrase: 'the last 7 days' },
  { id: '30d', label: '30 Days', phrase: 'the last 30 days' },
]);

export const DEFAULT_TIME_RANGE = '7d';
export const DEFAULT_FILTERS = Object.freeze({ category: ALL, timeRange: DEFAULT_TIME_RANGE });

export const PAGE_SIZE = 12;
// The backend caps a page at 50; a silent refresh re-fetches what is on
// screen in one request, up to that.
export const MAX_PAGE = 50;

export function isTimeRange(value) {
  return TIME_RANGES.some((r) => r.id === value);
}

export function timeRangePhrase(value) {
  const range = TIME_RANGES.find((r) => r.id === value);
  return range ? range.phrase : '';
}

/** One string per distinct filter: results for any other key are stale. */
export function filterKey({ category, timeRange }) {
  return `${category}|${timeRange}`;
}

/** The /explorer/trending/ path for a filter and a page. */
export function trendingPath({ category, timeRange, limit = PAGE_SIZE, offset = 0 }) {
  const params = new URLSearchParams({
    category: category === ALL || category == null ? ALL : String(category),
    time_range: timeRange,
    limit: String(limit),
  });
  if (offset > 0) params.set('offset', String(offset));
  return `/explorer/trending/?${params.toString()}`;
}

// ── URL <-> filter ─────────────────────────────────────────────────────────

/** { categorySlug, timeRange } from a URLSearchParams, validated. */
export function readFilterParams(searchParams) {
  const slug = (searchParams.get('category') || '').trim().toLowerCase();
  const range = searchParams.get('range');
  return {
    categorySlug: slug && slug !== ALL ? slug : null,
    timeRange: isTimeRange(range) ? range : DEFAULT_TIME_RANGE,
  };
}

/**
 * The search params for a filter, defaults left out so the plain /explore
 * URL stays plain. Params the explore page does not own are kept.
 */
export function writeFilterParams(searchParams, { categorySlug, timeRange }) {
  const next = new URLSearchParams(searchParams);
  if (categorySlug) next.set('category', categorySlug);
  else next.delete('category');
  if (timeRange && timeRange !== DEFAULT_TIME_RANGE) next.set('range', timeRange);
  else next.delete('range');
  return next;
}

// ── Results ────────────────────────────────────────────────────────────────

export const initialFeed = Object.freeze({
  key: null, // filterKey of what `items` belong to
  requestId: 0, // the only request whose answer may land
  items: [],
  status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  error: null, // { message, code } for status 'error'
  hasMore: false,
  loadingMore: false,
  moreError: false, // the last "load more" failed; the items stay
});

function mergeUnique(existing, incoming) {
  const seen = new Set(existing.map((item) => item.id));
  return existing.concat(incoming.filter((item) => !seen.has(item.id)));
}

/**
 * Every request is tagged with the filter key and a request id. An answer
 * lands only if both still match: a response for a category the person has
 * already moved away from -- or an older request for the same one -- is
 * dropped, whatever order the network returns them in.
 */
export function feedReducer(state, action) {
  const current = action.key === state.key && action.requestId === state.requestId;
  switch (action.type) {
    case 'start':
      // A new filter, or a retry: the old posts go at once. Leaving the
      // previous category's grid up while the next loads is what made the
      // filter look broken.
      return {
        ...initialFeed,
        key: action.key,
        requestId: action.requestId,
        status: 'loading',
      };
    case 'refresh':
      // Silent re-fetch of what is on screen (focus, new-post broadcast):
      // keeps the items, supersedes any request in flight.
      if (action.key !== state.key) return state;
      return { ...state, requestId: action.requestId, loadingMore: false };
    case 'loadMore':
      if (action.key !== state.key || state.status !== 'ready' || !state.hasMore) return state;
      return { ...state, requestId: action.requestId, loadingMore: true, moreError: false };
    case 'loaded': {
      if (!current) return state;
      const items = action.append ? mergeUnique(state.items, action.items) : action.items;
      return {
        ...state,
        items,
        status: 'ready',
        error: null,
        hasMore: action.items.length >= action.limit,
        loadingMore: false,
        moreError: false,
      };
    }
    case 'failed':
      if (!current) return state;
      if (action.append) {
        // Keep what is on screen; the grid offers a retry at the bottom.
        return { ...state, loadingMore: false, moreError: true };
      }
      if (state.status === 'ready' && state.items.length) {
        // A failed silent refresh leaves the grid as it was.
        return state;
      }
      return { ...state, status: 'error', error: action.error, loadingMore: false };
    default:
      return state;
  }
}

/** What to tell a person when a request fails; the API's own code decides. */
export function describeFeedError(err, categoryName) {
  const data = (err && err.data) || {};
  if (data.code === 'invalid_category') {
    return { code: 'invalid_category', message: 'This category is no longer available.' };
  }
  const offline =
    (err && (err.name === 'TypeError' || err.timedOut)) ||
    /network|failed to fetch|load failed/i.test((err && err.message) || '');
  if (offline) {
    return { code: 'offline', message: 'Check your connection and try again.' };
  }
  return {
    code: 'failed',
    message: categoryName
      ? `We couldn't load ${categoryName} posts. Please try again.`
      : "We couldn't load trending posts. Please try again.",
  };
}
