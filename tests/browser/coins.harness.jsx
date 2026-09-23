/**
 * The Buy Coins page, and the custom amount on it.
 *
 * The arithmetic is pinned by tests/coinPricing.test.js. What cannot be
 * checked there is whether the page is wired to it: that the rate arrives from
 * /wallet/config/ rather than being built in, that a figure appears as
 * somebody types, that Continue stays dead until the amount is one the server
 * would accept, and that the whole thing is usable at phone width -- the input
 * and the button hit-tested where a thumb would land, not merely present in
 * the DOM.
 *
 * The packages this stub serves are the staging ones, so 5 Birr must read 50
 * Coins here for the same reason it does on the server: 10 coins per Birr,
 * stated by the packages themselves.
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

/** Scroll an element into view and let the scroll settle.
 *  The custom card is below the package grid, so its coordinates are off the
 *  bottom of the viewport until this runs -- a tap there hits nothing and
 *  elementFromPoint returns null. */
async function bringIntoView(el) {
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  await sleep(350);
  return el;
}

/** Type into a React-controlled input the way the runtime notices. */
function typeInto(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

localStorage.setItem('authToken', 'e2e-token');
localStorage.setItem('user', JSON.stringify({ id: 1, username: 'e2e_buyer' }));

let root = null;
function mount(element) {
  if (root) root.unmount();
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

const amountInput = () => document.getElementById('bc-custom-amount');
const messageBox = () => document.getElementById('bc-custom-msg');
const continueBtn = () =>
  Array.from(document.querySelectorAll('button')).find(
    (b) => (b.textContent || '').trim() === 'Continue to Buy',
  );

async function run() {
  await log('— Buy Coins: the custom amount —');

  history.replaceState(null, '', '/buy-coins');
  const [{ router }, { RouterProvider }] = await Promise.all([
    import('../../router'),
    import('react-router-dom'),
  ]);

  async function openPage() {
    mount(<RouterProvider router={router} />);
    if (router.state.location.pathname !== '/buy-coins') await router.navigate('/buy-coins');
    await waitFor(amountInput, 'the custom amount field', 20000);
    await sleep(300);
  }

  async function enter(value) {
    const el = amountInput();
    typeInto(el, value);
    await sleep(250);
    return el;
  }

  await test('the predefined packages are still there', async () => {
    await openPage();
    const text = pageText();
    // The cards are priced, not named: "100 COINS ... 10 ETB".
    for (const figure of ['100', '10 ETB', '275', '25 ETB']) {
      assert(text.includes(figure), `no "${figure}" on the page: "${text.slice(0, 160)}"`);
    }
    assert(document.querySelectorAll('.bc-card').length >= 3, 'the package cards are gone');
    return 'packages intact';
  });

  await test('5 Birr reads 50 Coins, from the rate the API sent', async () => {
    await openPage();
    await enter('5');

    const shown = (messageBox().innerText || '').replace(/\s+/g, ' ').trim();
    assert(/50/.test(shown), `expected 50 coins, got "${shown}"`);
    assert(/Coins/i.test(shown), `no coin label in "${shown}"`);
    // The box holds the figure and nothing else. Moving the card above the
    // packages once spliced the whole package grid inside it, and every
    // assertion here still passed because they were all substring checks.
    assert(shown.length < 60, `the message box swallowed other content: "${shown}"`);
    assert(!/PACKAGE/i.test(shown), `the packages are inside the message box: "${shown}"`);
    return shown;
  });

  await test('the figure follows the amount as it changes', async () => {
    await openPage();
    await enter('5');
    await enter('25');

    const shown = (messageBox().innerText || '').replace(/\s+/g, ' ');
    // 25 is a package price, so the server sells that package: 275 coins with
    // its bonus. Accepting 250 here is what hid the page promising one figure
    // while the server credited another.
    assert(/275/.test(shown), `expected 275 coins for 25 Birr, got "${shown}"`);
    assert(!/250/.test(shown), `previewed the bare rate: "${shown}"`);
    return shown.trim();
  });

  await test('Continue is dead until the amount is one the server would take', async () => {
    await openPage();
    assert(continueBtn().disabled, 'enabled with an empty amount');

    await enter('0');
    assert(continueBtn().disabled, 'enabled for 0');

    await enter('abc');
    assert(continueBtn().disabled, 'enabled for letters');

    await enter('5');
    assert(!continueBtn().disabled, 'still disabled for a valid 5 Birr');
    return 'disabled until valid';
  });

  await test('an amount below the minimum says so', async () => {
    await openPage();
    await enter('0.5');

    const shown = (messageBox().innerText || '').replace(/\s+/g, ' ');
    assert(/smallest/i.test(shown), `no minimum message, got "${shown}"`);
    assert(continueBtn().disabled, 'Continue was live below the minimum');
    return shown.trim();
  });

  await test('an amount above the maximum says so', async () => {
    await openPage();
    await enter('99999');

    const shown = (messageBox().innerText || '').replace(/\s+/g, ' ');
    assert(/largest/i.test(shown), `no maximum message, got "${shown}"`);
    assert(continueBtn().disabled, 'Continue was live above the maximum');
    return shown.trim();
  });

  await test('Continue to Buy opens the summary with the amount and the coins', async () => {
    await openPage();
    await enter('5');
    await tap(await bringIntoView(continueBtn()));

    const sheet = await waitFor(
      () => document.querySelector('[role="dialog"][aria-label="Confirm purchase"]'),
      'the confirm sheet',
      6000,
    );
    const text = (sheet.innerText || '').replace(/\s+/g, ' ');
    assert(/5 Birr/.test(text), `no amount in the summary: "${text}"`);
    assert(/50/.test(text), `no coin figure in the summary: "${text}"`);
    return text.slice(0, 80);
  });

  await test('on a phone, the field and the button are reachable', async () => {
    await input({ kind: 'viewport', width: 390, height: 780, mobile: true });
    await openPage();
    await enter('5');

    for (const [label, el] of [['the amount field', amountInput()], ['Continue to Buy', continueBtn()]]) {
      await bringIntoView(el);
      const box = el.getBoundingClientRect();
      assert(box.width > 0 && box.height >= 32, `${label} is too small: ${Math.round(box.width)}x${Math.round(box.height)}`);
      assert(box.left >= 0 && box.right <= window.innerWidth + 1, `${label} runs off the side`);
      const hit = document.elementFromPoint(
        Math.round(box.left + box.width / 2),
        Math.round(box.top + box.height / 2),
      );
      assert(el === hit || el.contains(hit), `a tap on ${label} lands on <${hit?.tagName?.toLowerCase()}>`);
    }

    assert(
      document.documentElement.scrollWidth <= window.innerWidth + 1,
      'the page scrolls sideways at phone width',
    );
    await input({ kind: 'viewport', reset: true });
    return '390px wide, both reachable';
  });

  // ── what the page says when the payment does not succeed ────────────────
  //
  // The reported bug is visible only here: on the server the payment was
  // refused, and the page drew a green tick reading "Payment successful". So
  // these drive the real sheet and read the heading off the screen.

  async function startPayment() {
    await openPage();
    // A package card, by its price -- the custom-amount card is a .bc-card
    // too and sits above them, and picking it leaves nothing to continue to.
    const card = await waitFor(
      () => Array.from(document.querySelectorAll('.bc-card')).find(
        (c) => /100\s*COINS/i.test(c.innerText || ''),
      ),
      'the 100-coin package card',
    );
    await bringIntoView(card);
    await tap(card);
    await sleep(250);

    // The sticky bar's own button, not the custom card's "Continue to Buy":
    // a package was picked, so this is the one that opens the summary.
    const cont = await waitFor(
      () => Array.from(document.querySelectorAll('button.bc-primary')).find(
        (b) => (b.textContent || '').trim() === 'Continue' && !b.disabled,
      ),
      'the Continue button for the picked package',
    );
    await bringIntoView(cont);
    await tap(cont);
    await waitFor(
      () => Array.from(document.querySelectorAll('button')).find((b) => /with telebirr/.test(b.textContent || '')),
      'the telebirr button',
    );

    const method = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === 'telebirr',
    );
    if (method) { await tap(method); await sleep(150); }

    const pay = Array.from(document.querySelectorAll('button')).find(
      (b) => /with telebirr/.test(b.textContent || ''),
    );
    await tap(pay);

    // The confirm sheet animates in, and a tap that lands mid-animation does
    // nothing at all -- which looks exactly like a page that never settles.
    // Waiting for the request to have been made says which of the two it is,
    // and one retry covers the animation.
    try {
      await waitFor(
        () => /check your phone/i.test(pageText()) || document.querySelector('[data-payment-tone]'),
        'the payment to start',
        4000,
      );
    } catch (_) {
      await tap(pay);
      await waitFor(
        () => /check your phone/i.test(pageText()) || document.querySelector('[data-payment-tone]'),
        'the payment to start after a second tap',
        8000,
      );
    }
  }

  async function payAndSettle(payment) {
    await fetch('/__coins/payment?' + new URLSearchParams(payment));
    await startPayment();
    // Generous: the first poll is 3s after a cold mount of the whole router.
    return waitFor(() => document.querySelector('[data-payment-tone]'), 'the result sheet', 30000);
  }

  const sheetText = () => {
    const sheet = document.querySelector('[data-payment-tone]');
    return sheet ? (sheet.closest('.bc-sheet').innerText || '').replace(/\s+/g, ' ') : '';
  };

  await test('a payment telebirr refused is not shown as successful', async () => {
    const tone = await payAndSettle({
      state: 'FAILED',
      reason: 'INSUFFICIENT_BALANCE',
      message: 'Your telebirr balance was not enough to complete this payment.',
    });

    const text = sheetText();
    assert(tone.dataset.paymentTone === 'failure', 'drawn as ' + tone.dataset.paymentTone);
    assert(!/payment successful/i.test(text), 'the sheet claims success: "' + text + '"');
    assert(/balance/i.test(text), 'no reason given: "' + text + '"');
    return text.slice(0, 60);
  });

  await test('a wrong PIN says so', async () => {
    await payAndSettle({
      state: 'FAILED',
      reason: 'WRONG_PIN',
      message: 'The PIN entered was not correct, so the payment was not completed.',
    });

    const text = sheetText();
    assert(/pin/i.test(text), 'no mention of the PIN: "' + text + '"');
    assert(!/payment successful/i.test(text), text);
    return 'PIN failure shown';
  });

  await test('a cancelled payment is called cancelled', async () => {
    const tone = await payAndSettle({
      state: 'CANCELLED',
      reason: 'USER_CANCELLED',
      message: 'The payment was cancelled, so nothing was charged.',
    });

    const text = sheetText();
    assert(tone.dataset.paymentTone === 'failure', 'drawn as ' + tone.dataset.paymentTone);
    assert(/cancel/i.test(text), 'not described as cancelled: "' + text + '"');
    assert(!/payment successful/i.test(text), text);
    return 'cancellation shown';
  });

  await test('a confirmed payment is shown as successful', async () => {
    const tone = await payAndSettle({ state: 'SUCCESS', balance: '220' });

    const text = sheetText();
    assert(tone.dataset.paymentTone === 'success', 'drawn as ' + tone.dataset.paymentTone);
    assert(/payment successful/i.test(text), 'no success message: "' + text + '"');
    return text.slice(0, 60);
  });

  await test('a payment nobody has confirmed claims nothing', async () => {
    // The state that had nowhere to go: the sheet was ok-or-not-ok, and
    // pending was drawn as ok, tick and all.
    await fetch('/__coins/payment?state=PENDING');
    await startPayment();

    await waitFor(() => /check your phone/i.test(pageText()), 'the waiting sheet');
    await sleep(2000);

    const waiting = pageText();
    assert(!/payment successful/i.test(waiting), 'claimed success while waiting: "' + waiting + '"');
    assert(!document.querySelector('[data-payment-tone]'), 'settled on a verdict it does not have');
    return 'still waiting, saying nothing it does not know';
  });

  // ── paying with airtime ─────────────────────────────────────────────────
  //
  // The option is offered only when the server says it would take the
  // payment: /wallet/config/ answers `allows_airtime` from the policy flag
  // AND the charging credentials (api/services/airtime_purchase.py). Before
  // this the page guessed from a per-package field the API never sent, so the
  // option was invisible whatever the server was configured to do.

  async function openWithAirtime(allows) {
    await fetch(`/__coins/airtime?allows=${allows}`);
    // /wallet/config/ is cached for 60s by api.js, so a second mount in the
    // same session would read the previous answer rather than the new one.
    // A real user meets this as "the change appears after a refresh".
    (await import('../../api')).default.invalidateCache('/wallet/config/');
    await openPage();
    const card = await waitFor(
      () => Array.from(document.querySelectorAll('.bc-card')).find(
        (c) => /100\s*COINS/i.test(c.innerText || ''),
      ),
      'the 10 ETB package card',
    );
    await bringIntoView(card);
    await tap(card);
    await sleep(200);

    const cont = await waitFor(
      () => Array.from(document.querySelectorAll('button.bc-primary')).find(
        (b) => (b.textContent || '').trim() === 'Continue' && !b.disabled,
      ),
      'Continue',
    );
    await bringIntoView(cont);
    await tap(cont);
    await waitFor(() => /Confirm purchase/i.test(pageText()), 'the payment sheet');
    await sleep(200);
  }

  const methodButtons = () =>
    Array.from(document.querySelectorAll('button.bc-method, button')).filter((b) =>
      /^(telebirr|Airtime balance)$/.test((b.textContent || '').trim()),
    );

  await test('airtime is not offered when the server does not take it', async () => {
    await openWithAirtime('false');

    const labels = methodButtons().map((b) => b.textContent.trim());
    assert(!labels.includes('Airtime balance'), `offered airtime anyway: ${labels.join(', ')}`);
    // One method left, so the page picks it and the button names the price.
    assert(/with telebirr/.test(pageText()), 'telebirr went missing too');
    return 'telebirr only';
  });

  await test('airtime is offered when the server takes it', async () => {
    await openWithAirtime('true');

    const labels = methodButtons().map((b) => b.textContent.trim());
    assert(labels.includes('Airtime balance'), `no airtime option: ${labels.join(', ')}`);
    assert(labels.includes('telebirr'), 'telebirr was replaced rather than joined');
    return labels.join(' + ');
  });

  await test('the 10 ETB package can be paid with airtime', async () => {
    await openWithAirtime('true');

    const airtime = methodButtons().find((b) => b.textContent.trim() === 'Airtime balance');
    assert(airtime && !airtime.disabled, 'the airtime option cannot be chosen');
    await tap(airtime);
    await sleep(200);

    const pay = Array.from(document.querySelectorAll('button')).find((b) =>
      /from airtime/.test(b.textContent || ''),
    );
    assert(pay, `no airtime pay button: ${pageText().slice(0, 140)}`);
    assert(/10/.test(pay.textContent), `the price is not 10 ETB: ${pay.textContent}`);
    return pay.textContent.trim();
  });

  await test('telebirr is unaffected either way', async () => {
    await openWithAirtime('true');
    let labels = methodButtons().map((b) => b.textContent.trim());
    assert(labels.includes('telebirr'), 'telebirr disappeared when airtime was enabled');

    // Choosing it still produces the telebirr payment button it always did.
    await tap(methodButtons().find((b) => b.textContent.trim() === 'telebirr'));
    await sleep(200);
    assert(/with telebirr/.test(pageText()), 'telebirr cannot be paid with');

    // With airtime off there is nothing to choose between, so the page skips
    // the method buttons entirely and goes straight to paying -- which is the
    // behaviour it has always had.
    await openWithAirtime('false');
    assert(
      !methodButtons().some((b) => b.textContent.trim() === 'Airtime balance'),
      'airtime is still offered after being switched off',
    );
    assert(/with telebirr/.test(pageText()), 'telebirr is not offered when alone');
    return 'telebirr offered in both';
  });

  // ── the amount decides which methods are offered ────────────────────────
  //
  //     up to 10 ETB   telebirr or airtime
  //     over 10 ETB    telebirr only
  //
  // The cap lives in utils/payMethods.js and is mirrored by
  // common/validators/payment.py, which refuses an airtime charge above it
  // whatever the page allowed.

  async function chooseCard(match) {
    const card = await waitFor(
      () => Array.from(document.querySelectorAll('.bc-card')).find(
        (c) => match.test(c.innerText || ''),
      ),
      `a card matching ${match}`,
    );
    await bringIntoView(card);
    await tap(card);
    await sleep(200);
    const cont = await waitFor(
      () => Array.from(document.querySelectorAll('button.bc-primary')).find(
        (b) => (b.textContent || '').trim() === 'Continue' && !b.disabled,
      ),
      'Continue',
    );
    await bringIntoView(cont);
    await tap(cont);
    await waitFor(() => /Confirm purchase/i.test(pageText()), 'the payment sheet');
    await sleep(200);
  }

  await test('a 25 ETB package is telebirr only, even with airtime on', async () => {
    await fetch('/__coins/airtime?allows=true');
    (await import('../../api')).default.invalidateCache('/wallet/config/');
    await openPage();
    await chooseCard(/275\s*COINS|25 ETB/);

    const labels = methodButtons().map((b) => b.textContent.trim());
    assert(!labels.includes('Airtime balance'), `airtime offered above the cap: ${labels}`);
    assert(/with telebirr/.test(pageText()), 'telebirr is not offered');
    return 'telebirr only above 10 ETB';
  });

  await test('a 10 ETB purchase by airtime sends a package and a key', async () => {
    await fetch('/__coins/requests?clear=1');
    await openWithAirtime('true');

    await tap(methodButtons().find((b) => b.textContent.trim() === 'Airtime balance'));
    await sleep(200);
    await tap(
      Array.from(document.querySelectorAll('button')).find((b) => /from airtime/.test(b.textContent || '')),
    );
    await sleep(900);

    const sent = await (await fetch('/__coins/requests')).json();
    assert(sent.length === 1, `${sent.length} airtime requests were sent`);
    const [request] = sent;
    assert(request.package_id, `no package to price the charge from: ${JSON.stringify(request)}`);
    assert(request.idempotency_key, 'no idempotency key -- a retry would charge twice');
    assert(!('coins' in request), 'the request named its own coin amount');
    return `package_id=${request.package_id}`;
  });

  await test('a custom amount with no package is not offered airtime', async () => {
    // Airtime is charged against a package row, so 7 Birr -- which is no
    // package -- cannot be priced that way however small it is.
    await fetch('/__coins/airtime?allows=true');
    (await import('../../api')).default.invalidateCache('/wallet/config/');
    await openPage();
    await enter('7');
    const cont = await waitFor(
      () => (continueBtn() && !continueBtn().disabled ? continueBtn() : null),
      'Continue to Buy',
    );
    await bringIntoView(cont);
    await tap(cont);
    await waitFor(() => /Confirm purchase/i.test(pageText()), 'the payment sheet');
    await sleep(200);

    const labels = methodButtons().map((b) => b.textContent.trim());
    assert(!labels.includes('Airtime balance'), `offered airtime for 7 Birr: ${labels}`);
    assert(/with telebirr/.test(pageText()), 'telebirr is not offered either');
    return 'telebirr only';
  });

  await test('a custom 10 Birr resolves to the package and may use airtime', async () => {
    await fetch('/__coins/airtime?allows=true');
    (await import('../../api')).default.invalidateCache('/wallet/config/');
    await openPage();
    await enter('10');
    const cont = await waitFor(
      () => (continueBtn() && !continueBtn().disabled ? continueBtn() : null),
      'Continue to Buy',
    );
    await bringIntoView(cont);
    await tap(cont);
    await waitFor(() => /Confirm purchase/i.test(pageText()), 'the payment sheet');
    await sleep(200);

    const labels = methodButtons().map((b) => b.textContent.trim());
    assert(labels.includes('Airtime balance'), `no airtime for a 10 Birr amount: ${labels}`);
    return labels.join(' + ');
  });

  await test('buying coins never asks for a code', async () => {
    // The buyer is already signed in and the charge goes to the number on
    // their own account. Asking them to prove that handset again establishes
    // nothing, so nothing here may request or verify one.
    await fetch('/__coins/otp?clear=1');
    await fetch('/__coins/airtime?allows=false');
    (await import('../../api')).default.invalidateCache('/wallet/config/');
    await openPage();
    await chooseCard(/100\s*COINS|10 ETB/);

    assert(!document.querySelector('[data-otp-step]'), 'a verification step appeared');

    const pay = Array.from(document.querySelectorAll('button')).find((b) =>
      /with telebirr/.test(b.textContent || ''),
    );
    assert(pay && !pay.disabled, 'Pay is disabled with nothing left to do');

    await fetch('/__coins/payment?' + new URLSearchParams({ status: 'success', coins: '100' }));
    await tap(pay);
    await waitFor(
      () => /check your phone/i.test(pageText()) || document.querySelector('[data-payment-tone]'),
      'the payment to start',
      8000,
    );

    const otp = await (await fetch('/__coins/otp')).json();
    assert(otp.requests.length === 0, `${otp.requests.length} codes were requested`);
    assert(otp.verifies.length === 0, `${otp.verifies.length} codes were verified`);

    const sent = await (await fetch('/__coins/requests?clear=1')).json();
    void sent;
    return 'no code requested, no code verified';
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
