// Every engagement surface that checks the subscription gate must be handed
// the things it checks.
//
// The regression this exists for: DesktopReelViewer was given a `canEngage`
// check on Like, and ReelLayout -- the only thing that renders it -- was not
// updated to pass `subscriptionStatus` or `onShowSubscription`. `canEngage`
// of `undefined` is false, so desktop Like refused *everyone*, subscribers
// included, and the missing `onShowSubscription` meant it did so silently:
// the heart simply did nothing.
//
// The browser suite catches this by clicking a real Like, which is the
// stronger test and also a slow one. This is the cheap guard next to it: a
// component that reads a prop is useless if its parent never sends it, and
// that mismatch is invisible in JSX until something clicks the button.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** The props a JSX element is given, by tag name. */
function propsPassedTo(source, tagName) {
  const open = source.indexOf(`<${tagName}`);
  if (open === -1) return null;

  // To the matching `/>` or `>` that closes the opening tag.
  let depth = 0;
  let i = open;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) break;
  }
  const tag = source.slice(open, i);
  return [...tag.matchAll(/(\w+)\s*=/g)].map((m) => m[1]);
}

test('ReelLayout hands the desktop viewer the gate it checks', () => {
  const layout = read('../components/feed/ReelLayout.jsx');
  const viewer = read('../components/feed/DesktopReelViewer.jsx');

  // Only assert what the viewer actually reads, so this does not become a
  // list of props to keep in sync by hand.
  const reads = ['subscriptionStatus', 'onShowSubscription'].filter((prop) =>
    viewer.includes(prop)
  );
  assert.ok(reads.length === 2, 'DesktopReelViewer no longer reads the gate props');

  const passed = propsPassedTo(layout, 'DesktopReelViewer');
  assert.ok(passed, 'ReelLayout no longer renders DesktopReelViewer');

  for (const prop of reads) {
    assert.ok(
      passed.includes(prop),
      `DesktopReelViewer reads ${prop} but ReelLayout does not pass it -- ` +
        'liking will be refused for everyone, silently'
    );
  }
});

test('the desktop viewer asks the gate before the optimistic update', () => {
  // Checking afterwards is what the original bug looked like from outside:
  // the heart filled, the server refused with 403, and the rollback emptied
  // it again with nothing said.
  const viewer = read('../components/feed/DesktopReelViewer.jsx');
  const like = viewer.slice(viewer.indexOf('const handleLike'));
  const gate = like.indexOf('canEngage');
  const optimistic = like.indexOf('patch(');

  assert.ok(gate !== -1, 'desktop Like no longer checks the subscription');
  assert.ok(optimistic !== -1, 'desktop Like no longer updates optimistically');
  assert.ok(gate < optimistic, 'the gate must be checked before the heart fills');
});
