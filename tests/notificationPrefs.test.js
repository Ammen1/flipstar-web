// Reading a stored set of notification switches.
//
// These switches used to be decoration -- the server pushed everything
// regardless -- so nothing depended on reading them correctly. Now the server
// honours them, and the failure this file is mostly about is subtle: a
// preference set saved before a switch existed has no key for it, and reading
// that as `undefined` renders the switch as off. The user is then told they
// muted something they never touched, and the next save sends that `false`
// back and makes it true.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_SWITCHES,
  PREFERENCE_FIELD,
  mergeNotificationPrefs,
  pushAllowed,
  readStoredPrefs,
} from '../utils/notificationPrefs.js';

test('everything is on by default', () => {
  for (const [key, value] of Object.entries(DEFAULT_NOTIFICATION_PREFS)) {
    assert.equal(value, true, `${key} should default to on`);
  }
});

test('a switch missing from a stored set keeps its default', () => {
  // The actual regression: a set saved before `gifts` existed.
  const stored = { likes: false, comments: true, follows: true, messages: true };

  const merged = mergeNotificationPrefs(stored);

  assert.equal(merged.likes, false, 'an explicit choice survives');
  assert.equal(merged.gifts, true, 'an absent switch is not read as off');
  assert.equal(merged.system, true);
  assert.equal(merged.push_notifications, true);
});

test('later sources win, so the server can correct a stale local copy', () => {
  const stored = { likes: false };
  const fromServer = { likes: true, gifts: false };

  const merged = mergeNotificationPrefs(stored, fromServer);

  assert.equal(merged.likes, true);
  assert.equal(merged.gifts, false);
});

test('an undefined value does not overwrite an earlier one', () => {
  const merged = mergeNotificationPrefs({ likes: false }, { likes: undefined });
  assert.equal(merged.likes, false);
});

test('a null source is skipped rather than throwing', () => {
  const merged = mergeNotificationPrefs(null, undefined, { likes: false });
  assert.equal(merged.likes, false);
});

test('unknown keys are dropped', () => {
  // A stale key from an older release must not be sent back to the server.
  const merged = mergeNotificationPrefs({ likes: true, carrier_pigeon: true });
  assert.equal('carrier_pigeon' in merged, false);
});

test('values are coerced to booleans', () => {
  const merged = mergeNotificationPrefs({ likes: 0, gifts: 1 });
  assert.equal(merged.likes, false);
  assert.equal(merged.gifts, true);
});

test('reading nothing from storage gives the defaults', () => {
  assert.deepEqual(readStoredPrefs(null), DEFAULT_NOTIFICATION_PREFS);
  assert.deepEqual(readStoredPrefs(''), DEFAULT_NOTIFICATION_PREFS);
});

test('unparseable storage gives the defaults rather than throwing', () => {
  // A settings page that throws on read is one nobody can open to fix it.
  assert.deepEqual(readStoredPrefs('{not json'), DEFAULT_NOTIFICATION_PREFS);
  assert.deepEqual(readStoredPrefs('"a string"'), DEFAULT_NOTIFICATION_PREFS);
});

test('valid storage is merged over the defaults', () => {
  assert.equal(readStoredPrefs('{"likes":false}').likes, false);
  assert.equal(readStoredPrefs('{"likes":false}').gifts, true);
});

test('every switch in the render list has a default', () => {
  for (const { key } of NOTIFICATION_SWITCHES) {
    assert.ok(key in DEFAULT_NOTIFICATION_PREFS, `${key} has no default`);
  }
});

test('every default is rendered somewhere', () => {
  // A switch the UI does not render cannot be changed.
  const rendered = new Set(NOTIFICATION_SWITCHES.map((s) => s.key));
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS)) {
    assert.ok(rendered.has(key), `${key} is not rendered`);
  }
});

test('exactly one switch is the master, and it is first', () => {
  const masters = NOTIFICATION_SWITCHES.filter((s) => s.master);
  assert.equal(masters.length, 1);
  assert.equal(NOTIFICATION_SWITCHES[0].key, 'push_notifications');
});

// ── the local mirror of the server's gate ──────────────────────────────────

test('the master switch silences everything', () => {
  const off = { push_notifications: false };
  assert.equal(pushAllowed(off, 'like'), false);
  assert.equal(pushAllowed(off, 'prize_won'), false);
  assert.equal(pushAllowed(off, 'moderation'), false);
});

test('a per-type switch silences only its own type', () => {
  const prefs = { likes: false };
  assert.equal(pushAllowed(prefs, 'like'), false);
  assert.equal(pushAllowed(prefs, 'comment'), true);
});

test('moderation notices have no switch', () => {
  // A user cannot opt out of being told their own content was actioned.
  assert.equal(PREFERENCE_FIELD.moderation, null);
  assert.equal(pushAllowed({ likes: false, gifts: false }, 'moderation'), true);
});

test('the system switch governs subscription, prize and withdrawal notices', () => {
  const prefs = { system: false };
  for (const type of [
    'subscription_activated',
    'subscription_renewed',
    'subscription_expired',
    'prize_won',
    'prize_delivered',
    'withdrawal_paid',
  ]) {
    assert.equal(pushAllowed(prefs, type), false, `${type} should be silenced`);
  }
  assert.equal(pushAllowed(prefs, 'like'), true);
});

test('an unrecognised type is allowed', () => {
  // A new type should be visible and then mapped, not silently swallowed.
  assert.equal(pushAllowed({}, 'something_new'), true);
});

test('every mapped field is a real switch', () => {
  for (const [type, field] of Object.entries(PREFERENCE_FIELD)) {
    if (field === null) continue;
    assert.ok(field in DEFAULT_NOTIFICATION_PREFS, `${type} maps to unknown switch ${field}`);
  }
});
