import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronLeft, Coins, Check, X, CheckCircle, XCircle, Lock,
  ShieldCheck, Smartphone, RefreshCw, AlertCircle, Wallet, Loader, Clock,
} from 'lucide-react';
import api from '../../api';
import telebirrH5 from '../../services/TelebirrH5Service';
import { sanitizePhoneInput, toE164, PHONE_MAX_DIGITS, INVALID_PHONE_MESSAGE } from '../../utils/phone';
import { readPricing, quoteCoins, formatBirr } from '../../utils/coinPricing';
import { allowedPayMethods } from '../../utils/payMethods';
import UssdOtpStep from '../../components/payment/UssdOtpStep';
import { VERIFIED as OTP_VERIFIED, canPay as otpAllowsPayment } from '../../utils/paymentOtp';
import { describePayment, SUCCESS as PAYMENT_SUCCESS, PENDING as PAYMENT_PENDING } from '../../utils/paymentStatus';

/**
 * Buy Coins — dedicated full page.
 *
 * Replaces the old "Buy Coins" modal + <select> dropdown with a product-style
 * package picker. Packages, prices, bonuses and airtime eligibility all come
 * from the existing `/wallet/config/` response; the purchase itself still runs
 * through the exact same telebirr / airtime calls the modal used:
 *
 *   SuperApp   -> telebirrH5.purchasePackage(pkg.id)
 *   Web (USSD) -> POST /wallet/telebirrUssdPurchase/ { package_id, phone_number }
 *   Airtime    -> POST /charging/coin-purchase/      { package_id, idempotency_key }
 */

/** The id the custom card selects under; never a real package id. */
const CUSTOM_ID = '__custom__';

const POLL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;

const FALLBACK_THEME = {
  pri: '#8fc441', priGradient: null, bg: '#0D0D0D', txt: '#FFFFFF',
  sub: '#b5dd8f', border: '#262626', cardBg: '#1A1A1A',
};

// ─── helpers ──────────────────────────────────────────────────────────────

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
  if (!c) return hex;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

// Readable text colour to sit on top of the primary colour.
function onPrimary(hex) {
  const c = hexToRgb(hex);
  if (!c) return '#0B1207';
  const l = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return l > 0.6 ? '#0B1207' : '#FFFFFF';
}

function formatCoins(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString() : '0';
}

function formatEtb(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function formatPerCoin(v) {
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1) return `${v.toFixed(2)} ETB per coin`;
  return `${v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} ETB per coin`;
}

// Backend text is shown only when it already reads like a sentence. Anything
// code-shaped, oversized or stack-trace-ish falls back to safe copy.
function friendlyError(raw, fallback = 'Payment failed. Please try again.') {
  if (typeof raw !== 'string') return fallback;
  const s = raw.trim();
  if (!s || s.length > 160) return fallback;
  if (/[{}<>[\]]|traceback|https?:\/\//i.test(s)) return fallback;
  if (/^[A-Z0-9_]+$/.test(s)) {
    const codes = {
      NOT_IN_SUPERAPP: 'Open FlipStar inside the telebirr SuperApp to pay with telebirr.',
      PAY_TIMEOUT: 'Payment was not completed. If you paid, your coins will be credited shortly.',
      INSUFFICIENT_BALANCE: 'Your balance is insufficient to complete this purchase.',
    };
    return codes[s] || fallback;
  }
  return s;
}

// Keeps the raw API object intact (payloads still use pkg.id / pkg.total_coins)
// and adds display-only derived fields under an underscore prefix.
function normalizePackages(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((p) => p && p.id != null)
    .map((p) => {
      const totalCoins = Number(p.total_coins ?? p.coins ?? 0);
      const bonusCoins = Number(p.bonus_coins ?? 0);
      const priceEtb = Number(p.price_etb ?? p.price ?? 0);
      const rawBadge = p.badge ?? p.tag ?? p.label;
      return {
        ...p,
        _id: p.id,
        _name: p.name || `${formatCoins(totalCoins)} Coins`,
        _totalCoins: Number.isFinite(totalCoins) ? totalCoins : 0,
        _bonusCoins: Number.isFinite(bonusCoins) && bonusCoins > 0 ? bonusCoins : 0,
        _priceEtb: Number.isFinite(priceEtb) ? priceEtb : 0,
        _perCoin: totalCoins > 0 && priceEtb > 0 ? priceEtb / totalCoins : null,
        _apiBadge: typeof rawBadge === 'string' && rawBadge.trim() ? rawBadge.trim() : null,
        _apiPopular: Boolean(
          p.is_popular ?? p.popular ?? p.is_featured ?? p.featured ?? p.is_recommended,
        ),
      };
    });
}

// ─── styles ───────────────────────────────────────────────────────────────

const CSS = `
/* The app ships no global box-sizing reset (src/global.css defines one but is
   never imported), so every padded element here would otherwise measure as
   content-box. Scoping the reset to this page keeps width:100% honest without
   changing anything outside it. */
.bc-root,.bc-root *,.bc-root *::before,.bc-root *::after{box-sizing:border-box;}

.bc-root{min-height:100%;display:flex;flex-direction:column;background:var(--bc-bg);color:var(--bc-txt);}
.bc-topbar{position:sticky;top:0;z-index:6;display:flex;align-items:center;gap:12px;
  padding:10px 14px;background:var(--bc-bg-blur);backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--bc-border);}
.bc-iconbtn{display:grid;place-items:center;width:40px;height:40px;flex-shrink:0;border-radius:12px;
  border:1px solid transparent;background:transparent;color:var(--bc-txt);cursor:pointer;
  transition:background .18s,border-color .18s;-webkit-tap-highlight-color:transparent;}
.bc-iconbtn:hover{background:var(--bc-pri-08);border-color:var(--bc-border);}
.bc-iconbtn:focus-visible{outline:2px solid var(--bc-pri);outline-offset:2px;}
.bc-topbar-title{font-size:15px;font-weight:700;letter-spacing:.01em;}
.bc-balance{margin-left:auto;display:flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;
  background:var(--bc-pri-08);border:1px solid var(--bc-pri-22);color:var(--bc-txt);
  font-size:13px;font-weight:700;white-space:nowrap;}

.bc-wrap{width:100%;max-width:1040px;margin:0 auto;padding:0 16px;box-sizing:border-box;flex:1;}
@media(min-width:768px){.bc-wrap{padding:0 24px;}}

.bc-hero{text-align:center;padding:34px 0 6px;}
@media(min-width:768px){.bc-hero{padding:46px 0 10px;}}
.bc-hero h1{margin:0;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.02em;}
@media(min-width:768px){.bc-hero h1{font-size:38px;}}
.bc-hero p{margin:10px 0 0;font-size:14.5px;color:var(--bc-sub);}
.bc-hero-coin{width:60px;height:60px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;
  background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.5),rgba(255,255,255,0) 58%),var(--bc-grad);
  color:var(--bc-on-pri);
  box-shadow:0 10px 26px var(--bc-pri-22),inset 0 -3px 8px rgba(0,0,0,.3),inset 0 2px 4px rgba(255,255,255,.4);}

.bc-section{margin:30px 0 0;}
.bc-section-head{display:flex;align-items:center;gap:8px;margin:0 0 12px;
  font-size:11.5px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:var(--bc-sub);}

.bc-grid{display:grid;gap:18px;padding-top:16px;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,232px),1fr));}
@media(min-width:1024px){.bc-grid{gap:22px;}}

.bc-card{position:relative;box-sizing:border-box;appearance:none;-webkit-appearance:none;font:inherit;
  display:flex;flex-direction:column;align-items:center;width:100%;height:100%;
  padding:28px 18px 18px;border-radius:22px;text-align:center;cursor:pointer;
  background:linear-gradient(180deg,var(--bc-card-hi) 0%,var(--bc-card) 62%);
  border:1px solid var(--bc-border);color:var(--bc-txt);
  transition:transform .22s cubic-bezier(.2,.8,.3,1),border-color .2s ease,box-shadow .22s ease,background .2s ease;
  -webkit-tap-highlight-color:transparent;animation:bc-in .4s cubic-bezier(.2,.8,.3,1) backwards;}
@media(hover:hover){.bc-card:hover{transform:translateY(-4px);border-color:var(--bc-pri-45);
  box-shadow:0 12px 30px rgba(0,0,0,.35);}}
.bc-card:active{transform:translateY(-1px) scale(.995);}
.bc-card:focus-visible{outline:2px solid var(--bc-pri);outline-offset:3px;}
.bc-card[data-selected="true"]{border-color:var(--bc-pri);
  background:linear-gradient(180deg,var(--bc-pri-14) 0%,var(--bc-card) 66%);
  box-shadow:0 0 0 1px var(--bc-pri),0 16px 40px var(--bc-pri-22);}

.bc-badge{position:absolute;top:0;left:50%;transform:translate(-50%,-52%);z-index:2;
  display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:999px;
  font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;
  background:var(--bc-grad);color:var(--bc-on-pri);box-shadow:0 6px 16px var(--bc-pri-22);}
.bc-badge[data-kind="best"]{background:linear-gradient(135deg,#F5C561 0%,#E2A33C 100%);color:#231704;
  box-shadow:0 6px 16px rgba(226,163,60,.28);}

.bc-check{position:absolute;top:13px;right:13px;width:26px;height:26px;border-radius:50%;
  display:grid;place-items:center;background:var(--bc-pri);color:var(--bc-on-pri);
  animation:bc-pop .3s cubic-bezier(.34,1.56,.64,1);}

.bc-coin{position:relative;width:64px;height:64px;border-radius:50%;display:grid;place-items:center;
  margin-bottom:16px;overflow:hidden;color:var(--bc-on-pri);
  background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.5),rgba(255,255,255,0) 58%),var(--bc-grad);
  box-shadow:0 8px 20px var(--bc-pri-22),inset 0 -3px 8px rgba(0,0,0,.3),inset 0 2px 4px rgba(255,255,255,.4);}
.bc-coin::after{content:'';position:absolute;inset:-30%;
  background:linear-gradient(115deg,transparent 42%,rgba(255,255,255,.5) 50%,transparent 58%);
  transform:translateX(-110%);}
.bc-card[data-selected="true"] .bc-coin::after{animation:bc-shine 2.8s ease-in-out infinite;}

.bc-amount{font-size:38px;line-height:1;font-weight:800;letter-spacing:-.03em;}
.bc-amount-label{margin-top:6px;font-size:10.5px;font-weight:800;letter-spacing:.2em;color:var(--bc-sub);}
.bc-bonus{margin-top:11px;display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;
  background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.34);color:#34D399;
  font-size:11px;font-weight:700;}
.bc-rule{width:100%;height:1px;margin:18px 0 14px;background:var(--bc-border);}
.bc-price{display:flex;align-items:baseline;gap:6px;font-size:24px;font-weight:800;letter-spacing:-.02em;
  color:var(--bc-pri);}
.bc-price span{font-size:12.5px;font-weight:800;letter-spacing:.1em;color:var(--bc-sub);}
.bc-percoin{margin-top:5px;font-size:11px;color:var(--bc-sub);opacity:.85;}
.bc-cta{margin-top:auto;padding-top:16px;width:100%;}
.bc-cta i{display:flex;align-items:center;justify-content:center;gap:7px;font-style:normal;
  width:100%;padding:11px 12px;border-radius:13px;font-size:13px;font-weight:700;
  border:1px solid var(--bc-border);background:var(--bc-cta-bg);color:var(--bc-sub);
  transition:background .2s,color .2s,border-color .2s;}
.bc-card[data-selected="true"] .bc-cta i{background:var(--bc-grad);border-color:transparent;color:var(--bc-on-pri);}
@media(hover:hover){.bc-card:hover .bc-cta i{color:var(--bc-txt);border-color:var(--bc-pri-45);}
  .bc-card[data-selected="true"]:hover .bc-cta i{color:var(--bc-on-pri);}}

.bc-methods{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
@media(max-width:420px){.bc-methods{grid-template-columns:1fr;}}
.bc-method{display:flex;align-items:center;gap:10px;width:100%;padding:14px;
  border-radius:14px;cursor:pointer;font:inherit;text-align:left;
  background:var(--bc-card);border:1.5px solid var(--bc-border);color:var(--bc-txt);
  transition:border-color .18s,background .18s;-webkit-tap-highlight-color:transparent;}
.bc-method:hover:not(:disabled){border-color:var(--bc-pri-45);}
.bc-method:focus-visible{outline:2px solid var(--bc-pri);outline-offset:2px;}
.bc-method:disabled{opacity:.55;cursor:not-allowed;}
.bc-method.is-active{border-color:var(--bc-pri);background:var(--bc-pri-08);}
.bc-method-dot{width:18px;height:18px;flex-shrink:0;border-radius:50%;
  border:2px solid var(--bc-border);display:grid;place-items:center;}
.bc-method.is-active .bc-method-dot{border-color:var(--bc-pri);}
.bc-method.is-active .bc-method-dot::after{content:'';width:9px;height:9px;
  border-radius:50%;background:var(--bc-pri);}
.bc-method-label{font-size:14px;font-weight:700;}

.bc-phone{display:flex;align-items:center;gap:13px;padding:15px 16px;border-radius:16px;
  background:var(--bc-card);border:1px solid var(--bc-border);}
.bc-phone-flag{font-size:22px;line-height:1;flex-shrink:0;}
.bc-phone-num{font-size:17px;font-weight:700;letter-spacing:.04em;word-break:break-all;}
.bc-phone-lock{margin-left:auto;display:flex;align-items:center;gap:5px;flex-shrink:0;
  padding:5px 10px;border-radius:999px;background:var(--bc-pri-08);color:var(--bc-sub);
  font-size:10.5px;font-weight:700;letter-spacing:.04em;white-space:nowrap;}
.bc-phone-input{width:100%;box-sizing:border-box;padding:13px 14px;border-radius:13px;font:inherit;
  font-size:16px;background:var(--bc-card);border:1px solid var(--bc-border);color:var(--bc-txt);
  outline:none;transition:border-color .18s,box-shadow .18s;}
.bc-phone-input:focus{border-color:var(--bc-pri);box-shadow:0 0 0 3px var(--bc-pri-14);}
.bc-hint{margin:9px 2px 0;font-size:12px;color:var(--bc-sub);display:flex;align-items:center;gap:6px;}

.bc-actionbar{position:sticky;bottom:0;z-index:7;margin-top:28px;
  background:var(--bc-bg-blur);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  border-top:1px solid var(--bc-border);}
/* AppShell shows its fixed bottom nav at <=1024px — keep the bar clear of it. */
@media(max-width:1024px){.bc-actionbar{bottom:calc(64px + env(safe-area-inset-bottom,0px));}}
.bc-actionbar-inner{width:100%;max-width:1040px;margin:0 auto;box-sizing:border-box;
  display:flex;align-items:center;gap:14px;padding:13px 16px;}
@media(min-width:768px){.bc-actionbar-inner{padding:15px 24px;}}
.bc-actionbar-sum{min-width:0;flex:1;}
.bc-actionbar-sum b{display:block;font-size:14.5px;font-weight:800;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;}
.bc-actionbar-sum small{display:block;margin-top:2px;font-size:12px;color:var(--bc-sub);}

.bc-primary{display:inline-flex;align-items:center;justify-content:center;gap:9px;font:inherit;
  padding:14px 26px;min-height:50px;border-radius:15px;border:none;cursor:pointer;
  font-size:15px;font-weight:800;letter-spacing:.01em;
  background:var(--bc-grad);color:var(--bc-on-pri);white-space:nowrap;flex-shrink:0;
  transition:transform .18s,box-shadow .18s,opacity .18s;box-shadow:0 8px 22px var(--bc-pri-22);
  -webkit-tap-highlight-color:transparent;}
@media(hover:hover){.bc-primary:not(:disabled):hover{transform:translateY(-1px);
  box-shadow:0 12px 28px var(--bc-pri-32);}}
.bc-primary:not(:disabled):active{transform:translateY(0) scale(.985);}
.bc-primary:focus-visible{outline:2px solid var(--bc-pri);outline-offset:3px;}
.bc-primary:disabled{opacity:.42;cursor:not-allowed;box-shadow:none;}
.bc-ghost{display:inline-flex;align-items:center;justify-content:center;gap:8px;font:inherit;
  padding:13px 22px;min-height:48px;border-radius:15px;cursor:pointer;font-size:14px;font-weight:700;
  background:transparent;border:1px solid var(--bc-border);color:var(--bc-txt);
  transition:background .18s,border-color .18s;-webkit-tap-highlight-color:transparent;}
.bc-ghost:hover{background:var(--bc-pri-08);border-color:var(--bc-pri-45);}
.bc-ghost:focus-visible{outline:2px solid var(--bc-pri);outline-offset:2px;}
.bc-ghost:disabled{opacity:.5;cursor:not-allowed;}

.bc-state{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;
  padding:56px 20px;border-radius:22px;background:var(--bc-card);border:1px solid var(--bc-border);
  margin-top:16px;}
.bc-state-icon{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;
  background:var(--bc-pri-08);color:var(--bc-sub);margin-bottom:2px;}
.bc-state h2{margin:0;font-size:17px;font-weight:800;}
.bc-state p{margin:0;font-size:14px;color:var(--bc-sub);max-width:320px;line-height:1.5;}

.bc-sk{position:relative;overflow:hidden;border-radius:22px;height:322px;
  background:var(--bc-card);border:1px solid var(--bc-border);}
.bc-sk::after{content:'';position:absolute;inset:0;transform:translateX(-100%);
  background:linear-gradient(90deg,transparent,var(--bc-pri-08),transparent);
  animation:bc-sweep 1.5s ease-in-out infinite;}

.bc-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:flex-end;justify-content:center;
  background:rgba(0,0,0,.78);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
  padding:0;animation:bc-fade .2s ease;}
@media(min-width:640px){.bc-overlay{align-items:center;padding:20px;}}
.bc-sheet{width:100%;max-width:440px;box-sizing:border-box;background:var(--bc-card);color:var(--bc-txt);
  border:1px solid var(--bc-border);border-radius:24px 24px 0 0;padding:20px 20px 24px;
  box-shadow:0 -18px 60px rgba(0,0,0,.6);animation:bc-up .28s cubic-bezier(.2,.8,.3,1);
  padding-bottom:calc(24px + env(safe-area-inset-bottom,0px));max-height:88vh;overflow-y:auto;}
@media(min-width:640px){.bc-sheet{border-radius:24px;padding-bottom:24px;
  animation:bc-pop .26s cubic-bezier(.2,.8,.3,1);box-shadow:0 28px 70px rgba(0,0,0,.6);}}
.bc-sheet-grab{width:38px;height:4px;border-radius:999px;background:var(--bc-border);margin:0 auto 16px;}
@media(min-width:640px){.bc-sheet-grab{display:none;}}
.bc-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;}
.bc-sheet-head h2{margin:0;font-size:18px;font-weight:800;}
.bc-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;
  border-bottom:1px solid var(--bc-border);font-size:14px;}
.bc-row:last-of-type{border-bottom:none;}
.bc-row-k{color:var(--bc-sub);font-size:13px;}
.bc-row-v{font-weight:700;text-align:right;word-break:break-word;}
.bc-total{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:6px;
  padding:15px 16px;border-radius:15px;background:var(--bc-pri-08);border:1px solid var(--bc-pri-22);}
.bc-total b{font-size:21px;font-weight:800;color:var(--bc-pri);}

.bc-spin{animation:bc-rotate .9s linear infinite;}

@keyframes bc-in{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
@keyframes bc-pop{from{opacity:0;transform:scale(.82);}to{opacity:1;transform:scale(1);}}
@keyframes bc-up{from{opacity:0;transform:translateY(26px);}to{opacity:1;transform:none;}}
@keyframes bc-fade{from{opacity:0;}to{opacity:1;}}
@keyframes bc-shine{0%{transform:translateX(-110%);}55%,100%{transform:translateX(110%);}}
@keyframes bc-sweep{100%{transform:translateX(100%);}}
@keyframes bc-rotate{to{transform:rotate(360deg);}}

@media(prefers-reduced-motion:reduce){
  .bc-card,.bc-primary,.bc-sheet,.bc-check{animation:none!important;transition:none!important;}
  .bc-card:hover,.bc-primary:hover{transform:none!important;}
  .bc-coin::after,.bc-sk::after{animation:none!important;}
}
`;

// ─── page ─────────────────────────────────────────────────────────────────

export default function BuyCoinsPage({ theme, onBack, onDone }) {
  const T = theme || FALLBACK_THEME;
  const pri = T.pri || FALLBACK_THEME.pri;
  const card = T.cardBg || T.card || FALLBACK_THEME.cardBg;
  const grad = T.priGradient || pri;

  const cssVars = useMemo(() => ({
    '--bc-bg': T.bg || FALLBACK_THEME.bg,
    '--bc-bg-blur': alpha(T.bg || FALLBACK_THEME.bg, 0.86),
    '--bc-card': card,
    '--bc-card-hi': alpha(pri, 0.045),
    '--bc-cta-bg': alpha(pri, 0.05),
    '--bc-txt': T.txt || FALLBACK_THEME.txt,
    '--bc-sub': T.sub || FALLBACK_THEME.sub,
    '--bc-border': T.border || FALLBACK_THEME.border,
    '--bc-pri': pri,
    '--bc-grad': grad,
    '--bc-on-pri': onPrimary(pri),
    '--bc-pri-08': alpha(pri, 0.08),
    '--bc-pri-14': alpha(pri, 0.14),
    '--bc-pri-22': alpha(pri, 0.22),
    '--bc-pri-32': alpha(pri, 0.32),
    '--bc-pri-45': alpha(pri, 0.45),
  }), [T.bg, T.txt, T.sub, T.border, card, pri, grad]);

  const [status, setStatus] = useState('loading'); // loading | ready | empty | error
  const [packages, setPackages] = useState([]);
  const [balance, setBalance] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  // Typing an amount no package covers. `pricing` (rate + limits) comes from
  // /wallet/config/ so nothing about the price is decided here.
  const [customAmount, setCustomAmount] = useState('');
  const [customTouched, setCustomTouched] = useState(false);
  const [pricing, setPricing] = useState(null);
  // Whether the server will actually take an airtime payment right now.
  // It answers this from the policy flag *and* the charging credentials
  // (api/services/airtime_purchase.py), so the option appears only when a
  // purchase would go through rather than answering 403.
  const [airtimeAvailable, setAirtimeAvailable] = useState(false);
  const [isInSuperApp, setIsInSuperApp] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  // The verified session id the push endpoint requires. Held here rather
  // than inside the step so that changing package, amount or method clears
  // it: a verification is for one payment, and the server agrees.
  const [otpSessionId, setOtpSessionId] = useState(null);
  const [payMethod, setPayMethod] = useState(null);   // 'telebirr' | 'airtime' | null            // null | 'telebirr' | 'airtime'
  const [awaitingUssd, setAwaitingUssd] = useState(false);
  // The payment being waited on, by its telebirr conversation id. Replaces
  // `initialCoinBalance`: the page used to remember the wallet balance and
  // treat any increase as this purchase completing, which made a gift, a
  // daily allocation or a purchase from another device look like the payment
  // going through.
  const [pendingPayment, setPendingPayment] = useState(null);
  // { tone: 'success'|'pending'|'failure', heading, message, done }
  const [result, setResult] = useState(null);

  const cardRefs = useRef([]);
  // The key that makes a retried airtime purchase one charge rather than two.
  // Kept until the attempt settles, then dropped so the next purchase is a
  // new one rather than a replay of the last.
  const airtimeIdempotencyRef = useRef(null);

  // ── data ────────────────────────────────────────────────────────────────
  const load = useCallback(async (fresh = false) => {
    setStatus('loading');
    const opts = fresh ? { skipCache: true } : undefined;
    const [cfg, profile, wallet] = await Promise.allSettled([
      api.request('/wallet/config/', opts),
      api.request('/profile/me/', opts),
      api.request('/wallet/', opts),
    ]);

    if (profile.status === 'fulfilled' && profile.value && profile.value.phone_number) {
      setPhoneNumber(String(profile.value.phone_number));
      setPhoneLocked(true);
    }

    if (wallet.status === 'fulfilled') {
      const b = wallet.value && wallet.value.balance ? wallet.value.balance.total : null;
      if (typeof b === 'number') setBalance(b);
    }

    if (cfg.status !== 'fulfilled') {
      console.error('[BuyCoinsPage] Failed to fetch packages:', cfg.reason);
      setStatus('error');
      return;
    }

    setPricing(readPricing(cfg.value));
    setAirtimeAvailable(Boolean(cfg.value && cfg.value.allows_airtime));
    const list = normalizePackages(cfg.value && cfg.value.packages);
    setPackages(list);
    setSelectedId((prev) => (list.some((p) => p._id === prev) ? prev : null));
    setStatus(list.length ? 'ready' : 'empty');
  }, []);

  useEffect(() => {
    setIsInSuperApp(telebirrH5.isInSuperApp());
    load();
    try {
      const scroller = document.querySelector('.appshell-main');
      if (scroller) scroller.scrollTop = 0;
      else window.scrollTo(0, 0);
    } catch (_) {}
  }, [load]);

  // "Best value" is derived from the API's own numbers — never hardcoded.
  const decorated = useMemo(() => {
    const rated = packages.filter((p) => p._perCoin != null);
    let bestId = null;
    if (rated.length > 1) {
      const sorted = [...rated].sort((a, b) => a._perCoin - b._perCoin);
      if (sorted[0]._perCoin < sorted[1]._perCoin) bestId = sorted[0]._id;
    }
    return packages.map((p) => {
      let badge = null;
      if (p._apiBadge) badge = { text: p._apiBadge, kind: 'popular' };
      else if (p._apiPopular) badge = { text: 'Popular', kind: 'popular' };
      else if (p._id === bestId) badge = { text: 'Best Value', kind: 'best' };
      return { ...p, _badge: badge };
    });
  }, [packages]);

  // A custom amount is offered only outside the SuperApp: in there, purchases
  // go through /wallet/telebirr/initiate/, which takes a package id and has no
  // amount form. Showing the card there would offer something that cannot be
  // paid for.
  const customAllowed = Boolean(pricing) && !isInSuperApp;
  const customQuote = useMemo(
    // `decorated` goes in so an amount that is exactly a package price
    // previews that package's coins -- the same rule the server applies.
    () => (customAllowed ? quoteCoins(customAmount, pricing, decorated) : null),
    [customAllowed, customAmount, pricing, decorated],
  );

  // Shaped exactly like a package so the confirm sheet, the pay-method rules
  // and the purchase call need no special case -- only the request body does.
  const customPkg = useMemo(() => {
    if (!customQuote || !customQuote.ok) return null;
    return {
      _id: CUSTOM_ID,
      id: null,
      _isCustom: true,
      _name: 'Custom amount',
      _priceEtb: customQuote.amount,
      _totalCoins: customQuote.coins,
      _bonusCoins: 0,
      // The package this amount resolves to, when it is exactly a package
      // price. Airtime is charged against a package row (the server prices it
      // there, never from the request), so an amount with no package -- 7
      // Birr, say -- cannot be paid that way and is not offered it.
      _airtimePackageId: (customQuote.matchedPackage && customQuote.matchedPackage.id) || null,
    };
  }, [customQuote]);

  const selected = useMemo(
    () =>
      selectedId === CUSTOM_ID
        ? customPkg
        : decorated.find((p) => p._id === selectedId) || null,
    [decorated, selectedId, customPkg],
  );

  const needsPhone = !isInSuperApp;
  const phoneReady = Boolean(toE164(phoneNumber));
  const canContinue = Boolean(selected) && (!needsPhone || phoneReady) && !busy && !awaitingUssd;

  // ── USSD confirmation. Ask the server about the payment. ───────────────
  //
  // This used to poll /wallet/ and declare success the moment the balance
  // went up, which is not the same question. Coins arrive from gifts,
  // allocations and other devices, and a payment that telebirr refused never
  // moves the balance at all -- so a failure waited out the full timeout and
  // was then reported as "we have not received a confirmation yet", which is
  // not what happened either.
  //
  // Now the payment's own state decides, and there are three outcomes rather
  // than two: a pending payment is shown as pending and grants nothing.
  useEffect(() => {
    if (!awaitingUssd || !pendingPayment) return undefined;

    let done = false;

    function cleanup() {
      clearInterval(poll);
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    }

    const settle = (outcome, extra = {}) => {
      done = true;
      cleanup();
      setAwaitingUssd(false);
      setPendingPayment(null);
      setResult({
        tone: outcome.tone,
        heading: outcome.heading,
        message: outcome.message,
        ...extra,
      });
    };

    const check = async () => {
      if (done) return;
      let payment;
      try {
        payment = await api.getUssdPurchaseStatus(pendingPayment);
      } catch (error) {
        // The request failed, not necessarily the payment. Keep waiting --
        // the server is the only thing that can settle this.
        console.error('[BuyCoinsPage] Status check failed:', error);
        return;
      }

      const outcome = describePayment(payment);
      if (!outcome.final) return;

      if (outcome.state === PAYMENT_SUCCESS) {
        const added = payment.coins_added || 0;
        try {
          const wallet = await api.request('/wallet/', { skipCache: true });
          setBalance((wallet && wallet.balance && wallet.balance.total) || 0);
        } catch (_) { /* the purchase is confirmed either way */ }
        try { window.dispatchEvent(new Event('walletBalanceChanged')); } catch (_) {}
        settle(outcome, {
          done: true,
          message: added
            ? `Payment successful! ${formatCoins(added)} coins added.`
            : outcome.message,
        });
        return;
      }

      // FAILED or CANCELLED: the server's own wording says why -- not enough
      // balance, wrong PIN, cancelled on the handset, refused, expired.
      settle(outcome);
    };

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };

    check();
    const poll = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    const timeout = setTimeout(() => {
      if (done) return;
      // Still PENDING when we stopped asking. That is what is shown: not a
      // success, not a failure, and nothing has been added.
      settle({
        tone: 'pending',
        heading: 'Confirming your payment',
        message:
          'telebirr has not confirmed this payment yet. Nothing has been charged or added so far. '
          + 'If you approved it, your coins will appear here shortly.',
      });
    }, POLL_TIMEOUT_MS);

    return cleanup;
  }, [awaitingUssd, pendingPayment]);

  const finish = useCallback(() => {
    if (onDone) onDone();
    else if (onBack) onBack();
  }, [onDone, onBack]);

  // Leave the success screen up briefly, then return where the user came from.
  useEffect(() => {
    if (!result || result.tone !== 'success' || !result.done) return undefined;
    const t = setTimeout(finish, 2600);
    return () => clearTimeout(t);
  }, [result, finish]);

  // ── purchase (same calls as the old modal) ──────────────────────────────
  const handleAirtimePurchase = async () => {
    if (!selected || busy) return;
    if (!phoneReady) {
      setResult({ tone: 'failure', heading: 'Payment not completed', message: 'Please add your phone number first.' });
      return;
    }
    setConfirmOpen(false);
    setBusy('airtime');
    try {
      // What the endpoint requires, and only that:
      //
      //   package_id       the price comes from the package row, never from
      //                    here -- the request cannot name its own price
      //   idempotency_key  the client is the only one who knows two requests
      //                    are the same purchase, so a double tap is one
      //                    charge. Held in a ref until the attempt settles.
      //
      // It used to send `{phone_number, coins}`, which the endpoint answers
      // 400 to twice over: no package and no key. The number charged is the
      // account's own verified one, chosen by the server -- sending a phone
      // here implied otherwise and was never read.
      if (!airtimeIdempotencyRef.current) {
        airtimeIdempotencyRef.current = `airtime-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }
      const response = await api.request('/charging/coin-purchase/', {
        method: 'POST',
        body: JSON.stringify({
          package_id: airtimePackageId,
          idempotency_key: airtimeIdempotencyRef.current,
        }),
      });

      // Airtime charging answers synchronously, so `success` here is the
      // server's verdict on the charge itself, not an acknowledgement of a
      // request -- unlike telebirr, where it is only the latter.
      if (response.success) {
        try { window.dispatchEvent(new Event('walletBalanceChanged')); } catch (_) {}
        setResult({
          tone: 'success',
          heading: 'Payment successful',
          done: true,
          message: `Payment successful! ${formatCoins(selected._totalCoins)} coins added.`,
        });
      } else if (response.error === 'insufficient_balance') {
        setResult({
          tone: 'failure',
          heading: 'Payment not completed',
          message: 'Your airtime balance is insufficient to complete this purchase. Please top up your airtime and try again.',
        });
      } else {
        setResult({
          tone: 'failure',
          heading: 'Payment not completed',
          message: friendlyError(response.message || response.error, 'Purchase failed. Please try again.'),
        });
      }
    } catch (error) {
      setResult({ tone: 'failure', heading: 'Payment not completed', message: 'Purchase failed. Please try again.' });
    } finally {
      // Settled either way: the next purchase gets its own key.
      airtimeIdempotencyRef.current = null;
      setBusy(null);
    }
  };

  const handleTelebirrPurchase = async () => {
    if (!selected || busy) return;
    setConfirmOpen(false);

    if (telebirrH5.isInSuperApp()) {
      // The card is hidden in the SuperApp, so this is unreachable rather than
      // a case to handle -- but it fails loudly here instead of sending a null
      // package id if that ever stops being true.
      if (selected._isCustom) {
        setResult({ tone: 'failure', heading: 'Payment not completed', message: 'Choose a package to pay inside telebirr.' });
        return;
      }
      setBusy('telebirr');
      try {
        const r = await telebirrH5.purchasePackage(selected.id);
        // Three outcomes, from the server's state.
        //
        // The old shape of this branch was `r.success && r.pending` -> "ok",
        // and the bridge set `success` for a payment the backend had marked
        // FAILED. That is the reported bug in its most direct form: a failed
        // payment drawn with a green tick and the words "Payment received".
        const outcome = describePayment(r);

        if (outcome.state === PAYMENT_SUCCESS) {
          try { window.dispatchEvent(new Event('walletBalanceChanged')); } catch (_) {}
          setResult({
            tone: 'success',
            heading: outcome.heading,
            done: true,
            message: `Payment successful! ${r.coins_added ? `${formatCoins(r.coins_added)} ` : ''}coins added.`,
          });
        } else if (outcome.state === PAYMENT_PENDING) {
          // Not a success. Nothing has been added, and the page says so.
          setResult({
            tone: 'pending',
            heading: outcome.heading,
            message: r.error === 'PAY_TIMEOUT'
              ? 'telebirr has not confirmed this payment. If you approved it, your coins will appear shortly.'
              : outcome.message,
          });
        } else if (r.error === 'NOT_IN_SUPERAPP') {
          // Can only happen if the bridge disappears mid-flow; the branch
          // above already checked. Distinct message so it is not mistaken
          // for a provider failure.
          setResult({
            tone: 'failure',
            heading: 'Payment not completed',
            message: 'Please open FlipStar inside the telebirr app to pay.',
          });
        } else {
          // Console-only so the reason is recoverable from a device inspector
          // even when the visible copy is the generic fallback.
          console.error('[BuyCoins] SuperApp purchase failed:', r);
          setResult({
            tone: 'failure',
            heading: outcome.heading,
            message: r.error ? friendlyError(r.error) : outcome.message,
          });
        }
      } catch (error) {
        console.error('[BuyCoins] SuperApp purchase threw:', error);
        setResult({ tone: 'failure', heading: 'Payment not completed', message: 'Payment failed. Please try again.' });
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy('telebirr');
    try {
      // The one place a custom amount differs from a package: what is asked
      // for. The server prices it and credits its own figure either way.
      const response = await api.request('/wallet/telebirrUssdPurchase/', {
        method: 'POST',
        // verification_session_id is what actually authorises this push. The
        // server re-checks it against this user, this number and this exact
        // package or amount, and spends it -- so it buys one payment, once.
        body: JSON.stringify(
          selected._isCustom
            ? {
                amount_etb: String(selected._priceEtb),
                phone_number: toE164(phoneNumber),
                verification_session_id: otpSessionId,
              }
            : {
                package_id: selected.id,
                phone_number: toE164(phoneNumber),
                verification_session_id: otpSessionId,
              },
        ),
      });

      // `success` here means telebirr accepted the push, not that anybody
      // paid. The conversation id is what the payment is then asked about;
      // without one there is nothing to poll, so that is a failure to start
      // rather than a wait.
      if (response.success && response.originator_conversation_id) {
        setPendingPayment(response.originator_conversation_id);
        setAwaitingUssd(true);
      } else if (response.success) {
        setResult({
          tone: 'failure',
          heading: 'Payment not completed',
          message: 'We could not start this payment. Please try again.',
        });
      } else {
        setResult({
          tone: 'failure',
          heading: 'Payment not completed',
          message: friendlyError(response.error, 'Payment request failed. Please try again.'),
        });
      }
    } catch (error) {
      setResult({ tone: 'failure', heading: 'Payment not completed', message: 'Payment request failed. Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  // ── keyboard support for the radio group ────────────────────────────────
  const onGroupKeyDown = (e) => {
    const n = decorated.length;
    if (!n) return;
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (keys.indexOf(e.key) === -1) return;
    e.preventDefault();
    const cur = Math.max(0, decorated.findIndex((p) => p._id === selectedId));
    let next = cur;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (cur + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (cur - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else next = n - 1;
    setSelectedId(decorated[next]._id);
    const el = cardRefs.current[next];
    if (el && el.focus) el.focus();
  };

  // Which package an airtime charge would be against: the selected one, or
  // the package a custom amount matches exactly. Null means airtime cannot
  // price this purchase, whatever the amount is.
  const airtimePackageId = selected
    ? (selected._isCustom ? selected._airtimePackageId : selected.id)
    : null;

  // Which methods this purchase permits: the price decides (airtime is capped
  // at 10 ETB), `airtimeAvailable` is the server's own answer to whether it
  // would take an airtime payment at all, and there has to be a package for
  // the charge to be priced from.
  //
  // It used to read `selected.allows_airtime`, a per-package field the API has
  // never sent -- so the option was invisible no matter how the server was
  // configured. One answer for the whole page, from /wallet/config/, applies
  // to a package and to a custom amount alike.
  const payMethods = selected
    ? allowedPayMethods(selected._priceEtb, {
        allowsAirtime: airtimeAvailable && Boolean(airtimePackageId),
        inSuperApp: isInSuperApp,
      })
    : [];
  const showAirtime = payMethods.includes('airtime');

  // A USSD Push may only be asked for once the payer has answered the SMS
  // code. Airtime does not use USSD Push, and inside the SuperApp telebirr
  // has already authenticated the payer, so neither waits on this.
  const telebirrReady =
    payMethod !== 'telebirr' ||
    isInSuperApp ||
    otpAllowsPayment({ step: OTP_VERIFIED, sessionId: otpSessionId, busy: false });

  // With one method there is nothing to choose, so it is preselected. With
  // two the user must pick, and Pay stays disabled until they do.
  useEffect(() => {
    setPayMethod(payMethods.length === 1 ? payMethods[0] : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected && selected._id, showAirtime]);

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="bc-root" style={cssVars}>
      <style>{CSS}</style>

      <div className="bc-topbar">
        <button className="bc-iconbtn" onClick={onBack} aria-label="Go back" type="button">
          <ChevronLeft size={22} />
        </button>
        <span className="bc-topbar-title">Buy Coins</span>
        {balance != null && (
          <span className="bc-balance" title="Your current balance">
            <Wallet size={15} />
            {formatCoins(balance)}
          </span>
        )}
      </div>

      <div className="bc-wrap">
        <header className="bc-hero">
          <div className="bc-hero-coin" aria-hidden="true"><Coins size={28} /></div>
          <h1>Buy Coins</h1>
          <p>Choose your coin package</p>
        </header>

        {status === 'loading' && (
          <div className="bc-grid" aria-busy="true" aria-label="Loading coin packages">
            {[0, 1, 2].map((i) => <div key={i} className="bc-sk" />)}
          </div>
        )}

        {status === 'error' && (
          <div className="bc-state" role="alert">
            <div className="bc-state-icon"><AlertCircle size={26} /></div>
            <h2>Unable to load coin packages.</h2>
            <p>Check your connection and try again.</p>
            <button className="bc-ghost" type="button" onClick={() => load(true)} style={{ marginTop: 6 }}>
              <RefreshCw size={16} /> Try again
            </button>
          </div>
        )}

        {status === 'empty' && (
          <div className="bc-state">
            <div className="bc-state-icon"><Coins size={26} /></div>
            <h2>No coin packages are currently available.</h2>
            <p>Please try again later.</p>
            <button className="bc-ghost" type="button" onClick={() => load(true)} style={{ marginTop: 6 }}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            {customAllowed && (
              <section className="bc-section" aria-labelledby="bc-custom-head">
                <h2 className="bc-section-head" id="bc-custom-head">
                  <Coins size={14} /> Choose your amount
                </h2>

                <div
                  className="bc-card"
                  data-selected={selectedId === CUSTOM_ID}
                  style={{ cursor: 'default', display: 'block', padding: 18 }}
                >
                  <label
                    htmlFor="bc-custom-amount"
                    style={{ display: 'block', fontSize: 12, fontWeight: 800, opacity: 0.75, marginBottom: 8 }}
                  >
                    Amount
                  </label>

                  <div style={{ position: 'relative', marginBottom: 14 }}>
                    <input
                      id="bc-custom-amount"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={`e.g. 5`}
                      value={customAmount}
                      aria-describedby="bc-custom-msg"
                      aria-invalid={Boolean(customTouched && customAmount && !customQuote.ok)}
                      onChange={(e) => {
                        setCustomTouched(true);
                        // Digits and a single dot only: a text input with a
                        // filter, rather than type=number, whose spinners and
                        // locale-dependent decimal separator both cause
                        // trouble on phones.
                        const next = e.target.value.replace(/[^\d.]/g, '');
                        if ((next.match(/\./g) || []).length > 1) return;
                        setCustomAmount(next);
                        if (next) setSelectedId(CUSTOM_ID);
                      }}
                      onFocus={() => { if (customAmount) setSelectedId(CUSTOM_ID); }}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '14px 58px 14px 14px',
                        borderRadius: 14,
                        border: '1.5px solid var(--bc-border, #2a2a2a)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'inherit',
                        fontSize: 18,
                        fontWeight: 800,
                        outline: 'none',
                      }}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 13, fontWeight: 800, opacity: 0.6, pointerEvents: 'none',
                      }}
                    >
                      Birr
                    </span>
                  </div>

                  <div
                    id="bc-custom-msg"
                    role="status"
                    aria-live="polite"
                    style={{ minHeight: 44 }}
                  >
                    {customQuote.ok ? (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
                          You will receive
                        </span>
                        <strong style={{ fontSize: 22, fontWeight: 900 }}>
                          {formatCoins(customQuote.coins)}
                        </strong>
                        <span style={{ fontSize: 13, fontWeight: 800, opacity: 0.8 }}>Coins</span>
                      </div>
                    ) : customTouched && customAmount ? (
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#F87171' }}>
                        {customQuote.message}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>
                        {formatBirr(pricing.minEtb)}–{formatBirr(pricing.maxEtb)} Birr.
                        Bonus coins come with the packages below.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="bc-primary"
                    disabled={!customQuote.ok}
                    onClick={() => { setSelectedId(CUSTOM_ID); setConfirmOpen(true); }}
                    style={{ width: '100%', marginTop: 12 }}
                  >
                    Continue to Buy
                  </button>
                </div>
              </section>
            )}

            <section className="bc-section" aria-labelledby="bc-pkg-head">
              <h2 className="bc-section-head" id="bc-pkg-head">
                <Coins size={14} /> Or pick a package
              </h2>
              <div
                className="bc-grid"
                role="radiogroup"
                aria-label="Coin packages"
                onKeyDown={onGroupKeyDown}
              >
                {decorated.map((pkg, i) => {
                  const isSelected = pkg._id === selectedId;
                  const perCoin = formatPerCoin(pkg._perCoin);
                  const bonusLabel = pkg._bonusCoins > 0
                    ? `, including ${formatCoins(pkg._bonusCoins)} bonus coins`
                    : '';
                  return (
                    <button
                      key={pkg._id}
                      ref={(el) => { cardRefs.current[i] = el; }}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${pkg._name}, ${formatCoins(pkg._totalCoins)} coins${bonusLabel}, ${formatEtb(pkg._priceEtb)} ETB`}
                      tabIndex={selectedId == null ? (i === 0 ? 0 : -1) : (isSelected ? 0 : -1)}
                      data-selected={isSelected}
                      className="bc-card"
                      style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                      onClick={() => setSelectedId(pkg._id)}
                    >
                      {pkg._badge && (
                        <span className="bc-badge" data-kind={pkg._badge.kind}>
                          {pkg._badge.kind === 'best' ? <ShieldCheck size={11} /> : <Coins size={11} />}
                          {pkg._badge.text}
                        </span>
                      )}
                      {isSelected && (
                        <span className="bc-check" aria-hidden="true"><Check size={15} strokeWidth={3} /></span>
                      )}

                      <span className="bc-coin" aria-hidden="true"><Coins size={26} /></span>

                      <span className="bc-amount">{formatCoins(pkg._totalCoins)}</span>
                      <span className="bc-amount-label">COINS</span>

                      {pkg._bonusCoins > 0 && (
                        <span className="bc-bonus">+{formatCoins(pkg._bonusCoins)} bonus included</span>
                      )}

                      <span className="bc-rule" aria-hidden="true" />

                      <span className="bc-price">
                        {formatEtb(pkg._priceEtb)} <span>ETB</span>
                      </span>
                      {perCoin && <span className="bc-percoin">{perCoin}</span>}

                      <span className="bc-cta">
                        <i>
                          {isSelected
                            ? (<><Check size={15} strokeWidth={3} /> Selected</>)
                            : 'Select package'}
                        </i>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bc-section" aria-labelledby="bc-phone-head">
              <h2 className="bc-section-head" id="bc-phone-head">
                <Smartphone size={14} /> Phone Number
              </h2>

              {phoneLocked ? (
                <div className="bc-phone">
                  <span className="bc-phone-flag" aria-hidden="true">🇪🇹</span>
                  <span className="bc-phone-num">{phoneNumber}</span>
                  <span className="bc-phone-lock"><Lock size={11} /> Registered</span>
                </div>
              ) : (
                <input
                  className="bc-phone-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label="Phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(sanitizePhoneInput(e.target.value))}
                  maxLength={PHONE_MAX_DIGITS}
                  placeholder="9XXXXXXXX"
                />
              )}

              <p className="bc-hint">
                <ShieldCheck size={13} />
                {phoneLocked
                  ? 'Charges go to your registered phone number.'
                  : 'Charges go to this phone number.'}
              </p>
            </section>
          </>
        )}
      </div>

      {status === 'ready' && (
        <div className="bc-actionbar">
          <div className="bc-actionbar-inner">
            <div className="bc-actionbar-sum">
              {selected ? (
                <>
                  <b>{formatCoins(selected._totalCoins)} coins</b>
                  <small>
                    {formatEtb(selected._priceEtb)} ETB
                    {selected._bonusCoins > 0 ? ` · +${formatCoins(selected._bonusCoins)} bonus` : ''}
                  </small>
                </>
              ) : (
                <>
                  <b>Select a package</b>
                  <small>Tap a card above to continue</small>
                </>
              )}
            </div>
            <button
              className="bc-primary"
              type="button"
              disabled={!canContinue}
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? (<><Loader size={17} className="bc-spin" /> Processing</>) : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Confirmation ─────────────────────────────────────────────── */}
      {confirmOpen && selected && (
        <div
          className="bc-overlay"
          onClick={() => setConfirmOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm purchase"
        >
          <div className="bc-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bc-sheet-grab" aria-hidden="true" />
            <div className="bc-sheet-head">
              <h2>Confirm purchase</h2>
              <button className="bc-iconbtn" type="button" onClick={() => setConfirmOpen(false)} aria-label="Close">
                <X size={19} />
              </button>
            </div>

            <div className="bc-row">
              <span className="bc-row-k">{selected._isCustom ? 'Purchase' : 'Package'}</span>
              <span className="bc-row-v">{selected._name}</span>
            </div>
            <div className="bc-row">
              <span className="bc-row-k">Amount</span>
              <span className="bc-row-v">{formatBirr(selected._priceEtb)} Birr</span>
            </div>
            <div className="bc-row">
              <span className="bc-row-k">Coins</span>
              <span className="bc-row-v">
                {formatCoins(selected._totalCoins)}
                {selected._bonusCoins > 0 && (
                  <span style={{ color: '#34D399', fontSize: 12, display: 'block', fontWeight: 700 }}>
                    includes +{formatCoins(selected._bonusCoins)} bonus
                  </span>
                )}
              </span>
            </div>
            <div className="bc-row">
              <span className="bc-row-k">Phone</span>
              <span className="bc-row-v">🇪🇹 {phoneNumber || '—'}</span>
            </div>

            <div className="bc-total">
              <span className="bc-row-k">Total</span>
              <b>{formatEtb(selected._priceEtb)} ETB</b>
            </div>

            {payMethods.length > 1 && (
              <>
                <p className="bc-section-head" style={{ marginTop: 18, marginBottom: 10 }}>
                  Choose how to pay
                </p>
                <div className="bc-methods" role="radiogroup" aria-label="Payment method">
                  {payMethods.map((m) => {
                    const active = payMethod === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={active ? 'bc-method is-active' : 'bc-method'}
                        disabled={Boolean(busy)}
                        onClick={() => setPayMethod(m)}
                      >
                        <span className="bc-method-dot" aria-hidden="true" />
                        <span className="bc-method-label">
                          {m === 'telebirr' ? 'telebirr' : 'Airtime balance'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* USSD Push asks the payer to approve a PIN prompt on their
                handset, so the handset has to be theirs. Airtime is charged
                against the account's own verified number and the SuperApp
                does its own authentication, so neither goes through this. */}
            {payMethod === 'telebirr' && !isInSuperApp && (
              <div style={{ marginTop: 16 }}>
                <UssdOtpStep
                  purpose="coin_purchase"
                  reference={
                    selected._isCustom
                      ? { amount_etb: String(selected._priceEtb) }
                      : { package_id: selected.id }
                  }
                  onVerified={setOtpSessionId}
                  onReset={() => setOtpSessionId(null)}
                  disabled={Boolean(busy)}
                />
              </div>
            )}

            <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
              <button
                className="bc-primary"
                type="button"
                style={{ width: '100%' }}
                disabled={Boolean(busy) || !payMethod || !telebirrReady}
                onClick={payMethod === 'airtime' ? handleAirtimePurchase : handleTelebirrPurchase}
              >
                {busy
                  ? (<><Loader size={17} className="bc-spin" /> Processing</>)
                  : payMethod === 'airtime'
                    ? `Pay ${formatEtb(selected._priceEtb)} ETB from airtime`
                    : payMethod === 'telebirr'
                      ? `Pay ${formatEtb(selected._priceEtb)} ETB with telebirr`
                      : 'Select a payment method'}
              </button>
            </div>

            <p className="bc-hint" style={{ justifyContent: 'center', marginTop: 14 }}>
              <Lock size={12} /> Secured by telebirr
            </p>
          </div>
        </div>
      )}

      {/* ── Waiting for the USSD PIN ─────────────────────────────────── */}
      {awaitingUssd && (
        <div className="bc-overlay" role="dialog" aria-modal="true" aria-label="Waiting for payment">
          <div className="bc-sheet" style={{ textAlign: 'center' }}>
            <div className="bc-sheet-grab" aria-hidden="true" />
            <div
              style={{
                width: 64, height: 64, borderRadius: '50%', margin: '6px auto 18px',
                display: 'grid', placeItems: 'center',
                background: alpha(pri, 0.12), color: pri,
              }}
            >
              <Loader size={30} className="bc-spin" />
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Check your phone</h2>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
              Enter your telebirr PIN on {phoneNumber || 'your phone'} to approve the payment.
              Your coins are added automatically once it goes through.
            </p>
          </div>
        </div>
      )}

      {/* ── Result ───────────────────────────────────────────────────── */}
      {result && (() => {
        // Three outcomes, not two. The sheet used to be `ok` or not-ok, so a
        // payment still being confirmed could only be drawn as one of them --
        // and it was drawn as the successful one, tick and all.
        const succeeded = result.tone === 'success';
        const waiting = result.tone === 'pending';
        const accent = succeeded ? '#10B981' : waiting ? '#E2B355' : '#EF4444';
        const wash = succeeded
          ? 'rgba(16,185,129,.15)'
          : waiting
            ? 'rgba(226,179,85,.15)'
            : 'rgba(239,68,68,.15)';
        const heading = result.heading || (succeeded ? 'Payment successful' : 'Payment not completed');
        const closes = succeeded && result.done;

        return (
          <div
            className="bc-overlay"
            onClick={() => (closes ? finish() : setResult(null))}
            role="alertdialog"
            aria-modal="true"
            aria-label={heading}
          >
            <div className="bc-sheet" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
              <div className="bc-sheet-grab" aria-hidden="true" />
              <div
                data-payment-tone={result.tone}
                style={{
                  width: 64, height: 64, borderRadius: '50%', margin: '6px auto 18px',
                  display: 'grid', placeItems: 'center',
                  background: wash,
                  color: accent,
                }}
              >
                {succeeded ? <CheckCircle size={32} /> : waiting ? <Clock size={32} /> : <XCircle size={32} />}
              </div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{heading}</h2>
              <p style={{ margin: '10px 0 20px', fontSize: 14, color: T.sub, lineHeight: 1.55 }}>
                {result.message}
              </p>
              <button
                className={succeeded ? 'bc-primary' : 'bc-ghost'}
                type="button"
                style={{ width: '100%' }}
                onClick={() => (closes ? finish() : setResult(null))}
              >
                {closes ? 'Done' : 'Close'}
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
