import { useState, useEffect, useRef } from 'react';
import { Trophy, Calendar, Award, Users, Clock, Upload, Video, Check, X, Heart, Share2, ArrowLeft, AlertCircle, Star, Zap, TrendingUp, Medal, Crown, Target, Flame, List, BarChart3, FileText, MessageCircle, ChevronDown, Gift, Camera, RotateCw } from 'lucide-react';
import api from '../../api';
import config from '../../config';
import { useTheme } from '../../contexts/ThemeContext';
import { ProcessedImage, ProcessedVideo } from '../../components/feed/ProcessedMedia';
import { MediaProcessingState } from '../../components/common/MediaProcessingState';
import { isMediaReady, isVideoPost } from '../../utils/media';
import {
  accentOf,
  button as btn,
  ensureUiKitStyles,
  field as fieldStyle,
  formatBytes,
  label as labelStyle,
  RADIUS,
  SUCCESS,
  surfaceOf,
  TAP,
} from '../../components/common/uiKit';

ensureUiKitStyles();
import { formatCampaignDate } from '../../utils/campaignDates';
import { newUploadId } from '../../utils/uploadId';
import { usePostProcessing } from '../../hooks/usePostProcessing';
import { uploadTracker } from '../../services/uploadTracker';

const mediaUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${config.API_BASE_URL.replace('/api', '')}${url}`;
};

export function CampaignDetailPage({ campaignId, onBack, onShowLeaderboard, onShowFeed }) {
  const { colors: T } = useTheme();
  const [campaign, setCampaign] = useState(null);
  const [entries, setEntries] = useState([]);
  // Your own entry, if its media is still being encoded, updates in place.
  usePostProcessing(
    entries.map((e) => e.reel).filter(Boolean),
    (updated) => setEntries((prev) => prev.map((e) => (
      e.reel?.id === updated.id ? { ...e, reel: { ...e.reel, ...updated } } : e
    ))),
  );
  const [loading, setLoading] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [userEntry, setUserEntry] = useState(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  const [openSections, setOpenSections] = useState({ desc: true, reqs: false, timeline: false, scoring: false });
  const [userLevel, setUserLevel] = useState(1);
  const [userXp, setUserXp] = useState(0);
  const [userXpForNextLevel, setUserXpForNextLevel] = useState(0);
  const [isEligible, setIsEligible] = useState(true);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (campaignId) {
      loadCampaignDetails();
    }
  }, [campaignId]);

  const loadCampaignDetails = async () => {
    try {
      setLoading(true);
      const data = await api.request(`/campaigns/${campaignId}/`);
      setCampaign(data);
      setEntries(data.entries || []);
      // Set user level and XP from API
      if (data.user_level !== undefined) {
        setUserLevel(data.user_level);
        setUserXp(data.user_xp);
        setUserXpForNextLevel(data.user_xp_for_next_level);
      }
      if (data.is_eligible !== undefined) {
        setIsEligible(data.is_eligible);
      }
      // Check if user has already entered
      const userHasEntered = data.entries?.some(entry => entry.user?.id === data.current_user_id);
      setUserEntry(userHasEntered ? data.entries.find(entry => entry.user?.id === data.current_user_id) : null);
    } catch (error) {
      console.error('Failed to load campaign:', error);
    } finally {
      setLoading(false);
    }
  };

  // Stated in the campaign's own timezone, with the time. Formatting in the
  // viewer's timezone made the same deadline read as a different day
  // depending on the device, and dropping the time made 23:59 and 00:00
  // indistinguishable. See utils/campaignDates.js.
  const formatDate = (dateString) => formatCampaignDate(dateString);

  const getTimeRemaining = (endDate) => {
    if (!endDate) return 'N/A';
    const now = new Date();
    const end = new Date(endDate);

    // Validate date
    if (isNaN(end.getTime())) {
      console.warn('Invalid end date:', endDate);
      return 'N/A';
    }

    const diff = end - now;

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days} days ${hours} hours`;
    return `${hours} hours`;
  };

  const getActualStatus = (campaign) => {
    // Check if campaign has ended based on end_date
    if (campaign.end_date) {
      const diff = new Date(campaign.end_date) - new Date();
      if (diff <= 0) return 'ended';
    }
    // Also check voting_end if available
    if (campaign.voting_end) {
      const diff = new Date(campaign.voting_end) - new Date();
      if (diff <= 0) return 'ended';
    }
    // Return the backend status if dates haven't passed
    return campaign.status;
  };

  const canSubmit = () => {
    if (!campaign) return false;
    const now = new Date();
    const start = new Date(campaign.start_date);
    const deadline = new Date(campaign.entry_deadline);
    
    // Validate dates
    if (isNaN(start.getTime()) || isNaN(deadline.getTime())) {
      console.warn('Invalid campaign dates:', { start_date: campaign.start_date, entry_deadline: campaign.entry_deadline });
      return false;
    }
    
    return campaign.status === 'active' && now >= start && now <= deadline && !userEntry;
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: T.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ color: T.sub }}>Loading campaign...</div>
      </div>
    );
  }

  const actualStatus = getActualStatus(campaign);

  if (!campaign) {
    return (
      <div style={{
        minHeight: '100vh',
        background: T.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color={T.red} style={{ marginBottom: 16 }} />
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: T.txt, marginBottom: 8 }}>
            Campaign Not Found
          </h2>
          <button
            onClick={onBack}
            style={{
              marginTop: 16,
              padding: '12px 24px',
              background: T.pri,
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to Campaigns
          </button>
        </div>
      </div>
    );
  }

  const BRAND = '#8fc441';
  const toggleSection = (k) => setOpenSections(s => ({ ...s, [k]: !s[k] }));

  const Accordion = ({ id, icon: Icon, title, subtitle, children, defaultColor }) => {
    const open = openSections[id];
    return (
      <div style={{
        background: T.cardBg || '#fff',
        borderRadius: 12,
        border: `1px solid ${T.border}`,
        overflow: 'hidden',
        marginBottom: 10,
      }}>
        <button
          onClick={() => toggleSection(id)}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px',
            background: 'none', border: 'none', cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: (defaultColor || BRAND) + '22',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon size={16} color={defaultColor || BRAND} strokeWidth={2.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.txt }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <div style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s ease',
            color: T.sub,
            display: 'flex',
          }}>
            <ChevronDown size={18} />
          </div>
        </button>
        {open && (
          <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${T.border}` }}>
            <div style={{ paddingTop: 12 }}>{children}</div>
          </div>
        )}
      </div>
    );
  };

  const hasRequirements = (campaign.min_followers > 0 || campaign.min_level > 0 || campaign.min_votes_per_reel > 0 || campaign.required_hashtags || campaign.winner_count > 0);

  const CTAButton = () => {
    if (canSubmit()) {
      if (!isEligible) {
        return (
          <div style={{
            width: '100%', padding: '12px 16px',
            background: 'rgba(239,68,68,0.1)',
            border: `1.5px solid #EF4444`,
            borderRadius: 12,
            color: '#EF4444',
            fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <AlertCircle size={16} strokeWidth={3} />
            You don't meet the requirements to join this campaign
          </div>
        );
      }
      return (
        <button
          onClick={() => {
            if (!api.hasToken()) { alert('Please log in to submit an entry.'); return; }
            setShowSubmitModal(true);
          }}
          style={{
            width: '100%',
            padding: '14px',
            background: `linear-gradient(135deg, ${BRAND}, #F59E0B)`,
            border: 'none', borderRadius: 12,
            color: '#000', fontSize: 15, fontWeight: 800,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: `0 6px 20px ${BRAND}55`,
          }}
        >
          <Upload size={18} strokeWidth={2.5} />
          Join Campaign
        </button>
      );
    }
    if (userEntry) {
      return (
        <div style={{
          width: '100%', padding: '12px 16px',
          background: T.bg,
          border: `1.5px solid ${T.border}`,
          borderRadius: 12,
          color: T.sub,
          fontSize: 14, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Check size={16} strokeWidth={3} />
          Your Entry is Live 🎉
        </div>
      );
    }
    return (
      <div style={{
        width: '100%', padding: '12px 16px',
        background: T.bg,
        border: `1.5px solid ${T.border}`,
        borderRadius: 12,
        color: T.sub,
        fontSize: 14, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <AlertCircle size={16} />
        {actualStatus === 'completed' ? 'Campaign Ended' : actualStatus === 'upcoming' ? 'Starts Soon' : 'Not Accepting Entries'}
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: T.bg,
      padding: isMobile ? '0 0 100px' : '16px 24px 80px',
      boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {/* Sticky Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: T.bg,
          padding: isMobile ? '10px 12px' : '0 0 12px',
          borderBottom: isMobile ? `1px solid ${T.border}` : 'none',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button aria-label="Go back"
            onClick={onBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, display: 'flex', color: T.txt, flexShrink: 0,
            }}
          >
            <ArrowLeft size={22} strokeWidth={2.5} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: isMobile ? 15 : 17, fontWeight: 800, color: T.txt,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {campaign.title}
            </div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 10,
            background: actualStatus === 'active' ? 'rgba(16,185,129,0.15)' :
                        actualStatus === 'voting' ? 'rgba(59,130,246,0.15)' :
                        actualStatus === 'upcoming' ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.15)',
            color: actualStatus === 'active' ? '#10B981' :
                   actualStatus === 'voting' ? '#3B82F6' :
                   actualStatus === 'upcoming' ? '#F59E0B' : '#94A3B8',
            fontSize: 10, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.5px',
            flexShrink: 0,
          }}>
            {actualStatus}
          </div>
        </div>

        <div style={{ padding: isMobile ? '12px' : '0' }}>
          {/* HERO: Image + Prize overlay */}
          <div style={{
            position: 'relative',
            borderRadius: 16,
            overflow: 'hidden',
            marginBottom: 14,
            border: `1px solid ${T.border}`,
            background: campaign.image ? '#000' : `linear-gradient(135deg, ${BRAND}30, #F59E0B30)`,
            aspectRatio: isMobile ? '16/10' : '16/7',
          }}>
            {campaign.image ? (
              <div style={{
                position: 'absolute', inset: 0,
                background: `url(${mediaUrl(campaign.image)}) center/cover`,
              }} />
            ) : (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Trophy size={64} color={BRAND} opacity={0.4} strokeWidth={1.5} />
              </div>
            )}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.75) 100%)',
            }} />
            {/* Prize overlay */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: `linear-gradient(135deg, ${BRAND}, #F59E0B)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 16px ${BRAND}70`,
                flexShrink: 0,
              }}>
                <Award size={22} color="#000" strokeWidth={2.5} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10, color: 'rgba(255,255,255,0.8)',
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
                }}>
                  Prize Pool
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 900,
                  color: BRAND, lineHeight: 1.1,
                }}>
                  {campaign.prize_value ? `${campaign.prize_value} ETB` : (campaign.prize_title || '—')}
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 10,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                color: '#fff', fontSize: 11, fontWeight: 800,
                flexShrink: 0,
              }}>
                <Clock size={12} strokeWidth={2.5} />
                {getTimeRemaining(campaign.voting_end || campaign.entry_deadline)}
              </div>
            </div>
          </div>

          {/* Quick Stats Row */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8, marginBottom: 14,
          }}>
            {[
              { label: 'Entries',    value: campaign.total_entries === 0 ? 1 : campaign.total_entries, color: '#3B82F6', icon: Users },
              { label: 'Winners',    value: campaign.winner_count || 1,  color: BRAND,     icon: Crown },
            ].map((s, i) => {
              const I = s.icon;
              return (
                <div key={i} style={{
                  padding: '10px 8px',
                  background: T.cardBg || '#fff',
                  borderRadius: 10,
                  border: `1px solid ${T.border}`,
                  textAlign: 'center',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 4, marginBottom: 4,
                  }}>
                    <I size={11} color={s.color} strokeWidth={2.5} />
                    <span style={{ fontSize: 9, color: T.sub, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>
                    {s.value}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Primary CTA */}
          <div style={{ marginBottom: 14 }}>
            <CTAButton />
          </div>

          {/* Secondary actions */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => onShowLeaderboard?.()}
              style={{
                flex: 1, padding: '10px 12px',
                background: T.cardBg || '#fff',
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                color: T.txt, fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <BarChart3 size={15} />
              Leaderboard
            </button>
            <button
              onClick={() => onShowFeed?.()}
              style={{
                flex: 1, padding: '10px 12px',
                background: T.cardBg || '#fff',
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                color: T.txt, fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <List size={15} />
              Feed
            </button>
          </div>

          {/* Your entry (compact) */}
          {userEntry && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(249,224,139,0.08))',
              border: '1.5px solid #10B981',
              borderRadius: 12,
              padding: 14,
              marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: '#10B981',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Check size={18} color="#fff" strokeWidth={3} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.txt }}>
                  Your Entry is Live 🎉
                </div>
                              </div>
            </div>
          )}

          {/* ─── ACCORDIONS ──────────────────────────── */}

          <Accordion id="desc" icon={FileText} title="Campaign Rules" subtitle="Official contest rules" defaultColor={BRAND}>
            <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.7 }}>

              <div style={{ marginBottom: 12, padding: 12, background: `${BRAND}15`, borderRadius: 10, borderLeft: `3px solid ${BRAND}` }}>
                <div style={{ fontSize: 11, color: T.sub, marginBottom: 2 }}>Effective Date: May 2026 &nbsp;·&nbsp; Version: 1.0</div>
                <div style={{ fontSize: 11, color: T.sub }}>Service: FlipStar | flipstar.et &nbsp;·&nbsp; Operated by: Ethio telecom &amp; SkykinTechnologies PLC</div>
              </div>

              {[
                {
                  title: '1. Sponsor & Administrator',
                  content: <p style={{ margin: 0 }}>These contests are exclusively sponsored and administered by <b style={{ color: T.txt }}>Ethio telecom</b> — Headquarters, Addis Ababa, Ethiopia, and <b style={{ color: T.txt }}>SkykinTechnologies PLC</b> — Addis Ababa, Ethiopia.</p>,
                },
                {
                  title: '2. Eligibility',
                  content: ['Be 18 years of age or older.', 'Be an active Ethio telecom prepaid, postpaid, or hybrid mobile customer.', 'Have a valid and active FlipStar account.', 'Have a mobile number in Active status at time of participation.', 'Employees of Ethio telecom and directly associated partner organisations are not eligible.', 'Users using bots, multiple accounts, manipulation, or banned accounts are not eligible.'],
                },
                {
                  title: '3. Contest Periods & Tiers',
                  content: ['Daily Sprint: every 24 hours, 50 winners, 1 GB Daily Data.', 'Weekly Battle: every 7 days, 10 winners, 1,000 ETB via telebirr.', 'Monthly Star: every 30 days, 5 winners, 10,000 ETB via telebirr.', 'Grand Final: 6-month campaign cycle, 3 winners, 500,000 / 300,000 / 200,000 ETB.'],
                },
                {
                  title: '4. How to Enter',
                  content: <><p style={{ margin: '0 0 6px' }}>No purchase is necessary to participate. Register to FlipStar, upload a Flip, and earn an Engagement Score through votes, comments, shares, and gifts.</p><p style={{ margin: 0 }}>Score = (Votes × 1) + (Comments × 2) + (Shares × 5) + (Gifts × 10).</p></>,
                },
                {
                  title: '5. Fair Play Rules',
                  content: ['A single user may contribute a maximum of 5,000 Score Points per day to any one creator.', 'Boosted views do not count toward organic Engagement Score.', 'Botting, automated engagement, self-gifting, vote manipulation, or artificial score inflation is prohibited.', 'Weekly competitions and above must pass AI and/or manual moderation.'],
                },
                {
                  title: '6. Winner Determination & Cooldown',
                  content: ['Winners are determined by highest Engagement Score at the end of each contest period.', 'Winners of a tier cannot win that same tier again for 30 days.', 'Grand Final winners cannot compete for Grand Final prizes for 6 months.'],
                },
                {
                  title: '7. Prizes & Redemption',
                  content: ['Daily data prizes are credited within 24 hours.', 'Weekly and Monthly ETB prizes are sent via telebirr within 10 days.', 'Grand Final ETB prizes are sent via telebirr within 20 days.', 'Winners may need a valid National ID or passport.', 'Unclaimed prizes expire after 30 days and may be awarded to the next eligible runner-up.'],
                },
                {
                  title: '8. Disqualification',
                  content: <p style={{ margin: 0 }}>Ethio telecom and SkykinTechnologies PLC may disqualify any participant who breaches these rules, provides false information, uses bots or manipulation, or harms the platform community.</p>,
                },
                {
                  title: '9. Limitation of Liability',
                  content: <p style={{ margin: 0 }}>Participants understand and agree that they participate at their own risk. The organisers are not liable for technical failures, lost connections, or any other issues beyond their reasonable control.</p>,
                },
                {
                  title: '10. Privacy & General Conditions',
                  content: <p style={{ margin: 0 }}>Winners' names and mobile numbers may be used by Ethio telecom and SkykinTechnologies PLC for promotional and announcement purposes. Personal data is handled according to applicable Ethiopian data protection laws. These rules are governed by the laws of the Federal Democratic Republic of Ethiopia.</p>,
                },
                {
                  title: '11. Contact',
                  content: ['In-App Support: Profile → Help & Support → Contact Us', 'SMS: 9286', 'Email: 994@ethionet.et', 'WhatsApp: +251 99 400 0000', 'Telegram: https://t.me/ethio_telecom', 'Website: https://www.ethiotelecom.et/'],
                },
              ].map((section, idx) => (
                <div key={idx}>
                  <div style={{ fontWeight: 700, color: BRAND, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 14, marginBottom: 6 }}>
                    {section.title}
                  </div>
                  {Array.isArray(section.content)
                    ? section.content.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                          <span style={{ color: BRAND, fontWeight: 800, flexShrink: 0 }}>•</span>
                          <span>{item}</span>
                        </div>
                      ))
                    : section.content}
                </div>
              ))}

            </div>
          </Accordion>

          {hasRequirements && (
            <Accordion id="reqs" icon={Target} title="Entry Requirements" subtitle="What you need to qualify" defaultColor="#3B82F6">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {campaign.required_hashtags && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: T.bg, borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: T.sub, fontWeight: 600, minWidth: 110 }}>Required tags</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: BRAND }}>{campaign.required_hashtags}</span>
                  </div>
                )}
                {campaign.min_followers > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: T.bg, borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: T.sub, fontWeight: 600, minWidth: 110 }}>Min followers</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#3B82F6' }}>{campaign.min_followers}+</span>
                  </div>
                )}
                {campaign.min_level > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', background: T.bg, borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: T.sub, fontWeight: 600, minWidth: 110 }}>Min level</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#F97316' }}>Level {campaign.min_level}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: '120px', flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.sub, fontWeight: 600, minWidth: 110 }}>Your level</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: userLevel >= campaign.min_level ? '#10B981' : '#EF4444' }}>
                        Level {userLevel} ({userXp} XP)
                      </span>
                      {userLevel < campaign.min_level && (
                        <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>
                          Need {campaign.min_level - userLevel} more level{campaign.min_level - userLevel > 1 ? 's' : ''} ({(campaign.min_level - userLevel) * 1000 - userXp} XP)
                        </span>
                      )}
                      {userLevel >= campaign.min_level && (
                        <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>
                          ✓ Eligible
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: T.sub, paddingLeft: '120px', lineHeight: 1.5 }}>
                      Levels are based on XP: Level = (XP ÷ 1,000) + 1. Earn XP by posting, engaging, and daily check-ins.
                    </div>
                  </div>
                )}
                {campaign.min_votes_per_reel > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: T.bg, borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: T.sub, fontWeight: 600, minWidth: 110 }}>Min votes/reel</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#EF4444' }}>{campaign.min_votes_per_reel}+</span>
                  </div>
                )}
                {campaign.winner_count > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: T.bg, borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: T.sub, fontWeight: 600, minWidth: 110 }}>Winners</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#10B981' }}>{campaign.winner_count}</span>
                  </div>
                )}
              </div>
            </Accordion>
          )}

          <Accordion id="timeline" icon={Calendar} title="Timeline" subtitle="Key dates" defaultColor="#8B5CF6">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Starts',          date: campaign.start_date,      color: '#10B981' },
                { label: 'Entry Deadline',  date: campaign.entry_deadline,  color: '#F59E0B' },
                { label: 'Voting Begins',   date: campaign.voting_start,    color: '#3B82F6' },
                { label: 'Voting Ends',     date: campaign.voting_end,      color: '#EF4444' },
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: T.sub, fontWeight: 600, minWidth: 110 }}>{t.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.txt }}>{formatDate(t.date)}</span>
                </div>
              ))}
            </div>
          </Accordion>

          <Accordion id="scoring" icon={TrendingUp} title="How Scoring Works" subtitle="Engagement + votes" defaultColor="#EC4899">
            <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 8px' }}>
                Your total score is calculated from <b style={{ color: T.txt }}>likes, comments, shares, votes, and gifts</b> on your entry during the campaign period.
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 10,
              }}>
                {[
                  { label: 'Likes',    icon: Heart,         color: '#EF4444' },
                  { label: 'Comments', icon: MessageCircle, color: '#3B82F6' },
                  { label: 'Shares',   icon: Share2,        color: '#8B5CF6' },
                  { label: 'Votes',    icon: Award,         color: BRAND     },
                  { label: 'Gifts',    icon: Gift,          color: '#F59E0B' },
                ].map((m, i) => {
                  const I = m.icon;
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', background: T.bg, borderRadius: 8,
                    }}>
                      <I size={14} color={m.color} />
                      <span style={{ fontSize: 12, color: T.txt, fontWeight: 600 }}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Accordion>

          {/* ─── LEADERBOARD ────────────────────────── */}
          <div style={{ marginTop: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Trophy size={18} color={BRAND} strokeWidth={2.5} />
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.txt }}>
                  Leaderboard
                </h2>
              </div>
              <div style={{ fontSize: 11, color: T.sub, fontWeight: 600 }}>
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </div>
            </div>

            {entries.length === 0 ? (
              <div style={{
                padding: '36px 20px',
                textAlign: 'center',
                background: T.cardBg || '#fff',
                borderRadius: 12,
                border: `1px dashed ${T.border}`,
              }}>
                <Video size={36} color={T.sub} style={{ opacity: 0.4, marginBottom: 10 }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: T.txt, marginBottom: 4 }}>
                  No entries yet
                </div>
                <div style={{ fontSize: 12, color: T.sub }}>
                  Be the first to submit!
                </div>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 14,
              }}>
                {entries.map(entry => (
                  <CampaignEntryCard
                    key={entry.id}
                    entry={entry}
                    theme={T}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Submit Modal */}
        {showSubmitModal && (
          <SubmitEntryModal
            theme={T}
            campaign={campaign}
            campaignId={campaignId}
            userLevel={userLevel}
            onClose={() => setShowSubmitModal(false)}
            onSuccess={() => {
              setShowSubmitModal(false);
              loadCampaignDetails();
            }}
          />
        )}
      </div>
    </div>
  );
}

function CampaignEntryCard({ entry, theme: T }) {
  const [isHovered, setIsHovered] = useState(false);

  const getRankBadge = () => {
    if (!entry.rank || entry.rank > 3) return null;
    const badges = {
      1: { color: '#FFD700', icon: 'ðŸ¥‡', label: '1st Place' },
      2: { color: '#C0C0C0', icon: 'ðŸ¥ˆ', label: '2nd Place' },
      3: { color: '#CD7F32', icon: 'ðŸ¥‰', label: '3rd Place' },
    };
    return badges[entry.rank];
  };

  const rankBadge = getRankBadge();

  return (
    <div 
      style={{
        background: T.cardBg || '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        border: rankBadge ? `2px solid ${rankBadge.color}` : `1px solid ${T.border}`,
        boxShadow: isHovered ? `0 8px 24px ${rankBadge ? rankBadge.color + '40' : 'rgba(0,0,0,0.1)'}` : '0 2px 8px rgba(0,0,0,0.05)',
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'all 0.3s ease',
        position: 'relative',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {rankBadge && (
        <div style={{
          position: 'absolute',
          top: 12,
          right: 12,
          padding: '6px 12px',
          background: rankBadge.color,
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <span style={{ fontSize: 16 }}>{rankBadge.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{rankBadge.label}</span>
        </div>
      )}
      
      {/* Only an entry's author ever gets one that is still processing or
          failed: its state, not an empty box. Otherwise a video plays --
          thumbnail first, then the rung for the connection -- where it used
          to be a still thumbnail that could not be played at all. */}
      {entry.reel && !isMediaReady(entry.reel) ? (
        <div style={{ position: 'relative', minHeight: 280, background: '#000' }}>
          <MediaProcessingState post={entry.reel} />
        </div>
      ) : (entry.reel?.media || entry.reel?.image) ? (
        <div style={{ position: 'relative', minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
          {isVideoPost(entry.reel) ? (
            <ProcessedVideo
              post={entry.reel}
              style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain', background: '#000' }}
            />
          ) : (
            <ProcessedImage
              post={entry.reel}
              alt="Entry"
              style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }}
            />
          )}
        </div>
      ) : null}
      
      <div style={{ padding: 16 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #DA9B2A, #F97316)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
              color: '#fff',
              border: '2px solid #8fc441',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}>
              {entry.user.username[0].toUpperCase()}
            </div>
            <div>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: T.txt,
              }}>
                @{entry.user.username}
              </div>
            </div>
          </div>
          {entry.is_winner && (
            <div style={{
              padding: '4px 10px',
              background: 'linear-gradient(135deg, #DA9B2A, #F97316)',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <Crown size={12} />
              WINNER
            </div>
          )}
        </div>

        <p style={{
          margin: 0,
          fontSize: 14,
          color: T.sub,
          marginBottom: 16,
          lineHeight: 1.5,
        }}>
          {entry.reel?.caption || 'No caption'}
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 12,
          borderTop: `1px solid ${T.border}`,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: T.bg,
            borderRadius: 20,
            border: `1px solid ${T.border}`,
          }}>
            <Heart size={14} color={T.sub} />
            <span style={{ fontSize: 12, color: T.txt, fontWeight: 600 }}>
              {entry.vote_count || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubmitEntryModal({ theme: T, campaign, campaignId, userLevel = 0, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [newReelFile, setNewReelFile] = useState(null);
  // One id per entry being submitted, kept across retries of it so a retry
  // after a lost answer gets the post already made (see utils/uploadId.js).
  const uploadIdRef = useRef(null);
  useEffect(() => { uploadIdRef.current = null; }, [newReelFile]);

  // A thumbnail of whatever was chosen, so the person can see they picked the
  // right clip. Revoked when the selection changes or the modal unmounts: an
  // object URL keeps the whole blob alive until it is, and a few unreleased
  // videos is real memory on a phone.
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!newReelFile) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(newReelFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newReelFile]);
  const [newReelCaption, setNewReelCaption] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [cameraMode, setCameraMode] = useState('video'); // 'video' or 'photo'
  const [facingMode, setFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setNewReelFile(file);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  const startCamera = async (mode = cameraMode) => {
    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Your browser does not support camera access. Please use Chrome, Firefox, or Edge.');
        return;
      }

      // Check if we're in a secure context (HTTPS or localhost)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        setError('Camera access requires HTTPS. Please access this site via a secure connection.');
        return;
      }

      // Stop any existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }

      let mediaStream = null;
      let lastError = null;

      // Try to get camera stream with current facingMode
      const constraintAttempts = [
        // Attempt 1: With facingMode and audio (for video mode)
        { video: { facingMode: facingMode }, audio: mode === 'video' },
        // Attempt 2: With facingMode only, no audio
        { video: { facingMode: facingMode }, audio: false },
        // Attempt 3: Without facingMode constraint (fallback)
        { video: true, audio: mode === 'video' },
        // Attempt 4: Video only, no audio
        { video: true, audio: false },
        // Attempt 5: Try with exact facingMode values
        { video: { facingMode: { exact: facingMode } }, audio: false },
      ];

      for (const constraints of constraintAttempts) {
        try {
          console.log('Attempting camera with constraints:', constraints);
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log('Camera access successful');
          break;
        } catch (error) {
          lastError = error;
          console.warn(`Camera attempt failed:`, error.name, error.message);
        }
      }

      if (!mediaStream) {
        // Only show error if all attempts genuinely failed
        if (lastError && lastError.name !== 'NotFoundError') {
          throw lastError;
        }
        // For NotFoundError, don't show error - camera might actually work
        return;
      }

      setStream(mediaStream);
      setShowCamera(true);
    } catch (error) {
      console.error('Camera access denied:', error);

      // Show user-friendly error message based on error type
      let errorMessage = 'Camera access failed. ';
      switch (error.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          errorMessage += 'Camera permission was denied. Please:\n\n1. Click the lock/info icon in your browser address bar\n2. Allow camera access\n3. Refresh the page and try again';
          break;
        case 'NotReadableError':
          errorMessage += 'Camera is already in use by another application (Zoom, Teams, another browser tab, etc.).\n\nPlease close other apps using the camera and try again.';
          break;
        case 'OverconstrainedError':
          errorMessage += 'Your camera does not support the requested resolution. The app will try with lower quality automatically.';
          break;
        case 'NotFoundError':
          errorMessage += 'No camera device found. Please ensure your camera is connected and properly configured.';
          break;
        case 'TypeError':
          errorMessage += 'Camera not supported in this browser. Please use Chrome, Firefox, or Edge.';
          break;
        default:
          errorMessage += `Please check your permissions and try again.\n\nError: ${error.message}`;
      }
      setError(errorMessage);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    // Restart camera with new facing mode
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    startCamera();
  };

  const capturePhoto = () => {
    if (!stream) return;

    const videoElement = document.querySelector('video');
    if (!videoElement) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera_photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setNewReelFile(file);
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  };

  const startRecording = async () => {
    if (!stream) return;

    try {
      // Pick a supported mimeType
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const chunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'video/webm' });
        const ext = (mediaRecorder.mimeType || 'video/webm').includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `camera_recording_${Date.now()}.${ext}`, { type: blob.type });
        setNewReelFile(file);
        setIsRecording(false);
        stopCamera();
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Auto-stop after 60 seconds as safety
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 60000);

      window.currentMediaRecorder = mediaRecorder;
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to start recording. Please try again.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (window.currentMediaRecorder && window.currentMediaRecorder.state === 'recording') {
      window.currentMediaRecorder.stop();
    }
  };

  const handleCreateAndSubmit = async () => {
    if (!api.hasToken()) {
      setError('Please log in to submit a campaign entry.');
      return;
    }
    if (!newReelFile) {
      setError('Please select a file to upload');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      
      // Create new reel
      const formData = new FormData();
      formData.append('media', newReelFile);
      formData.append('caption', newReelCaption || 'Campaign Entry');
      if (!uploadIdRef.current) uploadIdRef.current = newUploadId();
      formData.append('client_upload_id', uploadIdRef.current);

      const newReel = await api.request('/reels/', {
        method: 'POST',
        body: formData,
        isFormData: true
      });
      
      // Submit to campaign
      await api.request(`/campaigns/${campaignId}/enter/`, {
        method: 'POST',
        body: JSON.stringify({ reel_id: newReel.id })
      });
      
      console.log('Entry submitted successfully!');
      uploadIdRef.current = null;
      // Its processing shows in the corner like any other upload.
      uploadTracker.track(newReel);
      onSuccess();
    } catch (error) {
      console.error('Error submitting entry:', error);
      // error.message is the raw response body; the API's own sentence (a
      // file it cannot use, a subscription needed for video) is in data.
      setError(
        error?.data?.error || error?.data?.message || 'We could not submit your entry. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    return handleCreateAndSubmit();
  };

  return (
    <div
      className="fs-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-entry-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'flex',
        // flex-start, not center: a card taller than the viewport that is
        // centred has its top cut off with no way to scroll back up to it --
        // on a phone that is the requirements and the header.
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 9999,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box',
        padding:
          'max(16px, env(safe-area-inset-top, 0px)) ' +
          'max(12px, env(safe-area-inset-right, 0px)) ' +
          'calc(24px + env(safe-area-inset-bottom, 0px)) ' +
          'max(12px, env(safe-area-inset-left, 0px))',
      }}
      onClick={onClose}
    >
      <div
        className="fs-modal-card"
        style={{
          background: surfaceOf(T),
          borderRadius: RADIUS.xl,
          padding: 'clamp(18px, 5vw, 28px)',
          width: '100%',
          maxWidth: 600,
          margin: 'auto',
          boxSizing: 'border-box',
          border: `1px solid ${T.border}`,
          boxShadow: '0 24px 70px -20px rgba(0,0,0,0.75)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <span
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: RADIUS.md,
              display: 'grid',
              placeItems: 'center',
              background: `linear-gradient(135deg, ${accentOf(T)}, ${accentOf(T)}aa)`,
              boxShadow: `0 8px 20px -10px ${accentOf(T)}`,
            }}
          >
            <Trophy size={21} color="#07130a" strokeWidth={2.5} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2
              id="submit-entry-title"
              style={{
                margin: 0,
                fontSize: 'clamp(19px, 5vw, 23px)',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                color: T.txt,
              }}
            >
              Submit Your Entry
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: T.sub }}>
              Show your best work and compete for the prize.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="fs-press fs-focus"
            style={{
              width: TAP,
              height: TAP,
              flexShrink: 0,
              marginTop: -6,
              marginRight: -6,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: RADIUS.sm,
              color: T.sub,
              cursor: 'pointer',
            }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {error && (
          <div style={{
            padding: 12,
            background: 'rgba(239,68,68,0.15)',
            border: `1px solid #EF4444`,
            borderRadius: 8,
            color: '#EF4444',
            fontSize: 14,
            marginBottom: 20,
          }}>
            <div style={{ marginBottom: 8 }}>{error}</div>
            <button
              type="button"
              onClick={() => {
                setError('');
                startCamera();
              }}
              style={{
                padding: '8px 16px',
                background: '#EF4444',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry Camera Access
            </button>
          </div>
        )}

        <div>
            {/* Campaign Requirements */}
            {campaign && (
              <div style={{
                padding: 16,
                background: T.bg,
                borderRadius: RADIUS.lg,
                border: `1px solid ${T.border}`,
                marginBottom: 18,
              }}>
                <h4 style={{
                  margin: '0 0 12px',
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 11, fontWeight: 800,
                  letterSpacing: '0.8px', textTransform: 'uppercase',
                  color: T.sub,
                }}>
                  <FileText size={13} color={accentOf(T)} strokeWidth={2.6} aria-hidden="true" />
                  Campaign Requirements
                </h4>

                {/* Each requirement is a labelled row rather than a run of
                    bold-prefixed sentences, so the hashtags -- the thing
                    people come here to copy -- are findable at a glance. */}
                <dl style={{ margin: 0, display: 'grid', gap: 12 }}>
                  {campaign.required_hashtags && (
                    <div>
                      <dt style={{ ...labelStyle(T), marginBottom: 7, fontSize: 11.5 }}>
                        Required hashtags
                      </dt>
                      <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {String(campaign.required_hashtags)
                          .split(/[\s,]+/)
                          .filter(Boolean)
                          .map((tag) => (
                            <span
                              key={tag}
                              style={{
                                padding: '4px 10px',
                                borderRadius: RADIUS.pill,
                                background: `${accentOf(T)}1f`,
                                border: `1px solid ${accentOf(T)}44`,
                                color: accentOf(T),
                                fontSize: 12,
                                fontWeight: 700,
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                      </dd>
                    </div>
                  )}

                  {campaign.min_followers > 0 && (
                    <div>
                      <dt style={{ ...labelStyle(T), marginBottom: 2, fontSize: 11.5 }}>Minimum followers</dt>
                      <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.txt }}>
                        {campaign.min_followers}
                      </dd>
                    </div>
                  )}

                  {campaign.min_level > 0 && (() => {
                    const short = Math.max(0, campaign.min_level - userLevel);
                    const met = short === 0;
                    return (
                      <div>
                        <dt style={{ ...labelStyle(T), marginBottom: 2, fontSize: 11.5 }}>Minimum level</dt>
                        <dd style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: T.txt }}>
                            Level {campaign.min_level}
                          </span>
                          {/* The icon carries the meaning as well as the
                              colour, so this still reads for anyone who
                              cannot tell the two greens apart. */}
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 9px', borderRadius: RADIUS.pill,
                            background: met ? `${SUCCESS}1f` : `${T.sub}22`,
                            color: met ? SUCCESS : T.sub,
                            fontSize: 11, fontWeight: 700,
                          }}>
                            {met ? <Check size={11} strokeWidth={3} aria-hidden="true" />
                                 : <AlertCircle size={11} strokeWidth={2.6} aria-hidden="true" />}
                            {met
                              ? `You are level ${userLevel}`
                              : `You are level ${userLevel} — ${short} to go`}
                          </span>
                        </dd>
                      </div>
                    );
                  })()}

                  {campaign.min_votes_per_reel > 0 && (
                    <div>
                      <dt style={{ ...labelStyle(T), marginBottom: 2, fontSize: 11.5 }}>Minimum votes</dt>
                      <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.txt }}>
                        {campaign.min_votes_per_reel}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
            
            {/* Two equal media actions. Balanced on purpose -- neither is
                the "real" one, and a phone user is as likely to want either. */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
              marginBottom: 18,
            }}>
              {[
                { mode: 'video', Icon: Video, title: 'Record', hint: 'Use your camera' },
                { mode: 'photo', Icon: Camera, title: 'Photo', hint: 'Take a picture' },
              ].map(({ mode, Icon, title, hint }) => (
                <button
                  key={mode}
                  type="button"
                  className="fs-press fs-focus"
                  onClick={() => {
                    setCameraMode(mode);
                    startCamera(mode);
                  }}
                  style={{
                    minHeight: 76,
                    padding: '12px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    background: T.bg,
                    border: `1.5px solid ${T.border}`,
                    borderRadius: RADIUS.lg,
                    color: T.txt,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    minWidth: 0,
                  }}
                >
                  <Icon size={20} color={accentOf(T)} strokeWidth={2.3} aria-hidden="true" />
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</span>
                  <span style={{ fontSize: 10.5, color: T.sub, fontWeight: 600 }}>{hint}</span>
                </button>
              ))}
            </div>
            
            {/* Camera or File Upload Area */}
            <div
              role={showCamera ? undefined : 'button'}
              tabIndex={showCamera ? undefined : 0}
              aria-label={
                newReelFile
                  ? `Selected file ${newReelFile.name}. Activate to choose a different one.`
                  : 'Upload a photo or video'
              }
              onClick={() => !showCamera && document.getElementById('campaign-file-upload').click()}
              onKeyDown={(e) => {
                if (showCamera) return;
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                  e.preventDefault();
                  document.getElementById('campaign-file-upload').click();
                }
              }}
              className={showCamera ? undefined : 'fs-focus'}
              style={{
                marginBottom: 18,
                padding: newReelFile && !showCamera ? 14 : 24,
                // `T.card` is not a theme key -- it resolved to undefined, so
                // this zone had no background and read as a hole in the card.
                background: newReelFile ? `${accentOf(T)}12` : T.bg,
                border: `2px dashed ${newReelFile ? `${accentOf(T)}70` : T.border}`,
                borderRadius: RADIUS.lg,
                textAlign: 'center',
                position: 'relative',
                minHeight: showCamera ? 200 : 180,
                color: accentOf(T),
                transition: 'background 0.2s ease, border-color 0.2s ease',
                cursor: !showCamera ? 'pointer' : 'default',
                boxSizing: 'border-box',
              }}
            >
              {showCamera && stream ? (
                <div style={{ position: 'relative', width: '100%' }}>
                  <video
                    ref={(videoEl) => {
                      if (videoEl && stream && videoEl.srcObject !== stream) {
                        videoEl.srcObject = stream;
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      height: 300,
                      objectFit: 'contain',
                      background: '#000',
                    }}
                  />
                  {/* Camera Switch Button */}
                  <button
                    type="button"
                    onClick={switchCamera}
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      background: 'rgba(0,0,0,0.6)',
                      border: 'none',
                      borderRadius: 20,
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      color: '#fff',
                    }}
                  >
                    <RotateCw size={16} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Flip</span>
                  </button>
                  {isRecording && (
                    <div style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      background: 'rgba(239,68,68,0.95)',
                      color: '#fff',
                      padding: '6px 10px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                      REC
                    </div>
                  )}
                  <div style={{
                    display: 'flex',
                    gap: 10,
                    marginTop: 12,
                    justifyContent: 'center',
                  }}>
                    {cameraMode === 'video' ? (
                      !isRecording ? (
                        <>
                          <button
                            type="button"
                            onClick={startRecording}
                            style={{
                              padding: '10px 18px',
                              background: '#EF4444',
                              border: 'none',
                              borderRadius: 8,
                              color: '#fff',
                              fontSize: 14,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                            Start Recording
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            style={{
                              padding: '10px 18px',
                              background: 'transparent',
                              border: `2px solid ${T.border}`,
                              borderRadius: 8,
                              color: T.txt,
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={stopRecording}
                          style={{
                            padding: '10px 18px',
                            background: '#1F2937',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span style={{ width: 10, height: 10, background: '#fff', display: 'inline-block' }} />
                        Stop Recording
                      </button>
                      )
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={capturePhoto}
                          style={{
                            padding: '10px 18px',
                            background: '#8fc441',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Camera size={16} />
                          Capture Photo
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          style={{
                            padding: '10px 18px',
                            background: 'transparent',
                            border: `2px solid ${T.border}`,
                            borderRadius: 8,
                            color: T.txt,
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : newReelFile ? (
                /* The chosen file, with a real preview. It was a tick and a
                   filename, which does not tell you whether the right clip
                   was picked -- the commonest thing to get wrong here. */
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                  <div
                    style={{
                      width: 76,
                      height: 76,
                      flexShrink: 0,
                      borderRadius: RADIUS.md,
                      overflow: 'hidden',
                      background: '#000',
                      display: 'grid',
                      placeItems: 'center',
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    {newReelFile.type?.startsWith('video') ? (
                      <video
                        src={previewUrl}
                        muted
                        playsInline
                        preload="metadata"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <img
                        src={previewUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      marginBottom: 4, padding: '2px 8px', borderRadius: RADIUS.pill,
                      background: `${SUCCESS}1f`, color: SUCCESS,
                      fontSize: 10.5, fontWeight: 800,
                      letterSpacing: '0.4px', textTransform: 'uppercase',
                    }}>
                      <Check size={11} strokeWidth={3} aria-hidden="true" />
                      Ready
                    </div>
                    <p style={{
                      margin: 0, fontSize: 13.5, fontWeight: 700, color: T.txt,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {newReelFile.name}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: T.sub }}>
                      {formatBytes(newReelFile.size)}
                      {newReelFile.type ? ` · ${newReelFile.type.split('/')[1]?.toUpperCase()}` : ''}
                      {' · Tap to change'}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="fs-press fs-focus"
                    aria-label="Remove selected file"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewReelFile(null);
                    }}
                    style={{
                      width: TAP, height: TAP, flexShrink: 0,
                      display: 'grid', placeItems: 'center',
                      background: 'transparent',
                      border: `1px solid ${T.border}`,
                      borderRadius: RADIUS.md,
                      color: T.sub,
                      cursor: 'pointer',
                    }}
                  >
                    <X size={17} strokeWidth={2.5} />
                  </button>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  minHeight: 132,
                }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 52, height: 52, marginBottom: 6,
                      borderRadius: '50%', display: 'grid', placeItems: 'center',
                      background: `${accentOf(T)}1a`,
                      border: `1px solid ${accentOf(T)}3a`,
                    }}
                  >
                    <Upload size={23} color={accentOf(T)} strokeWidth={2.2} />
                  </span>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.txt }}>
                    Upload your entry
                  </p>
                  <p style={{ margin: 0, fontSize: 12.5, color: T.sub }}>
                    Tap to choose a photo or video
                  </p>
                  <p style={{
                    margin: '6px 0 0', fontSize: 11, fontWeight: 600,
                    letterSpacing: '0.4px', color: T.sub, opacity: 0.85,
                  }}>
                    MP4 · MOV · JPG · PNG — up to 100MB
                  </p>
                </div>
              )}
              <input
                id="campaign-file-upload"
                type="file"
                accept="image/*,video/*"
                capture="environment"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
            
            <div style={{ marginBottom: 4 }}>
              <label htmlFor="entry-caption" style={labelStyle(T)}>
                Caption{' '}
                <span style={{ fontWeight: 600, opacity: 0.8 }}>
                  {campaign?.required_hashtags ? '— include the required hashtags' : '(optional)'}
                </span>
              </label>
              <textarea
                id="entry-caption"
                value={newReelCaption}
                onChange={(e) => setNewReelCaption(e.target.value)}
                placeholder={
                  campaign?.required_hashtags
                    ? `Say something, then add ${campaign.required_hashtags}`
                    : 'Add a caption for your entry...'
                }
                rows={3}
                style={{
                  ...fieldStyle(T),
                  minHeight: 88,
                  resize: 'vertical',
                  caretColor: T.txt,
                }}
              />

              {/* One-tap insert, because the previous "copy and paste" tip
                  asked people to do by hand the one thing that invalidates an
                  entry when they get it wrong. Appends only what is missing,
                  and never replaces what they have written. */}
              {campaign?.required_hashtags && (
                <button
                  type="button"
                  className="fs-press fs-focus"
                  onClick={() => {
                    const required = String(campaign.required_hashtags)
                      .split(/[\s,]+/)
                      .filter(Boolean);
                    const missing = required.filter(
                      (tag) => !newReelCaption.toLowerCase().includes(tag.toLowerCase())
                    );
                    if (!missing.length) return;
                    setNewReelCaption(
                      `${newReelCaption.trimEnd()}${newReelCaption.trim() ? ' ' : ''}${missing.join(' ')}`
                    );
                  }}
                  style={{
                    marginTop: 8,
                    minHeight: 36,
                    padding: '0 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: `${accentOf(T)}14`,
                    border: `1px solid ${accentOf(T)}3a`,
                    borderRadius: RADIUS.pill,
                    color: accentOf(T),
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <Zap size={12} strokeWidth={2.6} aria-hidden="true" />
                  Add required hashtags
                </button>
              )}
            </div>
          </div>

        <div style={{
          display: 'flex',
          gap: 10,
          marginTop: 20,
          paddingTop: 18,
          borderTop: `1px solid ${T.border}`,
        }}>
          <button
            type="button"
            onClick={onClose}
            className="fs-press fs-focus"
            style={{ ...btn(T, 'ghost'), flex: '0 0 auto', width: 'auto', minWidth: 104 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!newReelFile || submitting}
            className="fs-press fs-focus"
            style={{ ...btn(T, 'primary', { disabled: !newReelFile || submitting }), flex: 1 }}
          >
            {submitting ? (
              <>
                <RotateCw size={15} strokeWidth={2.6} className="fs-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              <>
                Submit Entry
                {newReelFile && (
                  <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>→</span>
                )}
              </>
            )}
          </button>
        </div>

        {/* Says what is still missing instead of leaving a grey button with
            no reason, which is the commonest way to be stuck on this screen. */}
        {!submitting && !newReelFile && (
          <p
            role="status"
            style={{
              margin: '10px 0 0',
              textAlign: 'center',
              fontSize: 12,
              color: T.sub,
            }}
          >
            Choose a photo or video to enable Submit.
          </p>
        )}
      </div>
    </div>
  );
}



