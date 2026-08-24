import { Trophy, Users, Clock, Flame, Award, Calendar } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

const BRAND = '#8fc441';

const STATUS_META = {
  active:    { color: '#10B981', label: 'Active', icon: Flame },
  voting:    { color: '#3B82F6', label: 'Voting', icon: Award },
  upcoming:  { color: '#F59E0B', label: 'Soon',   icon: Clock },
  completed: { color: '#94A3B8', label: 'Ended',  icon: Calendar },
};

function timeLeft(endDate) {
  if (!endDate) return '';
  const diff = new Date(endDate) - new Date();
  if (diff <= 0) return 'Ended';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`;
}

function getActualStatus(campaign) {
  if (campaign.end_date) {
    const diff = new Date(campaign.end_date) - new Date();
    if (diff <= 0) return 'ended';
  }
  if (campaign.voting_end) {
    const diff = new Date(campaign.voting_end) - new Date();
    if (diff <= 0) return 'ended';
  }
  return campaign.status;
}

export function CampaignCard({ campaign, onClick }) {
  const { colors: T } = useTheme();
  const actualStatus = getActualStatus(campaign);
  const statusInfo = STATUS_META[actualStatus] || STATUS_META.active;
  const StatusIcon = statusInfo.icon;
  const isActive = actualStatus === 'active';
  const hasEntered = campaign.has_entered;

  const btnLabel = isActive 
    ? (hasEntered ? 'View Campaign' : 'View & Join')
    : actualStatus === 'upcoming' 
      ? 'Coming Soon' 
      : actualStatus === 'voting' 
        ? 'Vote Now' 
        : 'View Results';

  return (
    <div
      onClick={onClick}
      style={{
        background: T.cardBg,
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${T.border}`,
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        marginBottom: 16,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Banner Image */}
      <div style={{ position: 'relative', height: 180, overflow: 'hidden' }}>
        {campaign.image ? (
          <img
            src={campaign.image.startsWith('http') ? campaign.image : `${window.location.origin}${campaign.image}`}
            alt={campaign.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #1A1A1A 0%, #0D0D0D 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Trophy size={56} color={BRAND} opacity={0.5} />
          </div>
        )}
        
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 100%)',
        }} />
        
        {/* Status pill */}
        <div style={{
          position: 'absolute',
          top: 12,
          left: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 20,
          background: statusInfo.color,
          zIndex: 2,
        }}>
          <StatusIcon size={12} color="#fff" strokeWidth={3} />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
            {statusInfo.label}
          </span>
        </div>

        {/* Campaign type pill - moved to bottom left of image */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 20,
          background: 'rgba(143, 196, 65, 0.9)',
          zIndex: 2,
        }}>
          <Trophy size={12} color="#fff" />
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
            Campaign
          </span>
        </div>
      </div>
      
      {/* Content */}
      <div style={{ padding: 16 }}>
        <h3 style={{
          color: T.txt,
          fontSize: 18,
          fontWeight: 700,
          margin: '0 0 8px 0',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {campaign.title}
        </h3>
        {campaign.description && (
          <p style={{
            color: T.sub,
            fontSize: 14,
            margin: '0 0 12px 0',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.5,
          }}>
            {campaign.description}
          </p>
        )}
        
        {/* Meta Info */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trophy size={14} color={BRAND} />
            <span style={{ color: T.sub, fontSize: 13 }}>
              {campaign.prize_description || (campaign.prize_amount ? `${campaign.prize_amount} ETB` : 'Prize')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} color="#888" />
            <span style={{ color: T.sub, fontSize: 13 }}>
              {campaign.entries_count || 0} entries
            </span>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Clock size={14} color="#888" />
          <span style={{ color: T.sub, fontSize: 13 }}>
            {timeLeft(campaign.end_date)}
          </span>
        </div>
        
        {/* Action Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            transition: 'all 0.2s ease',
            background: isActive ? BRAND : actualStatus === 'voting' ? '#3B82F6' : '#262626',
            color: isActive ? '#000' : '#888',
          }}
          onMouseEnter={(e) => {
            if (isActive) {
              e.currentTarget.style.background = '#7db33a';
            }
          }}
          onMouseLeave={(e) => {
            if (isActive) {
              e.currentTarget.style.background = BRAND;
            }
          }}
        >
          {btnLabel}
        </button>
      </div>
    </div>
  );
}
