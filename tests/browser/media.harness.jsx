/**
 * Processed media in a browser (see run.mjs): the page an author lands on
 * after posting, the Reels feed, and the campaign feed.
 *
 * The API here is the stub in run.mjs, answering the way
 * api/serializers/core.py does once the worker has processed a post: 720p in
 * `media`, 360p/480p in `media_variants`, a thumbnail, WebP twins for photos,
 * and never a URL for the original. The video files are real: the harness
 * records short WebM clips and registers them with the stub at the rung
 * paths. The stub logs every /media/ request, so the suite checks what the
 * page actually fetched, not only what it put in a src attribute:
 *
 *   processing   the post page shows its state, then the video once READY
 *   renditions   the rung matches the connection (slow 360p, normal 480p)
 *   one video    only the visible Reels card plays; campaign videos pause
 *                each other; nothing autoplays by attribute
 *   thumbnails   campaign videos fetch nothing until played
 *   WebP         a photo is fetched once, as WebP, with the JPEG as fallback
 *   originals    no request ever goes to source/
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { VideoDetailPage } from '../../pages/feed/VideoDetailPage';
import { ReelLayout } from '../../components/feed/ReelLayout';
import CampaignFeed from '../../pages/campaign/CampaignFeed';
import { UploadProgressIndicator } from '../../components/common/UploadProgressIndicator';
import { uploadTracker } from '../../services/uploadTracker';
import { STORE_KEY, createUploadTracker } from '../../utils/uploadTracker';
import api from '../../api';

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
      const label = typeof what === 'function' ? what() : what;
      throw new Error(`timed out waiting for ${label}; page shows: "${pageText().replace(/\s+/g, ' ').slice(0, 260)}"`);
    }
    await sleep(50);
  }
}

const videos = () => Array.from(rootEl().querySelectorAll('video'));
const isPlaying = (v) => !v.paused && !v.ended && v.readyState >= 2;
const playing = () => videos().filter(isPlaying);
const pathOf = (url) => (url ? new URL(url, location.href).pathname : '');
const mediaRequests = (clear = false) => fetch(`/__media/requests${clear ? '?clear=1' : ''}`).then((r) => r.json());

/** Sample for `ms`: never more than one video playing at a time. */
async function neverTwoAtOnce(ms) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const now = playing();
    assert(now.length <= 1, `${now.length} videos playing at once: ${now.map((v) => pathOf(v.src)).join(', ')}`);
    await sleep(60);
  }
}

// What utils/connection.js reads. null is what Safari reports (no API).
let connection = null;
Object.defineProperty(navigator, 'connection', { configurable: true, get: () => connection });
const NETWORK = { slow: { effectiveType: '3g' }, normal: null, fast: { effectiveType: '4g', downlink: 20 } };

// ── media files ─────────────────────────────────────────────────────────────

/** A short real WebM: a coloured frame with a moving square. */
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

// ── the pages ───────────────────────────────────────────────────────────────

localStorage.setItem('authToken', 'e2e-token');
const me = { id: 1, username: 'e2e_author' };
let root = null;

function mount(element) {
  if (root) root.unmount();
  document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch { /* detached */ } });
  root = createRoot(rootEl());
  root.render(
    <ThemeProvider>
      <LanguageProvider>{element}</LanguageProvider>
    </ThemeProvider>
  );
}

// ── the tests ──────────────────────────────────────────────────────────────

async function run() {
  // One at a time, with a second try: three recorders at once occasionally
  // came back empty in headless Chrome.
  const clips = [];
  for (const color of ['#1d4ed8', '#b91c1c', '#15803d']) {
    let clip = await recordClip(color);
    if (clip.size < 1000) clip = await recordClip(color);
    clips.push(clip);
  }
  assert(clips.every((c) => c.size > 1000), `recorded clips are ${clips.map((c) => c.size)} bytes`);
  await registerRungs([801, 802, 803, 900, 811, 812], clips);

  await test('the page a new post lands on shows it is being prepared, then plays it', async () => {
    connection = NETWORK.normal;
    await mediaRequests(true);
    mount(<VideoDetailPage reelId={900} user={me} onBack={() => {}} subscriptionStatus={{ has_subscription: true }} />);
    await waitFor(() => /Preparing your post/.test(pageText()), 'the processing state');
    assert(/optimizing your media/.test(pageText()), 'the processing explanation is missing');
    assert(videos().length === 0, 'a player was shown with nothing to play');

    await fetch('/__media/control?ready=900'); // the worker finishes
    const v = await waitFor(() => videos()[0], 'the video, once the post is READY', 15000);
    assert(pathOf(v.src) === '/media/processed/videos/900/v1/480p.webm', `plays ${pathOf(v.src)}, expected the 480p rung`);
    assert(pathOf(v.poster).endsWith('/thumb.png'), 'no thumbnail poster');
    await waitFor(() => isPlaying(v), 'playback', 10000);
    assert(!/Preparing your post/.test(pageText()), 'the processing state stayed up');
    return `swapped in by polling: ${pathOf(v.src)}`;
  });

  await test('a post that failed says why, in words, and offers nothing to play', async () => {
    mount(<VideoDetailPage reelId={901} user={me} onBack={() => {}} subscriptionStatus={{ has_subscription: true }} />);
    await waitFor(() => /couldn't process this media/.test(pageText()), 'the failed state');
    assert(/longer than allowed/.test(pageText()), 'the reason is missing');
    assert(!/traceback|exception|ffmpeg|errno|\/srv\/|video_too_long/i.test(pageText()), 'technical detail shown');
    assert(videos().length === 0, 'a player was shown');
  });

  await test('Reels: only the visible video plays, as the rung for a slow connection', async () => {
    connection = NETWORK.slow;
    await mediaRequests(true);
    mount(<ReelLayout user={me} activeTab="reels" videosOnly subscriptionStatus={{ has_subscription: true }} />);
    await waitFor(() => videos().length === 3, 'three reels', 10000);
    const all = videos();
    assert(all.every((v) => /\/360p\.webm$/.test(pathOf(v.src))), `sources: ${all.map((v) => pathOf(v.src)).join(', ')}`);
    assert(all.every((v) => !v.hasAttribute('autoplay')), 'a reel autoplays by attribute');

    // The stub answers at once, so the feed data is in before the cards'
    // 100ms mount delay -- the case the feed cache also creates.
    const state = () => videos().map((v) => `${pathOf(v.src).split('/')[4]} paused=${v.paused} ready=${v.readyState}`).join(', ');
    const first = (await waitFor(() => playing().length === 1 && playing(), () => `the first reel to play (${state()})`, 12000))[0];
    await neverTwoAtOnce(1200);

    const cards = Array.from(rootEl().querySelectorAll('[data-video-id]'));
    const current = cards.findIndex((c) => c.contains(first));
    const next = cards[(current + 1) % cards.length];
    const nextVideo = next.querySelector('video');
    next.scrollIntoView({ block: 'start' });
    await waitFor(() => isPlaying(nextVideo) && first.paused, 'the next reel to take over', 10000);
    await neverTwoAtOnce(1200);

    const reqs = await mediaRequests();
    const fetched = reqs.filter((p) => p.endsWith('.webm'));
    assert(!reqs.some((p) => p.includes('/source/')), `an original was requested: ${reqs}`);
    assert(fetched.length > 0 && fetched.every((p) => p.endsWith('/360p.webm')), `on a slow connection it fetched ${fetched}`);
    return `${new Set(fetched).size} file(s) fetched, all 360p`;
  });

  await test('campaign feed: thumbnails first, the rung for the connection, one video at a time', async () => {
    connection = NETWORK.normal;
    await mediaRequests(true);
    mount(<CampaignFeed campaignId={7} onBack={() => {}} />);
    await waitFor(() => videos().length === 2, 'the two campaign videos', 10000);
    const [a, b] = videos();
    assert(pathOf(a.src) === '/media/processed/videos/811/v1/480p.webm', `first entry plays ${pathOf(a.src)}`);
    assert(pathOf(b.src) === '/media/processed/videos/812/v1/480p.webm', `second entry plays ${pathOf(b.src)}`);
    assert(a.getAttribute('preload') === 'none' && pathOf(a.poster).endsWith('/thumb.png'), 'not thumbnail-first');

    await sleep(500);
    let reqs = await mediaRequests();
    assert(!reqs.some((p) => p.endsWith('.webm')), `video fetched before anyone pressed play: ${reqs.filter((p) => p.endsWith('.webm'))}`);

    a.muted = true;
    await a.play();
    await waitFor(() => isPlaying(a), 'the first entry to play', 10000);
    b.muted = true;
    await b.play();
    await waitFor(() => isPlaying(b) && a.paused, 'the second entry to pause the first', 10000);
    await neverTwoAtOnce(800);

    reqs = await mediaRequests();
    assert(!reqs.some((p) => p.includes('/source/')), 'an original was requested');
    assert(!reqs.some((p) => /\/(720p|360p)\.webm$/.test(p)), `fetched ${reqs.filter((p) => p.endsWith('.webm'))}`);
  });

  await test('campaign photo: WebP with a JPEG fallback, fetched once', async () => {
    const picture = await waitFor(() => rootEl().querySelector('picture'), 'the photo entry');
    const source = picture.querySelector('source[type="image/webp"]');
    const img = picture.querySelector('img');
    assert(source && pathOf(source.srcset) === '/media/processed/images/813/v1/720w.webp', `webp source: ${source && source.srcset}`);
    assert(pathOf(img.src) === '/media/processed/images/813/v1/720w.jpg', `fallback: ${img.src}`);
    img.scrollIntoView({ block: 'center' });
    await waitFor(() => img.complete && img.currentSrc, 'the photo to load', 10000);
    assert(pathOf(img.currentSrc).endsWith('/720w.webp'), `the browser chose ${img.currentSrc}`);
    const reqs = await mediaRequests();
    assert(!reqs.some((p) => p.endsWith('/720w.jpg') || p.endsWith('/full.jpg')), 'the JPEG was downloaded as well');
  });

  // ── the corner upload indicator ──────────────────────────────────────────
  const setServer = (id, status, progress, { queued = false, error = '' } = {}) =>
    fetch(`/__media/control?set=${id}:${status}:${progress}${error ? `:${error}` : ''}${queued ? '&queued=1' : ''}`);
  const apiLog = (clear = false) => fetch(`/__media/api-log${clear ? '?clear=1' : ''}`).then((r) => r.json());
  const corner = (id) => document.querySelector(`[data-upload-id="${id}"]`);
  const shownPercent = (id) => corner(id)?.querySelector('[data-upload-percent]')?.textContent;

  await test('the corner shows the server\'s real percentage, hands the post to the feed, then goes', async () => {
    const handed = [];
    const onReady = (e) => handed.push(e.detail);
    window.addEventListener('flipstar:post-ready', onReady);
    await setServer(910, 'PROCESSING', 0, { queued: true });
    mount(<UploadProgressIndicator />);
    uploadTracker.track({ id: 910, processing_status: 'PROCESSING', media_type: 'video' });

    await waitFor(() => /Waiting to process/.test(corner(910)?.innerText || ''), 'the queued state');
    const seen = new Set();
    const sampler = setInterval(() => { const t = shownPercent(910); if (t) seen.add(t); }, 40);
    await setServer(910, 'PROCESSING', 25);
    await waitFor(() => shownPercent(910) === '25%', '25%');
    await setServer(910, 'PROCESSING', 60);
    await waitFor(() => shownPercent(910) === '60%', '60%');
    clearInterval(sampler);
    const invented = [...seen].filter((t) => !['0%', '25%', '60%'].includes(t));
    assert(!invented.length, `the indicator showed numbers the server never sent: ${invented}`);
    assert(corner(910).getAttribute('aria-valuenow') === '60', 'the progressbar value is not the server\'s');

    await setServer(910, 'READY', 100);
    await waitFor(() => /Posted/.test(corner(910)?.innerText || ''), '"Posted"');
    await waitFor(() => handed.some((p) => p.id === 910), 'the feed to be handed the post');
    assert(handed.find((p) => p.id === 910).media.endsWith('/v1/720p.webm'), 'the post arrived without its media');
    await waitFor(() => !corner(910), 'the indicator to go', 6000);
    window.removeEventListener('flipstar:post-ready', onReady);
    return `seen ${[...seen].join(' → ')} → Posted`;
  });

  await test('a failure says why, safely, and stays until dismissed', async () => {
    await setServer(911, 'FAILED', 30, { error: 'video_too_long' });
    uploadTracker.track({ id: 911, processing_status: 'PROCESSING', media_type: 'video' });
    const item = await waitFor(() => corner(911)?.getAttribute('data-upload-status') === 'FAILED' && corner(911), 'the failed state');
    assert(/Couldn't post your video/.test(item.innerText), item.innerText);
    assert(/longer than allowed/.test(item.innerText), 'no reason given');
    assert(!/video_too_long|traceback|exception|ffmpeg/i.test(item.innerText), 'technical detail shown');
    await sleep(3000);
    assert(corner(911), 'the failure went away by itself');
    item.querySelector('button[aria-label="Dismiss"]').click();
    await waitFor(() => !corner(911), 'the dismissal');
  });

  await test('two uploads share one request per poll; nothing polls a post on its own', async () => {
    await setServer(912, 'PROCESSING', 10);
    await setServer(913, 'PROCESSING', 40);
    await apiLog(true);
    uploadTracker.track({ id: 912, processing_status: 'PROCESSING', media_type: 'video' });
    uploadTracker.track({ id: 913, processing_status: 'PROCESSING', media_type: 'image' });
    await waitFor(() => shownPercent(912) === '10%' && shownPercent(913) === '40%', 'both uploads in the corner');
    await sleep(4500);
    const log = await apiLog();
    const polls = log.filter((r) => r.route === '/posts/processing/');
    assert(polls.length >= 2 && polls.length <= 5, `${polls.length} status requests in about 5 s`);
    assert(polls.slice(1).every((r) => r.ids.includes('912') && r.ids.includes('913')), JSON.stringify(polls));
    assert(!log.some((r) => r.route.startsWith('/reels/')), 'a post was polled on its own');
    return `${polls.length} requests, each for both`;
  });

  await test('after a reload the corner comes back from storage and carries on', async () => {
    // What a reload leaves behind: the old page's poller is gone, what it
    // stored is not, and a new tracker starts from that.
    const stored = localStorage.getItem(STORE_KEY);
    uploadTracker.clear();
    localStorage.setItem(STORE_KEY, stored);
    const reloaded = createUploadTracker({
      fetchStatuses: async (ids) => (await api.request(`/posts/processing/?ids=${ids.join(',')}`, { skipCache: true })).posts || [],
      fetchPost: (id) => api.request(`/reels/${id}/`, { skipCache: true }),
      storage: localStorage,
    });
    mount(<UploadProgressIndicator tracker={reloaded} />);
    await waitFor(() => shownPercent(912) === '10%' && shownPercent(913) === '40%', 'the uploads back, as last seen');
    await setServer(913, 'PROCESSING', 70);
    reloaded.resume();
    await waitFor(() => shownPercent(913) === '70%', 'progress to carry on after the reload');
    await setServer(912, 'READY', 100);
    await setServer(913, 'READY', 100);
    await waitFor(() => !corner(912) && !corner(913), 'both to finish', 10000);
    reloaded.clear();
  });

  await test('the post page follows its post through the same tracker', async () => {
    // Already covered visually by the first test on this page; here: the
    // post page and the indicator following one upload make one request.
    await setServer(914, 'PROCESSING', 50);
    await apiLog(true);
    mount(
      <>
        <UploadProgressIndicator />
        <VideoDetailPage reelId={914} user={me} onBack={() => {}} subscriptionStatus={{ has_subscription: true }} />
      </>
    );
    uploadTracker.track({ id: 914, processing_status: 'PROCESSING', media_type: 'video' });
    await waitFor(() => /Preparing your post/.test(pageText()) && shownPercent(914) === '50%', 'both showing the upload');
    await sleep(2500);
    const polls = (await apiLog()).filter((r) => r.route === '/posts/processing/');
    assert(polls.every((r) => r.ids.filter((id) => id === '914').length === 1), 'the upload was asked about twice in one request');
    const perTick = polls.length;
    assert(perTick <= 3, `${perTick} status requests in 2.5 s for one upload`);
    await setServer(914, 'READY', 100);
    await waitFor(() => videos().length === 1 && !/Preparing your post/.test(pageText()), 'the page to show the video', 10000);
    uploadTracker.clear();
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
