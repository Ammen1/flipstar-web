// The campaign surfaces' stylesheet, injected once.
//
// Layout and motion live here rather than in inline styles because they are
// the parts that need media queries and `prefers-reduced-motion`, and neither
// is expressible inline. Theme COLOURS stay inline, because they come from
// the user's chosen theme at runtime.
//
// The previous page decided its breakpoint in JavaScript -- a `resize`
// listener setting `isMobile`, re-rendering the whole list on every drag of a
// window edge, and rendering the desktop layout for one frame on a phone
// before the first measurement. The grid below does the same job in CSS, so
// there is nothing to measure and nothing to get wrong on first paint.

const STYLE_ID = 'flipstar-campaigns-v3';

export const CSS = `
  /* ── grid ──────────────────────────────────────────────────────────────
     One column on a phone, two on a tablet, three or four on a desktop.
     auto-fill with minmax(0,1fr) rather than fixed widths: minmax's 0 floor
     is what stops a long unbroken title from widening a track and pushing
     the row off-screen. */
  .camp-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  @media (min-width: 640px) {
    .camp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  }
  @media (min-width: 1024px) {
    .camp-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (min-width: 1440px) {
    .camp-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }

  /* ── card ──────────────────────────────────────────────────────────── */
  .camp-card {
    display: flex;
    flex-direction: column;
    text-align: left;
    width: 100%;
    min-width: 0;
    padding: 0;
    font: inherit;
    cursor: pointer;
    overflow: hidden;
    box-sizing: border-box;
    animation: camp-fade-up 0.4s ease-out backwards;
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                box-shadow 0.28s ease,
                border-color 0.28s ease;
  }
  @media (hover: hover) {
    .camp-card:hover { transform: translateY(-4px); }
    .camp-card:hover .camp-card-img { transform: scale(1.06); }
    .camp-card:hover .camp-cta { filter: brightness(1.06); }
  }
  /* Touch devices get a press state instead of a hover that would stick. */
  .camp-card:active { transform: translateY(0) scale(0.995); }

  .camp-card:focus-visible {
    outline: 3px solid currentColor;
    outline-offset: 3px;
  }

  .camp-card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* 16:10 keeps every card's image the same shape whatever the source is,
     so a row of cards lines up. object-fit above crops rather than
     distorts. */
  .camp-card-media {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    flex-shrink: 0;
  }
  @supports not (aspect-ratio: 1) {
    .camp-card-media { height: 180px; }
  }

  /* Pushes the CTA to the bottom so cards in a row end level even when their
     descriptions differ in length. */
  .camp-card-body { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
  .camp-card-spacer { flex: 1 1 auto; }

  .camp-cta { transition: filter 0.2s ease, transform 0.12s ease; }
  .camp-cta:active { transform: scale(0.98); }

  /* ── filters ───────────────────────────────────────────────────────────
     Scrolls sideways on a narrow screen without the page doing so. The
     negative margin lets the row bleed to the screen edge while its items
     keep the page's gutter, so the last pill does not look cut off. */
  .camp-filters {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x proximity;
    padding: 2px 16px 6px;
    margin: 0 -16px;
  }
  .camp-filters::-webkit-scrollbar { display: none; }
  .camp-filter { flex: 0 0 auto; scroll-snap-align: start; transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease; }
  .camp-filter:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }

  /* ── skeleton ──────────────────────────────────────────────────────── */
  .camp-shimmer {
    background-size: 800px 100%;
    animation: camp-shimmer 1.6s linear infinite;
  }

  @keyframes camp-shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }
  @keyframes camp-fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes camp-pulse {
    0%, 100% { opacity: 0.75; transform: scale(1); }
    50%      { opacity: 1;    transform: scale(1.04); }
  }

  /* Motion is decoration here -- nothing in this page depends on it to be
     understood, so it all goes when the system asks for less. */
  @media (prefers-reduced-motion: reduce) {
    .camp-card,
    .camp-card-img,
    .camp-cta,
    .camp-filter,
    .camp-shimmer,
    .camp-hero-orb {
      animation: none !important;
      transition: none !important;
    }
    .camp-card:hover { transform: none; }
    .camp-card:hover .camp-card-img { transform: none; }
  }
`;

/** Add the stylesheet to the document once, whichever surface mounts first. */
export function ensureCampaignStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export default ensureCampaignStyles;
