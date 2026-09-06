/**
 * Light and dark palettes for the admin.
 *
 * Why this works without touching 34 pages
 * ----------------------------------------
 * The pages already read colours from the `theme` prop -- 2,327 references to
 * `theme.sub`, `theme.txt`, `theme.border` and so on, against roughly 280
 * hardcoded values. So the palette was never really scattered; it was just
 * fixed. Swapping what that prop CONTAINS moves the whole admin, and the few
 * hardcoded blacks and whites are the only places needing a hand.
 *
 * That is also why the key names below are non-negotiable: `txt`, `sub`,
 * `card`, `pri` and the rest are the vocabulary those pages already speak.
 * Renaming them to something tidier would blank out a thousand styles.
 *
 * Dark is not inverted light
 * --------------------------
 * Inverting produces the grey mush most "dark modes" ship with. The dark
 * palette uses a navy-tinted surface ramp (#0F172A -> #111827 -> #1E293B) and
 * *lifts* the semantic colours -- #34D399 rather than #10B981 -- because a
 * colour tuned for contrast against white is too dark to read against navy.
 *
 * The sidebar stays navy in both modes. It is chrome, not content: keeping it
 * constant is what makes the light theme read as a product with a navigation
 * rail rather than a white page with a white strip down the side.
 */

/** Shared by both modes: the sidebar is chrome and does not flip. */
const NAVY = {
  navy: '#0F1B33',
  navyRaised: '#16243F',
  navyBorder: 'rgba(255,255,255,0.09)',
  navyText: '#E8EEF9',
  navySub: '#93A4C1',
};

export const LIGHT = {
  ...NAVY,
  mode: 'light',

  bg: '#F6F8FC',
  card: '#FFFFFF',
  surface2: '#F1F5F9',

  txt: '#172033',
  sub: '#64748B',
  faint: '#94A3B8',

  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  pri: '#2563EB',
  priHover: '#1D4ED8',
  accent: '#06B6D4',

  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#2563EB',

  // Categorical accents for KPI icons and nav groups. Not status.
  blue: '#2563EB',
  cyan: '#06B6D4',
  purple: '#7C3AED',
  green: '#10B981',
  orange: '#F59E0B',
  red: '#EF4444',

  // Neutral overlays, expressed against a LIGHT ground -- the same
  // rgba(255,255,255,.05) that lifts a dark surface does nothing on white.
  hover: 'rgba(15,23,42,0.04)',
  activeBg: 'rgba(15,23,42,0.07)',
  raised: '#FFFFFF',

  shadow: '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.06)',
  shadowLg: '0 12px 32px rgba(15,23,42,0.12)',
  scrim: 'rgba(15,23,42,0.45)',
};

export const DARK = {
  ...NAVY,
  mode: 'dark',

  bg: '#0F172A',
  card: '#111827',
  surface2: '#1E293B',

  txt: '#F8FAFC',
  sub: '#94A3B8',
  faint: '#64748B',

  border: '#334155',
  borderStrong: '#475569',

  pri: '#3B82F6',
  priHover: '#60A5FA',
  accent: '#22D3EE',

  // Lifted against navy: the light-mode values are too dark to read here.
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',

  blue: '#3B82F6',
  cyan: '#22D3EE',
  purple: '#A78BFA',
  green: '#34D399',
  orange: '#FBBF24',
  red: '#F87171',

  hover: 'rgba(255,255,255,0.05)',
  activeBg: 'rgba(255,255,255,0.08)',
  raised: '#111827',

  shadow: '0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.25)',
  shadowLg: '0 16px 40px rgba(0,0,0,0.5)',
  scrim: 'rgba(2,6,23,0.7)',
};

export const PALETTES = { light: LIGHT, dark: DARK };

/**
 * The palette for a mode, resolving 'system' against the OS preference.
 *
 * Called during render as well as on change, so it must stay cheap and must
 * not touch storage.
 */
export function resolvePalette(mode) {
  if (mode === 'light' || mode === 'dark') return PALETTES[mode];
  return prefersDark() ? DARK : LIGHT;
}

export function prefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
