/**
 * The plans, shown to somebody who cannot use a paid action.
 *
 * Nobody here has a subscription. Whether they are *signed in* is set
 * explicitly per test rather than inherited: AuthProvider reads localStorage
 * once at mount, and the suites share a browser origin, so a harness that
 * does not say leaves its auth state to whichever suite ran before it.
 *
 * Three things have to hold, and all three used to fail:
 *
 *   over, not instead   tapping Like or Comment used to navigate to
 *                       /subscription, which unmounts the feed: the video
 *                       stopped, the scroll position went, and closing came
 *                       back to a freshly loaded feed at the first post. The
 *                       sheet has to leave the feed mounted underneath.
 *
 *   one rule, four      Like, Comment, Share and Gift each decided for
 *   buttons             themselves and no two agreed. A signed-in
 *                       non-subscriber could comment and send gifts freely,
 *                       because those two never checked the subscription at
 *                       all. All four now reach the same place.
 *
 *   a way back in       Subscriptions are sold by SMS and through telebirr,
 *                       so people arrive already paying but with no session.
 *                       Nothing on this page led to a login, so the only
 *                       thing it offered them was buying a second plan.
 *
 * Driven through the real router with real taps, because the bug being
 * guarded against is a navigation one -- it cannot be seen from a component
 * rendered on its own.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { BlockProvider } from '../../contexts/BlockContext';

const log = (msg) => fetch('/__log', { method: 'POST', body: msg }).catch(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pageErrors = [];
window.addEventListener('error', (e) => { pageErrors.push(e.message); log(`! error: ${e.message}`); });
window.addEventListener('unhandledrejection', (e) => { pageErrors.push(String(e.reason)); log(`! rejection: ${e.reason}`); });

async function test(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    await log(`✔ ${name} (${Math.round(performance.now() - t0)}ms)${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, detail: String((e && e.stack) || e) });
    await log(`✘ ${name}: ${e && e.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const rootEl = () => document.getElementById('root');
const pageText = () => (rootEl().innerText || '').replace(/\s+/g, ' ');

async function waitFor(fn, what, ms = 8000) {
  const t0 = performance.now();
  for (;;) {
    let v;
    try { v = fn(); } catch (_) { v = null; }
    if (v) return v;
    if (performance.now() - t0 > ms) {
      throw new Error(`timed out waiting for ${what}; page shows: "${pageText().slice(0, 200)}"`);
    }
    await sleep(50);
  }
}

async function input(action) {
  const res = await fetch('/__input', { method: 'POST', body: JSON.stringify(action) }).then((r) => r.json());
  if (!res.ok) throw new Error(`input failed: ${res.error}`);
  return res.result;
}
const centre = (el) => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
};
const tap = (el) => input({ kind: 'tap', ...centre(el) });

const ME = { id: 1, username: 'e2e_author' };

/** Sign in or out *before* mounting: AuthProvider reads this once, at mount. */
function setSignedIn(signedIn) {
  if (signedIn) {
    localStorage.setItem('authToken', 'e2e-token');
    localStorage.setItem('user', JSON.stringify(ME));
  } else {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  }
}

let root = null;
function mount(element) {
  if (root) root.unmount();
  document.querySelectorAll('video').forEach((v) => { try { v.pause(); } catch { /* detached */ } });
  root = createRoot(rootEl());
  root.render(
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <BlockProvider>{element}</BlockProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

/** The plans sheet, by the role and label it announces itself with. */
const sheet = () => document.querySelector('[role="dialog"][aria-label="Choose a plan"]');
const railButton = (action) => document.querySelector(`[data-reel-action="${action}"]`);

/** The reel at the top of the scroller -- what the viewer is looking at.
 *
 *  Deliberately not "the video that is playing": this suite serves no clip
 *  files, so nothing ever decodes and every reel renders its "Video
 *  unavailable" state. Whether the plans sheet tears the feed down has
 *  nothing to do with whether a video decoded, so the feed is identified by
 *  its cards instead, which is also what survives or does not. */
const visibleReel = () => {
  const cards = Array.from(document.querySelectorAll('[data-video-id]'));
  if (!cards.length) return null;
  const top = Math.min(...cards.map((c) => Math.abs(c.getBoundingClientRect().top)));
  const card = cards.find((c) => Math.abs(c.getBoundingClientRect().top) === top);
  return card?.getAttribute('data-video-id') || null;
};
const feedIsMounted = () => Boolean(document.querySelector('[data-video-id]'));

async function run() {
  await log('— the plans sheet: nobody subscribed, signed in and signed out —');

  history.replaceState(null, '', '/reels');
  const [{ router }, { RouterProvider }] = await Promise.all([
    import('../../router'),
    import('react-router-dom'),
  ]);

  async function openReels({ signedIn = true } = {}) {
    Object.keys(localStorage).filter((k) => k.startsWith('feed_cache_')).forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter((k) => k.startsWith('feed_position_')).forEach((k) => sessionStorage.removeItem(k));
    setSignedIn(signedIn);
    mount(<RouterProvider router={router} />);
    if (router.state.location.pathname !== '/reels') await router.navigate('/reels');
    await waitFor(() => railButton('comment'), 'the reel actions', 20000);
    await sleep(600);
  }

  async function closeSheet() {
    const close = sheet().querySelector('button[aria-label="Close"]');
    assert(close, 'the sheet has no close button');
    await tap(close);
    await waitFor(() => !sheet(), 'the sheet to close', 5000);
  }

  for (const action of ['comment', 'gift']) {
    await test(`${action} opens the plans instead of acting`, async () => {
      await openReels();
      const button = await waitFor(() => railButton(action), `the ${action} button`, 15000);

      await tap(button);
      await waitFor(sheet, 'the plans sheet', 6000);

      return 'the sheet opened';
    });
  }

  await test('the plans open over the feed, without leaving it', async () => {
    await openReels();
    const before = router.state.location.pathname;
    const watching = visibleReel();

    await tap(await waitFor(() => railButton('comment'), 'the comment button', 15000));
    await waitFor(sheet, 'the plans sheet', 6000);

    assert(
      router.state.location.pathname === before,
      `opening the plans navigated to ${router.state.location.pathname}`,
    );
    assert(feedIsMounted(), 'the feed was torn down behind the sheet');

    await closeSheet();

    assert(router.state.location.pathname === before, 'closing the sheet left the feed');
    const after = visibleReel();
    assert(after === watching, `came back to reel ${after}, was watching ${watching}`);
    return `stayed on ${before}, still reel ${watching}`;
  });

  await test('the sheet covers most of the screen and sits above the nav', async () => {
    await openReels();
    await tap(await waitFor(() => railButton('comment'), 'the comment button', 15000));
    const el = await waitFor(sheet, 'the plans sheet', 6000);

    const card = el.querySelector('[data-flipstar-sub-card]');
    assert(card, 'no sheet card');

    // Let the entry animation land before measuring. It starts at
    // translateY(18px), and measuring mid-flight reports the sheet as
    // hanging exactly 18px past the bottom of the overlay -- a moving sheet,
    // not a misplaced one.
    await waitFor(
      () => {
        const t = getComputedStyle(card).transform;
        return t === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t);
      },
      'the sheet to finish arriving',
      3000,
    );

    const box = card.getBoundingClientRect();
    // Measured against the overlay, not window.innerHeight: the overlay is
    // `position: fixed; inset: 0`, so it *is* the viewport the sheet is laid
    // out in, while innerHeight disagrees with it under the device-metrics
    // emulation this harness drives Chrome with.
    const overlay = el.getBoundingClientRect();
    const geometry = `card ${Math.round(box.top)}..${Math.round(box.bottom)} (${Math.round(box.height)}px) in overlay ${Math.round(overlay.top)}..${Math.round(overlay.bottom)}`;
    assert(box.height > overlay.height * 0.4, `the sheet is only ${Math.round(box.height)}px tall: ${geometry}`);
    assert(box.bottom <= overlay.bottom + 1, `the sheet runs past the overlay: ${geometry}`);
    assert(box.top >= overlay.top - 1, `the sheet runs above the overlay: ${geometry}`);

    // Nothing may be painted over the sheet -- the bottom nav used to win
    // these fights by living in its own stacking context.
    const hit = document.elementFromPoint(
      Math.round(box.left + box.width / 2),
      Math.round(box.top + 8),
    );
    assert(card.contains(hit) || hit === card, `something covers the sheet: <${hit?.tagName?.toLowerCase()}>`);
    return `${Math.round((box.height / window.innerHeight) * 100)}% of the screen`;
  });

  await test('the plans are the ones a first subscription can use', async () => {
    await openReels();
    await tap(await waitFor(() => railButton('comment'), 'the comment button', 15000));
    const el = await waitFor(sheet, 'the plans sheet', 6000);
    await sleep(600);

    const text = (el.innerText || '').replace(/\s+/g, ' ');
    assert(/Daily/i.test(text), `no Daily plan in: "${text.slice(0, 160)}"`);
    assert(!/OnDemand/i.test(text), 'on-demand was offered as a first subscription');
    return 'Daily, Weekly, Monthly';
  });

  // ── a way back in for somebody who already pays ──────────────────────────

  const loginButton = () =>
    Array.from(sheet()?.querySelectorAll('button') || []).find(
      (b) => (b.textContent || '').trim().toLowerCase() === 'log in',
    );

  await test('signed out, the sheet offers a way to log in', async () => {
    await openReels({ signedIn: false });
    await tap(await waitFor(() => railButton('comment'), 'the comment button', 15000));
    const el = await waitFor(sheet, 'the plans sheet', 6000);
    await sleep(400);

    const button = loginButton();
    assert(button, `no Log in button; sheet reads: "${(el.innerText || '').replace(/\s+/g, ' ').slice(0, 160)}"`);
    assert(/already subscribed/i.test(el.innerText || ''), 'the prompt does not say who it is for');
    return 'offered';
  });

  await test('signed out, Log in leaves the plans and goes to the login form', async () => {
    await openReels({ signedIn: false });
    await tap(await waitFor(() => railButton('comment'), 'the comment button', 15000));
    await waitFor(sheet, 'the plans sheet', 6000);
    await sleep(400);

    await tap(loginButton());
    await waitFor(() => !sheet(), 'the sheet to close', 5000);
    await waitFor(
      () => router.state.location.pathname === '/login',
      () => `the login route; at ${router.state.location.pathname}`,
      6000,
    );
    return 'reached /login with the sheet closed';
  });

  await test('signed in, there is nothing to log in to', async () => {
    await openReels({ signedIn: true });
    await tap(await waitFor(() => railButton('comment'), 'the comment button', 15000));
    const el = await waitFor(sheet, 'the plans sheet', 6000);
    await sleep(400);

    assert(!loginButton(), 'a signed-in viewer was asked to log in');
    assert(!/already subscribed/i.test(el.innerText || ''), 'the login prompt showed while signed in');
    return 'no login prompt';
  });

  await test('Escape closes the sheet', async () => {
    await openReels();
    await tap(await waitFor(() => railButton('comment'), 'the comment button', 15000));
    await waitFor(sheet, 'the plans sheet', 6000);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => !sheet(), 'the sheet to close on Escape', 4000);
    return 'closed';
  });

  await test('no uncaught errors from the page', async () => {
    assert(!pageErrors.length, pageErrors.join('\n'));
  });

  if (root) root.unmount();
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
}

run().catch(async (e) => {
  results.push({ name: 'harness', ok: false, detail: String((e && e.stack) || e) });
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
});
