// Campaign timeline dates, shown as the campaign actually runs them.
//
// Two things were wrong with formatting these as `new Date(x).toLocaleDateString()`:
//
//  * **the viewer's timezone decided the date.** The API sends the instant
//    with its offset (`2026-09-25T23:59:00+03:00`), and toLocaleDateString
//    re-renders it wherever the device happens to be. The same campaign then
//    shows different dates to a phone in Addis and a laptop set to UTC, and
//    an entry deadline at 23:59 reads as the previous day for anybody west of
//    here. The campaign runs on Ethiopian time regardless of who is looking,
//    so that is the timezone it is stated in.
//
//  * **the time was dropped.** A deadline of 23:59 and a voting start of
//    00:00 the next morning are nine hours apart and rendered as adjacent
//    days with no hint of which hour -- and two moments on the same day
//    rendered as one identical string. For a deadline, the hour is the point.
//
// A uniform offset cannot reverse two instants, so this is a display fix, not
// an ordering fix: dates that appear out of order are stored out of order,
// and that is refused by the API (Campaign.timeline_problems).

/** Where the campaign runs. Not the viewer's timezone, and not the server's. */
export const CAMPAIGN_TIME_ZONE = 'Africa/Addis_Ababa';

/** Shown when a date has not been scheduled -- distinct from a bad value. */
export const NOT_SCHEDULED = 'Not scheduled';

/** Shown when a value arrives that is not a date at all. */
export const UNKNOWN_DATE = 'Unknown';

function parse(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * A timeline date with its time: "September 25, 2026, 11:59 PM".
 *
 * Returns NOT_SCHEDULED for an absent date and UNKNOWN_DATE for an
 * unparseable one, so a blank field never reads as a broken one.
 */
export function formatCampaignDate(value, { timeZone = CAMPAIGN_TIME_ZONE } = {}) {
  const date = parse(value);
  if (date === null) return NOT_SCHEDULED;
  if (date === undefined) return UNKNOWN_DATE;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

/** Just the day, for somewhere a time would be noise. Same timezone rule. */
export function formatCampaignDay(value, { timeZone = CAMPAIGN_TIME_ZONE } = {}) {
  const date = parse(value);
  if (date === null) return NOT_SCHEDULED;
  if (date === undefined) return UNKNOWN_DATE;

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(date);
}

/**
 * The timeline entries that run backwards, as `[earlierLabel, laterLabel]`.
 *
 * The API refuses to store such a campaign, so this should find nothing. It
 * exists for the ones stored before that rule did, which a screen may still
 * have to render: better to mark them than to present them as a schedule
 * somebody could act on.
 */
export function outOfOrderPairs(entries) {
  const filled = (entries || []).filter((e) => parse(e.date) instanceof Date);
  const problems = [];
  for (let i = 0; i < filled.length - 1; i += 1) {
    if (parse(filled[i].date) > parse(filled[i + 1].date)) {
      problems.push([filled[i].label, filled[i + 1].label]);
    }
  }
  return problems;
}
