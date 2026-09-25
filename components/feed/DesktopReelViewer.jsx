import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Heart, MessageCircle, Bookmark, Share2, Plus,
  ChevronUp, ChevronDown, Volume2, VolumeX, Play,
} from 'lucide-react';
import { canEngage } from '../../utils/engagementGate';
import api from '../../api';
import { PostCaptionOverlay } from './PostCaptionOverlay';
import { isVideoUrl, isVideoPost } from '../../utils/media';
import { pickImageSource, pickVideoSource } from '../../utils/connection';
import { likeCountOf, commentCountOf, shareCountOf, formatCount } from '../../utils/engagement';
import { SharePostSheet } from './SharePostSheet';
import { useFreshMedia, useSteadySrc } from '../../hooks/useFreshMedia';

/**
 * TikTok-style desktop viewer: one full-height 9:16 clip at a time, with the
 * action rail *outside* the player on the right and chevron navigation beyond
 * it. Shared by Home and Reels on wide screens so the two cannot drift apart.
 *
 * Both hosts already own their own comment UI, so this takes an
 * `onOpenComments` callback rather than embedding one. Like / save / share hit
 * the same endpoints every other call site uses and update optimistically.
 */

const WHEEL_COOLDOWN_MS = 420;

function mediaSrcOf(post, apiBase) {
  // The rendition that suits the connection (utils/connection.js), else the
  // primary file.
  const picked = isVideoPost(post) ? pickVideoSource(post) : pickImageSource(post);
  const raw = picked || post?.media || post?.image || '';
  if (!raw) return '';
  return raw.startsWith('http') ? raw : `${apiBase}${raw}`;
}

export function DesktopReelViewer({
  posts = [],
  index = 0,
  onIndexChange,
  currentUser,
  T = {},
  onOpenProfile,
  onOpenComments,
  onHashtagClick,
  onFollow,
  isFollowing,
  onNeedMore,
  apiBase = '',
  // Pixels of host chrome above the viewer (e.g. Home's tab row), subtracted
  // from the viewport when sizing the player.
  chromeHeight = 0,
  // When the comments panel is docked, the stage shifts left so the video is
  // never hidden behind it.
  commentsOpen = false,
  // Liking is subscriber-only. This viewer was the one engagement surface
  // that never checked: it optimistically filled the heart, the server
  // refused with 403, and the rollback left it empty with nothing said. The
  // other surfaces all go through canEngage; so does this one now.
  subscriptionStatus,
  onShowSubscription,
}) {
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  // Optimistic engagement, keyed by post id so it survives index changes.
  const [engagement, setEngagement] = useState({});

  const [dragY, setDragY] = useState(0);
  // Playback stalls on a weak connection are normal with byte-serving --
  // show that something is happening rather than a frozen frame.
  const [buffering, setBuffering] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const suppressTap = useRef(false);

  // Exactly one <video> is mounted at a time, so hold that one element
  // directly. Keying a map by post id collided whenever two slides shared an
  // id — the outgoing ref cleanup wiped the incoming entry and the old clip
  // was left playing underneath the new one.
  const videoEl = useRef(null);
  const wheelLock = useRef(0);
  const rootRef = useRef(null);

  const pri = T.pri || '#8fc441';
  const count = posts.length;
  const post = posts[index] || null;
  const postId = post?.id;

  const eng = (p) => {
    const local = engagement[p?.id] || {};
    return {
      liked: local.liked ?? Boolean(p?.is_liked),
      saved: local.saved ?? Boolean(p?.is_saved),
      likes: local.likes ?? likeCountOf(p),
      comments: commentCountOf(p),
      shares: local.shares ?? shareCountOf(p),
    };
  };

  const current = eng(post);

  // ── navigation ──────────────────────────────────────────────────────────

  const go = useCallback((delta) => {
    if (!count) return;
    const next = Math.min(count - 1, Math.max(0, index + delta));
    if (next !== index) {
      onIndexChange?.(next);
      setProgress(0);
      setPaused(false);
    }
    // Ask the host for more once the tail is in sight.
    if (next >= count - 2) onNeedMore?.();
  }, [count, index, onIndexChange, onNeedMore]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === ' ') { e.preventDefault(); setPaused((v) => !v); }
      else if (e.key.toLowerCase() === 'm') setMuted((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Drag / swipe. Wheel only covers a mouse or trackpad; a touchscreen laptop
  // or a click-and-drag has to move between clips too.
  const drag = useRef({ id: null, startY: 0, dy: 0, moved: false });

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: e.pointerId, startY: e.clientY, dy: 0, moved: false };
    setDragY(0);
  }, []);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    d.dy = e.clientY - d.startY;
    if (Math.abs(d.dy) > 10) d.moved = true;
    // Rubber-band the player a little so the gesture feels connected.
    if (d.moved) setDragY(Math.max(-120, Math.min(120, d.dy * 0.35)));
  }, []);

  const endDrag = useCallback((e) => {
    const d = drag.current;
    if (d.id !== e.pointerId) return;
    const { dy, moved } = d;
    drag.current = { id: null, startY: 0, dy: 0, moved: false };
    setDragY(0);
    if (!moved) return;
    // A real drag must not also register as a tap-to-pause.
    suppressTap.current = true;
    setTimeout(() => { suppressTap.current = false; }, 0);
    if (Math.abs(dy) > 60) go(dy < 0 ? 1 : -1);
  }, [go]);

  const onWheel = useCallback((e) => {
    // One clip per gesture; trackpads emit a long tail of small deltas.
    const now = Date.now();
    if (now < wheelLock.current) return;
    if (Math.abs(e.deltaY) < 12) return;
    wheelLock.current = now + WHEEL_COOLDOWN_MS;
    go(e.deltaY > 0 ? 1 : -1);
  }, [go]);

  // ── playback ────────────────────────────────────────────────────────────

  // A URL that stops working (a signature run out, a file since replaced) is
  // reported and swapped for a current one before "didn't load" is shown;
  // a clip that is playing keeps its file when the URLs are refreshed.
  const { post: live, onMediaError } = useFreshMedia(post, 'desktop-reels');
  const mediaSrc = useSteadySrc(videoEl, live ? mediaSrcOf(live, apiBase) : '');
  const onLoadFailed = (e) => {
    setBuffering(true);
    onMediaError(e).then((ok) => {
      if (!ok) {
        setBuffering(false);
        setLoadError(true);
      }
    });
  };

  // Image posts render a still in the same slot; the playback chrome below is
  // hidden for them because none of it applies to an image.
  const isVideo = isVideoPost(live || post);

  // Only the visible clip may play; everything else is paused and rewound so
  // no audio survives off-screen.
  useEffect(() => {
    const v = videoEl.current;
    // Belt and braces: silence every other <video> this viewer owns, whatever
    // React is mid-way through reconciling.
    if (rootRef.current) {
      rootRef.current.querySelectorAll('video').forEach((el) => {
        if (el === v) return;
        try { el.pause(); el.currentTime = 0; } catch { /* detached */ }
      });
    }
    if (!v) return;
    v.muted = muted;
    if (paused) { try { v.pause(); } catch { /* detached */ } return; }
    const p = v.play();
    if (p && p.catch) p.catch((err) => { if (err.name !== 'AbortError') console.log('Play error:', err); });
  }, [postId, index, muted, paused]);

  // Stop everything when the viewer unmounts — a detached <video> keeps its
  // audio running until GC.
  useEffect(() => {
    const root = rootRef.current;
    return () => {
      const el = videoEl.current;
      if (el) { try { el.pause(); } catch { /* detached */ } }
      if (root) root.querySelectorAll('video').forEach((v) => {
        try { v.pause(); } catch { /* detached */ }
      });
      videoEl.current = null;
    };
  }, []);

  // ── actions ─────────────────────────────────────────────────────────────

  const patch = (id, next) => setEngagement((m) => ({ ...m, [id]: { ...(m[id] || {}), ...next } }));

  const handleLike = async () => {
    if (!post) return;
    // Asked before the optimistic update, so a refusal never shows as a
    // like that then quietly undoes itself.
    if (!canEngage(subscriptionStatus)) {
      onShowSubscription?.();
      return;
    }
    const { liked, likes } = eng(post);
    patch(post.id, { liked: !liked, likes: likes + (liked ? -1 : 1) });
    try {
      await api.request(`/reels/${post.id}/vote/`, { method: 'POST' });
    } catch (err) {
      console.error('Like failed:', err);
      patch(post.id, { liked, likes });
    }
  };

  const handleSave = async () => {
    if (!post) return;
    const { saved } = eng(post);
    patch(post.id, { saved: !saved });
    try {
      await api.request(`/reels/${post.id}/save/`, { method: 'POST' });
    } catch (err) {
      console.error('Save failed:', err);
      patch(post.id, { saved });
    }
  };

  const handleShare = (e) => {
    // The rail sits over the player, which toggles playback on click.
    e?.stopPropagation?.();
    if (!post) return;

    // This used to hand off to navigator.share, falling back to the clipboard.
    // Both are external-only -- neither could send a post to another user on
    // FlipStar, which is what Share is for here. The count is no longer
    // incremented optimistically either: the server owns it, and it moves once
    // per action however many recipients are picked.
    setShowShare(true);
  };

  const author = post?.user || {};
  const following = isFollowing ? isFollowing(post) : Boolean(author.is_following);
  const isOwn = currentUser && author.id === currentUser.id;

  const css = `
    /* Height is driven by the viewport minus whatever chrome the host keeps
       above the viewer, and additionally bounded by the width left over after
       the sidebar and the rail — so the 9:16 box never overflows sideways on a
       short-and-wide window. */
    .drv-root{
      flex:1 1 auto; min-width:0; min-height:0; position:relative;
      display:flex; align-items:center; justify-content:center;
      background:${T.bg || '#0D0D0D'}; overflow:hidden;
      --drv-pane: ${commentsOpen ? 'min(400px, 38vw)' : '0px'};
      padding-right: var(--drv-pane);
      transition: padding-right .24s cubic-bezier(.2,.8,.3,1);
      --drv-h: min(
        calc(100dvh - ${Number(chromeHeight) || 0}px - 24px),
        calc((100vw - 560px - ${commentsOpen ? 400 : 0}px) * 16 / 9)
      );
    }
    .drv-stage{ display:flex; align-items:flex-end; gap:20px; }

    .drv-player{
      position:relative; flex-shrink:0;
      height:var(--drv-h); width:calc(var(--drv-h) * 9 / 16);
      border-radius:10px; overflow:hidden; background:#000;
      touch-action:none; -webkit-user-select:none; user-select:none;
      box-shadow:0 18px 50px rgba(0,0,0,.5);
    }
    .drv-video{ width:100%; height:100%; object-fit:contain; display:block; background:#000; }
    .drv-buffering{ position:absolute; inset:0; display:grid; place-items:center; pointer-events:none; }
    .drv-spinner{
      width:38px; height:38px; border-radius:50%;
      border:3px solid rgba(255,255,255,0.22); border-top-color:#fff;
      animation: drv-spin 0.8s linear infinite;
    }
    @keyframes drv-spin{ to{ transform: rotate(360deg); } }
    .drv-error{
      position:absolute; inset:0; display:flex; flex-direction:column;
      align-items:center; justify-content:center; gap:12px;
      background:rgba(0,0,0,0.72); color:#fff; font-size:14px; text-align:center; padding:20px;
    }
    .drv-error button{
      min-height:40px; padding:0 18px; border-radius:10px; border:none;
      background:#8fc441; color:#0B1207; font-size:14px; font-weight:800; cursor:pointer;
    }
    .drv-tap{ position:absolute; inset:0; cursor:pointer; }

    .drv-playicon{
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      pointer-events:none;
    }
    .drv-playicon span{
      width:64px; height:64px; border-radius:50%; display:grid; place-items:center;
      background:rgba(0,0,0,.45); backdrop-filter:blur(4px);
    }

    .drv-mute{
      position:absolute; top:12px; right:12px; z-index:4;
      width:38px; height:38px; border-radius:50%; border:none; cursor:pointer;
      display:grid; place-items:center; color:#fff;
      background:rgba(0,0,0,.45); backdrop-filter:blur(6px);
    }
    .drv-mute:hover{ background:rgba(0,0,0,.65); }

    .drv-caption{
      position:absolute; left:0; right:0; bottom:0; z-index:3;
      padding:44px 16px 22px;
      background:linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.38) 52%, transparent 100%);
      pointer-events:none;
    }
    /* The scrim above already separates the caption from the picture, so the
       shared overlay's glass panel would be a second background on top of a
       background. Flatten it here and lean on a text shadow instead. */
    .drv-caption .pco-panel{
      background:none; backdrop-filter:none; -webkit-backdrop-filter:none;
      border:none; box-shadow:none; padding:0;
    }
    .drv-caption .pco-text, .drv-caption .pco-name, .drv-caption .pco-time{
      text-shadow:0 1px 3px rgba(0,0,0,.65);
    }

    .drv-progress{
      position:absolute; left:0; right:0; bottom:0; height:3px; z-index:5;
      background:rgba(255,255,255,.22);
    }
    .drv-progress i{ display:block; height:100%; background:${pri}; transition:width .12s linear; }

    /* Action rail — outside the player, TikTok desktop style */
    .drv-rail{ display:flex; flex-direction:column; align-items:center; gap:16px; padding-bottom:6px; }
    .drv-avatar{
      position:relative; width:48px; height:48px; border-radius:50%; margin-bottom:8px;
      border:none; padding:0; cursor:pointer; background:rgba(255,255,255,.1); overflow:visible;
    }
    .drv-avatar img{ width:100%; height:100%; border-radius:50%; object-fit:cover; display:block; }
    .drv-avatar .drv-ph{ width:100%; height:100%; border-radius:50%; display:grid; place-items:center;
      background:${pri}; color:#0B1207; font-weight:800; font-size:18px; }
    .drv-follow{
      position:absolute; left:50%; bottom:-9px; transform:translateX(-50%);
      width:20px; height:20px; border-radius:50%; border:none; cursor:pointer;
      display:grid; place-items:center; background:#FE2C55; color:#fff;
    }
    .drv-act{
      display:flex; flex-direction:column; align-items:center; gap:5px;
      background:none; border:none; cursor:pointer; padding:0; color:${T.txt || '#fff'};
    }
    .drv-act i{
      width:48px; height:48px; border-radius:50%; display:grid; place-items:center;
      background:rgba(255,255,255,.12); transition:background .18s ease, transform .14s ease;
    }
    .drv-act:hover i{ background:rgba(255,255,255,.2); }
    .drv-act:active i{ transform:scale(.92); }
    .drv-act b{ font-size:12px; font-weight:700; letter-spacing:.2px; }
    .drv-act.on i{ background:rgba(254,44,85,.18); }

    /* Up / down navigation, beyond the rail */
    .drv-nav{
      position:absolute; right:calc(28px + var(--drv-pane)); top:50%; transform:translateY(-50%);
      display:flex; flex-direction:column; gap:12px;
    }
    .drv-nav button{
      width:44px; height:44px; border-radius:50%; border:none; cursor:pointer;
      display:grid; place-items:center; color:${T.txt || '#fff'};
      background:rgba(255,255,255,.12); transition:background .18s ease;
    }
    .drv-nav button:hover:not(:disabled){ background:rgba(255,255,255,.22); }
    .drv-nav button:disabled{ opacity:.32; cursor:default; }

    .drv-empty{ color:${T.sub || '#8A8A8A'}; font-size:15px; text-align:center; padding:40px; }

    @media (prefers-reduced-motion: reduce){
      .drv-act i, .drv-nav button, .drv-progress i{ transition:none; }
    }
  `;

  if (!count) {
    return (
      <div className="drv-root" ref={rootRef}>
        <style>{css}</style>
        <div className="drv-empty">No videos to show yet.</div>
      </div>
    );
  }

  return (
    <div className="drv-root" ref={rootRef} onWheel={onWheel}>
      <style>{css}</style>

      <div className="drv-stage">
        {/* Player */}
        <div
          className="drv-player"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: dragY ? "none" : "transform .22s cubic-bezier(.2,.8,.3,1)",
          }}
        >
          {isVideo ? (
          <video
            key={`${index}-${post.id}-${retryKey}`}
            ref={(el) => { videoEl.current = el; }}
            className="drv-video"
            src={mediaSrc}
            /* The backend generates a 320x720 thumbnail per reel
               (api/tasks/media.py). Prefer it over post.image: that is the
               full-size still, so using it as a poster downloads a 1080px
               image to cover the first moment of playback. */
            poster={
              live.thumbnail
                ? mediaSrcOf({ media: live.thumbnail }, apiBase)
                : live.image && !isVideoUrl(live.image)
                  ? mediaSrcOf({ media: live.image }, apiBase)
                  : undefined
            }
            playsInline
            loop
            muted={muted}
            // Fetch the header and enough to start, not the whole clip: the
            // server byte-serves, so the rest arrives as it plays.
            preload="metadata"
            onLoadStart={() => { setBuffering(true); setLoadError(false); }}
            onWaiting={() => setBuffering(true)}
            onStalled={() => setBuffering(true)}
            onCanPlay={() => setBuffering(false)}
            onPlaying={() => { setBuffering(false); setLoadError(false); }}
            onError={onLoadFailed}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress((v.currentTime / v.duration) * 100);
            }}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          />
          ) : (
            /*
              Image posts.

              The desktop viewer used to be handed a video-only list, so an
              image post simply had no slide and desktop showed a different,
              shorter feed than mobile. It renders in the same slot with the
              same object-fit, so the layout is identical either way; only the
              playback chrome below is hidden, because none of it applies.
            */
            <img
              key={`${index}-${post.id}-${retryKey}`}
              className="drv-video"
              src={mediaSrc}
              alt={post.caption || ''}
              draggable={false}
              onLoadStart={() => { setBuffering(true); setLoadError(false); }}
              onLoad={() => { setBuffering(false); setLoadError(false); }}
              onError={onLoadFailed}
            />
          )}

          {buffering && !loadError && (
            <div className="drv-buffering" role="status" aria-live="polite">
              <span className="drv-spinner" />
            </div>
          )}

          {loadError && (
            <div className="drv-error" role="alert">
              <div>{isVideo ? "This video didn't load." : "This image didn't load."}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // Remounting the element restarts the request from scratch,
                  // which is what a transient network failure needs.
                  setLoadError(false);
                  setBuffering(true);
                  setRetryKey((k) => k + 1);
                }}
              >
                Try again
              </button>
            </div>
          )}

          {isVideo && (
            <div
              className="drv-tap"
              onClick={() => { if (!suppressTap.current) setPaused((v) => !v); }}
            />
          )}

          {isVideo && paused && (
            <div className="drv-playicon">
              <span><Play size={26} fill="#fff" color="#fff" style={{ marginLeft: 3 }} /></span>
            </div>
          )}

          {isVideo && (
          <button
            className="drv-mute"
            type="button"
            onClick={() => setMuted((v) => !v)}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          )}

          <div className="drv-caption">
            <PostCaptionOverlay
              post={post}
              onOpenProfile={onOpenProfile}
              onHashtagClick={onHashtagClick}
              onMentionClick={onHashtagClick}
            />
          </div>

          {isVideo && (
            <div className="drv-progress"><i style={{ width: `${progress}%` }} /></div>
          )}
        </div>

        {/* Action rail */}
        <div className="drv-rail">
          <button
            className="drv-avatar"
            type="button"
            onClick={() => onOpenProfile?.(author.id)}
            aria-label={author.username ? `Open ${author.username}'s profile` : 'Open profile'}
          >
            {author.profile_photo
              ? <img src={mediaSrcOf({ media: author.profile_photo }, apiBase)} alt="" />
              : <span className="drv-ph">{(author.username || '?').charAt(0).toUpperCase()}</span>}
            {!isOwn && !following && (
              <span
                className="drv-follow"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onFollow?.(author.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onFollow?.(author.id); } }}
              >
                <Plus size={13} strokeWidth={3} />
              </span>
            )}
          </button>

          <button
            className={current.liked ? 'drv-act on' : 'drv-act'}
            type="button"
            onClick={handleLike}
            aria-pressed={current.liked}
            aria-label="Like"
          >
            <i><Heart size={24} fill={current.liked ? '#FE2C55' : 'none'} color={current.liked ? '#FE2C55' : '#fff'} /></i>
            <b>{formatCount(current.likes)}</b>
          </button>

          <button className="drv-act" type="button" onClick={() => onOpenComments?.(post)} aria-label="Comments">
            <i><MessageCircle size={24} color="#fff" /></i>
            <b>{formatCount(current.comments)}</b>
          </button>

          <button
            className={current.saved ? 'drv-act on' : 'drv-act'}
            type="button"
            onClick={handleSave}
            aria-pressed={current.saved}
            aria-label="Save"
          >
            <i><Bookmark size={23} fill={current.saved ? pri : 'none'} color={current.saved ? pri : '#fff'} /></i>
            <b>Save</b>
          </button>

          <button className="drv-act" type="button" onClick={handleShare} aria-label="Share">
            <i><Share2 size={22} color="#fff" /></i>
            <b>{formatCount(current.shares)}</b>
          </button>
        </div>
      </div>

      {/* Up / down */}
      <div className="drv-nav">
        <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous video">
          <ChevronUp size={22} />
        </button>
        <button type="button" onClick={() => go(1)} disabled={index >= count - 1} aria-label="Next video">
          <ChevronDown size={22} />
        </button>
      </div>

      <SharePostSheet
        post={post}
        currentUser={currentUser}
        open={showShare}
        onClose={() => setShowShare(false)}
        onShared={({ shares }) => {
          if (typeof shares === 'number' && post) patch(post.id, { shares });
        }}
        T={T}
      />
    </div>
  );
}
