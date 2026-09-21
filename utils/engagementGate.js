// Who may like, share, comment and send gifts.
//
// One rule: these need an active subscription. Not being signed in is simply
// one way of not having one, which is why there is no separate login check --
// sending somebody to a login form first answered a question they had not
// asked, and told them nothing about why the button did not work. They go to
// the plans instead, and signing in is part of subscribing.
//
// Before this, the four buttons each decided for themselves and no two agreed:
// Like opened the login modal when signed out, Comment and Gift opened it as
// well but then never checked the subscription at all, and Share checked the
// subscription but not the login. A signed-out visitor tapping Like got a
// login form; tapping Share got the plans; tapping Gift got a gift dialog
// they could not use.
//
// This says nothing about Save, Follow or Notifications. Those are personal to
// an account rather than paid features, so they still ask for a login.

/** May this viewer use the paid engagement actions? */
export function canEngage(subscriptionStatus) {
  return Boolean(subscriptionStatus?.has_subscription);
}

/**
 * Run `action` if the viewer may engage, otherwise send them to the plans.
 *
 * Returns true when the action ran, so a caller with its own follow-up work
 * (an optimistic animation, say) can tell whether it should happen.
 *
 * @param subscriptionStatus  what /subscription/status/ last answered
 * @param onShowSubscription  opens the subscription page
 * @param action              what the button does when it is allowed
 */
export function withSubscription(
  subscriptionStatus,
  onShowSubscription,
  action,
) {
  // A missing status means the authoritative check has not answered yet (or
  // failed). Do not turn that temporary uncertainty into a second purchase.
  if (subscriptionStatus == null) return false;
  if (!canEngage(subscriptionStatus)) {
    onShowSubscription?.();
    return false;
  }
  action?.();
  return true;
}
