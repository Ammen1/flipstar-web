// Which plans the subscription page offers, and to whom.
//
// The rule the product wants: somebody without an account cannot start with
// on-demand, because on-demand tops up an account and grants nothing by
// itself. The interesting cases are the ones that broke it before -- a tier
// renamed in the admin, and a payload that spells the type differently.

import assert from 'node:assert/strict';
import test from 'node:test';

import { isOfferable, offerablePlans } from '../utils/planOffers.js';

const DAILY = { name: 'Daily', duration_type: 'daily' };
const WEEKLY = { name: 'Weekly', duration_type: 'weekly' };
const ON_DEMAND = { name: 'OnDemand Premium', duration_type: 'ondemand' };

const visitor = null;
const subscriber = { id: 1, username: 'someone' };

test('a visitor with no account is not offered on-demand', () => {
  assert.equal(isOfferable(ON_DEMAND, visitor), false);
  assert.equal(isOfferable(DAILY, visitor), true);
});

test('somebody with an account can still top up on demand', () => {
  assert.equal(isOfferable(ON_DEMAND, subscriber), true);
});

test('renaming the tier does not put it back in front of a visitor', () => {
  // This is the bug: the old filter matched the name 'OnDemand' and the tier
  // had been renamed, so it removed nothing at all.
  const renamed = { name: 'Pay As You Go', duration_type: 'ondemand' };

  assert.equal(isOfferable(renamed, visitor), false);
});

test('a tier that merely reads OnDemand is judged by its type, not its name', () => {
  const weeklyCalledOnDemand = { name: 'OnDemand Weekly', duration_type: 'weekly' };

  assert.equal(isOfferable(weeklyCalledOnDemand, visitor), true, 'a real weekly plan is still buyable');
});

test('the type is matched however the payload spells it', () => {
  assert.equal(isOfferable({ name: 'x', duration_type: 'OnDemand' }, visitor), false);
  assert.equal(isOfferable({ name: 'x', duration_type: 'ONDEMAND' }, visitor), false);
});

test('a plan with no type at all is left alone', () => {
  // Nothing in the payload says this is a top-up, so removing it would hide a
  // plan somebody could have bought.
  assert.equal(isOfferable({ name: 'Monthly' }, visitor), true);
});

test('the visitor keeps every plan a first subscription can use, in order', () => {
  const offered = offerablePlans([DAILY, ON_DEMAND, WEEKLY], visitor);

  assert.deepEqual(offered.map((t) => t.name), ['Daily', 'Weekly']);
});

test('a signed-in user sees the whole list', () => {
  const tiers = [DAILY, ON_DEMAND, WEEKLY];

  assert.deepEqual(offerablePlans(tiers, subscriber), tiers);
});

test('a missing or broken list is not a crash', () => {
  assert.deepEqual(offerablePlans(undefined, visitor), []);
  assert.deepEqual(offerablePlans(null, subscriber), []);
  assert.deepEqual(offerablePlans([null, DAILY], visitor).map((t) => t.name), ['Daily']);
});
