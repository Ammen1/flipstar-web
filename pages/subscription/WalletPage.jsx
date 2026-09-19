import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, Coins, ArrowDownToLine, ArrowUpFromLine, Gift,
  TrendingUp, TrendingDown, Calendar, Clock, CheckCircle2,
  XCircle, AlertCircle, Loader, ChevronLeft, RefreshCw,
  CreditCard, Smartphone, Building2, ChevronRight, X, Repeat,
} from 'lucide-react';
import api from '../../api';
import telebirrH5 from '../../services/TelebirrH5Service';
import { extractErrorMessage } from '../../utils/authErrors';

/**
 * Full user wallet with:
 * - Earned vs Purchased balance display
 * - Transaction history (paginated)
 * - Coin → Birr withdrawal flow
 * - Top-up via telebirr (placeholder for payment flow)
 *
 * All amounts shown in coins; conversion to ETB displayed where relevant.
 * No dollar signs anywhere — Birr only.
 */
const CACHE_KEY = 'wallet_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, summary, config } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return { summary, config };
  } catch { return null; }
}

function writeCache(summary, config) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), summary, config }));
  } catch {}
}

// This page was written against its own light-mode `defaultTheme()`, which
// defines `card` and is only used when no theme is passed. The app's real theme
// exposes `cardBg` and has no `mode`, so `T.card` was undefined at every use and
// `T.mode` never equalled 'dark' — which is why the modal fell through to its
// white fallback and the soft panels picked light-theme colours inside a dark
// app. Normalise once here so every reference below resolves correctly.
function normalizeWalletTheme(raw) {
  const bg = raw.bg || '#0D0D0D';
  const isDark = (() => {
    const h = String(bg).trim().replace('#', '');
    if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return true;
    const n = parseInt(h, 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
  })();
  return {
    ...raw,
    card: raw.card || raw.cardBg || (isDark ? '#1A1A1A' : '#FFFFFF'),
    mode: raw.mode || (isDark ? 'dark' : 'light'),
  };
}

export function WalletPage({ theme, onBack, onShowCoinPurchase }) {
  const T = useMemo(() => normalizeWalletTheme(theme || defaultTheme()), [theme]);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 1024);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 480);
  const [isTablet, setIsTablet] = useState(window.innerWidth >= 480 && window.innerWidth < 768);
  const [activeTab, setActiveTab] = useState('overview'); // overview | transactions | withdrawals

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth > 1024);
      setIsMobile(window.innerWidth < 480);
      setIsTablet(window.innerWidth >= 480 && window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Seed from cache instantly — no loading flash on revisit
  const cached = readCache();
  const [summary, setSummary] = useState(cached?.summary || null);
  const [config, setConfig] = useState(cached?.config || null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(!cached); // skip loading if cache hit
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showReinvestModal, setShowReinvestModal] = useState(false);

  useEffect(() => {
    if (cached) {
      // Cache hit: paint immediately, refresh silently in background
      loadAll(true);
    } else {
      loadAll(false);
    }
  }, []);

  // Listen for wallet balance changes (e.g., after sending a gift) and refresh
  useEffect(() => {
    const handleWalletBalanceChanged = () => {
      loadAll(true); // silent refresh
    };
    window.addEventListener('walletBalanceChanged', handleWalletBalanceChanged);
    return () => window.removeEventListener('walletBalanceChanged', handleWalletBalanceChanged);
  }, []);

  async function loadAll(silent = false) {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError('');
      const [s, c] = await Promise.all([
        api.request('/wallet/'),
        api.request('/wallet/config/'),
      ]);
      setSummary(s);
      setConfig(c);
      writeCache(s, c);
    } catch (err) {
      console.error('Wallet load failed:', err);
      if (!silent) setError(err.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadTransactions() {
    try {
      const data = await api.request('/wallet/transactions/?page_size=50');
      setTransactions(data.results || []);
    } catch (err) {
      console.error('Transactions load failed:', err);
    }
  }

  async function loadWithdrawals() {
    try {
      const data = await api.request('/wallet/withdrawals/');
      setWithdrawals(data.results || []);
    } catch (err) {
      console.error('Withdrawals load failed:', err);
    }
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    if (tab === 'transactions' && transactions.length === 0) loadTransactions();
    if (tab === 'withdrawals' && withdrawals.length === 0) loadWithdrawals();
  }

  if (loading) {
    return (
      <div style={{ ...styles.container, background: T.bg }}>
        {/* Header with back button always available */}
        <div style={{ ...styles.header, background: T.card, borderColor: T.border }}>
          {onBack && (
            <button aria-label="Go back" onClick={onBack} style={styles.backBtn}>
              <ChevronLeft size={24} color={T.txt} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <Wallet size={22} color={T.pri} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.txt }}>My Wallet</h2>
          </div>
        </div>
        {/* Skeleton cards */}
        <div style={{ padding: 16 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 80, borderRadius: 14, background: T.card, marginBottom: 12,
              animation: 'pulse 1.5s ease-in-out infinite alternate' }} />
          ))}
          <style>{`@keyframes pulse{from{opacity:1}to{opacity:0.5}}`}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...styles.container, background: T.bg, padding: 20 }}>
        <div style={{ ...styles.header, background: T.card, borderColor: T.border }}>
          {onBack && (
            <button aria-label="Go back" onClick={onBack} style={styles.backBtn}>
              <ChevronLeft size={24} color={T.txt} />
            </button>
          )}
        </div>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <AlertCircle size={40} color={T.red || '#EF4444'} />
          <p style={{ color: T.txt, marginTop: 16 }}>{error}</p>
          <button onClick={() => loadAll(false)} style={{ ...btnPrimary(T), marginTop: 16 }}>
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const balance = summary?.balance || { total: 0, earned: 0, purchased: 0, telebirr_purchased: 0, airtime_purchased: 0 };
  const points = summary?.points || { current: 0, earned_total: 0, withdrawn_total: 0 };
  const totals = summary?.totals || {};
  const withdrawal = summary?.withdrawal || {};

  return (
    <div style={{ background: T.bg, width: '100%', minHeight: '100%' }}>
      <div style={styles.container}>
        {/* Header */}
        <div style={{ ...styles.header, background: T.card, borderColor: T.border }}>
          {onBack && (
            <button aria-label="Go back" onClick={onBack} style={styles.backBtn}>
              <ChevronLeft size={24} color={T.txt} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <Wallet size={22} color={T.pri} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.txt }}>
              My Wallet
            </h2>
          </div>
          <button onClick={() => loadAll(false)} style={styles.iconBtn}>
            <RefreshCw size={18} color={T.sub} className={refreshing ? 'spin' : ''} />
          </button>
        </div>

        {/* Content flows into the app shell's own scroll container. This used
            to be `flex:1; overflowY:auto`, a second scroller nested inside
            <main> -- which is what drew the extra scrollbar down the right of
            the page and gave the wallet two competing scroll positions. */}
        <div style={{ paddingBottom: 40 }}>
          {/* Three Horizontal Dashboard Cards */}
          <div style={{
            padding: '16px',
            display: 'grid',
            gridTemplateColumns: window.innerWidth < 480 ? '1fr' : (window.innerWidth < 768 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)'),
            gap: 12,
          }}>
        {/* Card 1: Coins */}
        <div style={heroCard(T, '#8fc441')}>
          <span style={heroAccentBar('#8fc441')} />
          <div style={heroLabel(T, '#8fc441')}>
            <Coins size={14} /> Coins
          </div>
          <div style={heroValue(T)}>
            {formatNumber(balance.total)}
          </div>
          <div style={heroCaption(T)}>Total Coins</div>
          <div style={heroFoot(T)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, lineHeight: 1.3 }}>
              <span style={{ opacity: 0.8 }}>Earned</span>
              <strong>{formatNumber(balance.earned)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, lineHeight: 1.3 }}>
              <span style={{ opacity: 0.8 }}>Telebirr</span>
              <strong>{formatNumber(balance.telebirr_purchased)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, lineHeight: 1.3 }}>
              <span style={{ opacity: 0.8 }}>Airtime</span>
              <strong>{formatNumber(balance.airtime_purchased)}</strong>
            </div>
          </div>
        </div>

        {/* Card 2: Points */}
        <div style={heroCard(T, '#A78BFA')}>
          <span style={heroAccentBar('#A78BFA')} />
          <div style={heroLabel(T, '#A78BFA')}>
            <Gift size={14} /> Points
          </div>
          <div style={heroValue(T)}>
            {formatNumber(points.current)}
          </div>
          <div style={heroCaption(T)}>Current Balance</div>
          <div style={heroFoot(T)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, lineHeight: 1.3 }}>
              <span style={{ opacity: 0.85 }}>Earned Total</span>
              <strong>{formatNumber(points.earned_total)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, lineHeight: 1.3 }}>
              <span style={{ opacity: 0.85 }}>From Gifts</span>
              <strong>{formatNumber(points.earned_total)}</strong>
            </div>
          </div>
        </div>

        {/* Card 3: Withdrawal */}
        <div style={heroCard(T, '#34D399')}>
          <span style={heroAccentBar('#34D399')} />
          <div style={heroLabel(T, '#34D399')}>
            <ArrowUpFromLine size={14} /> Withdraw
          </div>
          <div style={heroValue(T)}>
            {pointsToBirr(points.current, config?.points_per_birr).toFixed(2)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2, lineHeight: 1.3 }}>ETB Available</div>
          <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, lineHeight: 1.3 }}>
              <span style={{ opacity: 0.85 }}>Min</span>
              <strong>{config?.withdrawal_min_points || 100} pts</strong>
            </div>
            <button
              onClick={() => setShowWithdrawModal(true)}
              disabled={(points.current || 0) < (config?.withdrawal_min_points || 100)}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)',
                fontSize: 11,
                fontWeight: 700,
                cursor: (points.current || 0) >= (config?.withdrawal_min_points || 100) ? 'pointer' : 'not-allowed',
                opacity: (points.current || 0) >= (config?.withdrawal_min_points || 100) ? 1 : 0.5,
              }}
            >
              Withdraw
            </button>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <button
          onClick={onShowCoinPurchase}
          style={btnPrimary(T)}
        >
          <ArrowDownToLine size={18} /> Buy Coins
        </button>
        <button
          onClick={() => setShowReinvestModal(true)}
          style={{
            ...btnSecondary(T),
            background: T.pri,
            color: '#fff',
            borderColor: T.pri,
          }}
        >
          <Repeat size={18} /> Re-invest Points
        </button>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, marginTop: 20, padding: '0 16px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        {['overview', 'transactions', 'withdrawals'].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            style={{
              flex: isMobile ? '1 0 auto' : 1,
              padding: isMobile ? '10px 12px' : '12px 8px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${T.pri}` : '2px solid transparent',
              color: activeTab === tab ? T.pri : T.sub,
              fontSize: isMobile ? 13 : 14,
              fontWeight: activeTab === tab ? 700 : 500,
              cursor: 'pointer',
              textTransform: 'capitalize',
              minWidth: isMobile ? '80px' : 'auto',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: 16 }}>
        {activeTab === 'overview' && (
          <OverviewTab
            theme={T}
            totals={totals}
            withdrawal={withdrawal}
            recentTx={summary?.recent_transactions || []}
            config={config}
          />
        )}
        {activeTab === 'transactions' && (
          <TransactionsTab theme={T} transactions={transactions} />
        )}
        {activeTab === 'withdrawals' && (
          <WithdrawalsTab
            theme={T}
            withdrawals={withdrawals}
            onCancel={async (id) => {
              await api.request(`/wallet/withdrawals/${id}/cancel/`, { method: 'POST' });
              loadAll();
              loadWithdrawals();
            }}
          />
        )}
      </div>

      {/* Modals */}
      {showWithdrawModal && (
        <WithdrawModal
          theme={T}
          balance={balance}
          points={points}
          config={config}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={() => {
            setShowWithdrawModal(false);
            loadAll();
            loadWithdrawals();
          }}
        />
      )}

      {showReinvestModal && (
        <ReinvestModal
          theme={T}
          points={points}
          onClose={() => setShowReinvestModal(false)}
          onSuccess={() => {
            setShowReinvestModal(false);
            loadAll();
          }}
        />
      )}
        </div>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------

function OverviewTab({ theme: T, totals, withdrawal, recentTx, config }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 480);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 480);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div>
      {/* Lifetime stats */}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: T.txt, margin: '0 0 12px 0' }}>
        Lifetime Stats
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 24 }}>
        <StatBox theme={T} icon={<TrendingUp size={18} color="#10B981" />}
                 label="Total Earned" value={formatNumber(totals.lifetime_earned)} sub="coins" />
        <StatBox theme={T} icon={<TrendingDown size={18} color="#EF4444" />}
                 label="Total Spent" value={formatNumber(totals.lifetime_spent)} sub="coins" />
        <StatBox theme={T} icon={<CreditCard size={18} color={T.pri} />}
                 label="Telebirr Bought" value={formatNumber(totals.lifetime_telebirr_purchased || 0)} sub="coins" />
        <StatBox theme={T} icon={<CreditCard size={18} color="#3B82F6" />}
                 label="Airtime Bought" value={formatNumber(totals.lifetime_airtime_purchased || 0)} sub="coins" />
        <StatBox theme={T} icon={<CreditCard size={18} color="#8B5CF6" />}
                 label="Total Bought" value={formatNumber(totals.lifetime_purchased)} sub="coins" />
        <StatBox theme={T} icon={<ArrowUpFromLine size={18} color="#F59E0B" />}
                 label="Total Withdrawn" value={formatNumber(totals.lifetime_withdrawn)} sub="coins" />
      </div>

      {/* Withdrawal status */}
      {!withdrawal.eligible && (
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <AlertCircle size={20} color="#F59E0B" />
          <div style={{ flex: 1, fontSize: 13, color: T.sub }}>
            You need <strong style={{ color: T.txt }}>
              {(withdrawal.min_points ?? config?.withdrawal_min_points ?? 100).toLocaleString()}
            </strong> points to withdraw to Birr &mdash; you have{' '}
            <strong style={{ color: T.txt }}>
              {(withdrawal.current_points ?? totals?.points_current ?? 0).toLocaleString()}
            </strong>.
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: T.txt, margin: '0 0 12px 0' }}>
        Recent Activity
      </h3>
      {recentTx.length === 0 ? (
        <EmptyState theme={T} icon={<Coins size={32} />} title="No transactions yet" />
      ) : (
        /* Recent Activity flows with the page. Capping it at 400px made a
           scroll region inside a scroll region: the list drew its own bar and
           the wheel fought over which one moved. */
        <div>
          {recentTx.map((tx) => <TransactionRow key={tx.id} tx={tx} theme={T} />)}
        </div>
      )}
    </div>
  );
}

function TransactionsTab({ theme: T, transactions }) {
  if (transactions.length === 0) {
    return <EmptyState theme={T} icon={<Coins size={32} />} title="No transactions yet"
                       subtitle="Your coin activity will show here." />;
  }
  return (
    <div>
      {transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} theme={T} />)}
    </div>
  );
}

function WithdrawalsTab({ theme: T, withdrawals, onCancel }) {
  if (withdrawals.length === 0) {
    return <EmptyState theme={T} icon={<ArrowUpFromLine size={32} />} title="No withdrawals yet"
                       subtitle="When you convert points to Birr, requests show here." />;
  }
  return (
    <div>
      {withdrawals.map((w) => <WithdrawalRow key={w.id} w={w} theme={T} onCancel={onCancel} />)}
    </div>
  );
}

// ---------------------------------------------------------------
// Components
// ---------------------------------------------------------------

function StatBox({ theme: T, icon, label, value, sub }) {
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 12, color: T.sub, fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: T.txt, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

function TransactionRow({ tx, theme: T }) {
  const isCredit = tx.is_credit;
  const color = isCredit ? '#10B981' : '#EF4444';
  const isGift = tx.type === 'gift_sent' || tx.type === 'gift_received';
  const isPointTx = tx.type === 'gift_received';

  // Build a clear primary label
  let primaryLabel = tx.type_display;
  if (tx.type === 'gift_sent' && tx.other_user) {
    primaryLabel = `Gift sent to @${tx.other_user.username}`;
  } else if (tx.type === 'gift_received' && tx.other_user) {
    primaryLabel = `Gift received from @${tx.other_user.username}`;
  }

  const Icon = isGift ? Gift : (isCredit ? TrendingUp : TrendingDown);
  const unitLabel = isPointTx ? 'points' : 'coins';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px',
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: color + '15',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.txt, lineHeight: 1.3 }}>
          {primaryLabel}
        </div>
        <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.4, wordWrap: 'break-word' }}>
          {formatDate(tx.created_at)}{tx.description ? ` • ${tx.description}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color }}>
          {/* A transaction missing its amount must not white-screen the whole
              wallet. The API is not consistent about these names elsewhere
              (comment_count vs comments_count, votes vs likes_count), so an
              amount/coins divergence is a realistic way for this to break. */}
          {isCredit ? '+' : ''}{Number(tx.coins ?? tx.amount ?? 0).toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: T.sub }}>{unitLabel}</div>
      </div>
    </div>
  );
}

function WithdrawalRow({ w, theme: T, onCancel }) {
  const statusInfo = WITHDRAWAL_STATUS[w.status] || { color: T.sub, icon: Clock };
  const Icon = statusInfo.icon;
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: 14, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Icon size={18} color={statusInfo.color} />
        <span style={{ fontSize: 14, fontWeight: 700, color: statusInfo.color, lineHeight: 1.3 }}>
          {w.status_display}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: T.sub, lineHeight: 1.4 }}>
          {formatDate(w.created_at)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4, lineHeight: 1.4 }}>
        <Gift size={14} color={T.sub} />
        <span style={{ fontSize: 13, color: T.txt }}>
          {w.point_amount?.toLocaleString() || w.coin_amount?.toLocaleString()} points
        </span>
        <ChevronRight size={14} color={T.sub} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.pri }}>
          {Number(w.net_birr).toFixed(2)} ETB
        </span>
        <span style={{ fontSize: 11, color: T.sub }}>
          (fee {Number(w.fee_birr).toFixed(2)})
        </span>
      </div>
      <div style={{ fontSize: 12, color: T.sub }}>
        {w.payout_method_display} → {w.payout_account}
      </div>
      {w.rejection_reason && (
        <div style={{ marginTop: 8, padding: 8, background: '#FEE2E2', borderRadius: 6, fontSize: 12, color: '#991B1B' }}>
          Rejected: {w.rejection_reason}
        </div>
      )}
      {w.payout_reference && w.status === 'completed' && (
        <div style={{ marginTop: 8, fontSize: 11, color: T.sub }}>
          Reference: <code>{w.payout_reference}</code>
        </div>
      )}
      {w.can_cancel && (
        <button
          onClick={() => {
            if (confirm('Cancel this withdrawal? Points will be refunded.')) onCancel(w.id);
          }}
          style={{ ...btnSecondary(T), marginTop: 10, width: '100%' }}
        >
          Cancel Request
        </button>
      )}
    </div>
  );
}

function EmptyState({ theme: T, icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: T.sub }}>
      <div style={{ marginBottom: 12, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.txt, marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
    </div>
  );
}

// ---------------------------------------------------------------
// Withdraw Modal
// ---------------------------------------------------------------

function WithdrawModal({ theme: T, balance, points, config, onClose, onSuccess }) {
  const minPoints = config?.withdrawal_min_points || 100;
  const [amount, setAmount] = useState(minPoints);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const pointsPerBirr = config?.points_per_birr || 10;
  const feePercent = parseFloat(config?.withdrawal?.fee_percent || '5');
  const availablePoints = points?.current || 0;

  // Fetch user's phone number when modal opens
  useEffect(() => {
    const fetchPhoneNumber = async () => {
      try {
        const profile = await api.request('/profile/me/');
        if (profile && profile.phone_number) {
          setPhoneNumber(profile.phone_number);
        }
      } catch (error) {
        console.error('Failed to fetch phone number:', error);
      }
    };
    fetchPhoneNumber();
  }, []);

  // `feePercent` above already reads the rate from the API. The preview used
  // a hardcoded 0.20 anyway, so changing the fee in the admin would have left
  // it promising the old number while the receipt showed the new one.
  useEffect(() => {
    if (amount > 0) {
      const gross = amount / pointsPerBirr;
      const platformFee = gross * (feePercent / 100);
      const net = gross - platformFee;
      setPreview({ gross_birr: gross, platform_fee_birr: platformFee, net_birr: net });
    }
  }, [amount, pointsPerBirr, feePercent]);

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setError('');
      // The response carries the withdrawal itself -- reference, status,
      // amounts, destination. It used to be discarded and replaced with the
      // word "Success", which told the user nothing and, worse, was not true:
      // submitting only queues a payout, and the money has not moved yet.
      const result = await api.request('/wallet/withdraw/', {
        method: 'POST',
        body: JSON.stringify({
          point_amount: parseInt(amount),
          payout_method: 'telebirr',
          payout_account: phoneNumber,
          payout_account_name: '',
        }),
      });
      setReceipt((result && result.withdrawal) || null);
      setShowSuccessModal(true);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, 'Withdrawal failed. Please try again.'));
      setShowFailureModal(true);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSuccessClose() {
    setShowSuccessModal(false);
    setReceipt(null);
    onSuccess();
    onClose();
  }

  function handleFailureClose() {
    setShowFailureModal(false);
  }

  return (
    <>
      <Modal onClose={onClose} theme={T} title="Withdraw Points to Birr">
        <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#000000', fontWeight: 600, fontSize: 14, marginBottom: 8, display: 'block' }}>Amount in points</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={minPoints}
              max={availablePoints}
              style={{
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: 12,
                borderRadius: 8,
                border: `2px solid ${T.pri}`,
                background: '#FFFFFF',
                color: '#000000',
                fontSize: 16,
                fontWeight: 500,
              }}
            />
            <div style={{ fontSize: 12, color: '#000000', marginTop: 4, fontWeight: 500 }}>
              Min: {minPoints.toLocaleString()} • Available: {availablePoints.toLocaleString()} points
            </div>
          </div>

          {preview && (
            <div style={{
              background: '#FFFFFF', border: `2px solid ${T.pri}`, borderRadius: 12,
              padding: 16, marginBottom: 16, maxWidth: '100%', overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#000000', fontSize: 14 }}>Gross amount</span>
                <span style={{ color: '#000000', fontSize: 14, fontWeight: 600 }}>{preview.gross_birr.toFixed(2)} ETB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#000000', fontSize: 14 }}>Platform fee ({feePercent}%)</span>
                <span style={{ color: '#000000', fontSize: 14, fontWeight: 600 }}>-{preview.platform_fee_birr.toFixed(2)} ETB</span>
              </div>
              <div style={{ borderTop: `1px solid ${T.pri}`, margin: '10px 0 0', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ color: '#000000', fontSize: 14, fontWeight: 800 }}>You receive</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <strong style={{ color: '#000000', fontSize: 24, fontWeight: 900, lineHeight: 1 }}>
                      {preview.net_birr.toFixed(2)}
                    </strong>
                    <span style={{ color: '#000000', fontSize: 13, fontWeight: 800 }}>ETB</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: '#FEE2E2', color: '#991B1B',
                border: '1px solid rgba(239,68,68,0.45)',
                padding: '12px 14px', borderRadius: 12, marginBottom: 14,
                fontSize: 13, fontWeight: 600, lineHeight: 1.45,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, maxWidth: '100%' }}>
            <button 
              onClick={onClose} 
              disabled={submitting}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 8,
                border: `2px solid ${T.pri}`,
                background: '#FFFFFF',
                color: '#000000',
                fontSize: 14,
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit} 
              disabled={submitting || !amount || amount < minPoints || amount > availablePoints} 
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 8,
                border: `2px solid ${T.pri}`,
                background: T.pri,
                color: '#000000',
                fontSize: 14,
                fontWeight: 600,
                cursor: (submitting || !amount || amount < minPoints || amount > availablePoints) ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Processing...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Success Modal */}
      {showSuccessModal && (
        <div
          onClick={() => {}}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, #10B981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <CheckCircle2 size={40} color="#fff" strokeWidth={3} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
            {receipt && receipt.status === 'completed' ? 'Paid' : 'Withdrawal requested'}
          </div>
          <div style={{ fontSize: 13, color: '#bbb', marginBottom: 18, textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
            {receipt && receipt.status === 'completed'
              ? 'The money has been sent to your telebirr wallet.'
              : 'Your points have been deducted and the payout is on its way. The money reaches your telebirr wallet once it is confirmed — you will get an SMS either way.'}
          </div>

          {receipt && (
            <div style={{
              width: 'min(340px, 90vw)', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14, padding: 16, marginBottom: 18,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {[
                ['Reference', `#${receipt.id}`],
                ['Status', receipt.status_display || receipt.status],
                ['Points withdrawn', receipt.point_amount != null ? `${receipt.point_amount} pts` : null],
                ['Gross', receipt.gross_birr != null ? `${Number(receipt.gross_birr).toFixed(2)} ETB` : null],
                ['Platform fee', receipt.fee_birr != null ? `-${Number(receipt.fee_birr).toFixed(2)} ETB` : null],
                ['Method', receipt.payout_method_display || receipt.payout_method],
                ['Sent to', receipt.payout_account],
                ['Requested', receipt.created_at ? new Date(receipt.created_at).toLocaleString() : null],
                // Only once telebirr has actually confirmed it; blank before
                // then, rather than an empty row that looks like a bug.
                ['telebirr reference', receipt.payout_reference || null],
              ]
                .filter(([, value]) => value != null && value !== '')
                .map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                    <span style={{ color: '#9a9a9a', fontWeight: 600 }}>{label}</span>
                    <span style={{ color: '#fff', fontWeight: 700, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
                  </div>
                ))}

              <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '2px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>You receive</span>
                <span style={{ color: '#34D399', fontWeight: 900, fontSize: 16 }}>
                  {receipt.net_birr != null ? `${Number(receipt.net_birr).toFixed(2)} ETB` : '—'}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={handleSuccessClose}
            style={{
              padding: '12px 32px', borderRadius: 24, fontSize: 14, fontWeight: 700,
              background: T.pri, color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      )}

      {/* Failure Modal */}
      {showFailureModal && (
        <div
          onClick={() => {}}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, #EF4444, #DC2626)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <XCircle size={40} color="#fff" strokeWidth={3} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 20 }}>
            Failed
          </div>
          <button
            onClick={handleFailureClose}
            style={{
              padding: '12px 32px', borderRadius: 24, fontSize: 14, fontWeight: 700,
              background: T.pri, color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Re-invest Points Modal (Points to Coins)
// ---------------------------------------------------------------

function ReinvestModal({ theme: T, points, onClose, onSuccess }) {
  const [amount, setAmount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const availablePoints = points?.current || 0;

  const handleReinvest = async () => {
    if (amount < 1 || amount > availablePoints) {
      setError('Invalid amount');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await api.request('/wallet/reinvest/', {
        method: 'POST',
        body: JSON.stringify({ points: parseInt(amount) }),
      });
      onSuccess();
    } catch (err) {
      setError(extractErrorMessage(err, 'Conversion failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const ACCENT = '#8fc441';        // brand green
  const ACCENT_DARK = '#6fa730';
  const SOFT_BG = T.mode === 'dark' ? '#1F2A1A' : '#F4FBEB';
  const SOFT_BORDER = T.mode === 'dark' ? '#2E3D24' : '#D8ECC0';

  return (
    <Modal onClose={onClose} theme={T} title="Re-invest Points to Coins">
      <div>
        {/* Conversion banner */}
        <div style={{
          background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,
          borderRadius: 14, padding: '14px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#fff', boxShadow: '0 4px 14px rgba(143,196,65,0.25)',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, letterSpacing: 0.5 }}>RATE</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>1 Point → 1 Coin</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
            {availablePoints.toLocaleString()} pts available
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={modalLabel(T)}>Points to convert</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (isNaN(value) || value < 0) {
                setAmount(0);
              } else {
                setAmount(value);
              }
            }}
            min="0"
            max={availablePoints}
            style={{
              ...modalInput(T),
              borderColor: SOFT_BORDER,
            }}
          />
        </div>

        <div style={{
          background: SOFT_BG, border: `1px solid ${SOFT_BORDER}`, borderRadius: 14,
          padding: '16px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.sub || '#8a8a8a' }}>
            You will receive
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <strong style={{ fontSize: 24, fontWeight: 900, color: ACCENT, lineHeight: 1 }}>
              {amount.toLocaleString()}
            </strong>
            <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT }}>coins</span>
          </span>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.35)',
              color: T.mode === 'dark' ? '#FCA5A5' : '#991B1B',
              padding: '12px 14px', borderRadius: 12, marginBottom: 14,
              fontSize: 13, fontWeight: 600, lineHeight: 1.45,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={submitting} style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.bg,
            color: T.txt,
            fontSize: 14,
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}>
            Cancel
          </button>
          <button
            onClick={handleReinvest}
            disabled={submitting || amount < 1 || amount > availablePoints}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              background: (submitting || amount < 1 || amount > availablePoints)
                ? '#9CA3AF'
                : `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: (submitting || amount < 1 || amount > availablePoints) ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(143,196,65,0.3)',
            }}
          >
            {submitting ? 'Converting...' : 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------
// Generic Modal
// ---------------------------------------------------------------

function Modal({ children, onClose, theme: T, title }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.card || (T.mode === 'dark' ? '#1a1a1a' : '#ffffff'),
          border: `1px solid ${T.border}`,
          borderRadius: 18, padding: 20,
          width: '100%', maxWidth: 460, maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, flex: 1, fontSize: 18, fontWeight: 700, color: T.txt }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: 999,
              cursor: 'pointer',
              padding: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} color={T.txt} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, theme: T, muted, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 13, color: T.sub }}>{label}</span>
      <span style={{
        fontSize: bold ? 16 : 14,
        fontWeight: bold ? 700 : 500,
        color: muted ? T.sub : T.txt,
      }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------
// Helpers / styles
// ---------------------------------------------------------------

const WITHDRAWAL_STATUS = {
  pending: { color: '#F59E0B', icon: Clock },
  approved: { color: '#3B82F6', icon: CheckCircle2 },
  processing: { color: '#3B82F6', icon: Loader },
  completed: { color: '#10B981', icon: CheckCircle2 },
  rejected: { color: '#EF4444', icon: XCircle },
  cancelled: { color: '#6B7280', icon: XCircle },
};

function formatNumber(n) {
  if (n == null) return '0';
  return n.toLocaleString();
}

function coinsToBirr(coins, coinsPerBirr) {
  if (!coinsPerBirr || coinsPerBirr <= 0) return 0;
  return coins / coinsPerBirr;
}

function pointsToBirr(points, pointsPerBirr) {
  if (!pointsPerBirr || pointsPerBirr <= 0) return 0;
  return points / pointsPerBirr;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Hero metric cards share the app's dark card surface; the metric's hue is
// carried by the icon, the number and a hairline accent rather than by a
// full-bleed gradient. Three saturated gradient panels read as three unrelated
// widgets next to the dark cards further down the same page.
function heroCard(T, accent) {
  return {
    position: 'relative',
    padding: 18,
    borderRadius: 16,
    background: T.card,
    border: `1px solid ${T.border}`,
    boxShadow: '0 1px 2px rgba(0,0,0,.28)',
    color: T.txt,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 172,
    overflow: 'hidden',
  };
}

function heroAccentBar(accent) {
  return {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    background: accent,
  };
}

const heroLabel = (T, accent) => ({
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6,
  textTransform: 'uppercase', color: accent,
});

const heroValue = (T) => ({
  fontSize: 34, fontWeight: 800, marginTop: 8, lineHeight: 1.05,
  letterSpacing: '-0.02em', color: T.txt, fontVariantNumeric: 'tabular-nums',
});

const heroCaption = (T) => ({ fontSize: 11.5, color: T.sub, marginTop: 3, lineHeight: 1.3 });

const heroFoot = (T) => ({
  marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${T.border}`,
});

const heroRow = (T) => ({
  display: 'flex', justifyContent: 'space-between', gap: 10,
  fontSize: 11.5, marginBottom: 4, lineHeight: 1.35, color: T.sub,
  fontVariantNumeric: 'tabular-nums',
});

function defaultTheme() {
  return {
    bg: '#F9FAFB', card: '#FFFFFF', txt: '#111827', sub: '#6B7280',
    border: '#E5E7EB', pri: '#7C3AED', red: '#EF4444',
  };
}

const styles = {
  container: {
    minHeight: '100%',
    paddingBottom: 120,
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 16px', borderBottom: '1px solid',
    flexShrink: 0
  },
  backBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 6 },
};

const btnPrimary = (T) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 16px', borderRadius: 12, border: 'none',
  background: T.pri, color: 'white', fontSize: 14, fontWeight: 700,
  cursor: 'pointer',
});

const btnSecondary = (T) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '12px 16px', borderRadius: 12,
  border: `1px solid ${T.border}`, background: T.card, color: T.txt,
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
});

const modalLabel = (T) => ({
  display: 'block', fontSize: 13, fontWeight: 600, color: T.sub, marginBottom: 6,
});

const modalInput = (T) => ({
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: `1px solid ${T.border}`, background: T.bg, color: T.txt,
  fontSize: 15, outline: 'none', boxSizing: 'border-box',
});

export default WalletPage;




