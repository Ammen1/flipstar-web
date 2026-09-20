/**
 * The FAQ modal on the Settings page, driven the way a person drives it:
 * real taps through the DevTools protocol (run.mjs, /__input), so the
 * browser hit-tests them and produces the touch -> mouse -> click sequence a
 * phone does.
 *
 * CxQMD's telebirr test report found the FAQ menu 'not functioning'. The
 * flow a user follows is Profile -> Settings -> 'Frequently Asked Questions'
 * (the FAQ row) -> the list of questions -> a question's answer (accordion).
 * This suite drives exactly that:
 *
 *   opening    the FAQ row opens the modal with every question listed
 *   accordion  tapping a question reveals its answer; tapping again hides it
 *   closing    the X and the backdrop each dismiss the modal back to Settings
 *   surface    the failure the report saw: no error, but no modal either
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { LanguageProvider } from '../../contexts/LanguageContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { BlockProvider } from '../../contexts/BlockContext';

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

// The providers main.jsx puts around the app.
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

const settingsRow = (name) => document.querySelector(`[data-settings-row="${name}"]`);
const faqModal = () => Array.from(document.querySelectorAll('#root div')).find((d) => {
  const s = d.getAttribute('style') || '';
  return s.includes('position: fixed') && s.includes('z-index: 9999') && d.innerText?.includes('FAQ');
});
// The FAQ modal's backdrop closes it; the app's X button has no aria-label, so
// the closest button inside the modal is the reliable close target instead.
const closeFaq = async () => {
  const overlay = faqModal();
  if (overlay) overlay.click();
  await waitFor(() => !faqModal() && !questionsRendered(), 'the FAQ modal to close', 4000);
};

// The first FAQ question ("What is FlipStar?") is a litmus: if any of its
// answer text ever renders, the accordion revealed it.
const answerOfFirst = 'FlipStar is a premium, subscription-based gamified social media platform';
const questionsRendered = () => pageText().includes('What is FlipStar?');
const allQuestionsRender = () => pageText().includes('Who can use FlipStar?') && pageText().includes('How do I subscribe to FlipStar?');
const firstAnswerVisible = () => pageText().includes(answerOfFirst);

async function openSettings() {
  const [{ router }, { RouterProvider }] = await Promise.all([
    import('../../router'),
    import('react-router-dom'),
  ]);
  mount(<RouterProvider router={router} />);
  await router.navigate('/profile');
  await waitFor(() => router.state.location.pathname === '/profile', 'the profile page', 10000);
  await router.navigate('/settings');
  await waitFor(() => router.state.location.pathname === '/settings', 'the settings page', 10000);
  await waitFor(() => settingsRow('frequently-asked-questions'), 'the FAQ row', 15000);
  await sleep(300);
  return router;
}

async function run() {
  await log('— the FAQ flow on the Settings page —');

  let router = await openSettings();

  await test('the FAQ row opens the FAQ modal with the question list', async () => {
    await tapFaqRow();
    try {
      await waitFor(questionsRendered, 'the FAQ modal', 6000);
    } catch (e) {
      const fixed = Array.from(document.querySelectorAll('#root div')).filter((d) => (d.getAttribute('style') || '').includes('position: fixed'));
      await log(`after tap: ${fixed.length} fixed overlays; texts: ${fixed.map((d) => d.innerText?.slice(0, 60)).join(' | ').slice(0, 300)}`);
      throw e;
    }
    assert(allQuestionsRender(), 'not every question is listed');
    await closeFaq();
    return `${faqModal() ? 'modal' : 'question'} text visible`;
  });

  await test('a sibling row (Wallet) still navigates from Settings', async () => {
    const before = router.state.location.pathname;
    const wallet = await waitFor(() => settingsRow('wallet'), 'the wallet row', 8000);
    wallet.scrollIntoView({ block: 'center' });
    await sleep(300);
    await tap(wallet);
    const landed = await waitFor(
      () => (router.state.location.pathname !== '/settings' ? router.state.location.pathname : null),
      'the wallet row to navigate',
      8000,
    );
    assert(landed === '/wallet', `went to ${landed}`);
    router.navigate('/settings');
    await waitFor(() => router.state.location.pathname === '/settings', 'Settings again', 8000);
    return `reached ${landed}`;
  });

  await test('a modal-opening sibling row (Change PIN) still opens its modal', async () => {
    // After the Wallet test round-tripped through /wallet, Settings may still
    // be settling; a stale duplicate of the page can sit in the DOM first,
    // so pick the laid-out copy rather than the first querySelector match.
    let pin = null;
    const laidOut = () => Array.from(document.querySelectorAll('[data-settings-row="change-pin"]')).find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) || null;
    await log(`change-pin matches: ${Array.from(document.querySelectorAll('[data-settings-row="change-pin"]')).map((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.top)}`; }).join(' | ') || 'none'}`);
    await waitFor(() => (pin = laidOut()), 'the change-pin row (laid out)', 8000);
    // React may have replaced the node since lookup (scroll re-render); re-query
    // right before measuring so the tap targets live geometry.
    pin = laidOut();
    pin.scrollIntoView({ block: 'center' });
    await sleep(300);
    pin = laidOut();
    const r = pin.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    await log(`change-pin rect: ${JSON.stringify({ top: Math.round(r.top), bottom: Math.round(r.bottom) })} hit: ${hit && (hit.tagName + '.' + (hit.innerText || hit.textContent || '').slice(0, 30))}`);
    await tap(pin);
    await waitFor(() => pageText().includes('Current PIN'), 'the Change PIN modal', 5000);
    // close it: the password sheet's backdrop closes on click
    const backdrop = document.querySelector('#root [style*="z-index: 4500"]');
    if (backdrop) backdrop.click();
    else document.body.click();
    await sleep(300);
    await waitFor(() => !pageText().includes('Current PIN'), 'the Change PIN modal to close', 4000);
    return 'Change PIN modal opened and closed';
  });

  const firstQuestion = () => Array.from(document.querySelectorAll('button')).find((b) => b.innerText?.trim() === 'What is FlipStar?');

  // Watch the DOM continuously so a modal that flashes open-then-closed is
  // still seen, and log exactly when a fixed z-9999 overlay appears.
  function watchFAQ(sampleMs) {
    const seen = [];
    return new Promise((resolve) => {
      const t0 = performance.now();
      const iv = setInterval(() => {
        const el = faqModal();
        if (el) seen.push(performance.now() - t0);
        if (performance.now() - t0 > sampleMs) {
          clearInterval(iv);
          resolve({ seen, samples: Math.round(sampleMs / 50) });
        }
      }, 50);
    });
  }

  // Scroll the row into view the way a user reaching for the bottom of the
  // Settings list does; then tap it (the reported failure was the FAQ menu
  // "not functioning").
  async function tapFaqRow() {
    let row = await waitFor(() => settingsRow('frequently-asked-questions'), 'the FAQ row', 15000);
    row.scrollIntoView({ block: 'center' });
    await sleep(300);
    const r = row.getBoundingClientRect();
    await log(`FAQ row rect: ${JSON.stringify({ top: r.top, bottom: r.bottom, h: window.innerHeight })}`);
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    await log(`FAQ row hit: ${hit && (hit.tagName + '.' + (hit.className || '') + ' text=' + (hit.innerText || hit.textContent || '').slice(0, 40))}`);
    assert(r.bottom <= window.innerHeight, 'the FAQ row is still off-screen');

    if (localStorage.getItem('faqProbe') === null && !window.__faqProbeDone) {
      window.__faqProbeDone = true;
      // Inspect the React fiber on the row so we know what the click binds to.
      const key = Object.keys(row).find((k) => k.startsWith('__reactProps$'));
      if (key) {
        const props = row[key];
        await log(`FAQ row react props: onClick=${typeof props.onClick} dataSettingsRow=${String(props.dataset ? props.dataset.settingsRow : props['data-settings-row'])}, dataset=${JSON.stringify(props.dataset || {})}`);
      } else {
        await log('FAQ row has NO react props key (not React-managed?)');
      }
      // Call what React bound to the row directly -- no native event at all.
      const propsKey = Object.keys(row).find((k) => k.startsWith('__reactProps$'));
      if (propsKey) {
        try {
          const click = row[propsKey].onClick;
          await log(`FAQ onClick source: ${click.toString().slice(0, 120)}`);
          await click();
          await sleep(500);
          await log(`direct React onClick opened the FAQ modal: ${!!faqModal() || pageText().includes('What is FlipStar?')}`);
          const fixedEls = Array.from(document.querySelectorAll('*')).filter((d) => {
            const cs = getComputedStyle(d);
            return cs.position === 'fixed' && d.innerText?.trim();
          });
          await log(`after direct onClick, fixed elements: ${fixedEls.length} -> ${fixedEls.map((d) => `${d.tagName}[${d.getAttribute('data-settings-row') || ''}] "${(d.innerText || '').slice(0, 40)}"`).join(' | ').slice(0, 300)}`);
          const faqText = document.querySelector('#root')?.innerHTML?.includes('What is FlipStar?');
          await log(`#root innerHTML contains question text: ${faqText}`);
        } catch (e) {
          await log(`direct React onClick threw: ${e && e.message}`);
        }
      }
      // Synthetic click: does a native click trigger React's delegated handler?
      row.click();
      await sleep(500);
      const opened = !!faqModal() || pageText().includes('What is FlipStar?');
      await log(`synthetic row.click opened the FAQ modal: ${opened}`);
      if (opened) {
        // close it again so the flow is fresh for the real tap below. The
        // backdrop closes the modal, so synthetic-click it (real tap below or
        // the harness's probe-tap would otherwise hit the backdrop and close).
        const overlay = faqModal();
        if (overlay) overlay.click();
      }
      // The probe must leave the page modal-free, or the backdrop will swallow
      // the real tap below. Wait until it is really gone.
      await waitFor(() => !faqModal() && !questionsRendered(), 'the probe modal to finish closing', 3000);
      await log('probe left the FAQ modal closed');
      // The probe's open/close re-rendered SettingsPage, so the `row` we hold
      // may be a stale node (dead rect for the real tap). Re-query the live
      // node and re-scroll it, without navigating (route transitions race the
      // tap).
      row = settingsRow('frequently-asked-questions');
      row.scrollIntoView({ block: 'center' });
      await sleep(300);
    }
    const clicks = [];
    const probe = (e) => clicks.push(`${e.target.tagName}.${(e.target.className || '')} text=${(e.target.innerText || e.target.textContent || '').slice(0, 20)}`);
    row.addEventListener('click', probe, { once: false });
    const seen = watchFAQ(3000);
    await tap(row);
    const { seen: seenDuring } = await seen;
    await sleep(300);
    row.removeEventListener('click', probe);
    await log(`clicks captured on the FAQ row: ${JSON.stringify(clicks)}; %d overlay samples in 3s: ${seenDuring.length}`);
  }

  await test('tapping a question reveals its answer (accordion)', async () => {
    if (!questionsRendered()) {
      const row = await waitFor(() => settingsRow('frequently-asked-questions'), 'the FAQ row (accordion)', 8000);
      row.scrollIntoView({ block: 'center' });
      await sleep(300);
      await tap(row);
    }
    await waitFor(questionsRendered, 'the FAQ modal', 6000);
    const q = await waitFor(firstQuestion, 'the first FAQ question button', 4000);
    await tap(q);
    await waitFor(firstAnswerVisible, 'the answer under the first question', 4000);
    return 'answer revealed';
  });

  await test('tapping the question again hides the answer', async () => {
    await waitFor(questionsRendered, 'the FAQ modal', 6000);
    await waitFor(firstAnswerVisible, 'the answer to toggle off', 4000);
    await tap(firstQuestion());
    await waitFor(() => !firstAnswerVisible(), 'the answer to hide', 4000);
    return 'answer hidden';
  });

  await test('the X closes the FAQ modal and stays on Settings', async () => {
    await waitFor(questionsRendered, 'the FAQ modal', 6000);
    // The app's X button has no aria-label, so find it inside the modal: it is
    // the button right beside the "FAQ" heading, i.e. the only one that is not
    // a question row.
    const q1 = firstQuestion();
    const x = Array.from(document.querySelectorAll('#root button')).find(
      (b) => faqModal()?.contains(b) && b !== q1,
    );
    assert(x, 'no X button in the FAQ modal');
    await tap(x);
    await waitFor(() => !questionsRendered(), 'the FAQ modal to close', 4000);
    assert(router.state.location.pathname === '/settings', 'closing the FAQ left Settings');
    return 'modal closed, still on Settings';
  });

  await test('a fresh visit to Settings opens the modal again (row not stale)', async () => {
    await tapFaqRow();
    await waitFor(questionsRendered, 'the FAQ modal to reopen', 6000);
    assert(allQuestionsRender(), 'the full list did not render on reopen');
    return 'modal reopened';
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