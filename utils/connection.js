/**
 * What the network can afford, as a hint.
 *
 * navigator.connection is a hint and nothing more: it is absent on Safari and
 * every iOS browser, it reports the radio rather than actual throughput, and
 * it lags a change by seconds. So every consumer here degrades to sensible
 * behaviour when it says nothing, and nothing is ever gated on it -- content
 * must display whatever the connection reports.
 *
 * The bias is deliberately conservative. This feed's users are on Ethiopian
 * mobile data, where guessing "fast" costs someone real money and a blank
 * screen, while guessing "slow" costs a developer on Wi-Fi a slightly later
 * quality upgrade. Those are not comparable, so unknown means careful.
 */

/** @returns {'slow'|'normal'|'fast'} */
export function connectionTier() {
  if (typeof navigator === 'undefined') return 'normal';

  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  // No API: assume normal rather than fast. Safari has no support at all, and
  // treating every iPhone as a fast connection is exactly the wrong default
  // for this audience.
  if (!c) return 'normal';

  // The user has asked the OS to reduce data use. That is an explicit
  // instruction, not a measurement, so it outranks everything else.
  if (c.saveData) return 'slow';

  const type = c.effectiveType;
  if (type === 'slow-2g' || type === '2g') return 'slow';
  if (type === '3g') return 'slow';
  if (type === '4g') {
    // 4g covers everything from a weak signal to fibre. downlink is a rough
    // Mbps estimate; below ~2 it behaves like 3G in practice.
    if (typeof c.downlink === 'number' && c.downlink < 2) return 'slow';
    return 'fast';
  }

  return 'normal';
}

/**
 * The `preload` value for a video, given how far it is from the active item.
 *
 *   0  the video playing now
 *   1  the next one up
 *   2+ further away
 *
 * 'metadata' fetches headers and the first moments; 'none' fetches nothing at
 * all. Neither downloads the file, which is what `preload="auto"` would do --
 * on a feed of twenty posts that is twenty concurrent full downloads.
 */
export function videoPreload(distance, tier = connectionTier()) {
  if (distance === 0) return 'metadata';

  if (tier === 'slow') return 'none';
  if (tier === 'fast') return distance <= 2 ? 'metadata' : 'none';
  return distance === 1 ? 'metadata' : 'none';
}

/**
 * Whether to fetch the full-quality image, or stop at the thumbnail.
 *
 * On a slow connection the thumbnail is the whole story: a readable image now
 * beats a sharp one after eight seconds, and the upgrade can wait until the
 * reader stops on the post.
 */
export function shouldLoadFullImage(isActive, tier = connectionTier()) {
  if (tier === 'slow') return isActive;
  return true;
}

/**
 * Pick a video URL for the current connection.
 *
 * The backend now encodes three rungs and advertises the small ones in
 * `media_variants`, keyed by height:
 *
 *   { "360": "https://…_360p.mp4", "480": "https://…_480p.mp4" }
 *
 * `media` stays the primary 720p file and is never removed, so this is a
 * preference and never a requirement -- a post encoded before the ladders
 * existed, or one whose smaller rungs failed to encode, falls through to it
 * and behaves exactly as it does today.
 *
 * Choosing down rather than up
 * ----------------------------
 * 'normal' takes 480p, not 720p. The tier is a hint from an API that lies by
 * omission on every iPhone, so the cost of guessing wrong has to be weighed:
 * guessing low serves a slightly softer video to someone on Wi-Fi, guessing
 * high stalls someone paying by the megabyte. Only an explicit, measured 4g
 * with usable downlink gets the full file.
 */
export function pickVideoSource(post, tier = connectionTier()) {
  const primary = post?.media || '';
  const variants = post?.media_variants;

  if (!variants || !primary) return primary;

  if (tier === 'slow') return variants['360'] || variants['480'] || primary;
  if (tier === 'fast') return primary;
  return variants['480'] || variants['360'] || primary;
}

/**
 * Pick an image URL for the current connection.
 *
 * `image_variants` is keyed by WIDTH rather than height -- these are stills in
 * a phone-width column, where the width is what determines whether the file is
 * wasted. 360 matches a typical feed column at 1x; 720 covers it at 2x, which
 * is most phones.
 *
 * The same fall-through applies: no variants means the original, which is what
 * every post served before this existed.
 */
export function pickImageSource(post, tier = connectionTier()) {
  const primary = post?.image || '';
  const key = imageKey(post, tier);
  return key === 'full' ? primary : post.image_variants[key];
}

/**
 * The WebP twin of whatever pickImageSource chose, or '' when there is none.
 *
 * Meant for a <picture> <source type="image/webp">, with pickImageSource as
 * the <img> fallback: the browser takes the WebP only if it can decode it,
 * and nothing is downloaded twice. `image_webp_variants` carries "360", "720"
 * and "full"; the backend leaves a size out when its WebP would not have been
 * smaller than the JPEG, and posts processed before WebP have none at all --
 * either way the <img> is what loads.
 */
export function pickImageWebp(post, tier = connectionTier()) {
  if (!post?.image) return '';
  return post.image_webp_variants?.[imageKey(post, tier)] || '';
}

// Which rendition to show: "360", "720" (keys of image_variants) or "full".
function imageKey(post, tier) {
  const variants = post?.image_variants;
  if (!variants || !post?.image) return 'full';

  const order = tier === 'slow' ? ['360', '720'] : tier === 'fast' ? ['720'] : ['720', '360'];
  return order.find((k) => variants[k]) || 'full';
}
