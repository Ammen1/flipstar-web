/**
 * Reading a refusal so the UI can tell "you're short on coins" apart from
 * "you're not signed in".
 *
 * These arrive in several shapes across the app -- `api.request` throws an
 * Error carrying `.status` and `.data`, `api.createPost` rejects with the
 * parsed body itself, and some callers pass a plain response object. Matching
 * on error prose (`error.includes('Insufficient')`) was how this used to be
 * done; it breaks the moment a message is reworded and it cannot see the
 * amounts at all.
 *
 * The server now sends a stable `code` (see api/services/coin_purchase.py),
 * so that is what is checked first; the older shapes stay as a fallback for
 * endpoints that have not been migrated.
 */

export const INSUFFICIENT = 'insufficient';
export const AUTH = 'auth';

function bodyOf(err) {
  if (!err || typeof err !== 'object') return {};
  // Error thrown by api.request, a raw rejected body, or an axios-ish shape.
  return err.data || (err.response && err.response.data) || err;
}

function statusOf(err) {
  if (!err || typeof err !== 'object') return null;
  return err.status
    || err.statusCode
    || (err.response && err.response.status)
    || null;
}

/**
 * Classify a failed request.
 *
 * Returns `{ kind, requiredCoins, currentCoins, message }`, where `kind` is
 * INSUFFICIENT, AUTH, or null when this is some other failure the caller
 * should handle normally.
 */
export function readCoinError(err) {
  const body = bodyOf(err);
  const status = statusOf(err);
  const code = body.code;
  const message = body.error || body.detail || body.message || '';

  if (code === 'AUTH_REQUIRED' || status === 401) {
    return { kind: AUTH, requiredCoins: 0, currentCoins: null, message };
  }

  if (code === 'INSUFFICIENT_COINS') {
    return {
      kind: INSUFFICIENT,
      // Server-computed. Never substitute a client guess here: these numbers
      // are what the popup shows as the cost and the shortfall.
      requiredCoins: Number(body.required_coins || 0),
      currentCoins: body.current_coins == null ? null : Number(body.current_coins),
      message,
    };
  }

  // Endpoints not yet on the shared payload: they still send required_coins
  // or needs_recharge alongside a 400.
  if (body.required_coins != null || body.needs_recharge) {
    return {
      kind: INSUFFICIENT,
      requiredCoins: Number(body.required_coins || 0),
      currentCoins: body.current_coins == null
        ? (body.current_purchased_coins == null ? null : Number(body.current_purchased_coins))
        : Number(body.current_coins),
      message,
    };
  }

  return { kind: null, requiredCoins: 0, currentCoins: null, message };
}

/** Convenience for `if (isInsufficientCoins(err))` call sites. */
export function isInsufficientCoins(err) {
  return readCoinError(err).kind === INSUFFICIENT;
}

export function isAuthRequired(err) {
  return readCoinError(err).kind === AUTH;
}
