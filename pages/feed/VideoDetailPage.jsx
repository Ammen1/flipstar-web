import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Heart, MessageCircle, Share2, Bookmark, MoreVertical, Volume2, VolumeX } from 'lucide-react';
import api from '../../api';
import config from '../../config';
import { useLegacyT } from '../../contexts/ThemeContext';
import { isMediaReady, isVideoPost } from '../../utils/media';
import { canEngage } from '../../utils/engagementGate';
import { pickImageSource, pickImageWebp, pickVideoSource } from '../../utils/connection';
import { SharePostSheet } from '../../components/feed/SharePostSheet';
import { ModernCommentSection } from '../../components/messaging/ModernCommentSection';
import { commentCountOf } from '../../utils/engagement';
import { MediaProcessingState } from '../../components/common/MediaProcessingState';
import { usePostProcessing } from '../../hooks/usePostProcessing';
import { useFreshMedia, useSteadySrc } from '../../hooks/useFreshMedia';

const absoluteUrl = (url) =>
  !url ? '' : url.startsWith('http') ? url : `${config.API_BASE_URL.replace('/api', '')}${url}`;

// One action in the right-hand rail.
//
// Fixed width and a label slot that keeps its height even when empty: that is
// what puts every icon on the same centre line and keeps the gaps equal
// whether or not an item has a count under it. Without both, the widest item
// (the sound label) set the column width and the unlabelled buttons sat off
// the line.
const RAIL_ICON = 30;

function RailAction({ label, ariaLabel, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        width: 48,
        padding: 0,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {children}
      <span
        style={{
          height: 14,
          lineHeight: '14px',
          fontSize: 12,
          fontWeight: 600,
          color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
        }}
      >
        {label}
      </span>
    </button>
  );
}

export function VideoDetailPage({ reelId, onBack, onShowProfile, user, subscriptionStatus, onShowSubscription }) {
  const T = useLegacyT();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 1024);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth > 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [reel, setReel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  // Only the count lives here: the comments themselves, their replies,
  // likes, reports and the input all belong to ModernCommentSection, which
  // Home and Reels already use. This page used to carry a second, cut-down
  // copy of that -- the one whose input sat under the bottom navigation.
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    loadReel();
  }, [reelId]);

  // The page a new post lands on: its media is usually still being encoded.
  // Shows a placeholder and swaps the media in when the post is READY.
  usePostProcessing(reel, (updated) => {
    setReel((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  });

  // A URL that stops working while the page is open (a signature run out,
  // a file since replaced) is swapped for a current one.
  const { post: live, onMediaError, unavailable } = useFreshMedia(reel, 'post');
  // ...and a clip that is playing keeps its file when the URLs are refreshed.
  const steadyVideoSrc = useSteadySrc(
    videoRef,
    live && isMediaReady(live) && isVideoPost(live) ? absoluteUrl(pickVideoSource(live)) : ''
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !reel?.media) return;

    let cancelled = false;

    const attemptPlayback = async () => {
      try {
        video.currentTime = 0;
        video.defaultMuted = false;
        video.muted = false;
        await video.play();
        if (!cancelled) setAudioEnabled(true);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        video.defaultMuted = true;
        video.muted = true;
        if (!cancelled) setAudioEnabled(false);
        try {
          await video.play();
        } catch (mutedError) {
          if (mutedError?.name !== 'AbortError') {
            console.log('Video autoplay failed:', mutedError);
          }
        }
      }
    };

    if (video.readyState >= 2) {
      attemptPlayback();
      return () => {
        cancelled = true;
      };
    }

    video.addEventListener('loadeddata', attemptPlayback, { once: true });
    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', attemptPlayback);
    };
  }, [reel?.id, reel?.media]);

  const loadReel = async () => {
    try {
      setLoading(true);
      const data = await api.request(`/reels/${reelId}/`);
      setReel(data);
      setLiked(data.is_liked || false);
      setSaved(data.is_saved || false);
      setLikesCount(data.votes || 0);
      setCommentCount(commentCountOf(data));
    } catch (err) {
      console.error('Failed to load reel:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    // Subscription only -- signed out is just one way of not having one.
    // This used to `return` silently when signed out, so the heart simply
    // did nothing and said nothing.
    if (!canEngage(subscriptionStatus)) {
      onShowSubscription?.();
      return;
    }

    // Optimistic UI — fill/unfill the heart immediately
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(!prevLiked);
    setLikesCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    try {
      const res = await api.request(`/reels/${reelId}/vote/`, { method: 'POST' });
      // Reconcile with server truth
      if (res && typeof res.voted === 'boolean') {
        setLiked(res.voted);
        if (typeof res.votes === 'number') setLikesCount(res.votes);
      }
      // Invalidate any cached reels lists so next fetch is fresh
      api.invalidateCache?.('/reels/');
    } catch (err) {
      console.error('Failed to like:', err);
      // Revert on failure
      setLiked(prevLiked);
      setLikesCount(prevCount);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      if (saved) {
        await api.request(`/saved/${reelId}/`, { method: 'DELETE' });
      } else {
        await api.request('/saved/', {
          method: 'POST',
          body: JSON.stringify({ reel: reelId }),
        });
      }
      setSaved(!saved);
    } catch (err) {
      console.error('Failed to save:', err);
    }
  };

  const handleShare = (e) => {
    // The share control sits over the video, whose own click handler toggles
    // playback -- without this, opening the sheet also paused the post.
    e?.stopPropagation?.();

    if (!canEngage(subscriptionStatus)) {
      onShowSubscription?.();
      return;
    }

    // Previously this called navigator.clipboard.writeText directly. That
    // object does not exist outside a secure context, which is every phone
    // opening the site over plain HTTP, so the call threw before the .then()
    // and the button looked dead. Sharing now goes through the sheet, which
    // needs no browser API at all.
    setShowShare(true);
  };

  const handleAudioToggle = async () => {
    const video = videoRef.current;
    if (!video) return;

    const nextAudioEnabled = !audioEnabled;
    setAudioEnabled(nextAudioEnabled);
    video.defaultMuted = !nextAudioEnabled;
    video.muted = !nextAudioEnabled;

    if (video.paused) {
      try {
        await video.play();
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.log('Video play error:', error);
        }
      }
    }
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: '#000', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 1000,
      }}>
        <div style={{ color: '#fff', fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  if (!reel) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: '#000', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}>
        <div style={{ color: '#fff', fontSize: 16, marginBottom: 20 }}>Post not found</div>
        <button
          onClick={onBack}
          style={{
            padding: '12px 24px', background: T.pri, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  const ready = isMediaReady(live);
  const isVideo = isVideoPost(live);
  // The rendition that suits the connection; `media`/`image` when the post
  // has no smaller ones. See utils/connection.js.
  const videoSrc = ready && isVideo ? steadyVideoSrc : '';
  const imageSrc = ready && !isVideo ? absoluteUrl(pickImageSource(live)) : '';
  const imageWebp = ready && !isVideo ? absoluteUrl(pickImageWebp(live)) : '';
  const poster = live.thumbnail ? absoluteUrl(live.thumbnail) : undefined;

  return (
    <div style={{
      position: 'fixed', top: 0, left: isDesktop ? 260 : 0, right: 0, bottom: 0,
      background: '#000', zIndex: 1000, display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center',
        gap: 12, background: 'rgba(0,0,0,0.5)', position: 'absolute',
        top: 0, left: 0, right: 0, zIndex: 10,
      }}>
        <button aria-label="Go back"
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 8, display: 'flex', alignItems: 'center',
          }}
        >
          <ChevronLeft size={24} color="#fff" />
        </button>
        <div
          onClick={() => onShowProfile?.(reel.user.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', flex: 1,
          }}
        >
          <img
            src={reel.user.profile_photo?.startsWith('http') ? reel.user.profile_photo : `${config.API_BASE_URL.replace('/api', '')}${reel.user.profile_photo}` || '/default-avatar.png'}
            alt={reel.user.username}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              objectFit: 'cover', border: '2px solid #fff',
            }}
          />
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>
            {reel.user.username}
          </div>
        </div>
      </div>

      {/* Media */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', position: 'relative',
      }}>
        {!ready ? (
          <MediaProcessingState post={live} />
        ) : unavailable ? (
          <div
            data-media-unavailable
            role="status"
            style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'center', padding: 24, fontSize: 15, lineHeight: 1.5 }}
          >
            {isVideo ? 'This video can’t be played right now.' : 'This photo can’t be shown right now.'}
          </div>
        ) : isVideo ? (
          <video
            ref={videoRef}
            src={videoSrc}
            poster={poster}
            style={{
              width: '100%', height: '100%', objectFit: 'contain',
            }}
            controls
            autoPlay
            loop
            playsInline
            onError={onMediaError}
          />
        ) : (
          <picture style={{ display: 'contents' }}>
            {imageWebp && <source srcSet={imageWebp} type="image/webp" />}
            <img
              src={imageSrc}
              alt="Post"
              style={{
                width: '100%', height: '100%', objectFit: 'contain',
              }}
              onError={onMediaError}
            />
          </picture>
        )}

        {/* Action rail. One column, one centre line: see RailAction. Sits
            clear of the bottom navigation so the last icon stays tappable. */}
        <div
          style={{
            position: 'absolute',
            right: 8,
            bottom: 96,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
          }}
        >
          {isVideo && (
            <RailAction
              ariaLabel="Toggle sound"
              label={audioEnabled ? 'On' : 'Off'}
              onClick={handleAudioToggle}
            >
              {audioEnabled ? (
                <Volume2 size={RAIL_ICON} color="#fff" />
              ) : (
                <VolumeX size={RAIL_ICON} color="#fff" />
              )}
            </RailAction>
          )}

          <RailAction
            ariaLabel={liked ? 'Unlike' : 'Like'}
            label={likesCount ? String(likesCount) : ''}
            onClick={handleLike}
          >
            <Heart
              size={RAIL_ICON}
              color={liked ? '#EF4444' : '#fff'}
              fill={liked ? '#EF4444' : 'none'}
            />
          </RailAction>

          <RailAction
            ariaLabel="Comments"
            label={commentCount ? String(commentCount) : ''}
            onClick={() => {
              if (!canEngage(subscriptionStatus)) {
                onShowSubscription?.();
                return;
              }
              setShowComments(!showComments);
            }}
          >
            <MessageCircle size={RAIL_ICON} color="#fff" />
          </RailAction>

          <RailAction
            ariaLabel={saved ? 'Saved' : 'Save'}
            label={saved ? 'Saved' : 'Save'}
            onClick={handleSave}
          >
            <Bookmark
              size={RAIL_ICON}
              color={saved ? T.pri : '#fff'}
              fill={saved ? T.pri : 'none'}
            />
          </RailAction>

          <RailAction ariaLabel="Share" label="Share" onClick={handleShare}>
            <Share2 size={RAIL_ICON} color="#fff" />
          </RailAction>
        </div>
      </div>

      {/* Caption */}
      {reel.caption && (
        <div style={{
          padding: '12px 16px', background: 'rgba(0,0,0,0.7)',
          color: '#fff', fontSize: 14, lineHeight: 1.5,
        }}>
          <span style={{ fontWeight: 600 }}>{reel.user.username}</span> {reel.caption}
        </div>
      )}

      {/* Comments: the same sheet Home and Reels open. It is portalled to
          <body>, so it sits above the bottom navigation instead of behind
          it, and it is sized from the visual viewport so the input stays
          above the keyboard. Closing it leaves this page exactly as it was. */}
      {showComments && (
        <ModernCommentSection
          reelId={reelId}
          user={user}
          variant={isDesktop ? 'panel' : 'sheet'}
          onClose={() => setShowComments(false)}
          onCommentPosted={() => setCommentCount((n) => n + 1)}
          onShowProfile={onShowProfile}
          onRequireAuth={() => setShowComments(false)}
          subscriptionStatus={subscriptionStatus}
          onShowSubscription={onShowSubscription}
        />
      )}

      {/* Rendered at the root of the page, outside the media stack, so the
          overlay cannot inherit the video's click handling. */}
      <SharePostSheet
        post={reel}
        currentUser={user}
        open={showShare}
        onClose={() => setShowShare(false)}
        onShared={({ shares }) => {
          // The server counts one share per action regardless of how many
          // recipients were chosen, so its number is taken as given rather
          // than incremented locally.
          if (typeof shares === 'number') {
            setReel((prev) => (prev ? { ...prev, shares } : prev));
          }
        }}
        T={T}
      />
    </div>
  );
}




