/**
 * The Explore page's category and time filters, in a browser (see run.mjs).
 *
 * The API here is the stub in run.mjs, which filters a fixed set of posts;
 * the real backend filter is covered by
 * tests/integration/test_explorer_trending_filters.py. This suite checks the
 * page: which requests it makes, and that the grid is exactly the answer to
 * the latest one -- through paging, fast switching, empty and failing
 * categories, and a filter carried in the URL.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { ExplorerPage } from '../../pages/feed/ExplorerPage';

// ── plumbing ────────────────────────────────────────────────────────────────

const log = (msg) => fetch('/__log', { method: 'POST', body: msg }).catch(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pageErrors = [];
window.addEventListener('error', (e) => { pageErrors.push(e.message); log(`! error: ${e.message}`); });
window.addEventListener('unhandledrejection', (e) => { pageErrors.push(String(e.reason)); log(`! rejection: ${e.reason}`); });

async function test(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    await log(`✔ ${name} (${Math.round(performance.now() - t0)}ms)${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: String((e && e.stack) || e) });
    await log(`✘ ${name}: ${e && e.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const rootEl = () => document.getElementById('root');
const pageText = () => rootEl().innerText || '';

async function waitFor(fn, what, ms = 8000) {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch (_) { v = null; }
    if (v) return v;
    if (performance.now() - t0 > ms) {
      throw new Error(`timed out waiting for ${what}; page shows: "${pageText().replace(/\s+/g, ' ').slice(0, 260)}"`);
    }
    await sleep(40);
  }
}

const all = (sel) => Array.from(rootEl().querySelectorAll(sel));
const group = (label) => all('[role="group"]').find((g) => g.getAttribute('aria-label') === label);
// By the name label: the chip's text also holds its icon (an emoji for Dance).
const chipName = (b) => (b.lastElementChild ? b.lastElementChild.textContent.trim() : b.textContent.trim());
const chip = (name) => all('[role="group"][aria-label="Categories"] button').find((b) => chipName(b) === name);
const segment = (label) => all('[role="group"][aria-label="Time range"] button').find((b) => b.textContent.trim() === label);
const buttonText = (text) => all('button').find((b) => b.textContent.trim().includes(text));
const pressed = (el) => el && el.getAttribute('aria-pressed') === 'true';

/** Category slug of every post on the grid, read from its thumbnail. */
const gridCategories = () =>
  all('[data-post-id] img').map((img) => (/\/media\/([a-z]+)-\d+\.png/.exec(img.getAttribute('src')) || [])[1]);
const gridIds = () => all('[data-post-id]').map((el) => Number(el.getAttribute('data-post-id')));

const api = {
  requests: (clear = false) => fetch(`/__explorer/requests${clear ? '?clear=1' : ''}`).then((r) => r.json()),
  control: (qs) => fetch(`/__explorer/control?${qs}`),
};

async function lastRequest() {
  const list = await api.requests();
  return list[list.length - 1];
}

/** Click, then wait until the grid holds posts and nothing is loading. */
async function settle(what) {
  await waitFor(() => all('[data-post-id]').length > 0 && !/Loading .*posts…/.test(pageText()), what);
  await sleep(80);
}

// ── the page ───────────────────────────────────────────────────────────────

localStorage.setItem('authToken', 'e2e-token');
let root = null;
const urlChanges = [];

function mount(props = {}) {
  if (root) root.unmount();
  urlChanges.length = 0;
  root = createRoot(rootEl());
  root.render(
    <ThemeProvider>
      <ExplorerPage
        onBack={() => {}}
        onShowPostDetail={() => {}}
        onFiltersChange={(f) => urlChanges.push(f)}
        {...props}
      />
    </ThemeProvider>
  );
}

// ── the tests ──────────────────────────────────────────────────────────────

async function run() {
  await api.requests(true);
  mount();

  await test('starts on All and 7 days, and asks for exactly that', async () => {
    await waitFor(() => chip('Dance'), 'the category list');
    await settle('the first page');
    assert(pressed(chip('All')), 'All is not selected');
    assert(pressed(segment('7 Days')), '7 Days is not selected');
    const first = (await api.requests())[0];
    assert(first.category === 'all' && first.time_range === '7d' && first.limit === 12 && first.offset === 0,
      `first request was ${JSON.stringify(first)}`);
    assert(gridIds().length === 12, `grid has ${gridIds().length} posts`);
  });

  await test('categories and time ranges are separate, labelled groups', async () => {
    const cats = group('Categories');
    const time = group('Time range');
    assert(cats && time, 'missing a labelled group');
    const catLabels = Array.from(cats.querySelectorAll('button')).map(chipName);
    const timeLabels = Array.from(time.querySelectorAll('button')).map((b) => b.textContent.trim());
    assert(catLabels.join() === 'All,Dance,Music,Comedy,Sport,Education,Travel,Food,Gaming', `categories: ${catLabels}`);
    assert(timeLabels.join() === '24h,7 Days,30 Days', `time: ${timeLabels}`);
    assert(!catLabels.some((l) => /24h|Days/.test(l)), 'a time range is among the categories');
    // innerText applies the labels' text-transform: they read CATEGORIES / TIME.
    assert(/categories/i.test(pageText()) && /\btime\b/i.test(pageText()), 'section labels missing');
  });

  await test('the category row scrolls sideways instead of wrapping', async () => {
    const row = group('Categories');
    const style = getComputedStyle(row);
    assert(style.overflowX === 'auto' && style.flexWrap !== 'wrap', `overflow-x=${style.overflowX} wrap=${style.flexWrap}`);
    assert(row.scrollWidth > row.clientWidth, 'nine categories fit a phone width?');
    const tops = new Set(Array.from(row.children).map((b) => b.offsetTop));
    assert(tops.size === 1, 'chips wrapped onto more than one line');
  });

  await test('selecting Dance asks for its id and shows only Dance posts', async () => {
    await api.requests(true);
    chip('Dance').click();
    await settle('Dance posts');
    const req = await lastRequest();
    assert(req.category === '3' && req.time_range === '7d', `request was ${JSON.stringify(req)}`);
    const cats = gridCategories();
    assert(cats.length === 12 && cats.every((c) => c === 'dance'), `grid: ${cats}`);
    assert(pressed(chip('Dance')) && !pressed(chip('All')), 'selected state wrong');
    assert(/Showing Dance from the last 7 days/.test(pageText()), 'summary line missing');
    assert(urlChanges.some((f) => f.categorySlug === 'dance' && f.timeRange === '7d'), `url: ${JSON.stringify(urlChanges)}`);
  });

  for (const [cat, range, label, expected] of [
    ['Dance', '24h', '24h', 10],
    ['Dance', '30d', '30 Days', 12],
    ['Music', '7d', '7 Days', 8],
    ['Music', '24h', '24h', 4],
    ['Comedy', '7d', '7 Days', 3],
  ]) {
    await test(`${cat} + ${label} combine`, async () => {
      if (!pressed(chip(cat))) chip(cat).click();
      if (!pressed(segment(label))) segment(label).click();
      await sleep(50);
      await settle(`${cat} ${label}`);
      const req = await lastRequest();
      const id = { Dance: '3', Music: '5', Comedy: '7' }[cat];
      assert(req.category === id && req.time_range === range, `request was ${JSON.stringify(req)}`);
      const cats = gridCategories();
      assert(cats.length === expected, `expected ${expected} posts, got ${cats.length}`);
      assert(cats.every((c) => c === cat.toLowerCase()), `grid: ${cats}`);
    });
  }

  await test('All lifts the category restriction', async () => {
    segment('7 Days').click();
    chip('All').click();
    await settle('all posts');
    const req = await lastRequest();
    assert(req.category === 'all', `request was ${JSON.stringify(req)}`);
    assert(new Set(gridCategories()).size > 1, 'still one category');
    assert(urlChanges[urlChanges.length - 1].categorySlug === null, 'URL still names a category');
  });

  await test('infinite scroll keeps the category and continues where it left off', async () => {
    chip('Dance').click();
    segment('30 Days').click();
    await settle('Dance 30 days');
    await api.requests(true);
    for (let page = 2; page <= 3; page++) {
      const sentinelHost = await waitFor(() => all('[data-post-id]').pop(), 'grid');
      sentinelHost.scrollIntoView();
      window.scrollTo(0, document.body.scrollHeight);
      await waitFor(() => gridIds().length >= Math.min(30, page * 12), `page ${page}`);
      await sleep(100);
    }
    const reqs = await api.requests();
    assert(reqs.length >= 2, `pages requested: ${JSON.stringify(reqs)}`);
    assert(reqs.every((r) => r.category === '3' && r.time_range === '30d'), `a page left the filter: ${JSON.stringify(reqs)}`);
    assert(reqs[0].offset === 12 && reqs[1].offset === 24, `offsets: ${reqs.map((r) => r.offset)}`);
    const ids = gridIds();
    assert(ids.length === 30 && new Set(ids).size === 30, `${ids.length} posts, ${new Set(ids).size} distinct`);
    assert(gridCategories().every((c) => c === 'dance'), 'a non-Dance post appeared');
    await waitFor(() => /You're all caught up/.test(pageText()), 'end of the feed');
  });

  await test('switching Dance → Music → Comedy quickly shows Comedy', async () => {
    segment('7 Days').click();
    chip('All').click();
    await settle('all posts');
    // Slowest first, so the stale answers arrive after the right one.
    await api.control('delay=3:900,5:500,7:0');
    chip('Dance').click();
    await sleep(30);
    chip('Music').click();
    await sleep(30);
    chip('Comedy').click();
    await sleep(1400);
    await api.control('reset=1');
    assert(pressed(chip('Comedy')), 'Comedy is not selected');
    const cats = gridCategories();
    assert(cats.length === 3 && cats.every((c) => c === 'comedy'), `grid shows ${cats}`);
  });

  await test('a new category clears the old posts while it loads', async () => {
    await api.control('delay=5:700');
    chip('Music').click();
    await sleep(150);
    assert(gridIds().length === 0, 'Comedy posts still on screen while Music loads');
    assert(/Loading Music posts…/.test(pageText()), 'no loading indication');
    await settle('Music posts');
    await api.control('reset=1');
    assert(gridCategories().every((c) => c === 'music'), 'grid is not Music');
  });

  await test('an empty category says so and offers a way back to All', async () => {
    chip('Sport').click();
    await waitFor(() => /No Sport posts yet/.test(pageText()), 'empty state');
    assert(/There are no posts in this category from the last 7 days/.test(pageText()), 'empty message');
    assert(buttonText('Try the last 30 days'), 'no wider-range option');
    buttonText('Show all categories').click();
    await settle('all posts');
    assert(pressed(chip('All')), 'All not selected after reset');
  });

  await test('a failing category shows an error with a working retry, never other posts', async () => {
    await api.control('fail=7');
    chip('Comedy').click();
    await waitFor(() => /Unable to load this category/.test(pageText()), 'error state');
    assert(all('[role="alert"]').length === 1, 'error is not announced');
    assert(gridIds().length === 0, 'posts from another category shown under the error');
    assert(!/trending_failed|\{/.test(pageText()), 'raw error text shown');
    await api.control('reset=1');
    buttonText('Try again').click();
    await settle('Comedy after retry');
    assert(gridCategories().every((c) => c === 'comedy'), 'retry did not load Comedy');
  });

  await test('trending hashtags stay separate from the category filter', async () => {
    const toggle = await waitFor(() => all('button[aria-controls="ex-hashtag-list"]')[0], 'hashtags toggle');
    assert(toggle.getAttribute('aria-expanded') === 'false', 'hashtags start open');
    toggle.click();
    await waitFor(() => rootEl().querySelector('#ex-hashtag-list button'), 'hashtag chips');
    assert(toggle.getAttribute('aria-expanded') === 'true', 'aria-expanded not updated');
    await api.requests(true);
    rootEl().querySelector('#ex-hashtag-list button').click();
    await waitFor(() => /#ethiopia/.test(pageText()) && gridIds().length === 2, 'hashtag posts');
    assert(pressed(chip('Comedy')), 'opening a hashtag changed the category');
    assert((await api.requests()).length === 0, 'opening a hashtag re-queried the category feed');
    all('button[aria-label="Close hashtag"]')[0].click();
    await waitFor(() => gridCategories().length === 3 && gridCategories().every((c) => c === 'comedy'), 'Comedy feed back');
    assert((await api.requests()).length === 0, 'closing the hashtag reloaded the feed');
  });

  await test('a category in the URL loads directly, without an All request first', async () => {
    await api.requests(true);
    mount({ initialCategorySlug: 'music', initialTimeRange: '30d' });
    await settle('Music from the URL');
    const reqs = await api.requests();
    assert(reqs.length === 1 && reqs[0].category === '5' && reqs[0].time_range === '30d', `requests: ${JSON.stringify(reqs)}`);
    assert(pressed(chip('Music')) && pressed(segment('30 Days')), 'URL filter not selected');
  });

  await test('a category in the URL that no longer exists falls back to All', async () => {
    await api.requests(true);
    mount({ initialCategorySlug: 'retired-category' });
    await settle('fallback feed');
    const reqs = await api.requests();
    assert(reqs.every((r) => r.category === 'all'), `requests: ${JSON.stringify(reqs)}`);
    assert(pressed(chip('All')), 'All not selected');
    assert(urlChanges.some((f) => f.categorySlug === null), 'the stale category was left in the URL');
  });

  await test('filters are real buttons with pressed states and big enough targets', async () => {
    const buttons = [...group('Categories').querySelectorAll('button'), ...group('Time range').querySelectorAll('button')];
    assert(buttons.every((b) => b.getAttribute('type') === 'button' && b.hasAttribute('aria-pressed')), 'missing aria-pressed');
    assert(buttons.filter(pressed).length === 2, 'exactly one category and one time range should be pressed');
    const small = buttons.filter((b) => b.getBoundingClientRect().height < 34);
    assert(!small.length, `${small.length} targets under 34px`);
  });

  await test('no uncaught errors from the page', async () => {
    assert(!pageErrors.length, pageErrors.join('\n'));
  });

  if (root) root.unmount();
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
}

run().catch(async (e) => {
  results.push({ name: 'harness', ok: false, detail: String((e && e.stack) || e) });
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
});
