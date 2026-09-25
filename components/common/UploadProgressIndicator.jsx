import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Film, Image as ImageIcon, TriangleAlert, X } from 'lucide-react';
import { uploadTracker as defaultTracker } from '../../services/uploadTracker';
import { failureText } from '../../utils/media';

const RING = 40;
const STROKE = 3;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MAX_SHOWN = 3;

const COLORS = { PROCESSING: '#8fc441', READY: '#22c55e', FAILED: '#f87171' };

// A tracker entry keeps the server's code as `error` and, when the server
// sent one, its own sentence as `errorMessage` -- which is what a limit that
// differs between accounts needs. The same text the post page shows.
const reasonOf = (item) =>
  failureText({ processing_error: item.error, processing_error_message: item.errorMessage });

/**
 * The uploads being processed, in the top corner of every page.
 *
 * The percentage is the worker's own (GET /posts/processing/ -- bytes
 * fetched, seconds FFmpeg has encoded, outputs stored); nothing here counts
 * up on a timer. The ring eases between two real readings so it does not
 * jump, but the number shown is always the last one the server gave.
 *
 *   processing  ring + thumbnail + percentage ("Waiting…" until a worker starts)
 *   ready       a tick and "Posted" for a moment, then gone
 *   failed      stays, with a plain reason, until dismissed
 *
 * Tapping one opens the post page, which shows the same state in full.
 */
export function UploadProgressIndicator({ tracker = defaultTracker, onOpen }) {
  const items = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, tracker.getSnapshot);
  const announcement = useStatusAnnouncement(items);

  if (!items.length) return <LiveRegion text={announcement} />;
  const shown = items.slice(-MAX_SHOWN);
  const hidden = items.length - shown.length;

  return (
    <>
      <LiveRegion text={announcement} />
      <div
        data-upload-indicator
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 68px)',
          right: 12,
          zIndex: 1500,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 8,
          maxWidth: 'calc(100vw - 24px)',
          pointerEvents: 'none',
        }}
      >
        <style>{`
          @keyframes fs-upload-in { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
          .fs-upload-item { animation: fs-upload-in 180ms ease-out; }
          .fs-upload-ring { transition: stroke-dashoffset 450ms ease, stroke 200ms ease; }
          @media (prefers-reduced-motion: reduce) {
            .fs-upload-item { animation: none; }
            .fs-upload-ring { transition: none; }
          }
        `}</style>
        {shown.map((item) => (
          <UploadItem
            key={item.id}
            item={item}
            onOpen={onOpen}
            onDismiss={() => tracker.dismiss(item.id)}
          />
        ))}
        {hidden > 0 && (
          <div style={{ ...pillStyle, padding: '4px 10px', fontSize: 12, fontWeight: 600, pointerEvents: 'auto' }}>
            +{hidden} more uploading
          </div>
        )}
      </div>
    </>
  );
}

const pillStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '5px 12px 5px 5px',
  borderRadius: 999,
  background: 'rgba(12, 14, 10, 0.9)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
  color: '#fff',
};

function UploadItem({ item, onOpen, onDismiss }) {
  const { status, progress, queued, mediaType, thumb } = item;
  const failed = status === 'FAILED';
  const ready = status === 'READY';
  const percent = ready ? 100 : progress;
  const kind = mediaType === 'image' ? 'photo' : 'video';

  const title = failed
    ? `Couldn't post your ${kind}`
    : ready
      ? 'Posted'
      : queued && percent === 0
        ? 'Waiting to process…'
        : `Processing your ${kind}`;
  const detail = failed ? reasonOf(item) : ready ? 'It’s in the feed now.' : null;

  return (
    <div
      className="fs-upload-item"
      data-upload-id={item.id}
      data-upload-status={status}
      style={{ ...pillStyle, pointerEvents: 'auto', maxWidth: 300, cursor: onOpen ? 'pointer' : 'default' }}
      onClick={() => onOpen?.(item.id)}
      {...(failed
        ? { role: 'alert' }
        : {
            role: 'progressbar',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': percent,
            'aria-label': title,
          })}
    >
      <Ring percent={failed ? 100 : percent} color={COLORS[status]} thumb={thumb} kind={kind}>
        {failed ? (
          <TriangleAlert size={16} color={COLORS.FAILED} aria-hidden="true" />
        ) : ready ? (
          <Check size={18} color={COLORS.READY} strokeWidth={3} aria-hidden="true" />
        ) : (
          <span data-upload-percent style={{ fontSize: 11, fontWeight: 800, letterSpacing: -0.2 }}>
            {percent}%
          </span>
        )}
      </Ring>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </span>
        {detail && (
          <span style={{ fontSize: 11.5, lineHeight: 1.3, opacity: 0.82 }}>{detail}</span>
        )}
      </div>
      {failed && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          style={{
            marginLeft: 2,
            width: 28,
            height: 28,
            flex: '0 0 28px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function Ring({ percent, color, thumb, kind, children }) {
  const Fallback = kind === 'photo' ? ImageIcon : Film;
  return (
    <div style={{ position: 'relative', width: RING, height: RING, flex: `0 0 ${RING}px` }}>
      <div
        style={{
          position: 'absolute',
          inset: STROKE + 1,
          borderRadius: '50%',
          overflow: 'hidden',
          background: '#1f2419',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
        ) : (
          <Fallback size={14} color="rgba(255,255,255,0.45)" aria-hidden="true" />
        )}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </div>
      </div>
      <svg width={RING} height={RING} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={STROKE} />
        <circle
          className="fs-upload-ring"
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, percent)) / 100)}
        />
      </svg>
    </div>
  );
}

// Screen readers hear when an upload is posted or fails -- not every
// percentage, which would talk over everything else on the page.
function useStatusAnnouncement(items) {
  const [text, setText] = useState('');
  const last = useRef(new Map());
  useEffect(() => {
    const seen = new Map();
    for (const item of items) {
      seen.set(item.id, item.status);
      const before = last.current.get(item.id);
      if (before !== item.status) {
        if (item.status === 'READY') setText('Your post is live.');
        else if (item.status === 'FAILED') setText(`Your post could not be processed. ${reasonOf(item)}`);
        else if (before === undefined) setText('Processing your post.');
      }
    }
    last.current = seen;
  }, [items]);
  return text;
}

function LiveRegion({ text }) {
  return (
    <div
      aria-live="polite"
      style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
    >
      {text}
    </div>
  );
}
