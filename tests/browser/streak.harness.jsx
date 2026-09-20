/*
 * The Daily Streak feature on the Profile page, driven the way a person
 * drives it: a real tap through the DevTools protocol (run.mjs /__input).
 *
 * CxQMD's telebirr test report found the Daily Streak did not tell customers
 * what reward they receive. The backend truth (api/views/gamification.py,
 * api/services/subscription_gift.py): the login bonus is over -- the streak is
 * frozen, bonus_available is false, and the only coins granted on a daily
 * cadence are the per-charge gift on an active plan. This suite pins what the
 * profile actually displays against that truth:
 *
 *   streak      the header flame shows the current streak from the API
 *   reward      the modal names the real reward and how it arrives, and never
 *               shows a made-up "claim" amount or a claim button
 *   twotier     no streak reward: bonus_available false -> nothing claimable
 *   giftless    an active plan with a zero gift says "no coins", not a figure
 *
 * The stub API in run.mjs serves the same shape the backend returns, with
 * charge_gift_coins driven per-test through /__streak/gift so the suite can
 * change the plan's gift and watch the panel follow it -- the check that the
 * displayed reward matches the backend reward.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { BlockProvider } from '../../contexts/BlockContext';
import api from '../../api';

// ── plumbing ────────────────────────────────────────────────────────────────

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
      const label = typeof what === 'function' ? what() : what;
      throw new Error(`timed out waiting for ${label}; page shows: "${pageText().slice(0, 200)}"`);
    }
    await sleep(50);
  }
}

// Real input (run.mjs /__input).
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

// ── the page ────────────────────────────────────────────────────────────────

localStorage.setItem('authToken', 'e2e-token');
const me = { id: 1, username: 'e2e_author' };
localStorage.setItem('user', JSON.stringify(me));

const pageCss = document.createElement('style');
pageCss.textContent = 'html, body { margin:0; padding:0; width:100%; height:100%; overflow-x:hidden; } #root { width:100%; height:100%; }';
document.head.appendChild(pageCss);
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

// The revealed "Daily Streak" panel and its headline pieces.
const streakModalText = () => pageText();
const rewardLabelVisible = () => pageText().includes('Your reward');
const closeStreakModal = async () => {
  const overlay = document.querySelector('#root [style*="z-index: 4000"]');
  if (overlay) overlay.click();
  await waitFor(() => !rewardLabelVisible(), 'the streak modal to close', 4000);
};

async function openStreakModal() {
  await waitFor(() => rewardLabelVisible(), 'the streak modal (via header flame)', 10000);
  await sleep(200);
  return streakModalText();
}

let router = null;

async function openProfile() {
  if (!router) {
    const [{ router: r }, { RouterProvider }] = await Promise.all([
      import('../../router'),
      import('react-router-dom'),
    ]);
    router = r;
  }
  const { RouterProvider } = await import('react-router-dom');
  mount(<RouterProvider router={router} />);
  await router.navigate('/profile');
  await waitFor(() => router.state.location.pathname === '/profile', 'the profile page', 10000);
  await waitFor(() => document.querySelector('button[title="Daily Streak"]'), 'the Daily Streak flame', 15000);
  await sleep(300);
}

// Rebuild the whole page so a changed subscription payload is re-fetched and
// every interaction starts from a fresh DOM (no stale duplicate nodes).
async function remount() {
  await openProfile();
}

async function setGift(gift) {
  await fetch(`/__streak/gift?value=${gift}`).then((r) => r.json());
  // The subscription-status GET is cached for 60s by api.js; without clearing
  // the cache the panel would replay the previous gift after a remount.
  api.setAuthToken(localStorage.getItem('authToken'));
}

async function run() {
  await log('— the Daily Streak feature on the Profile page —');

  await openProfile();
  await tap(document.querySelector('button[title="Daily Streak"]'));
  let text = await openStreakModal();

  await test('the streak panel displays the current streak from the API', async () => {
    // run.mjs serves login_streak.current=5, longest=12 to this suite.
    assert(/5\s*Day Streak/.test(text.replace(/\s+/g, ' ')), `current streak "5" not shown: "${text.slice(0, 300)}"`);
    assert(text.includes('Best: 12 days'), `longest streak not shown: "${text.slice(0, 300)}"`);
    return 'shows "5" and "Best: 12 days"';
  });

  await test('the reward shown is the backend per-charge gift, not a made-up claim', async () => {
    // The suite's subscription stub credits 3 coins per charge. The panel must
    // name that figure from the API -- not show a claim button or an invented
    // amount.
    assert(text.includes('3 coins'), `the real gift amount is missing: "${text.slice(0, 400)}"`);
    assert(text.includes('Daily Streak'), 'the modal is the Daily Streak');
    assert(!/\b[1-9][0-9]* coins?\/day\b/.test(text), 'no per-day claim amount is invented');
    const claimBtn = Array.from(document.querySelectorAll('#root button')).find(
      (b) => /claim/i.test(b.innerText || ''),
    );
    assert(!claimBtn, 'there is a Claim button even though bonus_available is false');
    return 'shows the 3-coins-per-charge gift, nothing claimable';
  });

  await closeStreakModal();
  await setGift(0);

  await test('a plan that credits no coins is reported as zero, not invented', async () => {
    await remount();
    await tap(document.querySelector('button[title="Daily Streak"]'));
    const t = await openStreakModal();
    assert(t.includes('no coins per charge'), `zero-gift plan did not say so: "${t.slice(0, 400)}"`);
    assert(!/\b[1-9][0-9]* coins\b/.test(t), 'a figure was invented for a zero-gift plan');
    return 'routes share no coins and no claim';
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