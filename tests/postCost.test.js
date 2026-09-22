// What the create screen tells somebody a post will cost.
//
//     image                        2 coins
//     video under 60 seconds       2 coins
//     video 60 seconds and over    100 coins
//
// The numbers come from /wallet/config/, not from this file. The server
// charges from its own table (api/services/post_pricing.py), so a copy here
// would be a copy that goes stale and shows 2 coins before 100 is taken.
//
// What is tested is the reading and the band: which price applies, and what
// happens when the price list has not arrived — which must show no price
// rather than a wrong one.

import assert from 'node:assert/strict';
import test from 'node:test';

import { LONG_VIDEO_SECONDS, costFor, costLabel, readPostCosts } from '../utils/postCost.js';

const SERVER = {
  post_costs: { image: 2, video_short: 2, video_long: 100, long_video_seconds: 60 },
};
const costs = readPostCosts(SERVER);

// ── reading the price list ───────────────────────────────────────────────────

test('the price list is read from the server response', () => {
  assert.deepEqual(costs, { image: 2, video_short: 2, video_long: 100, long_video_seconds: 60 });
});

test('a response without a price list shows no price', () => {
  for (const body of [null, undefined, {}, { post_costs: null }, { post_costs: 'soon' }]) {
    const read = readPostCosts(body);
    assert.equal(read.image, 0);
    assert.equal(costLabel(costFor({ isVideo: false, costs: read })), '');
  }
});

test('nonsense in the price list reads as no price, not NaN', () => {
  const read = readPostCosts({ post_costs: { image: 'free', video_long: -5 } });

  assert.equal(read.image, 0);
  assert.equal(read.video_long, 0);
});

// ── which band applies ───────────────────────────────────────────────────────

test('an image costs the image price', () => {
  assert.equal(costFor({ isVideo: false, costs }), 2);
});

test('an image is never priced by duration', () => {
  // A leftover measurement from a previously chosen clip must not make a
  // photo cost 100.
  assert.equal(costFor({ isVideo: false, durationSeconds: 90, costs }), 2);
});

test('a short video costs the short price', () => {
  for (const seconds of [1, 10, 30, 59, 59.9]) {
    assert.equal(costFor({ isVideo: true, durationSeconds: seconds, costs }), 2, `${seconds}s`);
  }
});

test('sixty seconds and over costs the long price', () => {
  for (const seconds of [60, 60.0, 61, 90, 119, 120]) {
    assert.equal(costFor({ isVideo: true, durationSeconds: seconds, costs }), 100, `${seconds}s`);
  }
});

test('the boundary is sixty seconds exactly', () => {
  assert.equal(LONG_VIDEO_SECONDS, 60);
  assert.equal(costFor({ isVideo: true, durationSeconds: 59.999, costs }), 2);
  assert.equal(costFor({ isVideo: true, durationSeconds: 60, costs }), 100);
});

test('the server decides where the boundary is', () => {
  // If the server ever moves it, the screen follows without a release here.
  const moved = readPostCosts({
    post_costs: { image: 2, video_short: 2, video_long: 100, long_video_seconds: 30 },
  });

  assert.equal(costFor({ isVideo: true, durationSeconds: 45, costs: moved }), 100);
});

test('a clip that has not been measured is shown the short price', () => {
  // Showing 100 for an unmeasured clip would tell most people the wrong
  // number, and the server charges the difference if it measures it long.
  for (const unknown of [null, undefined, NaN, 'abc']) {
    assert.equal(costFor({ isVideo: true, durationSeconds: unknown, costs }), 2);
  }
});

// ── the line shown on screen ─────────────────────────────────────────────────

test('the label reads as a price', () => {
  assert.equal(costLabel(2), 'Post cost: 2 coins');
  assert.equal(costLabel(100), 'Post cost: 100 coins');
});

test('one coin is singular', () => {
  assert.equal(costLabel(1), 'Post cost: 1 coin');
});

test('nothing to charge shows nothing at all', () => {
  for (const nothing of [0, null, undefined, NaN, -3]) {
    assert.equal(costLabel(nothing), '');
  }
});
