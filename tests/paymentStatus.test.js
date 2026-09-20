// What the client does with a payment's state.
//
// The reported bug lived here as much as on the server. The bridge answered
// `{success: true, pending: true}` for a payment the backend had marked
// FAILED, and again when the status request itself threw; the pages treat
// `success` as success; and the result sheet had two outcomes, so a payment
// still being confirmed could only be drawn as the successful one.
//
// The rule these pin is one sentence: a success screen requires the server to
// have said SUCCESS. Everything else -- a failure, a cancellation, a payment
// still in flight, an unreadable answer, no answer at all -- is not a success,
// and the three that are not terminal keep the page waiting rather than
// letting it conclude anything.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANCELLED,
  FAILED,
  PENDING,
  SUCCESS,
  describePayment,
  isFinal,
  isSuccess,
  readState,
} from '../utils/paymentStatus.js';

// ── reading the server's answer ──────────────────────────────────────────────

test('the state is taken from the server, not inferred', () => {
  assert.equal(readState({ state: 'SUCCESS' }), SUCCESS);
  assert.equal(readState({ state: 'FAILED' }), FAILED);
  assert.equal(readState({ state: 'CANCELLED' }), CANCELLED);
  assert.equal(readState({ state: 'PENDING' }), PENDING);
});

test('a state in the wrong case is still read', () => {
  assert.equal(readState({ state: 'success' }), SUCCESS);
  assert.equal(readState({ state: ' Failed ' }), FAILED);
});

test('an answer that cannot be read is pending, never success', () => {
  // A request that failed, a body in a shape this code does not know, a
  // state it has never heard of. None of them mean money changed hands.
  for (const bad of [null, undefined, {}, { state: null }, { state: 42 }, { state: 'PAID?' }, 'oops']) {
    assert.equal(readState(bad), PENDING, `${JSON.stringify(bad)} should read as pending`);
  }
});

test('an answer that cannot be read is not a failure either', () => {
  // The opposite mistake: telling somebody their payment failed when it may
  // still succeed sends them to pay a second time.
  assert.notEqual(readState({}), FAILED);
  assert.notEqual(readState(null), FAILED);
});

test('HTTP 200 on its own says nothing about the payment', () => {
  // The initiation endpoint answers 200 when telebirr *accepts the request*.
  // That body has no `state`, and it must not read as one.
  const initiationAccepted = { success: true, originator_conversation_id: 'AG_1' };
  assert.equal(readState(initiationAccepted), PENDING);
  assert.equal(isSuccess(readState(initiationAccepted)), false);
});

// ── who may show a success screen ────────────────────────────────────────────

test('only SUCCESS is a success', () => {
  assert.equal(isSuccess(SUCCESS), true);
  for (const state of [FAILED, PENDING, CANCELLED]) {
    assert.equal(isSuccess(state), false, `${state} would have shown a success screen`);
  }
});

test('pending does not end the wait', () => {
  assert.equal(isFinal(PENDING), false);
  assert.equal(isFinal(SUCCESS), true);
  assert.equal(isFinal(FAILED), true);
  assert.equal(isFinal(CANCELLED), true);
});

// ── what gets drawn ──────────────────────────────────────────────────────────

test('a confirmed payment is drawn as a success', () => {
  const shown = describePayment({ state: 'SUCCESS', coins_added: 120 });

  assert.equal(shown.tone, 'success');
  assert.equal(shown.heading, 'Payment successful');
  assert.equal(shown.final, true);
});

test('a pending payment is its own outcome, not a success', () => {
  // The bug, in one assertion. `{success: true, pending: true}` used to reach
  // the sheet as a green tick reading "Payment successful".
  const shown = describePayment({ state: 'PENDING' });

  assert.equal(shown.tone, 'pending');
  assert.notEqual(shown.tone, 'success');
  assert.ok(!/success/i.test(shown.heading), shown.heading);
  assert.ok(!/success/i.test(shown.message), shown.message);
  assert.equal(shown.final, false, 'the page must keep asking');
});

test('a failed payment is drawn as a failure', () => {
  const shown = describePayment({
    state: 'FAILED',
    reason: 'INSUFFICIENT_BALANCE',
    message: 'Your telebirr balance was not enough to complete this payment.',
  });

  assert.equal(shown.tone, 'failure');
  assert.equal(shown.reason, 'INSUFFICIENT_BALANCE');
  assert.match(shown.message, /balance/);
});

test('a cancellation says it was cancelled, not that it failed', () => {
  const shown = describePayment({ state: 'CANCELLED', message: 'The payment was cancelled.' });

  assert.equal(shown.tone, 'failure', 'drawn as unsuccessful');
  assert.equal(shown.heading, 'Payment cancelled');
  assert.ok(!/success/i.test(shown.message));
});

test("the server's own wording is preferred over the fallback", () => {
  // It knows the reason; the client has only a generic sentence.
  const shown = describePayment({ state: 'FAILED', message: 'The PIN entered was not correct.' });
  assert.match(shown.message, /PIN/);
});

test('a failure with no message from the server still says something useful', () => {
  const shown = describePayment({ state: 'FAILED' });

  assert.equal(shown.tone, 'failure');
  assert.ok(shown.message.length > 0);
  assert.ok(!/success/i.test(shown.message));
});

test('an empty message from the server is not shown as blank', () => {
  const shown = describePayment({ state: 'FAILED', message: '   ' });
  assert.ok(shown.message.trim().length > 0);
});

// ── the shapes the bridge used to return ─────────────────────────────────────

test('the old "pending means success" payload no longer draws a tick', () => {
  // Exactly what TelebirrH5Service returned for a FAILED payment, and what
  // BuyCoinsPage and SubscriptionPage both acted on.
  const legacy = { success: true, pending: true };

  assert.equal(isSuccess(readState(legacy)), false);
  assert.equal(describePayment(legacy).tone, 'pending');
});

test('a thrown status request does not become a success', () => {
  // The bridge caught its own error and returned `success: true`.
  const afterThrow = { state: PENDING, success: false, pending: true };

  assert.equal(describePayment(afterThrow).tone, 'pending');
  assert.equal(isSuccess(readState(afterThrow)), false);
});
