import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import config from '../../config';

const DANGER = '#EF4444';
const TOAST_MS = 2600;

const KEYFRAMES = `
  @keyframes fs-logout-fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes fs-logout-pop { from { opacity: 0; transform: translateY(8px) scale(.97) } to { opacity: 1; transform: none } }
  @keyframes fs-logout-toast { from { opacity: 0; transform: translate(-50%, 8px) } to { opacity: 1; transform: translate(-50%, 0) } }
  @keyframes fs-logout-spin { to { transform: rotate(360deg) } }
`;

function avatarUrl(photo) {
  if (!photo) return null;
  return photo.startsWith('http') ? photo : `${config.API_BASE_URL.replace('/api', '')}${photo}`;
}

/**
 * The single logout confirmation for the whole app.
 *
 * Every logout button calls requestLogout(); this renders the prompt, ends the
 * session, lands the user on the home feed and confirms it with a toast. It is
 * mounted in AppLayout, which stays mounted across route changes, so the toast
 * survives the navigation to "/".
 */
export function LogoutDialog() {
  const { authUser, logout, logoutPromptOpen, dismissLogout } = useAuth();
  const { colors: T } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(false);
  const cancelRef = useRef(null);

  const open = logoutPromptOpen && !!authUser;

  // Focus the safe choice, so Enter on an accidental open does not log out.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Escape cancels, and the page behind stays put while the prompt is up.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) dismissLogout(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy, dismissLogout]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(false), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Replace, so Back cannot return to a page that needs the old session.
      await logout({ beforeClear: () => navigate('/', { replace: true }) });
      setToast(true);
    } finally {
      setBusy(false);
    }
  };

  const photo = avatarUrl(authUser?.profile_photo);

  return (
    <>
      <style>{KEYFRAMES}</style>

      {open && (
        <div
          onClick={() => { if (!busy) dismissLogout(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            animation: 'fs-logout-fade .15s ease-out',
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="fs-logout-title"
            aria-describedby="fs-logout-desc"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 360,
              padding: '28px 24px 20px',
              background: T.cardBg, color: T.txt,
              border: `1px solid ${T.border}`, borderRadius: 20,
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.35)',
              textAlign: 'center',
              animation: 'fs-logout-pop .18s ease-out',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 56, height: 56, margin: '0 auto 16px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(239, 68, 68, 0.12)', color: DANGER,
              }}
            >
              <LogOut size={26} />
            </div>

            <h2 id="fs-logout-title" style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>
              {t('logoutTitle')}
            </h2>
            <p id="fs-logout-desc" style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: T.sub }}>
              {t('logoutMessage')}
            </p>

            {authUser?.username && (
              <div
                style={{
                  marginTop: 18, padding: '10px 12px', borderRadius: 12,
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: T.bg, border: `1px solid ${T.border}`, textAlign: 'left',
                }}
              >
                {photo ? (
                  <img
                    src={photo}
                    alt=""
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: T.pri + '30', color: T.txt, fontSize: 15, fontWeight: 700,
                    }}
                  >
                    {authUser.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: T.sub }}>{t('signedInAs')}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{authUser.username}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button
                ref={cancelRef}
                type="button"
                onClick={dismissLogout}
                disabled={busy}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12,
                  border: `1px solid ${T.border}`, background: 'transparent', color: T.txt,
                  fontSize: 15, fontWeight: 600,
                  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
                }}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                aria-busy={busy}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12,
                  border: 'none', background: DANGER, color: '#fff',
                  fontSize: 15, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                {busy ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'fs-logout-spin .8s linear infinite' }} />
                    {t('loggingOut')}
                  </>
                ) : t('logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', left: '50%', zIndex: 10000,
            bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
            transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 18px', borderRadius: 999,
            background: 'rgba(0, 0, 0, 0.85)', color: '#fff',
            fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            animation: 'fs-logout-toast .2s ease-out',
          }}
        >
          <CheckCircle size={18} color="#8fc441" />
          {t('loggedOut')}
        </div>
      )}
    </>
  );
}
