import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { failureText, isMediaReady, isVideoPost, mediaStatus, pauseOtherVideos } from '../utils/media.js';
import { pickImageSource, pickImageWebp, pickVideoSource } from '../utils/connection.js';
import { forgetUploadId, newUploadId, uploadIdFor } from '../utils/uploadId.js';
import { createUploadTracker, pollInterval } from '../utils/uploadTracker.js';

// What the API sends for posts in each state (api/serializers/core.py).
const processingVideo = { id: 1, media: null, image: null, thumbnail: null, media_type: 'video', processing_status: 'PROCESSING' };
const failedPhoto = { id: 2, media: null, image: null, media_type: 'image', processing_status: 'FAILED', processing_error: 'invalid_media' };
const readyVideo = {
  id: 3,
  media: 'https://obs/processed/videos/3/v1/720p.mp4',
  media_variants: { 360: 'https://obs/processed/videos/3/v1/360p.mp4', 480: 'https://obs/processed/videos/3/v1/480p.mp4' },
  media_type: 'video',
  processing_status: 'READY',
};
const readyPhoto = {
  id: 4,
  image: 'https://obs/processed/images/4/v1/full.jpg',
  image_variants: { 360: 'https://obs/processed/images/4/v1/360w.jpg', 720: 'https://obs/processed/images/4/v1/720w.jpg' },
  image_webp_variants: {
    360: 'https://obs/processed/images/4/v1/360w.webp',
    720: 'https://obs/processed/images/4/v1/720w.webp',
    full: 'https://obs/processed/images/4/v1/full.webp',
  },
  media_type: 'image',
  processing_status: 'READY',
};
// A post from before the pipeline: no status, no variants.
const legacyPhoto = { id: 5, image: 'https://obs/media/reels/old.jpg' };

describe('processing status', () => {
  it('reads the three states, and treats a missing field as ready', () => {
    assert.equal(mediaStatus(processingVideo), 'PROCESSING');
    assert.equal(mediaStatus({ processing_status: 'UPLOADING' }), 'PROCESSING');
    assert.equal(mediaStatus(failedPhoto), 'FAILED');
    assert.equal(mediaStatus(readyVideo), 'READY');
    assert.equal(mediaStatus(legacyPhoto), 'READY', 'older posts must keep displaying');
    assert.equal(isMediaReady(processingVideo), false);
    assert.equal(isMediaReady(legacyPhoto), true);
  });

  it('knows a processing post is a video before it has a URL', () => {
    assert.equal(isVideoPost(processingVideo), true);
    assert.equal(isVideoPost(failedPhoto), false);
  });

  it('trusts the URL when there is one', () => {
    assert.equal(isVideoPost(readyVideo), true);
    assert.equal(isVideoPost({ media: 'https://obs/media/reels/old.jpg', media_type: 'video' }), false);
  });

  it('explains a failure in words, with a fallback for unknown codes', () => {
    assert.match(failureText(failedPhoto), /couldn't be read/);
    assert.equal(failureText({ processing_error: 'something_new' }), 'Please try posting it again.');
    assert.doesNotMatch(failureText({ processing_error: 'Traceback (most recent call last)' }), /Traceback/);
  });
});

describe('one video at a time', () => {
  it('pauses every other playing video, and nothing else', () => {
    const video = (paused) => ({ paused, pause() { this.paused = true; } });
    const a = video(false);
    const b = video(false);
    const c = video(true);
    pauseOtherVideos(a, { querySelectorAll: () => [a, b, c] });
    assert.equal(a.paused, false, 'stopped the one that is starting');
    assert.equal(b.paused, true);
    assert.equal(c.paused, true);
  });
});

describe('WebP with a JPEG fallback', () => {
  it('pairs the WebP with the same rendition the JPEG picker chose', () => {
    for (const tier of ['slow', 'normal', 'fast']) {
      const jpg = pickImageSource(readyPhoto, tier);
      const webp = pickImageWebp(readyPhoto, tier);
      assert.equal(webp, jpg.replace(/\.jpg$/, '.webp'), `tier ${tier}: ${jpg} vs ${webp}`);
    }
  });

  it('offers no WebP where the backend kept none', () => {
    const noSmallWebp = { ...readyPhoto, image_webp_variants: { 720: readyPhoto.image_webp_variants[720] } };
    assert.equal(pickImageWebp(noSmallWebp, 'slow'), '');
    assert.equal(pickImageSource(noSmallWebp, 'slow'), readyPhoto.image_variants[360]);
  });

  it('changes nothing for a post from before WebP existed', () => {
    assert.equal(pickImageWebp(legacyPhoto, 'fast'), '');
    assert.equal(pickImageSource(legacyPhoto, 'fast'), legacyPhoto.image);
  });

  it('keeps the JPEG choice it always made', () => {
    assert.equal(pickImageSource(readyPhoto, 'slow'), readyPhoto.image_variants[360]);
    assert.equal(pickImageSource(readyPhoto, 'normal'), readyPhoto.image_variants[720]);
    assert.equal(pickImageSource(readyPhoto, 'fast'), readyPhoto.image_variants[720]);
    assert.equal(pickImageSource({ image: '' }, 'fast'), '');
  });
});

describe('video rendition by connection', () => {
  it('takes a small rung on a slow connection and the primary on a fast one', () => {
    assert.equal(pickVideoSource(readyVideo, 'slow'), readyVideo.media_variants[360]);
    assert.equal(pickVideoSource(readyVideo, 'normal'), readyVideo.media_variants[480]);
    assert.equal(pickVideoSource(readyVideo, 'fast'), readyVideo.media);
  });

  it('never has a URL to play for a post that is processing', () => {
    assert.equal(pickVideoSource(processingVideo, 'fast'), '');
  });
});

describe('upload id', () => {
  it('fits what the API accepts and differs every time', () => {
    const ids = new Set(Array.from({ length: 50 }, newUploadId));
    assert.equal(ids.size, 50);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9_.:-]{8,64}$/);
  });

  // A stand-in for sessionStorage, which survives a reload of the tab.
  const memoryStorage = () => {
    const data = new Map();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
  };
  const photo = { name: 'IMG_2041.jpg', size: 2_481_331, lastModified: 1_780_000_000_000, type: 'image/jpeg' };

  it('is the same for the same file after a reload, until the post is confirmed', () => {
    const storage = memoryStorage();
    const first = uploadIdFor(photo, { storage });
    const afterReload = uploadIdFor({ ...photo }, { storage });
    assert.equal(afterReload, first, 'a reload made the retry look like a new post');
    assert.match(first, /^[A-Za-z0-9_.:-]{8,64}$/);

    forgetUploadId(photo, { storage });
    assert.notEqual(uploadIdFor(photo, { storage }), first, 'posting the photo again later reused the id');
  });

  it('differs between files, and expires', () => {
    const storage = memoryStorage();
    const now = 1_000_000;
    const a = uploadIdFor(photo, { storage, now });
    const b = uploadIdFor({ ...photo, name: 'IMG_2042.jpg' }, { storage, now });
    assert.notEqual(a, b);
    assert.notEqual(uploadIdFor(photo, { storage, now: now + 31 * 60 * 1000 }), a);
  });

  it('still works with no storage, or a file with no identity', () => {
    assert.notEqual(uploadIdFor(photo, { storage: null }), uploadIdFor(photo, { storage: null }));
    const storage = memoryStorage();
    assert.notEqual(uploadIdFor(null, { storage }), uploadIdFor(null, { storage }));
  });
});

// A hand-driven clock and timer queue.
function fakeTime() {
  let now = 0;
  const timers = [];
  return {
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      const i = timers.indexOf(t);
      if (i >= 0) timers.splice(i, 1);
    },
    pending: () => timers.length,
    async next() {
      timers.sort((a, b) => a.at - b.at);
      const t = timers.shift();
      if (!t) return false;
      now = t.at;
      await t.fn();
      return true;
    },
  };
}

// ── the upload tracker ─────────────────────────────────────────────────────

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};

/** A pretend /posts/processing/ and /reels/<id>/, with a request log. */
function fakeServer(initial = {}) {
  const rows = new Map(Object.entries(initial).map(([id, row]) => [id, { id: Number(id), ...row }]));
  const requests = [];
  return {
    requests,
    set(id, row) { rows.set(String(id), { id, ...(rows.get(String(id)) || {}), ...row }); },
    remove(id) { rows.delete(String(id)); },
    fetchStatuses: async (ids) => {
      requests.push([...ids]);
      return ids.map((id) => rows.get(String(id))).filter(Boolean);
    },
    fetchPost: async (id) => ({ id: Number(id), media: `https://obs/processed/videos/${id}/v1/720p.mp4`, processing_status: 'READY' }),
  };
}

function memoryStore() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

function trackerWith(server, time, extra = {}) {
  const ready = [];
  const tracker = createUploadTracker({
    fetchStatuses: server.fetchStatuses,
    fetchPost: server.fetchPost,
    now: time.now,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
    onReady: (post) => ready.push(post),
    ...extra,
  });
  return { tracker, ready };
}

describe('upload tracker', () => {
  it('polls brisk while an upload is new, then eases off', () => {
    assert.deepEqual([0, 179e3, 181e3, 19 * 60e3, 21 * 60e3].map(pollInterval), [2000, 2000, 5000, 5000, 15000]);
  });

  it('asks about every upload in one request per tick, and shows the real percentage', async () => {
    const time = fakeTime();
    const server = fakeServer({ 1: { processing_status: 'PROCESSING', processing_progress: 0 } });
    const { tracker } = trackerWith(server, time);

    tracker.track({ id: 1, processing_status: 'PROCESSING', media_type: 'video' });
    tracker.track({ id: 2, processing_status: 'PROCESSING', media_type: 'image' });
    server.set(2, { processing_status: 'PROCESSING', processing_progress: 0 });
    await flush();
    server.set(1, { processing_progress: 25 });
    server.set(2, { processing_progress: 60 });
    await time.next();
    await flush();

    assert.deepEqual(server.requests.at(-1).sort(), ['1', '2'], 'not one request for both');
    assert.ok(server.requests.every((ids) => ids.length >= 1), 'a request with nothing in it');
    const shown = tracker.getSnapshot();
    assert.deepEqual(shown.map((e) => [e.id, e.progress]), [[1, 25], [2, 60]]);
  });

  it('announces a READY post once, shows Posted briefly, then stops polling', async () => {
    const time = fakeTime();
    const server = fakeServer({ 5: { processing_status: 'PROCESSING', processing_progress: 80 } });
    const { tracker, ready } = trackerWith(server, time);
    tracker.track({ id: 5, processing_status: 'PROCESSING', media_type: 'video' });
    await flush();

    server.set(5, { processing_status: 'READY', processing_progress: 100 });
    await time.next();
    await flush();
    assert.deepEqual(ready.map((p) => p.id), [5], 'the feed was not told');
    assert.equal(ready[0].media, 'https://obs/processed/videos/5/v1/720p.mp4');
    assert.equal(tracker.getSnapshot()[0].status, 'READY');
    assert.equal(tracker._running(), false, 'kept polling after it was ready');

    const before = server.requests.length;
    await time.next(); // the "Posted" linger
    assert.deepEqual(tracker.getSnapshot(), [], 'the indicator stayed');
    assert.equal(server.requests.length, before);
    assert.equal(ready.length, 1, 'announced twice');
  });

  it('keeps a failure, with its reason, until it is dismissed', async () => {
    const time = fakeTime();
    const server = fakeServer({ 7: { processing_status: 'FAILED', processing_error: 'video_too_long' } });
    const { tracker, ready } = trackerWith(server, time);
    tracker.track({ id: 7, processing_status: 'PROCESSING' });
    await flush();

    const [entry] = tracker.getSnapshot();
    assert.equal(entry.status, 'FAILED');
    assert.equal(entry.error, 'video_too_long');
    assert.equal(ready.length, 0);
    assert.equal(tracker._running(), false);
    tracker.dismiss(7);
    assert.deepEqual(tracker.getSnapshot(), []);
  });

  it('survives a reload: the list is in storage and polling resumes', async () => {
    const time = fakeTime();
    const storage = memoryStore();
    const server = fakeServer({ 9: { processing_status: 'PROCESSING', processing_progress: 40 } });
    const first = trackerWith(server, time, { storage }).tracker;
    first.track({ id: 9, processing_status: 'PROCESSING', media_type: 'video' }, { thumb: 'data:image/jpeg;base64,AAA' });
    await flush();
    first.clear = () => {}; // the old page is simply gone

    const { tracker: reloaded } = trackerWith(server, fakeTime(), { storage });
    assert.deepEqual(reloaded.getSnapshot().map((e) => [e.id, e.progress, e.thumb]), [[9, 40, 'data:image/jpeg;base64,AAA']]);
    const asked = server.requests.length;
    reloaded.resume();
    await flush();
    assert.equal(server.requests.length, asked + 1, 'the reloaded page did not poll');
  });

  it('drops an upload the server no longer has, and retries through errors', async () => {
    const time = fakeTime();
    const server = fakeServer({ 3: { processing_status: 'PROCESSING' } });
    let failNext = true;
    const flaky = { ...server, fetchStatuses: async (ids) => {
      if (failNext) { failNext = false; throw new Error('offline'); }
      return server.fetchStatuses(ids);
    } };
    const { tracker } = trackerWith(flaky, time);
    tracker.track({ id: 3, processing_status: 'PROCESSING' });
    await flush();
    assert.equal(tracker.getSnapshot().length, 1, 'an error dropped the upload');

    server.remove(3);
    await time.next();
    await flush();
    assert.deepEqual(tracker.getSnapshot(), [], 'a deleted post was kept');
  });

  it('pages watching the same post share the one poll and hear the result', async () => {
    const time = fakeTime();
    const server = fakeServer({ 11: { processing_status: 'PROCESSING' } });
    const { tracker } = trackerWith(server, time);
    const heardA = [];
    const heardB = [];
    tracker.watch([11], (p) => heardA.push(p));
    tracker.watch([11], (p) => heardB.push(p));
    await flush();
    assert.deepEqual(tracker.getSnapshot(), [], 'a watched post appeared in the corner');
    assert.ok(server.requests.every((ids) => ids.filter((id) => id === '11').length === 1));

    server.set(11, { processing_status: 'READY' });
    await time.next();
    await flush();
    assert.equal(heardA[0].id, 11);
    assert.equal(heardB[0].id, 11);
  });

  it('only one tab polls; the others follow its writes', async () => {
    const time = fakeTime();
    const server = fakeServer({ 21: { processing_status: 'PROCESSING' }, 22: { processing_status: 'PROCESSING' } });
    const shared = new Map();
    const tabs = [];
    const tab = () => {
      const me = { listeners: [] };
      tabs.push(me);
      return {
        storage: {
          getItem: (k) => shared.get(k) ?? null,
          setItem: (k, v) => {
            shared.set(k, String(v));
            tabs.filter((t) => t !== me).forEach((t) => t.listeners.forEach((fn) => fn(k)));
          },
        },
        listenStorage: (fn) => me.listeners.push(fn),
      };
    };
    let queue = Promise.resolve();
    const locks = { request: (name, cb) => { const run = queue.then(() => cb()); queue = run.catch(() => {}); return run; } };
    const calls = { a: 0, b: 0 };
    const counted = (name) => ({ ...server, fetchStatuses: (ids) => { calls[name] += 1; return server.fetchStatuses(ids); } });

    const a = trackerWith(counted('a'), time, { ...tab(), locks }).tracker;
    const b = trackerWith(counted('b'), time, { ...tab(), locks }).tracker;
    a.track({ id: 21, processing_status: 'PROCESSING' });
    b.track({ id: 22, processing_status: 'PROCESSING' });
    await flush();
    await time.next();
    await flush();

    // Whichever tab took the lock first polls -- one, not both.
    assert.ok((calls.a === 0) !== (calls.b === 0), `both tabs polled (${calls.a} and ${calls.b})`);
    assert.deepEqual(server.requests.at(-1).sort(), ['21', '22'], 'the polling tab missed the other tab\'s upload');
    const follower = calls.a ? b : a;
    server.set(21, { processing_status: 'READY' });
    server.set(22, { processing_status: 'READY' });
    await time.next();
    await flush();
    assert.ok(follower.getSnapshot().every((e) => e.status === 'READY'), 'the other tab never heard');
  });

  it('adopts uploads the server says are processing, but not stale ones', () => {
    const time = fakeTime();
    const { tracker } = trackerWith(fakeServer(), time);
    const hoursAgo = (h) => new Date(time.now() - h * 3600e3).toISOString();
    tracker.adopt([
      { id: 31, processing_status: 'PROCESSING', processing_progress: 10, created_at: hoursAgo(0.1) },
      { id: 32, processing_status: 'PROCESSING', created_at: hoursAgo(5) },
      { id: 33, processing_status: 'READY', created_at: hoursAgo(0.1) },
    ]);
    assert.deepEqual(tracker.getSnapshot().map((e) => e.id), [31]);
  });

  it('a post that was READY at once is announced without any polling', async () => {
    const time = fakeTime();
    const server = fakeServer();
    const { tracker, ready } = trackerWith(server, time);
    tracker.track({ id: 41, processing_status: 'READY', media: 'https://obs/x.mp4' });
    await flush();
    assert.deepEqual(ready.map((p) => p.id), [41]);
    assert.equal(server.requests.length, 0);
    await time.next();
    assert.deepEqual(tracker.getSnapshot(), []);
  });

  it('forgets everything on sign-out', async () => {
    const time = fakeTime();
    const server = fakeServer({ 51: { processing_status: 'PROCESSING' } });
    const { tracker } = trackerWith(server, time, { storage: memoryStore() });
    tracker.track({ id: 51, processing_status: 'PROCESSING' });
    await flush();
    tracker.clear();
    assert.deepEqual(tracker.getSnapshot(), []);
    assert.equal(tracker._running(), false);
  });
});
