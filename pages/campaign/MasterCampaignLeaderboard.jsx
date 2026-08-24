import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, Medal, Calendar, Crown, Heart, MessageCircle, Gift } from 'lucide-react';
import api from '../../api';
import config from '../../config';
import { useTheme } from '../../contexts/ThemeContext';

const BACKEND = config.API_BASE_URL.replace('/api', '');

function mediaUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return BACKEND + url;
}

const PERIOD_GROUPS = [
  { id: 'daily', label: 'Daily (Sub-campaigns)' },
  { id: 'weekly', label: 'Weekly (7 days)' },
  { id: 'monthly', label: 'Monthly (4 weeks)' },
  { id: 'grand', label: 'Grand Final (6 months)' },
];

function getDateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MEDAL = { 1: '#FFD700', 2: '#A8A8A8', 3: '#CD7F32' };
const BRAND = '#8fc441';

export function MasterCampaignLeaderboard({ masterCampaignId, onBack }) {
  const { colors: T } = useTheme();
  const [loading, setLoading] = useState(true);
  const [masterCampaign, setMasterCampaign] = useState(null);
  const [periodType, setPeriodType] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(getDateKey(new Date().toISOString()));
  const [leaderboard, setLeaderboard] = useState(null);

  useEffect(() => {
    loadMasterCampaign();
  }, [masterCampaignId]);

  useEffect(() => {
    if (masterCampaign) {
      loadLeaderboard();
    }
  }, [periodType, selectedDate]);

  const loadMasterCampaign = async () => {
    try {
      setLoading(true);
      const data = await api.request(`/admin/master-campaigns/${masterCampaignId}/`);
      setMasterCampaign(data);
    } catch (error) {
      console.error('Failed to load master campaign:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      let query = `/leaderboard/global/?period=${periodType}&master_campaign_id=${masterCampaignId}`;
      if (periodType === 'daily') {
        query += `&date=${selectedDate}`;
      }
      const data = await api.request(query);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      setLeaderboard(null);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePeriod = (period) => {
    setPeriodType(period);
  };

  const handleChangeDate = (e) => {
    setSelectedDate(e.target.value);
  };

  if (loading && !masterCampaign) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: T.sub }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        background: T.card,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            color: T.txt,
          }}
        >
          <ArrowLeft size={24} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.txt }}>
            {masterCampaign?.title || 'Master Campaign'}
          </h1>
          <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>
            Leaderboard
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 20px', maxWidth: 800, margin: '0 auto' }}>
        {/* Period tabs */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
          {PERIOD_GROUPS.map(p => {
            const isActive = periodType === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleChangePeriod(p.id)}
                style={{
                  padding: '8px 16px',
                  background: isActive ? BRAND : T.card,
                  color: isActive ? '#000' : T.txt,
                  border: `1.5px solid ${isActive ? BRAND : T.border}`,
                  borderRadius: 20,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 600,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.18s ease',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Date picker for daily */}
        {periodType === 'daily' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: T.sub, marginBottom: 6, display: 'block' }}>
              Select Date
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 10,
              border: `1px solid ${T.border}`,
              background: T.card,
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
                →
              </button>
            </div>
          </div>
        )}

        {/* Summary banner */}
        <div style={{
          padding: '12px 16px',
          borderRadius: 12,
          marginBottom: 16,
          background: `linear-gradient(135deg, ${BRAND}15, ${BRAND}05)`,
          border: `1px solid ${BRAND}25`,
        }}>
          <div style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>
            {periodType === 'daily' ? "📅 Daily sub-campaigns and their leaders" :
             periodType === 'weekly' ? "🏆 Weekly winners aggregated from 7 daily campaigns" :
             periodType === 'monthly' ? "🗓️ Monthly winners aggregated from 4 weekly campaigns" :
             "👑 Grand Final winners from 6 months (24 weeks)"}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 60, color: T.sub }}>
            Loading leaderboard...
          </div>
        )}

        {/* Empty state */}
        {!loading && !leaderboard && (
          <div style={{ textAlign: 'center', padding: 60, color: T.sub }}>
            <Trophy size={40} color={T.border} style={{ marginBottom: 12 }} />
            <div>No data available</div>
          </div>
        )}

        {/* Leaderboard content */}
        {!loading && leaderboard && (
          <>
            {periodType === 'daily' ? (
              // Daily: Show sub-campaigns with their leaders
              <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                {leaderboard.campaigns && leaderboard.campaigns.length > 0 ? (
                  leaderboard.campaigns.map((campaign, cIdx) => (
                    <div key={campaign.campaign_id} style={{ borderBottom: cIdx < leaderboard.campaigns.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                      <div style={{
                        padding: '12px 18px',
                        background: `${T.pri}08`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        <Calendar size={14} color={BRAND} />
                        <span style={{ fontWeight: 700, fontSize: 14, color: T.txt }}>{campaign.campaign_title}</span>
                        {campaign.campaign_date && (
                          <span style={{ fontSize: 12, color: T.sub, marginLeft: 'auto' }}>{campaign.campaign_date}</span>
                        )}
                      </div>
                      {campaign.leaders && campaign.leaders.length > 0 ? (
                        campaign.leaders.map((entry, idx) => {
                          const rank = entry.rank || idx + 1;
                          const medalColor = MEDAL[rank];
                          return (
                            <div
                              key={entry.user_id || idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                padding: '12px 18px',
                                borderBottom: idx < campaign.leaders.length - 1 ? `1px solid ${T.border}20` : 'none',
                                background: T.card,
                              }}
                            >
                              <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                                {rank <= 3 ? (
                                  rank === 1 ? <Trophy size={16} color="#FFD700" /> :
                                  rank === 2 ? <Medal size={16} color="#A8A8A8" /> :
                                               <Medal size={16} color="#CD7F32" />
                                ) : (
                                  <span style={{ fontSize: 13, fontWeight: 700, color: T.sub }}>#{rank}</span>
                                )}
                              </div>
                              <div style={{
                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                background: medalColor
                                  ? `linear-gradient(135deg, ${medalColor}, ${medalColor}bb)`
                                  : `linear-gradient(135deg, ${T.pri}60, #8fc44160)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 13, fontWeight: 800,
                                overflow: 'hidden',
                              }}>
                                {entry.profile_image ? (
                                  <img src={mediaUrl(entry.profile_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  entry.username?.[0]?.toUpperCase()
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 14, color: T.txt }}>{entry.username}</div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                  <span style={{ fontSize: 11, color: T.sub }}>{entry.likes_count || 0} likes</span>
                                  <span style={{ fontSize: 11, color: T.sub }}>{entry.comments_count || 0} comments</span>
                                </div>
                              </div>
                              <div style={{ fontWeight: 700, fontSize: 16, color: BRAND }}>{entry.total_score || 0}</div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: '20px 18px', textAlign: 'center', color: T.sub, fontSize: 13 }}>
                          No leaders yet
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '40px 18px', textAlign: 'center', color: T.sub, fontSize: 13 }}>
                    No daily campaigns found for this date
                  </div>
                )}
              </div>
            ) : (
              // Weekly/Monthly/Grand: Show aggregated leaders
              <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                {leaderboard.leaders && leaderboard.leaders.length > 0 ? (
                  leaderboard.leaders.map((entry, idx) => {
                    const rank = entry.rank || idx + 1;
                    const medalColor = MEDAL[rank];
                    return (
                      <div
                        key={entry.user_id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: '14px 18px',
                          borderBottom: idx < leaderboard.leaders.length - 1 ? `1px solid ${T.border}` : 'none',
                          background: rank === 1 ? `${T.pri}08` : T.card,
                        }}
                      >
                        <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                          {rank <= 3 ? (
                            rank === 1 ? <Trophy size={20} color="#FFD700" /> :
                            rank === 2 ? <Medal size={20} color="#A8A8A8" /> :
                                         <Medal size={20} color="#CD7F32" />
                          ) : (
                            <span style={{ fontSize: 15, fontWeight: 700, color: T.sub }}>#{rank}</span>
                          )}
                        </div>
                        <div style={{
                          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                          background: medalColor
                            ? `linear-gradient(135deg, ${medalColor}, ${medalColor}bb)`
                            : `linear-gradient(135deg, ${T.pri}60, #8fc44160)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 15, fontWeight: 800,
                          overflow: 'hidden',
                        }}>
                          {entry.profile_image ? (
                            <img src={mediaUrl(entry.profile_image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            entry.username?.[0]?.toUpperCase()
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: T.txt }}>{entry.username}</div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Heart size={11} color="#EF4444" />
                              <span style={{ fontSize: 12, color: T.sub }}>{entry.likes_count || 0}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <MessageCircle size={11} color="#888" />
                              <span style={{ fontSize: 12, color: T.sub }}>{entry.comments_count || 0}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Gift size={11} color="#8fc441" />
                              <span style={{ fontSize: 12, color: T.sub }}>{entry.gifts_count || 0}</span>
                            </div>
                            {entry.campaigns_count > 0 && (
                              <span style={{ fontSize: 12, color: T.sub }}>{entry.campaigns_count} campaigns</span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 18, color: BRAND }}>{entry.total_score || 0}</div>
                          <div style={{ fontSize: 11, color: T.sub }}>pts</div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '40px 18px', textAlign: 'center', color: T.sub, fontSize: 13 }}>
                    No leaders for this period yet
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default MasterCampaignLeaderboard;
