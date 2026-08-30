/**
 * Engagement counts.
 *
 * The API is not consistent about these field names between endpoints: a reel
 * list may carry `comment_count` while another payload uses `comments_count`,
 * likes arrive as `votes` or `likes_count`, shares as `shares` or
 * `shares_count`. Components that picked one spelling silently rendered 0 —
 * which is invisible in the feed, since a zero count is deliberately blank.
 *
 * Read counts through these helpers so a naming difference can never look like
 * "no comments".
 */

function firstNum(...values) {
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function likeCountOf(post) {
  return firstNum(post?.votes, post?.likes_count, post?.like_count, post?.likes);
}

export function commentCountOf(post) {
  return firstNum(post?.comment_count, post?.comments_count, post?.commentCount);
}

export function shareCountOf(post) {
  return firstNum(post?.shares, post?.shares_count, post?.share_count);
}

/** `1234` -> `"1.2K"`, for the compact rails. */
export function formatCount(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1000000) {
    const k = v / 1000;
    return (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + 'K';
  }
  const m = v / 1000000;
  return (m >= 100 ? Math.round(m) : Math.round(m * 10) / 10) + 'M';
}
