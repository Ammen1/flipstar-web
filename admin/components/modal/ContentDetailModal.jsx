import { useState, useEffect } from 'react';
import {
  ArrowLeft, CheckCircle, XCircle, Image as ImageIcon,
  Heart, MessageCircle, Bookmark, Eye, Share2, Clock, Hash,
  RefreshCw, User, Users, FileText, AlertTriangle, Star, Coins,
  Calendar, Mail, Shield, TrendingUp, Flag
} from 'lucide-react';
import api from '../../../api';
import config from '../../../config';
import { usePermission } from '../../hooks/usePermission';
import { AlertModal } from './AlertModal';

const PRIORITY_COLOR = { low: '#10B981', medium: '#F59E0B', high: '#EF4444', critical: '#7C3AED' };
const STATUS_COLOR   = { pending: '#F59E0B', reviewing: '#3B82F6', resolved: '#10B981', dismissed: '#6B7280' };

export function ContentDetailModal({ isOpen, onClose, reelId, theme, onModerated }) {
  const { canModerate } = usePermission();
  const [reel, setReel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moderating, setModerating] = useState(null);
  const [error, setError] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    if (isOpen && reelId) { loadReelDetail(); }
  }, [isOpen, reelId]);

  const loadReelDetail = async () => {
    try {
      setLoading(true); setError(null);
      const data = await api.request(`/admin/reels/${reelId}/`);
      setReel(data);
    } catch { setError('Failed to load content details'); }
    finally { setLoading(false); }
  };

  const handleModerate = async (action) => {
    if (typeof canModerate === 'function' && !canModerate('content')) {
      setAlertModal({
        isOpen: true,
        title: 'Permission Denied',
        message: 'You do not have permission to moderate content.',
        type: 'error',
      });
      return;
    }
    setModerating(action); setError(null);
    try {
      await api.request(`/admin/reels/${reelId}/moderate/`, {
        method: 'POST',
        body: JSON.stringify({ action }),
        headers: { 'Content-Type': 'application/json' },
      });
      setAlertModal({
        isOpen: true,
        title: action === 'approve' ? 'Content Approved' : 'Content Removed',
        message: action === 'approve'
          ? 'This content is now visible to all users.'
          : 'This content has been hidden from all users.',
        type: 'success',
      });
      await loadReelDetail();
      if (typeof onModerated === 'function') onModerated();
    } catch {
      setAlertModal({
        isOpen: true,
        title: 'Action Failed',
        message: `Failed to ${action} content. Please try again.`,
        type: 'error',
      });
    } finally { setModerating(null); }
  };

  if (!isOpen) return null;

  const T = theme;
  const card = (extra = {}) => ({
    background: T.card, borderRadius: 16, border: `1px solid ${T.border}`, padding: 20, ...extra,
  });
  const sectionTitle = (txt, Icon, color) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      {Icon && <Icon size={16} color={color || T.sub} />}
      <span style={{ fontSize: 13, fontWeight: 700, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{txt}</span>
    </div>
  );

  const isVideo  = !!reel?.media;
  const isHidden = reel?.is_hidden;

  return (
    <div style={{ maxWidth: 1400 }}>

      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <button onClick={onClose} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 18px', borderRadius: 10,
          background: T.bg, border: `1px solid ${T.border}`,
          color: T.txt, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          <ArrowLeft size={16} /> Back to List
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: T.txt }}>Content Detail</h1>
          <p style={{ margin: 0, fontSize: 13, color: T.sub }}>Full review of post #{reelId}</p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12, color: T.sub, fontSize: 15 }}>
          <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading content…
        </div>
      ) : error && !reel ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12 }}>
          <XCircle size={40} color={T.red} />
          <div style={{ color: T.red }}>{error}</div>
          <button onClick={loadReelDetail} style={{ padding: '10px 20px', borderRadius: 8, background: T.pri, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
        </div>
      ) : reel ? (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, alignItems: 'start' }}>

          {/* ══ LEFT COLUMN: Media ══════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Media Preview */}
            <div style={{ ...card({ padding: 0 }), overflow: 'hidden' }}>
              <div style={{ width: '100%', aspectRatio: '9/16', background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isVideo ? (
                  <video src={reel.media} controls muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : reel.image ? (
                  <img src={reel.image} alt="Content" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ color: T.sub, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <ImageIcon size={48} /><span style={{ fontSize: 13 }}>No media</span>
                  </div>
                )}
                <div style={{
                  position: 'absolute', top: 12, left: 12,
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: isHidden ? 'rgba(239,68,68,0.85)' : 'rgba(16,185,129,0.85)',
                  color: '#fff', display: 'flex', alignItems: 'center', gap: 5, backdropFilter: 'blur(4px)',
                }}>
                  {isHidden ? <XCircle size={13} /> : <CheckCircle size={13} />}
                  {isHidden ? 'Hidden' : 'Visible'}
                </div>
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                  background: 'rgba(0,0,0,0.6)', color: '#fff', backdropFilter: 'blur(4px)',
                }}>
                  {isVideo ? '🎬 Video' : '🖼️ Photo'}
                </div>
              </div>

              {/* Post Meta below media */}
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>Post ID: <strong style={{ color: T.txt }}>#{reel.id}</strong></div>
                <div style={{ fontSize: 11, color: T.sub, marginBottom: reel.duration ? 4 : 0 }}>
                  Posted: <strong style={{ color: T.txt }}>{new Date(reel.created_at).toLocaleString()}</strong>
                </div>
                {reel.duration && (
                  <div style={{ fontSize: 11, color: T.sub }}>Duration: <strong style={{ color: T.txt }}>{reel.duration.toFixed(1)}s</strong></div>
                )}
              </div>
            </div>

            {/* Approve / Remove Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={(e) => { e.preventDefault(); handleModerate('approve'); }} disabled={!!moderating || !isHidden} style={{
                flex: 1, padding: '14px', borderRadius: 12, border: 'none',
                background: isHidden ? T.green : T.bg,
                color: isHidden ? '#fff' : T.sub, fontSize: 14, fontWeight: 700,
                cursor: !!moderating || !isHidden ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: !isHidden ? 0.45 : 1, transition: 'all 0.2s',
                boxShadow: isHidden ? `0 4px 14px ${T.green}40` : 'none',
              }}>
                {moderating === 'approve' ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={16} />}
                Approve
              </button>
              <button onClick={(e) => { e.preventDefault(); handleModerate('remove'); }} disabled={!!moderating || isHidden} style={{
                flex: 1, padding: '14px', borderRadius: 12, border: 'none',
                background: !isHidden ? T.red : T.bg,
                color: !isHidden ? '#fff' : T.sub, fontSize: 14, fontWeight: 700,
                cursor: !!moderating || isHidden ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: isHidden ? 0.45 : 1, transition: 'all 0.2s',
                boxShadow: !isHidden ? `0 4px 14px ${T.red}40` : 'none',
              }}>
                {moderating === 'remove' ? <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={16} />}
                Remove
              </button>
            </div>

          </div>

          {/* ══ RIGHT COLUMN: Details ════════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Creator Card */}
            <div style={card()}>
              {sectionTitle('Creator', User, T.pri)}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                {reel.user.profile_photo ? (
                  <img src={reel.user.profile_photo.startsWith('http') ? reel.user.profile_photo : `${config.API_BASE_URL.replace('/api', '')}${reel.user.profile_photo}`} alt="avatar" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: T.pri + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.pri, fontSize: 24, fontWeight: 800, flexShrink: 0 }}>
                    {reel.user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: T.txt }}>@{reel.user.username}</span>
                    {reel.user.is_shadowbanned && <span style={{ padding: '2px 8px', borderRadius: 8, background: '#7C3AED20', color: '#7C3AED', fontSize: 11, fontWeight: 600 }}>Shadowbanned</span>}
                    {!reel.user.is_active && <span style={{ padding: '2px 8px', borderRadius: 8, background: T.red + '20', color: T.red, fontSize: 11, fontWeight: 600 }}>Inactive</span>}
                    {reel.user.is_active && <span style={{ padding: '2px 8px', borderRadius: 8, background: T.green + '20', color: T.green, fontSize: 11, fontWeight: 600 }}>Active</span>}
                  </div>
                  {(reel.user.first_name || reel.user.last_name) && (
                    <div style={{ fontSize: 14, color: T.sub, marginTop: 2 }}>{reel.user.first_name} {reel.user.last_name}</div>
                  )}
                  <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}><Mail size={11} style={{ marginRight: 4 }} />{reel.user.email}</div>
                  {reel.user.bio && <div style={{ fontSize: 13, color: T.txt, marginTop: 6, lineHeight: 1.5 }}>{reel.user.bio}</div>}
                  <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
                    {[
                      { val: reel.user.follower_count,  label: 'Followers' },
                      { val: reel.user.following_count, label: 'Following' },
                      { val: reel.user.post_count,      label: 'Posts' },
                      { val: `Lv.${reel.user.level}`,  label: 'Level' },
                      { val: reel.user.coins,           label: 'Coins' },
                    ].map(({ val, label }) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.txt }}>{val ?? 0}</div>
                        <div style={{ fontSize: 10, color: T.sub }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: T.sub, marginTop: 8, display: 'flex', gap: 16 }}>
                    <span><Calendar size={10} style={{ marginRight: 3 }} />Joined {new Date(reel.user.date_joined).toLocaleDateString()}</span>
                    {reel.user.last_login && <span>Last login {new Date(reel.user.last_login).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Caption, Hashtags & Overlay */}
            {(reel.caption || reel.hashtags || reel.overlay_text) && (
              <div style={card()}>
                {sectionTitle('Post Content', FileText)}
                {reel.caption && (
                  <div style={{ fontSize: 14, color: T.txt, lineHeight: 1.7, marginBottom: 12 }}>{reel.caption}</div>
                )}
                {reel.overlay_text && (
                  <div style={{ fontSize: 13, color: T.sub, fontStyle: 'italic', marginBottom: 12, padding: '8px 12px', background: T.bg, borderRadius: 8 }}>
                    🔤 Overlay: <em>"{reel.overlay_text}"</em>
                  </div>
                )}
                {reel.hashtags && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {reel.hashtags.split(',').filter(t => t.trim()).map((tag, idx) => (
                      <span key={idx} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 12, background: T.bg, border: `1px solid ${T.border}`, color: T.sub, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Hash size={11} />{tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Engagement Stats */}
            <div style={card()}>
              {sectionTitle('Engagement Stats', TrendingUp, T.green)}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { icon: <Heart size={16} color={T.red} />,                     val: reel.votes,         label: 'Votes' },
                  { icon: <Eye size={16} color={T.purple} />,                     val: reel.view_count,    label: 'Views' },
                  { icon: <MessageCircle size={16} color={T.blue} />,             val: reel.comment_count, label: 'Comments' },
                  { icon: <Bookmark size={16} color={T.orange || '#8fc441'} />,   val: reel.save_count,    label: 'Saves' },
                  { icon: <Share2 size={16} color={T.green} />,                   val: reel.shares,        label: 'Shares' },
                  { icon: <Flag size={16} color={T.red} />,                       val: reel.report_count,  label: 'Reports' },
                ].map(({ icon, val, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: T.bg, borderRadius: 10 }}>
                    {icon}
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: T.txt }}>{val ?? 0}</div>
                      <div style={{ fontSize: 11, color: T.sub }}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tags / Campaign / Category */}
            {(reel.category || reel.campaign || reel.is_boosted) && (
              <div style={card()}>
                {sectionTitle('Tags & Campaign', Star)}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {reel.category && <span style={{ padding: '6px 14px', borderRadius: 20, background: T.bg, border: `1px solid ${T.border}`, fontSize: 13, color: T.txt }}>📂 {reel.category}</span>}
                  {reel.campaign && <span style={{ padding: '6px 14px', borderRadius: 20, background: T.bg, border: `1px solid ${T.border}`, fontSize: 13, color: T.txt }}>🏆 {reel.campaign.name}</span>}
                  {reel.is_boosted && <span style={{ padding: '6px 14px', borderRadius: 20, background: (T.orange || '#8fc441') + '20', border: `1px solid ${T.orange || '#8fc441'}`, fontSize: 13, color: T.orange || '#8fc441', fontWeight: 600 }}>⚡ Boosted</span>}
                </div>
              </div>
            )}

            {/* Reports */}
            <div style={card()}>
              {sectionTitle(`Reports (${reel.reports?.length ?? 0})`, AlertTriangle, T.red)}
              {(!reel.reports || reel.reports.length === 0) ? (
                <div style={{ color: T.sub, fontSize: 13, fontStyle: 'italic' }}>No reports filed against this post.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {reel.reports.map(r => (
                    <div key={r.id} style={{ padding: '12px 14px', background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: (PRIORITY_COLOR[r.priority] || T.sub) + '25', color: PRIORITY_COLOR[r.priority] || T.sub }}>{r.priority}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: (STATUS_COLOR[r.status] || T.sub) + '20', color: STATUS_COLOR[r.status] || T.sub }}>{r.status}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, background: T.border, color: T.txt }}>{r.report_type.replace(/_/g, ' ')}</span>
                        </div>
                        <span style={{ fontSize: 11, color: T.sub }}>{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      {r.description && <div style={{ fontSize: 13, color: T.txt, lineHeight: 1.5, marginBottom: 4 }}>{r.description}</div>}
                      <div style={{ fontSize: 11, color: T.sub }}>Reported by @{r.reported_by}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <div style={card()}>
              {sectionTitle(`Recent Comments (${reel.comment_count ?? 0} total)`, MessageCircle, T.blue)}
              {(!reel.comments || reel.comments.length === 0) ? (
                <div style={{ color: T.sub, fontSize: 13, fontStyle: 'italic' }}>No comments on this post.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reel.comments.map(c => (
                    <div key={c.id} style={{ padding: '10px 14px', background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.txt }}>@{c.user}</span>
                        <span style={{ fontSize: 11, color: T.sub }}>{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize: 13, color: T.sub, lineHeight: 1.5 }}>{c.text}</div>
                    </div>
                  ))}
                  {reel.comment_count > reel.comments.length && (
                    <div style={{ fontSize: 12, color: T.sub, textAlign: 'center', paddingTop: 4 }}>
                      Showing {reel.comments.length} of {reel.comment_count} comments
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      ) : null}

      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        showCancel={false}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
