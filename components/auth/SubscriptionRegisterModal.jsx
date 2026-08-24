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
import { describeAuthError, formatWait } from '../../utils/authErrors';
import { useLockoutTimer } from '../../utils/useLockoutTimer';
import { ForgotPasswordPhone } from './ForgotPasswordPhone';
import { TermsModal } from './LoginFaqTermsModals';
import logoG from '../../assets/70x20 (2).png';

const GOLD =
  'linear-gradient(to bottom, #8fc441 0%, #b5dd8f 50%, #6ba835 100%)';

const inp = (focused) => ({
  width: '100%',
  padding: '13px 16px 13px 46px',
  background: '#1A1A1A',
  border: `1.5px solid ${focused ? '#8fc441' : '#262626'}`,
  borderRadius: 10,
  fontSize: 15,
  color: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border 0.2s',
});

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

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        justifyContent: 'center',
        margin: '16px 0 24px',
      }}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d.trim()}
          onChange={(e) => handle(i, e)}
          style={{
            width: 32,
            height: 40,
            borderRadius: 6,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 800,
            color: '#fff',
            background: '#1A1A1A',
            border: `2px solid ${d.trim() ? '#8fc441' : '#262626'}`,
            outline: 'none',
            caretColor: '#8fc441',
            flex: '0 0 auto',
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
  const [username, setUsername] = useState('');
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
      const res = await api.resendSubscriptionOtp(phone);
      const data = res.data || res;
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Resend OTP response:', { hasDevCode: !!data.dev_code, message: data.message });
      setResendTimer(60);
      if (data.dev_code) {
        setOtp(data.dev_code);
        console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Dev code received:', data.dev_code);
      }
    } catch (e) {
      console.error('[SUBSCRIPTION REGISTRATION JOURNEY] Resend OTP failed:', e);
      setError(e?.response?.data?.error || e?.message || 'Failed to resend OTP');
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
    if (!existingUser && !username) {
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Validation failed: Username missing for new user');
      setError('Please enter a username');
      return;
    }
    if (!existingUser && username.length < 3) {
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Validation failed: Username too short');
      setError('Username must be at least 3 characters');
      return;
    }

    setLoading(true);
    console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Form validation passed, calling API');
    try {
      let res;
      let data;
      
      if (fromTelebirr) {
        // Use Telebirr OTP verification endpoint
        console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Using Telebirr OTP endpoint');
        res = await api.post('/auth/verify-telebirr-subscription-otp/', {
          phone,
          otp,
          username: !existingUser ? username : undefined,
          password,
        });
        data = res.data || res;
      } else {
        // Use original subscription OTP endpoint
        console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Using subscription OTP endpoint');
        res = await api.post('/auth/login-with-subscription-otp/', {
          phone,
          otp,
          password,
          username: !existingUser ? username : undefined,
        });
        data = res.data || res;
      }
      
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
      console.error('[SUBSCRIPTION REGISTRATION JOURNEY] Error details:', { response: e?.response?.data, message: e?.message });
      setError(
        e?.response?.data?.error ||
          e?.message ||
          'Registration failed. Check your OTP and try again.',
      );
    } finally {
      setLoading(false);
      console.log('[SUBSCRIPTION REGISTRATION JOURNEY] Registration completed, loading=false');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0D0D0D',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo Header */}
        <div
          style={{
            height: 90,
            marginBottom: 24,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'row',
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
            alt="Logo"
            style={{
              width: 420,
              height: 90,
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
            padding: '24px 20px',
            border: '1px solid #8fc44130',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: '#8fc441',
                marginBottom: 4,
              }}
            >
              {existingUser ? 'Subscription Renewed' : 'Complete Registration'}
            </div>
          </div>

          <form onSubmit={handleRegister}>
            {error && (
              <div
                style={{
                  padding: '10px 14px',
                  background: '#2D1010',
                  border: '1px solid #EF4444',
                  borderRadius: 8,
                  color: '#EF4444',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 16,
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* Username - only shown for new users */}
            {!existingUser && (
              <div style={{ marginBottom: 12 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#8fc441',
                    marginBottom: 5,
                  }}
                >
                  Username *
                </label>
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#8fc441',
                      display: 'flex',
                    }}
                  >
                    <User size={17} />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    style={inp(focusUser)}
                    onFocus={() => setFocusUser(true)}
                    onBlur={() => setFocusUser(false)}
                  />
                </div>
              </div>
            )}

            {/* Phone */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8fc441',
                  marginBottom: 5,
                }}
              >
                Phone Number *
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#8fc441',
                    display: 'flex',
                  }}
                >
                  <Phone size={17} />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09XXXXXXXX or +251XXXXXXXXX"
                  style={inp(focusPhone)}
                  onFocus={() => setFocusPhone(true)}
                  onBlur={() => setFocusPhone(false)}
                />
              </div>
            </div>

            {/* OTP */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8fc441',
                  marginBottom: 8,
                }}
              >
                OTP from SMS *
              </label>
              <OtpInput value={otp} onChange={setOtp} />
              <div style={{ textAlign: 'center', fontSize: 11, color: '#aaa', marginTop: 6 }}>
                Didn't get the code?{' '}
                {resendTimer > 0 ? (
                  <span style={{ color: '#666' }}>Resend in {resendTimer}s</span>
                ) : (
                  <button type="button" onClick={handleResendOtp} disabled={loading} style={{ background: 'none', border: 'none', color: '#8fc441', fontSize: 11, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', padding: 0 }}>
                    Resend OTP
                  </button>
                )}
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8fc441',
                  marginBottom: 5,
                }}
              >
                {existingUser ? 'Set New PIN *' : 'New PIN *'}
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#8fc441',
                    display: 'flex',
                  }}
                >
                  <Lock size={17} />
                </div>
                <input
                  type={showPwd ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="••••••"
                  style={{ ...inp(focusPwd), paddingRight: 46 }}
                  onFocus={() => setFocusPwd(true)}
                  onBlur={() => setFocusPwd(false)}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#8fc441',
                  }}
                >
                  {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {/* Confirm PIN - always shown since both new and existing users set PIN */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#8fc441',
                  marginBottom: 5,
                }}
              >
                Confirm PIN *
              </label>
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#8fc441',
                    display: 'flex',
                  }}
                >
                  <Lock size={17} />
                </div>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  value={confirm}
                  onChange={(e) =>
                    setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="••••••"
                  style={{ ...inp(focusConfirm), paddingRight: 46 }}
                  onFocus={() => setFocusConfirm(true)}
                  onBlur={() => setFocusConfirm(false)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#8fc441',
                  }}
                >
                  {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6 || !termsAgreed}
              style={{
                width: '100%',
                padding: '12px 20px',
                background: loading || otp.length < 6 || !termsAgreed ? '#3A3A3A' : GOLD,
                border: 'none',
                borderRadius: 10,
                color: loading || otp.length < 6 || !termsAgreed ? '#888' : '#000',
                fontSize: 14,
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
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  style={{
                    marginTop: 3,
                    width: 18,
                    height: 18,
                    accentColor: '#8fc441',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setActiveModal('terms')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8fc441',
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

          <div style={{ textAlign: 'center', fontSize: 11, color: '#666' }}>
            Already have an account?{' '}
            <button
              onClick={onBackToLogin}
              style={{
                background: 'none',
                border: 'none',
                color: '#8fc441',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 11,
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
