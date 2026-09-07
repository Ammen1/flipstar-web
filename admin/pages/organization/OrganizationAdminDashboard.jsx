import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard, Trophy, BarChart3, Building2, Plus, Send, Check, X,
  Loader2, AlertCircle, FileText, Coins,
} from 'lucide-react';
import api from '../../../api';
import { ConfigEditor } from '../coin/OrganizationCoinManagementPage';

/**
 * The dashboard an ORGANIZATION-realm user sees.
 *
 * Deliberately not the Super Admin shell
 * --------------------------------------
 * This is a separate component rather than the admin sidebar with items hidden.
 * Hiding a nav item is a rendering decision; a user who guesses a page id would
 * still reach the component. Serving a different component means the Super
 * Admin pages are never mounted for an organization account at all.
 *
 * That is still not the security boundary. Every endpoint below is scoped
 * server-side -- an organization id from another company is answered 404 by
 * the API regardless of what this file renders.
 *
 * Sections present here are only those with organization-scoped backends:
 * dashboard, campaigns, analytics, organization profile. Campaign posts and
 * leaderboard hang off a selected campaign, which is itself scoped.
 */

function describeError(err, fallback = 'Something went wrong. Please try again.') {
  const status = err?.status ?? err?.response?.status;
  const payload = err?.data || err?.response?.data;
  const serverMessage = payload?.error || payload?.detail || payload?.message;

  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return 'That campaign could not be found in your organization.';
  if (status === 409) return serverMessage || 'That action conflicts with the current state.';
  if (status === 400) return serverMessage || 'Please check the highlighted fields.';
  if (status >= 500) return 'Something went wrong on our end. Please try again.';
  return serverMessage || fallback;
}

const STATUS_STYLES = {
  draft: { bg: 'rgba(107,114,128,0.14)', fg: '#6B7280', label: 'Draft' },
  submitted: { bg: 'rgba(245,158,11,0.14)', fg: '#F59E0B', label: 'Submitted' },
  approved: { bg: 'rgba(59,130,246,0.14)', fg: '#3B82F6', label: 'Approved' },
  rejected: { bg: 'rgba(239,68,68,0.14)', fg: '#EF4444', label: 'Rejected' },
  active: { bg: 'rgba(16,185,129,0.14)', fg: '#10B981', label: 'Active' },
  completed: { bg: 'rgba(139,92,246,0.14)', fg: '#8B5CF6', label: 'Completed' },
  cancelled: { bg: 'rgba(107,114,128,0.14)', fg: '#6B7280', label: 'Cancelled' },
};

function StatusPill({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
      background: s.bg, color: s.fg, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

const SECTIONS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'campaigns', icon: Trophy, label: 'Campaigns' },
  { id: 'coins', icon: Coins, label: 'Coin Management' },
  { id: 'analytics', icon: BarChart3, label: 'Analytics' },
  { id: 'profile', icon: Building2, label: 'Organization' },
];

export function OrganizationAdminDashboard({ theme = {}, user }) {
  const T = theme;
  const [section, setSection] = useState('dashboard');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await api.request('/organization/dashboard/'));
    } catch (err) {
      setError(describeError(err, 'Could not load your organization.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const organization = summary?.organization;
  const caps = summary?.capabilities || {};

  const shell = {
    display: 'flex', minHeight: '100vh',
    background: T.bg || '#F7F8FA', color: T.txt || '#111',
  };

  return (
    <div style={shell}>
      {/* Sidebar. Only sections this account can actually use. */}
      <aside
        style={{
          width: 232, flexShrink: 0, padding: '20px 12px',
          background: T.cardBg || '#fff',
          borderRight: `1px solid ${T.border || 'rgba(0,0,0,0.08)'}`,
        }}
      >
        <div style={{ padding: '0 12px 18px' }}>
          <div style={{ fontSize: 11, letterSpacing: 0.6, color: T.sub || '#888', fontWeight: 700 }}>
            ORGANIZATION
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>
            {organization?.name || '—'}
          </div>
          {organization?.code && (
            <div style={{ fontSize: 12, color: T.sub || '#888', fontFamily: 'monospace' }}>
              {organization.code}
            </div>
          )}
        </div>

        <nav aria-label="Organization sections">
          {SECTIONS.map(({ id, icon: Icon, label }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 12px', marginBottom: 4, borderRadius: 10,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontSize: 14, fontWeight: active ? 700 : 500,
                  background: active ? `${T.pri || '#8fc441'}1f` : 'transparent',
                  color: active ? T.pri || '#8fc441' : T.txt || '#111',
                }}
              >
                <Icon size={16} /> {label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 24, minWidth: 0 }}>
        {loading ? (
          <Centered T={T}>
            <Loader2 size={22} className="admin-spin" />
            <span>Loading your organization…</span>
          </Centered>
        ) : error ? (
          <div role="alert" style={{
            padding: 20, borderRadius: 14, display: 'flex', gap: 12,
            border: '1px solid rgba(239,68,68,0.35)', background: T.cardBg || '#fff',
          }}>
            <AlertCircle size={20} color="#EF4444" />
            <div>
              <div style={{ fontWeight: 700 }}>Could not load your organization</div>
              <div style={{ fontSize: 13, color: T.sub || '#666', marginTop: 4 }}>{error}</div>
              <button type="button" onClick={loadSummary} style={ghostButton(T)}>Try again</button>
            </div>
          </div>
        ) : section === 'dashboard' ? (
          <Overview summary={summary} T={T} user={user} onGoToCampaigns={() => setSection('campaigns')} caps={caps} />
        ) : section === 'campaigns' ? (
          <Campaigns T={T} caps={caps} organization={organization} onChanged={loadSummary} />
        ) : section === 'coins' ? (
          <CoinManagement T={T} organization={organization} />
        ) : section === 'analytics' ? (
          <Analytics T={T} />
        ) : (
          <Profile organization={organization} user={user} T={T} />
        )}
      </main>

      <style>{`
        @keyframes admin-spin-kf { to { transform: rotate(360deg); } }
        .admin-spin { animation: admin-spin-kf 0.9s linear infinite; }
      `}</style>
    </div>
  );
}

function Centered({ children, T }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: 60, color: T.sub || '#666', fontSize: 14,
    }}>
      {children}
    </div>
  );
}

const ghostButton = (T) => ({
  marginTop: 12, padding: '8px 14px', borderRadius: 8,
  border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
  background: 'transparent', color: T.txt || '#111', cursor: 'pointer', fontSize: 13,
});

const card = (T) => ({
  background: T.cardBg || '#fff',
  border: `1px solid ${T.border || 'rgba(0,0,0,0.08)'}`,
  borderRadius: 14,
});

/* ------------------------------------------------------------------ */

function Overview({ summary, T, caps, onGoToCampaigns }) {
  const c = summary?.campaigns || {};
  const tiles = [
    { label: 'Total campaigns', value: c.total ?? 0 },
    { label: 'Active', value: c.active ?? 0 },
    { label: 'Awaiting review', value: c.submitted ?? 0 },
    { label: 'Draft', value: c.draft ?? 0 },
    { label: 'Entries', value: c.entries ?? 0 },
  ];

  return (
    <>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>Dashboard</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: T.sub || '#666' }}>
        Everything here is scoped to your organization by the server.
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12, marginBottom: 24,
      }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ ...card(T), padding: 16 }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{t.value}</div>
            <div style={{ fontSize: 12, color: T.sub || '#666', marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card(T), padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recent campaigns</h2>
          <button type="button" onClick={onGoToCampaigns} style={ghostButton(T)}>View all</button>
        </div>
        {(summary?.recent || []).length === 0 ? (
          <div style={{ fontSize: 13, color: T.sub || '#666', padding: '12px 0' }}>
            {caps.can_create
              ? 'No campaigns yet. Create one to get started.'
              : 'No campaigns yet.'}
          </div>
        ) : (
          summary.recent.map((r) => (
            <div key={r.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderTop: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}`,
            }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</span>
              <StatusPill status={r.status} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function Campaigns({ T, caps, organization, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.request('/organization/campaigns/');
      setRows(res?.results || []);
    } catch (err) {
      setError(describeError(err, 'Could not load campaigns.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (campaign, action) => {
    setBusy(`${campaign.id}:${action}`);
    setNotice(null);
    try {
      await api.request(`/organization/campaigns/${campaign.id}/${action}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setNotice({ kind: 'success', text: `Campaign ${action === 'submit' ? 'submitted for review' : `${action}d`}.` });
      load();
      onChanged?.();
    } catch (err) {
      // 409 is the expected answer when someone else decided first. Surfacing
      // it as-is is more useful than a generic failure: the campaign moved,
      // and the list refresh below shows where it went.
      setNotice({ kind: 'error', text: describeError(err) });
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Campaigns</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: T.sub || '#666' }}>
            Only your organization&apos;s campaigns. The server decides this list, not this page.
          </p>
        </div>
        {caps.can_create && (
          <button type="button" onClick={() => setShowCreate(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
            borderRadius: 10, border: 'none', background: T.pri || '#8fc441',
            color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>
            <Plus size={16} /> Create Campaign
          </button>
        )}
      </div>

      {notice && (
        <div role="status" style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 10, fontSize: 13,
          background: notice.kind === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
          color: notice.kind === 'error' ? '#EF4444' : '#10B981',
        }}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <Centered T={T}><Loader2 size={20} className="admin-spin" /><span>Loading campaigns…</span></Centered>
      ) : error ? (
        <div role="alert" style={{ ...card(T), padding: 20, borderColor: 'rgba(239,68,68,0.35)' }}>
          <div style={{ fontWeight: 700 }}>Could not load campaigns</div>
          <div style={{ fontSize: 13, color: T.sub || '#666', marginTop: 4 }}>{error}</div>
          <button type="button" onClick={load} style={ghostButton(T)}>Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ ...card(T), padding: 48, textAlign: 'center' }}>
          <Trophy size={26} color={T.sub || '#999'} />
          <div style={{ marginTop: 12, fontWeight: 700 }}>No campaigns yet</div>
          <div style={{ marginTop: 4, fontSize: 13, color: T.sub || '#666' }}>
            {caps.can_create ? 'Create one to get started.' : 'A maker in your organization can create one.'}
          </div>
        </div>
      ) : (
        <div style={{ ...card(T), overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ background: T.subtleBg || 'rgba(0,0,0,0.03)' }}>
                {['Campaign', 'Status', 'Type', 'Entries', ''].map((h) => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '12px 16px', fontSize: 12,
                    fontWeight: 700, color: T.sub || '#666',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}` }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.title}</td>
                  <td style={{ padding: '12px 16px' }}><StatusPill status={r.status} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: T.sub || '#666' }}>{r.campaign_type}</td>
                  <td style={{ padding: '12px 16px' }}>{r.total_entries ?? 0}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {/* Maker submits; checker approves or rejects. The
                          buttons follow the same rules the API enforces, so a
                          user is not offered an action that will be refused. */}
                      {caps.can_author && ['draft', 'rejected'].includes(r.status) && (
                        <ActionButton T={T} busy={busy === `${r.id}:submit`} onClick={() => act(r, 'submit')}>
                          <Send size={14} /> Submit
                        </ActionButton>
                      )}
                      {caps.can_review && r.status === 'submitted' && (
                        <>
                          <ActionButton T={T} busy={busy === `${r.id}:approve`} onClick={() => act(r, 'approve')}>
                            <Check size={14} /> Approve
                          </ActionButton>
                          <ActionButton T={T} busy={busy === `${r.id}:reject`} onClick={() => act(r, 'reject')}>
                            <X size={14} /> Reject
                          </ActionButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateCampaign
          T={T}
          organization={organization}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); onChanged?.(); }}
        />
      )}
    </>
  );
}

function ActionButton({ children, onClick, busy, T }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
        background: 'transparent', color: T.txt || '#111',
        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? <Loader2 size={13} className="admin-spin" /> : children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

function CreateCampaign({ T, organization, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', prize_title: '', prize_description: '', campaign_type: 'daily',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      // No organization field is sent. The backend takes it from the account,
      // and would ignore one anyway -- adding it here would only imply a
      // choice that does not exist.
      //
      // The organization surface, not '/admin/campaigns/create/'. Everything
      // under the admin prefix is refused to non-staff accounts by
      // AdminPathGuardMiddleware, and an organization admin is deliberately
      // not staff -- posting there returned a bare 403 before any permission
      // class ran.
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => body.append(k, v));
      await api.request('/organization/campaigns/create/', { method: 'POST', body, isFormData: true });
      onCreated();
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  };

  const input = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
    border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
    background: T.inputBg || 'transparent', color: T.txt || '#111', fontSize: 14,
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div
        role="dialog" aria-modal="true" aria-label="Create campaign"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto',
          background: T.cardBg || '#fff', color: T.txt || '#111', borderRadius: 16, padding: 24,
        }}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>Create campaign</h2>

        {/* Read-only. There is no selector because there is no choice: the
            server assigns this campaign to the account's organization. */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Organization</div>
          <div style={{ ...input, background: T.subtleBg || 'rgba(0,0,0,0.03)', color: T.sub || '#666' }}>
            {organization?.name || 'Your organization'}
          </div>
        </div>

        <form onSubmit={submit}>
          {[
            ['Campaign title', 'title', true],
            ['Description', 'description', true],
            ['Prize title', 'prize_title', true],
            ['Prize description', 'prize_description', false],
          ].map(([label, key, required]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label htmlFor={`cc-${key}`} style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
              </label>
              <input id={`cc-${key}`} value={form[key]} onChange={set(key)} style={input} required={required} />
            </div>
          ))}

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="cc-type" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Campaign type
            </label>
            <select id="cc-type" value={form.campaign_type} onChange={set('campaign_type')} style={input}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="grand">Grand</option>
            </select>
          </div>

          {error && (
            <div role="alert" style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={ghostButton(T)}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: T.pri || '#8fc441', color: '#fff', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {saving ? <><Loader2 size={15} className="admin-spin" /> Creating…</> : <><Plus size={15} /> Create</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Analytics({ T }) {
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.request('/organization/campaigns/');
        setCampaigns(res?.results || []);
        if (res?.results?.length) setSelected(String(res.results[0].id));
      } catch (err) {
        setError(describeError(err, 'Could not load campaigns.'));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await api.request(`/organization/campaigns/${selected}/analytics/`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) { setError(describeError(err)); setData(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  return (
    <>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>Analytics</h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: T.sub || '#666' }}>
        Engagement for one of your campaigns, scored on the platform formula.
      </p>

      {campaigns.length === 0 ? (
        <div style={{ ...card(T), padding: 40, textAlign: 'center', color: T.sub || '#666' }}>
          <FileText size={24} />
          <div style={{ marginTop: 10, fontSize: 14 }}>No campaigns to analyse yet.</div>
        </div>
      ) : (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Choose a campaign"
            style={{
              padding: '10px 12px', borderRadius: 10, marginBottom: 18, minWidth: 260,
              border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
              background: T.inputBg || 'transparent', color: T.txt || '#111', fontSize: 14,
            }}
          >
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>

          {loading ? (
            <Centered T={T}><Loader2 size={20} className="admin-spin" /><span>Loading analytics…</span></Centered>
          ) : error ? (
            <div role="alert" style={{ ...card(T), padding: 20, borderColor: 'rgba(239,68,68,0.35)', fontSize: 13 }}>
              {error}
            </div>
          ) : data ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
                {[
                  ['Participants', data.participants],
                  ['Posts', data.posts],
                  ['Likes', data.engagement.likes],
                  ['Comments', data.engagement.comments],
                  ['Shares', data.engagement.shares],
                  ['Gifts', data.engagement.gifts],
                ].map(([label, value]) => (
                  <div key={label} style={{ ...card(T), padding: 16 }}>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
                    <div style={{ fontSize: 12, color: T.sub || '#666' }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...card(T), padding: 18 }}>
                <div style={{ fontSize: 13, color: T.sub || '#666' }}>Total leaderboard score</div>
                <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{data.leaderboard_score}</div>
                <div style={{ fontSize: 12, color: T.sub || '#666', marginTop: 8 }}>
                  likes x{data.weights.likes} + comments x{data.weights.comments} +
                  {' '}shares x{data.weights.shares} + gifts x{data.weights.gifts}
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Profile({ organization, user, T }) {
  return (
    <>
      <h1 style={{ margin: '0 0 18px', fontSize: 22, fontWeight: 800 }}>Organization</h1>
      <div style={{ ...card(T), padding: 20, maxWidth: 520 }}>
        {[
          ['Name', organization?.name],
          ['Code', organization?.code],
          ['Your account', user?.username],
          ['Realm', user?.realm],
          ['Role', user?.role || '—'],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', gap: 16,
            padding: '10px 0', borderBottom: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}`,
          }}>
            <span style={{ color: T.sub || '#666', fontSize: 13 }}>{label}</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{value || '—'}</span>
          </div>
        ))}
        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, color: T.sub || '#666' }}>
          Your organization is fixed to your account. Contact Flipstar to change it.
        </p>
      </div>
    </>
  );
}


/* ------------------------------------------------------------------ */

function CoinManagement({ T, organization }) {
  const [usage, setUsage] = useState(null);
  const [ceilings, setCeilings] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, limits] = await Promise.allSettled([
        api.request('/coin-usage/'),
        // Super-Admin-only. An organization admin is refused here, which is
        // expected -- the ceiling hints are then simply absent rather than the
        // page failing.
        api.request('/admin/coin-limits/'),
      ]);
      if (u.status === 'fulfilled') setUsage(u.value);
      if (limits.status === 'fulfilled') setCeilings(limits.value || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const suspended = organization?.status === 'suspended';

  return (
    <>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>Coin Management</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: T.sub || '#666' }}>
        {organization?.name || 'Your organization'} — reward rates and campaign budgets.
      </p>

      <div
        role="status"
        style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 18,
          padding: '12px 16px', borderRadius: 12,
          background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
          fontSize: 13,
        }}
      >
        <AlertCircle size={17} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Rewards are currently disabled.</strong>
          <div style={{ color: T.sub || '#666', marginTop: 2 }}>
            Engagement does not pay coins yet. What you configure here applies once rewards
            are switched on.
          </div>
        </div>
      </div>

      {/* No organization selector, and none is possible: the path carries no
          id, so the backend uses the account's own organization. */}
      <ConfigEditor
        T={T}
        title="Organization coin configuration"
        path="/organization/coin-config/"
        ceilings={ceilings}
        readOnly={suspended}
        readOnlyReason={
          suspended
            ? 'This organization is suspended, so its coin configuration cannot be changed. Contact Flipstar.'
            : ''
        }
        onSaved={load}
      />

      <h2 style={{ margin: '22px 0 10px', fontSize: 15, fontWeight: 700 }}>Campaign budgets</h2>
      {loading ? (
        <Centered T={T}><Loader2 size={18} className="admin-spin" /><span>Loading budgets…</span></Centered>
      ) : !usage?.campaigns?.length ? (
        <div style={{ ...card(T), padding: 32, textAlign: 'center', fontSize: 13, color: T.sub || '#666' }}>
          No campaigns have coin configuration yet.
        </div>
      ) : (
        <div style={{ ...card(T), overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ background: T.subtleBg || 'rgba(0,0,0,0.03)' }}>
                {['Campaign', 'Budget', 'Distributed', 'Remaining', 'Rewards'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: T.sub || '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usage.campaigns.map((r) => (
                <tr key={r.campaign.id} style={{ borderTop: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}` }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.campaign.title}</td>
                  <td style={{ padding: '12px 16px' }}>{(r.budget || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>{(r.distributed || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>{r.remaining === null ? '—' : (r.remaining || 0).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: r.rewards_enabled ? '#10B981' : '#6B7280' }}>
                    {r.rewards_enabled ? 'Enabled' : 'Disabled'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default OrganizationAdminDashboard;
