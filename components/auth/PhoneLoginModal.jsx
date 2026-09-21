import { useState, useEffect } from 'react';
import { Phone, User, Lock, Eye, EyeOff, Loader, X, ChevronLeft } from 'lucide-react';
import api from '../../api';
import { describeAuthError, extractErrorMessage, formatWait } from '../../utils/authErrors';
import { useLockoutTimer } from '../../utils/useLockoutTimer';
import { ForgotPasswordPhone } from './ForgotPasswordPhone';
import { FaqModal, TermsModal } from './LoginFaqTermsModals';
import { SubscriptionRegisterModal } from './SubscriptionRegisterModal';
import { sanitizePhoneInput, toE164, PHONE_MAX_DIGITS, INVALID_PHONE_MESSAGE } from '../../utils/phone';

const GOLD =
  'linear-gradient(to bottom, #8fc441 0%, #b5dd8f 50%, #6ba835 100%)';

// isMobile is closed over in the component; the module-level fallback is overridden inside.
let _isMobile = false;
const inp = (focused) => ({
  width: '100%',
  padding: _isMobile ? '9px 12px 9px 38px' : '13px 16px 13px 46px',
  background: '#1A1A1A',
  border: `1.5px solid ${focused ? '#8fc441' : '#262626'}`,
  borderRadius: 10,
  fontSize: _isMobile ? 13 : 15,
  color: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border 0.2s',
});

export function PhoneLoginModal({
  onSuccess,
  onSignUp,
  onClose,
  onForgotPasswordToggle,
  prefillPhone,
  telebirrOtpMode = false, // New prop: enable Telebirr OTP login mode
}) {
  const [phone, setPhone] = useState(prefillPhone || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [focusPhone, setFocusPhone] = useState(false);
  const [focusPwd, setFocusPwd] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'faq' | 'terms' | 'superapp-phone' | 'superapp-otp' | 'superapp-register'
  const [superappPhone, setSuperappPhone] = useState("");
  const [superappOtp, setSuperappOtp] = useState("");
  const [superappSetupOtp, setSuperappSetupOtp] = useState("");
  const [superappExistingUser, setSuperappExistingUser] = useState(false);
  const [superappLoading, setSuperappLoading] = useState(false);
  const [superappError, setSuperappError] = useState("");
  const lockout = useLockoutTimer();
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 480);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 480);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Keep module-level flag in sync so `inp()` helper picks it up
  _isMobile = isMobile;

  // Notify parent when forgot password modal state changes
  useEffect(() => {
    onForgotPasswordToggle?.(showForgot);
  }, [showForgot, onForgotPasswordToggle]);

  // Resend countdown timer
  useEffect(() => {
    let interval;
    if (resendCountdown > 0) {
      interval = setInterval(() => {
        setResendCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendCountdown]);

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError('');
    if (!phone || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (telebirrOtpMode && !toE164(phone)) {
      setError(INVALID_PHONE_MESSAGE);
      return;
    }
    setLoading(true);
    try {
      let res;
      let data;
      
      if (telebirrOtpMode) {
        // Telebirr OTP login mode
        res = await api.post('/auth/login-with-otp/', {
          phone: toE164(phone),
          code: password,
        });
        data = res.data || res;
        api.setAuthToken(data.token);
      } else {
        // Normal login accepts either the account username or the registered
        // phone number. Username login is used from the subscription page;
        // phone login remains available for existing SMS subscribers.
        res = toE164(phone)
          ? await api.post('/auth/login-with-phone/', {
              phone: toE164(phone),
              password,
            })
          : await api.login(phone.trim(), password);
        data = res.data || res;
        api.setAuthToken(data.token);
      }
      
      const userData = {
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
      };
      onSuccess(userData);
    } catch (e) {
      // 429 lockout: trigger the live countdown banner.
      if (e?.status === 429) {
        lockout.start(e.retryAfter);
        setError('');
      } else if (e?.data?.code === 'pin_not_set' || e?.data?.requires_pin_setup) {
        // Subscribing by telebirr USSD push creates the account without a PIN
        // -- there is no registration step in that flow. Telling this person
        // their PIN is wrong is false, and sending them to Sign up gets them
        // "Phone number already registered". The PIN reset is the one route
        // that works, so they are taken straight into it.
        setError('');
        setShowForgot(true);
      } else {
        const msg = e?.data?.error || e?.message || '';
        const remaining = e?.data?.attempts_remaining;
        if (msg.includes('subscription')) {
          setError('No active subscription found. Please subscribe first.');
        } else if (typeof remaining === 'number') {
          setError(
            `Invalid phone number or ${telebirrOtpMode ? 'OTP' : 'PIN'}. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`,
          );
        } else {
          setError(
            describeAuthError(
              e,
              `Invalid phone number or ${telebirrOtpMode ? 'OTP' : 'PIN'}. Please try again.`,
            ),
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSuperappPhoneSubmit = async (e) => {
    e.preventDefault();
    if (!superappPhone) {
      setSuperappError("Phone number is required");
      return;
    }
    if (!toE164(superappPhone)) {
      setSuperappError(INVALID_PHONE_MESSAGE);
      return;
    }

    setSuperappError("");
    setSuperappLoading(true);

    try {
      // Check if user has active SuperApp subscription
      const checkRes = await api.post('/subscription/check-superapp/', { phone: toE164(superappPhone) });
      console.log('✅ SuperApp check response:', checkRes.data);

      if (!checkRes.data.has_active_subscription) {
        setSuperappError("No active SuperApp subscription found. Please subscribe first.");
        setSuperappLoading(false);
        return;
      }

      // The backend resolves the tier-specific OneVAS credentials itself
      // from the subscription behind this number. They used to be read off
      // the check response and posted back here, which meant a provisioned
      // key was returned to any unauthenticated caller who knew a subscribed
      // number.
      const normalizedPhone = toE164(superappPhone);
      const otpRes = await api.post('/auth/resend-subscription-otp/', { phone: normalizedPhone });
      console.log('✅ OTP sent:', otpRes.data);

      setSuperappPhone(normalizedPhone);
      setSuperappExistingUser(Boolean(checkRes.data.user_exists));
      setSuperappSetupOtp(otpRes.data?.dev_code || "");
      setActiveModal('superapp-register');
    } catch (e) {
      console.error('❌ SuperApp phone error:', e);
      setSuperappError(extractErrorMessage(e, "Failed to check subscription or send OTP"));
    } finally {
      setSuperappLoading(false);
    }
  };

  const handleSuperappOtpSubmit = async (e) => {
    e.preventDefault();
    if (!superappPhone || !superappOtp) {
      setSuperappError("Phone and OTP are required");
      return;
    }

    setSuperappError("");
    setSuperappLoading(true);

    try {
      const res = await api.post('/auth/login-with-otp/', {
        phone: superappPhone,
        code: superappOtp
      });

      console.log('✅ SuperApp OTP login response:', res);

      const data = res.data || res;
      api.setAuthToken(data.token);

      const userData = {
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        first_name: data.user.first_name || "",
        last_name: data.user.last_name || "",
        name: data.user.first_name || data.user.username,
        profile_photo: data.user.profile_photo || null,
        bio: data.user.bio || "",
        followers_count: data.user.followers_count || 0,
        following_count: data.user.following_count || 0,
        is_staff: data.user.is_staff || false,
      };

      console.log('✅ Calling onSuccess with userData:', userData);
      onSuccess(userData);
    } catch (e) {
      console.error('❌ SuperApp OTP login error:', e);
      setSuperappError(extractErrorMessage(e, "Invalid OTP or login failed"));
    } finally {
      setSuperappLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!phone || resendCountdown > 0) return;
    
    setResendLoading(true);
    setError('');
    
    try {
      await api.post('/auth/resend-subscription-otp/', { phone: toE164(phone) });
      setResendCountdown(60); // 60 second cooldown
      setError('');
    } catch (e) {
      setError(e?.data?.error || 'Failed to resend OTP. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <>
      {showForgot && (
        <ForgotPasswordPhone
          onClose={() => setShowForgot(false)}
          onSuccess={() => setShowForgot(false)}
        />
      )}
      {activeModal === 'faq' && (
        <FaqModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'terms' && (
        <TermsModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'superapp-register' && (
        <SubscriptionRegisterModal
          prefillPhone={superappPhone}
          prefillOtp={superappSetupOtp}
          existingUser={superappExistingUser}
          fromTelebirr
          onSuccess={onSuccess}
          onBackToLogin={() => setActiveModal('superapp-phone')}
        />
      )}
      {activeModal === 'superapp-phone' && (
        <div onClick={() => setActiveModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#111", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", padding: "24px 20px 40px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#8fc441" }}>SuperApp Login</div>
              <button onClick={() => setActiveModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8fc441" }}><X size={22} /></button>
            </div>
            {superappError && (
              <div style={{ padding: "10px 14px", background: "#2D1010", border: "1px solid #EF4444", borderRadius: 8, color: "#EF4444", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                ⚠️ {superappError}
              </div>
            )}
            <form onSubmit={handleSuperappPhoneSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8fc441", marginBottom: 6 }}>Phone Number</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", color: "#8fc441" }}><Phone size={17} /><span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.2 }}>+251</span></div>
                  <input
                    type="tel"
                    value={superappPhone}
                    onChange={e => setSuperappPhone(sanitizePhoneInput(e.target.value))}
                    placeholder="9XXXXXXXX"
                    inputMode="numeric"
                    maxLength={PHONE_MAX_DIGITS}
                    aria-label="Ethiopian phone number without country code"
                    style={{ ...inp(false), paddingLeft: 74 }}
                    onFocus={e => e.target.style.border = "1.5px solid #8fc441"}
                    onBlur={e => e.target.style.border = "1.5px solid #262626"}
                  />
                </div>
              </div>
              <button type="submit" disabled={superappLoading}
                style={{ width: "100%", padding: "14px", background: superappLoading ? "#3A3A3A" : GOLD, border: "none", borderRadius: 10, color: superappLoading ? "#888" : "#000", fontSize: 15, fontWeight: 800, cursor: superappLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {superappLoading ? <><Loader size={18} style={{ animation: "spin 1s linear infinite" }} /> Checking...</> : "Send OTP"}
              </button>
            </form>
          </div>
        </div>
      )}
      {activeModal === 'superapp-otp' && (
        <div onClick={() => setActiveModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#111", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", padding: "24px 20px 40px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#8fc441" }}>Enter OTP</div>
              <button onClick={() => setActiveModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8fc441" }}><X size={22} /></button>
            </div>
            {superappError && (
              <div style={{ padding: "10px 14px", background: "#2D1010", border: "1px solid #EF4444", borderRadius: 8, color: "#EF4444", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                ⚠️ {superappError}
              </div>
            )}
            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 16 }}>
              Enter the 6-digit code sent to {superappPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}
            </div>
            <form onSubmit={handleSuperappOtpSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#8fc441", marginBottom: 6 }}>OTP Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={superappOtp}
                  onChange={e => setSuperappOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  style={{ ...inp(false), textAlign: "center", letterSpacing: 8, fontSize: 24, paddingLeft: 16 }}
                  onFocus={e => e.target.style.border = "1.5px solid #8fc441"}
                  onBlur={e => e.target.style.border = "1.5px solid #262626"}
                />
              </div>
              <button aria-label="Toggle password visibility" type="submit" disabled={superappLoading}
                style={{ width: "100%", padding: "14px", background: superappLoading ? "#3A3A3A" : GOLD, border: "none", borderRadius: 10, color: superappLoading ? "#888" : "#000", fontSize: 15, fontWeight: 800, cursor: superappLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {superappLoading ? <><Loader size={18} style={{ animation: "spin 1s linear infinite" }} /> Verifying...</> : "Login"}
              </button>
            </form>
          </div>
        </div>
      )}

      <div
        style={{
          ...(isMobile ? { height: '100dvh', overflow: 'hidden' } : { minHeight: '100vh' }),
          background: '#0D0D0D',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '8px 14px' : '20px 16px',
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
              borderRadius: isMobile ? 14 : 18,
              padding: isMobile ? '14px 16px' : '28px 24px',
              border: '1px solid #8fc44130',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: isMobile ? 10 : 28 }}>
              <div
                style={{
                  fontSize: isMobile ? 18 : 26,
                  fontWeight: 900,
                  color: '#8fc441',
                  marginBottom: isMobile ? 2 : 4,
                }}
              >
                Welcome
              </div>
              <div style={{ fontSize: isMobile ? 11 : 13, color: '#aaa' }}>
                Log in to continue to FlipStar
              </div>
            </div>

            <form onSubmit={handleLogin}>
              {lockout.isLocked && (
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
                  🔒 Too many login attempts. Try again in{' '}
                  {formatWait(lockout.remaining)}.
                </div>
              )}
              {!lockout.isLocked && error && (
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

              {/* Username or phone */}
              <div style={{ marginBottom: isMobile ? 10 : 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: isMobile ? 10 : 12,
                    fontWeight: 700,
                    color: '#8fc441',
                    marginBottom: isMobile ? 4 : 7,
                    letterSpacing: 0.5,
                  }}
                >
                  {telebirrOtpMode ? 'Phone Number' : 'Username or Phone'}
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
                    {toE164(phone) || telebirrOtpMode ? <Phone size={17} /> : <User size={17} />}
                    {toE164(phone) || telebirrOtpMode ? (
                      <span style={{ fontSize: 14, fontWeight: 700, marginLeft: 6 }}>+251</span>
                    ) : null}
                  </div>
                  <input
                    type={telebirrOtpMode ? 'tel' : 'text'}
                    value={phone}
                    onChange={(e) => setPhone(
                      telebirrOtpMode
                        ? sanitizePhoneInput(e.target.value)
                        : e.target.value.trimStart(),
                    )}
                    placeholder={telebirrOtpMode ? '9XXXXXXXX' : 'Username or 9XXXXXXXX'}
                    inputMode={telebirrOtpMode ? 'numeric' : 'text'}
                    maxLength={telebirrOtpMode ? PHONE_MAX_DIGITS : 150}
                    aria-label={telebirrOtpMode ? 'Ethiopian phone number without country code' : 'Username or phone number'}
                    style={{ ...inp(focusPhone), paddingLeft: toE164(phone) || telebirrOtpMode ? 74 : 46 }}
                    onFocus={() => setFocusPhone(true)}
                    onBlur={() => setFocusPhone(false)}
                    autoComplete="tel"
                  />
                </div>
              </div>

              {/* PIN */}
              <div style={{ marginBottom: isMobile ? 10 : 16 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: isMobile ? 10 : 12,
                    fontWeight: 700,
                    color: '#8fc441',
                    marginBottom: isMobile ? 4 : 7,
                    letterSpacing: 0.5,
                  }}
                >
                  {telebirrOtpMode ? 'OTP CODE' : 'PIN'}
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
                    type={showPassword ? 'text' : 'password'}
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
                    autoComplete="current-password"
                  />
                  <button aria-label="Toggle password visibility"
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
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
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {/* Resend OTP for Telebirr mode */}
              {telebirrOtpMode && (
                <div style={{ textAlign: 'right', marginBottom: isMobile ? 8 : 12 }}>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendLoading || resendCountdown > 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: resendCountdown > 0 ? '#666' : '#8fc441',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: resendLoading || resendCountdown > 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {resendLoading ? 'Sending...' : resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend OTP'}
                  </button>
                </div>
              )}

              {/* Login button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: loading ? '#3A3A3A' : GOLD,
                  border: 'none',
                  borderRadius: 10,
                  color: loading ? '#888' : '#000',
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: loading ? 'not-allowed' : 'pointer',
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
                      size={18}
                      style={{ animation: 'spin 1s linear infinite' }}
                    />{' '}
                    Logging in…
                  </>
                ) : (
                  'Log In'
                )}
              </button>

              {/* Forgot PIN */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8fc441',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Forgot PIN? Or set one for the first time
                </button>
              </div>
            </form>

            {/* Sign up */}
            <div style={{ textAlign: 'center', fontSize: isMobile ? 11 : 13, color: '#666', marginBottom: isMobile ? 4 : 8 }}>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onSignUp}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8fc441',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Subscribe
              </button>
            </div>

            {/* SuperApp login link */}
            <div style={{ textAlign: 'center', fontSize: isMobile ? 11 : 13, color: '#666', marginBottom: 0 }}>
              Do you have active subscription in SuperApp?{' '}
              <button
                type="button"
                onClick={() => setActiveModal('superapp-phone')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8fc441',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Login here
              </button>
            </div>

            {/* Footer: FAQ | Terms & Conditions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: isMobile ? 8 : 14,
                marginTop: isMobile ? 8 : 18,
                paddingTop: isMobile ? 8 : 16,
                borderTop: '1px solid #262626',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveModal('faq')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8fc441',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                FAQ
              </button>
              <span style={{ color: '#444', fontSize: 13 }}>|</span>
              <button
                type="button"
                onClick={() => setActiveModal('terms')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8fc441',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                Terms & Conditions
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
