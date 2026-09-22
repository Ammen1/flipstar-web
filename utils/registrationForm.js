// What is still missing before the subscription sign-in form can be sent.
//
// The screen a SuperApp subscriber lands on after "Send OTP" asks for a code,
// a PIN, a confirmation and (for a new account) a username. Its submit button
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

/** The shortest username the form accepts. */
export const USERNAME_MIN = 3;

/**
 * The next thing the person needs to do, or '' when the form is ready.
 *
 * One message at a time, in the order the form itself checks: telling
 * somebody about a username while their code is still half-typed sends them
 * to the wrong field.
 */
export function missingStep({
  otp = '',
  pin = '',
  confirm = '',
  username = '',
  existingUser = false,
  termsAgreed = false,
} = {}) {
  if (String(otp).length !== 6) return 'Enter the 6-digit code from the SMS';
  if (!PIN_PATTERN.test(String(pin))) return 'Your PIN must be exactly 6 digits';
  if (String(pin) !== String(confirm)) return 'Both PINs must match';
  if (!existingUser && String(username).trim().length < USERNAME_MIN) {
    return `Choose a username of at least ${USERNAME_MIN} characters`;
  }
  if (!termsAgreed) return 'Please accept the Terms and Conditions';
  return '';
}

/** Whether the form has everything it needs. */
export function isReady(state) {
  return missingStep(state) === '';
}

export default { PIN_PATTERN, USERNAME_MIN, missingStep, isReady };
