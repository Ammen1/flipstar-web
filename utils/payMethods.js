// Which payment methods a coin purchase may use.
//
//     0 < price <= 10 ETB  ->  telebirr or airtime
//         price >  10 ETB  ->  telebirr only
//
// A ceiling, not an exact price. It used to be `price === 10`, which offered
// airtime for the one 10 ETB package and for nothing cheaper -- a 5 ETB custom
// purchase, which costs the buyer less, could not use it.
//
// This is the client's copy. common/validators/payment.py is the authority:
// a request naming airtime for a 50 ETB package is refused there whatever this
// file allows, so the two must agree, and the tests on both sides say the same
// thing so a change to one shows up as a failure in the other.

export const TELEBIRR = 'telebirr';
export const AIRTIME = 'airtime';

/** The most a purchase may cost and still be payable from airtime. */
export const AIRTIME_MAX_ETB = 10;

/**
 * The methods permitted for a price.
 *
 * `allowsAirtime` is whether airtime is available at all, which the API says
 * per package. Inside the telebirr SuperApp there is only ever telebirr --
 * airtime is not one of the things that payment counter can charge.
 *
 * A price that is not a number, zero, or negative yields telebirr only. Those
 * are not purchases, and without the explicit floor a price of -1 would
 * satisfy "at most 10" and widen what is allowed.
 */
export function allowedPayMethods(priceEtb, opts) {
  const { allowsAirtime = false, inSuperApp = false } = opts || {};
  if (inSuperApp) return [TELEBIRR];

  const amount = Number(priceEtb);
  // NaN fails every comparison, so an unreadable price falls through to the
  // restrictive answer on its own -- the same one the server gives.
  const withinAirtimeLimit = amount > 0 && amount <= AIRTIME_MAX_ETB;

  return withinAirtimeLimit && allowsAirtime ? [TELEBIRR, AIRTIME] : [TELEBIRR];
}

export default { TELEBIRR, AIRTIME, AIRTIME_MAX_ETB, allowedPayMethods };
