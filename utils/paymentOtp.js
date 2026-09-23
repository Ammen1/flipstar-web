// The SMS check that stands in front of a USSD Push.
//
// Everything here is decision-making, not display, so it can be tested
// without a browser: what the step is showing, whether Pay may be pressed,
// and what a given server refusal should say to the payer.
//
// The rules themselves live on the server (api/services/payment_otp.py).
// Nothing in this file authorises anything -- a verified step only means the
// server handed back a session id, and the server checks that again when the
// push is requested. Treat these values as what to draw, never as permission.

/** Nothing requested yet: the payer sees "Send code". */
export const IDLE = 'idle';
/** A code is on its way; the input is showing. */
export const SENT = 'sent';
/** The server accepted the code. Pay may be pressed. */
export const VERIFIED = 'verified';

export const CODE_LENGTH = 6;

// What each server refusal means to somebody standing at the screen. The
// server's own prose is reasonable, but these are written for the person
// rather than the log, and they cover the codes the page reacts to.
const MESSAGES = {
  OTP_INVALID: 'That code is not correct.',
  OTP_EXPIRED: 'That code has expired. Ask for a new one.',
  OTP_REQUIRED: 'Enter the 6-digit code we sent you.',
  TOO_MANY_ATTEMPTS: 'Too many incorrect codes. Start again to get a new one.',
  RESEND_COOLDOWN: 'Please wait before asking for another code.',
  TOO_MANY_SENDS: 'Too many codes sent for this payment. Start again.',
  HOURLY_LIMIT: 'Too many codes requested. Please try again later.',
  SMS_FAILED: 'We could not send the code. Check the number and try again.',
  SESSION_NOT_FOUND: 'This verification has expired. Please start again.',
  SESSION_MISMATCH: 'This code does not match this payment.',
  ALREADY_USED: 'This code has already been used.',
  VERIFICATION_REQUIRED: 'Verify your phone number before paying.',
  VERIFICATION_EXPIRED: 'Your verification expired. Please verify again.',
  VERIFICATION_ALREADY_USED: 'That verification was already used. Verify again.',
  VERIFICATION_MISMATCH: 'This verification was for a different payment.',
  AUTHENTICATION_REQUIRED: 'Please sign in to continue.',
  PHONE_REQUIRED: 'Enter the phone number to charge.',
};

/**
 * What to tell the payer about a refusal.
 *
 * Falls back to the server's own message, then to something generic, so a
 * code added on the server later still produces a sentence rather than a
 * blank space.
 */
export function messageFor(code, fallback) {
  return MESSAGES[code] || fallback || 'Something went wrong. Please try again.';
}

/** True when the code looks like something worth sending to the server. */
export function isCompleteCode(code) {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(String(code || ''));
}

/**
 * Whether the payment button may be pressed.
 *
 * Deliberately requires a session id as well as the verified state: the id is
 * what the push endpoint actually checks, so a step that says "verified" with
 * nothing to send is not ready, it is broken.
 */
export function canPay({ step, sessionId, busy } = {}) {
  return step === VERIFIED && Boolean(sessionId) && !busy;
}

/** Seconds left of a resend cooldown, never negative. */
export function cooldownRemaining(lastSentAt, now, seconds) {
  if (!lastSentAt) return 0;
  const elapsed = Math.floor((now - lastSentAt) / 1000);
  return Math.max(0, (seconds || 0) - elapsed);
}

/** Whether another code may be asked for yet. */
export function canResend({ step, lastSentAt, now, cooldownSeconds, busy } = {}) {
  if (busy || step === VERIFIED) return false;
  return cooldownRemaining(lastSentAt, now, cooldownSeconds) === 0;
}

/**
 * The line under the code boxes.
 *
 * One thing at a time, in the order the payer meets it: an error first,
 * because it is why they are still on this step; then the wait; then how many
 * tries are left, and only when it is low enough to matter.
 */
export function hintFor({ error, cooldown, attemptsRemaining } = {}) {
  if (error) return error;
  if (cooldown > 0) return `You can ask for a new code in ${cooldown}s.`;
  if (typeof attemptsRemaining === 'number' && attemptsRemaining > 0 && attemptsRemaining <= 3) {
    return `${attemptsRemaining} ${attemptsRemaining === 1 ? 'try' : 'tries'} left.`;
  }
  return '';
}

export default {
  IDLE,
  SENT,
  VERIFIED,
  CODE_LENGTH,
  messageFor,
  isCompleteCode,
  canPay,
  cooldownRemaining,
  canResend,
  hintFor,
};
