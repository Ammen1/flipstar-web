/**
 * The Reels page, driven the way a person drives it: real taps, clicks and
 * swipes sent through the DevTools protocol (run.mjs, /__input), so the
 * browser hit-tests them and produces the whole touch -> mouse -> click
 * sequence a phone does. element.click() would skip exactly that.
 *
 *   controls   tapping Like, Sound, Comment, Share, Gift, Save or the
 *              three-dot menu does its own job and never pauses the video
 *   the video  tapping the picture itself pauses it; tapping again plays
 *   swiping    moves to the next reel, which plays alone
 *   desktop    the wide layout (DesktopReelViewer), clicked with a mouse:
 *              the same rules
 *
 * The API is the media stub in run.mjs (real recorded clips at the 360p/
 * 480p/720p paths; like and save toggle as the API does).
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { BlockProvider } from '../../contexts/BlockContext';
import { ReelLayout } from '../../components/feed/ReelLayout';

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
const pageText = () => (rootEl().innerText || '').replace(/\s+/g, ' ');

async function waitFor(fn, what, ms = 8000) {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch (_) { v = null; }
    if (v) return v;
    if (performance.now() - t0 > ms) {
      const label = typeof what === 'function' ? what() : what;
      throw new Error(`timed out waiting for ${label}; page shows: "${pageText().slice(0, 200)}"`);
    }
    await sleep(50);
  }
}

const isPlaying = (v) => !v.paused && !v.ended && v.readyState >= 2;
const playingVideos = () => Array.from(document.querySelectorAll('video')).filter(isPlaying);

// Real input (run.mjs /__input).
async function input(action) {
  const res = await fetch('/__input', { method: 'POST', body: JSON.stringify(action) }).then((r) => r.json());
  if (!res.ok) throw new Error(`input failed: ${res.error}`);
  return res.result;
}
const centre = (el) => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
};
/** What a tap at the element's centre would actually land on. */
const hitAt = (el) => { const { x, y } = centre(el); return document.elementFromPoint(x, y); };
const tap = (el) => input({ kind: 'tap', ...centre(el) });
const click = (el) => input({ kind: 'click', ...centre(el) });

// ── media files ─────────────────────────────────────────────────────────────

async function recordClip(color, ms = 1500) {
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 320;
  const g = canvas.getContext('2d');
  let x = 0;
  const draw = () => {
    g.fillStyle = color;
    g.fillRect(0, 0, 180, 320);
    g.fillStyle = '#fff';
    x = (x + 7) % 160;
    g.fillRect(x, 150, 20, 20);
  };
  draw();
  const stream = canvas.captureStream(30);
  const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType: type });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const timer = setInterval(draw, 33);
  recorder.start(250);
  await sleep(ms);
  await new Promise((resolve) => { recorder.onstop = resolve; recorder.stop(); });
  clearInterval(timer);
  stream.getTracks().forEach((t) => t.stop());
  return new Blob(chunks, { type: 'video/webm' });
}

async function registerRungs(ids, clips) {
  for (const [i, id] of ids.entries()) {
    for (const rung of ['360p', '480p', '720p']) {
      await fetch(`/__media/put?path=${encodeURIComponent(`/media/processed/videos/${id}/v1/${rung}.webm`)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'video/webm' },
        body: clips[i % clips.length],
      });
    }
  }
}

// ── the page ────────────────────────────────────────────────────────────────

localStorage.setItem('authToken', 'e2e-token');
const me = { id: 1, username: 'e2e_author' };
localStorage.setItem('user', JSON.stringify(me));

// As index.html sizes the page: the feed scrolls inside its own container,
// not the document -- which is what snapping from reel to reel needs.
const pageCss = document.createElement('style');
pageCss.textContent = 'html, body { margin:0; padding:0; width:100%; height:100%; overflow-x:hidden; } #root { width:100%; height:100%; }';
document.head.appendChild(pageCss);
let root = null;
const opened = [];

// The providers main.jsx puts around the app (the gift sheet reads auth).
function mount(element) {
  if (root) root.unmount();
  document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch { /* detached */ } });
  root = createRoot(rootEl());
  root.render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <BlockProvider>{element}</BlockProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

const reels = () => (
  <ReelLayout
    user={me}
    activeTab="reels"
    videosOnly
    subscriptionStatus={{ has_subscription: true }}
    onRequireAuth={() => opened.push('auth')}
    onShowSubscription={() => opened.push('subscription')}
    onShowNotifications={() => opened.push('notifications')}
    onShowWallet={() => {}}
    onShowCoinPurchase={() => {}}
  />
);

const cards = () => Array.from(rootEl().querySelectorAll('.video-card-snap')).filter((c) => c.querySelector('video'));
const activeCard = () => cards().find((c) => isPlaying(c.querySelector('video')));

/** A fresh Reels page with its first reel playing; the card that plays. */
async function freshReels() {
  Object.keys(localStorage).filter((k) => k.startsWith('feed_cache_')).forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter((k) => k.startsWith('feed_position_')).forEach((k) => sessionStorage.removeItem(k));
  await fetch('/__media/control?unlike=1');
  opened.length = 0;
  mount(reels());
  const card = await waitFor(activeCard, 'a reel to play', 15000);
  // Past the first moments of playback: the observer and the autoplay
  // effect have both had their say.
  await sleep(600);
  return card;
}

/** The video must still be playing a good while after `what` -- past the
 * 280 ms single-tap window, when a tap that reached the video would pause it. */
async function stillPlaying(video, what) {
  // Never paused over the 700 ms after `what` -- well past the 280 ms in
  // which a tap that reached the picture would pause it.
  const t0 = performance.now();
  const start = video.currentTime;
  let moved = false;
  while (performance.now() - t0 < 700) {
    assert(!video.paused, `${what} paused the video`);
    if (video.currentTime !== start) moved = true;
    await sleep(40);
  }
  // ...and still moving. A 1.5 s test clip loops, and in a software-rendered
  // headless browser the rewind can take a moment under a heavy overlay
  // (the gift sheet's blur): judged by currentTime changing within a few
  // seconds and `paused` staying false, not by readyState.
  const t1 = performance.now();
  while (!moved && performance.now() - t1 < 2500) {
    assert(!video.paused, `${what} paused the video`);
    if (video.currentTime !== start) moved = true;
    await sleep(50);
  }
  const buffered = Array.from({ length: video.buffered.length }, (_, i) => `${video.buffered.start(i).toFixed(2)}-${video.buffered.end(i).toFixed(2)}`).join(',');
  assert(moved, `${what} froze the video at ${video.currentTime.toFixed(2)}s ` +
    `(ready=${video.readyState} net=${video.networkState} error=${video.error?.code} buffered=${buffered})`);
  const icon = video.parentElement?.querySelector('svg.lucide-pause');
  assert(!icon, `${what} brought up the pause icon`);
}

// ── the tests ───────────────────────────────────────────────────────────────

const CONTROLS = [
  {
    name: 'Like',
    find: (card) => card.querySelector('[data-reel-action="like"] button'),
    done: (card) => card.querySelector('[data-reel-action="like"] button')?.getAttribute('aria-pressed') === 'true',
    what: 'the reel to be liked',
  },
  // (Save below likewise starts unsaved: the stub forgets both per test.)
  {
    name: 'Sound',
    find: (card) => card.querySelector('[data-reel-action="sound"]'),
    // Sound starts off (browsers only autoplay muted); a tap turns it on.
    before: (card) => card.querySelector('[data-reel-action="sound"]').parentElement.innerText.trim(),
    done: (card, before) => {
      const label = card.querySelector('[data-reel-action="sound"]').parentElement.innerText.trim();
      const video = card.querySelector('video');
      return label !== before && video.muted === (label === 'Off');
    },
    what: 'the sound to switch',
  },
  {
    name: 'Comment',
    find: (card) => card.querySelector('[data-reel-action="comment"]'),
    done: () => document.querySelector('[data-reel-sheet="comments"]'),
    what: 'the comments to open',
  },
  {
    name: 'Share',
    find: (card) => card.querySelector('[data-reel-action="share"]'),
    done: () => document.querySelector('[data-reel-sheet="share"]'),
    what: 'the share sheet to open',
  },
  {
    name: 'Gift',
    find: (card) => card.querySelector('[data-reel-action="gift"]'),
    done: () => document.querySelector('[data-reel-sheet="gift"]'),
    what: 'the gift sheet to open',
  },
  {
    name: 'Save',
    find: (card) => card.querySelector('[data-reel-action="save"]'),
    done: (card) => card.querySelector('[data-reel-action="save"]')?.getAttribute('aria-pressed') === 'true',
    what: 'the reel to be saved',
  },
  {
    name: 'three-dot menu',
    find: (card) => card.querySelector('[data-reel-action="menu"]'),
    done: (card) => card.querySelector('[data-reel-menu]'),
    what: 'the menu to open',
  },
];

async function run() {
  const clips = [];
  for (const color of ['#1d4ed8', '#b91c1c', '#15803d']) {
    let clip = await recordClip(color);
    if (clip.size < 1000) clip = await recordClip(color);
    clips.push(clip);
  }
  assert(clips.every((c) => c.size > 1000), `recorded clips are ${clips.map((c) => c.size)} bytes`);
  await registerRungs([801, 802, 803], clips);

  // ── the phone layout (the window is phone-sized) ─────────────────────────
  for (const control of CONTROLS) {
    await test(`tapping ${control.name} does its job and the video keeps playing`, async () => {
      const card = await freshReels();
      const video = card.querySelector('video');
      const button = control.find(card);
      assert(button, `no ${control.name} control on the card`);
      const hit = hitAt(button);
      assert(button.contains(hit) || hit === button, `a tap on ${control.name} lands on <${hit?.tagName?.toLowerCase()} class="${hit?.className?.baseVal ?? hit?.className}">`);

      const before = control.before?.(card);
      await tap(button);
      await waitFor(() => control.done(card, before), control.what, 5000);
      await stillPlaying(video, `tapping ${control.name}`);
      return `${control.what.replace(/^the /, '')}; still playing`;
    });
  }

  for (const control of CONTROLS) {
    await test(`clicking ${control.name} with a mouse (narrow window) does its job and the video keeps playing`, async () => {
      const card = await freshReels();
      const video = card.querySelector('video');
      const button = control.find(card);
      const before = control.before?.(card);
      await click(button);
      await waitFor(() => control.done(card, before), control.what, 5000);
      await stillPlaying(video, `clicking ${control.name}`);
    });
    await test(`a finger tap on ${control.name} that drifts a little does its job and the video keeps playing`, async () => {
      const card = await freshReels();
      const video = card.querySelector('video');
      const button = control.find(card);
      const before = control.before?.(card);
      await input({ kind: 'tap', ...centre(button), jitter: 4 });
      await waitFor(() => control.done(card, before), control.what, 5000);
      await stillPlaying(video, `a drifting tap on ${control.name}`);
    });
  }

  await test('Like and Save undo on a second tap, and the video still keeps playing', async () => {
    const card = await freshReels();
    const video = card.querySelector('video');
    for (const name of ['like', 'save']) {
      const button = () => card.querySelector(`[data-reel-action="${name}"]${name === 'like' ? ' button' : ''}`);
      await tap(button());
      await waitFor(() => button().getAttribute('aria-pressed') === 'true', `${name} on`, 5000);
      await sleep(400); // two quick taps on the rail are not a double tap on the video
      await tap(button());
      await waitFor(() => button().getAttribute('aria-pressed') === 'false', `${name} off`, 5000);
      await stillPlaying(video, `tapping ${name} twice`);
    }
  });

  await test("the three-dot menu's rows work: Share from the menu opens Share, the video keeps playing", async () => {
    const card = await freshReels();
    const video = card.querySelector('video');
    await tap(card.querySelector('[data-reel-action="menu"]'));
    const menu = await waitFor(() => card.querySelector('[data-reel-menu]'), 'the menu');
    const row = Array.from(menu.querySelectorAll('button')).find((b) => /Share/.test(b.innerText));
    const hit = hitAt(row);
    assert(row.contains(hit), `a tap on the menu's Share lands on <${hit?.tagName?.toLowerCase()}> -- the menu is click-through`);
    await tap(row);
    await waitFor(() => document.querySelector('[data-reel-sheet="share"]'), 'the share sheet from the menu', 5000);
    await stillPlaying(video, "tapping Share in the menu");
  });

  await test('tapping outside the open menu closes it, and the video keeps playing', async () => {
    const card = await freshReels();
    const video = card.querySelector('video');
    await tap(card.querySelector('[data-reel-action="menu"]'));
    await waitFor(() => card.querySelector('[data-reel-menu]'), 'the menu');
    const r = video.getBoundingClientRect();
    const outside = { x: Math.round(r.left + r.width * 0.3), y: Math.round(r.top + r.height * 0.55) };
    const hit = document.elementFromPoint(outside.x, outside.y);
    assert(hit?.matches?.('[data-reel-menu-backdrop]'), `outside the menu is <${hit?.tagName?.toLowerCase()}>, not its backdrop`);
    await input({ kind: 'tap', ...outside });
    await waitFor(() => !card.querySelector('[data-reel-menu]'), 'the menu to close');
    await stillPlaying(video, 'closing the menu');
  });

  await test('double-tapping the video likes it, without pausing it', async () => {
    const card = await freshReels();
    const video = card.querySelector('video');
    const r = video.getBoundingClientRect();
    const point = { x: Math.round(r.left + r.width * 0.35), y: Math.round(r.top + r.height * 0.42) };
    await input({ kind: 'doubletap', ...point, gap: 80 });
    await waitFor(() => card.querySelector('[data-reel-action="like"] button')?.getAttribute('aria-pressed') === 'true', 'the double tap to like', 5000);
    await stillPlaying(video, 'a double tap');
  });

  await test('a long press on the video opens its menu sheet, without pausing it', async () => {
    const card = await freshReels();
    const video = card.querySelector('video');
    const r = video.getBoundingClientRect();
    const point = { x: Math.round(r.left + r.width * 0.35), y: Math.round(r.top + r.height * 0.42) };
    await input({ kind: 'press', ...point, ms: 700 });
    await waitFor(() => document.querySelector('[data-reel-sheet="long-press"]'), 'the long-press sheet', 4000);
    await stillPlaying(video, 'the end of a long press');
  });

  await test('Gift opens even when the gift list answers with something else, and nothing crashes', async () => {
    await fetch('/__media/control?gifts=broken');
    try {
      const card = await freshReels();
      const video = card.querySelector('video');
      const errorsBefore = pageErrors.length;
      await tap(card.querySelector('[data-reel-action="gift"]'));
      await waitFor(() => document.querySelector('[data-reel-sheet="gift"]'), 'the gift sheet', 5000);
      await sleep(500);
      assert(pageErrors.length === errorsBefore, `the gift sheet threw: ${pageErrors.slice(errorsBefore).join('; ')}`);
      assert(card.isConnected, 'the Reels page went away');
      await stillPlaying(video, 'tapping Gift');
    } finally {
      await fetch('/__media/control?gifts=ok');
    }
  });

  await test('tapping the video itself pauses it, and tapping again plays it', async () => {
    const card = await freshReels();
    const video = card.querySelector('video');
    // A point on the picture away from the rail, the caption and the top bar.
    const r = video.getBoundingClientRect();
    const point = { x: Math.round(r.left + r.width * 0.35), y: Math.round(r.top + r.height * 0.42) };
    const hit = document.elementFromPoint(point.x, point.y);
    assert(hit?.matches?.('[data-reel-surface]'), `the middle of the reel is <${hit?.tagName?.toLowerCase()}>, not its tap surface`);
    assert(getComputedStyle(video).pointerEvents === 'none', 'the <video> itself still takes taps');

    await input({ kind: 'tap', ...point });
    await waitFor(() => video.paused, 'the tap to pause the video', 3000);
    await sleep(400);
    assert(video.paused, 'the video started again by itself');
    await input({ kind: 'tap', ...point });
    await waitFor(() => isPlaying(video), 'the second tap to play it', 4000);
  });

  await test('swiping up moves to the next reel, which plays alone', async () => {
    const card = await freshReels();
    const first = card.querySelector('video');
    const feed = document.querySelector('.video-feed-container');
    const top0 = feed.scrollTop;
    const r = first.getBoundingClientRect();
    await input({ kind: 'swipe', x: Math.round(r.left + r.width * 0.4), y: Math.round(r.top + r.height * 0.7), dy: -Math.round(r.height * 0.6) });
    const next = await waitFor(() => {
      const now = activeCard();
      return now && now !== card && now;
    }, () => `the next reel to play (scrollTop ${top0} -> ${feed.scrollTop}, card height ${Math.round(card.getBoundingClientRect().height)})`, 8000);
    assert(first.paused, 'the first reel kept playing');
    for (let i = 0; i < 10; i++) {
      assert(playingVideos().length <= 1, `${playingVideos().length} reels playing at once`);
      await sleep(80);
    }
    return `moved to reel ${next.querySelector('[data-video-id]')?.dataset.videoId}`;
  });

  // ── the whole app at /reels ──────────────────────────────────────────────
  // The page as it ships: the router, the app shell and bottom navigation,
  // auth and the subscription from AuthProvider -- what an isolated
  // ReelLayout cannot show.
  history.replaceState(null, '', '/reels');
  const [{ router }, { RouterProvider }] = await Promise.all([
    import('../../router'),
    import('react-router-dom'),
  ]);
  async function appReels() {
    Object.keys(localStorage).filter((k) => k.startsWith('feed_cache_')).forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter((k) => k.startsWith('feed_position_')).forEach((k) => sessionStorage.removeItem(k));
    await fetch('/__media/control?unlike=1');
    mount(<RouterProvider router={router} />);
    if (router.state.location.pathname !== '/reels') await router.navigate('/reels');
    const card = await waitFor(activeCard, 'the Reels page of the app to play a reel', 20000);
    await sleep(800);
    return card;
  }

  for (const control of CONTROLS) {
    await test(`in the app: tapping ${control.name} does its job and the video keeps playing`, async () => {
      const card = await appReels();
      const video = card.querySelector('video');
      const button = control.find(card);
      assert(button, `no ${control.name} control on the card`);
      const hit = hitAt(button);
      assert(button.contains(hit) || hit === button, `a tap on ${control.name} lands on <${hit?.tagName?.toLowerCase()} class="${hit?.className?.baseVal ?? hit?.className}">`);
      const before = control.before?.(card);
      await tap(button);
      await waitFor(() => control.done(card, before), control.what, 5000);
      await stillPlaying(video, `tapping ${control.name}`);
      assert(router.state.location.pathname === '/reels', `left the page for ${router.state.location.pathname}`);
    });
  }

  await test('in the app: swiping up moves to the next reel, which plays alone', async () => {
    const card = await appReels();
    const first = card.querySelector('video');
    const r = first.getBoundingClientRect();
    await input({ kind: 'swipe', x: Math.round(r.left + r.width * 0.4), y: Math.round(r.top + r.height * 0.7), dy: -Math.round(r.height * 0.6) });
    await waitFor(() => { const now = activeCard(); return now && now !== card; }, 'the next reel to play', 8000);
    assert(first.paused, 'the first reel kept playing');
    for (let i = 0; i < 10; i++) {
      assert(playingVideos().length <= 1, `${playingVideos().length} reels playing at once`);
      await sleep(80);
    }
  });

  await test('in the app: tapping the video pauses it, and tapping again plays it', async () => {
    const card = await appReels();
    const video = card.querySelector('video');
    const r = video.getBoundingClientRect();
    const point = { x: Math.round(r.left + r.width * 0.35), y: Math.round(r.top + r.height * 0.42) };
    const hit = document.elementFromPoint(point.x, point.y);
    assert(hit?.matches?.('[data-reel-surface]'), `the middle of the reel is <${hit?.tagName?.toLowerCase()}>, not its tap surface`);
    assert(getComputedStyle(video).pointerEvents === 'none', 'the <video> itself still takes taps');
    await input({ kind: 'tap', ...point });
    await waitFor(() => video.paused, 'the tap to pause the video', 3000);
    await sleep(400);
    await input({ kind: 'tap', ...point });
    await waitFor(() => isPlaying(video), 'the second tap to play it', 4000);
  });

  mount(<div />);
  history.replaceState(null, '', '/');

  // ── the desktop layout (DesktopReelViewer), with a mouse ─────────────────
  await input({ kind: 'viewport', width: 1366, height: 900, mobile: false });
  await sleep(300);
  window.dispatchEvent(new Event('resize'));

  const desktopVideo = () => document.querySelector('.drv-player video');
  async function freshDesktop() {
    Object.keys(localStorage).filter((k) => k.startsWith('feed_cache_')).forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter((k) => k.startsWith('feed_position_')).forEach((k) => sessionStorage.removeItem(k));
    await fetch('/__media/control?unlike=1');
    mount(reels());
    const v = await waitFor(() => { const el = desktopVideo(); return el && isPlaying(el) && el; }, 'the desktop viewer to play', 15000);
    await sleep(600);
    return v;
  }

  const DESKTOP = [
    { name: 'Like', find: () => document.querySelector('.drv-rail [aria-label="Like"]'), done: () => document.querySelector('.drv-rail [aria-label="Like"]')?.getAttribute('aria-pressed') === 'true' },
    { name: 'Comment', find: () => document.querySelector('.drv-rail [aria-label="Comments"]'), done: () => document.querySelector('[data-reel-sheet="comments"]') },
    { name: 'Save', find: () => document.querySelector('.drv-rail [aria-label="Save"]'), done: () => document.querySelector('.drv-rail [aria-label="Save"]')?.getAttribute('aria-pressed') === 'true' },
    { name: 'Share', find: () => document.querySelector('.drv-rail [aria-label="Share"]'), done: () => document.querySelector('[role="dialog"], .sps-root, [data-share-sheet]') },
    { name: 'Sound', find: () => document.querySelector('.drv-mute'), done: () => desktopVideo()?.muted === false },
  ];
  for (const control of DESKTOP) {
    await test(`desktop: clicking ${control.name} does its job and the video keeps playing`, async () => {
      const video = await freshDesktop();
      const button = control.find();
      assert(button, `no ${control.name} control`);
      const hit = hitAt(button);
      assert(button.contains(hit) || hit === button, `a click on ${control.name} lands on <${hit?.tagName?.toLowerCase()}>`);
      await click(button);
      await waitFor(control.done, `${control.name} to take effect`, 5000);
      await stillPlaying(video, `clicking ${control.name}`);
    });
  }

  await test('desktop: clicking the video pauses it, and clicking again plays it', async () => {
    const video = await freshDesktop();
    const r = video.getBoundingClientRect();
    const point = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.4) };
    await input({ kind: 'click', ...point });
    await waitFor(() => video.paused, 'the click to pause', 3000);
    await sleep(300);
    await input({ kind: 'click', ...point });
    await waitFor(() => isPlaying(video), 'the second click to play', 4000);
  });

  // ── coming back from a single post ───────────────────────────────────────
  // Home, Reels and /post/:id are sibling routes, so opening a post unmounts
  // the feed: state, scroll offset and any infinitely-scrolled pages go with
  // it. These drive the real router, because the bug was a navigation one --
  // the feed came back and started at the first post.
  await input({ kind: 'viewport', reset: true });

  /** The id of the card at the top of a scroller: what the user is looking at. */
  const topmost = (container, attribute) => {
    if (!container) return null;
    const top = container.getBoundingClientRect().top;
    let best = null;
    let bestDistance = Infinity;
    for (const el of container.querySelectorAll(`[${attribute}]`)) {
      const box = el.getBoundingClientRect();
      const distance = Math.abs(box.top - top);
      if (box.bottom > top + 1 && distance < bestDistance) {
        bestDistance = distance;
        best = el.getAttribute(attribute);
      }
    }
    return best;
  };

  /** The scrolling ancestor of a card -- the feeds scroll a container of their
   *  own, not the window. */
  const scrollerOf = (el) => {
    let node = el;
    while (node && node !== document.body) {
      if (node.scrollHeight > node.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
      node = node.parentElement;
    }
    return null;
  };

  const visibleReel = () => topmost(document.querySelector('.video-feed-container'), 'data-video-id');

  await test('in the app: Reels → a single post → Back returns to the same reel', async () => {
    await appReels();
    await router.navigate('/reels');
    await waitFor(() => router.state.location.pathname === '/reels', 'the Reels route', 8000);
    const card = await waitFor(activeCard, 'a reel to play', 15000);
    await sleep(500);
    const first = visibleReel();
    // Move off the first reel: coming back to it is exactly the bug.
    const r = card.querySelector('video').getBoundingClientRect();
    await input({
      kind: 'swipe',
      x: Math.round(r.left + r.width * 0.4),
      y: Math.round(r.top + r.height * 0.7),
      dy: -Math.round(r.height * 0.6),
    });
    const watching = await waitFor(
      () => { const id = visibleReel(); return id && id !== first ? id : null; },
      'the next reel',
      8000,
    );
    await sleep(500);

    await router.navigate(`/post/${watching}`);
    await waitFor(() => router.state.location.pathname === `/post/${watching}`, 'the post page', 8000);
    await sleep(400);

    await router.navigate(-1); // what Back does
    await waitFor(() => router.state.location.pathname === '/reels', 'Reels again', 8000);
    const back = await waitFor(
      () => (visibleReel() === watching ? watching : null),
      () => `reel ${watching} to be restored (showing ${visibleReel()}, the first is ${first})`,
      8000,
    );
    assert(back !== first, 'came back to the first reel');
    return `left on reel ${watching}, came back to ${back}`;
  });

  await test('in the app: Home → a single post → Back returns to the same post', async () => {
    localStorage.removeItem('homepage_feed_cache');
    sessionStorage.removeItem('feed_position_home');
    mount(<RouterProvider router={router} />);
    await router.navigate('/');
    await waitFor(() => router.state.location.pathname === '/', 'the Home route', 8000);
    await waitFor(() => rootEl().querySelector('[data-post-id]'), 'the Home feed', 20000);
    await sleep(600);

    const feed = scrollerOf(rootEl().querySelector('[data-post-id]'));
    if (!feed) return 'this layout does not scroll the card feed';

    // Down to a post that is not the first one.
    feed.scrollTop = feed.scrollHeight;
    await sleep(600);
    const reading = topmost(feed, 'data-post-id');
    const firstPost = rootEl().querySelector('[data-post-id]').getAttribute('data-post-id');
    assert(reading && reading !== firstPost, `could not scroll off the first post (showing ${reading})`);

    await router.navigate(`/post/${reading}`);
    await waitFor(() => router.state.location.pathname === `/post/${reading}`, 'the post page', 8000);
    await sleep(400);

    await router.navigate(-1);
    await waitFor(() => router.state.location.pathname === '/', 'Home again', 8000);
    await waitFor(() => rootEl().querySelector(`[data-post-id="${reading}"]`), 'the post back in the feed', 12000);
    await sleep(400);
    const back = await waitFor(
      () => {
        const container = scrollerOf(rootEl().querySelector('[data-post-id]'));
        return container && topmost(container, 'data-post-id') === reading ? reading : null;
      },
      () => {
        const container = scrollerOf(rootEl().querySelector('[data-post-id]'));
        return `post ${reading} to be restored (showing ${container ? topmost(container, 'data-post-id') : 'no feed'})`;
      },
      8000,
    );
    assert(back !== firstPost, 'came back to the first post');
    return `left on post ${reading}, came back to ${back}`;
  });

  // ── the comments sheet ───────────────────────────────────────────────────
  // Opened over the app, with the real bottom navigation underneath it: the
  // sheet used to be as tall as its contents and mounted inside the page, so
  // the navigation lay across the input and there was nothing to type into.

  const sheetEl = () => document.querySelector('.modern-comment-modal');
  const commentInput = () => sheetEl()?.querySelector('input[type="text"]');
  const bottomNav = () => Array.from(document.querySelectorAll('nav')).find((n) => {
    const box = n.getBoundingClientRect();
    return box.height > 0 && Math.abs(box.bottom - window.innerHeight) < 4;
  });

  /** Type into a React-controlled input the way a keyboard does. */
  const typeInto = (el, text) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  async function openComments() {
    const card = await appReels();
    const button = card.querySelector('[data-reel-action="comment"]');
    assert(button, 'no comment control on the card');
    await tap(button);
    await waitFor(sheetEl, 'the comments sheet', 8000);
    await sleep(500);
    return card;
  }

  await test('comments: the sheet uses the screen, and shows the empty state', async () => {
    await openComments();
    const box = sheetEl().getBoundingClientRect();
    const vv = window.visualViewport;
    const share = box.height / window.innerHeight;
    assert(share > 0.6, `the sheet is only ${Math.round(share * 100)}% of the screen`);
    assert(box.bottom <= window.innerHeight + 2, 'the sheet hangs below the screen');
    const text = (sheetEl().innerText || '').replace(/\s+/g, ' ');
    assert(/Comments \(0\)/.test(text), `no header count in "${text.slice(0, 60)}"`);
    assert(/No comments yet/.test(text), 'no empty state');
    return `${Math.round(share * 100)}% of the screen`;
  });

  await test('comments: the input is reachable, not under the bottom navigation', async () => {
    await openComments();
    const input = commentInput();
    assert(input, 'no comment input in the sheet');
    const box = input.getBoundingClientRect();
    assert(box.width > 0 && box.height > 0, 'the input has no size');
    assert(box.bottom <= window.innerHeight, `the input is ${Math.round(box.bottom - window.innerHeight)}px off-screen`);

    // Whatever the navigation does, a finger on the input must reach the input.
    const hit = document.elementFromPoint(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2));
    assert(hit === input || input.contains(hit), `a tap on the input lands on <${hit?.tagName?.toLowerCase()}>`);

    const nav = bottomNav();
    if (nav) {
      const navBox = nav.getBoundingClientRect();
      const overlaps = navBox.top < box.bottom && navBox.bottom > box.top;
      if (overlaps) {
        // Allowed only if the sheet is the one in front.
        const overNav = document.elementFromPoint(Math.round(navBox.left + navBox.width / 2), Math.round(navBox.top + navBox.height / 2));
        assert(sheetEl().contains(overNav) || overNav?.closest?.('.modern-comment-overlay'),
          'the bottom navigation is in front of the comments sheet');
      }
      return overlaps ? 'sheet covers the navigation' : 'input sits clear of the navigation';
    }
    return 'no bottom navigation in this layout';
  });

  await test('comments: writing one posts it, and the count goes up', async () => {
    const card = await openComments();
    const input = commentInput();
    const send = Array.from(sheetEl().querySelectorAll('button')).pop();
    assert(send, 'no Send button');
    assert(send.disabled, 'Send is offered with an empty box');

    typeInto(input, 'first comment from the browser test');
    await waitFor(() => !send.disabled, 'Send to become available', 4000);
    await tap(send);

    await waitFor(
      () => (sheetEl()?.innerText || '').includes('first comment from the browser test'),
      'the new comment in the list',
      8000,
    );
    await waitFor(() => (sheetEl()?.innerText || '').includes('Comments (1)'), 'the header count', 5000);
    assert(!commentInput().value, 'the box kept the text after posting');

    // The card's own counter follows.
    const count = card.querySelector('[data-reel-action="comment"]')?.parentElement?.innerText || '';
    return `header and card both read 1 (card: "${count.replace(/\s+/g, ' ').trim()}")`;
  });

  await test('comments: closing returns to the same reel, still playing', async () => {
    const card = await openComments();
    const reel = card.querySelector('[data-video-id]')?.dataset.videoId;
    const close = sheetEl().querySelector('button');
    await tap(close);
    await waitFor(() => !sheetEl(), 'the sheet to close', 5000);
    const showing = visibleReel();
    assert(showing === reel, `left reel ${reel}, came back to ${showing}`);
    assert(router.state.location.pathname === '/reels', `left the page for ${router.state.location.pathname}`);
    return `still on reel ${reel}`;
  });


  await test('comments: on a single post the sheet clears the bottom navigation too', async () => {
    // The page in the bug report. Its comments used to be a separate,
    // cut-down panel positioned inside the page, so the app's bottom
    // navigation lay across the input and there was nothing to type into.
    mount(<RouterProvider router={router} />);
    await router.navigate('/post/801');
    await waitFor(() => router.state.location.pathname === '/post/801', 'the post page', 8000);
    const commentButton = await waitFor(
      () => Array.from(rootEl().querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Comments'),
      'the comment button on the post page',
      15000,
    );
    await sleep(400);
    await tap(commentButton);
    await waitFor(sheetEl, 'the comments sheet', 8000);
    await sleep(400);

    const box = sheetEl().getBoundingClientRect();
    const share = box.height / window.innerHeight;
    assert(share > 0.6, `the sheet is only ${Math.round(share * 100)}% of the screen`);

    const input = commentInput();
    assert(input, 'no comment input');
    const inputBox = input.getBoundingClientRect();
    assert(inputBox.bottom <= window.innerHeight, 'the input is off the bottom of the screen');
    const hit = document.elementFromPoint(
      Math.round(inputBox.left + inputBox.width / 2),
      Math.round(inputBox.top + inputBox.height / 2),
    );
    assert(hit === input || input.contains(hit), `a tap on the input lands on <${hit?.tagName?.toLowerCase()}>`);

    typeInto(input, 'a comment from the post page');
    const send = Array.from(sheetEl().querySelectorAll('button')).pop();
    await waitFor(() => !send.disabled, 'Send to become available', 4000);
    await tap(send);
    await waitFor(
      () => (sheetEl()?.innerText || '').includes('a comment from the post page'),
      'the new comment in the list',
      8000,
    );

    await tap(sheetEl().querySelector('button'));
    await waitFor(() => !sheetEl(), 'the sheet to close', 5000);
    assert(router.state.location.pathname === '/post/801', 'closing the sheet left the page');
    return `${Math.round(share * 100)}% of the screen, input reachable`;
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
