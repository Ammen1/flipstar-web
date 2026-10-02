// Shared vocabulary for the campaign surfaces: what each status looks like,
// what each campaign type looks like, and how a prize is written.
//
// One module because the page, the card and the skeleton all need the same
// answers, and three copies of "voting is blue" is how they drift apart. No
// React here on purpose -- this is data, and it is testable without a DOM.

/** Flipstar's base accent, used when the active theme has no opinion. */
export const BRAND = '#8fc441';

/**
 * Per-status identity.
 *
 * Each state gets its own accent so the page reads at a glance instead of
 * being one uniform green: emerald for a campaign taking entries, blue for
 * one being voted on, amber for one not open yet, slate for one finished.
 *
 * `glow` is the same hue at low alpha, for borders and shadows -- kept
 * alongside rather than computed at every call site so the alpha is
 * consistent.
 */
export const STATUS_THEME = {
  active: {
    label: 'Active',
    accent: '#10B981',
    soft: 'rgba(16,185,129,0.14)',
    glow: 'rgba(16,185,129,0.30)',
    srLabel: 'Open for entries',
  },
  voting: {
    label: 'Voting',
    accent: '#6366F1',
    soft: 'rgba(99,102,241,0.14)',
    glow: 'rgba(99,102,241,0.30)',
    srLabel: 'Voting is open',
  },
  upcoming: {
    label: 'Coming soon',
    accent: '#F59E0B',
    soft: 'rgba(245,158,11,0.14)',
    glow: 'rgba(245,158,11,0.30)',
    srLabel: 'Starting soon',
  },
  completed: {
    label: 'Ended',
    accent: '#94A3B8',
    soft: 'rgba(148,163,184,0.14)',
    glow: 'rgba(148,163,184,0.26)',
    srLabel: 'Finished',
  },
};

export const statusTheme = (status) => STATUS_THEME[status] || STATUS_THEME.completed;

/**
 * Per-campaign-type accent.
 *
 * Keyed on `campaign.campaign_type`, which the API already sends -- never on
 * the title. A campaign called "Music Awards" in a photography contest would
 * otherwise be coloured by its name, and the mapping would quietly become a
 * list of special cases. An unknown type falls through to null and the card
 * uses its status accent instead, so a new type added server-side looks
 * ordinary rather than broken.
 */
export const TYPE_ACCENTS = {
  cultural: '#F59E0B',
  music: '#EC4899',
  sports: '#3B82F6',
  photography: '#06B6D4',
  dance: '#A855F7',
  comedy: '#F97316',
  art: '#8B5CF6',
};

export const typeAccent = (campaignType) => {
  if (!campaignType) return null;
  return TYPE_ACCENTS[String(campaignType).trim().toLowerCase()] || null;
};

/**
 * A prize as a person would read it: 3,500,000 ETB.
 *
 * The API sends a decimal string -- "3500000.00" -- which rendered verbatim
 * as the least readable part of the busiest card. Trailing minor units are
 * dropped when they are zero, because prizes are whole birr and ".00" is
 * three characters of noise on every card.
 *
 * Anything unparseable is returned untouched rather than shown as NaN: a
 * prize described in words ("A trip to Hawassa") is a legitimate value here.
 */
export function formatPrize(value, { currency = 'ETB' } = {}) {
  if (value === null || value === undefined || value === '') return null;

  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);

  const hasMinorUnits = Math.round(amount * 100) % 100 !== 0;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: hasMinorUnits ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}

/** A count as a short, readable label: 1 Entry / 3 Entries. */
export function pluralise(count, singular, plural) {
  const n = Number(count) || 0;
  return `${n.toLocaleString('en-US')} ${n === 1 ? singular : plural || `${singular}s`}`;
}

/**
 * Time left, as "6d 9h" / "9h" / "42m".
 *
 * Minutes matter in the last hour: "0h" on a campaign that still has fifty
 * minutes left reads as closed.
 */
export function timeRemaining(endDate) {
  if (!endDate) return null;
  const diff = new Date(endDate) - new Date();
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export default {
  BRAND,
  STATUS_THEME,
  statusTheme,
  TYPE_ACCENTS,
  typeAccent,
  formatPrize,
  pluralise,
  timeRemaining,
};
