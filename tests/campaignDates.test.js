// How campaign timeline dates are rendered.
//
// The reported symptom was an entry deadline shown later than the voting end.
// That cannot be caused by formatting: a timezone offset is uniform, so if one
// instant precedes another it precedes it in every timezone. Rendering can
// collapse two dates onto the same day, never reverse them -- which is why the
// fix for the ordering is a server-side rule, and the fix here is about
// stating the dates the campaign actually runs on.
//
// These pin the two display faults that were real: the viewer's timezone
// deciding the date, and the time being dropped.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMPAIGN_TIME_ZONE,
  NOT_SCHEDULED,
  UNKNOWN_DATE,
  formatCampaignDate,
  formatCampaignDay,
  outOfOrderPairs,
} from '../utils/campaignDates.js';

// What the API sends: the instant the admin configured, with its offset.
const DEADLINE = '2026-09-25T23:59:00+03:00';

test('a deadline is shown as the admin configured it', () => {
  assert.equal(formatCampaignDate(DEADLINE), 'September 25, 2026 at 11:59 PM');
});

test('the date is pinned to campaign time, not the viewer', () => {
  // The default must equal an explicit Addis render, and must NOT equal what
  // other zones produce -- otherwise the timezone is not actually being
  // pinned and this test would pass whatever the function did.
  const byDefault = formatCampaignDate(DEADLINE);
  assert.equal(byDefault, formatCampaignDate(DEADLINE, { timeZone: CAMPAIGN_TIME_ZONE }));

  for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
    assert.notEqual(
      formatCampaignDate(DEADLINE, { timeZone: tz }),
      byDefault,
      `${tz} rendered identically to campaign time -- the zone is not pinned`,
    );
  }
});

test('an instant late in the Addis day is not pushed to the previous day', () => {
  // The old formatter rendered this in the device timezone: on a UTC device
  // 2026-09-25T23:59+03:00 is 20:59 on the 25th, but 00:30+03:00 on the 26th
  // is 21:30 on the *25th* -- a deadline shown a day early.
  assert.match(formatCampaignDate('2026-09-26T00:30:00+03:00'), /September 26, 2026/);
});

test('the time is shown, because a deadline is an hour not a day', () => {
  const endOfDay = formatCampaignDate('2026-09-25T23:59:00+03:00');
  const startOfNext = formatCampaignDate('2026-09-26T00:00:00+03:00');

  assert.notEqual(endOfDay, startOfNext);
  assert.match(endOfDay, /11:59 PM/);
  assert.match(startOfNext, /12:00 AM/);
});

test('two moments on the same day are told apart', () => {
  // Dropping the time rendered these identically, which is how a timeline
  // could look wrong without looking wrong.
  const morning = formatCampaignDate('2026-09-25T09:00:00+03:00');
  const evening = formatCampaignDate('2026-09-25T21:00:00+03:00');

  assert.notEqual(morning, evening);
});

test('a UTC instant is restated in campaign time', () => {
  // The same moment as DEADLINE, sent without the offset applied.
  assert.equal(formatCampaignDate('2026-09-25T20:59:00Z'), formatCampaignDate(DEADLINE));
});

test('an unscheduled date says so, and a broken one says something else', () => {
  assert.equal(formatCampaignDate(null), NOT_SCHEDULED);
  assert.equal(formatCampaignDate(undefined), NOT_SCHEDULED);
  assert.equal(formatCampaignDate(''), NOT_SCHEDULED);
  assert.equal(formatCampaignDate('not a date'), UNKNOWN_DATE);
});

test('the day-only form follows the same timezone rule', () => {
  assert.equal(formatCampaignDay(DEADLINE), 'September 25, 2026');
  assert.equal(formatCampaignDay('2026-09-25T20:59:00Z'), 'September 25, 2026');
  assert.equal(formatCampaignDay(null), NOT_SCHEDULED);
});

test('a Date object is accepted as readily as a string', () => {
  assert.equal(formatCampaignDate(new Date(DEADLINE)), formatCampaignDate(DEADLINE));
});

// ── spotting a timeline stored out of order ─────────────────────────────────

const timeline = (deadline, votingEnd) => [
  { label: 'Starts', date: '2026-09-01T00:00:00+03:00' },
  { label: 'Entry Deadline', date: deadline },
  { label: 'Voting Ends', date: votingEnd },
];

test('a timeline in order reports no problem', () => {
  assert.deepEqual(
    outOfOrderPairs(timeline('2026-09-25T23:59:00+03:00', '2026-09-30T23:59:00+03:00')),
    [],
  );
});

test('an entry deadline after the voting end is reported', () => {
  // The exact case from the report.
  const problems = outOfOrderPairs(
    timeline('2026-10-05T23:59:00+03:00', '2026-09-30T23:59:00+03:00'),
  );

  assert.deepEqual(problems, [['Entry Deadline', 'Voting Ends']]);
});

test('unscheduled dates are skipped, not treated as the epoch', () => {
  // A campaign that has not set its voting dates is incomplete, not broken.
  assert.deepEqual(outOfOrderPairs(timeline('2026-09-25T23:59:00+03:00', null)), []);
  assert.deepEqual(outOfOrderPairs([]), []);
  assert.deepEqual(outOfOrderPairs(undefined), []);
});
