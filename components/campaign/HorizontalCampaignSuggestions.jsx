import { useState, useEffect, useMemo } from 'react';
import { Trophy, Clock, Users, X, ChevronRight, Gift } from 'lucide-react';
import api from '../../api';
import config from '../../config';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * Compact in-feed campaign strip.
 *
 * Renders NOTHING unless there is at least one active/upcoming campaign to
 * show — no header, no "no campaigns" copy, no reserved space. Loading and
 * error both resolve to `null` for the same reason.
 *
 * Data comes from the existing `/campaigns/?limit=20` endpoint; "active" is
 * the same rule the campaigns page uses (status active/upcoming, with active
 * campaigns dropped once their entry deadline has passed).
 */

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

const STATUS_META = {
  active: { label: 'Live', color: '#10B981' },
  upcoming: { label: 'Soon', color: '#F59E0B' },
};

function deadlineOf(campaign) {
  return campaign.entry_deadline || campaign.end_date || null;
}

function countdown(campaign) {
  const end = deadlineOf(campaign);
  if (!end) return null;
  const diff = new Date(end) - new Date();
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return mins > 0 ? `${mins}m left` : 'Ending soon';
}

function prizeOf(campaign) {
  const title = campaign.prize_title || campaign.prize_description;
  if (title && String(title).trim()) return String(title).trim();
  const value = Number(campaign.prize_value ?? campaign.prize_amount);
  if (Number.isFinite(value) && value > 0) return `${value.toLocaleString()} ETB`;
  return null;
}

function participantsOf(campaign) {
  const n = Number(
    campaign.total_entries ?? campaign.entries_count ?? campaign.participant_count ?? 0,
  );
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n);
}

// Same "active" rule the campaigns page uses.
function isShowable(campaign, now) {
  if (campaign.status !== 'active' && campaign.status !== 'upcoming') return false;
  if (campaign.status === 'active') {
    const end = deadlineOf(campaign);
    if (end && new Date(end) <= now) return false;
  }
  return true;
}

const CSS = `
.fcc-wrap{width:100%;max-width:560px;box-sizing:border-box;margin:4px auto 16px;
  padding:12px 12px 13px;border-radius:18px;
  background:linear-gradient(160deg,var(--fcc-tint) 0%,var(--fcc-card) 58%);
  border:1px solid var(--fcc-line);box-shadow:0 6px 22px rgba(0,0,0,.28);
  animation:fcc-in .38s cubic-bezier(.2,.8,.3,1) both;}
.fcc-head{display:flex;align-items:center;gap:9px;margin-bottom:11px;padding:0 2px;}
.fcc-mark{width:26px;height:26px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;
  background:linear-gradient(135deg,var(--fcc-brand),#8B5CF6);color:#fff;
  box-shadow:0 3px 10px var(--fcc-brand-38);}
.fcc-head-title{font-size:11.5px;font-weight:800;letter-spacing:.14em;color:var(--fcc-txt);
  text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fcc-count{flex-shrink:0;min-width:18px;padding:1px 6px;border-radius:999px;text-align:center;
  background:var(--fcc-brand-20);border:1px solid var(--fcc-brand-38);color:var(--fcc-brand);
  font-size:10px;font-weight:800;line-height:16px;}
.fcc-x{margin-left:auto;flex-shrink:0;display:grid;place-items:center;width:28px;height:28px;
  border:none;background:transparent;border-radius:9px;color:var(--fcc-sub);cursor:pointer;
  transition:background .18s,color .18s;-webkit-tap-highlight-color:transparent;}
.fcc-x:hover{background:var(--fcc-brand-12);color:var(--fcc-txt);}
.fcc-x:focus-visible{outline:2px solid var(--fcc-brand);outline-offset:1px;}

.fcc-rail{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;
  padding-bottom:2px;scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}
.fcc-rail::-webkit-scrollbar{display:none;}
.fcc-rail[data-single="true"]{overflow-x:visible;}

.fcc-tile{flex:0 0 auto;width:284px;max-width:100%;scroll-snap-align:start;box-sizing:border-box;
  display:flex;align-items:center;gap:11px;text-align:left;font:inherit;
  padding:10px;border-radius:15px;cursor:pointer;color:var(--fcc-txt);
  background:var(--fcc-tile);border:1px solid var(--fcc-line);
  transition:transform .2s cubic-bezier(.2,.8,.3,1),border-color .2s,box-shadow .2s;
  -webkit-tap-highlight-color:transparent;}
.fcc-rail[data-single="true"] .fcc-tile{width:100%;flex:1 1 auto;}
@media(hover:hover){.fcc-tile:hover{transform:translateY(-2px);border-color:var(--fcc-brand-55);
  box-shadow:0 8px 20px rgba(0,0,0,.32);}}
.fcc-tile:active{transform:translateY(0) scale(.995);}
.fcc-tile:focus-visible{outline:2px solid var(--fcc-brand);outline-offset:2px;}

.fcc-thumb{position:relative;width:58px;height:58px;flex-shrink:0;border-radius:13px;overflow:hidden;
  display:grid;place-items:center;color:var(--fcc-brand);
  background:linear-gradient(135deg,var(--fcc-brand-20),rgba(139,92,246,.18));}
.fcc-thumb img{width:100%;height:100%;object-fit:cover;display:block;}

.fcc-body{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px;}
.fcc-titlerow{display:flex;align-items:center;gap:7px;min-width:0;}
.fcc-title{min-width:0;font-size:13.5px;font-weight:700;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fcc-status{flex-shrink:0;display:inline-flex;align-items:center;gap:4px;
  padding:2px 7px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:.09em;
  text-transform:uppercase;color:#fff;}
.fcc-dot{width:5px;height:5px;border-radius:50%;background:currentColor;}
.fcc-status[data-live="true"] .fcc-dot{animation:fcc-pulse 1.9s ease-in-out infinite;}
.fcc-desc{font-size:11.5px;line-height:1.35;color:var(--fcc-sub);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fcc-meta{display:flex;align-items:center;gap:9px;margin-top:2px;min-width:0;flex-wrap:nowrap;overflow:hidden;}
.fcc-meta em{display:inline-flex;align-items:center;gap:4px;font-style:normal;
  font-size:10.5px;font-weight:700;color:var(--fcc-brand);white-space:nowrap;min-width:0;}
.fcc-meta em span{overflow:hidden;text-overflow:ellipsis;}
.fcc-go{flex-shrink:0;display:grid;place-items:center;width:30px;height:30px;border-radius:10px;
  background:var(--fcc-brand-12);color:var(--fcc-brand);transition:background .2s,transform .2s;}
@media(hover:hover){.fcc-tile:hover .fcc-go{background:var(--fcc-brand);color:#0B1207;transform:translateX(2px);}}

.fcc-all{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;font:inherit;
  margin-top:10px;padding:9px 12px;border-radius:12px;cursor:pointer;
  background:transparent;border:1px solid var(--fcc-line);color:var(--fcc-brand);
  font-size:12.5px;font-weight:700;transition:background .18s,border-color .18s;
  -webkit-tap-highlight-color:transparent;}
.fcc-all:hover{background:var(--fcc-brand-12);border-color:var(--fcc-brand-55);}
.fcc-all:focus-visible{outline:2px solid var(--fcc-brand);outline-offset:2px;}

@keyframes fcc-in{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
@keyframes fcc-pulse{0%,100%{opacity:1;}50%{opacity:.35;}}
@media(prefers-reduced-motion:reduce){
  .fcc-wrap,.fcc-tile,.fcc-go,.fcc-dot{animation:none!important;transition:none!important;}
  .fcc-tile:hover{transform:none!important;}
}
`;

export function HorizontalCampaignSuggestions({ onCampaignClick, onDismiss, onViewAll }) {
  const { colors: T } = useTheme();
  const [campaigns, setCampaigns] = useState([]);
  const [ready, setReady] = useState(false);
  // Re-render once a minute so the countdown stays honest.
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.request('/campaigns/?limit=20');
        const all = Array.isArray(data) ? data : (data.results || []);
        const now = new Date();
        const showable = all
          .filter((c) => c && c.id != null && isShowable(c, now))
          .sort((a, b) => {
            // Live campaigns first, then whichever closes soonest.
            if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
            const ea = deadlineOf(a) ? new Date(deadlineOf(a)).getTime() : Infinity;
            const eb = deadlineOf(b) ? new Date(deadlineOf(b)).getTime() : Infinity;
            return ea - eb;
          })
          .slice(0, 6);
        if (!cancelled) setCampaigns(showable);
      } catch (err) {
        // An unreachable campaigns API must not put anything in the feed.
        if (!cancelled) setCampaigns([]);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hasDeadline = useMemo(
    () => campaigns.some((c) => deadlineOf(c)),
    [campaigns],
  );

  useEffect(() => {
    if (!hasDeadline) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, [hasDeadline]);

  const cssVars = {
    '--fcc-brand': BRAND,
    '--fcc-brand-12': `${BRAND}1F`,
    '--fcc-brand-20': `${BRAND}33`,
    '--fcc-brand-38': `${BRAND}61`,
    '--fcc-brand-55': `${BRAND}8C`,
    '--fcc-card': T.cardBg || '#161616',
    '--fcc-tile': T.bg || '#0D0D0D',
    '--fcc-tint': `${BRAND}14`,
    '--fcc-line': T.border || '#262626',
    '--fcc-txt': T.txt || '#fff',
    '--fcc-sub': T.sub || '#9AA08F',
  };

  // Nothing to show → render nothing at all. No header, no placeholder copy,
  // no reserved height. This covers loading, API errors and "no campaigns".
  if (!ready || campaigns.length === 0) return null;

  const single = campaigns.length === 1;

  return (
    <section className="fcc-wrap" style={cssVars} aria-label="Active campaigns">
      <style>{CSS}</style>

      <div className="fcc-head">
        <span className="fcc-mark" aria-hidden="true"><Trophy size={14} /></span>
        <span className="fcc-head-title">Active Campaigns</span>
        {!single && <span className="fcc-count">{campaigns.length}</span>}
        {onDismiss && (
          <button className="fcc-x" type="button" onClick={onDismiss} aria-label="Hide campaigns">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="fcc-rail" data-single={single}>
        {campaigns.map((campaign) => {
          const img = mediaUrl(campaign.image || campaign.banner_image);
          const status = STATUS_META[campaign.status] || STATUS_META.active;
          const left = countdown(campaign);
          const prize = prizeOf(campaign);
          const people = participantsOf(campaign);
          const typeLabel = TYPE_LABEL[campaign.campaign_type] || null;
          const blurb = campaign.description || prize || typeLabel || 'Join and compete for rewards';

          return (
            <button
              key={campaign.id}
              type="button"
              className="fcc-tile"
              onClick={() => onCampaignClick?.(campaign.id)}
              aria-label={`${campaign.title}${left ? `, ${left}` : ''}. View campaign`}
            >
              <span className="fcc-thumb" aria-hidden="true">
                {img ? <img src={img} alt="" loading="lazy" /> : <Trophy size={24} />}
              </span>

              <span className="fcc-body">
                <span className="fcc-titlerow">
                  <span className="fcc-title">{campaign.title}</span>
                  <span
                    className="fcc-status"
                    data-live={campaign.status === 'active'}
                    style={{ background: status.color }}
                  >
                    <span className="fcc-dot" />
                    {status.label}
                  </span>
                </span>

                <span className="fcc-desc">{blurb}</span>

                <span className="fcc-meta">
                  {prize && (
                    <em title={prize}><Gift size={11} /><span>{prize}</span></em>
                  )}
                  {people && (
                    <em><Users size={11} /><span>{people}</span></em>
                  )}
                  {left && (
                    <em><Clock size={11} /><span>{left}</span></em>
                  )}
                </span>
              </span>

              <span className="fcc-go" aria-hidden="true"><ChevronRight size={17} /></span>
            </button>
          );
        })}
      </div>

      {!single && onViewAll && (
        <button className="fcc-all" type="button" onClick={onViewAll}>
          View all campaigns <ChevronRight size={14} />
        </button>
      )}
    </section>
  );
}
