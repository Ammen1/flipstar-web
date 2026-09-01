/**
 * The coin top-up popup.
 *
 * This replaced a stub that said only "You have insufficient coins" and whose
 * Buy Coins button navigated to /buy-coins -- which unmounted whatever the
 * user was doing, so the gift, comment or post they were part-way through was
 * gone when they came back. Everything now happens in place: the popup shows
 * what the action costs, what they hold, and the packages, runs the purchase,
 * and hands control back to the caller so the original action can be retried.
 *
 * The old props (`visible`, `onClose`, `onBuyCoins`) still work, so existing
 * call sites keep functioning; `onBuyCoins` is now the escape hatch to the
 * full page rather than the only route to buying anything.
 */

import { AlertCircle, Check, Coins, Loader, LogIn, Smartphone, X } from 'lucide-react';
import { PHASE, useCoinPurchase } from '../../hooks/useCoinPurchase';

const GREEN = '#8fc441';
const CARD = '#161616';
const BORDER = '#262626';
const INSET = '#101010';

const fmt = (n) => Number(n || 0).toLocaleString();

export function InsufficientCoinsModal({
  visible,
  onClose,
  onBuyCoins,
  // What the blocked action costs and what the user holds. Both come from the
  // server's refusal -- the client never invents them.
  requiredCoins = 0,
  currentCoins = null,
  // e.g. "send this gift" -- makes the popup say why coins are needed.
  actionLabel = 'continue',
  // Called once coins have actually landed, so the caller can retry.
  onPurchased,
  // Called when the real problem is a signed-out session, not a balance.
  onRequireAuth,
  isMobile = typeof window !== 'undefined' && window.innerWidth < 480,
}) {
  const {
    phase, balance, packages, selectedId, setSelectedId,
    message, coinsAdded, shortfall, buy, retry,
  } = useCoinPurchase({ visible, requiredCoins, initialBalance: currentCoins });

  if (!visible) return null;

  // Nothing is in flight, so closing cannot strand a payment.
  const dismissable = phase !== PHASE.WORKING && phase !== PHASE.AWAITING;
  const close = () => { if (dismissable) onClose?.(); };

  const sheet = {
    background: CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: isMobile ? '22px 22px 0 0' : 22,
    padding: isMobile ? '18px 20px' : '22px 24px',
    paddingBottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom))' : 22,
    width: '100%',
    maxWidth: isMobile ? '100%' : 420,
    maxHeight: isMobile ? '88vh' : '86vh',
    overflowY: 'auto',
    boxSizing: 'border-box',
    boxShadow: '0 -12px 40px rgba(0,0,0,0.55)',
  };

  const primaryBtn = (enabled) => ({
    width: '100%', minHeight: 52, marginTop: 4,
    background: enabled ? GREEN : '#2A3320',
    color: enabled ? '#0B1207' : '#5F6B4F',
    border: 'none', borderRadius: 13,
    fontSize: 16, fontWeight: 800,
    cursor: enabled ? 'pointer' : 'not-allowed',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    boxShadow: enabled ? '0 6px 20px rgba(143,196,65,0.28)' : 'none',
    WebkitTapHighlightColor: 'transparent',
  });

  const ghostBtn = {
    width: '100%', minHeight: 46, marginTop: 8,
    background: 'transparent', color: '#C9C9C9',
    border: `1px solid ${BORDER}`, borderRadius: 13,
    fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  };

  const selected = packages.find((p) => p.id === selectedId);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="coin-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : 24,
      }}
    >
      <style>{`
        @keyframes cpm-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .cpm-spin { animation: cpm-spin 0.9s linear infinite; }
      `}</style>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        {isMobile && (
          <div style={{
            width: 38, height: 4, borderRadius: 4,
            background: '#3A3A3A', margin: '0 auto 14px',
          }} />
        )}

        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 12, marginBottom: 16,
        }}>
          <div style={{ minWidth: 0 }}>
            <div id="coin-modal-title" style={{
              fontSize: isMobile ? 18 : 17, fontWeight: 800,
              color: '#fff', letterSpacing: -0.2,
            }}>
              {phase === PHASE.AUTH ? 'Sign in to continue'
                : phase === PHASE.SUCCESS ? 'Coins added'
                  : 'You need more coins'}
            </div>
            <div style={{ fontSize: 13, color: '#8A8A8A', marginTop: 3 }}>
              {phase === PHASE.AUTH
                ? 'Your session has expired.'
                : phase === PHASE.SUCCESS
                  ? 'You can carry on where you left off.'
                  : `Top up to ${actionLabel}.`}
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            disabled={!dismissable}
            style={{
              background: '#202020', border: `1px solid ${BORDER}`,
              borderRadius: 10, color: '#B5B5B5',
              width: 32, height: 32, flexShrink: 0,
              display: 'grid', placeItems: 'center',
              cursor: dismissable ? 'pointer' : 'not-allowed',
              opacity: dismissable ? 1 : 0.5,
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* An expired session is not a balance problem, and must never be
            presented as one -- buying coins would not fix it. */}
        {phase === PHASE.AUTH && (
          <>
            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: INSET, border: `1px solid ${BORDER}`,
              borderRadius: 14, padding: '14px', marginBottom: 16,
            }}>
              <LogIn size={20} color={GREEN} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13.5, color: '#C9C9C9', lineHeight: 1.5 }}>
                We couldn't confirm your account, so we can't show your balance.
                Sign in and your {actionLabel === 'continue' ? 'action' : actionLabel} will be waiting.
              </div>
            </div>
            <button
              onClick={() => { onRequireAuth?.(); onClose?.(); }}
              style={primaryBtn(true)}
            >
              Sign in
            </button>
            <button onClick={close} style={ghostBtn}>Not now</button>
          </>
        )}

        {phase === PHASE.LOADING && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '34px 0', color: '#8A8A8A', fontSize: 14,
          }}>
            <Loader size={18} className="cpm-spin" />
            Loading your balance…
          </div>
        )}

        {(phase === PHASE.READY || phase === PHASE.WORKING) && (
          <>
            {/* The three numbers that explain the block. */}
            <div style={{
              background: INSET, border: `1px solid ${BORDER}`,
              borderRadius: 14, padding: '4px 14px', marginBottom: 16,
            }}>
              {[
                ['Needed for this', `${fmt(requiredCoins)} coins`, '#fff'],
                ['Your balance', `${fmt(balance)} coins`, '#fff'],
                ['Short by', `${fmt(shortfall)} coins`, GREEN],
              ].map(([label, value, color], i) => (
                <div
                  key={label}
                  style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 12, padding: '12px 0',
                    borderBottom: i === 2 ? 'none' : `1px solid ${BORDER}`,
                  }}
                >
                  <span style={{ fontSize: 13.5, color: '#8A8A8A' }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{
              fontSize: 12, fontWeight: 700, color: GREEN,
              letterSpacing: 0.2, marginBottom: 8,
            }}>
              Choose a package
            </div>
            <div role="radiogroup" aria-label="Coin packages" style={{
              display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16,
            }}>
              {packages.map((p) => {
                const on = p.id === selectedId;
                const clears = p.coins >= shortfall;
                return (
                  <button
                    key={p.id}
                    role="radio"
                    aria-checked={on}
                    disabled={phase === PHASE.WORKING}
                    onClick={() => setSelectedId(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: on ? 'rgba(143,196,65,0.10)' : INSET,
                      border: `1.5px solid ${on ? GREEN : BORDER}`,
                      borderRadius: 14, padding: '12px 14px',
                      cursor: phase === PHASE.WORKING ? 'not-allowed' : 'pointer',
                      textAlign: 'left', width: '100%',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      background: 'rgba(143,196,65,0.12)',
                      display: 'grid', placeItems: 'center',
                    }}>
                      <Coins size={17} color={GREEN} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff' }}>
                        {fmt(p.coins)} coins
                        {p.bonus > 0 && (
                          <span style={{ fontSize: 11.5, color: GREEN, marginLeft: 6 }}>
                            +{fmt(p.bonus)} bonus
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: clears ? '#7E7E7E' : '#8a6d3b', marginTop: 1 }}>
                        {clears ? p.name : `${p.name} — still short`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 800, color: GREEN }}>
                        {p.priceEtb.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, marginLeft: 3 }}>
                        ETB
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={buy}
              disabled={!selected || phase === PHASE.WORKING}
              style={primaryBtn(Boolean(selected) && phase !== PHASE.WORKING)}
            >
              {phase === PHASE.WORKING
                ? (<><Loader size={17} className="cpm-spin" /> Starting payment…</>)
                : (<>Buy {selected ? `${fmt(selected.coins)} coins` : 'coins'}</>)}
            </button>
            <button onClick={close} disabled={!dismissable} style={ghostBtn}>Cancel</button>
            {onBuyCoins && (
              <button
                onClick={() => { onClose?.(); onBuyCoins(); }}
                style={{
                  width: '100%', background: 'none', border: 'none',
                  color: '#6F6F6F', fontSize: 12.5, marginTop: 10,
                  cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                More options
              </button>
            )}
          </>
        )}

        {phase === PHASE.AWAITING && (
          <>
            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: INSET, border: `1px solid ${BORDER}`,
              borderRadius: 14, padding: 14, marginBottom: 14,
            }}>
              <Smartphone size={20} color={GREEN} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13.5, color: '#C9C9C9', lineHeight: 1.5 }}>
                Check your phone and approve the telebirr prompt. Your coins
                appear here as soon as the payment clears.
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '10px 0 4px', color: '#8A8A8A', fontSize: 13.5,
            }}>
              <Loader size={17} className="cpm-spin" />
              Waiting for confirmation…
            </div>
            <div style={{ fontSize: 11.5, color: '#5F5F5F', textAlign: 'center', marginTop: 10 }}>
              Keep this open — closing it won't cancel the payment.
            </div>
          </>
        )}

        {phase === PHASE.SUCCESS && (
          <>
            <div style={{ textAlign: 'center', padding: '6px 0 14px' }}>
              <div style={{
                width: 58, height: 58, borderRadius: '50%', margin: '0 auto 12px',
                background: 'rgba(143,196,65,0.14)',
                display: 'grid', placeItems: 'center',
              }}>
                <Check size={28} color={GREEN} strokeWidth={3} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
                +{fmt(coinsAdded)} coins
              </div>
              <div style={{ fontSize: 13.5, color: '#8A8A8A', marginTop: 4 }}>
                New balance: {fmt(balance)} coins
              </div>
            </div>
            <button
              onClick={() => { onPurchased?.(balance); onClose?.(); }}
              style={primaryBtn(true)}
            >
              Continue
            </button>
          </>
        )}

        {phase === PHASE.ERROR && (
          <>
            <div style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              background: 'rgba(229,72,77,0.10)',
              border: '1px solid rgba(229,72,77,0.32)',
              borderRadius: 14, padding: 14, marginBottom: 14,
            }}>
              <AlertCircle size={20} color="#E5484D" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13.5, color: '#F0B4B6', lineHeight: 1.5 }}>
                {message || 'Something went wrong. Please try again.'}
              </div>
            </div>
            <button onClick={retry} style={primaryBtn(true)}>Try again</button>
            <button onClick={close} style={ghostBtn}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
