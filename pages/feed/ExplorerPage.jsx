import { useState, useEffect, useRef } from 'react';
import {
  Search, X, TrendingUp, Play, Heart, Eye, Hash, User, Clock, ChevronRight,
  ChevronLeft, ChevronDown, Zap, RefreshCw, LayoutGrid, CalendarRange,
} from 'lucide-react';
import api from '../../api';
import { useTheme } from '../../contexts/ThemeContext';
import config from '../../config';
import { isVideoUrl } from '../../utils/media';
import { ALL, DEFAULT_TIME_RANGE, isTimeRange, timeRangePhrase } from '../../utils/explorerFeed';
import { readableOn } from '../../utils/color';
import { useExplorerFeed } from '../../hooks/useExplorerFeed';
import { CategoryIcon, ExplorerFilters, explorerFilterStyles } from '../../components/feed/ExplorerFilters';

// ── Constants ────────────────────────────────────────────────────────────────
// Only the "All" chip is fixed. The rest come from /categories/, which is
// admin-managed -- a hardcoded list here silently stops matching the backend
// the moment someone adds or renames a category.
const ALL_CATEGORY = { id: ALL, name: 'All', slug: null, icon: '' };

const RECENT_KEY = 'ep_recent_searches';
const MAX_RECENT = 8;

const mediaUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${config.API_BASE_URL.replace('/api', '')}${url}`;
};

// Generate video poster thumbnail (returns null for local storage)
const getVideoPoster = (url) => null;

const fmt = (n) => {
  if (!n && n !== 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const readRecent = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
};
const saveRecent = (list) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch {}
};
const addRecent = (q) => {
  const prev = readRecent().filter(x => x !== q);
  saveRecent([q, ...prev]);
};

// ── Skeleton shimmer ─────────────────────────────────────────────────────────
function GridSkeleton({ T }) {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} style={{
          aspectRatio: '9/16', borderRadius: 8,
          background: `linear-gradient(90deg,${T.border} 25%,${T.bg} 50%,${T.border} 75%)`,
          backgroundSize: '400% 100%',
          animation: 'ex-shimmer 1.4s ease infinite',
        }} />
      ))}
    </div>
  );
}

// ── Single video thumbnail card ───────────────────────────────────────────────
// `index` is the position in the grid; thumbs above the fold (first few) are
// eager-loaded so the user sees content immediately, the rest are lazy with
// async decoding so scrolling isn't stalled by image decodes on the main thread.
const EAGER_LOAD_COUNT = 6;
function VideoThumb({ reel, rank, index = 0, hero = false, onOpen, T }) {
  const [hovered, setHovered] = useState(false);
  const videoUrl = reel.file_url || reel.media;
  const imageUrl = reel.image || reel.media;
  const isVid = isVideoUrl(videoUrl);
  const isBoosted = Boolean(reel.is_boosted);

  // Priority: 1) explicit thumbnail_url, 2) Cloudinary video poster, 3) image URL, 4) video URL
  const thumb = reel.thumbnail_url
    ? mediaUrl(reel.thumbnail_url)
    : isVid && videoUrl
      ? getVideoPoster(mediaUrl(videoUrl))
      : imageUrl ? mediaUrl(imageUrl)
      : videoUrl ? mediaUrl(videoUrl) : null;

  // Fallback: if no thumbnail found, try different URL patterns
  const finalThumb = thumb || (reel.image ? mediaUrl(reel.image) : null) ||
                     (reel.media && !isVid ? mediaUrl(reel.media) : null) ||
                     (reel.file_url && !isVid ? mediaUrl(reel.file_url) : null);

  const isEager = hero || index < EAGER_LOAD_COUNT;
  const author = reel.user?.username ? `@${reel.user.username}` : 'a creator';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${isVid ? 'Video' : 'Post'} by ${author}, ${fmt(reel.votes || 0)} likes`}
      className="ex-focus"
      data-post-id={reel.id}
      onClick={() => onOpen?.(reel)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(reel); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        aspectRatio: hero ? '16/9' : '9/16',
        background: 'rgba(249,224,139,0.15)',
        borderRadius: 10,
        border: isBoosted ? '2px solid rgba(143,196,65,0.95)' : '1.5px solid rgba(249,224,139,0.3)',
        overflow: 'hidden',
        cursor: 'pointer',
        gridColumn: hero ? '1 / span 3' : undefined,
        boxSizing: 'border-box',
        transform: hovered ? 'scale(1.015)' : 'scale(1)',
        transition: 'transform 0.15s',
        zIndex: hovered ? 1 : 0,
        // Ask the browser to skip painting offscreen thumbs.
        contentVisibility: isEager ? 'visible' : 'auto',
        containIntrinsicSize: '0 260px',
        boxShadow: isBoosted ? '0 0 0 1px rgba(181,221,143,0.35), 0 14px 32px rgba(143,196,65,0.22)' : undefined,
      }}
    >
      {finalThumb
        ? <img src={finalThumb} alt="" loading={isEager ? 'eager' : 'lazy'}
            decoding="async"
            fetchpriority={isEager ? 'high' : 'low'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', height: '100%',
            background: `linear-gradient(135deg,${T.pri}30,#00000080)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Play size={hero ? 48 : 28} color="#fff" fill="#fff" />
          </div>
      }

      {/* Hover overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: hovered ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.12)',
        transition: 'background 0.2s',
      }} />

      {/* Video indicator */}
      {isVid && (
        <div style={{
          position: 'absolute', top: 7, left: 7,
          background: 'rgba(0,0,0,0.58)', borderRadius: 4, padding: '2px 5px',
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <Play size={9} color="#fff" fill="#fff" />
        </div>
      )}

      {isBoosted && (
        <div style={{
          position: 'absolute',
          top: 7,
          right: rank !== undefined && rank < 3 ? (hero ? 40 : 30) : 7,
          background: 'rgba(143,196,65,0.95)',
          color: '#0d0d0d',
          borderRadius: 999,
          padding: hero ? '5px 10px' : '3px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: hero ? 11 : 10,
          fontWeight: 900,
          letterSpacing: 0.3,
        }}>
          <Zap size={hero ? 12 : 10} />
          <span>BOOST</span>
        </div>
      )}

      {/* Rank medal (top 3) */}
      {rank !== undefined && rank < 3 && (
        <div style={{
          position: 'absolute', top: 7, right: 7,
          background: rank === 0 ? '#FFD700' : rank === 1 ? '#C0C0C0' : '#CD7F32',
          color: '#000', borderRadius: '50%',
          width: hero ? 28 : 20, height: hero ? 28 : 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: hero ? 13 : 10, fontWeight: 900,
        }}>
          {rank + 1}
        </div>
      )}

      {/* Bottom stats */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.72))',
        padding: hero ? '24px 12px 10px' : '12px 6px 6px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {hero && reel.user?.username && (
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#8fc441',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            @{reel.user.username}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Heart size={hero ? 13 : 10} color="#8fc441" fill="#8fc441" />
          <span style={{ color: '#8fc441', fontSize: hero ? 12 : 10, fontWeight: 600 }}>
            {fmt(reel.votes === 0 ? 1 : reel.votes)}
          </span>
        </div>
        {(reel.comment_count > 0 || reel.comments > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Eye size={hero ? 12 : 10} color="rgba(255,255,255,0.8)" />
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: hero ? 12 : 10 }}>
              {fmt(reel.comment_count || reel.comments || 0 === 0 ? 1 : (reel.comment_count || reel.comments || 0))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty / error panel ──────────────────────────────────────────────────────
function StatePanel({ icon: Icon, title, message, actions = [], T, role }) {
  const onAccent = readableOn(T.pri);
  return (
    <div role={role} style={{ textAlign: 'center', padding: '48px 20px 32px', color: T.sub }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%', margin: '0 auto 14px',
        background: `${T.pri}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={28} color={T.pri} aria-hidden="true" />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: T.txt, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>{message}</div>
      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
          {actions.map((a, i) => (
            <button key={a.label} type="button" className="ex-focus" onClick={a.onClick}
              style={{
                minHeight: 40, padding: '0 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                border: `1px solid ${i === 0 ? T.pri : T.border}`,
                background: i === 0 ? T.pri : 'transparent',
                color: i === 0 ? onAccent : T.txt,
              }}>
              {a.icon && <a.icon size={15} aria-hidden="true" />}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ExplorerPage ─────────────────────────────────────────────────────────
export function ExplorerPage({
  user, onBack, onShowProfile, onShowVideoDetail, onShowPostDetail, onShowPostPage, onRequireAuth,
  onShowSettings, onShowNotifications,
  // Filter state carried in the URL by the router (/explore?category=dance&range=7d).
  initialCategorySlug = null, initialTimeRange = DEFAULT_TIME_RANGE, onFiltersChange,
}) {
  const { colors: T } = useTheme();

  // ── Filters ────────────────────────────────────────────────────────────────
  // `category` is what the API filters on: 'all' or a category id. A slug
  // from the URL waits in `pendingSlug` until /categories/ says which id it
  // is; the feed does not load until then, so it never flashes "All" first.
  const [categories, setCategories] = useState([ALL_CATEGORY]);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [pendingSlug, setPendingSlug] = useState(initialCategorySlug ? String(initialCategorySlug).toLowerCase() : null);
  const [category, setCategory] = useState(ALL);
  const [timeRange, setTimeRange] = useState(isTimeRange(initialTimeRange) ? initialTimeRange : DEFAULT_TIME_RANGE);

  // Loaded once. A failure leaves only the "All" chip, so Explore still works
  // with the category filter simply unavailable.
  useEffect(() => {
    let cancelled = false;
    api
      .request('/categories/')
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        setCategories([
          ALL_CATEGORY,
          ...rows
            .filter((c) => c && c.id != null && c.name)
            .map((c) => ({ id: c.id, name: c.name, slug: c.slug || null, icon: c.icon || '' })),
        ]);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCategoriesReady(true); });
    return () => { cancelled = true; };
  }, []);

  // A category named in the URL, resolved to its id once the list is here.
  // One that no longer exists is dropped from the URL rather than shown as an
  // error the person did not cause.
  useEffect(() => {
    if (!pendingSlug || !categoriesReady) return;
    const match = categories.find((c) => c.slug && c.slug.toLowerCase() === pendingSlug);
    if (match) setCategory(match.id);
    else onFiltersChange?.({ categorySlug: null, timeRange });
    setPendingSlug(null);
  }, [pendingSlug, categoriesReady, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCategory = categories.find((c) => c.id === category) || ALL_CATEGORY;
  const isAll = category === ALL;
  const categoryLabel = isAll ? '' : activeCategory.name;

  const feed = useExplorerFeed({
    category,
    timeRange,
    enabled: !pendingSlug,
    categoryName: categoryLabel,
  });

  // ── Hashtags ───────────────────────────────────────────────────────────────
  const [hashtags, setHashtags]   = useState([]);
  const [hashLoading, setHashLoading] = useState(true);
  const [showHashtagDropdown, setShowHashtagDropdown] = useState(false);
  // A hashtag's posts live apart from the category feed, so opening one never
  // overwrites the feed and closing it shows the feed again without a reload.
  const [hashtagView, setHashtagView] = useState(null); // { tag, items, count, status }
  const hashtagSeq = useRef(0);

  // ── Search state ───────────────────────────────────────────────────────────
  const [query, setQuery]             = useState('');
  const [debouncedQ, setDebouncedQ]   = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState(readRecent);
  const [searchResults, setSearchResults]   = useState({ users: [], posts: [], hashtags: [] });
  const [searchLoading, setSearchLoading]   = useState(false);

  const inputRef    = useRef(null);
  const inSearchMode = debouncedQ.trim().length > 0;

  const chooseCategory = (id) => {
    closeHashtag();
    if (id === category && !pendingSlug) return;
    setPendingSlug(null);
    setCategory(id);
    const chosen = categories.find((c) => c.id === id);
    onFiltersChange?.({ categorySlug: id === ALL ? null : (chosen && chosen.slug) || null, timeRange });
  };

  const chooseTimeRange = (id) => {
    closeHashtag();
    if (id === timeRange) return;
    setTimeRange(id);
    onFiltersChange?.({ categorySlug: isAll ? null : activeCategory.slug || null, timeRange: id });
  };

  // ── Infinite scroll ────────────────────────────────────────────────────────
  // An IntersectionObserver on a sentinel below the grid asks for the next
  // page -- same category, same time range, next offset -- only when the
  // person nears the bottom. After a failed page it waits for a tap instead
  // of retrying in a loop.
  const loadMoreRef = useRef(null);
  useEffect(() => {
    if (inSearchMode || hashtagView) return undefined;
    const node = loadMoreRef.current;
    if (!node || !feed.hasMore || feed.status !== 'ready' || feed.loadingMore || feed.moreError) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) feed.loadMore();
    }, { rootMargin: '400px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [feed.hasMore, feed.status, feed.items.length, feed.loadingMore, feed.moreError, feed.loadMore, inSearchMode, hashtagView]);

  // ── Fetch trending hashtags ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setHashLoading(true);
    api.getTrendingHashtags({ time_range: timeRange, limit: 15 })
      .then(d => { if (!cancelled) setHashtags(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setHashtags([]); })
      .finally(() => { if (!cancelled) setHashLoading(false); });
    return () => { cancelled = true; };
  }, [timeRange]);

  // ── Debounce search query ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // ── Live search ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedQ.trim()) { setSearchResults({ users: [], posts: [], hashtags: [] }); return; }
    let cancelled = false;
    setSearchLoading(true);
    api.search(debouncedQ.trim())
      .then(d => { if (!cancelled) setSearchResults(d || { users: [], posts: [], hashtags: [] }); })
      .catch(() => { if (!cancelled) setSearchResults({ users: [], posts: [], hashtags: [] }); })
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQ]);

  const commitSearch = (q) => {
    const trimmed = (q || query).trim();
    if (!trimmed) return;
    addRecent(trimmed);
    setRecentSearches(readRecent());
    setQuery(trimmed);
    inputRef.current?.blur();
    setSearchFocused(false);
  };

  const clearSearch = () => {
    setQuery('');
    setDebouncedQ('');
    setSearchFocused(false);
  };

  function closeHashtag() {
    hashtagSeq.current += 1;
    setHashtagView(null);
  }

  const openHashtag = async (tag) => {
    const cleanTag = String(tag).replace(/^#/, '');
    const requestId = ++hashtagSeq.current;
    setHashtagView({ tag: cleanTag, items: [], count: 0, status: 'loading' });
    try {
      const data = await api.request(`/explorer/hashtag/?tag=${encodeURIComponent(cleanTag)}&limit=30`);
      if (requestId !== hashtagSeq.current) return;
      const results = data?.results || [];
      setHashtagView({ tag: cleanTag, items: results, count: data?.count || results.length, status: 'ready' });
    } catch (e) {
      if (requestId !== hashtagSeq.current) return;
      console.error('Failed to fetch hashtag:', e);
      setHashtagView({ tag: cleanTag, items: [], count: 0, status: 'error' });
    }
  };

  const openReel = (reel) => {
    // Detect if this post is a video (vs. an image) so we can route correctly:
    //  - Videos → Reels page (vertical feed)
    //  - Photos → Home page (image feed)
    const raw = reel.file_url || reel.media || reel.image || '';
    const isVideo =
      !!(reel.file_url || reel.media) && (
        isVideoUrl(raw)
      );
    if (onShowPostDetail) {
      onShowPostDetail(reel.id, isVideo);
    } else {
      // Fallback to legacy behaviour if the new prop isn't provided.
      onShowVideoDetail?.(reel.id);
    }
  };

  const showRecentDropdown = searchFocused && query.length === 0 && recentSearches.length > 0;

  // ── What the grid shows ──────────────────────────────────────────────────
  const showingHashtag = !!hashtagView;
  const gridItems = showingHashtag ? hashtagView.items : feed.items;
  const gridStatus = showingHashtag
    ? hashtagView.status
    : pendingSlug || feed.status === 'idle' ? 'loading' : feed.status;
  const phrase = timeRangePhrase(timeRange);
  const widerRange = timeRange !== '30d'
    ? { label: 'Try the last 30 days', icon: CalendarRange, onClick: () => chooseTimeRange('30d') }
    : null;
  const showAll = { label: 'Show all categories', icon: LayoutGrid, onClick: () => chooseCategory(ALL) };

  const renderFeedState = () => {
    if (gridStatus === 'loading') return <GridSkeleton T={T} />;

    if (gridStatus === 'error') {
      if (showingHashtag) {
        return (
          <StatePanel T={T} role="alert" icon={Hash} title={`Unable to load #${hashtagView.tag}`}
            message="Check your connection and try again."
            actions={[{ label: 'Try again', icon: RefreshCw, onClick: () => openHashtag(hashtagView.tag) }]} />
        );
      }
      if (feed.error && feed.error.code === 'invalid_category') {
        return (
          <StatePanel T={T} role="alert" icon={LayoutGrid} title="Category unavailable"
            message={feed.error.message} actions={[showAll]} />
        );
      }
      return (
        <StatePanel T={T} role="alert" icon={TrendingUp}
          title={isAll ? 'Unable to load trending' : 'Unable to load this category'}
          message={(feed.error && feed.error.message) || 'Something went wrong.'}
          actions={[{ label: 'Try again', icon: RefreshCw, onClick: feed.retry }, ...(isAll ? [] : [showAll])]} />
      );
    }

    if (gridItems.length === 0) {
      if (showingHashtag) {
        return (
          <StatePanel T={T} icon={Hash} title={`No posts with #${hashtagView.tag}`}
            message="Be the first to post with this hashtag!" />
        );
      }
      return isAll ? (
        <StatePanel T={T} icon={TrendingUp} title="Nothing trending yet"
          message={`No posts from ${phrase} yet.`} actions={widerRange ? [widerRange] : []} />
      ) : (
        <StatePanel T={T} icon={LayoutGrid} title={`No ${categoryLabel} posts yet`}
          message={`There are no posts in this category from ${phrase}.`}
          actions={[showAll, ...(widerRange ? [widerRange] : [])]} />
      );
    }

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {gridItems.map((reel, idx) => (
            <VideoThumb
              key={reel.id}
              reel={reel}
              rank={idx}
              index={idx}
              hero={idx === 0}
              onOpen={openReel}
              T={T}
            />
          ))}
        </div>
        {/* Infinite-scroll sentinel -- only while there is more to fetch, so
            the observer stops at the end. */}
        {!showingHashtag && feed.hasMore && (
          <div ref={loadMoreRef} style={{ padding: '16px 0', textAlign: 'center', minHeight: 24 }}>
            {feed.loadingMore && (
              <span role="status" style={{ fontSize: 13, color: T.sub }}>Loading more…</span>
            )}
            {feed.moreError && (
              <button type="button" className="ex-focus" onClick={feed.loadMore}
                style={{ minHeight: 40, padding: '0 16px', borderRadius: 999, border: `1px solid ${T.border}`,
                  background: 'transparent', color: T.txt, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={14} aria-hidden="true" /> Couldn't load more — tap to retry
              </button>
            )}
          </div>
        )}
        {!showingHashtag && !feed.hasMore && gridItems.length > 12 && (
          <div style={{ textAlign: 'center', padding: '18px 0', fontSize: 12, color: T.sub }}>
            You're all caught up
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ minHeight: '100%', background: T.bg, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes ex-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .ex-wrap { width: 100%; max-width: 760px; margin: 0 auto; box-sizing: border-box; }
        .ex-hashtag-row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 10px 2px 4px; }
        .ex-hashtag-row::-webkit-scrollbar { display: none; }
        ${explorerFilterStyles(T)}
      `}</style>

      {/* ── STICKY HEADER ───────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: T.bg,
        borderBottom: inSearchMode ? 'none' : `1px solid ${T.border}`,
      }}>
        <div className="ex-wrap" style={{ padding: '10px 16px 0' }}>
          {/* Row 1 – back + search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
            <button aria-label="Go back" type="button" className="ex-focus"
              onClick={onBack}
              style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: T.cardBg, border: `1px solid ${T.border}`, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.txt,
              }}
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>

            {/* Search input wrapper */}
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={15} color={T.sub} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                onKeyDown={e => { if (e.key === 'Enter') commitSearch(); }}
                placeholder="Search videos, users…"
                aria-label="Search videos and users"
                style={{
                  width: '100%', boxSizing: 'border-box', height: 38,
                  padding: '0 34px 0 34px',
                  borderRadius: 999, border: `1px solid ${searchFocused ? T.pri : T.border}`,
                  fontSize: 14, background: T.cardBg, color: T.txt,
                  outline: 'none', transition: 'border-color .2s',
                }}
              />
              {query && (
                <button aria-label="Clear search" type="button" onClick={clearSearch} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', color: T.sub }}>
                  <X size={14} />
                </button>
              )}

              {/* Recent searches dropdown */}
              {showRecentDropdown && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                  background: T.cardBg, borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.24)',
                  overflow: 'hidden', zIndex: 30,
                  border: `1px solid ${T.border}`,
                }}>
                  <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> Recent
                    </span>
                    <button onClick={() => { saveRecent([]); setRecentSearches([]); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: T.pri, fontWeight: 700 }}>
                      Clear
                    </button>
                  </div>
                  {recentSearches.map(r => (
                    <button key={r} onMouseDown={() => { setQuery(r); commitSearch(r); }}
                      style={{ width: '100%', padding: '9px 12px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', color: T.txt, fontSize: 13 }}>
                      <Clock size={12} color={T.sub} />
                      <span style={{ flex: 1 }}>{r}</span>
                      <ChevronRight size={12} color={T.sub} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Filters — category and time, each in its own labelled section. */}
          {!inSearchMode && (
            <ExplorerFilters
              categories={categories}
              category={pendingSlug ? null : category}
              onCategory={chooseCategory}
              timeRange={timeRange}
              onTimeRange={chooseTimeRange}
              T={T}
            />
          )}
        </div>
      </div>

      {/* ── SCROLLABLE CONTENT ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ══ SEARCH RESULTS MODE ══════════════════════════════════════════ */}
        {inSearchMode && (
          <div style={{ padding: '12px 16px 32px', maxWidth: 680, margin: '0 auto' }}>
            {searchLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ height: 56, borderRadius: 12,
                    background: `linear-gradient(90deg,${T.border} 25%,${T.bg} 50%,${T.border} 75%)`,
                    backgroundSize: '400% 100%', animation: 'ex-shimmer 1.4s ease infinite' }} />
                ))}
              </div>
            ) : (
              <>
                {/* Users */}
                {searchResults.users?.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#8fc441', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={13} /> PEOPLE
                    </div>
                    {searchResults.users.map(u => {
                      const photo = u.profile_photo ? mediaUrl(u.profile_photo) : null;
                      return (
                        <button key={u.id} onClick={() => onShowProfile?.(u.id)} style={{
                          width: '100%', padding: '10px 12px', border: 'none', background: 'none',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                          borderRadius: 12, transition: 'background .15s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = T.border + '60'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <div style={{ width: 42, height: 42, borderRadius: '50%', background: T.pri + '30', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid ${T.border}` }}>
                            {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 20 }}>👤</span>}
                          </div>
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#8fc441' }}>@{u.username}</div>
                            {u.followers_count > 0 && <div style={{ fontSize: 12, color: '#8fc441' }}>{fmt(u.followers_count)} followers</div>}
                          </div>
                          <ChevronRight size={16} color={T.sub} />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Hashtags */}
                {searchResults.hashtags?.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#8fc441', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Hash size={13} /> HASHTAGS
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {searchResults.hashtags.map(tag => (
                        // Leaves search, so the hashtag's posts are what is on screen.
                        <button key={tag} onClick={() => { clearSearch(); openHashtag(tag); }} style={{
                          padding: '7px 14px', borderRadius: 20,
                          background: T.pri + '18', border: `1px solid ${T.pri}40`,
                          color: T.pri, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                        }}>
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Posts */}
                {searchResults.posts?.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#8fc441', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Play size={13} /> POSTS
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                      {searchResults.posts.map(r => (
                        <VideoThumb key={r.id} reel={r} onOpen={openReel} T={T} />
                      ))}
                    </div>
                  </div>
                )}

                {/* No results */}
                {!searchResults.users?.length && !searchResults.hashtags?.length && !searchResults.posts?.length && (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8fc441' }}>
                    <Search size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#8fc441', marginBottom: 6 }}>No results for "{debouncedQ}"</div>
                    <div style={{ fontSize: 13 }}>Try different keywords or browse trending below</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ EXPLORE MODE ═════════════════════════════════════════════════ */}
        {!inSearchMode && (
          <div className="ex-wrap" style={{ padding: '12px 16px calc(96px + env(safe-area-inset-bottom))' }}>

            {/* ── Trending hashtags: a separate discovery shortcut, not a filter ── */}
            {!showingHashtag && !hashLoading && hashtags.length > 0 && (
              <section style={{
                marginBottom: 14, borderRadius: 14, border: `1px solid ${T.border}`,
                background: T.cardBg, padding: '2px 12px',
              }}>
                <button
                  type="button"
                  className="ex-focus"
                  aria-expanded={showHashtagDropdown}
                  aria-controls="ex-hashtag-list"
                  onClick={() => setShowHashtagDropdown(!showHashtagDropdown)}
                  style={{
                    width: '100%', minHeight: 44, padding: 0, background: 'none', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: `${T.pri}1F`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <TrendingUp size={14} color={T.pri} aria-hidden="true" />
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.06em', color: T.txt }}>TRENDING HASHTAGS</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.sub, background: `${T.border}`, borderRadius: 999, padding: '2px 7px' }}>
                      {hashtags.length}
                    </span>
                  </span>
                  <ChevronDown size={18} color={T.sub} aria-hidden="true" style={{
                    transform: showHashtagDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }} />
                </button>

                {showHashtagDropdown && (
                  <div id="ex-hashtag-list" className="ex-hashtag-row" style={{ borderTop: `1px solid ${T.border}`, marginBottom: 8 }}>
                    {hashtags.map(h => (
                      <button key={h.tag} type="button" className="ex-focus" onClick={() => openHashtag(h.tag)}
                        aria-label={`#${h.tag}, ${fmt(h.posts)} posts`}
                        style={{
                          flexShrink: 0, minHeight: 40, padding: '0 14px', borderRadius: 999,
                          background: `${T.pri}12`, border: `1px solid ${T.pri}35`, cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                        }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.pri }}>#{h.tag}</span>
                        <span style={{ fontSize: 11, color: T.sub }}>{fmt(h.posts)} posts</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
            {!showingHashtag && hashLoading && (
              <div aria-hidden="true" style={{ height: 48, borderRadius: 14, marginBottom: 14,
                background: `linear-gradient(90deg,${T.border} 25%,${T.bg} 50%,${T.border} 75%)`,
                backgroundSize: '400% 100%', animation: 'ex-shimmer 1.4s ease infinite' }} />
            )}

            {/* ── Hashtag view header ─────────────────────────────────── */}
            {showingHashtag && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                padding: '12px 16px', background: T.pri + '15', borderRadius: 12,
              }}>
                <button type="button" aria-label="Close hashtag" className="ex-focus" onClick={closeHashtag} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex',
                }}>
                  <X size={20} color={T.txt} />
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.pri }}>#{hashtagView.tag}</div>
                  <div style={{ fontSize: 12, color: T.sub }}>
                    {hashtagView.status === 'ready' ? `${fmt(hashtagView.count)} posts` : 'Loading…'}
                  </div>
                </div>
                <Hash size={28} color={T.pri} style={{ opacity: 0.5 }} />
              </div>
            )}

            {/* ── What is showing, in words (and to screen readers) ─────── */}
            {!showingHashtag && (
              <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.sub, margin: '0 2px 10px' }}>
                {!isAll && <CategoryIcon category={activeCategory} size={13} color={T.pri} />}
                <span>
                  {gridStatus === 'loading'
                    ? `Loading ${isAll ? 'trending posts' : `${categoryLabel} posts`}…`
                    : <>Showing <strong style={{ color: T.txt }}>{isAll ? 'all categories' : categoryLabel}</strong> from {phrase}</>}
                </span>
              </div>
            )}

            {/* ── Trending grid ───────────────────────────────────────── */}
            {renderFeedState()}
          </div>
        )}
      </div>

    </div>
  );
}
