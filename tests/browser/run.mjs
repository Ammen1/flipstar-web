/**
 * End-to-end tests in a real browser.
 *
 *   npm run test:browser                 every suite
 *   npm run test:browser -- explorer     one suite (camera | explorer | media)
 *   CHROME_PATH=... npm run test:browser to pick the browser
 *
 * Each suite is tests/browser/<suite>.harness.jsx, which mounts real pages
 * (the post page with its camera; the Explore page; the post page, Reels and
 * campaign feed playing processed media). It is bundled with the
 * esbuild that ships inside Vite, served from a local server that also stubs
 * the API, and run in headless Chrome or Edge with Chromium's fake camera and
 * microphone. The page posts its results back and this script prints them.
 *
 * No new dependencies: esbuild is already in node_modules (Vite uses it) and
 * the browser is whatever Chromium the machine has.
 */

import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TIMEOUT_MS = Number(process.env.BROWSER_TEST_TIMEOUT_MS || 240000);
const SUITES = ['camera', 'explorer', 'media'];

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** Field names, file names, types and sizes of a multipart body. */
function summariseMultipart(contentType, body) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { fields: {}, files: [] };
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const out = { fields: {}, files: [] };
  let start = body.indexOf(boundary);
  while (start !== -1) {
    const next = body.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = body.subarray(start + boundary.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.subarray(0, split).toString('utf8');
      const content = part.subarray(split + 4);
      const name = /name="([^"]*)"/.exec(head)?.[1];
      const filename = /filename="([^"]*)"/.exec(head)?.[1];
      const type = /Content-Type:\s*([^\r\n]+)/i.exec(head)?.[1] || '';
      if (filename !== undefined) out.files.push({ name, filename, type, size: content.length });
      else if (name) out.fields[name] = content.toString('utf8');
    }
    start = next;
  }
  return out;
}

// ── Explore fixture ────────────────────────────────────────────────────────
// Categories and posts of known ages, and a /explorer/trending/ that filters
// them the way the backend does (tests/integration/test_explorer_trending_
// filters.py covers the real one). What the browser suite checks is the page:
// which requests it makes, and that what it shows is exactly the answer to
// the latest one.
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const EXPLORE_CATEGORIES = [
  { id: 3, name: 'Dance', slug: 'dance', icon: '💃', order: 1, is_active: true },
  { id: 5, name: 'Music', slug: 'music', icon: 'music', order: 2, is_active: true },
  { id: 7, name: 'Comedy', slug: 'comedy', icon: '', order: 3, is_active: true },
  { id: 9, name: 'Sport', slug: 'sport', icon: '', order: 4, is_active: true },
  { id: 11, name: 'Education', slug: 'education', icon: '', order: 5, is_active: true },
  { id: 13, name: 'Travel', slug: 'travel', icon: '', order: 6, is_active: true },
  { id: 15, name: 'Food', slug: 'food', icon: '', order: 7, is_active: true },
  { id: 17, name: 'Gaming', slug: 'gaming', icon: '', order: 8, is_active: true },
];
const slugOf = (id) => (EXPLORE_CATEGORIES.find((c) => c.id === id) || {}).slug || null;

function explorePosts(now) {
  const out = [];
  let id = 1000;
  const add = (category, age, votes) => out.push({ id: id++, category, created: now - age, votes });
  for (let i = 0; i < 10; i++) add(3, (i + 1) * HOUR, 100 - i); // Dance, last 24h
  for (let i = 0; i < 10; i++) add(3, (2 + i * 0.4) * DAY, 80 - i); // Dance, 2-6 days
  for (let i = 0; i < 10; i++) add(3, (10 + i) * DAY, 60 - i); // Dance, 10-19 days
  for (let i = 0; i < 4; i++) add(5, (i + 2) * HOUR, 90 - i); // Music, last 24h
  for (let i = 0; i < 4; i++) add(5, (3 + i) * DAY, 70 - i); // Music, 3-6 days
  for (let i = 0; i < 3; i++) add(7, (1.5 + i) * DAY, 50 - i); // Comedy, 1.5-3.5 days
  for (let i = 0; i < 5; i++) add(null, (i + 1) * DAY, 40 - i); // uncategorised
  // Sport has none: the empty state.
  return out;
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function newExploreState() {
  return { posts: explorePosts(Date.now()), requests: [], delays: {}, fail: new Set() };
}

function exploreTrending(explore, url, origin) {
  const raw = (url.searchParams.get('category') || '').trim();
  const timeRange = url.searchParams.get('time_range') || '7d';
  const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit'), 10) || 20));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0);
  explore.requests.push({ category: raw, time_range: timeRange, limit, offset });

  if (explore.fail.has(raw)) return [500, { error: 'Could not load trending posts.', code: 'trending_failed' }];
  let category = null;
  if (!['', 'all', 'trending'].includes(raw.toLowerCase())) {
    const match = EXPLORE_CATEGORIES.find((c) => String(c.id) === raw || c.slug === raw);
    if (!match) return [400, { error: 'Unknown or inactive category.', code: 'invalid_category', category: raw }];
    category = match.id;
  }
  const windowMs = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY }[timeRange] || 365 * DAY;
  const now = Date.now();
  const rows = explore.posts
    .filter((p) => (category === null || p.category === category) && p.created >= now - windowMs)
    .sort((a, b) => b.votes - a.votes || b.id - a.id)
    .slice(offset, offset + limit)
    .map((p) => ({
      id: p.id,
      votes: p.votes,
      category: p.category,
      category_slug: slugOf(p.category),
      thumbnail_url: `${origin}/media/${slugOf(p.category) || 'none'}-${p.id}.png`,
      user: { username: `creator${p.id}` },
      created_at: new Date(p.created).toISOString(),
      comment_count: 0,
    }));
  return [200, rows];
}

// ── Media fixture ──────────────────────────────────────────────────────────
// Posts as api/serializers/core.py sends them once the worker has processed
// them: `media` is the 720p rung, `media_variants` the 360p/480p ones, and
// nothing points at the original under source/ -- the API never serves it.
// The video files themselves are recorded in the browser by the harness and
// registered here (/__media/put), so the rungs are real, playable files; every
// /media/ request is logged so the suite can show which files the page
// actually fetched.

function processedVideo(origin, id, caption) {
  const base = `${origin}/media/processed/videos/${id}/v1`;
  return {
    id,
    user: { id: 50 + (id % 10), username: `creator${id}` },
    caption,
    hashtags_list: [],
    media: `${base}/720p.webm`,
    media_variants: { 360: `${base}/360p.webm`, 480: `${base}/480p.webm` },
    image: null,
    thumbnail: `${origin}/media/processed/thumbnails/${id}/v1/thumb.png`,
    media_type: 'video',
    processing_status: 'READY',
    processing_error: null,
    votes: 0,
    comment_count: 0,
    shares: 0,
    created_at: new Date().toISOString(),
  };
}

function processedPhoto(origin, id, caption) {
  const base = `${origin}/media/processed/images/${id}/v1`;
  return {
    id,
    user: { id: 50 + (id % 10), username: `creator${id}` },
    caption,
    media: null,
    image: `${base}/full.jpg`,
    image_variants: { 360: `${base}/360w.jpg`, 720: `${base}/720w.jpg` },
    image_webp_variants: { 360: `${base}/360w.webp`, 720: `${base}/720w.webp`, full: `${base}/full.webp` },
    thumbnail: `${origin}/media/processed/thumbnails/${id}/v1/thumb.png`,
    media_type: 'image',
    processing_status: 'READY',
    processing_error: null,
    votes: 0,
    comment_count: 0,
    created_at: new Date().toISOString(),
  };
}

function newMediaState() {
  // processing: id -> { processing_status, processing_progress, processing_error, queued },
  // what /posts/processing/ and /reels/<id>/ answer, set by the suite through
  // /__media/control. 900 is the post an author just made; 901 one that failed.
  const processing = new Map([
    [900, { processing_status: 'PROCESSING', processing_progress: 30, processing_error: null, queued: false }],
    [901, { processing_status: 'FAILED', processing_progress: 20, processing_error: 'video_too_long', queued: false }],
  ]);
  return { files: new Map(), requests: [], processing, apiLog: [] };
}

function mediaApi(media, route, url, origin) {
  const own = { id: 1, username: 'e2e_author' };
  if (route === '/posts/processing/') {
    const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
    media.apiLog.push({ route, ids });
    const rows = ids
      .map(Number)
      .filter((id) => media.processing.has(id))
      .map((id) => ({ id, media_type: 'video', created_at: new Date().toISOString(), ...media.processing.get(id) }));
    return [200, { posts: rows }];
  }
  const single = /^\/reels\/(\d+)\/$/.exec(route);
  if (single && media.processing.has(Number(single[1]))) {
    const id = Number(single[1]);
    media.apiLog.push({ route, ids: [String(id)] });
    const state = media.processing.get(id);
    if (state.processing_status === 'READY') return [200, { ...processedVideo(origin, id, 'fresh upload'), user: own }];
    return [200, {
      id, user: own, caption: 'my new clip', media: null, image: null, thumbnail: null,
      media_type: 'video', votes: 0, comment_count: 0, created_at: new Date().toISOString(), ...state,
    }];
  }
  if (route === '/reels/') {
    return [200, {
      results: [801, 802, 803].map((id, i) => processedVideo(origin, id, `clip ${i + 1}`)),
      next: null,
    }];
  }
  if (route === '/admin/reels/') {
    // As api/views/admin.py answers since it uses reel_media_payload: a
    // video's picture is its thumbnail (`image` stays null -- the old upload
    // view put a frame there, the pipeline does not), and a post that is
    // still processing or failed has no URL at all.
    const unfinished = (id, status, extra) => ({
      id, user: own, caption: status.toLowerCase(), media: null, image: null, thumbnail: null,
      media_type: 'video', processing_status: status, processing_progress: 40, processing_error: null,
      votes: 0, comment_count: 0, save_count: 0, is_hidden: false, created_at: new Date().toISOString(), ...extra,
    });
    const reels = [
      processedVideo(origin, 821, 'a video'),
      processedPhoto(origin, 823, 'a photo'),
      { ...processedVideo(origin, 822, 'a video without a thumbnail'), thumbnail: null },
      unfinished(824, 'PROCESSING'),
      unfinished(825, 'FAILED', { processing_error: 'video_too_long' }),
    ];
    return [200, { reels, total: reels.length, page: 1, page_size: 20, total_pages: 1 }];
  }
  if (route === '/campaigns/') return [200, []];
  if (route === '/campaigns/7/') {
    return [200, { id: 7, title: 'Spring Challenge', description: 'Show us spring.', campaign_type: 'daily', status: 'active' }];
  }
  if (route === '/campaigns/7/feed/') {
    const entry = (i, reel) => ({
      id: 70 + i,
      reel,
      user: { id: reel.user.id, username: reel.user.username },
      theme: null,
      scores: { total: 10 - i, creativity: 0, engagement: 0, quality: 0, theme_relevance: 0 },
      engagement: { likes: 0, comments: 0, user_liked: false },
    });
    return [200, {
      posts: [
        entry(0, processedVideo(origin, 811, 'entry one')),
        entry(1, processedVideo(origin, 812, 'entry two')),
        entry(2, processedPhoto(origin, 813, 'entry three')),
      ],
    }];
  }
  return null;
}

// ── bundling and running ───────────────────────────────────────────────────

// Stylesheets imported by components (ReelLayout.css, ...) are added to the
// page as <style> tags, as Vite does in development, so layouts like the
// Reels scroll-snap behave as they do in the app.
const inlineCss = {
  name: 'inline-css',
  setup(b) {
    b.onLoad({ filter: /\.css$/ }, async (args) => ({
      contents: `const s = document.createElement('style'); s.textContent = ${JSON.stringify(
        await readFile(args.path, 'utf8')
      )}; document.head.appendChild(s);`,
      loader: 'js',
    }));
  },
};

async function bundle(suite, apiBase) {
  const result = await build({
    entryPoints: [path.join(ROOT, `tests/browser/${suite}.harness.jsx`)],
    plugins: [inlineCss],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2019',
    jsx: 'automatic',
    loader: { '.js': 'jsx', '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.gif': 'dataurl', '.webp': 'dataurl' },
    define: {
      'import.meta.env': JSON.stringify({
        VITE_API_BASE_URL: apiBase,
        VITE_ENVIRONMENT: 'test',
        MODE: 'test',
        DEV: false,
        PROD: true,
      }),
      'process.env.NODE_ENV': '"development"',
    },
    logLevel: 'error',
  });
  return result.outputFiles[0].text;
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.');
    process.exit(2);
  }
  const requested = process.argv.slice(2).filter((a) => SUITES.includes(a));
  const suites = requested.length ? requested : SUITES;

  let suite = null;
  let html = '';
  let state = null;
  let resolveResults = () => {};

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = `http://${req.headers.host}`;
    const body = await readBody(req);
    const json = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return undefined;
    }
    if (url.pathname.startsWith('/media/')) {
      if (state) state.media.requests.push(url.pathname);
      const file = state && state.media.files.get(url.pathname);
      if (file) {
        res.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.bytes.length });
        res.end(file.bytes);
        return undefined;
      }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(PNG);
      return undefined;
    }
    if (url.pathname === '/__media/put') {
      state.media.files.set(url.searchParams.get('path'), {
        type: req.headers['content-type'] || 'application/octet-stream',
        bytes: body,
      });
      return json(200, {});
    }
    if (url.pathname === '/__media/requests') {
      const list = state.media.requests.slice();
      if (url.searchParams.get('clear') === '1') state.media.requests.length = 0;
      return json(200, list);
    }
    if (url.pathname === '/__media/control') {
      if (url.searchParams.has('ready')) {
        state.media.processing.set(Number(url.searchParams.get('ready')), {
          processing_status: 'READY', processing_progress: 100, processing_error: null, queued: false,
        });
      }
      // ?set=910:PROCESSING:25[:error]&queued=1 -- what the worker has reached.
      if (url.searchParams.has('set')) {
        const [id, status, progress, error] = url.searchParams.get('set').split(':');
        state.media.processing.set(Number(id), {
          processing_status: status,
          processing_progress: Number(progress) || 0,
          processing_error: error || null,
          queued: url.searchParams.get('queued') === '1',
        });
      }
      return json(200, {});
    }
    if (url.pathname === '/__media/api-log') {
      const list = state.media.apiLog.slice();
      if (url.searchParams.get('clear') === '1') state.media.apiLog.length = 0;
      return json(200, list);
    }
    if (url.pathname === '/__log') {
      console.log(`  ${body.toString('utf8')}`);
      return json(200, {});
    }
    if (url.pathname === '/__results') {
      json(200, {});
      resolveResults(JSON.parse(body.toString('utf8')));
      return undefined;
    }
    if (url.pathname === '/__control') {
      state.failUpload = url.searchParams.get('failUpload') === '1';
      return json(200, {});
    }
    if (url.pathname === '/__uploads') return json(200, state.uploads);
    if (url.pathname === '/__explorer/requests') {
      const list = state.explore.requests.slice();
      if (url.searchParams.get('clear') === '1') state.explore.requests.length = 0;
      return json(200, list);
    }
    if (url.pathname === '/__explorer/control') {
      // ?delay=3:900,5:500  ?fail=7  (keyed by the category value sent)  ?reset=1
      const e = state.explore;
      if (url.searchParams.get('reset') === '1') {
        e.delays = {};
        e.fail = new Set();
      }
      (url.searchParams.get('delay') || '').split(',').filter(Boolean).forEach((pair) => {
        const [k, ms] = pair.split(':');
        e.delays[k] = Number(ms) || 0;
      });
      if (url.searchParams.has('fail')) e.fail = new Set((url.searchParams.get('fail') || '').split(',').filter(Boolean));
      return json(200, {});
    }
    if (!url.pathname.startsWith('/api/v1/')) return json(404, {});

    // ── API stubs ──
    const route = url.pathname.slice('/api/v1'.length);
    if (route === '/client-log/') {
      // The page's own diagnostics; shown with VERBOSE=1.
      if (process.env.VERBOSE) {
        try {
          const entry = JSON.parse(body.toString('utf8'));
          console.log(`    · [${entry.source}/${entry.level}] ${entry.message}`);
        } catch (_) { /* not JSON */ }
      }
      return json(200, {});
    }
    if (route === '/crypto/public-key/') return json(404, {}); // E2E off: plain JSON
    if (route === '/categories/') return json(200, suite === 'media' ? [] : EXPLORE_CATEGORIES);
    if (suite === 'media') {
      const answer = mediaApi(state.media, route, url, origin);
      if (answer) return json(answer[0], answer[1]);
    }
    if (route === '/posts/processing/') {
      // Posts made in this run are processing, as far as this stub knows.
      const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean).map(Number);
      const made = new Set([...state.posts.values()].map((p) => p.id));
      return json(200, {
        posts: ids.filter((id) => made.has(id)).map((id) => ({
          id, processing_status: 'PROCESSING', processing_progress: 0, queued: true, media_type: 'video',
        })),
      });
    }
    if (route === '/explorer/trending/') {
      const [code, payload] = exploreTrending(state.explore, url, origin);
      const delay = state.explore.delays[(url.searchParams.get('category') || '').trim()] || 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      return json(code, payload);
    }
    if (route === '/explorer/trending-hashtags/') {
      return json(200, [
        { tag: 'ethiopia', posts: 12, score: 20 },
        { tag: 'addisababa', posts: 9, score: 14 },
        { tag: 'eskista', posts: 6, score: 9 },
      ]);
    }
    if (route === '/explorer/hashtag/') {
      const results = state.explore.posts.slice(0, 2).map((p) => ({
        id: p.id, votes: p.votes, thumbnail_url: `${origin}/media/tag-${p.id}.png`, user: { username: `creator${p.id}` },
      }));
      return json(200, { hashtag: url.searchParams.get('tag'), count: results.length, results });
    }
    if (route === '/drafts/') return json(200, req.method === 'GET' ? [] : { id: 1 });
    if (route === '/coins/balance/') return json(200, { balance: 1000 });
    if (route === '/wallet/config/') return json(200, { cost_post_create_non_campaign: 0 });
    if (route === '/posts/create/') {
      const upload = summariseMultipart(req.headers['content-type'], body);
      state.uploads.push(upload);
      if (state.failUpload) return json(500, {});
      // As the API answers now (api/views/core.py create_post): the post is
      // stored and PROCESSING, with no media URL until the worker is done;
      // a repeated client_upload_id returns the post already made.
      const uploadId = upload.fields.client_upload_id;
      const known = uploadId && state.posts.get(uploadId);
      const kind = /^image\//.test(upload.files[0]?.type || '') ? 'image' : 'video';
      const post = known || {
        id: 4242 + state.posts.size,
        media: null,
        image: null,
        thumbnail: null,
        media_type: kind,
        processing_status: 'PROCESSING',
        created_at: new Date().toISOString(),
      };
      if (uploadId) state.posts.set(uploadId, post);
      return json(known ? 200 : 201, post);
    }
    return json(200, {});
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`browser: ${browser}`);

  let totalFailed = 0;
  for (const name of suites) {
    suite = name;
    state = {
      uploads: [],
      posts: new Map(),
      failUpload: false,
      explore: newExploreState(),
      media: newMediaState(),
    };
    const script = await bundle(name, `${origin}/api/v1`);
    html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} e2e</title></head><body style="margin:0"><div id="root"></div><script>${script.replace(/<\/script>/gi, '<\\/script>')}</script></body></html>`;
    const results = new Promise((resolve) => { resolveResults = resolve; });

    console.log(`\n── ${name} ──`);
    const profile = mkdtempSync(path.join(tmpdir(), `flipstar-${name}-e2e-`));
    const child = spawn(browser, [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      // Chromium's synthetic camera and microphone, and "Allow" for every prompt.
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      // A phone-sized window, so pages take their mobile layout.
      '--window-size=412,915',
      origin + '/',
    ], { stdio: 'ignore' });

    const timer = setTimeout(() => resolveResults({ timeout: true, tests: [] }), TIMEOUT_MS);
    const outcome = await results;
    clearTimeout(timer);
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
    try { rmSync(profile, { recursive: true, force: true }); } catch (_) { /* the browser may still hold it */ }

    if (outcome.timeout) {
      console.error(`\n${name}: timed out after ${TIMEOUT_MS}ms.`);
      totalFailed += 1;
      continue;
    }
    const failed = outcome.tests.filter((t) => !t.ok);
    const skipped = outcome.tests.filter((t) => t.skipped);
    const passed = outcome.tests.length - failed.length - skipped.length;
    console.log(`\n${name}: ${passed}/${outcome.tests.length} passed${skipped.length ? `, ${skipped.length} skipped` : ''}`);
    failed.forEach((t) => console.log(`\n✘ ${t.name}\n${t.detail}`));
    totalFailed += failed.length;
  }

  server.close();
  process.exit(totalFailed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
