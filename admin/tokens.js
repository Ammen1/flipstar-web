/**
 * Design tokens for the admin.
 *
 * These were introduced on the dashboard and lived in that file. Every other
 * page picked its own greys, radii and paddings, which is why the admin reads
 * as a set of screens built at different times rather than one product.
 *
 * Derived from the theme prop rather than hardcoded, so the existing
 * adminTheme (and the operator-configurable branding in SettingsPage) stays
 * the source of the palette. This module decides the SCALE; the theme decides
 * the hue.
 *
 * The values are deliberately few. A scale with nine greys and six radii is
 * not more expressive than one with four -- it just moves the inconsistency
 * from "any value" to "any of nine values".
 */

/** Neutral scale, expressed as alpha over the near-black admin ground. */
const NEUTRAL = {
  raised: 'rgba(255,255,255,0.03)',
  hover: 'rgba(255,255,255,0.05)',
  active: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  faint: 'rgba(255,255,255,0.38)',
};

export function buildTokens(theme) {
  const t = theme || {};
  return {
    // Sidebar chrome. Navy in both modes -- see admin/themes.js for why.
    navy: t.navy || '#0F1B33',
    navyRaised: t.navyRaised || '#16243F',
    navyBorder: t.navyBorder || 'rgba(255,255,255,0.09)',
    navyText: t.navyText || '#E8EEF9',
    navySub: t.navySub || '#93A4C1',

    shadow: t.shadow || '0 1px 2px rgba(0,0,0,0.3)',
    shadowLg: t.shadowLg || '0 16px 40px rgba(0,0,0,0.5)',
    scrim: t.scrim || 'rgba(0,0,0,0.6)',
    priHover: t.priHover || t.pri || '#1D4ED8',
    accent: t.accent || '#06B6D4',
    surface2: t.surface2 || t.card || '#1E293B',
    mode: t.mode || 'dark',
    // Text
    txt: t.txt || '#FFFFFF',
    sub: t.sub || 'rgba(255,255,255,0.55)',
    faint: t.faint || NEUTRAL.faint,

    // Surfaces
    bg: t.bg || '#000000',
    surface: t.card || '#0D0D0D',
    raised: t.raised || NEUTRAL.raised,
    hover: t.hover || NEUTRAL.hover,
    activeBg: t.activeBg || NEUTRAL.active,
    border: t.border || NEUTRAL.border,
    borderStrong: t.borderStrong || NEUTRAL.borderStrong,

    // Brand and semantics. The MEANING is fixed -- green is always success --
    // but the value follows the mode: a colour tuned for contrast against
    // white is too dark to read against navy, which is how most dark themes
    // end up with unreadable status text.
    pri: t.pri || '#2563EB',
    success: t.success || '#10B981',
    warning: t.warning || '#F59E0B',
    danger: t.error || t.danger || '#EF4444',
    info: t.info || '#3B82F6',

    // Accents for categorical marks (KPI icons, nav groups). Not for state.
    accents: {
      users: t.blue || '#3B82F6',
      content: t.purple || '#8B5CF6',
      votes: t.green || '#10B981',
      comments: t.orange || '#F59E0B',
      active: t.pri || '#2563EB',
      follows: t.red || '#EF4444',
    },

    // Typography. Inter is loaded in index.html; the stack below is the
    // fallback chain for the moment before it arrives and for the rare client
    // that cannot fetch it. Naming it without loading it -- which is what the
    // admin did until now -- means every declaration silently resolves to the
    // platform default.
    font: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    // For content that is genuinely code-like -- IP addresses, hex values,
    // log payloads. Bare `monospace` falls to Courier on some platforms:
    // too small, badly spaced, and unrelated to the Inter beside it.
    fontMono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",

    // One scale, five sizes. Weight carries hierarchy at the small end so the
    // sizes do not have to multiply: a 13px semibold label and 13px regular
    // body read as different levels without inventing a sixth step.
    type: {
      pageTitle: { size: 26, weight: 800, spacing: '-0.02em' },
      sectionTitle: { size: 19, weight: 700, spacing: '-0.01em' },
      cardTitle: { size: 15, weight: 700, spacing: '0' },
      kpi: { size: 27, weight: 800, spacing: '-0.02em' },
      body: { size: 13.5, weight: 400, spacing: '0' },
      label: { size: 12.5, weight: 600, spacing: '0' },
      caption: { size: 11.5, weight: 500, spacing: '0' },
    },

    radius: { sm: 10, md: 14, lg: 18 },
    gap: 14,
  };
}

/** Fixed sidebar width, shared by the sidebar and the content offset. */
export const SIDEBAR_WIDTH = 240;

/** Below this the sidebar becomes a drawer rather than a fixed column. */
export const MOBILE_BREAKPOINT = 1024;
