import { useState, useEffect, useRef } from 'react';
import { Trophy, Flame, Clock, Users, X, ChevronRight } from 'lucide-react';
import api from '../../api';
import config from '../../config';
import { useTheme } from '../../contexts/ThemeContext';

const BRAND = '#8fc441';
const BACKEND = config.API_BASE_URL.replace('/api', '');

function mediaUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return BACKEND + url;
}

const TYPE_LABEL = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  grand: 'Grand Final',
};

const TYPE_COLOR = {
  daily: '#3B82F6',
  weekly: '#8B5CF6',
  monthly: '#F59E0B',
  grand: '#EF4444',
};

const STATUS_COLOR = {
  active: '#10B981',
  upcoming: '#F59E0B',
  voting: '#3B82F6',
};

export function HorizontalCampaignSuggestions({ onCampaignClick, onDismiss }) {
  const { colors: T } = useTheme();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const data = await api.request('/campaigns/?limit=20');
      const all = Array.isArray(data) ? data : (data.results || []);

      // Show active and upcoming campaigns (same as campaigns page)
      const now = new Date();
      const active = all.filter(c => {
        // Include active and upcoming campaigns
        if (c.status !== 'active' && c.status !== 'upcoming') return false;
        // Only exclude if entry_deadline has passed and status is not upcoming
        if (c.status === 'active') {
          const deadline = c.entry_deadline || c.end_date;
          if (deadline) {
            const deadlineDate = new Date(deadline);
            if (deadlineDate <= now) return false;
          }
        }
        return true;
      });

      setCampaigns(active.slice(0, 6));
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  const getDaysLeft = (campaign) => {
    const endDate = campaign.entry_deadline || campaign.end_date;
    if (!endDate) return null;
    const diff = new Date(endDate) - new Date();
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    if (days === 0) {
      const hours = Math.floor((diff % 86400000) / 3600000);
      return hours > 0 ? `${hours}h left` : 'Ending soon';
    }
    return `${days} day${days > 1 ? 's' : ''} left`;
  };

  if (loading) return null;

  return (
    <div
      style={{
        margin: '12px 0 28px',
        background: `linear-gradient(180deg, ${T.cardBg || '#111'} 0%, ${T.cardBg || '#111'} 100%)`,
        borderTop: `2px solid ${BRAND}40`,
        borderBottom: `2px solid ${BRAND}40`,
        padding: '18px 0 20px',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 0,
      }}
    >
      {/* Decorative gradient overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${BRAND}60, transparent)`,
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `linear-gradient(135deg, ${BRAND}, ${TYPE_COLOR.weekly})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 12px ${BRAND}40`,
          }}>
            <Trophy size={18} color="#fff" />
          </div>
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, color: T.txt, letterSpacing: 0.3 }}>CAMPAIGNS</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 11, color: T.sub, fontWeight: 500 }}>Active Competitions</span>
              <span style={{
                background: `${BRAND}25`, color: BRAND,
                fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 8,
                border: `1px solid ${BRAND}40`,
              }}>
                {campaigns.length}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: T.sub, borderRadius: 8 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Horizontal scroll */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          gap: 14,
          overflowX: 'auto',
          padding: '0 16px 6px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {campaigns.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: T.sub, fontSize: 13 }}>
            No active campaigns at the moment
          </div>
        ) : campaigns.map((campaign) => {
          const img = mediaUrl(campaign.image || campaign.banner_image);
          const typeColor = TYPE_COLOR[campaign.campaign_type] || BRAND;
          const typeLabel = TYPE_LABEL[campaign.campaign_type] || campaign.campaign_type;
          const statusColor = STATUS_COLOR[campaign.status] || '#666';

          return (
            <div
              key={campaign.id}
              onClick={() => {
                console.log('[Campaign Suggestions] Clicked campaign:', campaign.id, campaign.title);
                onCampaignClick?.(campaign.id);
              }}
              style={{
                width: 170,
                minWidth: 170,
                background: T.cardBg || '#1A1A1A',
                border: `2px solid ${BRAND}40`,
                borderRadius: 16,
                overflow: 'hidden',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                boxShadow: `0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px ${BRAND}15`,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                e.currentTarget.style.borderColor = BRAND;
                e.currentTarget.style.boxShadow = `0 8px 24px ${BRAND}35, 0 0 0 1px ${BRAND}30`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.borderColor = `${BRAND}40`;
                e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px ${BRAND}15`;
              }}
            >
              {/* Campaign image with gradient overlay */}
              <div style={{ height: 100, position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: `linear-gradient(135deg, ${typeColor}44 0%, ${BRAND}33 50%, ${typeColor}44 100%)`,
                  zIndex: 1,
                }} />
                {img ? (
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 0 }}>
                    <Trophy size={36} color={typeColor} />
                  </div>
                )}
                {/* Status badge */}
                <div style={{
                  position: 'absolute', top: 8, left: 8, zIndex: 2,
                  background: statusColor, color: '#fff',
                  fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 4,
                  boxShadow: `0 2px 8px ${statusColor}50`,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  <Flame size={10} />
                  {campaign.status === 'active' ? 'LIVE' : 'SOON'}
                </div>
                {/* Type badge */}
                <div style={{
                  position: 'absolute', top: 8, right: 8, zIndex: 2,
                  background: `${typeColor}dd`, color: '#fff',
                  fontSize: 9, fontWeight: 900, padding: '3px 8px', borderRadius: 8,
                  boxShadow: `0 2px 8px ${typeColor}50`,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {typeLabel}
                </div>
                {/* Decorative corner */}
                <div style={{
                  position: 'absolute', bottom: 0, right: 0, zIndex: 2,
                  width: 40, height: 40,
                  background: `linear-gradient(135deg, transparent 50%, ${typeColor}66 50%)`,
                }} />
              </div>

              {/* Info */}
              <div style={{ padding: '12px 12px 14px', background: T.cardBg || '#1A1A1A' }}>
                <div style={{
                  fontSize: 13, fontWeight: 800, color: T.txt,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: 6,
                  letterSpacing: 0.2,
                }}>
                  {campaign.title}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                    <Users size={11} color={BRAND} />
                    <span style={{ fontSize: 11, color: BRAND, fontWeight: 600 }}>{campaign.total_entries || 0} participants</span>
                  </div>

                {getDaysLeft(campaign) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    <Clock size={10} color={BRAND} />
                    <span style={{ fontSize: 10, color: BRAND, fontWeight: 700 }}>{getDaysLeft(campaign)}</span>
                  </div>
                )}

                {/* View button */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('[Campaign Suggestions] Join button clicked:', campaign.id, campaign.title);
                    onCampaignClick?.(campaign.id);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: BRAND,
                    borderRadius: 10, padding: '7px 0',
                    color: '#000', fontSize: 12, fontWeight: 800,
                    boxShadow: `0 4px 12px ${BRAND}40`,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    cursor: 'pointer',
                  }}
                >
                  Join Now <ChevronRight size={13} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`div::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}
