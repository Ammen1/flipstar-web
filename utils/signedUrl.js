/**
 * Signed media URLs: when they stop working.
 *
 * Where the bucket is private (staging), every media URL the API returns is
 * presigned and works for S3_QUERYSTRING_EXPIRE seconds -- an hour by
 * default. Holding one longer, in a feed left open or a feed cache, gets a
 * 403 from OBS, which a <video> reports as MEDIA_ERR_SRC_NOT_SUPPORTED (4):
 * the post showed "Video unavailable". These read the expiry out of the URL
 * itself, so a caller can refresh before it runs out and never replays dead
 * URLs from a cache.
 */

const FORMS = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

function queryOf(url) {
  if (typeof url !== 'string' || !url.includes('?')) return null;
  try {
    const params = new URL(url, 'http://relative.invalid').searchParams;
    const out = {};
    params.forEach((value, key) => { out[key.toLowerCase()] = value; });
    return out;
  } catch {
    return null;
  }
}

/**
 * When a presigned URL stops working, in ms since the epoch -- or null when
 * it is not signed (public objects, local files), which never expire.
 *
 * SigV4 (what the backend's storage produces): X-Amz-Date is the issue time,
 * X-Amz-Expires the lifetime in seconds. The older V2 form, and OBS's own,
 * carry an absolute Expires in epoch seconds.
 */
export function signedUrlExpiry(url) {
  const q = queryOf(url);
  if (!q) return null;
  if (q['x-amz-date'] && q['x-amz-expires']) {
    const m = FORMS.exec(q['x-amz-date']);
    const lifetime = Number(q['x-amz-expires']);
    if (!m || !Number.isFinite(lifetime)) return null;
    const issued = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return issued + lifetime * 1000;
  }
  if (q.expires && (q.signature || q['x-amz-signature'])) {
    const at = Number(q.expires);
    return Number.isFinite(at) ? at * 1000 : null;
  }
  return null;
}

/** True when `url` is signed and stops working within `ms` of `now`. */
export function expiresWithin(url, ms, now = Date.now()) {
  const at = signedUrlExpiry(url);
  return at !== null && at - now <= ms;
}

/**
 * The soonest any media URL in `value` stops working -- a post, a formatted
 * feed item, a cached page of either -- or null when none is signed. Only
 * looks a few levels deep: media URLs sit on the post or one object below it.
 */
export function earliestExpiry(value, depth = 0) {
  if (typeof value === 'string') return signedUrlExpiry(value);
  if (!value || typeof value !== 'object' || depth > 4) return null;
  let soonest = null;
  const items = Array.isArray(value) ? value : Object.values(value);
  for (const item of items) {
    const at = earliestExpiry(item, depth + 1);
    if (at !== null && (soonest === null || at < soonest)) soonest = at;
  }
  return soonest;
}

/**
 * Whether cached feed data can still be shown: false once any media URL in
 * it stops working within `marginMs`. A cache stamped five minutes ago can
 * hold posts whose URLs were signed an hour ago -- pages appended to a feed
 * keep the signatures of the request that fetched them.
 */
export function cacheStillLoadable(data, marginMs = 5 * 60 * 1000, now = Date.now()) {
  const at = earliestExpiry(data);
  return at === null || at - now > marginMs;
}

/** The URL without its query string: the signature stays out of logs. */
export function withoutSignature(url) {
  return typeof url === 'string' ? url.split('?')[0] : '';
}
