// What posting costs, as the server prices it.
//
//     image                        2 coins
//     video under 60 seconds       2 coins
//     video 60 seconds and over    100 coins
//
// Read from /wallet/config/ (`post_costs`), never written down here: the
// server charges from its own table (api/services/post_pricing.py), and a
// second copy of the numbers in the client is a copy that goes stale and
// shows somebody 2 coins before taking 100.
//
// This decides what to *show*. It decides nothing about what is charged, and
// the duration it reads is the browser's own measurement of the file the
// person is about to upload -- the server measures the file again with
// ffprobe and prices from that, so a wrong guess here costs an inaccurate
// label, never an inaccurate charge.

/** At and above this many seconds a video is priced as a long video. */
export const LONG_VIDEO_SECONDS = 60;

const EMPTY = { image: 0, video_short: 0, video_long: 0, long_video_seconds: LONG_VIDEO_SECONDS };

/**
 * The price list out of a /wallet/config/ response.
 *
 * A response that has not arrived, or one from a server too old to publish
 * the list, yields zeroes -- which shows no price rather than a wrong one.
 */
export function readPostCosts(config) {
  const costs = config && config.post_costs;
  if (!costs || typeof costs !== 'object') return { ...EMPTY };

  const number = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };

  return {
    image: number(costs.image),
    video_short: number(costs.video_short),
    video_long: number(costs.video_long),
    long_video_seconds: number(costs.long_video_seconds) || LONG_VIDEO_SECONDS,
  };
}

/**
 * What this post will cost.
 *
 * `durationSeconds` is only consulted for a video. An unknown duration is
 * priced as short, which is what the server will charge if it measures the
 * file short -- and if it measures it long, the server charges the
 * difference. Guessing high would tell somebody a 20-second clip costs 100.
 */
export function costFor({ isVideo, durationSeconds, costs }) {
  const price = costs && typeof costs === 'object' ? costs : EMPTY;
  if (!isVideo) return price.image || 0;

  const threshold = price.long_video_seconds || LONG_VIDEO_SECONDS;
  const seconds = Number(durationSeconds);
  const isLong = Number.isFinite(seconds) && seconds >= threshold;
  return (isLong ? price.video_long : price.video_short) || 0;
}

/**
 * The line shown above the post button, or '' when there is no price to show.
 */
export function costLabel(coins) {
  const n = Number(coins);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `Post cost: ${n} ${n === 1 ? 'coin' : 'coins'}`;
}

export default { LONG_VIDEO_SECONDS, readPostCosts, costFor, costLabel };
