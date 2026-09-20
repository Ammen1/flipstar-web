// When a post's media frame has to hold its own height.
//
// The reported bug: a card on Home sometimes showed nothing but the author's
// avatar and name. It was not a failure to load. An <img> that has not loaded
// has no intrinsic size, so `width: 100%; height: auto` computes to zero --
// the card collapsed *while* loading, and stayed collapsed whenever the
// picture never came. Measured in a browser before the fix: a 0px media area
// in a 121px card (tests/browser/feed.harness.jsx).
//
// The rule is one decision, taken in one place, because the four ways a frame
// can be empty used to be handled in four different ways -- and two of them
// (loading, and a file storage had lost) were not handled at all.

import assert from 'node:assert/strict';
import test from 'node:test';

import { MEDIA_FRAME_MIN_HEIGHT, holdsMediaFrame } from '../utils/media.js';

const loaded = { ready: true, source: 'https://cdn/x.jpg', failed: false, painted: true };

test('a picture that is on screen gets the frame out of its way', () => {
  // Released, so the media keeps its own aspect ratio. The feed is not told
  // the dimensions, so a reserved shape would crop or letterbox every post
  // that did not happen to match it.
  assert.equal(holdsMediaFrame(loaded), false);
});

test('a picture that is still coming holds the frame open', () => {
  assert.equal(holdsMediaFrame({ ...loaded, painted: false }), true);
});

test('a post still being processed holds it open', () => {
  // No URL exists yet -- the original is never served -- so nothing will
  // paint here until the worker finishes.
  assert.equal(holdsMediaFrame({ ...loaded, ready: false, source: '', painted: false }), true);
});

test('a post that is processing holds it open even with a stale URL in hand', () => {
  assert.equal(holdsMediaFrame({ ...loaded, ready: false }), true);
});

test('a file that failed to load holds it open', () => {
  assert.equal(holdsMediaFrame({ ...loaded, failed: true }), true);
});

test('a post with no media at all holds it open', () => {
  assert.equal(holdsMediaFrame({ ...loaded, source: '', painted: false }), true);
  assert.equal(holdsMediaFrame({ ...loaded, source: null, painted: false }), true);
});

test('painted is not taken on trust when there is nothing to paint', () => {
  // A stale `painted` from the post before must not collapse the frame under
  // a post that has nothing to show.
  assert.equal(holdsMediaFrame({ ready: false, source: '', failed: false, painted: true }), true);
  assert.equal(holdsMediaFrame({ ready: true, source: '', failed: false, painted: true }), true);
  assert.equal(holdsMediaFrame({ ready: true, source: 'x.jpg', failed: true, painted: true }), true);
});

test('called with nothing, it holds', () => {
  // A card rendering before its post has arrived errs towards a held frame,
  // never a collapsed one.
  assert.equal(holdsMediaFrame(), true);
  assert.equal(holdsMediaFrame({}), true);
});

test('the held height matches the boxes it stands in for', () => {
  // The unavailable and no-media boxes are drawn at this height too, so a
  // card does not resize as it moves between those states.
  assert.equal(MEDIA_FRAME_MIN_HEIGHT, 260);
});
