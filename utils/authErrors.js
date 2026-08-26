// Helpers for translating auth-endpoint errors into user-facing messages.
// Used by login screens so backend rate-limit (HTTP 429) lockouts are
// presented clearly with the remaining wait time.

/**
 * Format a "minutes / seconds" wait time string in English.
 *  formatWait(587) -> "9 minutes 47 seconds"
 *  formatWait(45)  -> "45 seconds"
 */
export function formatWait(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (s <= 0) return "a few moments";
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins === 0) return `${secs} second${secs === 1 ? "" : "s"}`;
  if (secs === 0) return `${mins} minute${mins === 1 ? "" : "s"}`;
  return `${mins} minute${mins === 1 ? "" : "s"} ${secs} second${secs === 1 ? "" : "s"}`;
}

/**
 * Translate an auth API error (from api.js) into a user-facing message.
 * Returns a string. Falls back to the supplied default when no special
 * handling applies.
 */
export function describeAuthError(err, defaultMessage = "Login failed. Please try again.") {
  if (!err) return defaultMessage;

  // 429 — too many login attempts.
  if (err.status === 429) {
    const wait = err.retryAfter && err.retryAfter > 0
      ? formatWait(err.retryAfter)
      : "10 minutes";
    return `Too many login attempts. Your account is temporarily locked. Please try again in ${wait}.`;
  }

  // 401 — bad credentials (also catches our backend's "Invalid credentials").
  if (err.status === 401) {
    return "Invalid credentials. Please try again.";
  }

  // Server-side errors should not leak details.
  if (err.status >= 500) {
    return "We're having trouble reaching the server. Please try again shortly.";
  }

  // Try to surface a sensible field from the parsed body.
  const data = err.data || {};
  if (typeof data.error === "string") return data.error;
  if (typeof data.detail === "string") {
    // Never show raw DRF throttle/technical messages to the user.
    if (data.detail.includes("throttl")) {
      return "Too many requests. Please wait a moment and try again.";
    }
    return data.detail;
  }

  // Also check if the error message itself contains throttle info (from JSON.stringify).
  const msg = err.message || '';
  if (msg.includes("throttl")) {
    return "Too many requests. Please wait a moment and try again.";
  }

  return defaultMessage;
}

/**
 * Extract a clean, human-readable error message from any API error.
 * Handles api.js errors (e.data / e.message), axios-style errors
 * (e.response.data), and JSON-stringified error messages.
 */
export function extractErrorMessage(err, defaultMessage = 'Something went wrong. Please try again.') {
  if (!err) return defaultMessage;

  // api.js errors: e.data has the parsed body
  const data = err.data || err.response?.data || {};

  // Check data.error
  if (typeof data.error === 'string' && data.error) return data.error;
  // Check data.detail
  if (typeof data.detail === 'string' && data.detail) {
    if (data.detail.includes('throttl')) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    return data.detail;
  }

  // Check e.message — it might be JSON.stringify({error: "..."}) from api.js
  const raw = err.message || '';
  if (raw) {
    try {
      const parsed = raw.startsWith('{') ? JSON.parse(raw) : raw;
      if (typeof parsed === 'object') {
        if (parsed.error) return parsed.error;
        if (parsed.detail) return parsed.detail;
      }
      if (typeof parsed === 'string' && parsed) {
        if (parsed.includes('throttl')) {
          return 'Too many requests. Please wait a moment and try again.';
        }
        return parsed;
      }
    } catch (_) { /* not JSON — use as-is */ }
    if (raw.includes('throttl')) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    return raw;
  }

  return defaultMessage;
}
