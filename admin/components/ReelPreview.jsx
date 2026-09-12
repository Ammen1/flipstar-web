import { useState } from 'react';
import { Film, Play, RefreshCw, TriangleAlert } from 'lucide-react';
import config from '../../config';
import { failureText } from '../../utils/media';

const BACKEND = config.API_BASE_URL.replace('/api', '');

const absolute = (url) => {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${BACKEND}${url.startsWith('/') ? '' : '/'}${url}`;
};

/**
 * A post's picture in the admin panel.
 *
 * Since the media pipeline, a video's picture is its `thumbnail` (made by
 * the worker) -- `image` is only ever a photo's. Before it, the upload view
 * put a frame of the video into `image`, which is all these cards looked at.
 *
 *   thumbnail or photo   the picture
 *   video, no thumbnail  the video's first frame (preload=metadata only)
 *   PROCESSING / FAILED  what the worker says, instead of an empty card
 */
export function ReelPreview({ reel, fit = 'cover', iconSize = 40, color = 'rgba(255,255,255,0.55)' }) {
  const [broken, setBroken] = useState(false);
  const status = reel?.processing_status || 'READY';
  const isVideo = reel?.media_type ? reel.media_type === 'video' : !!reel?.media;
  const picture = broken ? null : absolute(reel?.thumbnail || reel?.image);
  const video = isVideo ? absolute(reel?.media) : null;
  const fill = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit };

  let body;
  if (status === 'PROCESSING') {
    body = (
      <Placeholder color={color}>
        <style>{'@keyframes fs-reel-preview-spin { to { transform: rotate(360deg); } }'}</style>
        <RefreshCw size={iconSize * 0.6} style={{ animation: 'fs-reel-preview-spin 1.2s linear infinite' }} />
        <span>Processing{reel?.processing_progress ? ` ${reel.processing_progress}%` : '…'}</span>
      </Placeholder>
    );
  } else if (status === 'FAILED') {
    body = (
      <Placeholder color="#f87171">
        <TriangleAlert size={iconSize * 0.6} />
        <span>Processing failed</span>
        <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 500 }}>{failureText(reel)}</span>
      </Placeholder>
    );
  } else if (picture) {
    body = <img src={picture} alt="" loading="lazy" style={fill} onError={() => setBroken(true)} />;
  } else if (video) {
    body = <video src={`${video}#t=0.1`} preload="metadata" muted playsInline style={fill} />;
  } else {
    body = (
      <Placeholder color={color}>
        <Film size={iconSize} />
        <span>No media</span>
      </Placeholder>
    );
  }

  return (
    <div data-reel-preview={status} style={{ position: 'absolute', inset: 0 }}>
      {body}
      {isVideo && status === 'READY' && (picture || video) && (
        <div
          aria-label="Video"
          style={{
            position: 'absolute', bottom: 8, left: 8, width: 26, height: 26, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Play size={13} color="#fff" fill="#fff" />
        </div>
      )}
    </div>
  );
}

function Placeholder({ children, color }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 8, padding: 12, textAlign: 'center', color,
        fontSize: 13, fontWeight: 600, lineHeight: 1.3,
      }}
    >
      {children}
    </div>
  );
}
