/**
 * Alert / confirmation dialog.
 *
 * Same props and callbacks: `showCancel` still controls whether this is an
 * acknowledgement or a two-way choice, and `onConfirm` still runs before
 * `onClose`.
 *
 * Changed for the same reasons as ConfirmModal -- light tints on a dark
 * surface, no keyboard dismiss, no focus handling, and a fixed width that
 * overflowed small phones. It uses the shared .adm-modal so the two dialogs
 * cannot drift apart, which they had: different radii, different padding,
 * different button styling for the same job.
 */

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { buildTokens } from '../../tokens';

export function AlertModal({
  isOpen,
  title,
  message,
  type = 'info',
  onClose,
  onConfirm,
  showCancel = true,
  confirmText,
  cancelText = 'Cancel',
  theme = {},
}) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    openerRef.current = document.activeElement;
    dialogRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape' && typeof onClose === 'function') onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const t = buildTokens(theme);

  const palette = {
    success: { color: t.success, Icon: CheckCircle2, btn: 'adm-btn-success' },
    warning: { color: t.warning, Icon: AlertCircle, btn: 'adm-btn-primary' },
    error: { color: t.danger, Icon: AlertTriangle, btn: 'adm-btn-danger' },
    danger: { color: t.danger, Icon: AlertTriangle, btn: 'adm-btn-danger' },
    info: { color: t.info, Icon: Info, btn: 'adm-btn-primary' },
  }[type] || { color: t.pri, Icon: Info, btn: 'adm-btn-primary' };

  const { color, Icon, btn } = palette;
  const close = () => typeof onClose === 'function' && onClose();

  return (
    <div className="adm-overlay" style={{ zIndex: 99999 }} onClick={close}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="adm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-modal-title"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adm-modal-head">
          <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
            <span
              className="adm-stat-icon"
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: `${color}1F`,
                color,
                flexShrink: 0,
              }}
            >
              <Icon size={19} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 id="alert-modal-title" className="adm-modal-title">
                {title}
              </h3>
            </div>
          </div>

          <button type="button" className="adm-modal-x" onClick={close} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="adm-modal-body">
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: t.sub }}>{message}</p>
        </div>

        <div className="adm-modal-foot">
          {showCancel && (
            <button type="button" className="adm-btn adm-btn-outline" onClick={close}>
              {cancelText}
            </button>
          )}
          <button
            type="button"
            className={`adm-btn ${btn}`}
            onClick={() => {
              if (typeof onConfirm === 'function') onConfirm();
              close();
            }}
          >
            {confirmText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
