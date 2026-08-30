import { useState, useEffect } from 'react';
import { Trophy, Crown, Medal, Heart, MessageCircle, Gift, Calendar, Users, ChevronLeft } from 'lucide-react';
import api from '../../api';
import { useTheme } from '../../contexts/ThemeContext';

const BRAND = '#8fc441';
const MEDAL = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function RankBadge({ rank }) {
  if (rank === 1) return <Crown size={16} color={MEDAL[1]} />;
  if (rank === 2) return <Medal size={16} color={MEDAL[2]} />;
  if (rank === 3) return <Medal size={16} color={MEDAL[3]} />;
  return <span style={{ fontSize: 12, fontWeight: 700, color: '#888', minWidth: 16, textAlign: 'center' }}>#{rank}</span>;
}

function Avatar({ username, rank, size = 32 }) {
  const medalColor = MEDAL[rank];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: medalColor ? `linear-gradient(135deg, ${medalColor}, ${medalColor}99)` : `${BRAND}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: rank <= 3 ? '#000' : BRAND, fontSize: size * 0.42, fontWeight: 800,
      border: `2px solid ${medalColor || BRAND + '50'}`,
    }}>
      {username?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function EntryRow({ entry, T }) {
  const { rank, username, total_score, likes_count, comments_count, gifts_count, post_count, campaigns_count } = entry;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      borderBottom: `1px solid ${T.border}`,
      background: rank === 1 ? `${BRAND}08` : 'transparent',
    }}>
      <div style={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        <RankBadge rank={rank} />
      </div>
      <Avatar username={username} rank={rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.txt, marginBottom: 2 }}>{username}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: T.sub }}>
            <Heart size={9} color="#EF4444" /> {likes_count ?? 0}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: T.sub }}>
            <MessageCircle size={9} color="#888" /> {comments_count ?? 0}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: T.sub }}>
            <Gift size={9} color={BRAND} /> {gifts_count ?? 0}
          </span>
          {campaigns_count > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: T.sub }}>
              <Trophy size={9} color={BRAND} /> {campaigns_count}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: rank <= 3 ? (MEDAL[rank] || BRAND) : BRAND }}>
          {typeof total_score === 'number' ? total_score.toFixed(1) : 0}
        </div>
        <div style={{ fontSize: 9, color: T.sub }}>pts</div>
      </div>
    </div>
  );
}

function CampaignSection({ section, T }) {
  const [expanded, setExpanded] = useState(true);
  const statusColor = section.campaign_status === 'active' ? '#10B981' : '#94A3B8';
  return (
    <div style={{ marginBottom: 10, borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', background: T.card || T.cardBg,
          border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0,
          }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: T.txt }}>{section.campaign_title}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
            background: `${BRAND}20`, color: BRAND, border: `1px solid ${BRAND}40`,
          }}>{section.leaders.length} leaders</span>
        </div>
        <Trophy size={12} color={BRAND} />
      </button>
      {expanded && (
        <div style={{ background: T.bg }}>
          {section.leaders.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: T.sub, fontSize: 12 }}>No entries yet</div>
          ) : (
            section.leaders.map(entry => <EntryRow key={entry.user_id} entry={entry} T={T} />)
          )}
        </div>
      )}
    </div>
  );
}

const PERIODS = [
  { id: 'daily',   label: 'Daily',   icon: Calendar },
  { id: 'weekly',  label: 'Weekly',  icon: Trophy },
  { id: 'monthly', label: 'Monthly', icon: Users },
  { id: 'grand',   label: 'Grand Final', icon: Crown },
];

// Bottom nav is 60px tall (AppShell), so the last row must clear it plus the
// device safe area. Everything is scoped under .glb-page so no other page is
// affected — the app ships no global box-sizing reset, hence the local one.
const GLB_CSS = (T) => `
  .glb-page{
    min-height:100vh; min-height:100dvh;
    width:100%; overflow-x:hidden;
    display:flex; flex-direction:column;
  }
  .glb-page, .glb-page *, .glb-page *::before, .glb-page *::after{ box-sizing:border-box; }

  .glb-inner{ width:100%; max-width:760px; margin:0 auto; padding-left:12px; padding-right:12px; }
  .glb-head{ position:sticky; top:0; z-index:10; padding:10px 0 8px; }
  .glb-body{ flex:1 1 auto; padding-top:12px;
    padding-bottom:calc(60px + 24px + env(safe-area-inset-bottom, 0px)); }

  /* Tabs scroll inside their own bar; the page never scrolls sideways. */
  .glb-tabs{ width:100%; overflow-x:auto; overflow-y:hidden;
    -webkit-overflow-scrolling:touch; scrollbar-width:none; }
  .glb-tabs::-webkit-scrollbar{ display:none; }
  .glb-tablist{ display:flex; gap:6px; min-width:100%; }
  .glb-tab{
    flex:1 0 auto; display:inline-flex; align-items:center; justify-content:center; gap:5px;
    min-height:38px; padding:8px 12px; border-radius:10px; border:none; cursor:pointer;
    background:${BRAND}15; color:${T.sub}; font-size:12px; font-weight:700;
    white-space:nowrap; -webkit-tap-highlight-color:transparent;
    transition:background .18s ease, color .18s ease;
  }
  .glb-tab.is-active{ background:${BRAND}; color:#000; box-shadow:0 4px 12px ${BRAND}40; }
  .glb-tab:focus-visible{ outline:2px solid ${BRAND}; outline-offset:2px; }

  /* Date navigation */
  .glb-date{ display:flex; align-items:center; gap:8px; margin-top:10px;
    padding:6px; border-radius:10px; border:1px solid ${T.border}; }
  .glb-date-btn{
    flex:0 0 auto; min-width:44px; min-height:44px; display:inline-flex;
    align-items:center; justify-content:center; border:none; border-radius:8px;
    font-size:16px; font-weight:700; cursor:pointer;
    -webkit-tap-highlight-color:transparent;
  }
  .glb-date-label{
    flex:1 1 auto; min-width:0; text-align:center; font-size:14px; font-weight:700;
    color:${T.txt}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }

  @media (min-width:768px){
    .glb-inner{ padding-left:20px; padding-right:20px; }
    .glb-tab{ font-size:13px; }
  }
  @media (prefers-reduced-motion: reduce){ .glb-tab{ transition:none; } }
`;

export function GlobalLeaderboardPage({ onBack, onShowProfile }) {
  const { colors: T } = useTheme();
  const [period, setPeriod] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [period, selectedDate]);

  const load = async () => {
    try {
      setLoading(true);
      let url = `/leaderboard/global/?period=${period}`;
      if (period === 'daily') url += `&date=${selectedDate}`;
      const res = await api.request(url, { skipCache: true });
      setData(res);
    } catch (e) {
      console.error('GlobalLeaderboard error', e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const leaders = data?.leaders || [];
  const campaigns = data?.campaigns || [];

  return (
    <div className="glb-page" style={{ background: T.bg, color: T.txt }}>
      <style>{GLB_CSS(T)}</style>
      {/* Header */}
      <div className="glb-head" style={{
        background: T.bg, borderBottom: `1px solid ${T.border}`,
      }}>
        <div className="glb-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {onBack && (
            <button aria-label="Go back" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.txt, padding: 2, display: 'flex' }}>
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: `linear-gradient(135deg, ${BRAND}, #F59E0B)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Trophy size={15} color="#000" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.txt, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Leaderboard</div>
              <div style={{ fontSize: 8, color: T.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>All campaign rankings</div>
            </div>
          </div>
        </div>

        {/* Period tabs */}
        <div className="glb-tabs">
          <div className="glb-tablist" role="tablist">
            {PERIODS.map(p => {
              const Icon = p.icon;
              const active = period === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriod(p.id)}
                  className={active ? 'glb-tab is-active' : 'glb-tab'}
                >
                  <Icon size={13} /> {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date picker for daily */}
        {period === 'daily' && (
          <div className="glb-date" style={{ background: T.bg }}>
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
              }}
              className="glb-date-btn"
              aria-label="Previous day"
              style={{ background: `${BRAND}20`, color: BRAND }}
            >
              ←
            </button>
            <div className="glb-date-label">
              {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                const newDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                if (newDate <= getTodayStr()) {
                  setSelectedDate(newDate);
                }
              }}
              disabled={selectedDate >= getTodayStr()}
              className="glb-date-btn"
              aria-label="Next day"
              style={{
                background: selectedDate >= getTodayStr() ? `${T.border}30` : `${BRAND}20`,
                color: selectedDate >= getTodayStr() ? T.sub : BRAND,
                cursor: selectedDate >= getTodayStr() ? 'not-allowed' : 'pointer',
              }}
            >
              →
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Content */}
      <div className="glb-inner glb-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: T.sub }}>Loading...</div>
        ) : period === 'daily' ? (
          campaigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: T.sub }}>
              <Trophy size={40} color={T.border} style={{ marginBottom: 12 }} />
              <div>No campaign activity on {selectedDate}</div>
            </div>
          ) : (
            campaigns.map(section => (
              <CampaignSection key={section.campaign_id} section={section} T={T} />
            ))
          )
        ) : (
          <>
            {/* Summary banner */}
            <div style={{
              padding: '12px 16px', borderRadius: 12, marginBottom: 16,
              background: `linear-gradient(135deg, ${BRAND}15, ${BRAND}05)`,
              border: `1px solid ${BRAND}25`,
            }}>
              <div style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>
                {period === 'weekly' ? "📅 This week's top performers across all campaigns" : 
                 period === 'monthly' ? "🗓️ This month's top performers across all campaigns" :
                 "🏆 Grand Final - Top performers from the last 6 months"}
              </div>
            </div>

            {leaders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: T.sub }}>
                <Trophy size={40} color={T.border} style={{ marginBottom: 12 }} />
                <div>No data for this period yet</div>
              </div>
            ) : (
              <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                {leaders.map(entry => <EntryRow key={entry.user_id} entry={entry} T={T} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
