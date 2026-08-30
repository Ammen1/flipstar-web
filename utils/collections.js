/**
 * Small list helpers shared by the feeds.
 */

/**
 * Drop repeats by `id`, keeping the first occurrence and the original order.
 *
 * Feed pagination appends each new page onto the list already on screen. The
 * server does not guarantee disjoint pages — and both feeds shuffle each batch
 * client-side, so an offset can easily return items already held. Without this
 * the same reel appears several times, and duplicate ids then break anything
 * keyed by id (React reconciliation, the viewer's video-element bookkeeping),
 * which is how repeated clips turned into overlapping audio.
 */
export function dedupeById(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const id = item && item.id;
    // Items without an id cannot be compared; keep them rather than drop them.
    if (id === undefined || id === null) { out.push(item); continue; }
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
