import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X, Heart, MessageCircle, Share2, Bookmark, ChevronLeft, ChevronRight, Link2,
  Volume2, VolumeX, Maximize, Minimize, ImageOff, Loader,
} from 'lucide-react';
import api from '../../api';
import config from '../../config';

import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { PostCaptionOverlay } from './PostCaptionOverlay';
import { isVideoUrl } from '../../utils/media';

const MEDIA_ROOT = config.API_BASE_URL.replace('/api', '');

function absolute(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${MEDIA_ROOT}${url}`;
}

function looksLikeVideo(url) {
  if (!url) return false;
  return isVideoUrl(url);
}

/**
 * Media attached to a post, normalised to a list.
 *
 * Posts currently carry a single file (`media`/`image`), so this returns one
 * entry. Array fields are read when present so that if the API ever serves
 * several files per post, the viewer's counter, arrows and swipe light up
 * without further changes — the caption stays bound to the post either way.
 */
function getPostMedia(post) {
  if (!post) return [];
  const list = post.media_items || post.media_urls || post.images;
  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((item) => (typeof item === 'string' ? item : (item?.media || item?.url || item?.image)))
      .filter(Boolean)
      .map((url) => ({ url: absolute(url), isVideo: looksLikeVideo(url) }));
  }
  const single = post.media || post.image || '';
  if (!single) return [];
  return [{ url: absolute(single), isVideo: looksLikeVideo(single) }];
}

// Reel-style scrollable post detail for ProfilePage
export function ReelPostViewer({ posts, initialIndex, user, profileUser, onClose, onDeletePost, onEditPost, isOwnProfile, onNavigate, onShowProfile, onHashtagClick, onMentionClick }) {
  const { colors: T } = useTheme();
  const { t } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [shareToast, setShareToast] = useState('');
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [mediaState, setMediaState] = useState('loading'); // loading | ready | error
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  const currentPost = posts[currentIndex];
  const hasNext = currentIndex < posts.length - 1;
  const hasPrev = currentIndex > 0;

  const mediaList = useMemo(() => getPostMedia(currentPost), [currentPost]);
  const activeMedia = mediaList[Math.min(mediaIndex, Math.max(0, mediaList.length - 1))] || null;
  const isVideo = Boolean(activeMedia?.isVideo);
  const fullUrl = activeMedia?.url || '';
  const videoUrl = fullUrl;
  const multiMedia = mediaList.length > 1;

  // Moving to another post restarts its media; the caption panel re-keys off
  // the post id so it never carries state across posts.
  useEffect(() => {
    setMediaIndex(0);
  }, [currentPost?.id]);

  useEffect(() => {
    setMediaState(fullUrl ? 'loading' : 'error');
  }, [fullUrl]);

  const goToMedia = useCallback((next) => {
    if (mediaList.length < 2) return;
    setMediaIndex((prev) => {
      const n = mediaList.length;
      return ((next(prev) % n) + n) % n;
    });
  }, [mediaList.length]);

  // Auto-play video when changing posts
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    }
  }, [currentIndex, isPlaying]);

  // Sync like state with current post
  useEffect(() => {
    if (currentPost) {
      setLiked(currentPost.is_liked || false);
      setLikeCount(currentPost.votes || 0);
    }
  }, [currentPost]);

  const handleLike = () => {
    setLiked(!liked);
    setLikeCount(prev => liked ? prev - 1 : prev + 1);
  };

  const handleComment = () => {
    setShowComments(true);
  };

  const handleShare = async () => {
    if (!currentPost) return;
    const url = `${window.location.origin}/post/${currentPost.id}`;
    const title = currentPost.caption ? currentPost.caption.slice(0, 80) : 'Check out this post on FlipStar';
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        try { await api.request(`/reels/${currentPost.id}/share/`, { method: 'POST' }); } catch {}
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareToast('🔗 Link copied!');
      setTimeout(() => setShareToast(''), 1800);
      try { await api.request(`/reels/${currentPost.id}/share/`, { method: 'POST' }); } catch {}
    } catch {
      setShareToast('Could not copy');
      setTimeout(() => setShareToast(''), 1800);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, posts.length]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      setCurrentIndex(prev => prev + 1);
      onNavigate?.(currentIndex + 1);
    }
  }, [hasNext, currentIndex, onNavigate]);

  const goToPrev = useCallback(() => {
    if (hasPrev) {
      setCurrentIndex(prev => prev - 1);
      onNavigate?.(currentIndex - 1);
    }
  }, [hasPrev, currentIndex, onNavigate]);

  // Touch/swipe handling - only vertical
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    const diffY = touchStartY.current - e.changedTouches[0].clientY;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;

    // Horizontal swipe moves through this post's media (when it has several);
    // vertical swipe still moves between posts.
    if (multiMedia && Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      goToMedia((i) => (diffX > 0 ? i + 1 : i - 1));
      return;
    }
    if (Math.abs(diffX) < 30 && Math.abs(diffY) > 50) {
      if (diffY > 0) goToNext();
      else goToPrev();
    }
  };

  // Block horizontal panning unless this post actually has media to swipe through
  const handleTouchMove = (e) => {
    if (multiMedia) return;
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = Math.abs(touchX - touchStartX.current);
    const diffY = Math.abs(touchY - touchStartY.current);

    if (diffX > diffY && diffX > 10) {
      e.preventDefault();
    }
  };

  // Wheel/scroll handling - using useEffect to add non-passive listener
  const wheelTimeout = useRef(null);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleWheel = (e) => {
      e.preventDefault();
      if (wheelTimeout.current) return;
      
      wheelTimeout.current = setTimeout(() => {
        wheelTimeout.current = null;
      }, 300);

      if (e.deltaY > 0) goToNext();
      else goToPrev();
    };
    
    // Add listener with passive: false to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [goToNext, goToPrev]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch (_) {
      // Fullscreen is best-effort; iOS Safari rejects it on non-video elements.
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, fullUrl]);

  const handleVideoClick = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch((err) => {
          if (err.name !== 'AbortError') console.log('Play error:', err);
        });
        setIsPlaying(true);
      }
    }
  };

  if (!currentPost) return null;

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#000',
        zIndex: 1000,
        display: 'flex',
        overflow: 'hidden',
        touchAction: 'pan-y',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <style>{`
        @keyframes fadeOut {
          0% { opacity: 1; }
          70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .slide-in {
          animation: slideIn 0.3s ease-out;
        }
        @keyframes rpvSpin { to { transform: rotate(360deg); } }
        .rpv-spin { animation: rpvSpin 0.9s linear infinite; }
        .rpv-ctl {
          width: 32px; height: 32px; border-radius: 50%; border: none; padding: 0;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); color: #fff;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .rpv-ctl:hover { background: rgba(0,0,0,0.72); }
        .rpv-arrow {
          position: absolute; top: 50%; transform: translateY(-50%); z-index: 60;
          width: 38px; height: 38px; border-radius: 50%; border: none; padding: 0;
          background: rgba(0,0,0,0.48); backdrop-filter: blur(10px); color: #fff;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .rpv-arrow:hover { background: rgba(0,0,0,0.7); }
        @media (prefers-reduced-motion: reduce) {
          .slide-in { animation: none; }
        }
      `}</style>

      {/* Close Button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 100,
          width: 32,
          height: 32,
          minWidth: 32,
          minHeight: 32,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.5)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          backdropFilter: 'blur(10px)',
          padding: 0,
        }}
      >
        <X size={18} />
      </button>

      {/* Progress Indicator */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        padding: '4px 10px',
        borderRadius: 14,
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
      }}>
        {multiMedia
          ? `${mediaIndex + 1} / ${mediaList.length}`
          : `${currentIndex + 1} / ${posts.length}`}
      </div>

      {/* Video controls — kept clear of the caption panel below */}
      {isVideo && mediaState !== 'error' && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 100,
          display: 'flex', gap: 8, transform: 'translateY(40px)',
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="rpv-ctl"
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="rpv-ctl"
          >
            {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
        </div>
      )}

      {/* Main Content - Video/Image */}
      <div 
        className="slide-in"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          cursor: isVideo ? 'pointer' : 'default',
          overflow: 'hidden',
        }}
        onClick={isVideo ? handleVideoClick : undefined}
      >
        {mediaState === 'error' ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            color: 'rgba(255,255,255,0.75)', textAlign: 'center', padding: 24,
          }}>
            <ImageOff size={40} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
              This media could not be loaded
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setMediaState('loading'); }}
              style={{
                marginTop: 4, padding: '9px 18px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)',
                color: '#fff', fontSize: 13, fontWeight: 700,
              }}
            >
              Try again
            </button>
          </div>
        ) : isVideo ? (
          <video
            ref={videoRef}
            key={videoUrl}
            src={videoUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: mediaState === 'ready' ? 1 : 0,
              transition: 'opacity 0.25s ease',
            }}
            autoPlay
            loop
            playsInline
            muted={muted}
            onLoadedData={() => setMediaState('ready')}
            onError={() => setMediaState('error')}
          />
        ) : (
          <img
            src={fullUrl}
            alt={currentPost.caption || ''}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: mediaState === 'ready' ? 1 : 0,
              transition: 'opacity 0.25s ease',
            }}
            onLoad={() => setMediaState('ready')}
            onError={() => setMediaState('error')}
          />
        )}

        {/* Loading state */}
        {mediaState === 'loading' && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', color: 'rgba(255,255,255,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Loader size={34} className="rpv-spin" />
          </div>
        )}

        {/* Per-post media navigation — only when a post carries more than one file */}
        {multiMedia && mediaState !== 'error' && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); goToMedia((i) => i - 1); }}
              aria-label="Previous media"
              className="rpv-arrow"
              style={{ left: 10 }}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goToMedia((i) => i + 1); }}
              aria-label="Next media"
              className="rpv-arrow"
              style={{ right: 10 }}
            >
              <ChevronRight size={22} />
            </button>
            <div style={{
              position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 6, zIndex: 60,
            }}>
              {mediaList.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === mediaIndex ? 18 : 6, height: 6, borderRadius: 999,
                    background: i === mediaIndex ? '#fff' : 'rgba(255,255,255,0.45)',
                    transition: 'width 0.22s ease, background 0.22s ease',
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* Pause indicator */}
        {isVideo && !isPlaying && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: 0,
              height: 0,
              borderTop: '15px solid transparent',
              borderBottom: '15px solid transparent',
              borderLeft: '25px solid #fff',
              marginLeft: 5,
            }} />
          </div>
        )}
      </div>

      {/* Bottom Info Panel */}
      <div style={{
        position: 'absolute',
        right: 0,
        bottom: 0,
        left: 0,
        padding: '16px 20px 80px',
        paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.7) 30%, rgba(0,0,0,0.85) 100%)',
        color: '#fff',
        zIndex: 50,
      }}>
        {/* Author + caption. Bound to the post, so it is untouched while the
            user moves between that post's media. */}
        <div style={{ marginBottom: 14 }}>
          <PostCaptionOverlay
            key={currentPost.id}
            post={currentPost}
            author={profileUser}
            onOpenProfile={onShowProfile}
            onHashtagClick={onHashtagClick}
            onMentionClick={onMentionClick}
          />
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: 20,
          alignItems: 'center',
        }}>
          <button aria-label="Like"
            onClick={handleLike}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: 0,
            }}
          >
            <Heart size={22} fill={liked ? "#fff" : "none"} color="#fff" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{likeCount}</span>
          </button>
          <button aria-label="Comments"
            onClick={handleComment}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: 0,
            }}
          >
            <MessageCircle size={22} color="#fff" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{currentPost.comments_count || 0}</span>
          </button>
          <button aria-label="Share"
            onClick={handleShare}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: 0,
            }}
          >
            <Share2 size={22} color="#fff" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{currentPost.shares || 0}</span>
          </button>
          
          {/* Edit/Delete for own profile */}
          {isOwnProfile && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditPost?.(currentPost.id);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                ✏️ Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePost?.(currentPost.id);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FF4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                🗑️ Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Share toast */}
      {shareToast && (
        <div style={{
          position: 'absolute', bottom: 140, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.88)', color: '#fff', padding: '10px 18px',
          borderRadius: 20, fontSize: 14, fontWeight: 600, zIndex: 10000,
        }}>
          {shareToast}
        </div>
      )}

      {/* Swipe hint for mobile */}
      <div style={{
        position: 'absolute',
        bottom: 120,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        background: 'rgba(0,0,0,0.5)',
        padding: '8px 16px',
        borderRadius: 20,
        color: '#fff',
        fontSize: 12,
        display: window.innerWidth <= 768 ? 'flex' : 'none',
        alignItems: 'center',
        gap: 8,
        animation: 'fadeOut 3s forwards',
      }}>
        👆 Swipe to navigate
      </div>
    </div>
  );
}




