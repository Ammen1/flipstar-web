import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Heart, Trophy, MessageCircle, Share2, Bookmark, MoreHorizontal, Eye, CheckCircle, Play, X, Send, Info, Link2, Download, Flag, Trash2, User, Gift, AtSign, Search, Zap } from 'lucide-react';
import api from '../../api';
import config from '../../config';
import { useTheme } from '../../contexts/ThemeContext';
import { useBlock } from '../../contexts/BlockContext';
import realtimeService from '../../services/RealtimeService';
import GiftPage from '../gift/GiftPage';
import { HorizontalUserSuggestions } from '../../components/profile/HorizontalUserSuggestions';
import { UserSuggestions } from '../../components/profile/UserSuggestions';
import { SidebarCampaigns } from '../../components/campaign/SidebarCampaigns';
import { HorizontalCampaignSuggestions } from '../../components/campaign/HorizontalCampaignSuggestions';
import { SearchBar } from '../../components/common/SearchBar';
import { BoostModal } from '../../components/subscription/BoostModal';
import { InsufficientCoinsModal } from '../../components/common/InsufficientCoinsModal';
import { PostCaptionOverlay, captionOf } from '../../components/feed/PostCaptionOverlay';
import { DesktopReelViewer } from '../../components/feed/DesktopReelViewer';
import { dedupeById } from '../../utils/collections';
import { likeCountOf, commentCountOf, shareCountOf } from '../../utils/engagement';
import { ModernCommentSection } from '../../components/messaging/ModernCommentSection';
import { isVideoUrl, isVideoPost } from '../../utils/media';

const BACKEND = config.API_BASE_URL.replace('/api', '');

function mediaUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return BACKEND + url;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Cache helpers for HomePage
const CACHE_KEY = 'homepage_feed_cache';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache for better persistence

function readHomeCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function writeHomeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

// ── Local like/save state ──────────────────────────────────────────────────
// The feed is cached for 30 min, so when the user likes a post and then
// comes back, the server-side `is_liked` on the cached payload is stale and
// the heart appears un-filled again.  We fix this by mirroring like/save
// toggles in localStorage and merging them on top of cached posts.
const LIKES_KEY = 'liked_post_ids';
const SAVES_KEY = 'saved_post_ids';
function readIdSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
function writeIdSet(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}
function toggleIdInSet(key, id, on) {
  const s = readIdSet(key);
  if (on) s.add(id); else s.delete(id);
  writeIdSet(key, s);
}
function mergeLocalEngagement(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return posts;
  const liked = readIdSet(LIKES_KEY);
  const saved = readIdSet(SAVES_KEY);
  if (liked.size === 0 && saved.size === 0) return posts;
  return posts.map(p => {
    const wasLikedLocal = liked.has(p.id);
    const wasSavedLocal = saved.has(p.id);
    // Only fill in if local says "liked" — we don't want to un-like a post
    // the server knows we liked on another device.
    return {
      ...p,
      is_liked: p.is_liked || wasLikedLocal,
      is_saved: p.is_saved || wasSavedLocal,
    };
  });
}

function buildCommentTree(flatList) {
  if (!Array.isArray(flatList)) return [];
  const map = {};
  const roots = [];
  
  // First pass: Create map and ensure replies array
  flatList.forEach(c => {
    map[c.id] = { ...c };
    if (!map[c.id].replies) map[c.id].replies = [];
  });
  
  // Second pass: Link children to parents
  // Second pass: Link children to parents
  flatList.forEach(c => {
    const node = map[c.id];
    // Handle parent as ID or object with string-safe comparison
    const parentVal = c.parent_id || c.parent;
    const parentId = (parentVal && typeof parentVal === 'object') ? parentVal.id : parentVal;
    
    if (parentId && String(parentId) !== '0') {
      const parent = map[parentId];
      if (parent) {
        if (!parent.replies.some(r => String(r.id) === String(node.id))) {
          parent.replies.push(node);
        }
      } else {
        // Orphaned child? Push to roots so it's at least visible
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });
  return roots;
}

/* ── Comment Sheet ── */
const CommentItem = memo(function CommentItem({ comment, T, depth = 0, timeAgo, api, onLike, onReply, expandedReplies, onToggleReplies }) {
  const isReply = depth > 0;
  const avatarSize = isReply ? 28 : 34;
  const hasReplies = comment.replies && comment.replies.length > 0;
  const isExpanded = expandedReplies?.has(comment.id);
  const showRepliesToggle = !isReply && hasReplies;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ 
          width: avatarSize, height: avatarSize, borderRadius: '50%', 
          background: (T?.pri || '#000') + '30', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden'
        }}>
          {comment.user?.profile_photo ? (
            <img src={mediaUrl(comment.user.profile_photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : '👤'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: isReply ? 12 : 13, color: '#8fc441' }}>{comment.user?.username}</span>
            <span style={{ fontSize: isReply ? 12 : 13, color: '#fff', wordBreak: 'break-word', lineHeight: 1.4 }}>
              {comment.text}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: '#8fc441' }}>{timeAgo(comment.created_at)}</span>
            {api.hasToken() && (
              <>
                <button
                  onClick={() => onLike(comment, isReply)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Heart size={14} fill={comment.is_liked ? '#E2B355' : 'none'} color={comment.is_liked ? '#E2B355' : (T?.sub || '#999')} />
                  {comment.likes > 0 && <span style={{ fontSize: 10, color: T?.sub || '#666' }}>{comment.likes === 0 ? 1 : comment.likes}</span>}
                </button>
                <button
                  onClick={() => onReply(comment)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T?.sub || '#666', fontSize: 11, fontWeight: 600 }}
                >
                  Reply
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* View replies toggle — only at top level */}
      {showRepliesToggle && (
        <button
          onClick={() => onToggleReplies(comment.id)}
          style={{
            alignSelf: 'flex-start',
            marginLeft: 44,
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '2px 0',
            color: T?.sub || '#888', fontSize: 11, fontWeight: 600,
          }}
        >
          <span style={{ display: 'inline-block', width: 24, height: 1, background: T?.sub || '#888', opacity: 0.5 }} />
          {isExpanded
            ? `Hide ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`
            : `View ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`}
        </button>
      )}

      {/* Recursive Replies — with tree line */}
      {hasReplies && (isReply || isExpanded) && (
        <div style={{
          marginLeft: depth === 0 ? 18 : 12,
          paddingLeft: depth === 0 ? 26 : 18,
          borderLeft: `2px solid ${T?.border || 'rgba(249,224,139,0.2)'}`,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {comment.replies.map(r => (
            <CommentItem 
              key={r.id} 
              comment={r} 
              T={T} 
              depth={depth + 1} 
              timeAgo={timeAgo} 
              api={api} 
              onLike={onLike} 
              onReply={onReply}
              expandedReplies={expandedReplies}
              onToggleReplies={onToggleReplies}
            />
          ))}
        </div>
      )}
    </div>
  );
});

const CommentSheet = memo(function CommentSheet({ post, currentUser, onClose, onCommentAdded, T, onShowCoinPurchase }) {
  const [comments, setComments] = useState(() => 
    buildCommentTree(post.recent_comments || [])
  );
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState(() => new Set());
  const [showInsufficientCoinsModal, setShowInsufficientCoinsModal] = useState(false);
  const inputRef = useRef(null);

  const toggleReplies = (commentId) => {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const findRootId = (list, targetId) => {
    for (const c of list) {
      if (String(c.id) === String(targetId)) return c.id;
      if (c.replies?.length) {
        const found = findRootId(c.replies, targetId);
        if (found !== null) return c.id;
      }
    }
    return null;
  };
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [reelUsername, setReelUsername] = useState(post.user?.username || '');

  // Mention autocomplete
  useEffect(() => {
    const match = text.match(/@(\w*)$/);
    if (match) {
      const query = match[1];
      setMentionQuery(query);
      setShowMentionSuggestions(true);
      if (query.length >= 2) {
        api.search(query).then(d => {
          setMentionSuggestions(d?.users?.slice(0, 5) || []);
        }).catch(() => setMentionSuggestions([]));
      } else {
        setMentionSuggestions([]);
      }
    } else {
      setShowMentionSuggestions(false);
      setMentionQuery('');
      setMentionSuggestions([]);
    }
  }, [text]);

  useEffect(() => {
    let cancelled = false;
    // If we have no recent comments, show loading immediately
    if (!post.recent_comments || post.recent_comments.length === 0) {
      setLoading(true);
    }
    
    // Fetch comments directly from the reel's endpoint
    api.request(`/reels/${post.id}/comments/?include_replies=true&depth=2`)
      .then(d => {
        if (cancelled) return;
        const full = Array.isArray(d) ? d : (d?.results || []);
        setComments(buildCommentTree(full));
      })
      .catch((err) => {
        console.error('[CommentSheet] fetch failed:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // Only re-fetch when the underlying post changes — NOT when parent passes a new
    // `recent_comments` reference (which would clobber locally-added replies).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    if (!api.hasToken()) return;
    const draft = text.trim();
    
    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const temp = {
      id: tempId,
      text: draft,
      user: currentUser || { username: 'you', profile_photo: null },
      created_at: new Date().toISOString(),
      likes: 0,
      likes_count: 0,
      is_liked: false,
      replies: [],
      pending: true,
    };

    const updateDeep = (list) => list.map(c => {
      if (replyingTo && String(c.id) === String(replyingTo.id)) {
        return { ...c, replies: [...(c.replies || []), temp] };
      }
      if (c.replies && c.replies.length) {
        return { ...c, replies: updateDeep(c.replies) };
      }
      return c;
    });

    if (replyingTo) {
      setComments(prev => updateDeep(prev));
      // Auto-expand the top-level ancestor so the new reply is visible
      setComments(current => {
        const rootId = findRootId(current, replyingTo.id);
        if (rootId != null) {
          setExpandedReplies(p => {
            const next = new Set(p);
            next.add(rootId);
            return next;
          });
        }
        return current;
      });
    } else {
      setComments(prev => [temp, ...prev]); // New top-level comments at top
    }
    
    setText('');
    const replyTarget = replyingTo;
    setReplyingTo(null);
    setSending(true);
    onCommentAdded?.();

    try {
      let res;
      if (replyTarget) {
        // Use dedicated reply endpoint
        res = await api.replyToComment(replyTarget.id, draft);
      } else {
        // Use dedicated post comment endpoint
        res = await api.postComment(post.id, draft);
      }

      // Ensure response has replies array for mapping
      if (res && !res.replies) res.replies = [];

      // Swap temp for real server row
      const swapDeep = (list) => list.map(c => {
        if (String(c.id) === String(tempId)) return res;
        if (c.replies && c.replies.length) {
          return { ...c, replies: swapDeep(c.replies) };
        }
        return c;
      });
      setComments(prev => swapDeep(prev));
      // Note: we deliberately do NOT refetch here — the optimistic swap above
      // replaces the temp row with the real server row. Refetching would wipe
      // out locally-added replies from other comments while the tree rebuilds.
    } catch (err) {
      console.error('[Comment] post failed:', err);
      // Check for insufficient coins error
      const errorData = err.data || (typeof err.message === 'string' ? JSON.parse(err.message) : null);
      if (errorData?.error && errorData.error.toLowerCase().includes('insufficient')) {
        setShowInsufficientCoinsModal(true);
      }
      // Roll back
      const removeDeep = (list) => list.filter(c => c.id !== tempId).map(c => ({
        ...c,
        replies: c.replies ? removeDeep(c.replies) : []
      }));
      setComments(prev => removeDeep(prev));
      setText(draft);
    } finally { setSending(false); }
  };

  const handleLikeComment = async (comment, isReply = false) => {
    if (!api.hasToken()) return;
    // Don't allow liking comments with temporary IDs (not yet saved to database)
    if (String(comment.id).startsWith('temp-')) {
      console.warn('Cannot like comment with temporary ID:', comment.id);
      return;
    }
    // Optimistic like
    const updateLikesDeep = (list) => list.map(c => {
      if (String(c.id) === String(comment.id)) {
        const newIsLiked = !c.is_liked;
        const newLikes = (c.likes_count || c.likes || 0) + (newIsLiked ? 1 : -1);
        return { ...c, is_liked: newIsLiked, likes_count: newLikes, likes: newLikes };
      }
      if (c.replies && c.replies.length) {
        return { ...c, replies: updateLikesDeep(c.replies) };
      }
      return c;
    });
    setComments(prev => updateLikesDeep(prev));

    try {
      if (isReply) {
        await api.likeReply(comment.id);
      } else {
        await api.likeComment(comment.id);
      }
    } catch (err) {
      // Roll back on error (optional, but good for UX)
      setComments(prev => updateLikesDeep(prev));
    }
  };

  const handleReply = (comment) => {
    setReplyingTo(comment);
    inputRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleSelectMention = (username) => {
    const match = text.match(/@(\w*)$/);
    if (match) {
      const newText = text.replace(/@\w*$/, `@${username} `);
      setText(newText);
      setShowMentionSuggestions(false);
      setMentionQuery('');
      setMentionSuggestions([]);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: window.innerWidth <= 1024 ? 0 : 260, 
        right: 0, 
        bottom: window.innerWidth <= 1024 ? 68 : 0, 
        background: 'rgba(0,0,0,0.5)', 
        zIndex: 9500, 
        display: 'flex', 
        alignItems: 'flex-end' 
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: T?.cardBg || '#1A1A1A', borderRadius: '20px 20px 0 0', maxHeight: '75vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '1.5px solid rgba(226,179,85,0.3)' }}
      >
        {/* Handle bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: `1px solid ${T?.border || '#e0e0e0'}` }}>
          <span style={{ fontSize: 15, fontWeight: 700, background: 'linear-gradient(to right, #D4AF37, #8fc441)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Comments</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T?.sub || '#666' }}><X size={20} /></button>
        </div>
        {/* Comments list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading && comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: T?.sub || '#666' }}>
              <div className="loader-spin" style={{ width: 24, height: 24, border: `2px solid ${T?.pri || '#000'}`, borderTopColor: 'transparent', borderRadius: '50%', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13 }}>Loading comments...</div>
            </div>
          ) : comments.length === 0 ? (
            <div style={{ textAlign: 'center', color: T?.sub || '#666', padding: 30, fontSize: 14 }}>No comments yet. Be first!</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {comments.map(c => (
                <CommentItem 
                  key={c.id} 
                  comment={c} 
                  T={T} 
                  timeAgo={timeAgo} 
                  api={api} 
                  onLike={handleLikeComment} 
                  onReply={(cm) => {
                    handleReply(cm);
                    // Auto-expand the top-level ancestor so user sees existing replies
                    const rootId = findRootId(comments, cm.id);
                    if (rootId != null) {
                      setExpandedReplies(prev => {
                        const next = new Set(prev);
                        next.add(rootId);
                        return next;
                      });
                    }
                  }}
                  expandedReplies={expandedReplies}
                  onToggleReplies={toggleReplies}
                />
              ))}
            </div>
          )}
        </div>
        {/* Input */}
        <form 
          onSubmit={handleSend} 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 8, 
            padding: '10px 16px', 
            paddingBottom: window.innerWidth <= 1024 ? 12 : 'max(10px, env(safe-area-inset-bottom))',
            borderTop: `1px solid ${T?.border || '#262626'}`,
            background: T?.cardBg || '#1A1A1A'
          }}
        >
          {replyingTo && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: (T?.pri || '#000') + '10', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: T?.txt || '#000' }}>
                Replying to <strong>@{replyingTo.user?.username}</strong>
              </span>
              <button
                onClick={handleCancelReply}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T?.sub || '#666' }}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={replyingTo ? `Reply to @${replyingTo.user?.username}...` : (api.hasToken() ? 'Add a comment…' : 'Log in to comment')}
              disabled={!api.hasToken()}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 24, border: `1.5px solid rgba(226,179,85,0.35)`, background: '#111', color: '#F5E6C8', fontSize: 16, outline: 'none' }}
            />
            <button
              type="button"
              onClick={() => { inputRef.current?.focus(); setText(prev => prev + '@'); }}
              disabled={!api.hasToken()}
              style={{ background: 'none', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8fc441', flexShrink: 0, zIndex: 10 }}
            >
              <AtSign size={18} />
            </button>
            <button
              type="button"
              onClick={() => setShowGiftModal(true)}
              disabled={!api.hasToken()}
              style={{ background: 'none', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8fc441', flexShrink: 0, zIndex: 10 }}
            >
              <Gift size={18} />
            </button>
            <button
              type="submit"
              disabled={!text.trim() || sending || !api.hasToken()}
              style={{ background: T?.pri || '#000', border: 'none', borderRadius: '50%', width: 40, height: 40, minWidth: 40, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (!text.trim() || sending) ? 0.5 : 1, transition: 'opacity 0.2s, transform 0.1s', flexShrink: 0, zIndex: 10 }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <Send size={16} color="#fff" />
            </button>
          </div>
        </form>

        {/* Mention Suggestions Dropdown */}
        {showMentionSuggestions && mentionSuggestions.length > 0 && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: 16,
            right: 16,
            background: T?.cardBg || '#1A1A1A',
            borderRadius: 12,
            border: `1px solid ${T?.border || '#333'}`,
            maxHeight: 200,
            overflowY: 'auto',
            zIndex: 100,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}>
            {mentionSuggestions.map(u => (
              <button
                key={u.id}
                onClick={() => handleSelectMention(u.username)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: T?.txt || '#fff',
                  fontSize: 14,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = (T?.border || '#333')}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: T?.pri + '30',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {u.profile_photo ? (
                    <img src={mediaUrl(u.profile_photo)} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : '👤'}
                </div>
                <span style={{ fontWeight: 600 }}>@{u.username}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Gift Modal */}
      {showGiftModal && (
        <GiftPage
          username={post.user?.username}
          onClose={() => setShowGiftModal(false)}
          onShowWallet={() => setShowGiftModal(false)}
          onShowCoinPurchase={onShowCoinPurchase ? () => {
            setShowGiftModal(false);
            onShowCoinPurchase();
          } : undefined}
        />
      )}
      <InsufficientCoinsModal
        visible={showInsufficientCoinsModal}
        onClose={() => setShowInsufficientCoinsModal(false)}
        onBuyCoins={() => {
          setShowInsufficientCoinsModal(false);
          onShowCoinPurchase?.();
        }}
      />
    </div>
  );
});

/* ── Post Info Sheet ── */
const PostInfoSheet = memo(function PostInfoSheet({ post, onClose, T }) {
  const raw = post.media || post.image || '';
  const isVideo = isVideoUrl(raw);
  const avatarSrc = post.user?.profile_photo ? mediaUrl(post.user.profile_photo) : null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: window.innerWidth <= 1024 ? 0 : 260, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9300, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: T?.cardBg || '#fff', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', boxSizing: 'border-box' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T?.border || '#e0e0e0', margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: T?.txt || '#000', marginBottom: 16 }}>Post Info</div>

        {/* Author */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '12px', background: T?.cardBg || '#fff', borderRadius: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', background: (T?.pri || '#000') + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {avatarSrc ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: T?.txt || '#000' }}>@{post.user?.username || 'unknown'}</div>
            <div style={{ fontSize: 12, color: T?.sub || '#666' }}>{post.user?.full_name || ''}</div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[['❤️', post.votes || 0, 'Likes'], ['💬', post.comment_count || 0, 'Comments'], ['👁️', post.view_count || 0, 'Views']].map(([emoji, val, lbl]) => (
            <div key={lbl} style={{ flex: 1, background: T?.cardBg || '#fff', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 18 }}>{emoji}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: T?.txt || '#000' }}>{val === 0 ? '' : (val === 1 ? 1 : Number(val).toLocaleString())}</div>
              <div style={{ fontSize: 11, color: T?.sub || '#666' }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* Meta */}
        <div style={{ fontSize: 13, color: T?.sub || '#666', marginBottom: post.caption ? 10 : 0 }}>
          <span style={{ color: T?.pri || '#000', fontWeight: 600 }}>{isVideo ? '🎬 Video' : '🖼️ Image'}</span>
          {' · '}
          {timeAgo(post.created_at)}
        </div>

        {/* Caption */}
        {post.caption && (
          <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.55, marginTop: 8 }}>
            <span style={{ fontWeight: 700 }}>@{post.user?.username} </span>
            {post.caption}
          </div>
        )}

        <button onClick={onClose} style={{ marginTop: 20, width: '100%', padding: '12px', borderRadius: 12, background: T?.cardBg || '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: T?.txt || '#000' }}>Close</button>
      </div>
    </div>
  );
});

/* ── Post Options Popover ── */
const PostOptionsMenu = memo(function PostOptionsMenu({ post, currentUser, onClose, T, onRequireAuth, anchorRect, onShowReportModal }) {
  const isOwn = currentUser?.id === post.user?.id;
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const menuRef = useRef(null);

  // Calculate position: appear to the left of the button, align top
  const menuWidth = 220;
  const vp = { w: window.innerWidth, h: window.innerHeight };
  let left = anchorRect ? anchorRect.right - menuWidth : vp.w - menuWidth - 12;
  let top  = anchorRect ? anchorRect.bottom + 6 : 60;
  if (left < 8) left = 8;
  if (left + menuWidth > vp.w - 8) left = vp.w - menuWidth - 8;

  // Close on outside click or scroll
  useEffect(() => {
    const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose(); };
    const handleScroll = () => onClose();
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const handlePostInfo = () => { setShowInfo(true); };

  const handleCopy = () => {
    const url = window.location.origin + '/post/' + post.id;
    navigator.clipboard?.writeText(url).catch(() => {});
    onClose();
  };

  const handleSaveFav = async () => {
    if (!api.hasToken()) { onRequireAuth?.(); onClose(); return; }
    try { await api.request(`/reels/${post.id}/save/`, { method: 'POST' }); } catch {}
    onClose();
  };

  const handleDownload = async () => {
    const src = mediaUrl(post.media || post.image || '');
    if (!src) { onClose(); return; }
    try {
      const a = document.createElement('a');
      a.href = src;
      const ext = src.split('.').pop()?.split('?')[0] || 'file';
      a.download = `flipstar_post_${post.id}.${ext}`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
    onClose();
  };

  const handleNotInterested = async () => {
    if (!api.hasToken()) { onRequireAuth?.(); onClose(); return; }
    try { await api.request('/reels/not-interested/', { method: 'POST', body: JSON.stringify({ reel_id: post.id }), headers: { 'Content-Type': 'application/json' } }); } catch {}
    onClose();
  };
  const handleReport = async () => {
    if (!api.hasToken()) { onRequireAuth?.(); onClose(); return; }
    onShowReportModal?.();
    onClose();
  };
  const handleDelete = async () => {
    if (!api.hasToken()) return;
    try { await api.request(`/reels/${post.id}/`, { method: 'DELETE' }); } catch {}
    onClose();
  };

  const handleBoost = () => {
    if (!api.hasToken()) { onRequireAuth?.(); onClose(); return; }
    setShowBoostModal(true);
  };

  const groups = [
    [
      ...(currentUser?.id === post.user?.id
        ? [{ Icon: Zap, label: 'Boost', action: handleBoost }]
        : []
      ),
      { Icon: Info,     label: 'Post Info',        action: handlePostInfo },
      { Icon: Link2,    label: 'Copy Link',         action: handleCopy },
      { Icon: Bookmark, label: 'Save to Favorites', action: handleSaveFav },
      { Icon: Download, label: 'Download',          action: handleDownload },
    ],
    [
      { Icon: Flag,  label: 'Not Interested', action: handleNotInterested },
      ...(isOwn
        ? [{ Icon: Trash2, label: 'Delete Post', action: handleDelete, danger: true }]
        : [{ Icon: Flag,   label: 'Report',      action: handleReport,  danger: true }]
      ),
    ],
  ];

  let idx = 0;
  return (
    <>
      <div
        ref={menuRef}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top, left, width: menuWidth,
          zIndex: 9200,
          background: T?.cardBg || '#fff',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)',
          border: `1px solid ${T?.border || '#e0e0e0'}`,
          overflow: 'hidden',
          animation: 'menuFadeIn 0.15s ease',
        }}
      >
        <style>{`@keyframes menuFadeIn { from { opacity:0; transform:scale(0.95) translateY(-6px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
        {groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div style={{ height: 1, background: T?.border || '#e0e0e0' }} />}
            {group.map(opt => {
              const i = idx++;
              const { Icon } = opt;
              return (
                <button
                  key={opt.label}
                  onClick={opt.action}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', padding: '12px 16px',
                    background: hoveredIdx === i ? T?.cardBg || '#fff' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontSize: 14, fontWeight: 500,
                    color: opt.danger ? '#EF4444' : T?.txt || '#000',
                    transition: 'background 0.12s',
                  }}
                >
                  <Icon size={17} strokeWidth={1.8} color={opt.danger ? '#EF4444' : T?.sub || '#666'} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {showInfo && <PostInfoSheet post={post} onClose={() => { setShowInfo(false); onClose(); }} T={T} />}

      {/* Boost Modal */}
      {showBoostModal && (
        <BoostModal
          reelId={post.id}
          onClose={() => setShowBoostModal(false)}
          onSuccess={() => {
            setShowBoostModal(false);
            onClose();
          }}
        />
      )}
    </>
  );
});

/* ── Post Card ── */
const PostCard = memo(function PostCard({ post, index, currentUser, T, onShowProfile, onRequireAuth, onNavigateToReel, onCommentAdded, onVoteAdded, onShowVideoDetail, onHashtagClick, videoObserver, onShowWallet, onShowCoinPurchase, onFollow, isFollowing, joinedCampaignIds, subscriptionStatus, onShowSubscription }) {
  // Seed from post + any persisted local state so the heart stays filled
  // even when the cached feed's `is_liked` is stale.
  const [liked, setLiked] = useState(() => post.is_liked || readIdSet(LIKES_KEY).has(post.id));
  const [likes, setLikes] = useState(likeCountOf(post));
  const [saved, setSaved] = useState(() => post.is_saved || readIdSet(SAVES_KEY).has(post.id));
  const [showInsufficientCoinsModal, setShowInsufficientCoinsModal] = useState(false);
  const likeInteracted = useRef(false);
  const saveInteracted = useRef(false);
  const [imgError, setImgError] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [optionsAnchor, setOptionsAnchor] = useState(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  // True once the video has decoded a frame, so the placeholder below can get
  // out of the way instead of covering the picture for the whole playback.
  const [videoReady, setVideoReady] = useState(false);
  const [inlineComments, setInlineComments] = useState(post.recent_comments || []);
  const [commentCount, setCommentCount] = useState(commentCountOf(post));
  const [showAllInline, setShowAllInline] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportSuccessModal, setReportSuccessModal] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [isBoostedPost, setIsBoostedPost] = useState(Boolean(post.is_boosted));

  const isOwnPost = currentUser?.id === post.user?.id;

  const handleFollowClick = (e) => {
    e.stopPropagation();
    if (!currentUser) { onRequireAuth?.(); return; }
    onFollow?.(post.user?.id);
  };

  const submitReport = async (category) => {
    setShowReportModal(false);
    try {
      await api.request('/reports/create/', {
        method: 'POST',
        body: JSON.stringify({
          reported_reel_id: post.id,
          report_type: category,
          description: `Reported as ${category}`,
        }),
        headers: { 'Content-Type': 'application/json' }
      });
      setReportSuccessModal(true);
    } catch (error) {
      console.error('Failed to submit report:', error);
      alert('Failed to submit report. Please try again.');
    }
  };

  // ── Re-sync local UI with prop changes ────────────────────────────────────
  // When the feed background-refreshes, the same card receives a new `post`
  // object with fresh server values.  Without this effect, the local
  // `likes` / `commentCount` numbers would stick at whatever they were when
  // the card first mounted (the bug the user reported: "it counts the next
  // time not count — as it wants").
  useEffect(() => {
    setLikes(post.votes || 0);
    setCommentCount(commentCountOf(post));
    setIsBoostedPost(Boolean(post.is_boosted));
    if (!likeInteracted.current) setLiked(!!post.is_liked || readIdSet(LIKES_KEY).has(post.id));
    if (!saveInteracted.current) setSaved(!!post.is_saved || readIdSet(SAVES_KEY).has(post.id));
    if (Array.isArray(post.recent_comments) && post.recent_comments.length) {
      setInlineComments(post.recent_comments.slice(0, 3));
    }
  }, [post.id, post.votes, post.comment_count, post.is_boosted, post.is_liked, post.is_saved, post.recent_comments]);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [shine, setShine] = useState({ x: 50, y: 50, opacity: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [viewCount, setViewCount] = useState(post.view_count || 0);
  const [shareToast, setShareToast] = useState('');
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [baseFontSize, setBaseFontSize] = useState(16);
  const [likeAnim, setLikeAnim] = useState(false);
  const [saveAnim, setSaveAnim] = useState(false);
  const cardRef = useRef(null);
  const videoRef = useRef(null);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareableUsers, setShareableUsers] = useState([]);
  const [loadingShareUsers, setLoadingShareUsers] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [searchingShareUsers, setSearchingShareUsers] = useState(false);
  const [shareSent, setShareSent] = useState(null);
  const shareSearchTimer = useRef(null);
  const followedUsersCache = useRef([]);

  // Get base font size from CSS variable
  useEffect(() => {
    const updateBaseFontSize = () => {
      const computedStyle = getComputedStyle(document.documentElement);
      const fontSize = computedStyle.getPropertyValue('--font-size-base');
      setBaseFontSize(parseFloat(fontSize) || 16);
    };
    updateBaseFontSize();
    window.addEventListener('storage', updateBaseFontSize);
    return () => window.removeEventListener('storage', updateBaseFontSize);
  }, []);

  // Campaign detection — a post is a campaign entry if the backend flagged it
  // (is_campaign_post) or it is linked to a campaign (campaign_id/campaign).
  const boostEndsAt = post.boost_ends_at || boostEndTimeCache.get(post.id);
  const isBoostCurrentlyActive = isBoostedPost && (!boostEndsAt || new Date(boostEndsAt) > new Date());
  const isCampaignPost = !!(post.is_campaign_post || post.campaign_id || post.campaign);
  const CAPTION_LIMIT = 140;
  const rafRef = useRef(null);
  const viewTracked = useRef(false);

  // Debug campaign post detection
  if (post.is_campaign_post || post.campaign_id || post.campaign) {
    console.log('[Campaign Badge Debug] Post ID:', post.id, 'is_campaign_post:', post.is_campaign_post, 'campaign_id:', post.campaign_id, 'campaign:', post.campaign);
  }

  // Check if this user has already viewed this post (persisted in localStorage)
  const hasViewedPost = () => {
    try {
      const userId = currentUser?.id || 'anonymous';
      const viewedPosts = JSON.parse(localStorage.getItem(`viewed_posts_${userId}`) || '[]');
      return viewedPosts.includes(post.id);
    } catch {
      return false;
    }
  };

  // Mark this post as viewed by this user
  const markPostAsViewed = () => {
    try {
      const userId = currentUser?.id || 'anonymous';
      const viewedPosts = JSON.parse(localStorage.getItem(`viewed_posts_${userId}`) || '[]');
      if (!viewedPosts.includes(post.id)) {
        viewedPosts.push(post.id);
        localStorage.setItem(`viewed_posts_${userId}`, JSON.stringify(viewedPosts));
      }
    } catch {}
  };

  // Track view when card is 50% visible for at least 1 second
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    
    // Skip if already viewed by this user
    if (hasViewedPost()) return;
    
    let timer = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !viewTracked.current) {
          timer = setTimeout(async () => {
            viewTracked.current = true;
            markPostAsViewed();
            try {
              const res = await api.request(`/reels/${post.id}/view/`, { method: 'POST' });
              if (res?.view_count !== undefined) setViewCount(res.view_count);
            } catch {}
          }, 1000);
        } else {
          if (timer) { clearTimeout(timer); timer = null; }
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(card);
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [post.id, currentUser?.id]);

  const handleMouseMove = (e) => {
    // Tilt + shine disabled: keep hover to scale/lift only.
    return;
    // eslint-disable-next-line no-unreachable
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    const shineX = ((e.clientX - rect.left) / rect.width) * 100;
    const shineY = ((e.clientY - rect.top) / rect.height) * 100;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setTilt({ x: -dy * 5, y: dx * 5 });
      setShine({ x: shineX, y: shineY, opacity: 0.18 });
    });
  };

  const handleMouseEnter = () => { setIsHovered(true); };
  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleTouchStart = (e) => {
    setIsPressed(true);
    const touch = e.touches[0];
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const shineX = ((touch.clientX - rect.left) / rect.width) * 100;
    const shineY = ((touch.clientY - rect.top) / rect.height) * 100;
    setShine({ x: shineX, y: shineY, opacity: 0.22 });
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
    setShine(s => ({ ...s, opacity: 0 }));
  };

  // Detect if this post has video media
  const raw = post.media || post.image || '';
  const isVideo = isVideoPost(post);
  const mediaSrc = mediaUrl(raw);
  // Same caption/description resolution the overlay uses, so the two agree on
  // whether there is anything to show.
  const hasCaption = Boolean(captionOf(post));
  const avatarSrc = post.user?.profile_photo ? mediaUrl(post.user.profile_photo) : null;

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!api.hasToken()) { onRequireAuth?.(); return; }

    // Block non-subscribers from liking
    const hasSubscription = subscriptionStatus?.has_subscription;
    if (!hasSubscription) {
      onShowSubscription?.();
      return;
    }

    const newLiked = !liked;
    // Optimistic UI + persist locally so the heart stays filled
    // even when the cached feed's `is_liked` is stale.
    likeInteracted.current = true;
    setLiked(newLiked);
    setLikes(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
    toggleIdInSet(LIKES_KEY, post.id, newLiked);
    setLikeAnim(true);
    setTimeout(() => setLikeAnim(false), 400);
    try {
      await api.request(`/reels/${post.id}/vote/`, { method: 'POST' });
    } catch (err) {
      console.error('[HomePage] Vote failed:', err);
      // Check for insufficient coins error
      const errorData = err.data || (typeof err.message === 'string' ? JSON.parse(err.message) : null);
      if (errorData?.error && errorData.error.toLowerCase().includes('insufficient')) {
        setShowInsufficientCoinsModal(true);
      }
      // Rollback on failure so the count doesn't drift from truth.
      setLiked(!newLiked);
      setLikes(prev => newLiked ? Math.max(0, prev - 1) : prev + 1);
      toggleIdInSet(LIKES_KEY, post.id, !newLiked);
    }
  };

  const handleSave = async (e) => {
    e.stopPropagation();
    if (!api.hasToken()) { onRequireAuth?.(); return; }
    const newSaved = !saved;
    saveInteracted.current = true;
    setSaved(newSaved);
    toggleIdInSet(SAVES_KEY, post.id, newSaved);
    setSaveAnim(true);
    setTimeout(() => setSaveAnim(false), 300);
    try {
      await api.request(`/reels/${post.id}/save/`, { method: 'POST' });
    } catch (err) {
      setSaved(!newSaved);
      toggleIdInSet(SAVES_KEY, post.id, !newSaved);
      console.error('[HomePage] Save failed:', err);
    }
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    setShareSearch('');
    setSearchingShareUsers(false);

    // Check for insufficient coins before opening share modal for campaign posts
    if (post?.is_campaign_post && post.user?.id !== currentUser?.id) {
      try {
        const walletData = await api.request('/wallet/');
        const balance = walletData?.balance?.total || 0;
        const config = await api.request('/wallet/config/');
        const costShare = config?.costs?.share || 0;
        
        if (costShare > 0 && balance < costShare) {
          setShowInsufficientCoinsModal(true);
          return;
        }
      } catch (err) {
        console.error('Failed to check wallet balance:', err);
      }
    }

    // Show cached followed users instantly, then refresh in background
    if (followedUsersCache.current.length > 0) {
      setShareableUsers(followedUsersCache.current);
      setLoadingShareUsers(false);
      setShowShareModal(true);
      loadShareableUsers(true);
    } else {
      setShowShareModal(true);
      loadShareableUsers(false);
    }
  };

  const loadShareableUsers = async (silent = false) => {
    if (!silent) setLoadingShareUsers(true);
    try {
      // Only fetch followed users
      const followingRes = await api.getFollowing(currentUser?.id);
      const followingUsers = Array.isArray(followingRes) ? followingRes : (followingRes.results || []);
      
      // FollowSerializer returns {id, follower, following, created_at} — unwrap .following
      const userMap = new Map();
      followingUsers.forEach(rel => {
        const user = rel.following || rel;
        if (user.id !== currentUser?.id && user.id !== post?.user?.id) {
          userMap.set(user.id, { ...user, isFollowing: true });
        }
      });
      
      const combinedUsers = Array.from(userMap.values());
      followedUsersCache.current = combinedUsers;
      setShareableUsers(combinedUsers);
    } catch (error) {
      if (followedUsersCache.current.length === 0) setShareableUsers([]);
    } finally {
      if (!silent) setLoadingShareUsers(false);
    }
  };

  const handleShareUserSearch = (text) => {
    setShareSearch(text);
    clearTimeout(shareSearchTimer.current);
    if (!text.trim()) {
      // Restore followed users from cache instantly
      if (followedUsersCache.current.length > 0) {
        setShareableUsers(followedUsersCache.current);
      } else {
        loadShareableUsers();
      }
      return;
    }
    setSearchingShareUsers(true);
    shareSearchTimer.current = setTimeout(async () => {
      try {
        const res = await api.request(`/search/?q=${encodeURIComponent(text.trim())}&type=users`);
        const users = Array.isArray(res?.users) ? res.users
          : Array.isArray(res) ? res
          : (res?.results || []);
        setShareableUsers(users.filter(u => u.id !== currentUser?.id && u.id !== post?.user?.id));
      } catch {
        // keep existing list on error
      } finally {
        setSearchingShareUsers(false);
      }
    }, 400);
  };

  const handleShareWithUser = async (targetUserId) => {
    if (!post) return;
    try {
      const convo = await api.request('/messages/conversations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: targetUserId }),
      });
      const caption = post.caption || 'Check out this post!';
      const userName = post.user?.username || post.user?.first_name || 'Someone';
      const messageText = `🎬 ${userName} shared a post\n\n${caption}\n\n[POST_ID:${post.id}]`;
      await api.request(`/messages/conversations/${convo.id}/messages/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messageText }),
      });
      try {
        await api.request(`/reels/${post.id}/share/`, { method: 'POST' });
      } catch (error) {
        console.error('Share count update failed:', error);
        const errorData = error?.response?.data || error?.data || (typeof error.message === 'string' ? JSON.parse(error.message) : null);
        const errorMessage = errorData?.error || errorData?.message || error?.message;
        console.log('[Share] Error data:', errorData, 'Error message:', errorMessage);
        if (errorMessage && errorMessage.toLowerCase().includes('insufficient')) {
          setShowInsufficientCoinsModal(true);
        } else if (errorData?.required_coins) {
          setShowInsufficientCoinsModal(true);
        }
      }
      setShareSent(targetUserId);
      setShareToast('✅ Shared!');
      setTimeout(() => { setShowShareModal(false); setShareSent(null); setShareToast(''); }, 1200);
    } catch (err) {
      console.error('Share with user failed:', err);
      setShareToast('❌ Failed to share');
      setTimeout(() => setShareToast(''), 1800);
    }
  };

  const handleShareExternal = async () => {
    if (!post) return;
    const postUrl = `${window.location.origin}/post/${post.id}`;
    const title = (post.caption || '').toString().slice(0, 80) || 'Check out this post on FlipStar';
    setShowShareModal(false);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: title, url: postUrl });
        try {
          await api.request(`/reels/${post.id}/share/`, { method: 'POST' });
        } catch (error) {
          console.error('Share count update failed:', error);
          const errorData = error?.response?.data || error?.data || (typeof error.message === 'string' ? JSON.parse(error.message) : null);
          const errorMessage = errorData?.error || errorData?.message || error?.message;
          console.log('[External Share] Error data:', errorData, 'Error message:', errorMessage);
          if (errorMessage && errorMessage.toLowerCase().includes('insufficient')) {
            setShowInsufficientCoinsModal(true);
          } else if (errorData?.required_coins) {
            setShowInsufficientCoinsModal(true);
          }
        }
      } catch (error) {
        console.error('External share failed:', error);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(postUrl).then(() => {
        alert('Link copied to clipboard!');
      }).catch(() => {
        alert('Could not share or copy link');
      });
    }
  };

  const [showImageZoom, setShowImageZoom] = useState(false);

  const handleVideoClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    // Stop this card's audio before leaving. A <video> still playing when React
    // detaches it keeps its audio running until garbage collection, which is
    // heard as sound with no picture on whatever page we navigate to.
    const v = videoRef.current;
    if (v && !v.paused) { try { v.pause(); } catch { /* already detached */ } }
    // Navigate to Reels page for video posts (Instagram-style)
    if (onShowVideoDetail) {
      onShowVideoDetail(post.id);
    }
  };

  const handleImageClick = (e) => {
    e.stopPropagation();
    setShowImageZoom(true);
  };

  const handleCommentClick = (e) => {
    e.stopPropagation();
    
    // Block non-subscribers from commenting
    const hasSubscription = subscriptionStatus?.has_subscription;
    if (!hasSubscription) {
      onShowSubscription?.();
      return;
    }
    
    setShowComments(true);
  };

  // IntersectionObserver to play/pause videos based on visibility
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo || !videoObserver) return;

    videoObserver.observe(video);
    return () => {
      videoObserver.unobserve(video);
      // unobserve() does not stop playback — pause explicitly so an unmounting
      // card cannot keep emitting audio in the background.
      try { video.pause(); } catch { /* already detached */ }
    };
  }, [isVideo, videoObserver]);

  const hashtags = Array.isArray(post.hashtags_list)
    ? post.hashtags_list
    : (post.hashtags || '').split(/\s+/).filter(Boolean);

  return (
    <>
      {/* Image zoom lightbox */}
      {showImageZoom && mediaSrc && (
        <div
          onClick={() => setShowImageZoom(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
            padding: 16,
          }}
        >
          <button
            onClick={() => setShowImageZoom(false)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', border: 'none',
              borderRadius: '50%', width: 40, height: 40,
              color: '#fff', fontSize: 20, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
          <img
            src={mediaSrc}
            alt={post.caption || ''}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '100%', maxHeight: '90vh',
              objectFit: 'contain', borderRadius: 12,
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              cursor: 'default',
            }}
          />
        </div>
      )}
      <style>{`
        @keyframes heartPop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.45); }
          70%  { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
        @keyframes savePop {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
        @keyframes cardSlideUp {
          from { opacity: 0; transform: translateY(32px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        .hp-btn { transition: transform 0.12s, opacity 0.15s, background 0.15s; }
        .hp-btn:active { transform: scale(0.82) !important; opacity: 0.7; }
        .hp-action:hover { background: var(--hp-hover) !important; border-radius: 10px; }
        .hp-action:hover svg { transform: scale(1.18); }
      `}</style>

      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          background: T?.cardBg || '#1A1A1A',
          borderRadius: 16,
          boxShadow: isHovered
            ? `0 16px 48px rgba(0,0,0,0.16), 0 4px 16px rgba(0,0,0,0.10)`
            : '0 2px 16px rgba(0,0,0,0.08)',
          border: `1px solid ${isHovered ? (T?.pri || '#000') + '50' : T?.border || '#e0e0e0'}`,
          overflow: 'hidden',
          marginBottom: window.innerWidth > 768 ? 24 : 16,
          // Cards occupy their natural height based on content.
          maxWidth: 560,
          width: '100%',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          transform: isPressed
            ? 'scale(0.985)'
            : `translateY(${isHovered ? -3 : 0}px) scale(${isHovered ? 1.015 : 1})`,
          transition: isPressed
            ? 'transform 0.1s ease, box-shadow 0.1s'
            : 'transform 0.35s cubic-bezier(0.23,1,0.32,1), box-shadow 0.35s ease, border-color 0.3s',
          willChange: 'transform',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 8, flexShrink: 0 }}>
          <button aria-label="Open profile"
            className="hp-btn"
            onClick={(e) => { e.stopPropagation(); onShowProfile?.(post.user?.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            <div style={{ width: 'calc(var(--font-size-base, 16px) * 1.75)', height: 'calc(var(--font-size-base, 16px) * 1.75)', minWidth: 28, minHeight: 28, borderRadius: '50%', overflow: 'hidden', background: (T?.pri || '#000') + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'calc(var(--font-size-base, 16px) * 0.875)', border: `1px solid ${(T?.pri || '#000')}20` }}>
              {avatarSrc
                ? <img src={avatarSrc} alt="" loading={index === 0 ? 'eager' : 'lazy'} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                : <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 'calc(var(--font-size-base, 16px) * 0.75)', fontWeight: 600 }}>
                    {post.user?.username?.charAt(0)?.toUpperCase() || 'U'}
                  </div>}
            </div>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <button aria-label="Open profile"
                className="hp-btn"
                onClick={(e) => { e.stopPropagation(); onShowProfile?.(post.user?.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'calc(var(--font-size-base, 16px) * 0.8125)', fontWeight: 700, color: '#fff' }}
              >
                {post.user?.username || 'user'}
              </button>
              <CheckCircle size={baseFontSize * 0.75} fill={T?.pri || '#000'} color="#fff" />

              {!isOwnPost && !isFollowing && (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: T?.sub || '#666', margin: '0 4px', fontSize: 14 }}>•</span>
                  <button
                    onClick={handleFollowClick}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: T?.pri || '#DA9B2A',
                      fontWeight: 700,
                      fontSize: 'calc(var(--font-size-base, 16px) * 0.8125)',
                      cursor: 'pointer',
                      padding: '0 4px',
                    }}
                  >
                    Follow
                  </button>
                </div>
              )}
            </div>
            <div style={{ fontSize: 'calc(var(--font-size-base, 16px) * 0.6875)', color: '#8fc441' }}>{timeAgo(post.created_at)}</div>
          </div>
          {isOwnPost && (
            isBoostCurrentlyActive ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 999,
                background: '#8fc441', color: '#1A1A1A',
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}>
                <Zap size={14} color="#1A1A1A" />
                Boosted
              </div>
            ) : (
              <button
                className="hp-btn"
                onClick={(e) => { e.stopPropagation(); if (!api.hasToken()) { onRequireAuth?.(); return; } setShowBoostModal(true); }}
                style={{
                  background: 'rgba(143,196,65,0.1)',
                  border: '1px solid #8fc441',
                  color: '#8fc441',
                  cursor: 'pointer',
                  padding: '6px 10px',
                  borderRadius: 999,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  marginRight: 6,
                }}
              >
                <Zap size={14} color="#8fc441" />
                Boost Now
              </button>
            )
          )}
          <button
            className="hp-btn"
            onClick={(e) => { e.stopPropagation(); if (showOptions) { setShowOptions(false); return; } setOptionsAnchor(e.currentTarget.getBoundingClientRect()); setShowOptions(true); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T?.sub || '#666', display: 'flex', alignItems: 'center' }}
          >
            <MoreHorizontal size={baseFontSize * 1.125} />
          </button>
        </div>

        {/* Campaign Badge - at top of post card */}
        {isCampaignPost && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              const campaignId = post.campaign_id || post.campaign?.id;
              console.log('[Campaign Badge] Clicked, campaignId:', campaignId);
              if (campaignId) {
                window.location.hash = `#campaign/${campaignId}`;
              } else {
                console.log('[Campaign Badge] No campaignId found, navigating to campaigns page');
                window.location.hash = '#campaigns';
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '0 10px 8px',
              padding: '8px 12px',
              borderRadius: 10,
              background: 'rgba(143, 196, 65, 0.15)',
              border: '1px solid rgba(143, 196, 65, 0.3)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={14} color="#8fc441" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#8fc441',
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {post.campaign?.title || post.campaign_title || post.campaign_name || 'Campaign Entry'}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#8fc441',
                    padding: '2px 6px',
                    borderRadius: 6,
                    background: 'rgba(143, 196, 65, 0.18)',
                    border: '1px solid rgba(143, 196, 65, 0.4)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>✓ Joined</span>
                </div>
                {(post.campaign?.total_entries || post.campaign?.entries_count || 0) > 0 && (
                  <span style={{
                    fontSize: 10,
                    color: T?.sub || '#666',
                  }}>
                    {post.campaign?.total_entries || post.campaign?.entries_count || 0} participants
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const campaignId = post.campaign_id || post.campaign?.id;
                console.log('[Campaign Badge] View button clicked, campaignId:', campaignId);
                if (campaignId) {
                  window.location.hash = `#campaign/${campaignId}`;
                } else {
                  console.log('[Campaign Badge] No campaignId found, navigating to campaigns page');
                  window.location.hash = '#campaigns';
                }
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                background: '#8fc441',
                border: 'none',
                color: '#000',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              View
            </button>
          </div>
        )}

        {/* Media — natural aspect ratio, never cropped */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            background: 'transparent',
            cursor: isVideo ? 'pointer' : 'default',
          }}
        >
          {mediaSrc && !imgError ? (
            isVideo ? (
              <>
                <video
                  ref={videoRef}
                  src={mediaSrc}
                  poster={post.image ? mediaUrl(post.image) : undefined}
                  preload={index === 0 ? 'metadata' : 'none'}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  style={{ width: '100%', height: 'auto', display: 'block', background: '#000', pointerEvents: 'none' }}
                  playsInline
                  loop
                  onPlay={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)}
                  onLoadedData={() => setVideoReady(true)}
                  onError={() => setImgError(true)}
                />
                {/* Placeholder for videos with no poster. It is opaque and
                    covers the whole frame, so it must be removed as soon as
                    the video has a frame to show — otherwise the clip plays
                    underneath it and you get sound with no picture. */}
                {!post.image && !videoReady && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1
                  }}>
                    <div style={{ fontSize: 48, opacity: 0.5 }}>🎬</div>
                  </div>
                )}
                {/* Clickable overlay to navigate to Reels */}
                <div
                  onClick={handleVideoClick}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 10,
                    cursor: 'pointer',
                  }}
                />
              </>
            ) : (
              <img
                src={mediaSrc}
                alt={post.caption || ''}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
                style={{ width: '100%', height: 'auto', display: 'block', cursor: 'zoom-in' }}
                onClick={handleImageClick}
                onError={() => setImgError(true)}
              />
            )
          ) : (
            <div style={{ width: '100%', height: 260, background: T?.cardBg || '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T?.sub || '#666', fontSize: 14 }}>No media</div>
          )}

          {/* Play button overlay - only shows when paused */}
          {isVideo && !videoPlaying && (
            <div 
              onClick={handleVideoClick}
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.25)',
                cursor: 'pointer',
                zIndex: 11,
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(255,255,255,0.85)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
              }}>
                <Play size={baseFontSize * 1.625} fill="#1C1917" color="#1C1917" style={{ marginLeft: 3 }} />
              </div>
            </div>
          )}

          {/* Caption over the media, TikTok style. Sits above the tap-to-open
              layer (z 10) and the play button (z 11); the overlay root is
              pointer-events:none so only its own controls take taps and the
              rest still opens the reel. */}
          {isVideo && mediaSrc && !imgError && hasCaption && (
            <div
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 12,
                padding: '40px 10px 10px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.38) 48%, rgba(0,0,0,0) 100%)',
                pointerEvents: 'none',
              }}
            >
              <PostCaptionOverlay
                post={post}
                showAuthor={false}
                onOpenProfile={(id) => onShowProfile?.(id)}
                onHashtagClick={() => onHashtagClick?.()}
                onMentionClick={() => onHashtagClick?.()}
              />
            </div>
          )}

          {/* View count badge — moves to the top on captioned videos so the
              caption owns the bottom edge. */}
          {mediaSrc && !imgError && (
            <div style={{
              position: 'absolute',
              ...(isVideo && hasCaption ? { top: 8 } : { bottom: 8 }),
              right: 8,
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              borderRadius: 20, padding: '3px 8px', fontSize: 'calc(var(--font-size-base) * 0.6875)', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 3,
              backdropFilter: 'blur(6px)',
              pointerEvents: 'none',
              zIndex: 5,
              maxWidth: 'calc(100% - 16px)',
            }}>
              <Eye size={baseFontSize * 0.75} />
              {viewCount.toLocaleString()}
            </div>
          )}
        </div>

        {/* Actions + caption - compact so everything fits in one viewport. */}
        <div style={{ padding: '4px 10px 8px', flexShrink: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {/* Like */}
              <button aria-label="Like"
                className="hp-btn hp-action"
                onClick={handleLike}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '4px 6px', borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 3,
                  '--hp-hover': (T?.border || '#e0e0e0') + '60',
                }}
              >
                {isCampaignPost ? (
                  <Trophy
                    size={baseFontSize}
                    fill={liked ? T?.pri || '#000' : 'none'}
                    color={liked ? T?.pri || '#000' : T?.txt || '#000'}
                    style={{ transition: 'transform 0.15s' }}
                  />
                ) : (
                  <Heart
                    size={baseFontSize}
                    fill={liked ? '#8fc441' : 'none'}
                    color={liked ? '#8fc441' : '#8fc441'}
                    style={{ transition: 'transform 0.15s' }}
                  />
                )}
                <span style={{ fontSize: 'calc(var(--font-size-base) * 0.6875)', color: '#8fc441', fontWeight: 600 }}>{likes === 0 ? '' : likes}</span>
              </button>
              {/* Comment */}
              <button aria-label="Comments"
                className="hp-btn hp-action"
                onClick={handleCommentClick}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '4px 6px', borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 3,
                  '--hp-hover': (T?.border || '#e0e0e0') + '60',
                }}
              >
                <MessageCircle size={baseFontSize} color="#8fc441" fill="none" style={{ transition: 'transform 0.15s, fill 0.15s' }} />
                <span style={{ fontSize: 'calc(var(--font-size-base) * 0.6875)', color: '#8fc441', fontWeight: 600 }}>{commentCount === 0 ? '' : commentCount}</span>
              </button>
              {/* Share */}
              <button aria-label="Share"
                className="hp-btn hp-action"
                onClick={handleShare}
                title="Share"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '4px 6px', borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 3,
                  '--hp-hover': (T?.border || '#e0e0e0') + '60',
                }}
              >
                <Share2 size={baseFontSize} color="#8fc441" fill="none" style={{ transition: 'transform 0.15s, fill 0.15s' }} />
                <span style={{ fontSize: 'calc(var(--font-size-base) * 0.6875)', color: '#8fc441', fontWeight: 600 }}>{shareCountOf(post) === 0 ? '' : shareCountOf(post)}</span>
              </button>
              {/* Gift - only show on other people's posts */}
              {post.user?.username !== currentUser?.username && (
                <button aria-label="Send gift"
                  className="hp-btn hp-action"
                  onClick={(e) => { e.stopPropagation(); setShowGiftModal(true); }}
                  title="Send Gift"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px 6px', borderRadius: 8,
                    display: 'flex', alignItems: 'center', gap: 3,
                    '--hp-hover': (T?.border || '#e0e0e0') + '60',
                  }}
                >
                  <Gift size={baseFontSize} color="#8fc441" fill="none" style={{ transition: 'transform 0.15s, fill 0.15s' }} />
                  <span style={{ fontSize: 'calc(var(--font-size-base) * 0.6875)', color: '#8fc441', fontWeight: 600 }}>{post.gifts_count === 0 ? '' : post.gifts_count}</span>
                </button>
              )}
            </div>
            {/* Save */}
            <button aria-label="Save"
              className="hp-btn hp-action"
              onClick={handleSave}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 6px', borderRadius: 8,
                animation: saveAnim ? 'savePop 0.3s ease' : 'none',
                '--hp-hover': saved ? (T?.pri || '#000') + '25' : (T?.border || '#e0e0e0') + '60',
              }}
            >
              <Bookmark
                size={baseFontSize}
                fill={saved ? '#8fc441' : 'none'}
                color="#8fc441"
              />
            </button>
          </div>

          {/* Caption - minimized. Videos show it over the media instead. */}
          {post.caption && !isVideo && (
            <div
              onClick={(e) => { e.stopPropagation(); setCaptionExpanded(v => !v); }}
              style={{
                fontSize: 'calc(var(--font-size-base) * 0.75)', color: '#8fc441', marginTop: 1, lineHeight: 1.3,
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: captionExpanded ? 'unset' : 2,
                overflow: 'hidden',
                wordBreak: 'break-word',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: 700, color: '#8fc441' }}>{post.user?.username} </span>
              {post.caption}
              {post.caption.length > 100 && (
                <span
                  style={{
                    color: T?.sub || '#666',
                    fontWeight: 600,
                    marginLeft: 4,
                  }}
                >
                  {captionExpanded ? ' less' : ' more'}
                </span>
              )}
            </div>
          )}
          {inlineComments.length > 0 && (
            <div style={{ marginTop: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {inlineComments.slice(0, 1).map(c => (
                <div
                  key={c.id}
                  onClick={(e) => { e.stopPropagation(); setShowComments(true); }}
                  style={{
                    fontSize: 12, color: '#fff', lineHeight: 1.3,
                    display: '-webkit-box', WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 1, overflow: 'hidden',
                    wordBreak: 'break-word', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#8fc441' }}>{c.user?.username} </span>
                  {c.text}
                </div>
              ))}
            </div>
          )}

          {/* Comments link */}
          <button aria-label="Comments"
            onClick={handleCommentClick}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, fontSize: 12, color: '#fff',
              display: 'block', marginTop: post.caption || inlineComments.length ? 2 : 0,
            }}
          >
            {commentCount > 0 ? `View all ${commentCount} comments` : 'Add a comment...'}
          </button>

          {/* Hashtags - after comments link */}
          {Array.isArray(post.hashtags_list) && post.hashtags_list.length > 0 && (
            <div style={{
              fontSize: 13, marginTop: 4,
            }}>
              {post.hashtags_list.map(tag => (
                <span key={tag} style={{ color: '#8fc441', fontWeight: 700, marginRight: 4 }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {isBoostCurrentlyActive && (
            <div style={{
              marginTop: 10,
              marginLeft: -10,
              marginRight: -10,
              marginBottom: -8,
              padding: '10px 12px',
              background: '#8fc441',
              borderTop: '1px solid rgba(0,0,0,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              color: '#1A1A1A',
              fontSize: 12,
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}>
              <Zap size={14} color="#1A1A1A" />
              Trending
            </div>
          )}
        </div>
      </div>

      {/* Comment Sheet */}
      {showComments && (
        <CommentSheet
          post={post}
          currentUser={currentUser}
          onClose={() => setShowComments(false)}
          onCommentAdded={() => setCommentCount(c => c + 1)}
          T={T}
          onShowCoinPurchase={onShowCoinPurchase}
        />
      )}

      {/* Post Options Popover */}
      {showOptions && (
        <PostOptionsMenu
          post={post}
          currentUser={currentUser}
          onClose={() => setShowOptions(false)}
          onRequireAuth={onRequireAuth}
          anchorRect={optionsAnchor}
          onShowReportModal={() => setShowReportModal(true)}
          T={T}
        />
      )}

      {/* Share toast */}
      {shareToast && (
        <div style={{
          position: 'fixed', bottom: 80, left: window.innerWidth <= 1024 ? '50%' : `calc(50% + 130px)`, transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.88)', color: '#fff', padding: '10px 18px',
          borderRadius: 20, fontSize: 14, fontWeight: 600, zIndex: 10000,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)', animation: 'toastIn 0.2s ease-out',
        }}>
          {shareToast}
        </div>
      )}

      {/* Gift Modal */}
      {showGiftModal && (
        <GiftPage
          username={post.user?.username}
          onClose={() => setShowGiftModal(false)}
          onShowWallet={onShowWallet}
          onShowCoinPurchase={() => {
            setShowGiftModal(false);
            onShowCoinPurchase?.();
          }}
        />
      )}

      {showBoostModal && (
        <BoostModal
          reelId={post.id}
          onClose={() => setShowBoostModal(false)}
          onSuccess={(resp) => {
            setIsBoostedPost(true);
            if (resp?.end_time) {
              boostEndTimeCache.set(post.id, resp.end_time);
              post.boost_ends_at = resp.end_time;
            }
            realtimeService.broadcastFeedRefresh();
            setShowBoostModal(false);
          }}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div
          onClick={() => setShowShareModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: T?.cardBg || '#fff',
              borderRadius: 20,
              width: '90%',
              maxWidth: 400,
              maxHeight: '70vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              padding: '20px 20px 10px',
              borderBottom: `1px solid ${T?.border || '#e0e0e0'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T?.txt || '#000' }}>
                Share with followers
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T?.sub || '#666' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 16 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
                padding: '8px 12px',
                background: (T?.bg || '#f5f5f5'),
                borderRadius: 10,
                border: `1px solid ${T?.border || '#e0e0e0'}`,
              }}>
                <Search size={16} color={T?.sub || '#666'} />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={shareSearch}
                  onChange={(e) => handleShareUserSearch(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    fontSize: 14,
                    color: T?.txt || '#000',
                  }}
                />
                {shareSearch && !searchingShareUsers && (
                  <button
                    onClick={() => handleShareUserSearch('')}
                    style={{ background: 'none', border: 'none', color: T?.sub || '#666', cursor: 'pointer', fontSize: 16 }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {searchingShareUsers && (
                <div style={{ textAlign: 'center', padding: 20, color: T?.sub || '#666', fontSize: 14 }}>
                  Searching...
                </div>
              )}

              {!loadingShareUsers && !searchingShareUsers && shareableUsers.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: T?.sub || '#666', fontSize: 14 }}>
                  {shareSearch ? 'No users found' : 'You are not following anyone yet'}
                </div>
              )}

              {shareableUsers.length > 0 && (
                <div style={{
                  maxHeight: 300,
                  overflowY: 'auto',
                }}>
                  {shareableUsers.map((u) => (
                    <div
                      key={u.id}
                      onClick={() => !shareSent && handleShareWithUser(u.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: 12,
                        borderRadius: 10,
                        cursor: shareSent ? 'default' : 'pointer',
                        background: shareSent === u.id ? (T?.pri || '#000') + '15' : 'transparent',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (!shareSent) e.currentTarget.style.background = (T?.border || '#e0e0e0') + '40';
                      }}
                      onMouseLeave={(e) => {
                        if (!shareSent) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: (T?.pri || '#000') + '30',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 600, color: T?.txt || '#000',
                        overflow: 'hidden',
                      }}>
                        {u.profile_photo ? (
                          <img src={mediaUrl(u.profile_photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          (u.username || 'U').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: T?.txt || '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.username}
                          </div>
                          {u.isFollowing && (
                            <span style={{
                              background: 'rgba(143,196,65,0.2)',
                              color: '#8fc441',
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 4,
                              flexShrink: 0,
                            }}>Following</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: T?.sub || '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.bio || 'Tap to share'}
                        </div>
                      </div>
                      {shareSent === u.id ? (
                        <div style={{ color: '#8fc441', fontSize: 12, fontWeight: 700 }}>
                          ✓ Sent
                        </div>
                      ) : (
                        <Send size={16} color={T?.sub || '#666'} />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* External share button */}
              <button
                onClick={handleShareExternal}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: (T?.bg || '#f5f5f5'),
                  border: `1px solid ${T?.border || '#e0e0e0'}`,
                  borderRadius: 12, padding: '12px 14px',
                  cursor: 'pointer', marginTop: 12, width: '100%',
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#8fc441', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Share2 size={20} color="#000" />
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T?.txt || '#000' }}>Share to other apps</div>
                  <div style={{ fontSize: 12, color: T?.sub || '#666' }}>WhatsApp, Facebook, Twitter, etc.</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Category Modal */}
      {showReportModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            pointerEvents: 'auto',
          }}
          onClick={() => setShowReportModal(false)}
        >
          <div
            style={{
              background: T?.cardBg || '#1A1A1A',
              borderRadius: 16,
              padding: '24px',
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              pointerEvents: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: T?.txt,
                marginBottom: 8,
              }}
            >
              Report Content
            </h3>
            <p
              style={{
                fontSize: 14,
                color: T?.sub,
                marginBottom: 20,
              }}
            >
              Why are you reporting this content?
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {[
                { id: 'spam', label: 'Spam or Misleading', icon: '⚠️' },
                {
                  id: 'inappropriate',
                  label: 'Inappropriate Content',
                  icon: '😢',
                },
                { id: 'violence', label: 'Violence or Dangerous', icon: '⚔️' },
                { id: 'hate_speech', label: 'Hate Speech', icon: '🚫' },
                { id: 'copyright', label: 'Copyright Violation', icon: '©️' },
                { id: 'other', label: 'Other', icon: 'Ⓜ' },
              ].map((category) => (
                <button
                  key={category.id}
                  onClick={() => submitReport(category.id)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    marginBottom: 8,
                    border: `1px solid ${T?.border}`,
                    borderRadius: 8,
                    background: T?.cardBg || '#1A1A1A',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 14,
                    color: T?.txt,
                    transition: 'background 0.2s',
                    pointerEvents: 'auto',
                  }}
                  onMouseEnter={(e) => (e.target.style.background = 'rgba(226,179,85,0.12)')}
                  onMouseLeave={(e) => (e.target.style.background = T?.cardBg || '#1A1A1A')}
                >
                  <span style={{ fontSize: 20 }}>{category.icon}</span>
                  <span style={{ fontWeight: 500 }}>{category.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowReportModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: 12,
                borderRadius: 8,
                border: 'none',
                background: T?.border,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                color: T?.txt,
                pointerEvents: 'auto',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Report Success Modal */}
      {reportSuccessModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            pointerEvents: 'auto',
          }}
          onClick={() => setReportSuccessModal(false)}
        >
          <div
            style={{
              background: T?.cardBg || '#1A1A1A',
              borderRadius: 16,
              padding: '32px',
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              pointerEvents: 'auto',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h3
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: T?.txt,
                marginBottom: 12,
              }}
            >
              Report Submitted
            </h3>
            <p
              style={{
                fontSize: 14,
                color: T?.sub,
                marginBottom: 24,
                lineHeight: 1.6,
              }}
            >
              Thank you for helping keep our community safe. Our team will review this report shortly.
            </p>
            <button
              onClick={() => setReportSuccessModal(false)}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 10,
                border: 'none',
                background: '#10B981',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 600,
                color: '#fff',
                pointerEvents: 'auto',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
      <InsufficientCoinsModal
        visible={showInsufficientCoinsModal}
        onClose={() => setShowInsufficientCoinsModal(false)}
        onBuyCoins={() => {
          setShowInsufficientCoinsModal(false);
          onShowCoinPurchase?.();
        }}
      />
    </>
  );
});

// The TikTok-style desktop viewer replaces the old card feed + suggestions
// rail. Set true to bring the rail back alongside the player.
const SHOW_DESKTOP_SIDEBAR = false;

const ALL_TABS = ['For You', 'Trending', 'Campaigns', 'Leaderboard'];
const MOBILE_TABS = ['For You', 'Trending', 'Campaigns', 'Leaders'];
const TAB_MAPPING = { 'Leaders': 'Leaderboard' };

// Text colour that stays legible on the admin-selected primary fill, which
// ranges from light gold to dark green depending on the active theme.
const onPrimary = (hex) => {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '#0C0C0C';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return '#0C0C0C';
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0C0C0C' : '#FFFFFF';
};

// Persists boost expiry across feed refreshes
const boostEndTimeCache = new Map();

export function HomePage({ user, onShowLeaderboard, onShowProfile, onShowPostPage, onRequireAuth, onShowExplorer, onShowCampaigns, onShowCampaignDetail, onShowVideoDetail, onShowWallet, onShowCoinPurchase, initialPostId, subscriptionStatus, onShowSubscription }) {
  const { colors: T } = useTheme();
  const { filterBlockedUsers, blockedUsers } = useBlock();
  const [activeTab, setActiveTab] = useState('For You');
  // Seed from cache + merge persisted like/save state so the heart stays
  // filled on the very first paint.
  const [posts, setPosts] = useState(() => mergeLocalEngagement(readHomeCache() || []));
  const [loading, setLoading] = useState(() => !readHomeCache());
  const [mounted, setMounted] = useState(() => !!readHomeCache()); // Start mounted if we have cache
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const videoObserverRef = useRef(null);
  // Desktop shows one clip at a time (TikTok style) instead of the card feed.
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerCommentPost, setViewerCommentPost] = useState(null);
  const loaderRef = useRef(null);
  
  // Persistence key for scroll position
  const SCROLL_POS_KEY = 'homepage_scroll_pos';
  
  // Pull to refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMobileSuggestions, setShowMobileSuggestions] = useState(true);
  const [showCampaignSuggestions, setShowCampaignSuggestions] = useState(true);
  const [followStates, setFollowStates] = useState({}); // { userId: boolean }
  const [suggestionTriggerUserId, setSuggestionTriggerUserId] = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showInsufficientCoinsModal, setShowInsufficientCoinsModal] = useState(false);
  const [joinedCampaignIds, setJoinedCampaignIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('joined_campaign_ids') || '[]')); } catch { return new Set(); }
  });
  const touchStartY = useRef(0);
  const containerRef = useRef(null);

  // Fetch joined campaign IDs once for the current user
  useEffect(() => {
    if (!user) return;
    api.request('/campaigns/?limit=100').then(data => {
      const all = Array.isArray(data) ? data : (data.results || []);
      const ids = all.filter(c => c.has_entered).map(c => c.id);
      setJoinedCampaignIds(new Set(ids));
      try { localStorage.setItem('joined_campaign_ids', JSON.stringify(ids)); } catch {}
    }).catch(() => {});
  }, [user?.id]);

  // Prevent flash on initial load, but skip if we already have cached data
  useEffect(() => {
    if (!mounted) {
      const timer = setTimeout(() => setMounted(true), 50);
      return () => clearTimeout(timer);
    }
  }, [mounted]);

  // When the blocked-users set changes (after a block/unblock), refilter the
  // already-loaded feed so blocked users' posts disappear immediately
  // without waiting for the next refresh.
  useEffect(() => {
    setPosts(prev => filterBlockedUsers(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedUsers]);

  // Restore scroll position after mount
  useEffect(() => {
    if (mounted && posts.length > 0) {
      const savedPos = sessionStorage.getItem(SCROLL_POS_KEY);
      if (savedPos) {
        // Use a small delay to ensure content is painted
        setTimeout(() => {
          window.scrollTo({ top: parseInt(savedPos, 10), behavior: 'instant' });
        }, 100);
      }
    }
  }, [mounted, posts.length]);

  // Scroll to specific post when initialPostId is provided
  useEffect(() => {
    if (initialPostId && posts.length > 0) {
      const postIndex = posts.findIndex(p => String(p.id) === String(initialPostId));
      if (postIndex !== -1) {
        // Scroll to the post
        setTimeout(() => {
          const postElement = document.querySelector(`[data-post-id="${initialPostId}"]`);
          if (postElement) {
            postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight the post briefly
            postElement.style.transition = 'box-shadow 0.3s ease';
            postElement.style.boxShadow = '0 0 20px rgba(143, 196, 65, 0.5)';
            setTimeout(() => {
              postElement.style.boxShadow = '';
            }, 2000);
          }
        }, 300);
      } else {
        // Post not found in current list, fetch it
        const fetchSpecificPost = async () => {
          try {
            const post = await api.request(`/reels/${initialPostId}/`);
            if (post) {
              setPosts(prev => [post, ...prev]);
              setTimeout(() => {
                const postElement = document.querySelector(`[data-post-id="${initialPostId}"]`);
                if (postElement) {
                  postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  postElement.style.transition = 'box-shadow 0.3s ease';
                  postElement.style.boxShadow = '0 0 20px rgba(143, 196, 65, 0.5)';
                  setTimeout(() => {
                    postElement.style.boxShadow = '';
                  }, 2000);
                }
              }, 300);
            }
          } catch (error) {
            console.error('Failed to fetch specific post:', error);
          }
        };
        fetchSpecificPost();
      }
    }
  }, [initialPostId, posts.length]);

  // Save scroll position before unmount or periodically
  useEffect(() => {
    const handleScroll = () => {
      // Don't save if we are at the very top (might be a reset)
      if (window.scrollY > 100) {
        sessionStorage.setItem(SCROLL_POS_KEY, window.scrollY.toString());
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const LIMIT = 5; // Load fewer posts initially for faster LCP
  const PULL_THRESHOLD = 80;

  // Create shared IntersectionObserver for all videos
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const video = entry.target;
          if (entry.isIntersecting) {
            video.play().catch((err) => {
              if (err.name !== 'AbortError') console.log('Play error:', err);
            });
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.3, rootMargin: '50px' }
    );
    
    videoObserverRef.current = observer;
    return () => {
      observer.disconnect();
      // disconnect() leaves playback running. Stop every feed video so none
      // survives the unmount still playing (same guard AppLayout uses).
      document.querySelectorAll('video').forEach((v) => {
        try { if (!v.paused) v.pause(); } catch { /* already detached */ }
      });
    };
  }, []);

  // Campaigns are injected after the second post so the feed opens on content,
  // not on a promo block. Short feeds fall back to the last available slot.
  const campaignSlotIndex = Math.min(1, Math.max(0, posts.length - 1));

  // The desktop viewer is a video player, so image posts and the injected
  // campaign/suggestion cards have no slide to live on. Mobile keeps the
  // full mixed feed.
  const videoPosts = useMemo(() => posts.filter(isVideoPost), [posts]);

  const handleTabClick = (tab) => {
    const actualTab = TAB_MAPPING[tab] || tab;
    if (actualTab === 'Trending') { onShowExplorer?.(); return; }
    if (actualTab === 'Campaigns') { onShowCampaigns?.(); return; }
    if (actualTab === 'Leaderboard') { onShowLeaderboard?.(); return; }
    setActiveTab(actualTab);
  };

  const handleSearchUserClick = (user) => {
    setShowSearchModal(false);
    onShowProfile?.(user.id);
  };

  const handleSearchHashtagClick = (hashtag) => {
    setShowSearchModal(false);
    onShowExplorer?.();
  };

  const handleSearchPostClick = (post) => {
    setShowSearchModal(false);
    onShowVideoDetail?.(post.id);
  };

  // Use ref to avoid stale closure on `posts` inside fetchPosts without
  // re-creating the callback (which would trash memoization in child effects).
  const postsRef = useRef(posts);
  useEffect(() => { postsRef.current = posts; }, [posts]);

  const handleFollow = useCallback(async (userId) => {
    try {
      setFollowStates(prev => ({ ...prev, [userId]: true }));
      setSuggestionTriggerUserId(userId);
      await api.toggleFollow(userId);
    } catch (e) {
      console.error('Follow error:', e);
      setFollowStates(prev => ({ ...prev, [userId]: false }));
      setSuggestionTriggerUserId(null);
    }
  }, []);

  const fetchPosts = useCallback(async (offset = 0, reset = false) => {
    try {
      setLoading(true);
      const limit = reset ? LIMIT * 2 : LIMIT;
      const data = await api.request(`/reels/?limit=${limit}&offset=${offset}`);
      const results = Array.isArray(data) ? data : (data.results || []);
      // Merge persisted like/save state so the heart doesn't flip off when
      // the server returns a stale is_liked for a just-liked post.
      const merged = mergeLocalEngagement(results);
      const filtered = filterBlockedUsers(merged);
      // Overlapping pages would otherwise repeat posts in the feed.
      const newPosts = dedupeById(reset ? filtered : [...postsRef.current, ...filtered]);
      setPosts(newPosts);
      if (reset) writeHomeCache(newPosts);
      setHasMore(Array.isArray(data) ? results.length === limit : !!data.next);
      setPage(offset);
    } catch (e) {
      console.error('[HomePage] Fetch error:', e);
      if (reset) {
        const cached = readHomeCache();
        if (cached && cached.length > 0) setPosts(filterBlockedUsers(mergeLocalEngagement(cached)));
      }
    } finally {
      setLoading(false);
    }
  }, [filterBlockedUsers]);

  // Setup real-time listeners for post updates
  useEffect(() => {
    // Listen for new posts from other tabs
    const handleNewPost = (postData) => {
      console.log('HomePage: New post received:', postData);
      // Clear cache and refresh feed to show new post
      try {
        localStorage.removeItem(CACHE_KEY);
        fetchPosts(0, true);
      } catch (error) {
        console.error('Error refreshing HomePage for new post:', error);
      }
    };

    // Listen for feed refresh requests
    const handleFeedRefresh = () => {
      console.log('HomePage: Feed refresh requested');
      // Clear cache and refresh feed
      try {
        localStorage.removeItem(CACHE_KEY);
        fetchPosts(0, true);
      } catch (error) {
        console.error('Error refreshing HomePage feed:', error);
      }
    };

    // Add event listeners
    realtimeService.addEventListener('NEW_POST', handleNewPost);
    realtimeService.addEventListener('FEED_REFRESH', handleFeedRefresh);

    // Cleanup on unmount
    return () => {
      realtimeService.removeEventListener('NEW_POST', handleNewPost);
      realtimeService.removeEventListener('FEED_REFRESH', handleFeedRefresh);
    };
  }, []);

  // Track whether this tab has ever loaded, to avoid redundant re-fetches
  // when the user navigates back to Home from another page.
  const loadedTabsRef = useRef(new Set());

  useEffect(() => {
    if (activeTab === 'Explore' || activeTab === 'Campaigns') return;
    const cached = readHomeCache();
    if (cached && cached.length > 0) {
      setPosts(mergeLocalEngagement(cached));
      setLoading(false);
      // Only refresh in background ONCE per session per tab, not on every
      // remount. api.js request-dedup makes repeat calls cheap, but this
      // avoids kicking off a background fetch when the user just briefly
      // left and came back.
      if (!loadedTabsRef.current.has(activeTab)) {
        loadedTabsRef.current.add(activeTab);
        setTimeout(() => fetchPosts(0, true), 2000);
      }
    } else {
      loadedTabsRef.current.add(activeTab);
      fetchPosts(0, true);
    }
  }, [activeTab, fetchPosts]);

  // ── Scroll to top on mount + tab change ───────────────────────────────────
  // Fixes the bug where Home sometimes opened scrolled to the bottom: if the
  // browser restored a stale scroll position or an infinite-scroll fetch
  // slipped in before paint, we'd land deep in the feed.  Force top.
  useEffect(() => {
    // Run in a microtask so the new posts have painted and the container
    // actually has a scrollHeight to scroll within.
    const snap = () => {
      if (containerRef.current) containerRef.current.scrollTop = 0;
      try { window.scrollTo(0, 0); } catch {}
    };
    snap();
    const t = setTimeout(snap, 50);     // belt-and-braces after paint
    return () => clearTimeout(t);
  }, [activeTab]);

  // Scroll to top + refresh when user taps the already-active home tab icon
  useEffect(() => {
    const handleTabReselect = (e) => {
      if (e.detail?.tab !== 'home') return;
      if (containerRef.current) containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      fetchPosts(0, true);
    };
    window.addEventListener('tabReselected', handleTabReselect);
    return () => window.removeEventListener('tabReselected', handleTabReselect);
  }, [fetchPosts]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchPosts(page + LIMIT, false);
        }
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, page, fetchPosts]);

  // Pull to refresh handlers
  const handleTouchStart = (e) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (isRefreshing || !containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    if (scrollTop === 0 && touchStartY.current > 0) {
      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, currentY - touchStartY.current);
      if (distance > 0) {
        // React's synthetic touchmove listener is passive, so preventDefault
        // would be a no-op and just emit a console warning. Skip it and rely
        // on `overscroll-behavior: contain` to suppress the browser's own
        // pull-to-refresh.
        setPullDistance(Math.min(distance, PULL_THRESHOLD * 1.5));
      }
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      // Clear cache and fetch fresh data
      try {
        localStorage.removeItem('home_feed_cache');
        await fetchPosts(0, true);
      } catch (e) {
        console.error('Refresh error:', e);
      }
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 500);
    } else {
      setPullDistance(0);
    }
    touchStartY.current = 0;
  };

  // Reactive mobile flag so the right sidebar disappears immediately on
  // resize/rotate. The CSS @media rule below is a belt-and-braces guard so
  // the sidebar is hidden on small screens even if JS state is stale.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1024);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: T?.bg || '#0D0D0D' }}>
      <style>{`
        @media (max-width: 1024px) {
          .home-right-sidebar { display: none !important; }
        }
      `}</style>
    <div 
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        flex: 1, minWidth: 0, height: '100vh', overflowX: 'hidden', position: 'relative',
        overscrollBehaviorY: 'contain', touchAction: 'pan-y',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
        // Desktop hands its height to the viewer instead of scrolling.
        ...(isMobile
          ? { overflowY: 'auto' }
          : { overflowY: 'hidden', display: 'flex', flexDirection: 'column' }),
      }}
    >
      <style>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: pullDistance,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(180deg, ${T?.bg || '#0D0D0D'} 0%, transparent 100%)`,
          zIndex: 40,
        }}>
          <div style={{
            width: 32,
            height: 32,
          }} />
        </div>
      )}

      {/* ─── Tab bar: mirrors React Native HomeScreen pill tabs exactly ─── */}
      <div className="home-tab-row" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: T?.bg || '#f5f5f5',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        <style>{`
          .home-tab-row button { margin: 0; }
          /* The viewer below is full-bleed, so the tab row needs its own
             width limit or it stretches across the whole monitor. */
          .home-tab-row { max-width: 680px; margin: 0 auto; width: 100%; }
          .home-tab-track {
            display: flex;
            align-items: center;
            gap: 4px;
            flex: 1;
            min-width: 0;
            padding: 3px;
            border-radius: 12px;
            background: ${T?.cardBg || '#1A1A1A'};
            border: 1px solid ${T?.border || 'rgba(255,255,255,0.07)'};
          }
          .home-tab-row .home-tab {
            flex: 1 1 0;
            min-width: 0;
            max-width: 200px;
            padding: 7px 8px;
            border: none;
            border-radius: 9px;
            background: transparent;
            color: ${T?.sub || '#8A8A8A'};
            font-size: 12px;
            font-weight: 600;
            line-height: 1.25;
            letter-spacing: 0.1px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            transition: background-color .2s ease, color .2s ease;
          }
          .home-tab-row .home-tab:hover {
            color: ${T?.txt || '#EDEDED'};
            background: rgba(255,255,255,0.05);
          }
          .home-tab-row .home-tab.is-active {
            background: ${T?.pri || '#8fc441'};
            color: ${onPrimary(T?.pri || '#8fc441')};
            font-weight: 700;
          }
          .home-tab-row .home-tab:focus-visible {
            outline: 2px solid ${T?.pri || '#8fc441'};
            outline-offset: 2px;
          }
          @media (prefers-reduced-motion: reduce) {
            .home-tab-row .home-tab { transition: none; }
          }
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
        <div className="home-tab-track" role="tablist">
          {(isMobile ? MOBILE_TABS : ALL_TABS).map(tab => {
            const actualTab = TAB_MAPPING[tab] || tab;
            const isActive = activeTab === actualTab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={isActive ? 'home-tab is-active' : 'home-tab'}
                onClick={() => handleTabClick(tab)}
              >
                {tab}
              </button>
            );
          })}
        </div>
        {!isMobile && (
          <button
            onClick={() => setShowSearchModal(true)}
            style={{
              padding: 8,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: T?.txt || '#8fc441',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = (T?.cardBg || '#1A1A1A')}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Search size={20} />
          </button>
        )}
      </div>

      {/* Desktop is a TikTok-style one-clip-at-a-time viewer; mobile keeps the
          scrolling card feed. */}
      {!isMobile ? (
        <DesktopReelViewer
          posts={videoPosts}
          index={Math.min(viewerIndex, Math.max(0, videoPosts.length - 1))}
          onIndexChange={setViewerIndex}
          currentUser={user}
          T={T}
          chromeHeight={52}
          apiBase={config.API_BASE_URL.replace('/api', '')}
          onOpenProfile={(id) => onShowProfile?.(id)}
          commentsOpen={!!viewerCommentPost}
          onOpenComments={(p) => setViewerCommentPost((cur) => (cur && cur.id === p.id ? null : p))}
          onHashtagClick={() => onShowExplorer?.()}
          onFollow={(id) => handleFollow(id)}
          isFollowing={(p) => followStates[p?.user?.id] ?? p?.user?.is_following}
          onNeedMore={() => { if (hasMore && !loading) fetchPosts(page + LIMIT); }}
        />
      ) : (
      /* Feed — tight padding so each post fits fully in the viewport. */
      <div style={{
        maxWidth: 600,
        margin: '0 auto',
        padding: '8px 8px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {loading && posts.length === 0 ? (
          [1,2,3].map(i => (
            <div key={i} style={{
              width: '100%', maxWidth: 560, background: T?.cardBg || '#fff',
              borderRadius: 16, border: `1px solid ${T?.border || '#e0e0e0'}`,
              overflow: 'hidden', marginBottom: window.innerWidth > 768 ? 24 : 16,
            }}>
              <div style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: T?.border || '#e0e0e0' }} />
                <div>
                  <div style={{ width: 100, height: 12, background: T?.border || '#e0e0e0', borderRadius: 6, marginBottom: 6 }} />
                  <div style={{ width: 60, height: 10, background: T?.border || '#e0e0e0', borderRadius: 5 }} />
                </div>
              </div>
              <div style={{ width: '100%', height: 400, aspectRatio: '4/5', background: T?.border || '#e0e0e0' }} />
              <div style={{ padding: 16 }}>
                <div style={{ width: 80, height: 12, background: T?.border || '#e0e0e0', borderRadius: 6, marginBottom: 8 }} />
                <div style={{ width: '70%', height: 10, background: T?.border || '#e0e0e0', borderRadius: 5 }} />
              </div>
            </div>
          ))
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: T?.sub || '#666' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>No posts yet</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>Be the first to share something!</div>
          </div>
        ) : (
          <>
            {posts.map((post, index) => (
              <div key={post.id || index} style={{ width: '100%' }} data-post-id={post.id}>
                <PostCard
                  post={post}
                  index={index}
                  currentUser={user}
                  T={T}
                  onShowProfile={onShowProfile}
                  onRequireAuth={onRequireAuth}
                  onNavigateToReel={onShowVideoDetail}
                  onCommentAdded={() => {}}
                  onVoteAdded={() => {}}
                  onShowVideoDetail={onShowVideoDetail}
                  onHashtagClick={() => onShowExplorer?.()}
                  videoObserver={videoObserverRef.current}
                  onShowWallet={onShowWallet}
                  onShowCoinPurchase={onShowCoinPurchase}
                  onFollow={handleFollow}
                  isFollowing={followStates[post.user?.id] ?? post.user?.is_following}
                  joinedCampaignIds={joinedCampaignIds}
                  subscriptionStatus={subscriptionStatus}
                  onShowSubscription={onShowSubscription}
                />
                {/* Campaigns sit inside the feed rather than above it, and the
                    component renders nothing at all when none are active. */}
                {index === campaignSlotIndex && showCampaignSuggestions && (
                  <HorizontalCampaignSuggestions
                    onCampaignClick={(campaignId) => onShowCampaignDetail?.(campaignId)}
                    onViewAll={onShowCampaigns}
                    onDismiss={() => setShowCampaignSuggestions(false)}
                  />
                )}
                {/* Inject horizontal suggestions after the 3rd post on mobile */}
                {window.innerWidth <= 1024 && index === 2 && showMobileSuggestions && (
                  <HorizontalUserSuggestions
                    onUserClick={onShowProfile}
                    onDismiss={() => setShowMobileSuggestions(false)}
                  />
                )}
                {/* Triggered suggestions after follow */}
                {suggestionTriggerUserId === post.user?.id && (
                  <div style={{ margin: '8px 0 16px' }}>
                    <HorizontalUserSuggestions
                      onUserClick={onShowProfile}
                      onDismiss={() => setSuggestionTriggerUserId(null)}
                    />
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* Infinite scroll loader */}
        <div ref={loaderRef} style={{ height: 40, width: '100%' }} />
        {loading && posts.length > 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: T?.sub || '#666', fontSize: 14 }}>
            Loading more...
          </div>
        )}
        {!hasMore && posts.length > 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: T?.sub || '#666', fontSize: 13 }}>
            You're all caught up ✓
          </div>
        )}
      </div>
      )}
    </div>

    {/* ── Right Sidebar ──
        The desktop viewer is a full-bleed TikTok-style player, which has no
        room for a suggestions rail; mobile never showed one. Suggestions and
        campaigns still reach users through the mobile feed and their own
        pages. Flip this to re-enable the rail beside the viewer. */}
    {SHOW_DESKTOP_SIDEBAR && !isMobile && (
      <div className="home-right-sidebar" style={{
        width: 320,
        minWidth: 320,
        flexShrink: 0,
        height: '100vh',
        overflowY: 'auto',
        borderLeft: `1px solid ${T?.border || '#e0e0e0'}`,
        padding: '20px 16px',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        <div style={{ marginBottom: 24 }}>
          <UserSuggestions
            onUserClick={(u) => {
              if (!user) { onRequireAuth?.(); return; }
              onShowProfile?.(u.id);
            }}
          />
        </div>
        <div style={{ height: 1, background: T?.border || '#e0e0e0', marginBottom: 24 }} />
        <SidebarCampaigns
          onCampaignClick={(campaign) => {
            if (!user) { onRequireAuth?.(); return; }
            // Navigate to campaigns page with the specific campaign ID
            // The CampaignsPage will handle showing the detail
            window.location.hash = `#campaign/${campaign.id}`;
          }}
        />
      </div>
    )}

    {/* Search Modal */}
    {showSearchModal && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
        padding: '0 16px',
      }}
      onClick={() => setShowSearchModal(false)}
      >
        <div
          style={{
            background: T?.cardBg || '#fff',
            borderRadius: 16,
            padding: 20,
            width: '100%',
            maxWidth: 500,
            boxShadow: '0 4px 30px rgba(0,0,0,0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T?.txt }}>Search</h3>
            <button
              onClick={() => setShowSearchModal(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: T?.sub,
              }}
            >
              <X size={20} />
            </button>
          </div>
          <div style={{ width: '100%', overflow: 'hidden' }}>
            <SearchBar
              onUserClick={handleSearchUserClick}
              onHashtagClick={handleSearchHashtagClick}
              onPostClick={handleSearchPostClick}
            />
          </div>
        </div>
      </div>
    )}
    {viewerCommentPost && (
      /* Docked beside the player, the way TikTok opens comments on desktop. */
      <ModernCommentSection
        variant="panel"
        reelId={viewerCommentPost.id}
        user={user}
        onClose={() => setViewerCommentPost(null)}
        onCommentPosted={() => {}}
        onShowProfile={onShowProfile}
        onShowCoinPurchase={onShowCoinPurchase}
        subscriptionStatus={subscriptionStatus}
        onShowSubscription={onShowSubscription}
      />
    )}

    <InsufficientCoinsModal
      visible={showInsufficientCoinsModal}
      onClose={() => setShowInsufficientCoinsModal(false)}
      onBuyCoins={() => {
        setShowInsufficientCoinsModal(false);
        onShowWallet?.();
      }}
    />
    </div>
  );
}

// Add CSS for icon hover and active states
const iconStyles = `
  .hp-action:hover svg {
    fill: #8fc441 !important;
    transition: fill 0.15s ease;
  }
  .hp-action:active svg {
    fill: #8fc441 !important;
    transform: scale(0.9);
    transition: all 0.1s ease;
  }
  .hp-action svg {
    transition: fill 0.15s ease, transform 0.15s ease;
  }
`;

// Inject styles into document
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = iconStyles;
  document.head.appendChild(styleElement);
}

export default HomePage;








