import { useCallback, useEffect, useState } from 'react';
import {
  Coins, Building2, Trophy, Receipt, History, Save, Loader2, AlertCircle,
  Check, ShieldAlert, Sliders,
} from 'lucide-react';
import api from '../../../api';

/**
 * Super Admin: the ORGANIZATION coin economy.
 *
 * Distinct from admin/pages/financial/CoinManagementPage.jsx, which is the
 * platform wallet -- coin packages, engagement costs and manual balance
 * adjustments. That page is about the platform's own coin supply; this one
 * is about what each organization pays for engagement on its campaigns. They
 * are deliberately separate screens because they answer different questions
 * and are administered by different rules.
 *
 * Backend owns the numbers
 * ------------------------
 * Nothing here computes a coin total. Budgets, distributed amounts and
 * remainders all arrive from the API already reckoned -- a figure derived in
 * the browser could disagree with the ledger, and the ledger is what pays.
 *
 * Rewards are off
 * ---------------
 * `rewards_enabled` is False across the platform and nothing connects
 * engagement to award(). Several places below say so explicitly rather than
 * showing zeroes, because a zero reads as "nothing happened yet" when the
 * truth is "this is switched off".
 *
 * Ceilings are read, not assumed
 * ------------------------------
 * The maximum for each reward comes from /admin/coin-limits/. Hardcoding them
 * would let the form accept a value the backend then rejects, and the two
 * would drift the first time an administrator changed one.
 */

function describeError(err, fallback = 'Something went wrong. Please try again.') {
  const status = err?.status ?? err?.response?.status;
  const payload = err?.data || err?.response?.data;
  const serverMessage = payload?.error || payload?.detail || payload?.message;

  if (status === 403) return serverMessage || "You don't have permission to do that.";
  if (status === 404) return 'That organization or campaign could not be found.';
  if (status === 409) return serverMessage || 'That conflicts with the current state.';
  // 400 carries the backend's own validation text -- the ceiling it names is
  // more useful than anything this file could invent.
  if (status === 400) return serverMessage || 'Please check the values entered.';
  if (status >= 500) return 'Something went wrong on our end. Please try again.';
  return serverMessage || fallback;
}

const REWARD_FIELDS = [
  ['like_reward', 'Like reward', 'max_like_reward'],
  ['comment_reward', 'Comment reward', 'max_comment_reward'],
  ['share_reward', 'Share reward', 'max_share_reward'],
  ['gift_reward', 'Gift reward', 'max_gift_reward'],
];

const LIMIT_FIELDS = [
  ['max_reward_per_user', 'Maximum reward per user'],
  ['max_daily_reward_per_user', 'Maximum daily reward per user'],
  ['budget', 'Campaign budget'],
];

const TABS = [
  { id: 'overview', icon: Coins, label: 'Overview' },
  { id: 'organizations', icon: Building2, label: 'Organizations' },
  { id: 'campaigns', icon: Trophy, label: 'Campaigns' },
  { id: 'rewards', icon: Receipt, label: 'Reward Transactions' },
  { id: 'audit', icon: History, label: 'Audit Log' },
  { id: 'limits', icon: Sliders, label: 'Global Limits' },
];

export function OrganizationCoinManagementPage({ theme = {} }) {
  const T = theme;
  const [tab, setTab] = useState('overview');

  return (
    <div style={{ padding: 24, color: T.txt || '#111' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Coins size={22} color={T.pri || '#8fc441'} />
          Coin Management
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: T.sub || '#666' }}>
          Reward rates, budgets and ceilings. Separate from leaderboard scoring.
        </p>
      </header>

      <RewardsOffBanner T={T} />

      <nav
        aria-label="Coin management sections"
        style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}
      >
        {TABS.map(({ id, icon: Icon, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 700 : 500,
                border: `1px solid ${active ? 'transparent' : T.border || 'rgba(0,0,0,0.12)'}`,
                background: active ? `${T.pri || '#8fc441'}1f` : 'transparent',
                color: active ? T.pri || '#8fc441' : T.txt || '#111',
              }}
            >
              <Icon size={15} /> {label}
            </button>
          );
        })}
      </nav>

      {tab === 'overview' && <Overview T={T} />}
      {tab === 'organizations' && <Organizations T={T} />}
      {tab === 'campaigns' && <CampaignUsage T={T} />}
      {tab === 'rewards' && <RewardTransactions T={T} />}
      {tab === 'audit' && <AuditLog T={T} />}
      {tab === 'limits' && <GlobalLimits T={T} />}

      <style>{`
        @keyframes coin-spin-kf { to { transform: rotate(360deg); } }
        .coin-spin { animation: coin-spin-kf 0.9s linear infinite; }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RewardsOffBanner({ T }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 16px', borderRadius: 12, marginBottom: 18,
        background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
      }}
    >
      <ShieldAlert size={18} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 13 }}>
        <strong>Rewards are currently disabled.</strong>
        <div style={{ color: T.sub || '#666', marginTop: 2 }}>
          Engagement does not pay coins. Rates and budgets configured here take effect only
          once rewards are switched on, which is a deliberate change — nothing on this page
          enables them.
        </div>
      </div>
    </div>
  );
}

const card = (T) => ({
  background: T.cardBg || '#fff',
  border: `1px solid ${T.border || 'rgba(0,0,0,0.08)'}`,
  borderRadius: 14,
});

function Centered({ children, T }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: 48, color: T.sub || '#666', fontSize: 14,
    }}>
      {children}
    </div>
  );
}

function ErrorBlock({ message, onRetry, T }) {
  return (
    <div role="alert" style={{ ...card(T), padding: 20, borderColor: 'rgba(239,68,68,0.35)' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <AlertCircle size={18} color="#EF4444" />
        <div>
          <div style={{ fontWeight: 700 }}>Unable to load</div>
          <div style={{ fontSize: 13, color: T.sub || '#666', marginTop: 4 }}>{message}</div>
          {onRetry && (
            <button type="button" onClick={onRetry} style={ghost(T)}>Try again</button>
          )}
        </div>
      </div>
    </div>
  );
}

const ghost = (T) => ({
  marginTop: 12, padding: '8px 14px', borderRadius: 8,
  border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
  background: 'transparent', color: T.txt || '#111', cursor: 'pointer', fontSize: 13,
});

const input = (T) => ({
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9,
  border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
  background: T.inputBg || 'transparent', color: T.txt || '#111', fontSize: 14,
});

function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api.request(path));
    } catch (err) {
      setError(describeError(err));
      setData(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

/* ------------------------------------------------------------------ */

function Overview({ T }) {
  const orgs = useApi('/admin/coin-management/organizations/');

  if (orgs.loading) {
    return <Centered T={T}><Loader2 size={20} className="coin-spin" /><span>Loading coin overview…</span></Centered>;
  }
  if (orgs.error) return <ErrorBlock message={orgs.error} onRetry={orgs.reload} T={T} />;

  const rows = orgs.data?.results || [];
  // Summed from values the API already reckoned per organization; nothing here
  // derives a coin figure from raw engagement.
  const totals = rows.reduce(
    (acc, r) => ({
      organizations: acc.organizations + 1,
      active: acc.active + (r.organization.status === 'active' ? 1 : 0),
      campaigns: acc.campaigns + (r.campaigns || 0),
      budget: acc.budget + (r.budget || 0),
      distributed: acc.distributed + (r.distributed || 0),
    }),
    { organizations: 0, active: 0, campaigns: 0, budget: 0, distributed: 0 },
  );

  const tiles = [
    ['Organizations', totals.organizations],
    ['Active organizations', totals.active],
    ['Campaigns', totals.campaigns],
    ['Total budget', totals.budget.toLocaleString()],
    ['Distributed', totals.distributed.toLocaleString()],
    ['Remaining', Math.max(0, totals.budget - totals.distributed).toLocaleString()],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
      {tiles.map(([label, value]) => (
        <div key={label} style={{ ...card(T), padding: 18 }}>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
          <div style={{ fontSize: 12, color: T.sub || '#666', marginTop: 2 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Organizations({ T }) {
  const list = useApi('/admin/coin-management/organizations/');
  const limits = useApi('/admin/coin-limits/');
  const [selected, setSelected] = useState(null);

  if (list.loading || limits.loading) {
    return <Centered T={T}><Loader2 size={20} className="coin-spin" /><span>Loading organizations…</span></Centered>;
  }
  if (list.error) return <ErrorBlock message={list.error} onRetry={list.reload} T={T} />;

  const rows = list.data?.results || [];
  if (rows.length === 0) {
    return (
      <div style={{ ...card(T), padding: 48, textAlign: 'center' }}>
        <Building2 size={26} color={T.sub || '#999'} />
        <div style={{ marginTop: 12, fontWeight: 700 }}>No organizations yet</div>
      </div>
    );
  }

  return (
    <>
      <div style={{ ...card(T), overflowX: 'auto', marginBottom: 18 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: T.subtleBg || 'rgba(0,0,0,0.03)' }}>
              {['Organization', 'Code', 'Campaigns', 'Budget', 'Distributed', 'Remaining', 'Status', ''].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: T.sub || '#666', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.organization.id} style={{ borderTop: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}` }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.organization.name}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13 }}>{r.organization.code}</td>
                <td style={{ padding: '12px 16px' }}>{r.campaigns}</td>
                <td style={{ padding: '12px 16px' }}>{(r.budget || 0).toLocaleString()}</td>
                <td style={{ padding: '12px 16px' }}>{(r.distributed || 0).toLocaleString()}</td>
                <td style={{ padding: '12px 16px' }}>{r.remaining === null ? '—' : (r.remaining || 0).toLocaleString()}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: T.sub || '#666' }}>{r.organization.status}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button type="button" onClick={() => setSelected(r.organization)} style={{ ...ghost(T), marginTop: 0 }}>
                    Configure
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <ConfigEditor
          T={T}
          title={`${selected.name} — coin configuration`}
          path={`/admin/organizations/${selected.id}/coin-config/`}
          ceilings={limits.data || {}}
          onSaved={() => { list.reload(); }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The configuration form, shared by Super Admin and organization admins.
 *
 * `path` decides whose configuration is edited. For an organization admin it
 * is /organization/coin-config/, which carries no id at all -- the backend
 * takes the organization from the account, so there is nothing here that could
 * name another one.
 */
export function ConfigEditor({ T, title, path, ceilings = {}, readOnly = false, readOnlyReason = '', onSaved }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.request(path);
      setForm(res.configuration || {});
    } catch (err) {
      setError(describeError(err, 'Unable to load coin configuration.'));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);

  const set = (key) => (e) => {
    const raw = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: raw }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const localCheck = () => {
    const errors = {};
    for (const [key] of [...REWARD_FIELDS, ...LIMIT_FIELDS]) {
      const value = form?.[key];
      if (value === '' || value === null || value === undefined) continue;
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n)) errors[key] = 'Must be a whole number.';
      else if (n < 0) errors[key] = 'Cannot be negative.';
    }
    return errors;
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving || readOnly) return;

    // UX only. The backend re-validates and its answer is what counts --
    // notably the platform ceiling, which is enforced there.
    const errors = localCheck();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const payload = {};
      for (const [key] of [...REWARD_FIELDS, ...LIMIT_FIELDS]) {
        if (form?.[key] !== undefined && form[key] !== '') payload[key] = Number(form[key]);
      }
      payload.rewards_enabled = Boolean(form?.rewards_enabled);
      if (form?.reason) payload.reason = form.reason;

      const res = await api.request(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setForm(res.configuration || form);
      setNotice({
        kind: 'success',
        text: res.changes_recorded
          ? `Saved. ${res.changes_recorded} change${res.changes_recorded === 1 ? '' : 's'} recorded in the audit log.`
          : 'Saved. No values changed.',
      });
      onSaved?.();
    } catch (err) {
      // The backend's message names the ceiling that was exceeded; showing it
      // verbatim is more useful than a generic failure, and the entered value
      // is left alone rather than silently lowered.
      setNotice({ kind: 'error', text: describeError(err) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Centered T={T}><Loader2 size={20} className="coin-spin" /><span>Loading coin configuration…</span></Centered>;
  }
  if (error) return <ErrorBlock message={error} onRetry={load} T={T} />;

  return (
    <form onSubmit={save} style={{ ...card(T), padding: 20 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>{title}</h2>
      {readOnly && readOnlyReason && (
        <div role="status" style={{ margin: '10px 0', padding: '10px 12px', borderRadius: 9, fontSize: 13, background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          {readOnlyReason}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 18px', fontSize: 14 }}>
        <input
          type="checkbox"
          checked={Boolean(form?.rewards_enabled)}
          onChange={set('rewards_enabled')}
          disabled={readOnly}
        />
        <span>
          <strong>Rewards enabled</strong>
          <span style={{ display: 'block', fontSize: 12, color: T.sub || '#666' }}>
            Off across the platform. Turning this on begins paying coins for engagement.
          </span>
        </span>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {REWARD_FIELDS.map(([key, label, ceilingKey]) => {
          const ceiling = ceilings?.[ceilingKey];
          return (
            <div key={key}>
              <label htmlFor={`cc-${key}`} style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                {label}
              </label>
              <input
                id={`cc-${key}`}
                type="number"
                min="0"
                value={form?.[key] ?? 0}
                onChange={set(key)}
                disabled={readOnly}
                style={input(T)}
              />
              {/* From /admin/coin-limits/, never hardcoded -- otherwise the
                  hint would drift the moment an administrator changed it. */}
              {ceiling !== undefined && (
                <div style={{ marginTop: 4, fontSize: 11, color: T.sub || '#666' }}>
                  Platform maximum: {ceiling}
                </div>
              )}
              {fieldErrors[key] && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#EF4444' }}>{fieldErrors[key]}</div>
              )}
            </div>
          );
        })}

        {LIMIT_FIELDS.map(([key, label]) => (
          <div key={key}>
            <label htmlFor={`cc-${key}`} style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              {label}
            </label>
            <input
              id={`cc-${key}`}
              type="number"
              min="0"
              value={form?.[key] ?? 0}
              onChange={set(key)}
              disabled={readOnly}
              style={input(T)}
            />
            <div style={{ marginTop: 4, fontSize: 11, color: T.sub || '#666' }}>0 means no limit.</div>
            {fieldErrors[key] && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#EF4444' }}>{fieldErrors[key]}</div>
            )}
          </div>
        ))}
      </div>

      {form?.distributed > 0 && (
        <div style={{ marginTop: 16, fontSize: 13, color: T.sub || '#666' }}>
          Distributed so far: <strong>{form.distributed.toLocaleString()}</strong>
          {form.remaining_budget !== null && form.remaining_budget !== undefined && (
            <> · Remaining: <strong>{form.remaining_budget.toLocaleString()}</strong></>
          )}
        </div>
      )}

      {!readOnly && (
        <div style={{ marginTop: 16 }}>
          <label htmlFor="cc-reason" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
            Reason for this change
          </label>
          <input
            id="cc-reason"
            value={form?.reason || ''}
            onChange={set('reason')}
            placeholder="Recorded in the audit log"
            style={input(T)}
          />
        </div>
      )}

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 9, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
            background: notice.kind === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            color: notice.kind === 'error' ? '#EF4444' : '#10B981',
          }}
        >
          {notice.kind === 'error' ? <AlertCircle size={15} /> : <Check size={15} />}
          {notice.text}
        </div>
      )}

      {!readOnly && (
        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: 18, padding: '10px 18px', borderRadius: 10, border: 'none',
            background: T.pri || '#8fc441', color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          {saving ? <><Loader2 size={15} className="coin-spin" /> Saving…</> : <><Save size={15} /> Save configuration</>}
        </button>
      )}
    </form>
  );
}

/* ------------------------------------------------------------------ */

function CampaignUsage({ T }) {
  const usage = useApi('/coin-usage/');

  if (usage.loading) {
    return <Centered T={T}><Loader2 size={20} className="coin-spin" /><span>Loading campaign budgets…</span></Centered>;
  }
  if (usage.error) return <ErrorBlock message={usage.error} onRetry={usage.reload} T={T} />;

  const rows = usage.data?.campaigns || [];
  if (rows.length === 0) {
    return (
      <div style={{ ...card(T), padding: 48, textAlign: 'center' }}>
        <Trophy size={26} color={T.sub || '#999'} />
        <div style={{ marginTop: 12, fontWeight: 700 }}>No campaigns have coin configuration yet</div>
      </div>
    );
  }

  return (
    <div style={{ ...card(T), overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
        <thead>
          <tr style={{ background: T.subtleBg || 'rgba(0,0,0,0.03)' }}>
            {['Campaign', 'Organization', 'Budget', 'Distributed', 'Remaining', 'Rewards'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: T.sub || '#666' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.campaign.id} style={{ borderTop: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}` }}>
              <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.campaign.title}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: T.sub || '#666' }}>
                {r.organization?.name || 'Platform'}
              </td>
              <td style={{ padding: '12px 16px' }}>{(r.budget || 0).toLocaleString()}</td>
              <td style={{ padding: '12px 16px' }}>{(r.distributed || 0).toLocaleString()}</td>
              <td style={{ padding: '12px 16px' }}>{r.remaining === null ? '—' : (r.remaining || 0).toLocaleString()}</td>
              <td style={{ padding: '12px 16px' }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: r.rewards_enabled ? 'rgba(16,185,129,0.14)' : 'rgba(107,114,128,0.14)',
                  color: r.rewards_enabled ? '#10B981' : '#6B7280',
                }}>
                  {r.rewards_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RewardTransactions({ T }) {
  const grants = useApi('/coin-rewards/');

  if (grants.loading) {
    return <Centered T={T}><Loader2 size={20} className="coin-spin" /><span>Loading reward transactions…</span></Centered>;
  }
  if (grants.error) return <ErrorBlock message={grants.error} onRetry={grants.reload} T={T} />;

  const rows = grants.data?.results || [];
  if (rows.length === 0) {
    // Expected, not a failure: rewards are off, so no grant exists. Saying so
    // is more honest than an empty table that looks like a loading bug.
    return (
      <div style={{ ...card(T), padding: 48, textAlign: 'center' }}>
        <Receipt size={26} color={T.sub || '#999'} />
        <div style={{ marginTop: 12, fontWeight: 700 }}>No reward transactions yet.</div>
        <div style={{ marginTop: 4, fontSize: 13, color: T.sub || '#666' }}>
          Rewards are disabled, so engagement is not paying coins.
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...card(T), overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
        <thead>
          <tr style={{ background: T.subtleBg || 'rgba(0,0,0,0.03)' }}>
            {['User', 'Campaign', 'Engagement', 'Coins', 'Status', 'Created'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: T.sub || '#666' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}` }}>
              <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.user}</td>
              <td style={{ padding: '12px 16px' }}>{r.campaign.title}</td>
              <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>{r.action}</td>
              <td style={{ padding: '12px 16px' }}>{r.coins}</td>
              <td style={{ padding: '12px 16px', color: '#10B981', fontWeight: 600 }}>Granted</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: T.sub || '#666' }}>
                {new Date(r.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AuditLog({ T }) {
  const audit = useApi('/coin-audit/');

  if (audit.loading) {
    return <Centered T={T}><Loader2 size={20} className="coin-spin" /><span>Loading audit log…</span></Centered>;
  }
  if (audit.error) return <ErrorBlock message={audit.error} onRetry={audit.reload} T={T} />;

  const rows = audit.data?.results || [];
  if (rows.length === 0) {
    return (
      <div style={{ ...card(T), padding: 48, textAlign: 'center' }}>
        <History size={26} color={T.sub || '#999'} />
        <div style={{ marginTop: 12, fontWeight: 700 }}>No configuration changes recorded yet.</div>
      </div>
    );
  }

  return (
    <div style={{ ...card(T), overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead>
          <tr style={{ background: T.subtleBg || 'rgba(0,0,0,0.03)' }}>
            {['Organization', 'Campaign', 'Field', 'Change', 'Changed by', 'Reason', 'Date'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: T.sub || '#666' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderTop: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}` }}>
              <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.organization?.name || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: T.sub || '#666' }}>{r.campaign?.title || 'Organization default'}</td>
              <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12 }}>{r.field}</td>
              <td style={{ padding: '12px 16px' }}>
                <span style={{ color: T.sub || '#666' }}>{r.previous_value}</span>
                {' → '}
                <strong>{r.new_value}</strong>
              </td>
              <td style={{ padding: '12px 16px', fontSize: 13 }}>{r.changed_by || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: T.sub || '#666' }}>{r.reason || '—'}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: T.sub || '#666' }}>
                {new Date(r.changed_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function GlobalLimits({ T }) {
  const { data, loading, error, reload } = useApi('/admin/coin-limits/');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => { if (data) setForm(data); }, [data]);

  if (loading) {
    return <Centered T={T}><Loader2 size={20} className="coin-spin" /><span>Loading global limits…</span></Centered>;
  }
  if (error) return <ErrorBlock message={error} onRetry={reload} T={T} />;

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload = {};
      for (const [, , key] of REWARD_FIELDS) payload[key] = Number(form?.[key] ?? 0);
      const res = await api.request('/admin/coin-limits/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setForm(res);
      setNotice({ kind: 'success', text: 'Global limits saved.' });
    } catch (err) {
      setNotice({ kind: 'error', text: describeError(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} style={{ ...card(T), padding: 20, maxWidth: 560 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Global coin limits</h2>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: T.sub || '#666' }}>
        The most any organization may pay per engagement. Enforced by the backend — an
        organization exceeding a ceiling is refused, not silently lowered.
      </p>

      {REWARD_FIELDS.map(([, label, key]) => (
        <div key={key} style={{ marginBottom: 14 }}>
          <label htmlFor={`gl-${key}`} style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
            Maximum {label.toLowerCase()}
          </label>
          <input
            id={`gl-${key}`}
            type="number"
            min="0"
            value={form?.[key] ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            style={input(T)}
          />
        </div>
      ))}

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          style={{
            marginBottom: 14, padding: '10px 14px', borderRadius: 9, fontSize: 13,
            background: notice.kind === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            color: notice.kind === 'error' ? '#EF4444' : '#10B981',
          }}
        >
          {notice.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        style={{
          padding: '10px 18px', borderRadius: 10, border: 'none',
          background: T.pri || '#8fc441', color: '#fff', fontWeight: 700, fontSize: 14,
          cursor: saving ? 'not-allowed' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}
      >
        {saving ? <><Loader2 size={15} className="coin-spin" /> Saving…</> : <><Save size={15} /> Save limits</>}
      </button>
    </form>
  );
}

export default OrganizationCoinManagementPage;
