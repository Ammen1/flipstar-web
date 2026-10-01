// What is still missing before the subscription sign-in form can be sent.
//
// The screen a SuperApp subscriber lands on after "Send OTP" asks for a code,
// a PIN and a confirmation. Its submit button
// greys out until those are right, and it used to give no reason at all -- so
// the commonest way to be stuck there was to have typed five digits of a PIN
// and have nothing on screen say so.
//
// The order and the rules mirror `handleRegister` in
// components/auth/SubscriptionRegisterModal.jsx one for one. If they drift,
// the hint names a different problem from the error the form then raises,
// which is worse than saying nothing. That is what these rules are tested
// against.

/** The PIN this product uses: exactly six digits, nothing else. */
export const PIN_PATTERN = /^\d{6}$/;

/**
 * The next thing the person needs to do, or '' when the form is ready.
 *
 * One message at a time, in the order the form itself checks: naming a later
 * problem while the code is still half-typed sends them to the wrong field.
 *
 * `username` and `existingUser` are still accepted and ignored. The screen no
 * longer asks for a handle -- the server generates one -- and dropping the
 * parameters would break any caller still passing them for no gain.
 */
export function missingStep({
  otp = '',
  pin = '',
  confirm = '',
  termsAgreed = false,
} = {}) {
  if (String(otp).length !== 6) return 'Enter the 6-digit code from the SMS';
  if (!PIN_PATTERN.test(String(pin))) return 'Your PIN must be exactly 6 digits';
  if (String(pin) !== String(confirm)) return 'Both PINs must match';
  if (!termsAgreed) return 'Please accept the Terms and Conditions';
  return '';
}

/** Whether the form has everything it needs. */
export function isReady(state) {
  return missingStep(state) === '';
}

export default { PIN_PATTERN, missingStep, isReady };
