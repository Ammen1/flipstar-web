// What a payment's state is, on the client, in the server's own words.
//
// The reported fault: a payment that failed -- no balance, wrong PIN,
// cancelled, refused, timed out -- could end with a green tick and "Payment
// successful". Not one bug; four places each deciding for themselves whether
// a payment had worked:
//
//   * TelebirrH5Service returned `{success: true, pending: true}` when the
//     server said the payment had FAILED, and again when the status request
//     itself threw -- and every page treats `success` as success;
//   * BuyCoinsPage never asked about the payment at all. It polled the wallet
//     and called any increase a successful purchase, so coins arriving from
//     anywhere else during the wait were reported as the purchase completing;
//   * the result sheet had two outcomes, ok and not-ok, so a payment still
//     being confirmed had nowhere to go but "Payment successful";
//   * SubscriptionPage opened its success modal on `success`, which included
//     pending and failed.
//
// So the client stops deciding. `state` comes from the server
// (api/services/payment_status.py) and this module only reads it.
//
// Nothing here grants anything. Coins and access are moved by the backend on
// a confirmed payment; what this decides is which of three things a person is
// told.

export const SUCCESS = 'SUCCESS';
export const FAILED = 'FAILED';
export const PENDING = 'PENDING';
export const CANCELLED = 'CANCELLED';

export const STATES = [SUCCESS, FAILED, PENDING, CANCELLED];

/** States that will not change again. */
const TERMINAL = [SUCCESS, FAILED, CANCELLED];

/**
 * The state in a payment-status response.
 *
 * An unreadable answer is PENDING, never SUCCESS: a request that failed, a
 * body in a shape this code does not know, or a state it has never heard of
 * all mean "we do not know yet", and "we do not know yet" must never be shown
 * as money having changed hands. It is also not FAILED -- telling somebody
 * their payment failed when it may yet succeed is the same bug pointing the
 * other way.
 */
export function readState(payload) {
  const raw = payload && payload.state;
  if (typeof raw !== 'string') return PENDING;
  const state = raw.trim().toUpperCase();
  return STATES.indexOf(state) === -1 ? PENDING : state;
}

/** Whether polling can stop: the server will not change its mind. */
export function isFinal(state) {
  return TERMINAL.indexOf(state) !== -1;
}

/** Whether a success screen may be shown. The only state that grants one. */
export function isSuccess(state) {
  return state === SUCCESS;
}

// What each outcome is called on screen. Separate from the message: the
// heading says what happened, the message says what to do about it.
const HEADINGS = {
  [SUCCESS]: 'Payment successful',
  [FAILED]: 'Payment not completed',
  [CANCELLED]: 'Payment cancelled',
  [PENDING]: 'Confirming your payment',
};

// Used only when the server sent no message of its own. The server's copy is
// preferred because it knows the reason; this is the floor, not the default.
const MESSAGES = {
  [SUCCESS]: 'Your payment went through.',
  [FAILED]: 'The payment was not completed. You have not been charged.',
  [CANCELLED]: 'The payment was cancelled, so nothing was charged.',
  [PENDING]:
    'We are still waiting for telebirr to confirm this payment. '
    + 'Nothing has been added yet -- this page will update on its own.',
};

/**
 * What to put on screen for a payment-status response.
 *
 * `tone` is what the sheet draws: 'success', 'failure' or 'pending'. Pending
 * is its own tone rather than being folded into one of the other two, which
 * is the whole point -- it was folded into success, and that is what put
 * "Payment successful" in front of people whose payment had not happened.
 */
export function describePayment(payload) {
  const state = readState(payload);
  const tone = state === SUCCESS ? 'success' : state === PENDING ? 'pending' : 'failure';
  const message = (payload && typeof payload.message === 'string' && payload.message.trim())
    ? payload.message.trim()
    : MESSAGES[state];

  return {
    state,
    tone,
    final: isFinal(state),
    heading: HEADINGS[state],
    message,
    reason: (payload && payload.reason) || null,
  };
}

export default { SUCCESS, FAILED, PENDING, CANCELLED, STATES, readState, isFinal, isSuccess, describePayment };
