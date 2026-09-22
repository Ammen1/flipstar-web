/**
 * The sign-in screens a subscriber arriving from the telebirr SuperApp sees
 * (see run.mjs), at the phone size they were reported at.
 *
 * The bug these exist for: the screen that asks for the SMS code and a new
 * PIN was not an overlay at all. It rendered inline with `minHeight: 100vh`,
 * so the ordinary login form sat directly underneath it -- scrolling down
 * from the OTP boxes landed on a second login page. Nothing in the DOM was
 * missing or wrong to look at; the page was simply taller than it should have
 * been, which is why these measure geometry and scroll the page rather than
 * checking for text.
 *
 *   covers      the login form behind is not reachable by scrolling
 *   holds still the page underneath does not move while a sheet is open
 *   reads       the heading says what the screen is for, not "Subscription
 *               Renewed", which is what it used to tell anybody who already
 *               had an account
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { SubscriptionRegisterModal } from '../../components/auth/SubscriptionRegisterModal';

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

const host = () => document.getElementById('root');
const pageText = () => (document.body.innerText || '').replace(/\s+/g, ' ');

async function viewport(box) {
  await fetch('/__input', { method: 'POST', body: JSON.stringify({ kind: 'viewport', ...box }) });
}

let root = null;

/** The page the subscriber was on, with the sign-in screen opened over it. */
function mount({ existingUser = true } = {}) {
  if (!root) root = createRoot(host());
  root.render(
    <ThemeProvider>
      <LanguageProvider>
        <>
          {/* Stands in for the login page underneath: the same "Welcome /
              Log in to continue to FlipStar" block, long enough to scroll. */}
          <div data-page-behind style={{ minHeight: '200vh', padding: 24, background: '#0D0D0D' }}>
            <h1 style={{ color: '#fff' }}>Welcome</h1>
            <p style={{ color: '#aaa' }}>Log in to continue to FlipStar</p>
            <button type="button" data-behind-login style={{ padding: 12 }}>Log In</button>
          </div>
          <SubscriptionRegisterModal
            prefillPhone="251911528271"
            existingUser={existingUser}
            fromTelebirr
            onSuccess={() => {}}
            onBackToLogin={() => {}}
          />
        </>
      </LanguageProvider>
    </ThemeProvider>,
  );
}

const overlay = () => document.querySelector('[data-signin-screen]');

async function run() {
  await log('— SuperApp sign-in at phone width —');
  await viewport({ width: 390, height: 780, mobile: true });
  mount();
  await sleep(400);

  await test('the sign-in screen covers the page it was opened from', async () => {
    const fixed = overlay();
    assert(fixed, 'the sign-in screen is missing');
    assert(
      getComputedStyle(fixed).position === 'fixed',
      'the screen renders in the page flow, not over it',
    );

    const box = fixed.getBoundingClientRect();
    assert(box.top <= 0 && box.left <= 0, `overlay starts at ${box.top},${box.left}`);
    assert(
      box.width >= window.innerWidth && box.height >= window.innerHeight,
      `overlay is ${Math.round(box.width)}x${Math.round(box.height)} in ${window.innerWidth}x${window.innerHeight}`,
    );

    const opaque = getComputedStyle(fixed).backgroundColor;
    assert(!/rgba\(.*,\s*0(\.\d+)?\)/.test(opaque), `the backdrop is see-through: ${opaque}`);
    return `${Math.round(box.width)}x${Math.round(box.height)} over the page`;
  });

  await test('the login form behind cannot be scrolled into view', async () => {
    window.scrollTo(0, 2000);
    await sleep(250);

    const behindLogin = document.querySelector('[data-behind-login]');
    assert(behindLogin, 'the stand-in page is missing');

    const seen = behindLogin.getBoundingClientRect();
    const covered =
      seen.bottom < 0 ||
      seen.top > window.innerHeight ||
      !document.elementFromPoint(
        Math.max(0, Math.min(window.innerWidth - 1, seen.left + seen.width / 2)),
        Math.max(0, Math.min(window.innerHeight - 1, seen.top + seen.height / 2)),
      )?.closest('[data-behind-login]');

    assert(covered, 'the login button behind is reachable -- two screens at once');
    return 'the page behind stays behind';
  });

  await test('the page underneath is held still while this is open', async () => {
    assert(
      getComputedStyle(document.body).overflow === 'hidden',
      `body overflow is ${getComputedStyle(document.body).overflow}`,
    );
    assert(
      getComputedStyle(document.documentElement).overflow === 'hidden',
      'the documentElement still scrolls, which is what iOS moves',
    );
    return 'html and body locked';
  });

  await test('it says what the screen is for, not that a subscription renewed', async () => {
    const text = pageText();
    assert(!/Subscription Renewed/i.test(text), 'still claims the subscription was renewed');
    assert(/Verify & Set Your PIN/i.test(text), `heading reads: ${text.slice(0, 80)}`);
    assert(/code we sent by SMS/i.test(text), 'no explanation of what the code is');
    assert(/\+251 911528271/.test(text), 'does not say which number the code went to');
    return 'Verify & Set Your PIN';
  });

  await test('it says what is still missing before Login works', async () => {
    const hint = document.querySelector('[data-submit-hint]');
    assert(hint, 'the button gives no reason for being grey');
    assert(/6-digit code/i.test(hint.innerText), `hint reads: ${hint.innerText}`);
    return hint.innerText.trim().slice(0, 40);
  });

  await test('the six code boxes fit the screen', async () => {
    // The code boxes take one character each; the phone and PIN fields do not.
    const boxes = Array.from(document.querySelectorAll('[data-signin-screen] input[maxlength="1"]'));
    assert(boxes.length === 6, `${boxes.length} code boxes`);

    for (const box of boxes) {
      const r = box.getBoundingClientRect();
      assert(r.width >= 32 && r.height >= 40, `a code box is ${Math.round(r.width)}x${Math.round(r.height)}`);
      assert(r.left >= 0 && r.right <= window.innerWidth + 1, 'a code box runs off the side');
    }
    return `6 boxes, ${Math.round(boxes[0].getBoundingClientRect().width)}px wide`;
  });

  await test('a new account is asked to register, not told it renewed', async () => {
    mount({ existingUser: false });
    await sleep(300);

    const text = pageText();
    assert(/Complete Registration/i.test(text), `heading reads: ${text.slice(0, 80)}`);
    assert(!/Subscription Renewed/i.test(text), 'claims a renewal to a brand-new account');
    return 'Complete Registration';
  });

  await test('no uncaught errors from the page', async () => {
    assert(!pageErrors.length, pageErrors.join(' | '));
  });

  await viewport({ reset: true });
  if (root) root.unmount();
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
}

run().catch(async (e) => {
  results.push({ name: 'the harness itself', ok: false, detail: String((e && e.stack) || e) });
  await fetch('/__results', { method: 'POST', body: JSON.stringify({ tests: results }) });
});
