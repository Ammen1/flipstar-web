/**
 * Ethiopian mobile numbers — one rule, shared by every form.
 *
 * Mirrors `common/validators/phone.py` on the API. The subscriber part is nine
 * digits beginning with 9 (Ethio Telecom) or 7 (Safaricom Ethiopia):
 *
 *     ^[79]\d{8}$
 *
 * The user types only those nine digits; `+251` is a fixed prefix in the UI and
 * is added on submit, so a value can never end up double-prefixed.
 */

export const ETHIOPIAN_MOBILE_RE = /^[79]\d{8}$/;

export const COUNTRY_CODE = '+251';
const COUNTRY_CODE_DIGITS = '251';

export const PHONE_MAX_DIGITS = 9;

export const INVALID_PHONE_MESSAGE =
  'Please enter a valid Ethiopian phone number starting with 9 (e.g. 944365493).';

/**
 * What the input field should hold after a keystroke or paste.
 *
 * Digits only, capped at nine. A pasted number that carries its country code
 * or trunk prefix is unwrapped rather than rejected — someone pasting
 * `+251944365493` into a field already showing `+251` means the subscriber
 * number, and silently truncating it to `251944365` would be worse than
 * useless.
 */
export function sanitizePhoneInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '');

  // Strip one recognised prefix, then require a subscriber leading digit.
  //
  // Only a *leading* prefix is removed — scanning for the first 7 or 9
  // anywhere would turn a pasted '844365493' into '93', silently inventing a
  // different number. Rejecting outright is clearer, and it is also what the
  // spec asks for: a first digit other than 9 (or 7) must not be accepted.
  //
  // This works the same whether the value arrives in one paste or a character
  // at a time, which a length-based unwrap could not manage: typing
  // '+251944365493' used to leave '251944365'.
  let subscriber = digits;
  if (subscriber.startsWith(COUNTRY_CODE_DIGITS)) {
    subscriber = subscriber.slice(COUNTRY_CODE_DIGITS.length);
  } else if (subscriber.startsWith('0')) {
    subscriber = subscriber.slice(1);
  }

  if (subscriber && !/^[79]/.test(subscriber)) return '';

  return subscriber.slice(0, PHONE_MAX_DIGITS);
}

/** True when `nine` is a complete, valid subscriber number. */
export function isValidEthiopianMobile(nine) {
  return ETHIOPIAN_MOBILE_RE.test(String(nine ?? ''));
}

/**
 * The nine-digit subscriber part of `value`, or null if it is not one.
 *
 * Mirrors `_subscriber_part` in `common/validators/phone.py`: separators are
 * ignored, at most one `+`, then at most one country code *or* one trunk
 * prefix. Deliberately stricter than `sanitizePhoneInput` -- that one filters
 * keystrokes and may truncate, which is right for an input field and wrong at
 * a validation boundary, where `9443654930` and `abc944365493` must be
 * rejected rather than quietly repaired into a different number.
 */
function subscriberPart(value) {
  let s = String(value ?? '').replace(/[\s\-()]/g, '');
  if (!s) return null;

  if (s.startsWith('+')) s = s.slice(1);
  if (s.includes('+')) return null;           // '+251+251...'

  if (s.startsWith(COUNTRY_CODE_DIGITS)) s = s.slice(COUNTRY_CODE_DIGITS.length);
  else if (s.startsWith('0')) s = s.slice(1);

  return ETHIOPIAN_MOBILE_RE.test(s) ? s : null;
}

/**
 * `944365493` -> `+251944365493`, or null when invalid.
 *
 * Accepts an already-prefixed value, so calling it twice is safe and can never
 * produce `+251+251…`.
 */
export function toE164(value) {
  const nine = subscriberPart(value);
  return nine ? COUNTRY_CODE + nine : null;
}

/**
 * The message to show under the field, or '' when there is nothing to say.
 * Silent while the field is empty or still being typed — an error that appears
 * on the first keystroke is noise.
 */
export function phoneInputError(nine, { touched = false } = {}) {
  const v = String(nine ?? '');
  if (!v) return touched ? INVALID_PHONE_MESSAGE : '';
  if (v.length < PHONE_MAX_DIGITS) {
    return touched ? INVALID_PHONE_MESSAGE : '';
  }
  return isValidEthiopianMobile(v) ? '' : INVALID_PHONE_MESSAGE;
}
