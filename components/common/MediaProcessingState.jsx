import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { failureText, mediaStatus } from '../../utils/media';

/**
 * What the author sees where a post's media will be, while it is not ready:
 * a spinner while it is PROCESSING, the reason when it FAILED. Renders
 * nothing for a READY post, so callers can place it unconditionally.
 *
 * The original upload is never shown in its place -- it is not served, and
 * an unprocessed phone video can be tens of megabytes with the wrong
 * orientation. `compact` is for grid tiles; the full version for the post
 * page. Fills its (positioned) parent.
 */
export function MediaProcessingState({ post, compact = false }) {
  const status = mediaStatus(post);
  if (status === 'READY') return null;

  const failed = status === 'FAILED';
  const iconSize = compact ? 20 : 36;

  return (
    <div
      role="status"
      aria-live="polite"
      data-media-status={status}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 6 : 12,
        padding: compact ? 8 : 24,
        textAlign: 'center',
        color: '#fff',
        background: failed
          ? 'linear-gradient(160deg, #2b1515 0%, #120909 100%)'
          : 'linear-gradient(160deg, #1d2711 0%, #0b0f07 100%)',
      }}
    >
      <style>{'@keyframes fs-media-spin{to{transform:rotate(360deg)}}'}</style>
      {failed ? (
        <TriangleAlert size={iconSize} color="#f87171" aria-hidden="true" />
      ) : (
        <LoaderCircle
          size={iconSize}
          color="#a3e635"
          aria-hidden="true"
          style={{ animation: 'fs-media-spin 1s linear infinite' }}
        />
      )}
      <div style={{ fontSize: compact ? 11 : 17, fontWeight: 700, lineHeight: 1.3 }}>
        {failed
          ? compact ? "Couldn't process" : "We couldn't process this media."
          : compact ? 'Preparing…' : 'Preparing your post…'}
      </div>
      {!compact && (
        <div style={{ fontSize: 13, opacity: 0.8, maxWidth: 320, lineHeight: 1.5 }}>
          {failed
            ? failureText(post)
            : "We're optimizing your media for faster playback. It will appear in the feed as soon as it's ready."}
        </div>
      )}
    </div>
  );
}
