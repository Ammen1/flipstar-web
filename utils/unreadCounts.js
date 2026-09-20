// Reading an unread count off the wire, and turning it into a badge.
//
// The Messages badge was `useState(0)` with no setter: a count the client
// could never change, so a new message arrived, the server knew about it, and
// the nav showed nothing. The fix is to ask the server -- which means the two
// small decisions that sit either side of that request are worth pinning:
// what a malformed or missing answer counts as, and what a count looks like
// once it reaches the nav.
//
// Both counts are the server's. Nothing here adds, decrements or remembers --
// a badge that kept its own tally would drift from the read markers the
// moment a message was read on another device.

/**
 * The count inside an unread-count response.
 *
 * Deliberately forgiving about the envelope and strict about the number: a
 * request that failed, or came back as something unexpected, means "no news"
 * rather than a badge showing NaN over the Messages tab. A negative or
 * fractional count is not a number of messages, so it is not shown as one.
 */
export function readUnreadCount(payload) {
  const raw = payload?.unread_count;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * What the badge shows, or '' for nothing at all.
 *
 * The cap is the existing nav's: the bubble is a fixed ~16px circle, and a
 * four-digit count would stretch it across the icon.
 */
export function badgeLabel(count) {
  const n = readUnreadCount({ unread_count: count });
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

export default { readUnreadCount, badgeLabel };
