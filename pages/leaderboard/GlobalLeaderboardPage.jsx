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

export function GlobalLeaderboardPage({ onBack }) {
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
    <div style={{ minHeight: '100vh', background: T.bg, color: T.txt }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: T.bg, borderBottom: `1px solid ${T.border}`,
        padding: '10px 12px 8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.txt, padding: 2, display: 'flex' }}>
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
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map(p => {
            const Icon = p.icon;
            const active = period === p.id;
            return (
              <button key={p.id} onClick={() => setPeriod(p.id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                padding: '6px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: active ? BRAND : `${BRAND}15`,
                color: active ? '#000' : T.sub,
                fontSize: 10, fontWeight: 700,
                boxShadow: active ? `0 4px 12px ${BRAND}40` : 'none',
                whiteSpace: 'nowrap',
              }}>
                <Icon size={11} /> {p.label}
              </button>
            );
          })}
        </div>

        {/* Date picker for daily */}
        {period === 'daily' && (
          <div style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${T.border}`,
            background: T.bg,
          }}>
            <button
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
              }}
              style={{
                padding: '6px 12px',
                background: `${BRAND}20`,
                border: 'none',
                borderRadius: 6,
                color: BRAND,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              ←
            </button>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600, color: T.txt }}>
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
              style={{
                padding: '6px 12px',
                background: selectedDate >= getTodayStr() ? `${T.border}30` : `${BRAND}20`,
                border: 'none',
                borderRadius: 6,
                color: selectedDate >= getTodayStr() ? T.sub : BRAND,
                cursor: selectedDate >= getTodayStr() ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '12px 10px 80px' }}>
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
