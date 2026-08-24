import { useEffect, useState } from "react";

/**
 * Live countdown for login lockouts.
 *
 * Usage in a component:
 *   const { remaining, start, isLocked } = useLockoutTimer();
 *   ...
 *   if (err.status === 429) start(err.retryAfter);
 *   ...
 *   {isLocked && <div>Try again in {formatWait(remaining)}</div>}
 *
 * Internally schedules a 1-second tick. Cleans up on unmount.
 */
export function useLockoutTimer() {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return undefined;
    const id = setInterval(() => {
      setRemaining((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining > 0]);

  /**
   * Begin (or extend) the countdown.
   * `seconds` may be 0/undefined when the backend gives no Retry-After;
   * we then default to 600 (10 minutes) which matches the login throttle.
   */
  const start = (seconds) => {
    const s = Number(seconds);
    setRemaining(Number.isFinite(s) && s > 0 ? Math.ceil(s) : 600);
  };

  const reset = () => setRemaining(0);

  return { remaining, start, reset, isLocked: remaining > 0 };
}
