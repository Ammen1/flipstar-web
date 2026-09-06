/**
 * One stylesheet for the whole admin.
 *
 * Mounted once by AdminApp, so every page can use these classes without
 * importing anything. That is the point: the admin had no shared visual
 * vocabulary at all -- each page inlined its own card padding, button colours
 * and table borders, so "consistent" meant "somebody remembered".
 *
 * Why classes rather than inline styles
 * ------------------------------------
 * Hover, :focus-visible, :disabled, media queries and prefers-reduced-motion
 * cannot be expressed inline, and those are most of what separates a polished
 * interface from a styled one. Inline styles also cannot be overridden by a
 * page that legitimately needs to differ.
 *
 * Adoption
 * --------
 * Existing pages keep working untouched -- nothing here is a global element
 * selector that would restyle them by surprise, except the few base rules on
 * scrollbars and focus rings which are safe improvements everywhere. Pages
 * move onto `.adm-*` as they are touched, rather than in one risky sweep.
 */

export function AdminStyles({ tokens }) {
  const t = tokens;
  return (
    <style>{`
      /* ── Custom properties ─────────────────────────────────────────────
         The escape hatch for code that cannot reach the theme prop: module
         level constants, third-party components, anything defined outside a
         React tree. var(--adm-card) works inside an inline style object and
         follows the mode without the file knowing a theme exists. */
      .admin-root {
        --adm-bg: ${t.bg};
        --adm-card: ${t.surface};
        --adm-surface-2: ${t.surface2};
        --adm-txt: ${t.txt};
        --adm-sub: ${t.sub};
        --adm-faint: ${t.faint};
        --adm-border: ${t.border};
        --adm-border-strong: ${t.borderStrong};
        --adm-pri: ${t.pri};
        --adm-pri-hover: ${t.priHover};
        --adm-accent: ${t.accent};
        --adm-success: ${t.success};
        --adm-warning: ${t.warning};
        --adm-danger: ${t.danger};
        --adm-info: ${t.info};
        --adm-hover: ${t.hover};
        --adm-shadow: ${t.shadow};
        --adm-font-mono: ${t.fontMono};
      }

      /* ── Typography ────────────────────────────────────────────────────
         One family for the whole admin. Set on .admin-root and inherited, so
         a page does not have to know it exists.

         The form-control selectors are listed explicitly because those
         controls do not inherit font from their ancestor in any browser --
         they fall back to a 13px system face. That single omission is why
         inputs looked unrelated to the text beside them. */
      .admin-root,
      .admin-root button,
      .admin-root input,
      .admin-root select,
      .admin-root textarea {
        font-family: ${t.font};
      }
      .admin-root {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
      }
      /* Tabular figures wherever numbers are compared down a column -- with
         proportional digits a 1 is narrower than a 7 and the column jitters. */
      .adm-table-num, .adm-stat-value, .adm-revenue-value {
        font-variant-numeric: tabular-nums;
      }

      .adm-t-page {
        font-size: ${t.type.pageTitle.size}px; font-weight: ${t.type.pageTitle.weight};
        letter-spacing: ${t.type.pageTitle.spacing}; line-height: 1.2; margin: 0;
      }
      .adm-t-section {
        font-size: ${t.type.sectionTitle.size}px; font-weight: ${t.type.sectionTitle.weight};
        letter-spacing: ${t.type.sectionTitle.spacing}; line-height: 1.3; margin: 0;
      }
      .adm-t-card {
        font-size: ${t.type.cardTitle.size}px; font-weight: ${t.type.cardTitle.weight};
        line-height: 1.35; margin: 0;
      }
      .adm-t-body { font-size: ${t.type.body.size}px; font-weight: 400; line-height: 1.55; }
      .adm-t-label { font-size: ${t.type.label.size}px; font-weight: ${t.type.label.weight}; }
      .adm-t-caption { font-size: ${t.type.caption.size}px; font-weight: ${t.type.caption.weight}; color: ${t.faint}; }

      @media (max-width: 560px) {
        /* Headings only. Body stays put -- shrinking it to fit more on screen
           is what makes an interface feel cramped. */
        .adm-t-page { font-size: 21px; }
        .adm-t-section { font-size: 17px; }
      }

      /* ── Base ───────────────────────────────────────────────────────────
         Deliberately narrow. A reset here would reflow thirty pages that
         were laid out without one. */
      .admin-root *:focus-visible {
        outline: 2px solid ${t.pri};
        outline-offset: 2px;
        border-radius: 4px;
      }
      .admin-root ::-webkit-scrollbar { width: 10px; height: 10px; }
      .admin-root ::-webkit-scrollbar-track { background: transparent; }
      .admin-root ::-webkit-scrollbar-thumb {
        background: ${t.border}; border-radius: 6px;
        border: 2px solid transparent; background-clip: content-box;
      }
      .admin-root ::-webkit-scrollbar-thumb:hover { background: ${t.borderStrong}; background-clip: content-box; }

      /* ── Surfaces ──────────────────────────────────────────────────── */
      .adm-card {
        background: ${t.raised};
        border: 1px solid ${t.border};
        border-radius: ${t.radius.md}px;
        box-sizing: border-box;
      }
      .adm-card-hover { transition: border-color .16s ease, transform .16s ease; }
      .adm-card-hover:hover { border-color: ${t.borderStrong}; transform: translateY(-1px); }

      .adm-section-title { margin: 0 0 4px; font-size: 19px; font-weight: 800; letter-spacing: -0.01em; }
      .adm-lede { margin: 0; font-size: 14px; color: ${t.sub}; }
      .adm-eyebrow {
        font-size: 11px; font-weight: 700; letter-spacing: .08em;
        text-transform: uppercase; color: ${t.faint}; margin-bottom: 11px;
      }

      /* ── Buttons ───────────────────────────────────────────────────────
         One geometry, five intents. Variants change colour only, so a row of
         mixed buttons still lines up. */
      .adm-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 9px 16px; border-radius: ${t.radius.sm}px;
        font-size: 13.5px; font-weight: 600; line-height: 1.2;
        border: 1px solid transparent; cursor: pointer; white-space: nowrap;
        transition: background .15s ease, border-color .15s ease, opacity .15s ease;
      }
      .adm-btn:disabled { opacity: .5; cursor: not-allowed; }
      .adm-btn-sm { padding: 6px 12px; font-size: 12.5px; }
      .adm-btn-block { width: 100%; }

      .adm-btn-primary { background: ${t.pri}; color: #fff; }
      .adm-btn-primary:hover:not(:disabled) { filter: brightness(1.1); }

      .adm-btn-outline { background: transparent; color: ${t.txt}; border-color: ${t.border}; }
      .adm-btn-outline:hover:not(:disabled) { background: ${t.hover}; border-color: ${t.borderStrong}; }

      .adm-btn-ghost { background: transparent; color: ${t.sub}; }
      .adm-btn-ghost:hover:not(:disabled) { background: ${t.hover}; color: ${t.txt}; }

      .adm-btn-danger { background: ${t.danger}; color: #fff; }
      .adm-btn-danger:hover:not(:disabled) { filter: brightness(1.1); }

      .adm-btn-success { background: ${t.success}; color: #06251A; }
      .adm-btn-success:hover:not(:disabled) { filter: brightness(1.08); }

      /* Tinted actions.
         A row of five solid colour blocks competes with the content it sits
         under and reads as a toolbar of warnings. Tinted buttons carry the
         same meaning at a fraction of the visual weight, and fill in on hover
         so the affordance is still obvious. The tint is passed as --tint, so
         one rule covers every intent. */
      .adm-btn-tint {
        background: color-mix(in srgb, var(--tint) 12%, transparent);
        color: var(--tint);
        border-color: color-mix(in srgb, var(--tint) 32%, transparent);
      }
      .adm-btn-tint:hover:not(:disabled) {
        background: color-mix(in srgb, var(--tint) 20%, transparent);
        border-color: color-mix(in srgb, var(--tint) 55%, transparent);
        transform: translateY(-1px);
      }
      .adm-btn-tint:active:not(:disabled) { transform: translateY(0); }
      .adm-btn-tint:focus-visible { outline: 2px solid var(--tint); outline-offset: 2px; }

      /* The page CTA. Stronger than everything around it, without a gradient:
         a solid fill plus a coloured shadow reads as elevation rather than
         decoration. */
      .adm-btn-cta {
        background: ${t.pri}; color: #fff; border-color: ${t.pri};
        padding: 11px 20px; font-size: 14px; font-weight: 650;
        box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 6px 16px color-mix(in srgb, ${t.pri} 32%, transparent);
      }
      .adm-btn-cta:hover:not(:disabled) {
        background: ${t.priHover}; border-color: ${t.priHover};
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0,0,0,.14), 0 10px 22px color-mix(in srgb, ${t.pri} 40%, transparent);
      }
      .adm-btn-cta:active:not(:disabled) { transform: translateY(0); }

      /* Segmented filter control. One track, one moving selection -- reads as
         a single control rather than six loose buttons. */
      .adm-tabs {
        display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px;
        background: ${t.hover}; border: 1px solid ${t.border};
        border-radius: ${t.radius.md}px;
      }
      .adm-tab {
        padding: 7px 15px; border: none; border-radius: ${t.radius.sm}px;
        background: transparent; color: ${t.sub};
        font-size: 13px; font-weight: 550; cursor: pointer;
        text-transform: capitalize; white-space: nowrap;
        transition: background .14s ease, color .14s ease;
      }
      .adm-tab:hover:not(.is-on) { background: ${t.activeBg}; color: ${t.txt}; }
      .adm-tab.is-on {
        background: ${t.pri}; color: #fff; font-weight: 650;
        box-shadow: 0 1px 3px rgba(0,0,0,.16);
      }
      .adm-tab:focus-visible { outline: 2px solid ${t.pri}; outline-offset: 2px; }

      @media (max-width: 560px) {
        .adm-tabs { display: flex; width: 100%; }
        .adm-tab { flex: 1 1 auto; text-align: center; padding: 7px 10px; }
      }

      /* Square icon-only button. Without this an icon button inherits the
         text button's horizontal padding and comes out as a wide rectangle
         with a glyph adrift in the middle. */
      .adm-icon-btn {
        width: 32px; height: 32px; padding: 0; flex-shrink: 0;
      }

      .adm-spin { animation: adm-rotate 1s linear infinite; }
      @keyframes adm-rotate { to { transform: rotate(360deg); } }

      /* ── Badges ────────────────────────────────────────────────────────
         Tinted rather than solid: a table of solid badges competes with the
         data it is annotating. */
      .adm-badge {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 3px 9px; border-radius: 999px;
        font-size: 11.5px; font-weight: 700; line-height: 1.5;
        border: 1px solid transparent; white-space: nowrap;
      }
      .adm-badge-success { background: ${t.success}1F; color: ${t.success}; border-color: ${t.success}44; }
      .adm-badge-warning { background: ${t.warning}1F; color: ${t.warning}; border-color: ${t.warning}44; }
      .adm-badge-danger  { background: ${t.danger}1F;  color: ${t.danger};  border-color: ${t.danger}44; }
      .adm-badge-info    { background: ${t.info}1F;    color: ${t.info};    border-color: ${t.info}44; }
      .adm-badge-neutral { background: ${t.hover};     color: ${t.sub};     border-color: ${t.border}; }

      /* ── Tables ────────────────────────────────────────────────────────
         The wrapper scrolls, not the page. A wide table inside a page that
         scrolls horizontally drags the whole layout with it. */
      .adm-table-wrap {
        width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;
        border: 1px solid ${t.border}; border-radius: ${t.radius.md}px;
        background: ${t.raised};
      }
      .adm-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      .adm-table thead th {
        position: sticky; top: 0; z-index: 1;
        background: ${t.surface};
        text-align: left; font-size: 11.5px; font-weight: 700;
        letter-spacing: .05em; text-transform: uppercase; color: ${t.faint};
        padding: 12px 16px; white-space: nowrap;
        border-bottom: 1px solid ${t.border};
      }
      .adm-table tbody td {
        padding: 13px 16px; color: ${t.txt};
        border-bottom: 1px solid ${t.border}; vertical-align: middle;
      }
      .adm-table tbody tr:last-child td { border-bottom: none; }
      .adm-table tbody tr { transition: background .12s ease; }
      .adm-table tbody tr:hover { background: ${t.hover}; }
      .adm-table-num { text-align: right; font-variant-numeric: tabular-nums; }

      .adm-pagination {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; flex-wrap: wrap; padding: 12px 4px 0; font-size: 13px; color: ${t.sub};
      }

      /* ── Forms ─────────────────────────────────────────────────────── */
      .adm-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
      .adm-label { font-size: 12.5px; font-weight: 600; color: ${t.sub}; }
      .adm-label .adm-req { color: ${t.danger}; margin-left: 3px; }
      .adm-input, .adm-select, .adm-textarea {
        width: 100%; box-sizing: border-box;
        padding: 10px 12px; border-radius: ${t.radius.sm}px;
        background: ${t.surface}; color: ${t.txt};
        border: 1px solid ${t.border};
        font-size: 13.5px; font-family: inherit;
        transition: border-color .15s ease, background .15s ease;
      }
      .adm-input::placeholder, .adm-textarea::placeholder { color: ${t.faint}; }
      .adm-input:hover, .adm-select:hover, .adm-textarea:hover { border-color: ${t.borderStrong}; }
      .adm-input:focus, .adm-select:focus, .adm-textarea:focus {
        outline: none; border-color: ${t.pri}; background: ${t.bg};
      }
      .adm-input:disabled, .adm-select:disabled, .adm-textarea:disabled {
        opacity: .55; cursor: not-allowed;
      }
      .adm-textarea { min-height: 96px; resize: vertical; line-height: 1.5; }
      .adm-input-error, .adm-select-error, .adm-textarea-error { border-color: ${t.danger}; }
      .adm-help { font-size: 11.5px; color: ${t.faint}; }
      .adm-invalid { font-size: 11.5px; color: ${t.danger}; display: flex; align-items: center; gap: 5px; }

      /* ── Modals ────────────────────────────────────────────────────────
         Full-screen on a phone: a centred card with margins wastes the space
         a form needs, and puts its actions mid-screen. */
      .adm-overlay {
        position: fixed; inset: 0; z-index: 1000;
        display: flex; align-items: center; justify-content: center; padding: 20px;
        background: rgba(0,0,0,0.72);
        -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
        animation: adm-fade .16s ease both;
      }
      .adm-modal {
        display: flex; flex-direction: column;
        width: 100%; max-width: 520px; max-height: min(88dvh, 760px);
        background: ${t.surface}; color: ${t.txt};
        border: 1px solid ${t.border}; border-radius: ${t.radius.lg}px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.6);
        overflow: hidden;
        animation: adm-rise .2s cubic-bezier(.22,1,.36,1) both;
      }
      .adm-modal-head {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid ${t.border};
      }
      .adm-modal-title { margin: 0; font-size: 16.5px; font-weight: 700; }
      .adm-modal-sub { margin: 3px 0 0; font-size: 12.5px; color: ${t.sub}; }
      .adm-modal-body { padding: 18px 20px; overflow-y: auto; flex: 1; }
      .adm-modal-foot {
        display: flex; gap: 10px; justify-content: flex-end;
        padding: 14px 20px calc(14px + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid ${t.border}; background: ${t.surface};
      }
      .adm-modal-x {
        flex-shrink: 0; width: 32px; height: 32px; border-radius: 9px;
        display: inline-flex; align-items: center; justify-content: center;
        background: transparent; border: none; color: ${t.sub}; cursor: pointer;
        transition: background .15s ease, color .15s ease;
      }
      .adm-modal-x:hover { background: ${t.hover}; color: ${t.txt}; }

      @keyframes adm-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes adm-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

      /* ── States ────────────────────────────────────────────────────── */
      .adm-state {
        display: flex; flex-direction: column; align-items: center;
        text-align: center; padding: 48px 24px; gap: 8px;
      }
      .adm-state-icon { opacity: .35; margin-bottom: 4px; }
      .adm-state-title { font-size: 15px; font-weight: 700; color: ${t.txt}; }
      .adm-state-text { font-size: 13px; color: ${t.sub}; max-width: 380px; line-height: 1.55; }

      .adm-alert {
        display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
        padding: 14px 16px; border-radius: ${t.radius.md}px; margin-bottom: 18px;
      }
      .adm-alert-danger  { background: ${t.danger}14;  border: 1px solid ${t.danger}59;  color: #F87171; }
      .adm-alert-warning { background: ${t.warning}14; border: 1px solid ${t.warning}59; color: ${t.warning}; }
      .adm-alert-success { background: ${t.success}14; border: 1px solid ${t.success}59; color: ${t.success}; }
      .adm-alert-info    { background: ${t.info}14;    border: 1px solid ${t.info}59;    color: ${t.info}; }

      .adm-sk {
        display: block; border-radius: 6px;
        background: linear-gradient(90deg,
          rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.10) 37%, rgba(255,255,255,0.05) 63%);
        background-size: 400% 100%;
        animation: adm-shimmer 1.3s ease-in-out infinite;
      }
      @keyframes adm-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

      /* ── Layout helpers ────────────────────────────────────────────── */
      .adm-grid { display: grid; gap: ${t.gap}px; }
      .adm-grid-auto { grid-template-columns: repeat(auto-fit, minmax(min(100%, 235px), 1fr)); }
      .adm-row-between {
        display: flex; align-items: center; justify-content: space-between;
        gap: 14px; flex-wrap: wrap;
      }

      /* ── Motion ────────────────────────────────────────────────────── */
      @media (prefers-reduced-motion: reduce) {
        .admin-root *, .admin-root *::before, .admin-root *::after {
          animation-duration: .01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: .01ms !important;
        }
      }
    `}</style>
  );
}
