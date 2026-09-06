/**
 * Admin dashboard.
 *
 * Scope of this redesign: presentation only. The API call, every data path,
 * the role filtering and the navigation contract are untouched -- the same
 * `/admin/dashboard/` response drives the same numbers.
 *
 * Design decisions worth stating, because they are the ones a reviewer would
 * otherwise have to reverse-engineer:
 *
 *   tokens      Colours, spacing and radii are derived once from the theme
 *               prop into `tokens`, and everything reads from there. The old
 *               version scattered `theme.blue`, `${theme.purple}15` and raw
 *               pixel values through the markup, so changing the palette meant
 *               finding every occurrence.
 *
 *   hierarchy   Revenue and subscriptions were buried below two lists; they
 *               are the numbers an operator opens this page for, so they sit
 *               with the KPIs. Order is: what is happening (KPIs) -> what it
 *               earned (revenue) -> who is driving it (creators, reels) ->
 *               where to go next (menus).
 *
 *   one accent  Each KPI keeps a distinct icon tint because they are read
 *               individually, but everything structural -- borders, panels,
 *               hover -- uses one neutral scale. Colour marks meaning here,
 *               not decoration.
 *
 *   states      Loading, empty and failure are all rendered explicitly.
 *               Previously a failed request logged to the console and left the
 *               page showing zeroes, which reads as "your platform has no
 *               users" rather than "this did not load".
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CreditCard,
  FileVideo,
  MessageCircle,
  RefreshCw,
  ThumbsUp,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import api from '../../../api';
import { visibleSections } from '../../navigation';
import { buildTokens } from '../../tokens';
import { hasPageAccess } from '../../utils/rolePermissions';

/** 12345 -> "12,345". Locale-aware, and safe on null. */
function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '0';
}

export function AdminDashboard({ theme, adminUser, onPageChange }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const tokens = buildTokens(theme);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.request('/admin/dashboard/');
      setStats(response);
      setError(null);
    } catch (err) {
      // Surfaced rather than only logged: zeroes on screen read as "no users",
      // which is a very different message from "this did not load".
      console.error('Failed to load dashboard:', err);
      setError(err?.error || err?.message || 'Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.users?.total,
      change: stats?.users?.new_today,
      changeLabel: 'today',
      icon: Users,
      accent: tokens.accents.users,
    },
    {
      title: 'Total Reels',
      value: stats?.content?.total_reels,
      change: stats?.content?.reels_today,
      changeLabel: 'today',
      icon: FileVideo,
      accent: tokens.accents.content,
    },
    {
      title: 'Total Votes',
      value: stats?.engagement?.total_votes,
      change: stats?.engagement?.votes_today,
      changeLabel: 'today',
      icon: ThumbsUp,
      accent: tokens.accents.votes,
    },
    {
      title: 'Total Comments',
      value: stats?.content?.total_comments,
      change: stats?.content?.comments_today,
      changeLabel: 'today',
      icon: MessageCircle,
      accent: tokens.accents.comments,
    },
    {
      title: 'Active Users',
      value: stats?.users?.active_month,
      change: stats?.users?.active_week,
      changeLabel: 'this week',
      // Not a delta -- a subset. Labelling it "+N" would claim growth that
      // this number does not describe.
      absolute: true,
      icon: Activity,
      accent: tokens.accents.active,
      hint: 'last 30 days',
    },
    {
      title: 'Total Follows',
      value: stats?.engagement?.total_follows,
      change: stats?.engagement?.follows_today,
      changeLabel: 'today',
      icon: TrendingUp,
      accent: tokens.accents.follows,
    },
  ];

  return (
    <div style={{ color: tokens.txt }}>
      <DashboardStyles tokens={tokens} />

      <header className="adm-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="adm-title">Dashboard</h1>
          <p className="adm-lede">Platform activity at a glance.</p>
        </div>
        <button
          type="button"
          className="adm-btn adm-btn-outline"
          onClick={loadDashboardData}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'adm-spin' : undefined} />
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
      </header>

      {error && !loading && (
        <div className="adm-error" role="alert">
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Couldn’t load dashboard</div>
            <div style={{ fontSize: 13, color: tokens.sub }}>{error}</div>
          </div>
          <button type="button" className="adm-btn adm-btn-outline" onClick={loadDashboardData}>
            Try again
          </button>
        </div>
      )}

      <section className="adm-kpis" aria-label="Key metrics">
        {loading
          ? statCards.map((c) => <StatSkeleton key={c.title} />)
          : statCards.map((card) => <StatCard key={card.title} card={card} tokens={tokens} />)}
      </section>

      {!loading && !error && <RevenuePanel stats={stats} tokens={tokens} />}

      {!loading && !error && (
        <div className="adm-two-col">
          <Panel title="Top Creators" tokens={tokens}>
            <RankedList
              rows={stats?.top_creators?.slice(0, 5)}
              empty="No creator activity yet."
              tokens={tokens}
              renderRow={(creator) => ({
                key: creator.id,
                primary: creator.username,
                secondary: `${formatNumber(creator.reel_count)} reels · ${formatNumber(
                  creator.followers,
                )} followers`,
                value: formatNumber(creator.total_votes),
                valueLabel: 'votes',
              })}
            />
          </Panel>

          <Panel title="Trending Reels" tokens={tokens}>
            <RankedList
              rows={stats?.trending_reels?.slice(0, 5)}
              empty="Nothing trending yet."
              tokens={tokens}
              renderRow={(reel) => ({
                key: reel.id,
                primary: reel.caption || 'Untitled',
                secondary: `@${reel.user} · ${formatNumber(reel.comments)} comments`,
                value: formatNumber(reel.votes),
                valueLabel: 'votes',
              })}
            />
          </Panel>
        </div>
      )}

      {/* The menu as cards. Stats answer "how are we doing"; this answers
          "what can I do", which a sidebar is poor at for a new admin. */}
      <MenuLauncher theme={theme} tokens={tokens} adminUser={adminUser} onPageChange={onPageChange} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StatCard({ card, tokens }) {
  const Icon = card.icon;
  const change = Number(card.change);
  const hasChange = Number.isFinite(change) && change !== 0;

  return (
    <div className="adm-card adm-stat">
      <div className="adm-stat-top">
        <span className="adm-stat-title">{card.title}</span>
        <span className="adm-stat-icon" style={{ background: `${card.accent}1F`, color: card.accent }}>
          <Icon size={16} />
        </span>
      </div>

      <div className="adm-stat-value">{formatNumber(card.value)}</div>

      <div className="adm-stat-foot">
        {hasChange ? (
          <span style={{ color: card.absolute ? tokens.sub : tokens.accents.votes }}>
            {card.absolute ? formatNumber(change) : `+${formatNumber(change)}`} {card.changeLabel}
          </span>
        ) : (
          <span style={{ color: tokens.faint }}>No change {card.changeLabel}</span>
        )}
        {card.hint && <span style={{ color: tokens.faint }}>{card.hint}</span>}
      </div>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="adm-card adm-stat" aria-hidden="true">
      <div className="adm-stat-top">
        <span className="adm-sk" style={{ width: 90, height: 12 }} />
        <span className="adm-sk" style={{ width: 30, height: 30, borderRadius: 9 }} />
      </div>
      <span className="adm-sk" style={{ width: 110, height: 30, margin: '10px 0 12px' }} />
      <span className="adm-sk" style={{ width: 70, height: 11 }} />
    </div>
  );
}

/**
 * Revenue and subscriptions.
 *
 * These lived at the bottom, below two lists. They are the numbers an operator
 * opens this page for, so they sit directly under the KPIs.
 */
function RevenuePanel({ stats, tokens }) {
  const rows = [
    {
      label: 'Total Revenue',
      value: formatNumber(stats?.revenue?.total),
      hint: 'all time',
      icon: Wallet,
      accent: tokens.accents.votes,
    },
    {
      label: 'Revenue Today',
      value: formatNumber(stats?.revenue?.today),
      hint: 'since midnight',
      icon: TrendingUp,
      accent: tokens.accents.users,
    },
    {
      label: 'Active Subscriptions',
      value: formatNumber(stats?.subscriptions?.active),
      hint: 'currently paying',
      icon: CreditCard,
      accent: tokens.accents.content,
    },
  ];

  return (
    <section className="adm-card adm-revenue" aria-label="Revenue">
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <div key={row.label} className="adm-revenue-cell">
            <span className="adm-stat-icon" style={{ background: `${row.accent}1F`, color: row.accent }}>
              <Icon size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="adm-stat-title">{row.label}</div>
              <div className="adm-revenue-value">{row.value}</div>
              <div style={{ fontSize: 11.5, color: tokens.faint }}>{row.hint}</div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Panel({ title, children, tokens }) {
  return (
    <section className="adm-card adm-panel">
      <h2 className="adm-panel-title" style={{ borderColor: tokens.border }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A ranked list -- used for both creators and reels, so they cannot drift. */
function RankedList({ rows, renderRow, empty, tokens }) {
  if (!rows || rows.length === 0) {
    return <div className="adm-empty">{empty}</div>;
  }

  return (
    <ol className="adm-list">
      {rows.map((row, index) => {
        const r = renderRow(row);
        return (
          <li key={r.key ?? index} className="adm-row">
            <span
              className="adm-rank"
              style={{
                // Only the top three are marked; a numbered list already
                // conveys the rest, and colouring all five flattens the signal.
                background: index < 3 ? `${tokens.pri}22` : 'transparent',
                color: index < 3 ? tokens.pri : tokens.faint,
                borderColor: index < 3 ? `${tokens.pri}44` : tokens.border,
              }}
            >
              {index + 1}
            </span>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="adm-row-primary">{r.primary}</div>
              <div className="adm-row-secondary">{r.secondary}</div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{r.value}</div>
              <div style={{ fontSize: 11, color: tokens.faint }}>{r.valueLabel}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The menu, as cards.
 *
 * A sidebar is fine once you know where things are; it is poor at answering
 * "what can I do here?" for someone who does not. Each card names a
 * destination and says what it lets you do.
 *
 * Sections keep their grouping and a single accent colour, rather than a
 * different colour per card -- twenty-five colours is not a system, it is
 * confetti, and it makes the grid harder to scan rather than easier.
 *
 * Destinations come from admin/navigation.js, filtered by the same
 * hasPageAccess() the sidebar uses. A card that opens a page the role cannot
 * see would be worse than no card.
 */
function MenuLauncher({ tokens, adminUser, onPageChange }) {
  const userRole = adminUser?.admin_role?.role || 'super_admin';
  const sections = visibleSections(hasPageAccess, userRole);

  if (!onPageChange || sections.length === 0) return null;

  return (
    <div style={{ marginTop: 36 }}>
      <h2 className="adm-section-title">Menus</h2>
      <p className="adm-lede" style={{ marginBottom: 22 }}>
        Choose from the available menus to manage items or take actions as needed.
      </p>

      {sections.map((section) => (
        <div key={section.label} style={{ marginBottom: 28 }}>
          <div className="adm-eyebrow">{section.label}</div>

          <div className="adm-menu-grid">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="adm-card adm-menu-card"
                  onClick={() => onPageChange(item.id)}
                  style={{ '--accent': section.accent }}
                >
                  <span
                    className="adm-stat-icon adm-menu-icon"
                    style={{ background: `${section.accent}1F`, color: section.accent }}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="adm-menu-label">{item.label}</span>
                  <span className="adm-menu-desc" style={{ color: tokens.sub }}>
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One stylesheet rather than inline styles per element.
 *
 * Hover, focus-visible, media queries and reduced-motion cannot be expressed
 * inline, and those are exactly the states the brief asks for. Values come
 * from the tokens so the palette still has one source.
 */
function DashboardStyles({ tokens }) {
  return (
    <style>{`
      .adm-head {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 16px; flex-wrap: wrap; margin-bottom: 24px;
      }
      .adm-title { margin: 0 0 4px; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
      .adm-lede  { margin: 0; font-size: 14px; color: ${tokens.sub}; }
      .adm-section-title { margin: 0 0 4px; font-size: 19px; font-weight: 800; letter-spacing: -0.01em; }
      .adm-eyebrow {
        font-size: 11px; font-weight: 700; letter-spacing: .08em;
        text-transform: uppercase; color: ${tokens.faint}; margin-bottom: 11px;
      }

      /* Shared card surface: one definition, so panels, stats and menu cards
         cannot drift apart. */
      .adm-card {
        background: ${tokens.raised};
        border: 1px solid ${tokens.border};
        border-radius: ${tokens.radius.md}px;
        box-sizing: border-box;
      }

      .adm-btn {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 9px 15px; border-radius: ${tokens.radius.sm}px;
        font-size: 13.5px; font-weight: 600; cursor: pointer;
        transition: background .15s ease, border-color .15s ease, opacity .15s ease;
      }
      .adm-btn:disabled { opacity: .55; cursor: default; }
      .adm-btn:focus-visible { outline: 2px solid ${tokens.pri}; outline-offset: 2px; }
      .adm-btn-outline {
        background: transparent; color: ${tokens.txt};
        border: 1px solid ${tokens.border};
      }
      .adm-btn-outline:hover:not(:disabled) {
        background: rgba(255,255,255,0.05); border-color: ${tokens.borderStrong};
      }
      .adm-spin { animation: adm-rotate 1s linear infinite; }
      @keyframes adm-rotate { to { transform: rotate(360deg); } }

      .adm-error {
        display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
        padding: 14px 16px; margin-bottom: 20px;
        border-radius: ${tokens.radius.md}px;
        background: rgba(239,68,68,0.08);
        border: 1px solid rgba(239,68,68,0.35);
        color: #F87171;
      }

      /* KPIs. minmax with a min() so a narrow phone gets one full-width column
         instead of a card wider than the screen. */
      .adm-kpis {
        display: grid; gap: ${tokens.gap}px; margin-bottom: ${tokens.gap}px;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
      }
      .adm-stat { padding: 16px 17px; transition: border-color .16s ease, transform .16s ease; }
      .adm-stat:hover { border-color: ${tokens.borderStrong}; transform: translateY(-1px); }
      .adm-stat-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .adm-stat-title {
        font-size: 12.5px; font-weight: 600; color: ${tokens.sub};
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .adm-stat-icon {
        width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .adm-stat-value {
        font-size: 27px; font-weight: 800; letter-spacing: -0.02em;
        margin: 10px 0 8px; line-height: 1.1;
      }
      .adm-stat-foot {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; font-size: 12px; font-weight: 600;
      }

      .adm-revenue {
        display: grid; gap: 2px; margin-bottom: ${tokens.gap}px; overflow: hidden;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
      }
      .adm-revenue-cell { display: flex; gap: 13px; padding: 18px 19px; align-items: flex-start; }
      .adm-revenue-value { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin: 4px 0 2px; }

      .adm-two-col {
        display: grid; gap: ${tokens.gap}px; margin-bottom: ${tokens.gap}px;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
      }
      .adm-panel { padding: 4px 18px 8px; }
      .adm-panel-title {
        margin: 0; padding: 16px 0 13px; font-size: 15px; font-weight: 700;
        border-bottom: 1px solid;
      }
      .adm-empty { padding: 26px 0; text-align: center; font-size: 13px; color: ${tokens.faint}; }

      .adm-list { list-style: none; margin: 0; padding: 0; }
      .adm-row {
        display: flex; align-items: center; gap: 12px; padding: 12px 0;
        border-bottom: 1px solid ${tokens.border};
      }
      .adm-row:last-child { border-bottom: none; }
      .adm-rank {
        width: 26px; height: 26px; border-radius: 8px; flex-shrink: 0;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 12px; font-weight: 700; border: 1px solid;
      }
      .adm-row-primary {
        font-size: 13.5px; font-weight: 600;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .adm-row-secondary {
        font-size: 11.5px; color: ${tokens.sub}; margin-top: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .adm-menu-grid {
        display: grid; gap: ${tokens.gap}px;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 235px), 1fr));
      }
      .adm-menu-card {
        display: flex; flex-direction: column; align-items: flex-start;
        text-align: left; padding: 17px 16px; cursor: pointer; color: ${tokens.txt};
        background: ${tokens.raised};
        transition: border-color .16s ease, transform .16s ease, background .16s ease;
      }
      .adm-menu-card:hover {
        border-color: var(--accent); transform: translateY(-2px);
        background: rgba(255,255,255,0.05);
      }
      .adm-menu-card:active { transform: translateY(0); }
      .adm-menu-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .adm-menu-icon { width: 36px; height: 36px; border-radius: 11px; margin-bottom: 13px; }
      .adm-menu-label { font-size: 14.5px; font-weight: 700; margin-bottom: 5px; }
      .adm-menu-desc { font-size: 12.5px; line-height: 1.5; }

      .adm-sk {
        display: inline-block; border-radius: 6px;
        background: linear-gradient(90deg, rgba(255,255,255,0.05) 25%,
                                            rgba(255,255,255,0.10) 37%,
                                            rgba(255,255,255,0.05) 63%);
        background-size: 400% 100%;
        animation: adm-shimmer 1.3s ease-in-out infinite;
      }
      @keyframes adm-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }

      @media (max-width: 560px) {
        .adm-title { font-size: 22px; }
        .adm-stat-value { font-size: 24px; }
        .adm-head { gap: 12px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .adm-stat, .adm-menu-card, .adm-btn { transition: none; }
        .adm-stat:hover, .adm-menu-card:hover { transform: none; }
        .adm-sk, .adm-spin { animation: none; }
      }
    `}</style>
  );
}
