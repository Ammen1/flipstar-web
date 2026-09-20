// What the nav does with the number the server sends back.
//
// The Messages badge was `useState(0)` with no setter -- a count that could
// not change -- so nothing was ever read out of a response and nothing was
// ever drawn. Now that both ends are connected, these pin the two decisions
// in between: what a bad answer counts as, and what a good one looks like.
//
// The counting itself is the server's and is tested there
// (tests/integration/test_message_notifications.py). Nothing here invents a
// count; a badge that kept its own tally would drift from the read markers as
// soon as somebody read a thread on their phone.

import assert from 'node:assert/strict';
import test from 'node:test';

import { badgeLabel, readUnreadCount } from '../utils/unreadCounts.js';

// ─── reading the response ────────────────────────────────────────────────────

test('a count is read out of the response', () => {
  assert.equal(readUnreadCount({ unread_count: 3 }), 3);
});

test('nothing unread is zero, not a badge showing 0', () => {
  assert.equal(readUnreadCount({ unread_count: 0 }), 0);
  assert.equal(badgeLabel(0), '');
});

test('a failed or empty request means no news, not NaN', () => {
  // The poll catches its own errors and passes on whatever it has; the badge
  // must not end up reading "NaN" over the Messages tab.
  for (const bad of [null, undefined, {}, { unread_count: null }, 'oops', 42]) {
    assert.equal(readUnreadCount(bad), 0, `${JSON.stringify(bad)} should read as 0`);
  }
});

test('a count sent as a string is still a count', () => {
  // DRF sends a number today. A serializer change should move the badge, not
  // silently blank it.
  assert.equal(readUnreadCount({ unread_count: '7' }), 7);
});

test('nonsense is not counted', () => {
  assert.equal(readUnreadCount({ unread_count: 'seven' }), 0);
  assert.equal(readUnreadCount({ unread_count: Infinity }), 0);
  assert.equal(readUnreadCount({ unread_count: NaN }), 0);
});

test('a negative count is not a number of messages', () => {
  assert.equal(readUnreadCount({ unread_count: -4 }), 0);
});

test('a fractional count is floored rather than shown as a decimal', () => {
  assert.equal(readUnreadCount({ unread_count: 2.7 }), 2);
});

// ─── drawing the badge ───────────────────────────────────────────────────────

test('an unread message shows its number', () => {
  assert.equal(badgeLabel(1), '1');
  assert.equal(badgeLabel(12), '12');
});

test('nothing unread shows nothing at all', () => {
  assert.equal(badgeLabel(0), '');
  assert.equal(badgeLabel(null), '');
  assert.equal(badgeLabel(undefined), '');
});

test('the badge caps where the existing nav caps it', () => {
  // The bubble is a fixed ~16px circle; a four-digit count would run across
  // the icon.
  assert.equal(badgeLabel(99), '99');
  assert.equal(badgeLabel(100), '99+');
  assert.equal(badgeLabel(4821), '99+');
});
