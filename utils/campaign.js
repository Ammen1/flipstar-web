/**
 * Campaign identity on a post.
 *
 * Why this exists
 * ---------------
 * The API does not send a nested `campaign` object on a reel. ReelSerializer
 * (api/serializers/core.py) exposes three flat fields instead:
 *
 *     is_campaign_post   boolean
 *     campaign_id        the id, via PrimaryKeyRelatedField
 *     campaign_title     the title, via source='campaign.title'
 *
 * So `post.campaign` is undefined *by contract*, not by failure -- there is no
 * such key and there never was. Any check written as `post.campaign?.id`
 * therefore reports "not a campaign post" for every campaign entry in the
 * feed, and any badge gated on it never renders.
 *
 * Both shapes are accepted here rather than one being declared correct: other
 * endpoints (campaign entry lists, joined-campaign responses) really do nest a
 * campaign object, and a component fed from either should not care which it
 * received.
 *
 * Read campaign identity through these helpers so that a payload difference
 * can never look like "not a campaign post".
 */

/** The first value that is actually present. '' and null/undefined are absent. */
function firstPresent(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    return value;
  }
  return null;
}

/**
 * The campaign id for a post, or null.
 *
 * Prefers the flat `campaign_id` the feed actually sends, falling back to a
 * nested object for payloads that carry one.
 */
export function getCampaignId(post) {
  if (!post) return null;
  return firstPresent(post.campaign_id, post.campaign?.id);
}

/**
 * Whether a post is a campaign entry.
 *
 * `is_campaign_post` is the backend's own answer and is trusted first; the id
 * is accepted as well so that a payload carrying only the link is still
 * recognised.
 */
export function isCampaignPost(post) {
  if (!post) return false;
  return Boolean(post.is_campaign_post || getCampaignId(post) || post.campaign);
}

/**
 * The campaign's title for display.
 *
 * `campaign_title` is what the feed sends. The fallback is deliberately a
 * label rather than an empty string: a campaign badge with no text reads as a
 * rendering bug.
 */
export function getCampaignTitle(post, fallback = 'Campaign Entry') {
  if (!post) return fallback;
  return firstPresent(post.campaign?.title, post.campaign_title, post.campaign_name) || fallback;
}
