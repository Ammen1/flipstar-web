import flipstarLogo from '../../assets/logoG.png';

/**
 * What fills a media frame while there is nothing to show yet.
 *
 * Replaces a bare 🎬 emoji that appeared in two places with two different
 * sizes and two different backgrounds. It read as a generic "video" glyph
 * rather than as this product loading, and it was duplicated rather than
 * shared -- so changing it meant finding every copy.
 *
 * This is the *loading* state only. The "Video unavailable" and "Image
 * unavailable" blocks are error states with their own wording and retry
 * behaviour, and are deliberately left alone: a branded mark where an error
 * belongs would tell somebody a broken post is still loading.
 *
 * Not interactive. No handler, no role, `pointer-events: none` -- the frame
 * underneath owns tapping, and a logo that swallowed taps would break
 * play/pause on the very posts that are slowest to load.
 */
export function MediaLoadingLogo({ background = 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)' }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <img
        src={flipstarLogo}
        alt=""
        style={{
          // Sized against the frame rather than in pixels, so one value works
          // from a 360px phone to a desktop column without a breakpoint. The
          // cap stops it dominating a large frame.
          width: '42%',
          maxWidth: 180,
          height: 'auto',
          opacity: 0.85,
          // The source is a 3508px asset; without this the browser resamples
          // it harshly when drawn at ~160px.
          imageRendering: 'auto',
          userSelect: 'none',
        }}
        draggable={false}
      />
    </div>
  );
}

export default MediaLoadingLogo;
