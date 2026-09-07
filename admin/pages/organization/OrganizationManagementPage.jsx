import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Plus, Search, Eye, Edit3, UserPlus, Power, X, Loader2, AlertCircle, Check,
} from 'lucide-react';
import api from '../../../api';
import { AlertModal } from '../../components/modal/AlertModal';
import { ConfirmModal } from '../../components/modal/ConfirmModal';

/**
 * Super Admin: organizations, their administrators and their campaigns.
 *
 * Backend is the boundary
 * -----------------------
 * Every endpoint here is gated on IsFlipstarUser, and cross-organization
 * campaign access is refused server-side. What this page does with realm and
 * role is presentation only -- a non-staff account that reached this screen
 * would still be refused by every call it makes. Hiding a button is a courtesy
 * to the operator, never a control.
 *
 * The counts, the campaign list and the admin list all come from the API
 * as-is. Nothing is filtered in JavaScript, because a list narrowed on the
 * client has still been sent to the client.
 */

/** Turn an API failure into something worth reading, by status. */
function describeError(err, fallback = 'Something went wrong. Please try again.') {
  const status = err?.status ?? err?.response?.status;
  const payload = err?.data || err?.response?.data;
  const serverMessage = payload?.error || payload?.detail || payload?.message;

  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return 'The organization or campaign could not be found.';
  if (status === 409) return serverMessage || 'That organization or admin already exists.';
  if (status === 400) return serverMessage || 'Please check the highlighted fields.';
  if (status >= 500) return 'Something went wrong on our end. Please try again.';
  return serverMessage || fallback;
}

const STATUS_STYLES = {
  active: { bg: 'rgba(16,185,129,0.12)', fg: '#10B981', label: 'Active' },
  pending: { bg: 'rgba(245,158,11,0.12)', fg: '#F59E0B', label: 'Pending' },
  suspended: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444', label: 'Suspended' },
};

function StatusPill({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span
      style={{
        display: 'inline-block', padding: '3px 10px', borderRadius: 999,
        background: style.bg, color: style.fg, fontSize: 12, fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  );
}

export function OrganizationManagementPage({ theme = {} }) {
  const T = theme;
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [detailFor, setDetailFor] = useState(null);
  const [adminFor, setAdminFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [alert, setAlert] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Search and status are sent to the API, not applied here: filtering on
      // the client means the rows were fetched before being hidden.
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      const query = params.toString();
      const res = await api.request(`/admin/organizations/${query ? `?${query}` : ''}`);
      setOrganizations(res?.results || []);
    } catch (err) {
      setError(describeError(err, 'Could not load organizations.'));
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const toggleStatus = (org) => {
    const next = org.status === 'active' ? 'suspended' : 'active';
    setConfirm({
      title: next === 'suspended' ? 'Deactivate organization?' : 'Activate organization?',
      message:
        next === 'suspended'
          ? `${org.name} will be suspended. Its administrators keep their accounts but new administrators cannot be added while suspended.`
          : `${org.name} will be marked active.`,
      confirmLabel: next === 'suspended' ? 'Deactivate' : 'Activate',
      danger: next === 'suspended',
      onConfirm: async () => {
        try {
          await api.request(`/admin/organizations/${org.id}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: next }),
          });
          setConfirm(null);
          load();
        } catch (err) {
          setConfirm(null);
          setAlert({ type: 'error', title: 'Could not update', message: describeError(err) });
        }
      },
    });
  };

  const card = {
    background: T.cardBg || '#fff',
    border: `1px solid ${T.border || 'rgba(0,0,0,0.08)'}`,
    borderRadius: 14,
  };

  return (
    <div style={{ padding: 24, color: T.txt || '#111' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 12,
          alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={22} color={T.pri || '#8fc441'} />
            Organizations
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: T.sub || '#666' }}>
            Companies running campaigns on the platform, and the administrators who manage them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', borderRadius: 10, border: 'none',
            background: T.pri || '#8fc441', color: '#fff', fontWeight: 700,
            fontSize: 14, cursor: 'pointer',
          }}
        >
          <Plus size={16} /> Create Organization
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search
            size={16}
            color={T.sub || '#666'}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code"
            aria-label="Search organizations"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 36px',
              borderRadius: 10, border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
              background: T.inputBg || 'transparent', color: T.txt || '#111', fontSize: 14,
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          style={{
            padding: '10px 12px', borderRadius: 10,
            border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
            background: T.inputBg || 'transparent', color: T.txt || '#111', fontSize: 14,
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Body: loading / error / empty / table, in that order of precedence */}
      {loading ? (
        <div style={{ ...card, padding: 48, textAlign: 'center', color: T.sub || '#666' }}>
          <Loader2 size={22} className="admin-spin" />
          <div style={{ marginTop: 10, fontSize: 14 }}>Loading organizations…</div>
        </div>
      ) : error ? (
        <div
          role="alert"
          style={{
            ...card, padding: 24, display: 'flex', gap: 12, alignItems: 'flex-start',
            borderColor: 'rgba(239,68,68,0.35)',
          }}
        >
          <AlertCircle size={20} color="#EF4444" />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Could not load organizations</div>
            <div style={{ fontSize: 13, color: T.sub || '#666' }}>{error}</div>
            <button
              type="button"
              onClick={load}
              style={{
                marginTop: 12, padding: '8px 14px', borderRadius: 8,
                border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
                background: 'transparent', color: T.txt || '#111', cursor: 'pointer', fontSize: 13,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      ) : organizations.length === 0 ? (
        <div style={{ ...card, padding: 48, textAlign: 'center' }}>
          <Building2 size={28} color={T.sub || '#999'} />
          <div style={{ marginTop: 12, fontWeight: 700 }}>
            {search || statusFilter ? 'No organizations match those filters' : 'No organizations yet'}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: T.sub || '#666' }}>
            {search || statusFilter
              ? 'Try a different search or clear the status filter.'
              : 'Create one to let a company run its own campaigns.'}
          </div>
        </div>
      ) : (
        /* overflow-x on the wrapper: the table scrolls, the page never does */
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ background: T.subtleBg || 'rgba(0,0,0,0.03)' }}>
                {['Organization', 'Code', 'Status', 'Admins', 'Campaigns', 'Created', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left', padding: '12px 16px', fontSize: 12,
                      fontWeight: 700, color: T.sub || '#666', whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id} style={{ borderTop: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}` }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{org.name}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13 }}>
                    {org.code}
                  </td>
                  <td style={{ padding: '12px 16px' }}><StatusPill status={org.status} /></td>
                  <td style={{ padding: '12px 16px' }}>{org.member_count ?? 0}</td>
                  <td style={{ padding: '12px 16px' }}>{org.campaign_count ?? 0}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: T.sub || '#666' }}>
                    {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <IconButton title="View details" onClick={() => setDetailFor(org)} T={T}>
                        <Eye size={15} />
                      </IconButton>
                      <IconButton title="Add administrator" onClick={() => setAdminFor(org)} T={T}>
                        <UserPlus size={15} />
                      </IconButton>
                      <IconButton
                        title={org.status === 'active' ? 'Deactivate' : 'Activate'}
                        onClick={() => toggleStatus(org)}
                        T={T}
                      >
                        <Power size={15} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateOrganizationModal
          T={T}
          onClose={() => setShowCreate(false)}
          onCreated={(org) => {
            setShowCreate(false);
            load();
            setAdminFor(org);
          }}
        />
      )}
      {adminFor && (
        <CreateAdminModal
          T={T}
          organization={adminFor}
          onClose={() => setAdminFor(null)}
          onCreated={() => {
            setAdminFor(null);
            load();
            setAlert({ type: 'success', title: 'Administrator created', message: 'They can sign in with the credentials you set.' });
          }}
        />
      )}
      {detailFor && (
        <OrganizationDetailModal T={T} organization={detailFor} onClose={() => setDetailFor(null)} />
      )}
      {confirm && (
        <ConfirmModal
          isOpen
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
          theme={T}
        />
      )}
      {alert && (
        <AlertModal
          isOpen
          type={alert.type}
          title={alert.title}
          message={alert.message}
          onClose={() => setAlert(null)}
          theme={T}
        />
      )}

      <style>{`
        @keyframes admin-spin-kf { to { transform: rotate(360deg); } }
        .admin-spin { animation: admin-spin-kf 0.9s linear infinite; }
      `}</style>
    </div>
  );
}

function IconButton({ children, title, onClick, T }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8,
        border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
        background: 'transparent', color: T.txt || '#111', cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------------------
 * Modals
 * ----------------------------------------------------------------------- */

function Shell({ title, subtitle, onClose, children, T }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
          background: T.cardBg || '#fff', color: T.txt || '#111',
          borderRadius: 16, padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h2>
            {subtitle && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: T.sub || '#666' }}>{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.sub || '#666', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, error, T, required }) {
  const id = `f-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      {typeof children === 'function' ? children(id) : children}
      {error && (
        <div style={{ marginTop: 4, fontSize: 12, color: '#EF4444' }}>{error}</div>
      )}
    </div>
  );
}

const inputStyle = (T) => ({
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: 10, border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`,
  background: T.inputBg || 'transparent', color: T.txt || '#111', fontSize: 14,
});

function CreateOrganizationModal({ T, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', code: '', description: '', status: 'active', contact_email: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const org = await api.request('/admin/organizations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      onCreated(org);
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  };

  return (
    <Shell
      title="Create organization"
      subtitle="You will be asked to add its first administrator next."
      onClose={onClose}
      T={T}
    >
      <form onSubmit={submit}>
        <Field label="Organization name" required T={T}>
          {(id) => <input id={id} value={form.name} onChange={set('name')} style={inputStyle(T)} required />}
        </Field>
        <Field label="Organization code" required T={T}>
          {(id) => (
            <input
              id={id}
              value={form.code}
              onChange={set('code')}
              placeholder="ABC-CO"
              style={{ ...inputStyle(T), fontFamily: 'monospace', textTransform: 'uppercase' }}
              required
            />
          )}
        </Field>
        <Field label="Description" T={T}>
          {(id) => (
            <textarea id={id} value={form.description} onChange={set('description')} rows={3} style={inputStyle(T)} />
          )}
        </Field>
        <Field label="Contact email" T={T}>
          {(id) => <input id={id} type="email" value={form.contact_email} onChange={set('contact_email')} style={inputStyle(T)} />}
        </Field>
        <Field label="Status" T={T}>
          {(id) => (
            <select id={id} value={form.status} onChange={set('status')} style={inputStyle(T)}>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
            </select>
          )}
        </Field>

        {error && (
          <div role="alert" style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`, background: 'transparent', color: T.txt || '#111', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.pri || '#8fc441', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {saving ? <><Loader2 size={15} className="admin-spin" /> Creating…</> : <><Check size={15} /> Create</>}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function CreateAdminModal({ T, organization, onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await api.request(`/admin/organizations/${organization.id}/admins/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      onCreated();
    } catch (err) {
      setError(describeError(err));
      setSaving(false);
    }
  };

  return (
    <Shell
      title="Add organization administrator"
      subtitle="They will sign in with the ordinary login. No separate account system."
      onClose={onClose}
      T={T}
    >
      {/* Realm and role are shown, not chosen. The backend sets both; offering
          a picker here would imply a choice the API does not accept. */}
      <div
        style={{
          marginBottom: 16, padding: 12, borderRadius: 10,
          background: T.subtleBg || 'rgba(0,0,0,0.03)', fontSize: 13,
        }}
      >
        <Row label="Organization" value={organization.name} T={T} />
        <Row label="User type" value="Organization Administrator" T={T} />
        <Row label="Realm" value="ORGANIZATION" T={T} mono />
      </div>

      <form onSubmit={submit}>
        <Field label="Username" required T={T}>
          {(id) => <input id={id} value={form.username} onChange={set('username')} style={inputStyle(T)} required autoComplete="off" />}
        </Field>
        <Field label="Email" T={T}>
          {(id) => <input id={id} type="email" value={form.email} onChange={set('email')} style={inputStyle(T)} autoComplete="off" />}
        </Field>
        <Field label="Password" required T={T}>
          {(id) => <input id={id} type="password" value={form.password} onChange={set('password')} style={inputStyle(T)} required autoComplete="new-password" />}
        </Field>

        {error && (
          <div role="alert" style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border || 'rgba(0,0,0,0.12)'}`, background: 'transparent', color: T.txt || '#111', cursor: 'pointer' }}>
            Skip for now
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: T.pri || '#8fc441', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {saving ? <><Loader2 size={15} className="admin-spin" /> Creating…</> : <><UserPlus size={15} /> Create admin</>}
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Row({ label, value, T, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
      <span style={{ color: T.sub || '#666' }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  );
}

function OrganizationDetailModal({ T, organization, onClose }) {
  const [detail, setDetail] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, c] = await Promise.all([
          api.request(`/admin/organizations/${organization.id}/`),
          api.request(`/admin/organizations/${organization.id}/campaigns/`),
        ]);
        if (!cancelled) {
          setDetail(d);
          setCampaigns(c?.results || []);
        }
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [organization.id]);

  const stats = detail?.campaign_stats || {};
  const statCards = useMemo(
    () => [
      { label: 'Total', value: stats.total ?? 0 },
      { label: 'Active', value: stats.active ?? 0 },
      { label: 'Draft', value: stats.draft ?? 0 },
      { label: 'Completed', value: stats.completed ?? 0 },
    ],
    [stats],
  );

  return (
    <Shell title={organization.name} subtitle={`Code ${organization.code}`} onClose={onClose} T={T}>
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: T.sub || '#666' }}>
          <Loader2 size={20} className="admin-spin" />
          <div style={{ marginTop: 8, fontSize: 13 }}>Loading…</div>
        </div>
      ) : error ? (
        <div role="alert" style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13 }}>
          {error}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 18, padding: 12, borderRadius: 10, background: T.subtleBg || 'rgba(0,0,0,0.03)', fontSize: 13 }}>
            <Row label="Status" value={<StatusPill status={detail.status} />} T={T} />
            <Row label="Contact" value={detail.contact_email || '—'} T={T} />
            <Row
              label="Created"
              value={detail.created_at ? new Date(detail.created_at).toLocaleDateString() : '—'}
              T={T}
            />
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Administrators</h3>
          {(detail.admins || []).length === 0 ? (
            <div style={{ fontSize: 13, color: T.sub || '#666', marginBottom: 18 }}>
              No administrators yet.
            </div>
          ) : (
            <div style={{ marginBottom: 18 }}>
              {detail.admins.map((a) => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}` }}>
                  <span style={{ fontWeight: 600 }}>{a.username}</span>
                  <span style={{ color: T.sub || '#666' }}>{a.email || '—'} · {a.role || '—'}</span>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Campaigns</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 14 }}>
            {statCards.map((s) => (
              <div key={s.label} style={{ padding: 12, borderRadius: 10, background: T.subtleBg || 'rgba(0,0,0,0.03)', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: T.sub || '#666' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {campaigns.length === 0 ? (
            <div style={{ fontSize: 13, color: T.sub || '#666' }}>No campaigns yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 380 }}>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} style={{ borderTop: `1px solid ${T.border || 'rgba(0,0,0,0.06)'}` }}>
                      <td style={{ padding: '8px 0', fontWeight: 600 }}>{c.title}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}><StatusPill status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

export default OrganizationManagementPage;
