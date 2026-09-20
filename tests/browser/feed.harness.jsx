/**
 * A Home feed card while its media is not there yet (see run.mjs).
 *
 * The complaint: a post on Home sometimes shows nothing but the author's
 * avatar and name. This measures the frame the media goes in, in the states
 * where there is nothing to draw in it:
 *
 *   slow         the request is held open and never answers -- no load event,
 *                no error event, no intrinsic size (run.mjs ?stall=)
 *   lost         storage 404s the file
 *   processing   the worker has not finished; there is no URL at all
 *   failed       it could not be processed
 *   ready        the ordinary case, which must keep its natural height and
 *                lose the placeholder once the picture is there
 *
 * An <img> that has not loaded is 0px tall, so a card whose frame collapses
 * really is just the header -- which is what these assert against. Heights
 * are read from getBoundingClientRect, so what is checked is what the browser
 * laid out, not what the style prop said.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { PostCard } from '../../pages/feed/HomePage';

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

const T = {
  cardBg: '#1A1A1A', border: '#2a2a2a', txt: '#fff', sub: '#9a9a9a', pri: '#8fc441',
  bg: '#0b0b0b', inputBg: '#161616',
};

const ORIGIN = window.location.origin;
const MEDIA = {
  photoFull: `${ORIGIN}/media/processed/images/940/v1/full.jpg`,
  photoWebp: `${ORIGIN}/media/processed/images/940/v1/full.webp`,
  photo720: `${ORIGIN}/media/processed/images/940/v1/720w.jpg`,
  photoWebp720: `${ORIGIN}/media/processed/images/940/v1/720w.webp`,
  photoThumb: `${ORIGIN}/media/processed/thumbnails/940/v1/thumb.png`,
  video720: `${ORIGIN}/media/processed/videos/941/v1/720p.webm`,
  video480: `${ORIGIN}/media/processed/videos/941/v1/480p.webm`,
  videoThumb: `${ORIGIN}/media/processed/thumbnails/941/v1/thumb.png`,
  // Its own URLs, never stalled: a request the server is still holding open
  // is one the browser reuses for the next <img> with the same src, so the
  // good case cannot share a URL with the slow one.
  goodFull: `${ORIGIN}/media/processed/images/944/v1/full.jpg`,
  goodWebp: `${ORIGIN}/media/processed/images/944/v1/full.webp`,
  good720: `${ORIGIN}/media/processed/images/944/v1/720w.jpg`,
  goodWebp720: `${ORIGIN}/media/processed/images/944/v1/720w.webp`,
  goodThumb: `${ORIGIN}/media/processed/thumbnails/944/v1/thumb.png`,
  // 823 is a photo run.mjs knows: recovery asks it about this post, and it
  // has to answer as the same photo, minus whatever storage has lost.
  lostFull: `${ORIGIN}/media/processed/images/823/v1/full.jpg`,
  lostWebp: `${ORIGIN}/media/processed/images/823/v1/full.webp`,
  lost360: `${ORIGIN}/media/processed/images/823/v1/360w.jpg`,
  lostWebp360: `${ORIGIN}/media/processed/images/823/v1/360w.webp`,
  lost720: `${ORIGIN}/media/processed/images/823/v1/720w.jpg`,
  lostWebp720: `${ORIGIN}/media/processed/images/823/v1/720w.webp`,
  lostThumb: `${ORIGIN}/media/processed/thumbnails/823/v1/thumb.png`,
};

const photoPost = (over = {}) => ({
  id: 940,
  user: { id: 5, username: 'creator940', profile_photo: null },
  caption: 'a photo',
  hashtags_list: [],
  media: null,
  image: MEDIA.photoFull,
  image_variants: { 720: MEDIA.photo720 },
  image_webp_variants: { 720: MEDIA.photoWebp720, full: MEDIA.photoWebp },
  thumbnail: MEDIA.photoThumb,
  media_type: 'image',
  processing_status: 'READY',
  processing_error: null,
  votes: 0, comment_count: 0, shares: 0,
  created_at: new Date().toISOString(),
  ...over,
});

const videoPost = (over = {}) => ({
  id: 941,
  user: { id: 6, username: 'creator941', profile_photo: null },
  caption: 'a clip',
  hashtags_list: [],
  media: MEDIA.video720,
  media_variants: { 480: MEDIA.video480 },
  image: null,
  thumbnail: MEDIA.videoThumb,
  media_type: 'video',
  processing_status: 'READY',
  processing_error: null,
  votes: 0, comment_count: 0, shares: 0,
  created_at: new Date().toISOString(),
  ...over,
});

// ── mounting ────────────────────────────────────────────────────────────────

let root = null;
const host = document.getElementById('root');

function mount(post) {
  if (root) { root.unmount(); root = null; }
  host.innerHTML = '';
  const el = document.createElement('div');
  // The real feed column: the card is max-width 560 and fills what it is given.
  el.style.width = '420px';
  host.appendChild(el);
  root = createRoot(el);
  root.render(
    <PostCard
      post={post}
      index={3}
      currentUser={{ id: 1, username: 'viewer' }}
      T={T}
      subscriptionStatus={{ has_subscription: true }}
    />,
  );
}

const frame = () => document.querySelector('[data-media-frame]');
const frameHeight = () => {
  const el = frame();
  return el ? Math.round(el.getBoundingClientRect().height) : 0;
};
const cardText = () => (host.innerText || '').replace(/\s+/g, ' ').trim();

async function control(query) {
  await fetch(`/__media/control?${query}`);
}

async function settle(ms = 600) {
  await sleep(ms);
}

async function waitFor(fn, what, ms = 10000) {
  const t0 = performance.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (performance.now() - t0 > ms) throw new Error(`${what} (waited ${Math.round(ms)}ms)`);
    await sleep(120);
  }
}

// ── the tests ───────────────────────────────────────────────────────────────

async function run() {
  // Everything the stalled cases need, held open before anything mounts.
  await control(
    `stall=${[
      new URL(MEDIA.photoFull).pathname,
      new URL(MEDIA.photoWebp).pathname,
      new URL(MEDIA.photo720).pathname,
      new URL(MEDIA.photoWebp720).pathname,
      new URL(MEDIA.photoThumb).pathname,
      new URL(MEDIA.video720).pathname,
      new URL(MEDIA.video480).pathname,
      new URL(MEDIA.videoThumb).pathname,
    ].join(',')}`,
  );

  await test('a photo that has not arrived still holds its place', async () => {
    mount(photoPost());
    await settle();
    const h = frameHeight();
    assert(frame(), 'no media frame in the card at all');
    assert(h >= 200, `the frame collapsed to ${h}px -- the card is just the header`);
    return `${h}px held`;
  });

  await test('the card is more than an avatar and a name while it waits', async () => {
    mount(photoPost());
    await settle();
    const card = host.firstElementChild.getBoundingClientRect().height;
    const media = frameHeight();
    assert(media / card > 0.4, `media is ${media}px of a ${Math.round(card)}px card`);
    return `${media}px of ${Math.round(card)}px`;
  });

  await test('something branded is shown in the held frame, not an empty box', async () => {
    mount(photoPost());
    await settle();
    const logo = frame().querySelector('img[data-media-placeholder]');
    assert(logo, 'no placeholder inside the frame');
    const box = logo.getBoundingClientRect();
    assert(box.width > 20 && box.height > 20, `placeholder laid out at ${box.width}x${box.height}`);
    return `placeholder ${Math.round(box.width)}x${Math.round(box.height)}`;
  });

  await test('a video whose poster has not arrived holds its place too', async () => {
    mount(videoPost());
    await settle();
    const h = frameHeight();
    assert(h >= 200, `the frame collapsed to ${h}px`);
    return `${h}px held`;
  });

  await test('a post still being processed says so rather than showing nothing', async () => {
    mount(photoPost({
      processing_status: 'PROCESSING', processing_progress: 40,
      media: null, image: null, thumbnail: null,
    }));
    await settle();
    const h = frameHeight();
    const text = cardText().toLowerCase();
    assert(h >= 200, `the frame collapsed to ${h}px`);
    assert(text.includes('preparing'), `card said: ${cardText()}`);
    return `${h}px, "preparing"`;
  });

  await test('a post that could not be processed says why', async () => {
    mount(videoPost({
      processing_status: 'FAILED', processing_error: 'video_too_long',
      media: null, image: null, thumbnail: null,
    }));
    await settle();
    const h = frameHeight();
    const text = cardText().toLowerCase();
    assert(h >= 200, `the frame collapsed to ${h}px`);
    assert(text.includes("couldn't process"), `card said: ${cardText()}`);
    return `${h}px, failure shown`;
  });

  await test('a photo that does arrive is shown at its own size', async () => {
    await control('restore=1');
    mount(photoPost({
      id: 944,
      image: MEDIA.goodFull,
      image_variants: { 720: MEDIA.good720 },
      image_webp_variants: { 720: MEDIA.goodWebp720, full: MEDIA.goodWebp },
      thumbnail: MEDIA.goodThumb,
    }));
    const img = await waitFor(() => {
      const el = frame() && frame().querySelector('img:not([data-media-placeholder])');
      return el && el.naturalWidth > 0 ? el : null;
    }, 'the image never loaded');
    const h = frameHeight();
    assert(h > 0, 'the frame is empty');
    // The placeholder must get out of the way, or the picture is covered.
    assert(!frame().querySelector('img[data-media-placeholder]'), 'the placeholder stayed over the picture');
    return `${h}px, ${img.naturalWidth}x${img.naturalHeight} shown`;
  });

  await test('a photo storage has lost shows the unavailable state, not a gap', async () => {
    await control('restore=1');
    await control(`lose=${[
      new URL(MEDIA.lostFull).pathname,
      new URL(MEDIA.lostWebp).pathname,
      new URL(MEDIA.lost360).pathname,
      new URL(MEDIA.lostWebp360).pathname,
      new URL(MEDIA.lost720).pathname,
      new URL(MEDIA.lostWebp720).pathname,
      new URL(MEDIA.lostThumb).pathname,
    ].join(',')}`);
    // Last, and on its own post id: mediaRecovery is one service for the
    // page, and a post it has given up on stays given up.
    mount(photoPost({
      id: 823,
      image: MEDIA.lostFull,
      image_variants: { 360: MEDIA.lost360, 720: MEDIA.lost720 },
      image_webp_variants: { 360: MEDIA.lostWebp360, 720: MEDIA.lostWebp720, full: MEDIA.lostWebp },
      thumbnail: MEDIA.lostThumb,
    }));
    // Recovery is attempted and retried first (utils/mediaRecovery.js), so
    // this waits for the card to give up rather than for the first 404.
    await waitFor(
      () => frame() && frame().querySelector('[data-media-unavailable]'),
      'the card never reached the unavailable state',
    );
    const h = frameHeight();
    assert(h >= 200, `the frame collapsed to ${h}px`);
    return `${h}px, unavailable`;
  });

  await test('no uncaught errors from the page', async () => {
    assert(pageErrors.length === 0, pageErrors.join(' | '));
  });

  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
}

run().catch(async (e) => {
  results.push({ name: 'the harness itself', ok: false, detail: String((e && e.stack) || e) });
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
});
