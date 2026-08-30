import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { X, Zap, Clock, Wallet, AlertCircle, RefreshCw, Check, Loader2 } from "lucide-react";
import api from "../../api";
import { useLegacyT } from "../../contexts/ThemeContext";
import { useAuth } from "../../contexts/AuthContext";
import {
  BOOST_DURATIONS,
  DEFAULT_TARGETING,
  targetingKey,
  toCoins,
  resolveDurationCosts,
  formatCoins,
} from "../../constants/boostPricing";

// ── colour helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function alpha(hex, a) {
  const c = hexToRgb(hex);
  return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${a})` : hex;
}

/** pct < 0 darkens, pct > 0 lightens. Used for the CTA gradient. */
function shade(hex, pct) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct < 0 ? v : 255 - v) * pct)));
  return `rgb(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;
}

/** Readable text on top of the primary fill, whatever theme is active. */
function onPrimary(hex) {
  const c = hexToRgb(hex);
  if (!c) return '#0B1207';
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 > 0.6 ? '#0B1207' : '#FFFFFF';
}

export function BoostModal({ reelId, onClose, onSuccess }) {
  const T = useLegacyT();
  // Buying coins is a route change, not another modal — AppLayout turns this
  // flag into a /buy-coins navigation and remembers where to return to.
  const { openTopUpModal } = useAuth();

  const [config, setConfig] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(12);

  // Targeting is fixed for now; kept as state so the cost cache is already
  // keyed correctly if the targeting controls are surfaced later.
  const [targeting] = useState(DEFAULT_TARGETING);

  // { [hours]: cost } for the *current* targeting signature.
  const [calculated, setCalculated] = useState({});
  const [costsLoading, setCostsLoading] = useState(true);

  const [userCoins, setUserCoins] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState(false);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Guards against a stale response overwriting fresher state when the user
  // switches durations quickly or the balance refetches mid-flight.
  const targetingRef = useRef(targetingKey(DEFAULT_TARGETING));
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const formatBoostError = (err) => {
    const rawMessage = err?.message || 'Failed to create boost. Please try again.';
    const message = rawMessage.replace(/^\[HTTP\s+\d+\]\s+[^:]+:\s*/, '');
    const requiredMatch = message.match(/"required":\s*(\d+)/i);
    const availableMatch = message.match(/"available":\s*(\d+)/i);

    if (/Insufficient coins/i.test(message) && requiredMatch && availableMatch) {
      return `Insufficient coins. Required: ${requiredMatch[1]}, available: ${availableMatch[1]}.`;
    }

    return message;
  };

  // ── data ────────────────────────────────────────────────────────────────

  const loadBalance = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setBalanceLoading(true);
    try {
      const response = await api.request('/wallet/');
      if (!mountedRef.current) return;
      setUserCoins(toCoins(response?.balance?.total) ?? 0);
      setBalanceError(false);
    } catch (err) {
      console.error('Error loading user coins:', err);
      if (!mountedRef.current) return;
      // A failed balance read must not read as "you have 0 coins" — that would
      // push the user toward buying coins they may already own.
      setBalanceError(true);
    } finally {
      if (mountedRef.current) setBalanceLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const response = await api.request('/boost/config/');
      if (mountedRef.current) setConfig(response);
    } catch (err) {
      // Non-fatal: pricing falls back to the shared constants.
      console.error('Error loading boost config:', err);
    }
  }, []);

  // Every duration is priced up front so each card shows its real cost and
  // switching between them is instant (no request per tap, no flicker).
  const loadCosts = useCallback(async (t) => {
    const key = targetingKey(t);
    targetingRef.current = key;
    setCostsLoading(true);

    const results = await Promise.all(
      BOOST_DURATIONS.map(async (d) => {
        try {
          const response = await api.request('/boost/calculate-cost/', {
            method: 'POST',
            body: JSON.stringify({ duration_hours: d.hours, ...t }),
          });
          return [d.hours, toCoins(response?.cost)];
        } catch (err) {
          console.error(`Error calculating cost for ${d.hours}h:`, err);
          return [d.hours, null];
        }
      }),
    );

    if (!mountedRef.current || targetingRef.current !== key) return;
    const next = {};
    for (const [hours, cost] of results) if (cost !== null) next[hours] = cost;
    setCalculated(next);
    setCostsLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
    loadBalance();
  }, [loadConfig, loadBalance]);

  useEffect(() => { loadCosts(targeting); }, [targeting, loadCosts]);

  // The balance can change elsewhere (a gift, another tab, a completed
  // purchase) while this modal sits open.
  useEffect(() => {
    const refresh = () => { if (!document.hidden) loadBalance({ silent: true }); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadBalance]);

  // Lock body scroll while modal is open so the scroll-snap feed
  // behind it doesn't swipe away when the user interacts with the modal.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Escape closes, matching the backdrop tap.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── derived ─────────────────────────────────────────────────────────────

  const costs = useMemo(
    () => resolveDurationCosts({ calculated, config }),
    [calculated, config],
  );

  const boostCost = costs[selectedDuration]?.cost ?? 0;
  const balanceKnown = !balanceError && userCoins !== null;
  const shortfall = Math.max(0, boostCost - (userCoins ?? 0));
  // Exactly enough counts as enough.
  const hasEnough = balanceKnown && userCoins >= boostCost;
  const canBoost = hasEnough && !creating && !costsLoading;
  const showBuyCoins = balanceKnown && !hasEnough && !costsLoading;
  const remaining = balanceKnown ? Math.max(0, userCoins - boostCost) : null;

  // ── actions ─────────────────────────────────────────────────────────────

  const handleBuyCoins = () => {
    onClose?.();
    openTopUpModal();
  };

  const handleCreateBoost = async () => {
    // Two guards: the ref blocks a second call landing before React re-renders
    // with `creating`, the state keeps the button disabled afterwards.
    if (submittingRef.current || !canBoost) return;
    submittingRef.current = true;
    setCreating(true);
    setError('');

    try {
      const response = await api.request('/boost/campaigns/', {
        method: 'POST',
        body: JSON.stringify({
          reel_id: reelId,
          duration_hours: selectedDuration,
          ...targeting,
        }),
      });

      if (response?.success) {
        // Reflect the spend immediately, then reconcile with the server, which
        // is the authority on the resulting balance.
        setUserCoins((c) => (c === null ? c : Math.max(0, c - boostCost)));
        loadBalance({ silent: true });
        onSuccess?.(response);
      } else {
        setError(response?.error || 'Failed to create boost');
        loadBalance({ silent: true });
      }
    } catch (err) {
      console.error('Error creating boost:', err);
      setError(formatBoostError(err));
      // The backend rejects on its own balance check; resync so the UI agrees.
      loadBalance({ silent: true });
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setCreating(false);
    }
  };

  // ── theme ───────────────────────────────────────────────────────────────

  const pri = T.pri || '#8fc441';
  const txt = T.txt || '#FFFFFF';
  const sub = T.sub || 'rgba(255,255,255,0.55)';
  const card = T.cardBg || '#151515';
  const WARN = '#F5A524';
  const ink = onPrimary(pri);

  /**
   * Layout model
   * ------------
   * The sheet is a flex column with a fixed header, a scrolling middle and a
   * pinned action bar, so the title and the primary button stay reachable no
   * matter how short the viewport gets (browser chrome, small phones).
   *
   * Breakpoints follow the values already used across the project:
   *   > 640px   centred dialog, 3 duration cards across
   *   <= 640px  bottom sheet (matches ModernCommentSection), 2 cards across
   *   <= 360px  single column cards, stacked buttons
   */
  const css = `
    @keyframes bmFade { from { opacity: 0 } to { opacity: 1 } }
    @keyframes bmRise {
      from { opacity: 0; transform: translateY(16px) scale(0.97) }
      to   { opacity: 1; transform: none }
    }
    @keyframes bmSlide {
      from { transform: translateY(100%) }
      to   { transform: none }
    }
    @keyframes bmSpin { to { transform: rotate(360deg) } }

    .bm-overlay, .bm-overlay *, .bm-overlay *::before, .bm-overlay *::after {
      box-sizing: border-box;
    }
    .bm-overlay {
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      background: rgba(0,0,0,0.74);
      -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
      animation: bmFade .18s ease both;
      overflow: hidden;
      overscroll-behavior: contain;
    }

    .bm-sheet {
      display: flex; flex-direction: column;
      width: 100%; max-width: 460px;
      max-height: 90vh;
      max-height: min(90dvh, 760px);
      overflow: hidden;
      background: ${card};
      border: 1px solid ${alpha(pri, 0.16)};
      border-radius: 24px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset;
      animation: bmRise .26s cubic-bezier(0.22,1,0.36,1) both;
    }

    /* Drag handle only makes sense on the bottom sheet. */
    .bm-handle { display: none; }

    /* Header ------------------------------------------------------------- */
    .bm-head {
      flex-shrink: 0;
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; padding: 18px 16px 14px;
    }
    .bm-head-l { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
    .bm-head-txt { min-width: 0; }
    .bm-icon {
      width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, ${alpha(pri, 0.28)}, ${alpha(pri, 0.10)});
      border: 1px solid ${alpha(pri, 0.32)};
      box-shadow: 0 6px 18px ${alpha(pri, 0.18)};
    }
    .bm-title {
      font-size: 17px; font-weight: 800; color: ${txt}; letter-spacing: -0.2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bm-sub {
      font-size: 12px; color: ${sub}; margin-top: 2px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* 44px hit area, drawn smaller — the title can never collide with it. */
    .bm-x {
      flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.05); border: none; color: ${sub};
      cursor: pointer; -webkit-tap-highlight-color: transparent;
      transition: background .18s ease, color .18s ease, transform .16s ease;
    }
    .bm-x:active { transform: scale(0.92); background: rgba(255,255,255,0.12); }

    /* Scrolling middle --------------------------------------------------- */
    .bm-scroll {
      flex: 1 1 auto; min-height: 0;
      overflow-y: auto; overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      padding: 0 16px 4px;
      scrollbar-width: none;
    }
    .bm-scroll::-webkit-scrollbar { display: none; }

    /* Balance ------------------------------------------------------------ */
    .bm-balance {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; margin-bottom: 18px; padding: 12px 14px; border-radius: 14px;
      background: linear-gradient(135deg, ${alpha(pri, 0.13)}, ${alpha(pri, 0.05)});
      border: 1px solid ${alpha(pri, 0.22)};
    }
    .bm-balance-l { display: flex; align-items: center; gap: 9px; min-width: 0; }
    .bm-balance-lbl {
      font-size: 12.5px; color: ${sub}; font-weight: 600; letter-spacing: .2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bm-balance-val {
      font-size: 19px; font-weight: 800; color: ${pri}; white-space: nowrap;
      letter-spacing: -0.4px; font-variant-numeric: tabular-nums;
    }
    .bm-balance-val small { font-size: 11.5px; font-weight: 700; margin-left: 4px; opacity: .75; }
    .bm-retry {
      display: flex; align-items: center; gap: 6px; padding: 6px 0;
      background: none; border: none; cursor: pointer; text-align: right;
      color: ${WARN}; font-size: 12.5px; font-weight: 700;
      -webkit-tap-highlight-color: transparent;
    }

    /* Durations ---------------------------------------------------------- */
    .bm-label {
      display: flex; align-items: center; gap: 8px; margin-bottom: 11px;
      font-size: 11.5px; font-weight: 800; color: ${sub};
      text-transform: uppercase; letter-spacing: .8px;
    }
    .bm-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-auto-rows: 1fr;          /* every card the same height, any row */
      gap: 10px;
    }
    .bm-card {
      position: relative; overflow: hidden; min-width: 0;
      display: flex; flex-direction: column; justify-content: center; gap: 6px;
      min-height: 76px; padding: 13px 12px;
      border-radius: 15px; cursor: pointer; text-align: left;
      background: rgba(255,255,255,0.045);
      border: 1.5px solid transparent;
      -webkit-tap-highlight-color: transparent;
      transition: background .18s ease, border-color .18s ease, transform .16s ease;
    }
    .bm-card:active { transform: scale(0.97); }
    .bm-card.sel {
      background: linear-gradient(160deg, ${alpha(pri, 0.20)}, ${alpha(pri, 0.07)});
      border-color: ${pri};
      box-shadow: 0 0 0 3px ${alpha(pri, 0.13)}, 0 6px 16px ${alpha(pri, 0.16)};
    }
    .bm-card:focus-visible { outline: 2px solid ${pri}; outline-offset: 2px; }
    .bm-card-top { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .bm-card-name {
      font-size: 13px; font-weight: 700; color: ${txt}; letter-spacing: -0.1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
    }
    .bm-card-cost {
      font-size: 12px; font-weight: 700; color: ${pri};
      font-variant-numeric: tabular-nums;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bm-card-cost.short { color: ${WARN}; }
    .bm-tick {
      position: absolute; top: 7px; right: 7px;
      width: 18px; height: 18px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: ${pri}; color: ${ink};
    }

    /* Cost summary ------------------------------------------------------- */
    .bm-cost {
      margin-top: 16px; padding: 14px 16px; border-radius: 16px;
      background: linear-gradient(135deg, ${alpha(pri, 0.12)}, ${alpha(pri, 0.04)});
      border: 1px solid ${alpha(pri, 0.24)};
    }
    .bm-cost.short {
      background: linear-gradient(135deg, rgba(245,165,36,0.13), rgba(245,165,36,0.04));
      border-color: rgba(245,165,36,0.34);
    }
    .bm-cost-row {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 12px; flex-wrap: wrap;
    }
    .bm-cost-lbl { font-size: 13px; color: ${sub}; font-weight: 600; }
    .bm-cost-val {
      font-size: 20px; font-weight: 800; color: ${pri}; white-space: nowrap;
      letter-spacing: -0.5px; font-variant-numeric: tabular-nums;
    }
    .bm-cost-val small { font-size: 12px; font-weight: 700; margin-left: 4px; opacity: .75; }
    .bm-cost-note {
      display: flex; align-items: center; gap: 8px;
      margin-top: 11px; padding-top: 11px;
      border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 12.5px; font-weight: 600; line-height: 1.35;
    }
    .bm-cost-note.ok { color: ${sub}; }
    .bm-cost-note.warn { color: ${WARN}; border-top-color: rgba(245,165,36,0.24); }

    /* Error -------------------------------------------------------------- */
    .bm-err {
      display: flex; align-items: flex-start; gap: 9px;
      margin-top: 14px; padding: 12px 13px; border-radius: 12px;
      background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.42);
      color: #F87171; font-size: 12.5px; line-height: 1.45;
      overflow-wrap: anywhere;
    }

    /* Pinned actions ----------------------------------------------------- */
    .bm-actions {
      flex-shrink: 0;
      display: flex; gap: 10px;
      padding: 14px 16px calc(14px + env(safe-area-inset-bottom, 0px));
      background: ${card};
      border-top: 1px solid rgba(255,255,255,0.07);
    }
    .bm-btn {
      flex: 1 1 0; min-width: 0;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      min-height: 50px; padding: 13px 12px;
      border: none; border-radius: 14px;
      font-size: 15px; font-weight: 700; white-space: nowrap;
      cursor: pointer; -webkit-tap-highlight-color: transparent;
      transition: transform .16s ease, box-shadow .18s ease, background .18s ease;
    }
    .bm-btn:active { transform: scale(0.97); }
    .bm-ghost { background: rgba(255,255,255,0.06); color: ${txt}; }
    .bm-primary {
      background: linear-gradient(135deg, ${shade(pri, 0.12)}, ${shade(pri, -0.16)});
      color: ${ink};
      box-shadow: 0 8px 22px ${alpha(pri, 0.30)};
    }
    .bm-primary:disabled {
      background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.30);
      box-shadow: none; cursor: not-allowed; transform: none;
    }
    .bm-spin { animation: bmSpin .9s linear infinite; }

    /* Hover is for pointers only — it must never stick on a touch screen. */
    @media (hover: hover) and (pointer: fine) {
      .bm-x:hover { background: rgba(255,255,255,0.10); color: ${txt}; }
      .bm-card:hover { background: rgba(255,255,255,0.075); }
      .bm-card.sel:hover { background: linear-gradient(160deg, ${alpha(pri, 0.24)}, ${alpha(pri, 0.09)}); }
      .bm-ghost:hover { background: rgba(255,255,255,0.10); }
      .bm-primary:hover:not(:disabled) { box-shadow: 0 10px 28px ${alpha(pri, 0.40)}; }
    }

    /* ── Mobile: bottom sheet ────────────────────────────────────────────── */
    @media (max-width: 640px) {
      .bm-overlay { align-items: flex-end; padding: 0; }
      .bm-sheet {
        max-width: 100%;
        max-height: 92vh;
        max-height: 92dvh;
        border-radius: 22px 22px 0 0;
        border-left: none; border-right: none; border-bottom: none;
        animation: bmSlide .28s cubic-bezier(0.22,1,0.36,1) both;
      }
      .bm-handle {
        display: block; flex-shrink: 0;
        width: 38px; height: 4px; border-radius: 999px;
        margin: 8px auto 0;
        background: rgba(255,255,255,0.20);
      }
      .bm-head { padding: 12px 16px 14px; }
      /* Two across, the third wraps to its own row. */
      .bm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .bm-card { min-height: 80px; }
      .bm-btn { min-height: 52px; }
    }

    /* ── Very narrow phones: one column, stacked actions ─────────────────── */
    @media (max-width: 360px) {
      .bm-grid { grid-template-columns: minmax(0, 1fr); }
      /* Stacked cards laid out as rows rather than blocks — three of them at
         full card height would push the Boost Cost panel below the fold. */
      .bm-card {
        flex-direction: row; align-items: center; gap: 10px;
        min-height: 52px; padding: 11px 14px;
      }
      .bm-card-top { flex: 1 1 auto; }
      .bm-card-cost { flex-shrink: 0; }
      .bm-tick { position: static; order: 3; flex-shrink: 0; }
      /* DOM order is Cancel then primary; reversing puts the primary on top. */
      .bm-actions { flex-direction: column-reverse; gap: 8px; padding: 11px 16px calc(11px + env(safe-area-inset-bottom, 0px)); }
      .bm-title { font-size: 16px; }
      .bm-sub { font-size: 11.5px; }
      /* Tightened so the Boost Cost summary still lands above the fold once
         the actions are stacked. */
      .bm-balance { padding: 10px 12px; margin-bottom: 14px; }
      .bm-label { margin-bottom: 9px; }
      .bm-grid { gap: 8px; }
      .bm-cost { margin-top: 12px; padding: 12px 14px; }
      .bm-cost-val { font-size: 18px; }
      .bm-btn { min-height: 48px; font-size: 14.5px; }
    }

    /* ── Short viewports (landscape phones) ──────────────────────────────── */
    @media (max-height: 520px) {
      .bm-sheet { max-height: 100vh; max-height: 100dvh; border-radius: 0; }
      .bm-icon { width: 38px; height: 38px; }
      .bm-card { min-height: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .bm-overlay, .bm-sheet { animation: none; }
      .bm-card, .bm-btn, .bm-x { transition: none; }
      .bm-card:active, .bm-btn:active, .bm-x:active { transform: none; }
      .bm-spin { animation: none; }
    }
  `;

  return (
    <div
      className="bm-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <style>{css}</style>

      <div className="bm-sheet" role="dialog" aria-modal="true" aria-label="Boost your post">
        <span className="bm-handle" aria-hidden="true" />

        {/* Header */}
        <div className="bm-head">
          <div className="bm-head-l">
            <div className="bm-icon"><Zap size={21} color={pri} fill={pri} /></div>
            <div className="bm-head-txt">
              <div className="bm-title">Boost Your Post</div>
              <div className="bm-sub">Reach more people with spendable coins</div>
            </div>
          </div>
          <button className="bm-x" onClick={onClose} aria-label="Close" type="button">
            <X size={20} />
          </button>
        </div>

        {/* Scrolling middle */}
        <div className="bm-scroll">
          {/* Balance */}
          <div className="bm-balance">
            <div className="bm-balance-l">
              <Wallet size={16} color={pri} style={{ flexShrink: 0 }} />
              <span className="bm-balance-lbl">Your Coins</span>
            </div>
            {balanceLoading ? (
              <span className="bm-balance-lbl">Loading…</span>
            ) : balanceError ? (
              <button className="bm-retry" onClick={() => loadBalance()} type="button">
                <RefreshCw size={13} /> Couldn&apos;t load — retry
              </button>
            ) : (
              <span className="bm-balance-val">{formatCoins(userCoins)}<small>coins</small></span>
            )}
          </div>

          {/* Durations */}
          <div className="bm-label">
            <Clock size={13} color={pri} /> Select Duration
          </div>
          <div className="bm-grid">
            {BOOST_DURATIONS.map((option) => {
              const isSelected = selectedDuration === option.hours;
              const entry = costs[option.hours];
              const affordable = !balanceKnown || userCoins >= entry.cost;
              return (
                <button
                  key={option.hours}
                  type="button"
                  className={isSelected ? 'bm-card sel' : 'bm-card'}
                  onClick={() => setSelectedDuration(option.hours)}
                  aria-pressed={isSelected}
                >
                  {isSelected && <span className="bm-tick"><Check size={11} strokeWidth={3.5} /></span>}
                  <div className="bm-card-top">
                    <Clock size={13} color={isSelected ? pri : sub} style={{ flexShrink: 0 }} />
                    <span className="bm-card-name">{option.label}</span>
                  </div>
                  <span className={affordable ? 'bm-card-cost' : 'bm-card-cost short'}>
                    {costsLoading ? '···' : `${formatCoins(entry.cost)} coins`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Cost summary */}
          <div className={showBuyCoins ? 'bm-cost short' : 'bm-cost'}>
            <div className="bm-cost-row">
              <span className="bm-cost-lbl">Boost Cost</span>
              <span className="bm-cost-val">
                {costsLoading ? 'Calculating…' : <>{formatCoins(boostCost)}<small>coins</small></>}
              </span>
            </div>

            {!costsLoading && showBuyCoins && (
              <div className="bm-cost-note warn">
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                You need {formatCoins(shortfall)} more {shortfall === 1 ? 'coin' : 'coins'}
              </div>
            )}
            {!costsLoading && hasEnough && (
              <div className="bm-cost-note ok">
                <Wallet size={14} style={{ flexShrink: 0 }} />
                {formatCoins(remaining)} coins left after boosting
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bm-err" role="alert">
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Pinned actions */}
        <div className="bm-actions">
          <button className="bm-btn bm-ghost" onClick={onClose} type="button">
            Cancel
          </button>

          {showBuyCoins ? (
            <button className="bm-btn bm-primary" onClick={handleBuyCoins} type="button">
              <Wallet size={16} /> Buy Coins
            </button>
          ) : (
            <button
              className="bm-btn bm-primary"
              onClick={handleCreateBoost}
              type="button"
              disabled={!canBoost}
            >
              {creating
                ? <><Loader2 size={16} className="bm-spin" /> Boosting…</>
                : <><Zap size={16} fill="currentColor" /> Boost Post</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
