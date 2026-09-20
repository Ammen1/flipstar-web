// Which payment methods a coin purchase may use.
//
//     0 < price <= 10 ETB  ->  telebirr or airtime
//         price >  10 ETB  ->  telebirr only
//
// The limit used to be an exact price, so airtime was offered for the one
// 10 ETB package and for nothing cheaper -- a 5 ETB custom purchase could not
// use it. It is a ceiling now.
//
// These mirror tests/unit/test_payment_methods.py case for case. The server is
// the authority; this file decides what the page *offers*, and if the two
// disagree a buyer is shown a method their purchase will then be refused for.

import assert from 'node:assert/strict';
import test from 'node:test';

import { AIRTIME, AIRTIME_MAX_ETB, TELEBIRR, allowedPayMethods } from '../utils/payMethods.js';

const withAirtime = { allowsAirtime: true };

// ── the ceiling ──────────────────────────────────────────────────────────────

test('a purchase at the limit may use either method', () => {
  assert.deepEqual(allowedPayMethods(10, withAirtime), [TELEBIRR, AIRTIME]);
  assert.deepEqual(allowedPayMethods('10.00', withAirtime), [TELEBIRR, AIRTIME]);
});

test('a cheaper purchase may too', () => {
  // The case the exact-match rule got wrong: less money, fewer options.
  for (const price of [1, 5, 9.99, '2.50', 0.01]) {
    assert.deepEqual(
      allowedPayMethods(price, withAirtime),
      [TELEBIRR, AIRTIME],
      `${price} ETB should allow airtime`,
    );
  }
});

test('a dearer purchase is telebirr only', () => {
  for (const price of [10.01, 11, 20, 25, 50, 100, '250']) {
    assert.deepEqual(
      allowedPayMethods(price, withAirtime),
      [TELEBIRR],
      `${price} ETB should not allow airtime`,
    );
  }
});

test('the limit is stated once and is ten Birr', () => {
  assert.equal(AIRTIME_MAX_ETB, 10);
});

// ── the ways a price can be wrong ────────────────────────────────────────────

test('nothing, and less than nothing, are not purchases', () => {
  // Without the explicit floor, -1 satisfies "at most 10" -- the one way a
  // ceiling can be got round.
  for (const price of [0, '0', -1, '-5', -0.01]) {
    assert.deepEqual(allowedPayMethods(price, withAirtime), [TELEBIRR], `${price} allowed airtime`);
  }
});

test('an unreadable price never widens what is allowed', () => {
  for (const price of [null, undefined, '', 'abc', NaN, {}, []]) {
    assert.deepEqual(
      allowedPayMethods(price, withAirtime),
      [TELEBIRR],
      `${JSON.stringify(price)} allowed airtime`,
    );
  }
});

// ── availability, which is separate from price ───────────────────────────────

test('airtime is not offered when it is switched off, at any price', () => {
  // /charging/coin-purchase/ returns 403 for everyone today. Offering the
  // option would be offering a button that cannot work.
  assert.deepEqual(allowedPayMethods(5), [TELEBIRR]);
  assert.deepEqual(allowedPayMethods(10, { allowsAirtime: false }), [TELEBIRR]);
});

test('inside the SuperApp there is only telebirr', () => {
  // That payment counter cannot charge airtime, whatever the price.
  assert.deepEqual(allowedPayMethods(5, { allowsAirtime: true, inSuperApp: true }), [TELEBIRR]);
  assert.deepEqual(allowedPayMethods(10, { allowsAirtime: true, inSuperApp: true }), [TELEBIRR]);
});

test('telebirr is always among the options', () => {
  for (const price of [0, 1, 10, 11, 1000, 'nonsense']) {
    assert.ok(
      allowedPayMethods(price, withAirtime).includes(TELEBIRR),
      `${price} left no way to pay`,
    );
  }
});

test('called with no options at all, it still answers', () => {
  assert.deepEqual(allowedPayMethods(10), [TELEBIRR]);
});
