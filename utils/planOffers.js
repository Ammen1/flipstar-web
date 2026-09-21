// Which subscription plans a visitor may be offered.
//
// On-demand is a top-up on an account that already exists: it has no duration
// and grants nothing on its own. Offered as somebody's *first* subscription it
// takes their money and leaves them with no service, so it is kept out of the
// list until there is an account to top up. The same page is what the telebirr
// SuperApp shows, where a first-time visitor is never authenticated, so this
// one rule covers both.
//
// The API applies it too (api/views/subscription.py) and that is the one that
// counts -- this is the client's own guard, and it also covers the cached and
// offline paths, where no API answer is involved.
//
// It lives in a module of its own because the previous version of this rule
// was written inline as `tier.name !== 'OnDemand'`, while the tier that
// `manage.py seed_subscription_tiers` creates is called 'OnDemand Premium'.
// The filter ran on every load and removed nothing, and nothing said so. The
// rule now keys on what the plan *is*.

/** A plan bought on top of a subscription rather than as one. */
export const ON_DEMAND = "ondemand";

/**
 * May this plan be offered to this visitor?
 *
 * @param tier  a plan from /subscriptions/tiers/active/, or the offline list
 * @param user  the signed-in account, or null/undefined for a visitor
 * @param options  channel-specific offer rules
 */
export function isOfferable(tier, user, { excludeOnDemand = false } = {}) {
  if (!tier) return false;
  if (excludeOnDemand) {
    return String(tier.duration_type || "").toLowerCase() !== ON_DEMAND;
  }
  if (user) return true;
  return String(tier.duration_type || "").toLowerCase() !== ON_DEMAND;
}

/** The plans to show, in the order they arrived. */
export function offerablePlans(tiers, user, options) {
  if (!Array.isArray(tiers)) return [];
  return tiers.filter((tier) => isOfferable(tier, user, options));
}
