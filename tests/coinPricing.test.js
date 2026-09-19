// Pricing a typed Birr amount, as the Buy Coins page previews it.
//
// The rule these pin is that the preview agrees with the server. The server
// works in Decimal with ROUND_DOWN; this works in JavaScript numbers, which is
// where the interesting failures live -- 0.1 * 3 is 0.30000000000000004, and
// at a high enough rate that is a whole coin's disagreement.

import assert from 'node:assert/strict';
import test from 'node:test';

import { PRICING_CODES, formatBirr, quoteCoins, readPricing } from '../utils/coinPricing.js';

/** What /wallet/config/ sends: the real staging shape. */
const pricing = readPricing({
  custom_purchase: {
    enabled: true,
    coins_per_birr: '10',
    min_etb: '1.00',
    max_etb: '1000.00',
    decimal_places: 2,
  },
});

test('the rate is read from the API, not built in', () => {
  assert.equal(pricing.coinsPerBirr, 10);
  assert.equal(pricing.minEtb, 1);
  assert.equal(pricing.maxEtb, 1000);
});

test('pricing is unavailable when the API says so', () => {
  assert.equal(readPricing({ custom_purchase: { enabled: false } }), null);
  assert.equal(readPricing({}), null);
  assert.equal(readPricing(null), null);

  const r = quoteCoins('5', null);
  assert.equal(r.ok, false);
  assert.equal(r.code, PRICING_CODES.UNAVAILABLE);
});

test('5 Birr buys 50 coins', () => {
  // The example from the brief.
  const r = quoteCoins('5', pricing);
  assert.equal(r.ok, true);
  assert.equal(r.coins, 50);
  assert.equal(r.amount, 5);
});

test('the minimum is allowed, just below it is not', () => {
  assert.equal(quoteCoins('1', pricing).ok, true);

  const r = quoteCoins('0.99', pricing);
  assert.equal(r.ok, false);
  assert.equal(r.code, PRICING_CODES.BELOW_MIN);
  assert.match(r.message, /smallest purchase is 1 Birr/);
});

test('the maximum is allowed, just above it is not', () => {
  assert.equal(quoteCoins('1000', pricing).ok, true);

  const r = quoteCoins('1000.01', pricing);
  assert.equal(r.ok, false);
  assert.equal(r.code, PRICING_CODES.ABOVE_MAX);
});

test('zero and negatives are refused', () => {
  assert.equal(quoteCoins('0', pricing).code, PRICING_CODES.NOT_POSITIVE);
  assert.equal(quoteCoins('0.00', pricing).code, PRICING_CODES.NOT_POSITIVE);
  // A minus sign never matches the digits pattern, so it reads as invalid
  // rather than as a negative number -- either way it cannot be bought.
  assert.equal(quoteCoins('-5', pricing).ok, false);
});

test('an empty amount asks for one rather than complaining', () => {
  assert.equal(quoteCoins('', pricing).code, PRICING_CODES.REQUIRED);
  assert.equal(quoteCoins('   ', pricing).code, PRICING_CODES.REQUIRED);
  assert.equal(quoteCoins(undefined, pricing).code, PRICING_CODES.REQUIRED);
});

test('non-numeric input is refused', () => {
  for (const bad of ['abc', '5abc', '5..5', '1e3', '٥', '5,5']) {
    const r = quoteCoins(bad, pricing);
    assert.equal(r.ok, false, `${bad} was accepted`);
    assert.equal(r.code, PRICING_CODES.INVALID, `${bad} gave ${r.code}`);
  }
});

test('decimals are allowed to two places and round down', () => {
  assert.equal(quoteCoins('5.5', pricing).coins, 55);
  assert.equal(quoteCoins('5.55', pricing).coins, 55, 'rounds down, never up');
  assert.equal(quoteCoins('0.55', pricing).ok, false, 'still under the minimum');
});

test('a third decimal place is refused', () => {
  const r = quoteCoins('5.555', pricing);
  assert.equal(r.ok, false);
  assert.equal(r.code, PRICING_CODES.TOO_PRECISE);
  assert.match(r.message, /at most 2 decimal places/);
});

test('float error never costs or gains a coin', () => {
  // 0.1 * 3 === 0.30000000000000004. Multiplying in cents first is what keeps
  // this equal to the server's Decimal arithmetic.
  const fine = readPricing({
    custom_purchase: { enabled: true, coins_per_birr: '3', min_etb: '0.01', max_etb: '1000' },
  });
  // 0.1 * 3 = 0.3, which floors to no coins at all -- refused, not sold as 0.
  assert.equal(quoteCoins('0.1', fine).ok, false);
  assert.equal(quoteCoins('1.1', fine).coins, 3, '1.1 * 3 = 3.3 -> 3');
  assert.equal(quoteCoins('2.3', fine).coins, 6, '2.3 * 3 = 6.9 -> 6');
});

test('an amount too small to buy one coin is refused, not rounded to zero', () => {
  const stingy = readPricing({
    custom_purchase: { enabled: true, coins_per_birr: '0.5', min_etb: '0.01', max_etb: '1000' },
  });
  const r = quoteCoins('1', stingy);
  assert.equal(r.ok, false);
  assert.equal(r.code, PRICING_CODES.BELOW_MIN);
});

test('a number is accepted as readily as a string', () => {
  assert.equal(quoteCoins(5, pricing).coins, 50);
  assert.equal(quoteCoins(5.5, pricing).coins, 55);
});

const PACKAGES = [
  { price_etb: '10.00', total_coins: 100, bonus_coins: 0 },
  { price_etb: '25.00', total_coins: 275, bonus_coins: 25 },
  { price_etb: '50.00', total_coins: 575, bonus_coins: 75 },
];

test('an amount that is exactly a package price previews that package', () => {
  // The server sells the package here, bonus included. Previewing the bare
  // rate would promise 250 coins for 25 Birr while 275 were credited.
  const r = quoteCoins('25', pricing, PACKAGES);
  assert.equal(r.coins, 275);
  assert.equal(r.bonusCoins, 25);
  assert.ok(r.matchedPackage);
});

test('an amount near a package price is priced at the bare rate', () => {
  assert.equal(quoteCoins('25.01', pricing, PACKAGES).coins, 250);
  assert.equal(quoteCoins('24.99', pricing, PACKAGES).coins, 249);
  assert.equal(quoteCoins('26', pricing, PACKAGES).matchedPackage, null);
});

test('without the package list the bare rate is used', () => {
  assert.equal(quoteCoins('25', pricing).coins, 250);
});

test('money reads the way people write it', () => {
  assert.equal(formatBirr(5), '5');
  assert.equal(formatBirr('5.50'), '5.5');
  assert.equal(formatBirr(5.555), '5.56');
  assert.equal(formatBirr('x'), '0');
});
