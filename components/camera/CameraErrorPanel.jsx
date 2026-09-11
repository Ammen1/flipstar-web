import React from 'react';
import { CameraOff, RefreshCw, Upload } from 'lucide-react';

/**
 * Shown in place of the preview when the camera cannot start. The wording
 * comes from cameraErrors.js; this only lays it out and offers the next
 * steps -- retry (which asks the browser again, only because the person
 * tapped it) and uploading from the gallery instead.
 */
export function CameraErrorPanel({ title, message, canRetry, suggestUpload, onRetry, onUpload, onClose, accent = '#8fc441' }) {
  const button = {
    width: '100%', minHeight: 48, borderRadius: 14, fontSize: 15, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40, background: '#0B0B0B',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div role="alert" style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
        <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CameraOff size={30} color="#fff" />
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>{title}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.72)' }}>{message}</div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {canRetry && (
            <button type="button" className="ep-btn" onClick={onRetry} style={{ ...button, background: accent, color: '#0B0F07' }}>
              <RefreshCw size={17} /> Try again
            </button>
          )}
          {suggestUpload && (
            <button type="button" className="ep-btn" onClick={onUpload} style={{ ...button, background: 'rgba(255,255,255,0.12)', color: '#fff' }}>
              <Upload size={17} /> Upload from gallery
            </button>
          )}
          <button type="button" className="ep-btn" onClick={onClose} style={{ ...button, background: 'transparent', color: 'rgba(255,255,255,0.75)' }}>
            Close camera
          </button>
        </div>
      </div>
    </div>
  );
}
