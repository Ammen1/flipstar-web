import { useState, useRef, useEffect } from 'react';
import {
  Phone,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader,
  ChevronLeft,
} from 'lucide-react';
import api from '../../api';
import { describeAuthError, extractErrorMessage, formatWait } from '../../utils/authErrors';
import { useLockoutTimer } from '../../utils/useLockoutTimer';
import { ForgotPasswordPhone } from './ForgotPasswordPhone';
import { TermsModal } from './LoginFaqTermsModals';
import logoG from '../../assets/70x20 (2).png';
import { sanitizePhoneInput, toE164, PHONE_MAX_DIGITS, INVALID_PHONE_MESSAGE } from '../../utils/phone';
import { missingStep } from '../../utils/registrationForm';
import { useBodyScrollLock } from '../../utils/useBodyScrollLock';

const GOLD =
  'linear-gradient(to bottom, #8fc441 0%, #b5dd8f 50%, #6ba835 100%)';

// Shared form tokens. These were repeated inline on every field, which is how
// the sizes drifted apart -- labels at 11px next to 13px helper text, inputs
// at 15px. One definition each, so a change lands everywhere.
const LABEL = {
  display: 'block',
  fontSize: 'clamp(12px, 3.2vw, 13px)',
  fontWeight: 700,
  color: '#8fc441',
  marginBottom: 6,
};

// 44px is the minimum comfortable touch target on both iOS and Android.
const TAP_TARGET = 44;

const inp = (focused) => ({
  width: '100%',
  minWidth: 0,
  // 16px is not a style choice: iOS Safari zooms the viewport on focus for any
  // input below it, and the zoom is never undone, which is how a form ends up
  // scrolled sideways with no horizontal scrollbar to put it back.
  fontSize: 16,
  padding: '13px 16px 13px 46px',
  background: '#1A1A1A',
  border: `1.5px solid ${focused ? '#8fc441' : '#262626'}`,
  borderRadius: 10,
  color: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border 0.2s',
});

// The eye / visibility toggle. Absolutely positioned inside the field, but
// given a real touch target rather than the bare icon's 17px.
const iconButton = {
  position: 'absolute',
  right: 4,
  top: '50%',
  transform: 'translateY(-50%)',
  width: TAP_TARGET,
  height: TAP_TARGET,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#8fc441',
};

const fieldIcon = {
  position: 'absolute',
  left: 14,
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#8fc441',
  display: 'flex',
  pointerEvents: 'none',
};

function OtpInput({ value, onChange }) {
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const digits = (value + '      ').slice(0, 6).split('');

  const handle = (i, e) => {
    console.log('[SUBSCRIPTION REGISTRATION MODAL] OTP input changed:', { index: i, value: e.target.value });
    const v = e.target.value.replace(/\D/g, '').slice(-1);
    const arr = digits.map((d) => d.trim());
    arr[i] = v;
    onChange(arr.join('').replace(/ /g, ''));
    if (v && i < 5) refs[i + 1].current?.focus();
    if (!v && e.nativeEvent.inputType === 'deleteContentBackward' && i > 0)
      refs[i - 1].current?.focus();
  };

  // Backspace on an ALREADY EMPTY box steps back. onChange cannot see this --
  // the value does not change, so no input event fires, and on iOS Safari the
  // deleteContentBackward inputType above is not dispatched for an empty
  // field at all. Without this the caret sticks and the only way back is to
  // tap the previous box.
  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !e.currentTarget.value && i > 0) {
      refs[i - 1].current?.focus();
    }
    if (e.key === 'ArrowLeft' && i > 0) refs[i - 1].current?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs[i + 1].current?.focus();
  };

  // A six-digit code pasted from the SMS fills the row. Per-box maxLength={1}
  // otherwise keeps the first digit and drops the rest, which reads as the
  // paste having silently failed.
  const handlePaste = (i, e) => {
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
    if (!pasted) return;
    e.preventDefault();
    const arr = digits.map((d) => d.trim());
    for (let n = 0; n < pasted.length && i + n < 6; n += 1) arr[i + n] = pasted[n];
    onChange(arr.join('').replace(/ /g, ''));
    const landed = Math.min(i + pasted.length, 5);
    refs[landed].current?.focus();
  };

  return (
    <div
      role="group"
      aria-label="Six digit code from SMS"
      style={{
        // Grid, not flex. The previous row was six boxes at `maxWidth: 15%`
        // with an 8px gap -- 6x15% + 5x8px, which exceeds 100% of the card on
        // any screen narrower than about 400px, so the first and last boxes
        // were clipped by the viewport. Grid subtracts the gaps from the
        // track width before dividing, so the row cannot outgrow its parent
        // whatever the screen is.
        display: 'grid',
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
        gap: 'clamp(4px, 1.8vw, 10px)',
        width: '100%',
        margin: '12px 0 10px',
      }}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1} of 6`}
          value={d.trim()}
          onChange={(e) => handle(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
          style={{
            // No width at all: the grid track decides it. minWidth:0 stops the
            // input's intrinsic size from forcing the track wider, which is
            // the one way a grid child can still overflow.
            minWidth: 0,
            width: '100%',
            height: 'clamp(46px, 13vw, 54px)',
            padding: 0,
            borderRadius: 10,
            textAlign: 'center',
            fontSize: 'clamp(18px, 5vw, 22px)',
            fontWeight: 800,
            color: '#fff',
            background: d.trim() ? '#14210a' : '#1A1A1A',
            border: `2px solid ${d.trim() ? '#8fc441' : '#2f2f2f'}`,
            outline: 'none',
            caretColor: '#8fc441',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Shown when user arrives via Onevas SMS link:
 * ?subscription_tp=true&phone=251XXXXXXXXX&otp=XXXXXX
 *
 * For new users: Fields: Username, Phone (pre-filled), OTP (pre-filled / editable), Password
 * For existing users: Fields: Phone (pre-filled), OTP (pre-filled / editable), Password (existing PIN)
 * Calls POST /api/auth/login-with-subscription-otp/
 */
export function SubscriptionRegisterModal({
  prefillPhone,
  prefillOtp,
  existingUser,
  onSuccess,
  onBackToLogin,
  fromTelebirr = false, // New prop: Telebirr subscription flow
}) {
  const [phone, setPhone] = useState(prefillPhone || '');
  const [otp, setOtp] = useState(prefillOtp || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusUser, setFocusUser] = useState(false);
  const [focusPhone, setFocusPhone] = useState(false);
  const [focusPwd, setFocusPwd] = useState(false);
  const [focusConfirm, setFocusConfirm] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'terms'

  // This covers the whole screen, so nothing behind it should move.
  useBodyScrollLock();

  // The number the code was sent to, shown in the subtitle. Read from what
  // was typed rather than restated, so it cannot disagree with where the SMS
  // actually went.
  const sentTo = (() => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 9) return '';
    return `+251 ${digits.slice(-9)}`;
  })();

  // Why the button is grey. Every one of these was previously invisible: the
  // button simply sat there, and the commonest support question was "why can
  // I not press Login". The rules live in utils/registrationForm.js, tested
  // against handleRegister's own checks so the two cannot drift.
  const missing = missingStep({
    otp,
    pin: password,
    confirm,
    existingUser,
    termsAgreed,
  });

  useEffect(() => {
    console.log('[SUBSCRIPTION REGISTRATION MODAL] Component mounted');
    console.log('[SUBSCRIPTION REGISTRATION MODAL] Props:', { prefillPhone, prefillOtp, existingUser });
    if (prefillPhone) {
      setPhone(prefillPhone);
      console.log('[SUBSCRIPTION REGISTRATION MODAL] Phone pre-filled:', prefillPhone);
    }
    if (prefillOtp) {
      setOtp(prefillOtp);
      console.log('[SUBSCRIPTION REGISTRATION MODAL] OTP pre-filled:', prefillOtp);
    }
  }, [prefillPhone, prefillOtp]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const handleResendOtp = async () => {
    console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Resend OTP initiated');
    console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Resend data:', { phone, resendTimer, loading });
    if (resendTimer > 0 || loading) return;
    setError('');
    setLoading(true);
    console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Calling resendSubscriptionOtp API');
    try {
      const res = await api.resendSubscriptionOtp(toE164(phone));
      const data = res.data || res;
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Resend OTP response:', { hasDevCode: !!data.dev_code, message: data.message });
      setResendTimer(60);
      if (data.dev_code) {
        setOtp(data.dev_code);
        console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Dev code received:', data.dev_code);
      }
    } catch (e) {
      console.error('[SUBSCRIPTION REGISTRATION JOURNEY] Resend OTP failed:', e);
      setError(extractErrorMessage(e, 'Failed to resend OTP. Please try again.'));
    } finally {
      setLoading(false);
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Resend OTP completed, loading=false');
    }
  };

  const handleRegister = async (e) => {
    console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Registration initiated');
    console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Form data:', { existingUser, phone, otpLength: otp?.length, passwordLength: password?.length });
    e?.preventDefault();
    setError('');

    if (!phone) {
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Validation failed: Phone missing');
      setError('Please enter your phone number');
      return;
    }
    if (!toE164(phone)) {
      setError(INVALID_PHONE_MESSAGE);
      return;
    }
    if (otp.length !== 6) {
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Validation failed: OTP length invalid');
      setError('Please enter the 6-digit OTP from your SMS');
      return;
    }
    if (!/^\d{6}$/.test(password)) {
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Validation failed: PIN format invalid');
      setError('PIN must be exactly 6 digits');
      return;
    }
    if (password !== confirm) {
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Validation failed: PINs do not match');
      setError('PINs do not match');
      return;
    }

    setLoading(true);
    console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Form validation passed, calling API');
    try {
      let res;
      let data;
      
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Using subscription OTP endpoint');
      res = await api.post('/auth/login-with-subscription-otp/', {
        phone: toE164(phone),
        otp,
        password,
      });
      data = res.data || res;
      
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Login successful:', { userId: data.user.id, username: data.user.username, is_new_user: data.is_new_user });
      api.setAuthToken(data.token);
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Auth token set');
      onSuccess({
        id: data.user.id,
        username: data.user.username,
        email: data.user.email || '',
        first_name: data.user.first_name || '',
        last_name: data.user.last_name || '',
        name: data.user.first_name || data.user.username,
        profile_photo: data.user.profile_photo || null,
        bio: data.user.bio || '',
        followers_count: data.user.followers_count || 0,
        following_count: data.user.following_count || 0,
        is_staff: data.user.is_staff || false,
      }, data.is_new_user);
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Registration journey completed successfully');
      // Clean URL params after success
      window.history.replaceState({}, '', window.location.pathname);
    } catch (e) {
      console.error('[SUBSCRIPTION REGISTRATION JOURNEY] Registration failed:', e);
      // Matched on the code, not the prose: the message can be reworded or
      // translated without this branch silently ceasing to fire. The default
      // below would otherwise blame the OTP for a username collision.
      if (e?.data?.code === 'USERNAME_TAKEN') {
        setError(e.data.error || 'That username is already in use. Please choose another username.');
        return;
      }
      setError(extractErrorMessage(e, 'Registration failed. Check your OTP and try again.'));
    } finally {
      setLoading(false);
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Registration completed, loading=false');
    }
  };

  return (
    /* A screen of its own, not a block in the page.
       It used to render inline with minHeight: 100vh, so the login form it
       was opened from sat directly underneath: scrolling down from the OTP
       boxes landed on a second login page. Fixed and opaque, it covers what
       it replaces, and useBodyScrollLock holds that page still underneath.

       alignItems is flex-start with `margin: auto` on the card rather than
       `center`, because a centred flex item taller than the viewport has its
       top cut off with no way to scroll back up to it -- which on a small
       phone is the OTP boxes themselves. */
    <div
      data-signin-screen
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: '#0D0D0D',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        overflowY: 'auto',
        // Deliberately NOT overflow-x: hidden/clip. Every child is sized to
        // fit, so nothing should overflow -- and if something later does, it
        // should show as a horizontal scrollbar rather than be silently
        // cropped the way the OTP row was.
        //
        // The side insets matter in landscape on a notched iPhone, where the
        // notch eats into the left or right edge rather than the top.
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box',
        padding:
          'max(20px, env(safe-area-inset-top, 0px)) ' +
          'max(16px, env(safe-area-inset-right, 0px)) ' +
          'calc(24px + env(safe-area-inset-bottom, 0px)) ' +
          'max(16px, env(safe-area-inset-left, 0px))',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, minWidth: 0, margin: 'auto' }}>
        {/* Logo Header */}
        <div
          style={{
            width: '100%',
            height: 'clamp(64px, 22vw, 90px)',
            marginBottom: 'clamp(16px, 5vw, 24px)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: '55%',
              backgroundColor: '#FFFFFF',
              height: '100%',
              position: 'absolute',
              left: 0,
              top: 0,
            }}
          ></div>
          <div
            style={{
              width: '45%',
              backgroundColor: '#000000',
              height: '100%',
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          ></div>
          <img
            src="./assets/70x20 (2).png"
            alt="FlipStar"
            style={{
              // Was a flat 420x90. The band around it is only as wide as the
              // card, so on every phone narrower than ~460px the logo was
              // being cropped at both ends by the band's overflow:hidden --
              // it was never visible in full on a handset.
              width: '100%',
              maxWidth: 420,
              height: '100%',
              objectFit: 'contain',
              position: 'relative',
              zIndex: 1,
            }}
          />
        </div>

        {/* Card */}
        <div
          style={{
            background: '#1A1A1A',
            borderRadius: 18,
            // Was a flat 20px side padding. On a 320px screen that left the
            // card content 248px wide, which is where the OTP row ran out of
            // room first.
            padding: 'clamp(18px, 5vw, 24px) clamp(14px, 4.5vw, 20px)',
            border: '1px solid #8fc44130',
            boxSizing: 'border-box',
            width: '100%',
            minWidth: 0,
          }}
        >
          {/* What this screen is for.
              It used to say "Subscription Renewed" to anybody who already had
              an account -- which is not what is happening here. A subscriber
              arriving from the SuperApp is verifying their number and choosing
              a PIN so they can sign in; nothing is being renewed, and reading
              that they had just been charged again was alarming as well as
              wrong. The subtitle names the number the code went to, because
              the commonest reason for being stuck on this screen is that it
              went somewhere else. */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div
              style={{
                fontSize: 'clamp(18px, 5.2vw, 21px)',
                fontWeight: 900,
                color: '#8fc441',
                marginBottom: 6,
                letterSpacing: 0.2,
              }}
            >
              {existingUser ? 'Verify & Set Your PIN' : 'Complete Registration'}
            </div>
            <div
              style={{
                fontSize: 'clamp(12px, 3.4vw, 13px)',
                lineHeight: 1.5,
                color: '#9a9a9a',
                maxWidth: 320,
                margin: '0 auto',
                overflowWrap: 'anywhere',
              }}
            >
              {existingUser
                ? 'Enter the code we sent by SMS, then choose a PIN to sign in.'
                : 'Enter the code we sent by SMS, then choose a PIN to sign in.'}
              {sentTo && (
                <>
                  {' '}
                  <span style={{ color: '#d6d6d6', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {sentTo}
                  </span>
                </>
              )}
            </div>
          </div>

          <form onSubmit={handleRegister}>
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '12px 14px',
                  background: '#2D1010',
                  border: '1px solid #EF4444',
                  borderRadius: 10,
                  color: '#EF4444',
                  fontSize: 'clamp(12px, 3.4vw, 13px)',
                  fontWeight: 600,
                  lineHeight: 1.45,
                  marginBottom: 16,
                  // A long message wraps instead of pushing the card wider.
                  // overflowWrap catches an unbroken token -- a reference or a
                  // URL in a server message -- which would otherwise set the
                  // card's minimum width and scroll the whole page sideways.
                  overflowWrap: 'anywhere',
                }}
              >
                <span aria-hidden="true">⚠️</span>
                <span style={{ minWidth: 0 }}>{error}</span>
              </div>
            )}

            {/* No username field. The subscriber arrived from an SMS and has
                already proved the number with the code; the handle was one
                more thing to invent before they could get in, and it
                authenticates nothing -- sign-in is by phone and PIN. The
                server generates one when the field is absent. */}

            {/* Phone */}
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="reg-phone" style={LABEL}>
                Phone Number *
              </label>
              <div style={{ position: 'relative' }}>
                <div style={fieldIcon}>
                  <Phone size={17} />
                </div>
                <input
                  id="reg-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                  placeholder="9XXXXXXXX"
                  inputMode="numeric"
                  maxLength={PHONE_MAX_DIGITS}
                  aria-label="Ethiopian phone number without country code"
                  style={inp(focusPhone)}
                  onFocus={() => setFocusPhone(true)}
                  onBlur={() => setFocusPhone(false)}
                />
              </div>
            </div>

            {/* OTP */}
            <div style={{ marginBottom: 14 }}>
              <label style={LABEL} id="reg-otp-label">
                OTP from SMS *
              </label>
              <OtpInput value={otp} onChange={setOtp} />
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  fontSize: 'clamp(12px, 3.2vw, 13px)',
                  color: '#aaa',
                  marginTop: 2,
                }}
              >
                <span>Didn&apos;t get the code?</span>
                {resendTimer > 0 ? (
                  <span style={{ color: '#666' }}>Resend in {resendTimer}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={loading}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8fc441',
                      fontSize: 'clamp(12px, 3.2vw, 13px)',
                      fontWeight: 700,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      // Was padding:0 on 11px text -- a tap target a few
                      // pixels tall, next to the thing a stuck subscriber
                      // most needs to press.
                      padding: '8px 6px',
                      minHeight: TAP_TARGET,
                      textDecoration: 'underline',
                    }}
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="reg-pin" style={LABEL}>
                {existingUser ? 'Set New PIN *' : 'New PIN *'}
                <span style={{ color: '#7d7d7d', fontWeight: 600, marginLeft: 6 }}>
                  6 digits
                </span>
              </label>
              <div style={{ position: 'relative' }}>
                <div style={fieldIcon}>
                  <Lock size={17} />
                </div>
                <input
                  id="reg-pin"
                  name="new-pin"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  inputMode="numeric"
                  maxLength={6}
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="••••••"
                  // Clears the 44px toggle, so the dots never run under it.
                  style={{ ...inp(focusPwd), paddingRight: TAP_TARGET + 8 }}
                  onFocus={() => setFocusPwd(true)}
                  onBlur={() => setFocusPwd(false)}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? 'Hide PIN' : 'Show PIN'}
                  aria-pressed={showPwd}
                  style={iconButton}
                >
                  {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Confirm PIN - always shown since both new and existing users set PIN */}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="reg-pin-confirm" style={LABEL}>
                Confirm PIN *
              </label>
              <div style={{ position: 'relative' }}>
                <div style={fieldIcon}>
                  <Lock size={17} />
                </div>
                <input
                  id="reg-pin-confirm"
                  name="confirm-pin"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirm}
                  onChange={(e) =>
                    setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="••••••"
                  style={{ ...inp(focusConfirm), paddingRight: TAP_TARGET + 8 }}
                  onFocus={() => setFocusConfirm(true)}
                  onBlur={() => setFocusConfirm(false)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide PIN' : 'Show PIN'}
                  aria-pressed={showConfirm}
                  style={iconButton}
                >
                  {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* What is still missing. The button used to sit grey with no
                explanation, which is the commonest way to be stuck here. */}
            {!loading && missing && (
              <div
                data-submit-hint
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  marginBottom: 10,
                  borderRadius: 10,
                  background: 'rgba(143,196,65,0.08)',
                  border: '1px solid rgba(143,196,65,0.25)',
                  color: '#c9d8b5',
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                <span aria-hidden="true" style={{ color: '#8fc441', fontWeight: 900 }}>
                  i
                </span>
                {missing}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otp.length < 6 || !termsAgreed}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                minHeight: 50,
                padding: '14px 20px',
                background: loading || otp.length < 6 || !termsAgreed ? '#3A3A3A' : GOLD,
                border: 'none',
                borderRadius: 10,
                color: loading || otp.length < 6 || !termsAgreed ? '#888' : '#000',
                fontSize: 'clamp(15px, 4vw, 16px)',
                fontWeight: 800,
                cursor: loading || otp.length < 6 || !termsAgreed ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12,
              }}
            >
              {loading ? (
                <>
                  <Loader
                    size={16}
                    style={{ animation: 'spin 1s linear infinite' }}
                  />{' '}
                  Processing…
                </>
              ) : existingUser ? (
                'Login'
              ) : (
                'Create Account'
              )}
            </button>

            {/* Terms and Conditions Checkbox */}
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor="reg-terms"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: 'pointer',
                  // The row wraps rather than stretching the card when the
                  // link runs onto a second line on a 320px screen.
                  minWidth: 0,
                  padding: '4px 0',
                }}
              >
                <input
                  id="reg-terms"
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    width: 20,
                    height: 20,
                    accentColor: '#8fc441',
                    cursor: 'pointer',
                  }}
                />
                <span
                  style={{
                    minWidth: 0,
                    fontSize: 'clamp(12px, 3.4vw, 13px)',
                    color: '#ccc',
                    lineHeight: 1.5,
                  }}
                >
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setActiveModal('terms')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8fc441',
                      fontSize: 'inherit',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    Terms and Conditions
                  </button>
                </span>
              </label>
            </div>
          </form>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              fontSize: 'clamp(12px, 3.2vw, 13px)',
              color: '#888',
            }}
          >
            <span>Already have an account?</span>
            <button
              type="button"
              onClick={onBackToLogin}
              style={{
                background: 'none',
                border: 'none',
                color: '#8fc441',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 'inherit',
                padding: '8px 6px',
                minHeight: TAP_TARGET,
                textDecoration: 'underline',
              }}
            >
              Log in
            </button>
          </div>
        </div>
      </div>

      {activeModal === 'terms' && (
        <TermsModal onClose={() => setActiveModal(null)} />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
