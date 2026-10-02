// Shared form and surface vocabulary, so the settings page and the campaign
// modal are visibly the same application.
//
// Both were written separately and drifted: inputs at 2px borders in one and
// 1.5px in the other, radii of 8 and 12 side by side, and two different
// "disabled button" greys. These are the definitions both now import.
//
// Theme COLOURS stay as arguments rather than being baked in -- the user picks
// a theme at runtime, and these helpers take whatever `useTheme()` returned.

const STYLE_ID = 'flipstar-ui-kit';

/**
 * `pri` is a gradient on most themes, which cannot be used where a plain
 * colour is needed -- a border, an alpha blend, an icon fill. `priFallback` is
 * the flat equivalent and is what those cases want.
 */
export const accentOf = (T) => T?.priFallback || '#8fc441';

/**
 * The theme has no `card` or `green` key, but code referenced both:
 * `background: T.card` left the upload zone with no background at all, and
 * `color: T.green` left the success tick unpainted. Reading through here
 * means a missing token degrades to something sensible instead of silently
 * rendering nothing.
 */
export const surfaceOf = (T) => T?.cardBg || T?.bg || '#1A1A1A';

export const SUCCESS = '#10B981';
export const DANGER = '#EF4444';
export const WARNING = '#F59E0B';
export const INFO = '#6366F1';

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

/** Minimum comfortable touch target on both iOS and Android. */
export const TAP = 44;

/**
 * A text input, textarea or select.
 *
 * 16px is not a style choice: iOS Safari zooms the viewport on focus for any
 * field below it and never zooms back, which leaves the page scrolled
 * sideways with no way to undo it.
 */
export const field = (T, { focused = false, invalid = false, readOnly = false } = {}) => {
  const accent = accentOf(T);
  const border = invalid ? DANGER : focused ? accent : T?.border || '#262626';
  return {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    minHeight: TAP,
    padding: '12px 14px',
    fontSize: 16,
    fontFamily: 'inherit',
    lineHeight: 1.4,
    color: readOnly ? T?.sub || '#9a9a9a' : T?.txt || '#fff',
    background: readOnly ? T?.bg || '#0D0D0D' : surfaceOf(T),
    border: `1.5px solid ${border}`,
    borderRadius: RADIUS.md,
    outline: 'none',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
    boxShadow: focused ? `0 0 0 3px ${accent}26` : 'none',
    cursor: readOnly ? 'default' : 'auto',
  };
};

export const label = (T) => ({
  display: 'block',
  marginBottom: 6,
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: '0.2px',
  color: T?.sub || '#9a9a9a',
});

/**
 * A button.
 *
 * `primary` uses the theme's gradient where there is one; everything that
 * needs a flat colour goes through accentOf.
 */
export const button = (T, variant = 'primary', { disabled = false, full = true } = {}) => {
  const accent = accentOf(T);
  const base = {
    minHeight: TAP,
    padding: '0 18px',
    width: full ? '100%' : 'auto',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADIUS.md,
    fontSize: 14.5,
    fontWeight: 800,
    fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'filter 0.18s ease, transform 0.12s ease, background 0.18s ease',
  };

  if (disabled) {
    return {
      ...base,
      background: T?.bg || '#0D0D0D',
      border: `1.5px solid ${T?.border || '#262626'}`,
      color: T?.sub || '#777',
      boxShadow: 'none',
    };
  }

  if (variant === 'primary') {
    return {
      ...base,
      background: T?.pri || accent,
      border: 'none',
      color: '#07130a',
      boxShadow: `0 8px 20px -10px ${accent}`,
    };
  }
  if (variant === 'danger') {
    // Destructive, but not the loudest thing on the screen: an outline that
    // reads as "careful" rather than a solid red slab competing with the
    // content it sits under.
    return {
      ...base,
      background: `${DANGER}14`,
      border: `1.5px solid ${DANGER}66`,
      color: DANGER,
    };
  }
  // ghost / secondary
  return {
    ...base,
    background: 'transparent',
    border: `1.5px solid ${T?.border || '#262626'}`,
    color: T?.txt || '#fff',
  };
};

export const CSS = `
  .fs-press { transition: filter .18s ease, transform .12s ease; }
  @media (hover: hover) { .fs-press:hover:not(:disabled) { filter: brightness(1.07); } }
  .fs-press:active:not(:disabled) { transform: scale(0.985); }

  /* One visible focus ring for everything, so keyboard users are never lost.
     :focus-visible rather than :focus keeps it off mouse clicks. */
  .fs-focus:focus-visible {
    outline: 3px solid currentColor;
    outline-offset: 2px;
    border-radius: ${RADIUS.sm}px;
  }

  .fs-modal-overlay { animation: fs-fade .18s ease-out; }
  .fs-modal-card { animation: fs-rise .22s cubic-bezier(.2,.8,.3,1); }

  @keyframes fs-fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes fs-rise {
    from { opacity: 0; transform: translateY(14px) scale(.985); }
    to   { opacity: 1; transform: none; }
  }
  @keyframes fs-spin { to { transform: rotate(360deg); } }
  .fs-spin { animation: fs-spin .9s linear infinite; }

  /* Hides the scrollbar on a row that scrolls sideways on purpose. */
  .fs-scroll-x {
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
  }
  .fs-scroll-x::-webkit-scrollbar { display: none; }

  @media (prefers-reduced-motion: reduce) {
    .fs-press, .fs-modal-overlay, .fs-modal-card, .fs-spin {
      animation: none !important;
      transition: none !important;
    }
    .fs-press:active:not(:disabled) { transform: none; }
  }
`;

export function ensureUiKitStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** Bytes as a person reads them: "4.2 MB". */
export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default {
  accentOf,
  surfaceOf,
  field,
  label,
  button,
  formatBytes,
  ensureUiKitStyles,
  RADIUS,
  TAP,
  SUCCESS,
  DANGER,
  WARNING,
  INFO,
};
