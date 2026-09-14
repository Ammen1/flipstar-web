import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  cacheStillLoadable,
  earliestExpiry,
  expiresWithin,
  signedUrlExpiry,
  withoutSignature,
} from '../utils/signedUrl.js';
import { createMediaRecovery, mediaFieldsOf, sameRendition } from '../utils/mediaRecovery.js';

// Media URLs as the API signs them on a private bucket (staging): SigV4,
// issued at X-Amz-Date, working for X-Amz-Expires seconds.
const OBS = 'https://obs.example/flipstar-media';
const HOUR = 3600 * 1000;
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const signed = (key, issuedMs, lifetime = 3600) =>
  `${OBS}/${key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=${stamp(issuedMs)}` +
  `&X-Amz-Expires=${lifetime}&X-Amz-SignedHeaders=host&X-Amz-Signature=s${issuedMs}`;

const NOW = Date.UTC(2026, 8, 13, 12, 0, 0);

function video(id, issuedMs, version = 1) {
  const base = `processed/videos/${id}/v${version}`;
  return {
    id,
    media: signed(`${base}/720p.mp4`, issuedMs),
    media_variants: { 360: signed(`${base}/360p.mp4`, issuedMs), 480: signed(`${base}/480p.mp4`, issuedMs) },
    thumbnail: signed(`processed/thumbnails/${id}/v${version}/thumb.jpg`, issuedMs),
    media_type: 'video',
    processing_status: 'READY',
  };
}

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};

/** A pretend POST /posts/media/: answers with media signed "now", logs every request. */
function fakeServer(now) {
  const requests = [];
  const behaviour = { gone: new Set(), processing: new Set(), lost: new Set(), down: false };
  return {
    requests,
    behaviour,
    async request(body) {
      requests.push(body);
      if (behaviour.down) throw new Error('offline');
      const reasons = new Map((body.failures || []).map((f) => [String(f.id), f]));
      const posts = body.ids
        .filter((id) => !behaviour.gone.has(id))
        .map((id) => {
          if (behaviour.processing.has(id)) {
            return { id, media: null, media_variants: null, media_type: 'video', processing_status: 'PROCESSING', media_check: null };
          }
          const row = video(id, now());
          if (behaviour.lost.has(id)) Object.assign(row, { media: null, media_variants: null, thumbnail: null });
          const failure = reasons.get(String(id));
          return {
            ...row,
            media_check: failure
              ? { reason: behaviour.lost.has(id) ? 'object_missing' : 'expired_signature', repairing: behaviour.lost.has(id) }
              : null,
          };
        });
      return { posts, expires_in: 3600 };
    },
  };
}

function recoveryWith(server, now, extra = {}) {
  const timers = [];
  const recovery = createMediaRecovery({
    request: server.request,
    now,
    setTimer: (fn) => timers.push(fn),
    ...extra,
  });
  const tick = async () => {
    while (timers.length) timers.shift()();
    await settle();
  };
  return { recovery, tick };
}

describe('signed media URLs', () => {
  it('reads when a SigV4 URL stops working', () => {
    assert.equal(signedUrlExpiry(signed('a.mp4', NOW, 600)), NOW + 600 * 1000);
  });

  it('reads the older Expires form, and knows an unsigned URL never expires', () => {
    assert.equal(signedUrlExpiry(`${OBS}/a.mp4?AWSAccessKeyId=k&Signature=s&Expires=1789000000`), 1789000000 * 1000);
    assert.equal(signedUrlExpiry(`${OBS}/a.mp4`), null);
    assert.equal(signedUrlExpiry('/media/reels/a.mp4'), null);
    assert.equal(signedUrlExpiry(`${OBS}/a.mp4?X-Amz-Date=garbage&X-Amz-Expires=60`), null);
    assert.equal(signedUrlExpiry(undefined), null);
  });

  it('finds the soonest expiry anywhere in a post or a cached page of them', () => {
    const post = video(1, NOW);
    post.media_variants['360'] = signed('processed/videos/1/v1/360p.mp4', NOW - HOUR / 2);
    assert.equal(earliestExpiry(post), NOW + HOUR / 2);
    assert.equal(earliestExpiry([{ imageUrl: `${OBS}/x.mp4` }]), null);
    assert.ok(expiresWithin(post.media_variants['360'], HOUR, NOW));
    assert.ok(!expiresWithin(post.media, HOUR / 2, NOW));
  });

  it('refuses a feed cache holding URLs that have run out, whatever its own stamp says', () => {
    assert.ok(cacheStillLoadable([video(1, NOW)], 5 * 60 * 1000, NOW));
    assert.ok(!cacheStillLoadable([video(1, NOW), video(2, NOW - HOUR)], 5 * 60 * 1000, NOW));
    assert.ok(cacheStillLoadable([{ imageUrl: 'https://public.example/a.mp4' }], 5 * 60 * 1000, NOW));
  });

  it('keeps signatures out of what it logs', () => {
    assert.equal(withoutSignature(signed('processed/videos/1/v1/720p.mp4', NOW)), `${OBS}/processed/videos/1/v1/720p.mp4`);
  });
});

describe('media recovery', () => {
  it('reports a failed load and gives every surface the fresh media', async () => {
    let now = NOW;
    const server = fakeServer(() => now);
    const { recovery, tick } = recoveryWith(server, () => now);
    const stale = video(7, NOW - 2 * HOUR);
    let heard = 0;
    recovery.subscribe(() => { heard += 1; });

    const pending = recovery.recover(stale, { url: stale.media_variants['480'], error: 4, surface: 'reels' });
    await tick();
    const result = await pending;

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'expired_signature');
    assert.deepEqual(server.requests, [{
      ids: [7],
      failures: [{ id: 7, url: stale.media_variants['480'], error: '4', surface: 'reels' }],
    }]);
    const fresh = recovery.freshen(stale);
    assert.ok(signedUrlExpiry(fresh.media_variants['480']) > now + 59 * 60 * 1000, 'still an old signature');
    assert.equal(heard, 1);
    // The card keeps the rung it was playing.
    assert.equal(sameRendition(fresh, stale.media_variants['480']), fresh.media_variants['480']);
  });

  it('two surfaces failing on one post make one request', async () => {
    const server = fakeServer(() => NOW);
    const { recovery, tick } = recoveryWith(server, () => NOW);
    const stale = video(8, NOW - 2 * HOUR);

    const a = recovery.recover(stale, { url: stale.media, surface: 'home' });
    const b = recovery.recover(stale, { url: stale.media, surface: 'reels' });
    await tick();
    assert.equal((await a).ok, true);
    assert.equal((await b).ok, true);
    assert.equal(server.requests.length, 1);
  });

  it('asks about many posts in batches of twenty', async () => {
    const server = fakeServer(() => NOW);
    const { recovery, tick } = recoveryWith(server, () => NOW);
    for (let id = 1; id <= 21; id++) recovery.refresh({ id });
    await tick();
    assert.deepEqual(server.requests.map((r) => r.ids.length), [20, 1]);
  });

  it('gives up on a post after two tries in ten minutes, without asking again', async () => {
    let now = NOW;
    const server = fakeServer(() => now);
    server.behaviour.lost.add(9);
    const { recovery, tick } = recoveryWith(server, () => now);
    const post = video(9, NOW - 2 * HOUR);

    for (let i = 0; i < 2; i++) {
      const pending = recovery.recover(post, { url: post.media });
      await tick();
      assert.deepEqual(await pending, { ok: false, reason: 'object_missing' });
    }
    const third = await recovery.recover(post, { url: post.media });
    assert.deepEqual(third, { ok: false, reason: 'object_missing' });
    assert.equal(server.requests.length, 2, 'a broken file looped');

    now += 11 * 60 * 1000;
    const later = recovery.recover(post, { url: post.media });
    await tick();
    await later;
    assert.equal(server.requests.length, 3, 'never tried again');
  });

  it('says why when there is nothing to load', async () => {
    const server = fakeServer(() => NOW);
    server.behaviour.gone.add(10);
    server.behaviour.processing.add(11);
    const { recovery, tick } = recoveryWith(server, () => NOW);

    const gone = recovery.recover(video(10, NOW), { url: 'x' });
    const processing = recovery.recover(video(11, NOW), { url: 'x' });
    await tick();
    assert.deepEqual(await gone, { ok: false, reason: 'gone' });
    assert.deepEqual(await processing, { ok: false, reason: 'processing' });
  });

  it('an offline request changes nothing', async () => {
    const server = fakeServer(() => NOW);
    server.behaviour.down = true;
    const { recovery, tick } = recoveryWith(server, () => NOW);
    const post = video(12, NOW - 2 * HOUR);
    const pending = recovery.recover(post, { url: post.media });
    await tick();
    assert.deepEqual(await pending, { ok: false, reason: 'network' });
    assert.equal(recovery.freshen(post), post);
  });

  it('refreshes ahead only what is about to run out, once it is fresh no more', async () => {
    let now = NOW;
    const server = fakeServer(() => now);
    const { recovery, tick } = recoveryWith(server, () => now);
    const expiring = video(13, NOW - HOUR + 60 * 1000);
    const fine = video(14, NOW);
    const unsigned = { id: 15, media: `${OBS}/processed/videos/15/v1/720p.mp4`, media_type: 'video' };

    assert.equal(recovery.refreshExpiring([expiring, fine, unsigned], 2 * 60 * 1000), 1);
    await tick();
    assert.deepEqual(server.requests.map((r) => r.ids), [[13]]);
    assert.equal(server.requests[0].failures.length, 0, 'a refresh is not a failure report');

    // The fresh copy is what counts from now on.
    assert.equal(recovery.refreshExpiring([expiring, fine, unsigned], 2 * 60 * 1000), 0);
  });

  it('keeps only the media fields of a post, and forgets on sign-out', async () => {
    const post = { ...video(16, NOW), caption: 'hello', user: { id: 1 }, votes: 3 };
    const fields = mediaFieldsOf(post);
    assert.equal(fields.caption, undefined);
    assert.equal(fields.media, post.media);

    const server = fakeServer(() => NOW);
    const { recovery, tick } = recoveryWith(server, () => NOW);
    recovery.refresh(post);
    await tick();
    assert.notEqual(recovery.freshen(post), post);
    recovery.forget();
    assert.equal(recovery.freshen(post), post);
  });

  it('newer media from the feed wins over an older refresh', async () => {
    let now = NOW;
    const server = fakeServer(() => now);
    const { recovery, tick } = recoveryWith(server, () => now);
    recovery.refresh({ id: 18 });
    await tick();
    const refreshed = recovery.freshen({ id: 18 });

    now += 30 * 60 * 1000; // the feed brings the post again, edited: v2, signed later
    const fromFeed = video(18, now, 2);
    assert.equal(recovery.freshen(fromFeed), fromFeed);
    // ...while a copy older than the refresh still gets the refreshed media.
    assert.equal(recovery.freshen(video(18, NOW - HOUR)).media, refreshed.media);
  });

  it('a rendition the post no longer has is not kept', () => {
    const fresh = video(17, NOW, 2);
    assert.equal(sameRendition(fresh, video(17, NOW - HOUR, 1).media_variants['480']), '');
  });
});
