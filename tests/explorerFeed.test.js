import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL,
  DEFAULT_FILTERS,
  describeFeedError,
  feedReducer,
  filterKey,
  initialFeed,
  readFilterParams,
  trendingPath,
  writeFilterParams,
} from '../utils/explorerFeed.js';

const DANCE = 5;
const MUSIC = 6;
const COMEDY = 7;

const post = (id, category = DANCE) => ({ id, category });
const posts = (from, n, category) => Array.from({ length: n }, (_, i) => post(from + i, category));
const params = (path) => Object.fromEntries(new URL(path, 'http://x').searchParams);

describe('trending request', () => {
  it('asks for the selected category by id, with the time range', () => {
    assert.deepEqual(params(trendingPath({ category: DANCE, timeRange: '24h', limit: 12 })), {
      category: '5', time_range: '24h', limit: '12',
    });
  });

  it('asks for every category when All is selected', () => {
    assert.equal(params(trendingPath({ category: ALL, timeRange: '7d' })).category, 'all');
  });

  it('carries the filter on every page, with the next offset', () => {
    const p = params(trendingPath({ category: MUSIC, timeRange: '30d', limit: 12, offset: 24 }));
    assert.deepEqual(p, { category: '6', time_range: '30d', limit: '12', offset: '24' });
  });

  it('starts on All and 7 days', () => {
    assert.deepEqual(DEFAULT_FILTERS, { category: ALL, timeRange: '7d' });
  });
});

describe('filters in the URL', () => {
  it('reads a category slug and a time range', () => {
    assert.deepEqual(readFilterParams(new URLSearchParams('category=Dance&range=30d')), {
      categorySlug: 'dance', timeRange: '30d',
    });
  });

  it('falls back to the defaults for anything unrecognised', () => {
    assert.deepEqual(readFilterParams(new URLSearchParams('category=all&range=1y')), {
      categorySlug: null, timeRange: '7d',
    });
    assert.deepEqual(readFilterParams(new URLSearchParams('')), { categorySlug: null, timeRange: '7d' });
  });

  it('writes only what differs from the defaults and keeps other params', () => {
    const next = writeFilterParams(new URLSearchParams('ref=home&category=music'), { categorySlug: 'dance', timeRange: '24h' });
    assert.equal(next.toString(), 'ref=home&category=dance&range=24h');
    const reset = writeFilterParams(next, { categorySlug: null, timeRange: '7d' });
    assert.equal(reset.toString(), 'ref=home');
  });
});

// ── the feed reducer ─────────────────────────────────────────────────────────

const keyOf = (category, timeRange = '7d') => filterKey({ category, timeRange });
const start = (state, category, requestId, timeRange) =>
  feedReducer(state, { type: 'start', key: keyOf(category, timeRange), requestId });
const loaded = (state, category, requestId, items, { append = false, limit = 12, timeRange } = {}) =>
  feedReducer(state, { type: 'loaded', key: keyOf(category, timeRange), requestId, items, limit, append });

describe('selecting a category', () => {
  it('clears the previous posts at once and shows loading', () => {
    let s = start(initialFeed, ALL, 1);
    s = loaded(s, ALL, 1, posts(1, 12, DANCE));
    s = start(s, DANCE, 2);
    assert.equal(s.status, 'loading');
    assert.deepEqual(s.items, []);
  });

  it('shows the posts that came back for that category', () => {
    let s = start(initialFeed, DANCE, 1);
    s = loaded(s, DANCE, 1, posts(1, 3, DANCE));
    assert.equal(s.status, 'ready');
    assert.deepEqual(s.items.map((p) => p.id), [1, 2, 3]);
  });

  it('back to All replaces the category results', () => {
    let s = start(initialFeed, DANCE, 1);
    s = loaded(s, DANCE, 1, posts(1, 2, DANCE));
    s = start(s, ALL, 2);
    s = loaded(s, ALL, 2, [...posts(1, 2, DANCE), ...posts(10, 2, MUSIC)]);
    assert.deepEqual(s.items.map((p) => p.id), [1, 2, 10, 11]);
    assert.equal(s.key, keyOf(ALL));
  });

  it('category and time range are one filter: changing either starts over', () => {
    let s = start(initialFeed, DANCE, 1, '7d');
    s = loaded(s, DANCE, 1, posts(1, 2), { timeRange: '7d' });
    s = start(s, DANCE, 2, '24h');
    // The 7-day answer arriving late does not land on the 24-hour filter.
    s = loaded(s, DANCE, 1, posts(1, 2), { timeRange: '7d' });
    assert.equal(s.status, 'loading');
    s = loaded(s, DANCE, 2, posts(50, 1), { timeRange: '24h' });
    assert.deepEqual(s.items.map((p) => p.id), [50]);
  });
});

describe('fast switching (Dance -> Music -> Comedy)', () => {
  it('shows Comedy whatever order the answers arrive in', () => {
    let s = start(initialFeed, DANCE, 1);
    s = start(s, MUSIC, 2);
    s = start(s, COMEDY, 3);
    // Comedy is quickest; Music and Dance straggle in afterwards.
    s = loaded(s, COMEDY, 3, posts(300, 2, COMEDY));
    s = loaded(s, MUSIC, 2, posts(200, 2, MUSIC));
    s = loaded(s, DANCE, 1, posts(100, 2, DANCE));
    assert.equal(s.key, keyOf(COMEDY));
    assert.deepEqual(s.items.map((p) => p.category), [COMEDY, COMEDY]);
  });

  it('does not let an earlier failure replace the current results', () => {
    let s = start(initialFeed, DANCE, 1);
    s = start(s, COMEDY, 2);
    s = loaded(s, COMEDY, 2, posts(300, 2, COMEDY));
    s = feedReducer(s, { type: 'failed', key: keyOf(DANCE), requestId: 1, error: { code: 'failed' } });
    assert.equal(s.status, 'ready');
    assert.equal(s.items.length, 2);
  });
});

describe('pagination', () => {
  const firstPage = () => loaded(start(initialFeed, DANCE, 1), DANCE, 1, posts(1, 12, DANCE));

  it('knows there may be more after a full page', () => {
    assert.equal(firstPage().hasMore, true);
    assert.equal(loaded(start(initialFeed, DANCE, 1), DANCE, 1, posts(1, 5)).hasMore, false);
  });

  it('appends page two of the same category', () => {
    let s = feedReducer(firstPage(), { type: 'loadMore', key: keyOf(DANCE), requestId: 2 });
    assert.equal(s.loadingMore, true);
    s = loaded(s, DANCE, 2, posts(13, 12, DANCE), { append: true });
    assert.equal(s.items.length, 24);
    assert.ok(s.items.every((p) => p.category === DANCE));
    assert.equal(s.loadingMore, false);
  });

  it('drops a page that arrives after the category changed', () => {
    let s = feedReducer(firstPage(), { type: 'loadMore', key: keyOf(DANCE), requestId: 2 });
    s = start(s, MUSIC, 3);
    s = loaded(s, DANCE, 2, posts(13, 12, DANCE), { append: true });
    assert.equal(s.status, 'loading');
    assert.deepEqual(s.items, []);
  });

  it('does not duplicate a post that moved between pages', () => {
    let s = feedReducer(firstPage(), { type: 'loadMore', key: keyOf(DANCE), requestId: 2 });
    s = loaded(s, DANCE, 2, [post(12), post(13)], { append: true });
    assert.deepEqual(s.items.slice(-2).map((p) => p.id), [12, 13]);
    assert.equal(s.items.length, 13);
  });

  it('refuses to page past the end, or while a page is loading', () => {
    const done = loaded(start(initialFeed, DANCE, 1), DANCE, 1, posts(1, 3));
    assert.equal(feedReducer(done, { type: 'loadMore', key: keyOf(DANCE), requestId: 2 }), done);
  });

  it('keeps the grid when a later page fails, and says so', () => {
    let s = feedReducer(firstPage(), { type: 'loadMore', key: keyOf(DANCE), requestId: 2 });
    s = feedReducer(s, { type: 'failed', key: keyOf(DANCE), requestId: 2, append: true, error: {} });
    assert.equal(s.status, 'ready');
    assert.equal(s.items.length, 12);
    assert.equal(s.moreError, true);
  });
});

describe('empty and error', () => {
  it('an empty category is ready with no posts, not an error', () => {
    const s = loaded(start(initialFeed, COMEDY, 1), COMEDY, 1, []);
    assert.equal(s.status, 'ready');
    assert.deepEqual(s.items, []);
    assert.equal(s.hasMore, false);
  });

  it('a failed first page is an error, never a silent fallback to other posts', () => {
    const s = feedReducer(start(initialFeed, DANCE, 1), {
      type: 'failed', key: keyOf(DANCE), requestId: 1, error: { code: 'failed', message: 'x' },
    });
    assert.equal(s.status, 'error');
    assert.deepEqual(s.items, []);
  });

  it('a failed silent refresh leaves the grid alone', () => {
    let s = loaded(start(initialFeed, DANCE, 1), DANCE, 1, posts(1, 4));
    s = feedReducer(s, { type: 'refresh', key: keyOf(DANCE), requestId: 2 });
    s = feedReducer(s, { type: 'failed', key: keyOf(DANCE), requestId: 2, error: {} });
    assert.equal(s.status, 'ready');
    assert.equal(s.items.length, 4);
  });

  it('describes failures without raw error text', () => {
    assert.equal(describeFeedError({ status: 400, data: { code: 'invalid_category' } }).code, 'invalid_category');
    assert.equal(describeFeedError(new TypeError('Failed to fetch')).code, 'offline');
    const generic = describeFeedError({ status: 500, message: '{"error":"x","code":"trending_failed"}' }, 'Dance');
    assert.equal(generic.message, "We couldn't load Dance posts. Please try again.");
    assert.doesNotMatch(generic.message, /[{}]/);
  });
});
