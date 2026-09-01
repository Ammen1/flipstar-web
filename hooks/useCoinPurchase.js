/**
 * The coin-purchase state machine behind the top-up popup.
 *
 * Kept out of the component so the flow can be reasoned about (and tested) on
 * its own, and so the popup stays presentational.
 *
 * It deliberately talks to the endpoints that already exist:
 *
 *   GET  /coins/packages/            -> what can be bought
 *   GET  /wallet/                    -> the authoritative balance
 *   POST /wallet/telebirrUssdPurchase/ -> starts a real USSD push
 *
 * Nothing here credits coins. The server does that only when Telebirr's
 * webhook confirms the payment, so the last phase is polling the wallet until
 * the balance actually moves. That is why `awaiting` is a distinct state from
 * `working`: the request succeeded, but the money has not landed yet.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api';

// How long to wait for the webhook before telling the user to check later.
export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS = 120000;

/** Phases the popup renders. */
export const PHASE = {
  LOADING: 'loading',       // fetching balance + packages
  AUTH: 'auth',             // not signed in -- never show packages here
  READY: 'ready',           // pick a package
  WORKING: 'working',       // purchase request in flight
  AWAITING: 'awaiting',     // USSD sent, waiting for the user to approve
  SUCCESS: 'success',       // coins landed
  ERROR: 'error',           // something failed; retryable
};

function isAuthError(err) {
  const status = err && (err.status || err.statusCode);
  const code = err && (err.code || (err.data && err.data.code));
  if (status === 401) return true;
  if (code === 'AUTH_REQUIRED') return true;
  // api.js rejects with the parsed body, which does not always carry a status.
  const text = String((err && (err.error || err.detail || err.message)) || '');
  return /authentication credentials were not provided|not authenticated|invalid token/i.test(text);
}

function readBalance(wallet) {
  if (!wallet) return null;
  const b = wallet.balance;
  if (b && typeof b === 'object') return Number(b.total ?? b.balance ?? 0);
  return Number(wallet.balance ?? 0);
}

function normalizePackages(res) {
  const list = Array.isArray(res) ? res : (res && res.packages) || [];
  return list
    .map((p) => ({
      id: p.id,
      name: p.name,
      priceEtb: Number(p.price_etb ?? p.price ?? 0),
      coins: Number(p.total_coins ?? p.coin_amount ?? 0),
      bonus: Number(p.bonus_coins ?? 0),
      featured: Boolean(p.is_featured),
    }))
    .filter((p) => p.id != null && p.coins > 0)
    .sort((a, b) => a.coins - b.coins);
}

export function useCoinPurchase({ visible, requiredCoins = 0, initialBalance = null }) {
  const [phase, setPhase] = useState(PHASE.LOADING);
  const [balance, setBalance] = useState(initialBalance);
  const [packages, setPackages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('');
  const [coinsAdded, setCoinsAdded] = useState(0);

  // Balance at the moment the purchase started -- the poll compares against it.
  const baselineRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    setPhase(PHASE.LOADING);
    setMessage('');
    try {
      // Both are needed before anything can be shown, and neither depends on
      // the other, so ask for them together.
      const [pkgRes, walletRes] = await Promise.all([
        api.request('/coins/packages/'),
        api.request('/wallet/', { skipCache: true }),
      ]);
      if (!aliveRef.current) return;

      const list = normalizePackages(pkgRes);
      const bal = readBalance(walletRes);
      setPackages(list);
      setBalance(bal == null ? 0 : bal);

      // Preselect the cheapest package that actually clears the shortfall --
      // the whole point of the popup is that one tap is enough.
      const shortfall = Math.max(Number(requiredCoins || 0) - (bal || 0), 0);
      const sufficient = list.find((p) => p.coins >= shortfall);
      setSelectedId((sufficient || list[list.length - 1] || {}).id ?? null);

      setPhase(list.length ? PHASE.READY : PHASE.ERROR);
      if (!list.length) setMessage('No coin packages are available right now.');
    } catch (err) {
      if (!aliveRef.current) return;
      if (isAuthError(err)) {
        // An expired session is not a money problem: say so, and do not
        // offer packages the request would only fail on again.
        setPhase(PHASE.AUTH);
        return;
      }
      setPhase(PHASE.ERROR);
      setMessage("We couldn't load coin packages. Check your connection and try again.");
    }
  }, [requiredCoins]);

  // (Re)load each time the popup opens; a stale balance is worse than a spinner.
  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible, load]);

  // Poll for the webhook's credit while awaiting approval.
  useEffect(() => {
    if (phase !== PHASE.AWAITING) return undefined;

    let done = false;
    const check = async () => {
      if (done || !aliveRef.current) return;
      try {
        const wallet = await api.request('/wallet/', { skipCache: true });
        const current = readBalance(wallet) || 0;
        const baseline = baselineRef.current || 0;
        if (current > baseline) {
          done = true;
          setBalance(current);
          setCoinsAdded(current - baseline);
          setPhase(PHASE.SUCCESS);
          try { window.dispatchEvent(new Event('walletBalanceChanged')); } catch (_) {}
        }
      } catch (_) {
        // A failed poll is not a failed payment -- keep waiting.
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const poll = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    const timeout = setTimeout(() => {
      if (done || !aliveRef.current) return;
      done = true;
      setPhase(PHASE.ERROR);
      setMessage(
        "We haven't seen the payment yet. If you approved it, your coins will "
        + 'arrive shortly — reopen this to check.'
      );
    }, POLL_TIMEOUT_MS);

    return () => {
      done = true;
      clearInterval(poll);
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [phase]);

  const buy = useCallback(async () => {
    const pkg = packages.find((p) => p.id === selectedId);
    if (!pkg) return;

    setPhase(PHASE.WORKING);
    setMessage('');
    try {
      // Read the balance immediately before starting, so the poll compares
      // against a fresh number rather than whatever the popup opened with.
      const wallet = await api.request('/wallet/', { skipCache: true });
      baselineRef.current = readBalance(wallet) || 0;

      // Only the package id goes over the wire. The server prices it and
      // decides how many coins it is worth.
      const res = await api.request('/wallet/telebirrUssdPurchase/', {
        method: 'POST',
        body: JSON.stringify({ package_id: pkg.id }),
      });
      if (!aliveRef.current) return;

      if (res && res.success === false) {
        setPhase(PHASE.ERROR);
        setMessage(res.error || 'Payment request failed. Please try again.');
        return;
      }
      setPhase(PHASE.AWAITING);
    } catch (err) {
      if (!aliveRef.current) return;
      if (isAuthError(err)) { setPhase(PHASE.AUTH); return; }
      setPhase(PHASE.ERROR);
      setMessage(
        (err && (err.error || err.message)) || 'Payment request failed. Please try again.'
      );
    }
  }, [packages, selectedId]);

  const retry = useCallback(() => { load(); }, [load]);

  const shortfall = Math.max(Number(requiredCoins || 0) - (balance || 0), 0);

  return {
    phase,
    balance,
    packages,
    selectedId,
    setSelectedId,
    message,
    coinsAdded,
    shortfall,
    buy,
    retry,
    // True once the balance covers the action that opened the popup.
    covered: Number(requiredCoins || 0) > 0 && (balance || 0) >= Number(requiredCoins || 0),
  };
}
