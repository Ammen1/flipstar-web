// Who may like, share, comment and send gifts.
//
// The rule is deliberately one condition, not two. Before this the four
// buttons disagreed with each other: Like sent a signed-out visitor to a
// login form, Comment and Gift opened a login form and then never checked the
// subscription at all, Share checked the subscription and ignored the login.
// These pin the single rule so they cannot drift apart again.

import assert from 'node:assert/strict';
import test from 'node:test';

import { canEngage, withSubscription } from '../utils/engagementGate.js';

const subscribed = { has_subscription: true };
const lapsed = { has_subscription: false };

test('an active subscriber may engage', () => {
  assert.equal(canEngage(subscribed), true);
});

test('a signed-out visitor may not, and is not asked to log in first', () => {
  // Signed out means no status at all. It is not a separate case: the visitor
  // goes to the plans, the same as anybody else without a subscription.
  assert.equal(canEngage(null), false);
  assert.equal(canEngage(undefined), false);
});

test('a signed-in user whose subscription lapsed may not', () => {
  assert.equal(canEngage(lapsed), false);
});

test('a status that has not loaded yet is treated as not allowed', () => {
  // Erring the other way would let one tap through on every cold start.
  assert.equal(canEngage({}), false);
});

test('a truthy non-boolean still reads as allowed', () => {
  assert.equal(canEngage({ has_subscription: 1 }), true);
});

test('withSubscription runs the action for a subscriber', () => {
  let ran = false;
  const result = withSubscription(subscribed, () => assert.fail('sent to plans'), () => {
    ran = true;
  });

  assert.equal(ran, true);
  assert.equal(result, true, 'reports that the action ran');
});

test('withSubscription sends everybody else to the plans instead', () => {
  let shown = 0;
  const result = withSubscription(lapsed, () => { shown += 1; }, () => assert.fail('acted'));

  assert.equal(shown, 1);
  assert.equal(result, false, 'reports that the action did not run');
});

test('withSubscription survives a missing handler', () => {
  // The page may not pass one; that must not throw inside a click handler.
  assert.doesNotThrow(() => withSubscription(lapsed, undefined, () => assert.fail('acted')));
  assert.doesNotThrow(() => withSubscription(subscribed, undefined, undefined));
});
