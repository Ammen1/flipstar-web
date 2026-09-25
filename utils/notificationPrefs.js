// Which notification switches exist, and how to read a stored set of them.
//
// These switches were decoration until recently: the backend wrote every
// Notification row and pushed every one of them regardless of what the user
// had turned off. The gate is now real (api/services/notifications.py), which
// makes two things matter on this side.
//
// First, a switch the UI does not render cannot be changed, so the list below
// is the whole set and is meant to stay in step with PREFERENCE_FIELD on the
// server.
//
// Second, a preference set stored before a switch existed has no key for it.
// Read naively that is `undefined`, which renders as off -- telling the user
// they muted something they never touched, and worse, sending that `false`
// back to the server on the next save. mergeNotificationPrefs is what stops
// that, and it is why this is a module with tests rather than a spread
// operator inline in the page.

export const DEFAULT_NOTIFICATION_PREFS = {
  push_notifications: true,
  likes: true,
  comments: true,
  follows: true,
  messages: true,
  mentions: true,
  gifts: true,
  system: true,
};

// Render order. `master` marks the switch that silences everything else --
// shown first, because a user who turns it off should not have to wonder
// what the switches under it still do.
export const NOTIFICATION_SWITCHES = [
  { key: 'push_notifications', label: 'Push notifications', master: true },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'follows', label: 'Follows' },
  { key: 'messages', label: 'Messages' },
  { key: 'mentions', label: 'Mentions' },
  { key: 'gifts', label: 'Gifts' },
  { key: 'system', label: 'Subscription & prizes' },
];

/**
 * One preference set from any number of partial ones, defaults underneath.
 *
 * Later sources win, so `mergeNotificationPrefs(stored, fromServer)` lets the
 * server correct a stale local copy. A `null`/`undefined` source is skipped,
 * and a key whose value is `undefined` does not overwrite what came before --
 * an absent switch falls through to the default rather than reading as off.
 */
export function mergeNotificationPrefs(...sources) {
  const merged = { ...DEFAULT_NOTIFICATION_PREFS };

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS)) {
      const value = source[key];
      if (value === undefined || value === null) continue;
      merged[key] = Boolean(value);
    }
  }

  return merged;
}

/**
 * Parse a JSON preference set from storage. Never throws.
 *
 * localStorage can hold anything -- a half-written value, something from an
 * older release, a string a user pasted in. A settings page that throws on
 * read is a settings page nobody can open to fix it.
 */
export function readStoredPrefs(raw) {
  if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
  try {
    return mergeNotificationPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

/**
 * Whether a push of `type` would reach a user holding these preferences.
 *
 * A local mirror of the server's gate, used only to describe what a switch
 * does -- never to decide whether to send anything, which is the server's
 * call alone. `moderation` has no switch on purpose: a user cannot opt out
 * of being told their own content was actioned.
 */
export const PREFERENCE_FIELD = {
  like: 'likes',
  comment: 'comments',
  follow: 'follows',
  mention: 'mentions',
  gift: 'gifts',
  moderation: null,
  subscription_activated: 'system',
  subscription_renewed: 'system',
  subscription_expired: 'system',
  prize_won: 'system',
  prize_delivered: 'system',
  withdrawal_paid: 'system',
};

export function pushAllowed(prefs, type) {
  const merged = mergeNotificationPrefs(prefs);
  if (!merged.push_notifications) return false;

  const field = PREFERENCE_FIELD[type];
  if (field === null) return true;
  if (field === undefined) return true;
  return Boolean(merged[field]);
}
