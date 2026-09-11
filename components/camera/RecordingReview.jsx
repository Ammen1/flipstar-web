import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, RotateCw, Sparkles, Volume2, VolumeX } from 'lucide-react';

/**
 * The take, played back before anything else happens.
 *
 * What plays here is the recorded file itself -- filter and text already in
 * the pixels -- so this is exactly what will be uploaded. Filters are baked in
 * while recording, which is why "Change filter" means recording again: there
 * is no unfiltered copy to re-grade, and keeping one would mean running a
 * second encoder on the phone for every take.
 */
export function RecordingReview({ url, filterName, onRetake, onChangeFilter, onNext, accent = '#8fc441' }) {
  const videoRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(null);
  const [confirm, setConfirm] = useState(null); // null | 'retake' | 'filter'

  // Sound on by default; browsers that no longer count the Stop tap as a
  // gesture refuse to autoplay with sound, and then it plays muted instead.
  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {
      v.muted = true;
      setMuted(true);
      v.play().catch(() => {});
    });
  };

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  // MediaRecorder WebM files report Infinity as their duration until the
  // whole file has been scanned; seeking far past the end forces the scan.
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!isFinite(v.duration) || v.duration === 0) {
      const settle = () => {
        v.removeEventListener('durationchange', settle);
        if (isFinite(v.duration) && v.duration > 0) {
          setDuration(v.duration);
          v.currentTime = 0;
          play();
        }
      };
      v.addEventListener('durationchange', settle);
      try {
        v.currentTime = 1e101;
      } catch (_) {
        play();
      }
    } else {
      setDuration(v.duration);
      play();
    }
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  const actionStyle = {
    flex: 1, minHeight: 50, borderRadius: 14, padding: '0 10px',
    background: 'rgba(255,255,255,0.12)', color: '#fff',
    fontSize: 14, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };

  return (
    <section aria-label="Review your video" style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <video
        ref={videoRef}
        src={url}
        playsInline
        loop
        preload="auto"
        onLoadedMetadata={onLoadedMetadata}
        onClick={() => {
          const v = videoRef.current;
          if (v) (v.paused ? v.play() : Promise.resolve(v.pause())).catch(() => {});
        }}
        aria-label="Recorded video"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />

      <div style={{
        position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: 'max(14px, env(safe-area-inset-top)) 16px 24px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Preview</span>
          {duration != null && (
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontVariantNumeric: 'tabular-nums' }}>{fmt(duration)}</span>
          )}
          {filterName && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 12, padding: '4px 10px' }}>
              <Sparkles size={12} color={accent} /> {filterName}
            </span>
          )}
        </div>
        <button type="button" className="ep-btn" onClick={() => setMuted((m) => !m)}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}
          style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {muted ? <VolumeX size={20} color="#fff" /> : <Volume2 size={20} color="#fff" />}
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        position: 'relative', zIndex: 2, padding: '28px 16px max(20px, env(safe-area-inset-bottom))',
        background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
        display: 'flex', gap: 10, width: '100%', maxWidth: 560, margin: '0 auto', boxSizing: 'border-box',
      }}>
        <button type="button" className="ep-btn" style={actionStyle} onClick={() => setConfirm('retake')}>
          <RotateCw size={17} /> Retake
        </button>
        <button type="button" className="ep-btn" style={actionStyle} onClick={() => setConfirm('filter')}>
          <Sparkles size={17} /> Change filter
        </button>
        <button type="button" className="ep-btn" onClick={onNext}
          style={{ ...actionStyle, background: accent, color: '#0B0F07', fontWeight: 800 }}>
          Next <ArrowRight size={17} />
        </button>
      </div>

      {confirm && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="ep-discard-title" aria-describedby="ep-discard-desc"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}
          style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#151515', borderRadius: '20px 20px 0 0', padding: '22px 20px max(20px, env(safe-area-inset-bottom))', boxSizing: 'border-box', animation: 'ep-fade-in .2s ease both' }}>
            <div id="ep-discard-title" style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>Discard this video?</div>
            <div id="ep-discard-desc" style={{ fontSize: 14, lineHeight: 1.45, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>
              {confirm === 'filter'
                ? 'Filters are applied while recording, so a new filter means recording again. This take will be deleted.'
                : 'This take will be deleted and the camera will open again.'}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" className="ep-btn" autoFocus onClick={() => setConfirm(null)}
                style={{ ...actionStyle, background: 'rgba(255,255,255,0.1)' }}>
                Keep
              </button>
              <button type="button" className="ep-btn"
                onClick={() => { const next = confirm; setConfirm(null); if (next === 'filter') onChangeFilter(); else onRetake(); }}
                style={{ ...actionStyle, background: '#EF4444' }}>
                {confirm === 'filter' ? 'Discard & pick filter' : 'Discard & retake'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
