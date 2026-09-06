/**
 * Confirmation dialog.
 *
 * Same props, same callbacks, same behaviour -- `loading` still blocks both the
 * confirm and the dismiss, so a destructive action in flight cannot be
 * cancelled halfway.
 *
 * What changed:
 *
 *   palette    the type tints were light (#FEF2F2, #ECFDF5) on a near-black
 *              admin, so a "danger" dialog rendered a white slab. They are now
 *              alpha tints of the semantic colours, readable on the real
 *              background.
 *
 *   escape     there was no keyboard dismiss. Escape now closes, except while
 *              loading, matching what clicking the backdrop already did.
 *
 *   focus      focus moves to the dialog on open and returns to whatever
 *              opened it on close. Without that, a keyboard user's focus stays
 *              on a button behind the overlay.
 *
 *   responsive fixed 460px with 24px padding overflowed a small phone. It now
 *              uses the shared .adm-modal, which is width-capped rather than
 *              width-fixed.
 */

import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { buildTokens } from '../../tokens';

export function ConfirmModal({
  theme = {},
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  loading = false,
}) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    // Remember what had focus so it can be handed back -- otherwise focus is
    // left on a control behind the overlay after the dialog closes.
    openerRef.current = document.activeElement;
    dialogRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onClose?.();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const t = buildTokens(theme);

  const palette = {
    danger: { color: t.danger, Icon: AlertTriangle, btn: 'adm-btn-danger' },
    warning: { color: t.warning, Icon: AlertCircle, btn: 'adm-btn-primary' },
    success: { color: t.success, Icon: CheckCircle2, btn: 'adm-btn-success' },
    info: { color: t.info, Icon: Info, btn: 'adm-btn-primary' },
  }[type] || { color: t.pri, Icon: Info, btn: 'adm-btn-primary' };

  const { color, Icon, btn } = palette;

  const handleConfirm = () => {
    if (loading) return;
    onConfirm();
    if (!loading) onClose?.();
  };

  return (
    <div
      className="adm-overlay"
      style={{ zIndex: 99999 }}
      onClick={loading ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="adm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adm-modal-body" style={{ display: 'flex', gap: 14 }}>
          <span
            className="adm-stat-icon"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: `${color}1F`,
              color,
              flexShrink: 0,
            }}
          >
            <Icon size={20} />
          </span>

          <div style={{ minWidth: 0 }}>
            <h3 id="confirm-modal-title" className="adm-modal-title" style={{ marginBottom: 6 }}>
              {title}
            </h3>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: t.sub }}>{message}</p>
          </div>
        </div>

        <div className="adm-modal-foot">
          <button type="button" className="adm-btn adm-btn-outline" onClick={onClose} disabled={loading}>
            {cancelText}
          </button>
          <button type="button" className={`adm-btn ${btn}`} onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 size={15} className="adm-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
