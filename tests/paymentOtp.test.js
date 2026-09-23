// What the payment verification step shows, and when Pay may be pressed.
//
// The rules that matter are on the server; these cover the half the payer
// sees, and one thing that is easy to get wrong in the UI: "verified" with no
// session id is not ready to pay, it is a bug, and Pay must stay disabled
// rather than send a push the server will refuse.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IDLE,
  SENT,
  VERIFIED,
  canPay,
  canResend,
  cooldownRemaining,
  hintFor,
  isCompleteCode,
  messageFor,
} from '../utils/paymentOtp.js';

// ── the code itself ──────────────────────────────────────────────────────────

test('six digits is a complete code', () => {
  assert.equal(isCompleteCode('123456'), true);
});

test('a leading zero is still a code', () => {
  assert.equal(isCompleteCode('000123'), true);
});

test('five digits is not', () => {
  assert.equal(isCompleteCode('12345'), false);
});

test('seven digits is not', () => {
  assert.equal(isCompleteCode('1234567'), false);
});

test('letters are not a code', () => {
  assert.equal(isCompleteCode('12a456'), false);
});

test('nothing is not a code', () => {
  assert.equal(isCompleteCode(''), false);
  assert.equal(isCompleteCode(), false);
});

// ── when Pay may be pressed ──────────────────────────────────────────────────

test('a verified step with a session may pay', () => {
  assert.equal(canPay({ step: VERIFIED, sessionId: 'abc' }), true);
});

test('an unverified step may not, whatever else is true', () => {
  assert.equal(canPay({ step: IDLE, sessionId: 'abc' }), false);
  assert.equal(canPay({ step: SENT, sessionId: 'abc' }), false);
});

test('verified without a session id may not pay', () => {
  // There would be nothing to send, and the server would refuse it.
  assert.equal(canPay({ step: VERIFIED, sessionId: null }), false);
});

test('a request already in flight may not start another', () => {
  assert.equal(canPay({ step: VERIFIED, sessionId: 'abc', busy: true }), false);
});

test('it survives being called with nothing', () => {
  assert.equal(canPay(), false);
});

// ── the resend cooldown ──────────────────────────────────────────────────────

test('the countdown runs down', () => {
  const sent = 1_000_000;
  assert.equal(cooldownRemaining(sent, sent, 60), 60);
  assert.equal(cooldownRemaining(sent, sent + 20_000, 60), 40);
});

test('the countdown stops at zero rather than going negative', () => {
  assert.equal(cooldownRemaining(1_000_000, 1_120_000, 60), 0);
});

test('nothing sent yet means no wait', () => {
  assert.equal(cooldownRemaining(null, Date.now(), 60), 0);
});

test('resend is refused while the countdown runs', () => {
  const sent = 1_000_000;
  assert.equal(canResend({ step: SENT, lastSentAt: sent, now: sent + 5_000, cooldownSeconds: 60 }), false);
});

test('resend is allowed once it is done', () => {
  const sent = 1_000_000;
  assert.equal(canResend({ step: SENT, lastSentAt: sent, now: sent + 61_000, cooldownSeconds: 60 }), true);
});

test('a verified step has nothing left to resend', () => {
  assert.equal(canResend({ step: VERIFIED, lastSentAt: null, now: Date.now(), cooldownSeconds: 60 }), false);
});

// ── what the payer is told ───────────────────────────────────────────────────

test('every refusal the page reacts to has words for it', () => {
  const codes = [
    'OTP_INVALID',
    'OTP_EXPIRED',
    'TOO_MANY_ATTEMPTS',
    'RESEND_COOLDOWN',
    'HOURLY_LIMIT',
    'SMS_FAILED',
    'SESSION_NOT_FOUND',
    'VERIFICATION_REQUIRED',
    'VERIFICATION_EXPIRED',
    'VERIFICATION_ALREADY_USED',
    'VERIFICATION_MISMATCH',
  ];
  for (const code of codes) {
    const message = messageFor(code);
    assert.ok(message.length > 10, `${code} says too little: ${message}`);
    assert.ok(/[.!]$/.test(message), `${code} is not a sentence: ${message}`);
  }
});

test('an unknown code falls back to the server text', () => {
  assert.equal(messageFor('SOMETHING_NEW', 'Server said this'), 'Server said this');
});

test('an unknown code with no server text still says something', () => {
  assert.ok(messageFor('SOMETHING_NEW').length > 10);
});

test('no message ever contains a code value', () => {
  // A message is shown on screen and copied into support tickets; the OTP
  // must never travel that way.
  for (const code of ['OTP_INVALID', 'OTP_EXPIRED', 'SMS_FAILED']) {
    assert.ok(!/\d{6}/.test(messageFor(code)));
  }
});

// ── the hint line ────────────────────────────────────────────────────────────

test('an error is what the payer is told first', () => {
  const hint = hintFor({ error: 'That code is not correct.', cooldown: 30, attemptsRemaining: 2 });
  assert.equal(hint, 'That code is not correct.');
});

test('the wait is shown when there is nothing wrong', () => {
  assert.match(hintFor({ cooldown: 30 }), /30s/);
});

test('a low number of tries left is worth saying', () => {
  assert.match(hintFor({ attemptsRemaining: 2 }), /2 tries left/);
});

test('one try left is singular', () => {
  assert.match(hintFor({ attemptsRemaining: 1 }), /1 try left/);
});

test('a full complement of tries is not worth mentioning', () => {
  assert.equal(hintFor({ attemptsRemaining: 5 }), '');
});

test('no tries left says nothing -- the error already did', () => {
  assert.equal(hintFor({ attemptsRemaining: 0 }), '');
});

test('nothing to say is an empty string, not undefined', () => {
  assert.equal(hintFor(), '');
  assert.equal(hintFor({}), '');
});
