// What the sign-in form tells somebody is still missing.
//
// The screen a SuperApp subscriber reaches after "Send OTP" asks for a code, a
// PIN, a confirmation and — for a new account — a username, and its button
// greys out until all of them are right. It used to give no reason, so five
// digits of a six-digit PIN looked identical to a form that was ready.
//
// These pin the order as much as the rules: one message at a time, matching
// what the form itself checks, so the hint can never point at a different
// field from the error that follows.

import assert from 'node:assert/strict';
import test from 'node:test';

import { isReady, missingStep } from '../utils/registrationForm.js';

const complete = {
  otp: '123456',
  pin: '111111',
  confirm: '111111',
  username: 'ammen',
  existingUser: false,
  termsAgreed: true,
};

test('a complete form has nothing missing', () => {
  assert.equal(missingStep(complete), '');
  assert.equal(isReady(complete), true);
});

// ── the code ─────────────────────────────────────────────────────────────────

test('a half-typed code says so', () => {
  assert.match(missingStep({ ...complete, otp: '123' }), /6-digit code/);
});

test('an empty form asks for the code first', () => {
  // Not the username, and not the terms: the person is looking at the code
  // boxes, so that is what the hint must be about.
  assert.match(missingStep({}), /6-digit code/);
});

test('more than six digits is not a code either', () => {
  assert.match(missingStep({ ...complete, otp: '1234567' }), /6-digit code/);
});

// ── the PIN ──────────────────────────────────────────────────────────────────

test('a short PIN says exactly how long it must be', () => {
  assert.match(missingStep({ ...complete, pin: '111', confirm: '111' }), /exactly 6 digits/);
});

test('a PIN with letters in it is refused', () => {
  assert.match(missingStep({ ...complete, pin: '11a111', confirm: '11a111' }), /exactly 6 digits/);
});

test('two different PINs say they must match', () => {
  assert.match(missingStep({ ...complete, confirm: '222222' }), /must match/);
});

test('the PIN is checked before the confirmation', () => {
  // Both are wrong here. Being told "they must match" while the first one is
  // too short sends somebody to fix the wrong box.
  const both = missingStep({ ...complete, pin: '11', confirm: '22' });
  assert.match(both, /exactly 6 digits/);
});

// ── the username ─────────────────────────────────────────────────────────────

test('a new account needs a username', () => {
  assert.match(missingStep({ ...complete, username: '' }), /username/);
});

test('a username of spaces is no username', () => {
  assert.match(missingStep({ ...complete, username: '   ' }), /username/);
});

test('a username must reach the minimum length', () => {
  assert.match(missingStep({ ...complete, username: 'am' }), /at least 3/);
});

test('somebody who already has an account is not asked for one', () => {
  const subscriber = { ...complete, username: '', existingUser: true };
  assert.equal(missingStep(subscriber), '');
});

// ── the terms ────────────────────────────────────────────────────────────────

test('the terms are the last thing asked for', () => {
  assert.match(missingStep({ ...complete, termsAgreed: false }), /Terms and Conditions/);
});

test('the terms are not mentioned while something earlier is wrong', () => {
  const early = missingStep({ ...complete, otp: '1', termsAgreed: false });
  assert.match(early, /6-digit code/);
  assert.ok(!/Terms/.test(early));
});

// ── shape ────────────────────────────────────────────────────────────────────

test('it survives being called with nothing', () => {
  assert.equal(typeof missingStep(), 'string');
  assert.equal(isReady(), false);
});

test('numbers typed into the fields are handled as text', () => {
  assert.equal(missingStep({ ...complete, otp: 123456, pin: 111111, confirm: 111111 }), '');
});
