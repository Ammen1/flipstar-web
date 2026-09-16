// What the feeds rely on when the user comes back from a single post.
//
// The DOM parts (visiblePostId, applyFeedPosition) are exercised by the
// browser suites; these are the storage rules, which decide whether a position
// survives the trip at all.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  POSITION_TTL_MS,
  forgetFeedPosition,
  recallFeedPosition,
  rememberFeedPosition,
} from '../utils/feedPosition.js';

function fakeStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

test('a position comes back as it went in', () => {
  const store = fakeStore();
  rememberFeedPosition('home', { postId: 15, offset: 2480, page: 10, count: 25 }, store);

  const back = recallFeedPosition('home', { store });

  assert.equal(back.postId, '15', 'the anchor is the post the user was on');
  assert.equal(back.offset, 2480);
  assert.equal(back.page, 10, 'so pagination continues instead of restarting');
  assert.equal(back.count, 25);
});

test('home and reels remember separately', () => {
  const store = fakeStore();
  rememberFeedPosition('home', { postId: 15, offset: 900 }, store);
  rememberFeedPosition('reels', { postId: 88, offset: 4000 }, store);

  assert.equal(recallFeedPosition('home', { store }).postId, '15');
  assert.equal(recallFeedPosition('reels', { store }).postId, '88');
});

test('an old position is dropped rather than restored', () => {
  const store = fakeStore();
  rememberFeedPosition('home', { postId: 15, offset: 900 }, store);
  const later = Date.now() + POSITION_TTL_MS + 1;

  assert.equal(recallFeedPosition('home', { store, now: later }), null);
  assert.equal(store.getItem('feed_position_home'), null, 'and not left behind');
});

test('a position inside the window survives', () => {
  const store = fakeStore();
  rememberFeedPosition('home', { postId: 15, offset: 900 }, store);
  const soon = Date.now() + POSITION_TTL_MS - 1000;

  assert.equal(recallFeedPosition('home', { store, now: soon }).postId, '15');
});

test('forgetting means the feed opens at the top', () => {
  const store = fakeStore();
  rememberFeedPosition('home', { postId: 15, offset: 900 }, store);

  forgetFeedPosition('home', store);

  assert.equal(recallFeedPosition('home', { store }), null);
});

test('a position with nothing to restore is not written', () => {
  const store = fakeStore();
  rememberFeedPosition('home', { postId: 15, offset: 900 }, store);

  // A feed resetting its scroll on the way out used to overwrite the real
  // position with this, which is how the user ended up back at post 1.
  const wrote = rememberFeedPosition('home', { postId: null, offset: 0 }, store);

  assert.equal(wrote, false);
  assert.equal(recallFeedPosition('home', { store }).postId, '15', 'the good one stands');
});

test('the top of the feed is remembered when a post anchors it', () => {
  const store = fakeStore();

  assert.equal(rememberFeedPosition('home', { postId: 3, offset: 0 }, store), true);
  assert.equal(recallFeedPosition('home', { store }).postId, '3');
});

test('unreadable storage yields no position and clears itself', () => {
  const store = fakeStore({ feed_position_home: 'not json' });

  assert.equal(recallFeedPosition('home', { store }), null);
  assert.equal(store.getItem('feed_position_home'), null);
});

test('storage that throws is survivable', () => {
  const angry = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
    removeItem() {
      throw new Error('denied');
    },
  };

  assert.equal(rememberFeedPosition('home', { postId: 1, offset: 10 }, angry), false);
  assert.equal(recallFeedPosition('home', { store: angry }), null);
  assert.doesNotThrow(() => forgetFeedPosition('home', angry));
});

test('no storage at all is not an error', () => {
  assert.equal(rememberFeedPosition('home', { postId: 1, offset: 10 }, null), false);
  assert.equal(recallFeedPosition('home', { store: null }), null);
});
