import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { failureText, isMediaReady, isVideoPost, mediaStatus, pauseOtherVideos } from '../utils/media.js';
import { pickImageSource, pickImageWebp, pickVideoSource } from '../utils/connection.js';
import { forgetUploadId, newUploadId, uploadIdFor } from '../utils/uploadId.js';
import { POLL_GIVE_UP_MS, pollDelay, watchProcessing } from '../utils/processingPoll.js';

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

describe('watching a post until it is ready', () => {
  it('backs off from a few seconds to a steady pace', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 9].map(pollDelay), [3000, 5000, 8000, 13000, 15000, 15000]);
  });

  it('reports each post once when it stops processing, then stops', async () => {
    const time = fakeTime();
    const status = { 1: 'PROCESSING', 2: 'PROCESSING' };
    const fetched = [];
    const updated = [];
    watchProcessing([1, 2], {
      fetchPost: async (id) => {
        fetched.push(id);
        return { id, processing_status: status[id] };
      },
      onUpdate: (post) => updated.push(post),
      ...time,
    });

    await time.next();
    assert.deepEqual(updated, []);
    status[1] = 'READY';
    await time.next();
    assert.deepEqual(updated.map((p) => p.id), [1]);
    status[2] = 'FAILED';
    await time.next();
    assert.deepEqual(updated.map((p) => [p.id, p.processing_status]), [[1, 'READY'], [2, 'FAILED']]);
    assert.equal(time.pending(), 0, 'kept polling after both finished');
    assert.deepEqual(fetched, [1, 2, 1, 2, 2]);
  });

  it('drops a post deleted meanwhile, and retries other errors', async () => {
    const time = fakeTime();
    let calls = 0;
    watchProcessing([7], {
      fetchPost: async () => {
        calls += 1;
        const err = new Error('x');
        err.status = calls === 1 ? 503 : 404;
        throw err;
      },
      onUpdate: () => assert.fail('nothing to report'),
      ...time,
    });
    await time.next();
    assert.equal(time.pending(), 1, 'a 503 should be retried');
    await time.next();
    assert.equal(time.pending(), 0, 'a 404 should end the watch');
  });

  it('gives up after a while', async () => {
    const time = fakeTime();
    watchProcessing([9], { fetchPost: async (id) => ({ id, processing_status: 'PROCESSING' }), onUpdate: () => {}, ...time });
    let ticks = 0;
    while (await time.next()) ticks += 1;
    assert.ok(time.now() >= POLL_GIVE_UP_MS);
    assert.ok(ticks < 80, `${ticks} requests for one post`);
  });

  it('reports nothing after it is stopped', async () => {
    const time = fakeTime();
    let release;
    const stop = watchProcessing([3], {
      fetchPost: () => new Promise((resolve) => { release = resolve; }),
      onUpdate: () => assert.fail('reported after stop'),
      ...time,
    });
    const tick = time.next();
    stop();
    release({ id: 3, processing_status: 'READY' });
    await tick;
    assert.equal(time.pending(), 0);
  });

  it('does nothing when no post is processing', () => {
    const time = fakeTime();
    watchProcessing([], { fetchPost: async () => assert.fail('fetched'), onUpdate: () => {}, ...time });
    assert.equal(time.pending(), 0);
  });
});
