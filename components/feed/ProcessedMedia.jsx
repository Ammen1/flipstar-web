import { useEffect, useMemo, useRef } from 'react';
import config from '../../config';
import { connectionTier, pickImageSource, pickImageWebp, pickVideoSource } from '../../utils/connection';
import { pauseOtherVideos } from '../../utils/media';
import { useFreshMedia, useSteadySrc } from '../../hooks/useFreshMedia';
import { sameRendition } from '../../utils/mediaRecovery';

/**
 * Processed post media for the pages outside the main feeds (campaign feed
 * and entries), loaded the way the feeds load it.
 */

const MEDIA_ROOT = config.API_BASE_URL.replace('/api', '');
const absolute = (url) => (!url ? '' : url.startsWith('http') ? url : `${MEDIA_ROOT}${url}`);

/**
 * A post's still: the width variant for the connection, as WebP inside a
 * <picture> with the JPEG as the <img> fallback -- the browser takes the WebP
 * only if it can decode it, and downloads one or the other, never both.
 * Posts without variants show `image` exactly as before.
 */
export function ProcessedImage({ post, alt = '', style, className, ...rest }) {
  const { post: live, onMediaError, unavailable } = useFreshMedia(post, 'campaign');
  const tier = connectionTier();
  const jpg = absolute(pickImageSource(live, tier));
  const webp = absolute(pickImageWebp(live, tier));
  if (!jpg) return null;
  if (unavailable) return <Unavailable what="Photo" className={className} style={style} />;
  return (
    <picture style={{ display: 'contents' }}>
      {webp && <source srcSet={webp} type="image/webp" />}
      <img src={jpg} alt={alt} loading="lazy" decoding="async" className={className} style={style} onError={onMediaError} {...rest} />
    </picture>
  );
}

function Unavailable({ what, className, style }) {
  return (
    <div
      data-media-unavailable
      role="status"
      className={className}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 160,
        background: '#111',
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
      }}
    >
      {what} unavailable
    </div>
  );
}

/**
 * A post's video for pages where the viewer presses play -- the campaign
 * feed and entry cards -- built the way the main feed loads video:
 *
 *   thumbnail first   the generated thumbnail is the poster and nothing of the
 *                     video is fetched until play is pressed (preload="none")
 *   the right rung    360p / 480p / 720p for the connection (utils/connection.js),
 *                     falling back to `media` for posts without smaller rungs;
 *                     never the original upload, which the API does not serve
 *   one at a time     playing one pauses every other video on the page, and a
 *                     video scrolled out of view stops
 *
 * The rung is chosen once per mount, so a connection change never swaps the
 * file under a video that is playing.
 */
export function ProcessedVideo({ post, style, className, ...rest }) {
  const ref = useRef(null);
  // A URL that stops working (a signature run out, a file since replaced)
  // is reported and swapped for a current one (hooks/useFreshMedia.js).
  const { post: live, onMediaError, unavailable } = useFreshMedia(post, 'campaign');
  // The rung is chosen once per post; a refresh brings the same rung under a
  // new URL (sameRendition), and a playing clip keeps its file (useSteadySrc).
  const first = useMemo(() => pickVideoSource(post, connectionTier()), [post?.id]);
  const src = useSteadySrc(ref, absolute(sameRendition(live, first) || pickVideoSource(live, connectionTier())));
  const poster = live?.thumbnail ? absolute(live.thumbnail) : undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !el.paused) {
          try { el.pause(); } catch { /* detached */ }
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!src) return null;
  if (unavailable) return <Unavailable what="Video" className={className} style={style} />;
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      // With a poster there is nothing to show from the file until it is
      // played; without one, the first frame is the preview.
      preload={poster ? 'none' : 'metadata'}
      controls
      playsInline
      onError={onMediaError}
      onPlay={(e) => pauseOtherVideos(e.currentTarget)}
      className={className}
      style={style}
      {...rest}
    />
  );
}
