import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { BadgeCheck } from 'lucide-react';
import config from '../../config';
import { getRelativeTime } from '../../utils/timeUtils';

/**
 * Glass caption panel for the full-screen media viewer.
 *
 * Reads the caption straight off the post object the viewer already has — it
 * never fetches anything. Renders the author row always, and wraps everything
 * in the glass panel only when there is a caption, so a post without one never
 * produces an empty container.
 *
 * The panel is `pointer-events: none` apart from its own controls, so taps
 * meant for the video (play/pause, mute, fullscreen) pass straight through.
 */

const BRAND = '#8fc441';
const MEDIA_ROOT = config.API_BASE_URL.replace('/api', '');

function absolute(url) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${MEDIA_ROOT}${url}`;
}

// The API stores the post text under `caption`; `description` is accepted as a
// tolerant alias so the panel keeps working if the field is ever renamed.
export function captionOf(post) {
  const raw = post?.caption ?? post?.description;
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

// Latin, Cyrillic and Ethiopic word characters so Amharic tags highlight too.
const TOKEN = /([#@][\wЀ-ӿሀ-፿][\w.Ѐ-ӿሀ-፿]*)/g;

function tokenize(text) {
  return text.split(TOKEN).filter((part) => part !== '');
}

const CSS = `
.pco-root{position:relative;pointer-events:none;}
.pco-panel{display:flex;flex-direction:column;gap:9px;padding:12px 14px;border-radius:18px;
  background:rgba(10,10,10,.56);backdrop-filter:blur(18px) saturate(140%);
  -webkit-backdrop-filter:blur(18px) saturate(140%);
  border:1px solid rgba(255,255,255,.13);box-shadow:0 10px 34px rgba(0,0,0,.42);
  animation:pco-rise .34s cubic-bezier(.2,.8,.3,1) both;}
.pco-root[data-has-caption="false"] .pco-panel{background:none;backdrop-filter:none;
  -webkit-backdrop-filter:none;border:none;box-shadow:none;padding:0;}

.pco-who{display:flex;align-items:center;gap:10px;min-width:0;}
.pco-avatar{width:36px;height:36px;flex-shrink:0;border-radius:50%;overflow:hidden;
  background:rgba(255,255,255,.16);border:1.5px solid rgba(255,255,255,.85);
  display:grid;place-items:center;font-size:15px;color:#fff;padding:0;cursor:pointer;
  pointer-events:auto;-webkit-tap-highlight-color:transparent;}
.pco-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.pco-idcol{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px;}
.pco-namerow{display:flex;align-items:center;gap:5px;min-width:0;}
.pco-name{min-width:0;font-size:14px;font-weight:700;color:#fff;background:none;border:none;
  padding:0;cursor:pointer;pointer-events:auto;text-align:left;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  text-shadow:0 1px 3px rgba(0,0,0,.55);-webkit-tap-highlight-color:transparent;}
.pco-name:hover{text-decoration:underline;}
.pco-verified{flex-shrink:0;color:${BRAND};display:inline-flex;}
.pco-time{font-size:11.5px;color:rgba(255,255,255,.72);text-shadow:0 1px 3px rgba(0,0,0,.5);}

.pco-text{font-size:13.5px;line-height:1.5;color:rgba(255,255,255,.96);
  white-space:pre-wrap;overflow-wrap:anywhere;text-shadow:0 1px 3px rgba(0,0,0,.4);
  pointer-events:auto;}
.pco-text[data-collapsed="true"]{display:-webkit-box;-webkit-line-clamp:2;
  -webkit-box-orient:vertical;overflow:hidden;}
.pco-text[data-collapsed="false"]{max-height:32vh;overflow-y:auto;
  scrollbar-width:thin;overscroll-behavior:contain;}
.pco-text[data-collapsed="false"]::-webkit-scrollbar{width:3px;}
.pco-text[data-collapsed="false"]::-webkit-scrollbar-thumb{background:rgba(255,255,255,.3);border-radius:3px;}
.pco-tag{color:${BRAND};font-weight:600;background:none;border:none;padding:0;font:inherit;
  cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;}
.pco-tag:hover{text-decoration:underline;}

.pco-toggle{align-self:flex-start;background:none;border:none;padding:2px 0;font:inherit;
  font-size:12.5px;font-weight:700;color:rgba(255,255,255,.82);cursor:pointer;
  pointer-events:auto;-webkit-tap-highlight-color:transparent;}
.pco-toggle:hover{color:#fff;}
.pco-toggle:focus-visible{outline:2px solid ${BRAND};outline-offset:2px;border-radius:4px;}

@keyframes pco-rise{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
@media(prefers-reduced-motion:reduce){.pco-panel{animation:none;}}
`;

export function PostCaptionOverlay({
  post,
  author,
  onOpenProfile,
  onHashtagClick,
  onMentionClick,
  // The feed card already shows avatar + username above the media, so it opts
  // out of the author row to avoid printing the same name twice.
  showAuthor = true,
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const textRef = useRef(null);

  const caption = captionOf(post);
  const who = post?.user || author || null;
  const hasCaption = caption.length > 0;

  // The panel belongs to the post, so a new post resets it — switching media
  // inside one post leaves it exactly as the viewer left it.
  useEffect(() => {
    setExpanded(false);
  }, [post?.id]);

  const measure = useCallback(() => {
    const el = textRef.current;
    if (!el || !hasCaption) { setOverflowing(false); return; }
    // Only meaningful while clamped; when expanded the answer is already known.
    if (el.getAttribute('data-collapsed') === 'false') return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [hasCaption]);

  useEffect(() => {
    measure();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, caption]);

  const parts = useMemo(() => (hasCaption ? tokenize(caption) : []), [caption, hasCaption]);

  if (!who && !hasCaption) return null;

  const avatar = absolute(who?.profile_photo);
  const username = who?.username || who?.full_name || '';
  // Only shown when the API actually reports it — never decorative.
  const verified = Boolean(who?.is_verified ?? who?.verified);
  const created = post?.created_at || post?.timestamp;

  return (
    <div className="pco-root" data-has-caption={hasCaption}>
      <style>{CSS}</style>
      <div className="pco-panel">
        {who && showAuthor && (
          <div className="pco-who">
            <button
              className="pco-avatar"
              type="button"
              onClick={() => onOpenProfile?.(who.id)}
              aria-label={username ? `Open ${username}'s profile` : 'Open profile'}
            >
              {avatar ? <img src={avatar} alt="" /> : <span aria-hidden="true">👤</span>}
            </button>
            <div className="pco-idcol">
              <div className="pco-namerow">
                <button className="pco-name" type="button" onClick={() => onOpenProfile?.(who.id)}>
                  {username}
                </button>
                {verified && (
                  <span className="pco-verified" title="Verified">
                    <BadgeCheck size={15} />
                  </span>
                )}
              </div>
              {created && (
                <span className="pco-time">{getRelativeTime(new Date(created))}</span>
              )}
            </div>
          </div>
        )}

        {hasCaption && (
          <>
            <div className="pco-text" ref={textRef} data-collapsed={!expanded}>
              {parts.map((part, i) => {
                if (part[0] === '#' || part[0] === '@') {
                  const isTag = part[0] === '#';
                  return (
                    <button
                      key={`${part}-${i}`}
                      type="button"
                      className="pco-tag"
                      onClick={() => (isTag
                        ? onHashtagClick?.(part.slice(1))
                        : onMentionClick?.(part.slice(1)))}
                    >
                      {part}
                    </button>
                  );
                }
                return <span key={`t-${i}`}>{part}</span>;
              })}
            </div>

            {(overflowing || expanded) && (
              <button
                className="pco-toggle"
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? 'See less' : 'See more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default PostCaptionOverlay;
