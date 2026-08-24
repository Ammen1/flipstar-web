import { useState, useEffect } from 'react';
import { Trophy, Search, Heart, MessageCircle, Share2, Gift, Crown, Medal } from 'lucide-react';
import api from '../../../api';

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function LeaderboardPage({ theme, campaignId, campaign }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('overall');
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [searchQuery, setSearchQuery] = useState('');

  const PERIODS = [
    { id: 'overall', label: 'All Time' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
  ];

  // When switching to daily, clamp selectedDate to [campaign start_date, today]
  useEffect(() => {
    if (selectedPeriod === 'daily' && campaign?.start_date) {
      const startKey = campaign.start_date.slice(0, 10);
      const todayKey = getTodayStr();
      const endKey = campaign.entry_deadline ? campaign.entry_deadline.slice(0, 10) : todayKey;
      const maxKey = endKey < todayKey ? endKey : todayKey;
      if (selectedDate < startKey) setSelectedDate(startKey);
      else if (selectedDate > maxKey) setSelectedDate(maxKey);
    }
  }, [selectedPeriod, campaign]);

  useEffect(() => {
    if (campaignId) loadLeaderboard();
  }, [campaignId, selectedPeriod, selectedDate]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      let url = `/campaigns/${campaignId}/leaderboard/?period=${selectedPeriod}`;
      if (selectedPeriod === 'daily') url += `&date=${selectedDate}`;
      const data = await api.request(url);
      setEntries(data.entries || []);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = entries.filter(entry =>
    entry.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const MEDAL_COLOR = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };

  if (!campaignId) {
    return <div style={{ padding: 40, textAlign: 'center', color: theme.sub }}>No campaign selected</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: theme.txt }}>
      {/* Header */}
      <div style={{ padding: '24px 32px', borderBottom: `1px solid ${theme.border}`, background: theme.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <Trophy size={28} color={theme.accent} />
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: theme.txt, margin: 0 }}>Leaderboard</h1>
            <p style={{ fontSize: 14, color: theme.sub, margin: 0 }}>{campaign?.title || 'Campaign Leaderboard'}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Period Tabs */}
          <div style={{ display: 'flex', gap: 6, background: theme.bg, padding: 4, borderRadius: 8 }}>
            {PERIODS.map((period) => (
              <button
                key={period.id}
                onClick={() => setSelectedPeriod(period.id)}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: selectedPeriod === period.id ? theme.accent : 'transparent',
                  color: selectedPeriod === period.id ? '#000' : theme.sub,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                }}
              >{period.label}</button>
            ))}
          </div>

          {/* Date picker for daily */}
          {selectedPeriod === 'daily' && (
            <input
              type="date"
              value={selectedDate}
              min={campaign?.start_date ? campaign.start_date.slice(0, 10) : undefined}
              max={getTodayStr()}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: theme.bg, color: theme.txt,
                fontSize: 13, outline: 'none',
              }}
            />
          )}

          {/* Search */}
          <div style={{ flex: 1, minWidth: 200, maxWidth: 300 }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color={theme.sub} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8,
                  border: `1px solid ${theme.border}`, background: theme.bg, color: theme.txt,
                  fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: theme.sub }}>Loading leaderboard...</div>
        ) : filteredEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: theme.card, borderRadius: 16, border: `1px solid ${theme.border}` }}>
            <Trophy size={48} color={theme.border} style={{ marginBottom: 16 }} />
            <p style={{ fontSize: 16, color: theme.sub, margin: 0 }}>
              {selectedPeriod === 'daily' ? `No entries for ${selectedDate}` : 'No entries yet'}
            </p>
          </div>
        ) : (
          <div style={{ background: theme.card, borderRadius: 14, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            {/* Stats summary */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.border}`, background: `${theme.accent}10` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: theme.sub }}>
                {filteredEntries.length} participant{filteredEntries.length !== 1 ? 's' : ''}
                {selectedPeriod === 'daily' ? ` · ${selectedDate}` : ''}
              </span>
            </div>
            {filteredEntries.map((entry, idx) => {
              const rank = entry.rank || idx + 1;
              const medalColor = MEDAL_COLOR[rank];
              const RankIcon = rank === 1 ? Crown : rank <= 3 ? Medal : null;
              return (
                <div
                  key={entry.user_id || entry.id || idx}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 20px',
                    borderBottom: idx < filteredEntries.length - 1 ? `1px solid ${theme.border}` : 'none',
                    background: rank === 1 ? `${theme.accent}10` : 'transparent',
                  }}
                >
                  {/* Rank */}
                  <div style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>
                    {RankIcon ? (
                      <RankIcon size={20} color={medalColor} />
                    ) : (
                      <span style={{ fontSize: 15, fontWeight: 700, color: theme.sub }}>#{rank}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                    background: medalColor ? `linear-gradient(135deg, ${medalColor}, ${medalColor}bb)` : `${theme.accent}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 16, fontWeight: 800,
                    border: `2px solid ${medalColor || theme.border}`,
                  }}>
                    {entry.username?.[0]?.toUpperCase() || '?'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: theme.txt, marginBottom: 4 }}>
                      {entry.username || 'Anonymous'}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Heart size={11} color="#EF4444" />
                        <span style={{ fontSize: 12, color: theme.sub }}>{entry.likes_count ?? 0}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <MessageCircle size={11} color="#888" />
                        <span style={{ fontSize: 12, color: theme.sub }}>{entry.comments_count ?? 0}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Share2 size={11} color="#3B82F6" />
                        <span style={{ fontSize: 12, color: theme.sub }}>{entry.shares_count ?? 0}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Gift size={11} color={theme.accent} />
                        <span style={{ fontSize: 12, color: theme.sub }}>{entry.gifts_count ?? 0}</span>
                      </div>
                      {(entry.post_count || entry.posts_count) > 0 && (
                        <span style={{ fontSize: 12, color: theme.sub }}>{entry.post_count || entry.posts_count} posts</span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: rank <= 3 ? (medalColor || theme.accent) : theme.accent }}>
                      {typeof entry.total_score === 'number' ? entry.total_score.toFixed(1) : (entry.score ?? 0)}
                    </div>
                    <div style={{ fontSize: 11, color: theme.sub }}>pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
