/**
 * Whether a subscription is currently active.
 *
 * The bug this exists to fix
 * --------------------------
 * SubscriptionPage decided this in eight places with `status === 'active'`
 * alone. A subscription that ended yesterday still carries status 'active'
 * until something sweeps it, so the page showed "Active · Daily Premium" over
 * an end date already in the past.
 *
 * The backend was never wrong: UserSubscription.is_active already checks
 * `status == 'active' and (end_date is None or end_date > now)`, and the
 * status endpoint filters on `end_date__gt=timezone.now()`. Only the client
 * was reading half the condition.
 *
 * This mirrors the backend rule exactly rather than inventing a stricter one.
 * Two implementations of "active" that disagree is how a user ends up locked
 * out of something the server thinks they have paid for.
 *
 * Timezones
 * ---------
 * end_date arrives as an ISO-8601 string with an offset. `new Date(...)`
 * parses that to an absolute instant, and comparing two Date objects compares
 * instants -- so a user in Addis and a server in UTC agree on whether it has
 * expired. No string comparison, no local-time assumptions.
 */

/**
 * @param {object|null|undefined} subscription - the raw API object
 * @returns {boolean}
 */
export function isSubscriptionActive(subscription) {
  if (!subscription || subscription.status !== 'active') return false;

  const raw = subscription.end_date ?? subscription.endDate;

  // No end date means open-ended, which is what the backend's
  // `end_date is None` branch treats as active. Matching it here keeps the two
  // definitions from diverging.
  if (raw === null || raw === undefined || raw === '') return true;

  const end = new Date(raw);

  if (Number.isNaN(end.getTime())) {
    // Unparseable date. Falling back to the status alone is what the page did
    // before this function existed, so this is no worse -- and it is the safe
    // direction: refusing access to a paying customer over a malformed field
    // is a worse failure than briefly showing a stale badge.
    console.warn('[subscription] unparseable end_date, falling back to status:', raw);
    return true;
  }

  // Strictly greater: at the exact end instant the subscription has ended.
  return end.getTime() > Date.now();
}

/**
 * True when a subscription exists and has run out.
 *
 * Distinct from `!isSubscriptionActive(...)`, which is also true for someone
 * who never subscribed -- a screen offering to renew needs to tell those two
 * apart.
 */
export function isSubscriptionExpired(subscription) {
  if (!subscription) return false;
  return !isSubscriptionActive(subscription);
}
