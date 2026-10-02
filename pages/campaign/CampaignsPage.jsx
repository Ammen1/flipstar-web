import { useState, useEffect, useMemo } from 'react';
import { Trophy, Award, Clock, ChevronLeft, Calendar, Flame, Sparkles } from 'lucide-react';
import api from '../../api';
import config from '../../config';
import { useTheme } from '../../contexts/ThemeContext';
import { CampaignCard } from '../../components/campaign/CampaignCard';
import { CampaignCardSkeleton } from '../../components/campaign/CampaignCardSkeleton';
import { ensureCampaignStyles } from '../../components/campaign/campaignStyles';
import { BRAND, statusTheme } from '../../components/campaign/campaignTheme';

ensureCampaignStyles();

const mediaUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${config.API_BASE_URL.replace('/api', '')}${url}`;
};

const TABS = [
  { id: 'all', label: 'All', icon: Trophy, accent: null },
  { id: 'active', label: 'Active', icon: Flame, accent: statusTheme('active').accent },
  { id: 'voting', label: 'Voting', icon: Award, accent: statusTheme('voting').accent },
  { id: 'upcoming', label: 'Coming soon', icon: Clock, accent: statusTheme('upcoming').accent },
  { id: 'completed', label: 'Completed', icon: Calendar, accent: statusTheme('completed').accent },
];

export function CampaignsPage({ onCampaignClick, onBack }) {
  const { colors: T } = useTheme();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const brand = T?.priFallback || BRAND;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const status = filter === 'all' ? '' : filter;
        const data = await api.request(`/campaigns/?status=${status}`);
        if (cancelled) return;
        setCampaigns(Array.isArray(data) ? data : data.results || []);
      } catch (error) {
        console.error('Failed to load campaigns:', error);
        if (!cancelled) setCampaigns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    // A filter changed while a slower request was in flight used to let the
    // older response land last and overwrite the newer one.
    return () => {
      cancelled = true;
    };
  }, [filter]);

  // `selectedCampaignId` is set elsewhere to open a campaign on arrival, and
  // consuming it here keeps a stale key from firing on a later unrelated load.
  //
  // It does NOT navigate, which matches what this page did before: the old
  // code put the campaign into a `selectedCampaign` state that nothing
  // rendered, so the key was read and then dropped. That looks like a feature
  // half-removed rather than one working -- but making it navigate is a
  // routing change, so it is reported rather than taken.
  useEffect(() => {
    if (sessionStorage.getItem('selectedCampaignId')) {
      sessionStorage.removeItem('selectedCampaignId');
    }
  }, [campaigns]);

  // A campaign is only "ended" once its entry deadline has passed. voting_end
  // alone does not end it while entries are still open.
  const actualStatus = (campaign) => {
    const deadline = campaign.entry_deadline || campaign.end_date;
    if (deadline && new Date(deadline) - new Date() <= 0) return 'completed';
    return campaign.status;
  };

  const activeTab = useMemo(() => TABS.find((t) => t.id === filter) || TABS[0], [filter]);
  const pageAccent = activeTab.accent || brand;

  const gutter = 'clamp(12px, 4vw, 24px)';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        boxSizing: 'border-box',
        // Side gutter scales with the screen; the bottom clears the tab bar
        // and the home indicator, so the last card is never under either.
        padding: `0 ${gutter} calc(96px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        {/* ── header ──────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: T.bg,
            paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
            paddingBottom: 6,
            marginInline: `calc(${gutter} * -1)`,
            paddingInline: gutter,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              aria-label="Go back"
              onClick={onBack}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                width: 40,
                height: 40,
                marginLeft: -8,
                display: 'grid',
                placeItems: 'center',
                color: T.txt,
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={24} strokeWidth={2.5} />
            </button>
            <div style={{ minWidth: 0 }}>
              <h1
                style={{
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 'clamp(19px, 5vw, 24px)',
                  fontWeight: 900,
                  letterSpacing: '-0.02em',
                  color: T.txt,
                }}
              >
                <Trophy size={21} color={pageAccent} strokeWidth={2.5} aria-hidden="true" />
                Campaigns
              </h1>
              <p
                style={{
                  margin: '1px 0 0',
                  fontSize: 'clamp(11px, 3vw, 12.5px)',
                  fontWeight: 600,
                  letterSpacing: '0.3px',
                  color: T.sub,
                }}
              >
                Compete. Create. Win.
              </p>
            </div>
          </div>

          <div
            className="camp-filters"
            role="tablist"
            aria-label="Filter campaigns"
            style={{ marginInline: `calc(${gutter} * -1)`, paddingInline: gutter }}
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const on = filter === tab.id;
              const tint = tab.accent || brand;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className="camp-filter"
                  onClick={() => setFilter(tab.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 38,
                    padding: '0 14px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: on ? '#07130a' : T.txt,
                    background: on ? tint : T.cardBg,
                    border: `1.5px solid ${on ? tint : T.border}`,
                    boxShadow: on ? `0 6px 16px -6px ${tint}` : 'none',
                  }}
                >
                  <Icon size={13} strokeWidth={2.6} aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── hero ────────────────────────────────────────────────────── */}
        <section
          style={{
            position: 'relative',
            overflow: 'hidden',
            margin: '14px 0 18px',
            padding: 'clamp(20px, 6vw, 34px) clamp(16px, 5vw, 28px)',
            borderRadius: 20,
            textAlign: 'center',
            background: `radial-gradient(120% 140% at 50% -20%, ${pageAccent}26, transparent 62%), linear-gradient(135deg, ${T.cardBg}, ${T.bg})`,
            border: `1px solid ${pageAccent}30`,
          }}
        >
          <div
            className="camp-hero-orb"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -70,
              right: -50,
              width: 190,
              height: 190,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${pageAccent}38, transparent 68%)`,
              animation: 'camp-pulse 5s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />
          <span
            aria-hidden="true"
            style={{
              width: 'clamp(52px, 14vw, 64px)',
              height: 'clamp(52px, 14vw, 64px)',
              margin: '0 auto 12px',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: `linear-gradient(135deg, ${pageAccent}, ${pageAccent}99)`,
              boxShadow: `0 10px 30px -8px ${pageAccent}`,
            }}
          >
            <Trophy size={28} color="#07130a" strokeWidth={2.5} />
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: 'clamp(22px, 6.4vw, 32px)',
              fontWeight: 900,
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              color: T.txt,
            }}
          >
            Win real prizes
          </h2>
          <p
            style={{
              margin: '8px auto 0',
              maxWidth: 420,
              fontSize: 'clamp(12px, 3.4vw, 14px)',
              lineHeight: 1.55,
              color: T.sub,
            }}
          >
            Join campaigns, showcase your talent, and compete for real rewards.
          </p>
          <p
            style={{
              margin: '10px 0 0',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              fontSize: 'clamp(10px, 2.9vw, 11.5px)',
              fontWeight: 800,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              color: pageAccent,
            }}
          >
            <span>Create</span>
            <span aria-hidden="true" style={{ opacity: 0.5 }}>•</span>
            <span>Compete</span>
            <span aria-hidden="true" style={{ opacity: 0.5 }}>•</span>
            <span>Win</span>
          </p>
        </section>

        {/* ── list ────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="camp-grid" aria-busy="true" aria-live="polite">
            {[0, 1, 2, 3].map((i) => (
              <CampaignCardSkeleton key={i} theme={T} index={i} />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div
            style={{
              padding: 'clamp(36px, 12vw, 64px) clamp(20px, 6vw, 32px)',
              textAlign: 'center',
              background: T.cardBg,
              border: `1px dashed ${T.border}`,
              borderRadius: 20,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 68,
                height: 68,
                margin: '0 auto 14px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                background: `${pageAccent}1f`,
                border: `1px solid ${pageAccent}3a`,
              }}
            >
              <Sparkles size={28} color={pageAccent} strokeWidth={2} />
            </span>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.txt }}>
              {filter === 'all' ? 'No campaigns yet' : `No ${activeTab.label.toLowerCase()} campaigns`}
            </h3>
            <p
              style={{
                margin: '8px auto 0',
                maxWidth: 320,
                fontSize: 13,
                lineHeight: 1.55,
                color: T.sub,
              }}
            >
              New challenges are coming soon. Check back later and be ready to compete.
            </p>
            {filter !== 'all' && (
              <button
                type="button"
                onClick={() => setFilter('all')}
                style={{
                  marginTop: 16,
                  minHeight: 44,
                  padding: '0 20px',
                  borderRadius: 12,
                  cursor: 'pointer',
                  border: `1.5px solid ${pageAccent}`,
                  background: 'transparent',
                  color: pageAccent,
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                See all campaigns
              </button>
            )}
          </div>
        ) : (
          <div className="camp-grid">
            {campaigns.map((campaign, idx) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                status={actualStatus(campaign)}
                imageUrl={mediaUrl(campaign.image)}
                onOpen={onCampaignClick}
                index={idx}
                theme={T}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CampaignsPage;
