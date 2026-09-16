// How the comments sheet sizes itself, and what happens when the keyboard
// opens. The browser suite checks the sheet on a real page; these are the
// arithmetic, including the cases a desktop browser cannot produce.

import assert from 'node:assert/strict';
import test from 'node:test';

import { readSheetMetrics } from '../utils/sheetMetrics.js';

/** A window with a visual viewport, as phones report it. */
const view = ({ inner, visual = inner, offsetTop = 0 }) => ({
  innerHeight: inner,
  visualViewport: { height: visual, offsetTop },
});

test('with no keyboard the sheet takes most of the screen, and sits on the bottom', () => {
  const { height, lift, keyboard } = readSheetMetrics(view({ inner: 800 }));

  assert.equal(keyboard, false);
  assert.equal(height, 680, '85% of the viewport');
  assert.equal(lift, 0, 'nothing to clear');
});

test('an open keyboard lifts the sheet by exactly what it covers', () => {
  // A phone: 800 tall, keyboard 336 of it, so 464 is visible.
  const { height, lift, keyboard } = readSheetMetrics(view({ inner: 800, visual: 464 }));

  assert.equal(keyboard, true);
  assert.equal(lift, 336, 'the sheet rises by the height of the keyboard');
  assert.equal(height, 427, '92% of what is still visible');
  assert.ok(height + lift <= 800, 'the sheet stays on the screen');
});

test('browser chrome collapsing is not mistaken for a keyboard', () => {
  // The address bar hiding takes ~60px. Resizing the sheet for that would
  // make it jump around as the user scrolls.
  const { keyboard, lift } = readSheetMetrics(view({ inner: 800, visual: 740 }));

  assert.equal(keyboard, false);
  assert.equal(lift, 0);
});

test('a page scrolled under the keyboard is measured from the offset too', () => {
  // iOS scrolls the layout viewport up as well as shrinking it.
  const { keyboard, lift } = readSheetMetrics(view({ inner: 800, visual: 400, offsetTop: 100 }));

  assert.equal(keyboard, true);
  assert.equal(lift, 300, '800 - 400 - 100');
});

test('a short screen still gets a usable sheet', () => {
  // 85% of 300 is 255: too short for a list and an input together.
  const { height } = readSheetMetrics(view({ inner: 300 }));

  assert.equal(height, 280);
});

test('a browser without visualViewport falls back to the window', () => {
  const { height, lift, keyboard } = readSheetMetrics({ innerHeight: 900 });

  assert.equal(height, 765);
  assert.equal(lift, 0);
  assert.equal(keyboard, false);
});

test('no window at all (server render) asks for nothing', () => {
  assert.deepEqual(readSheetMetrics(null), { height: 0, lift: 0, keyboard: false });
});
