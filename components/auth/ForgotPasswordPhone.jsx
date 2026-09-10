import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Lock, Eye, EyeOff, Loader, X, ChevronLeft, MessageSquare, UserX, Crown, Info } from "lucide-react";
import api from "../../api";
import { useLegacyT } from "../../contexts/ThemeContext";
import { extractErrorMessage } from "../../utils/authErrors";
import { sanitizePhoneInput, toE164, PHONE_MAX_DIGITS, INVALID_PHONE_MESSAGE } from '../../utils/phone';

const GOLD = "linear-gradient(to bottom, #8fc441 0%, #b8d97a 50%, #6fa32e 100%)";

// The server turns a reset away for a number with no account or no active
// subscription, and says how to subscribe. Those get their own panel rather
// than the red error line: retrying cannot fix them, subscribing does.
const NOT_ELIGIBLE = {
  USER_NOT_FOUND: { title: "Account not found", Icon: UserX },
  SUBSCRIPTION_REQUIRED: { title: "No active subscription", Icon: Crown },
};

const inp = (focused) => ({
  width: "100%",
  padding: "13px 16px 13px 46px",
  background: "#1A1A1A",
  border: `1.5px solid ${focused ? "#b8d97a" : "#262626"}`,
  borderRadius: 10,
  fontSize: 15,
  color: "#fff",
  outline: "none",
  boxSizing: "border-box",
  transition: "border 0.2s",
});

export function ForgotPasswordPhone({ onClose, onSuccess }) {
  const T = useLegacyT();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [notEligible, setNotEligible] = useState(null); // { code, error, hint }
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [devCode, setDevCode] = useState("");
  const [focusPhone, setFocusPhone] = useState(false);
  const [focusCode, setFocusCode] = useState(false);
  const [focusPwd, setFocusPwd] = useState(false);
  const [focusConfirm, setFocusConfirm] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  // api.request throws with the parsed body on `e.data` and that body's JSON
  // as `e.message`. Reading `e.response.data` (an axios shape this client
  // never produces) fell through to the message, so users saw raw JSON.
  const showFailure = (e, fallback) => {
    const data = e?.data || {};
    if (NOT_ELIGIBLE[data.code]) {
      setNotEligible({ code: data.code, error: data.error, hint: data.subscribe_hint });
      return;
    }
    setError(extractErrorMessage(e, fallback));
  };

  const startOver = () => {
    setNotEligible(null); setStep(1); setPhone(""); setCode(""); setPwd(""); setConfirm("");
    setError(""); setMsg(""); setDevCode("");
  };

  const goSubscribe = () => {
    onClose();
    navigate("/subscription");
  };

  const sendCode = async () => {
    setError(""); setMsg(""); setDevCode(""); setNotEligible(null);
    // The field holds the nine-digit subscriber number; +251 is a fixed
    // prefix added on submit. The old rule here demanded ten digits, which
    // this field can no longer contain.
    if (!toE164(phone)) { setError(INVALID_PHONE_MESSAGE); return; }
    setLoading(true);
    try {
      const res = await api.forgotPasswordPhoneRequest(toE164(phone));
      const data = res.data || res;
      setMsg("Reset code sent via SMS!");
      if (data.dev_code) {
        setDevCode(data.dev_code);
        setMsg(`Reset code sent! Dev code: ${data.dev_code}`);
      }
      setResendTimer(60);
      setStep(2);
    } catch (e) {
      showFailure(e, "Failed to send code");
    } finally { setLoading(false); }
  };

  const resendCode = async () => {
    if (resendTimer > 0 || loading) return;
    setError(""); setMsg(""); setDevCode("");
    setLoading(true);
    try {
      const res = await api.forgotPasswordPhoneRequest(toE164(phone));
      const data = res.data || res;
      setMsg("A new reset code has been sent via SMS!");
      if (data.dev_code) {
        setDevCode(data.dev_code);
        setMsg(`New reset code sent! Dev code: ${data.dev_code}`);
      }
      setResendTimer(60);
    } catch (e) {
      showFailure(e, "Failed to resend code");
    } finally { setLoading(false); }
  };

  const confirmReset = async () => {
    setError(""); setMsg("");
    if (code.length !== 6) { setError("Enter the 6-digit code"); return; }
    if (!/^\d{6}$/.test(pwd)) { setError("New PIN must be exactly 6 digits"); return; }
    if (pwd !== confirm) { setError("PINs do not match"); return; }
    setLoading(true);
    try {
      await api.forgotPasswordPhoneVerify(toE164(phone), code, pwd);
      setStep(3);
    } catch (e) {
      showFailure(e, "Invalid or expired code");
    } finally { setLoading(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 10000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 500, maxHeight: "88vh", overflowY: "auto", padding: "24px 20px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#b8d97a" }}>
            {notEligible || step === 1 ? "Forgot PIN" : step === 2 ? "Enter Reset Code" : "PIN Reset!"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#b8d97a" }}><X size={22} /></button>
        </div>
        {error && <div style={{ padding: "10px 14px", background: "#2D1010", border: "1px solid #EF4444", borderRadius: 8, color: "#EF4444", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
        {msg && <div style={{ padding: "10px 14px", background: "#1A2A1A", border: "1px solid #22C55E", borderRadius: 8, color: "#22C55E", fontSize: 13, marginBottom: 12 }}>{msg}</div>}

        {notEligible && (() => {
          const { title, Icon } = NOT_ELIGIBLE[notEligible.code];
          return (
            <div role="alert" style={{ textAlign: "center", padding: "4px 0" }}>
              <div style={{ width: 56, height: 56, margin: "0 auto 14px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(143, 196, 65, 0.12)", color: "#b8d97a" }}>
                <Icon size={26} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.5, marginBottom: 16 }}>{notEligible.error}</div>
              {notEligible.hint && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", padding: "12px 14px", marginBottom: 20, background: "#1A2A1A", border: "1px solid #2F4A1F", borderRadius: 10, color: "#ccc", fontSize: 13, lineHeight: 1.5 }}>
                  <Info size={16} color="#b8d97a" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{notEligible.hint}</span>
                </div>
              )}
              <button onClick={goSubscribe} style={{ width: "100%", padding: "13px", background: GOLD, border: "none", borderRadius: 10, color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                Subscribe now
              </button>
              <button onClick={startOver} style={{ width: "100%", padding: "12px", marginTop: 10, background: "transparent", border: "1px solid #262626", borderRadius: 10, color: "#b8d97a", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Use a different number
              </button>
            </div>
          );
        })()}

        {!notEligible && step === 1 && (
          <>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 16 }}>Enter your registered phone number. A 6-digit reset code will be sent via SMS.</div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6, pointerEvents: "none", color: "#b8d97a" }}><Phone size={17} /><span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.2 }}>+251</span></div>
              <input
                type="tel"
                placeholder="9XXXXXXXX"
                value={phone}
                onChange={e => setPhone(sanitizePhoneInput(e.target.value))}
                inputMode="numeric"
                maxLength={PHONE_MAX_DIGITS}
                aria-label="Ethiopian phone number without country code"
                style={{ ...inp(focusPhone), paddingLeft: 74 }}
                onFocus={() => setFocusPhone(true)}
                onBlur={() => setFocusPhone(false)}
                onKeyDown={e => e.key === "Enter" && sendCode()}
              />
            </div>
            <button onClick={sendCode} disabled={loading} style={{ width: "100%", padding: "13px", background: GOLD, border: "none", borderRadius: 10, color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? <><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> Sending…</> : "Send Reset Code"}
            </button>
          </>
        )}
        {!notEligible && step === 2 && (
          <>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 16 }}>Enter the code sent to <strong style={{ color: "#fff" }}>{phone}</strong> and your new 6-digit PIN.</div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#b8d97a", display: "flex" }}><MessageSquare size={17} /></div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={inp(focusCode)}
                onFocus={() => setFocusCode(true)}
                onBlur={() => setFocusCode(false)}
              />
            </div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#b8d97a", display: "flex" }}><Lock size={17} /></div>
              <input
                type={showPwd ? "text" : "password"}
                inputMode="numeric"
                maxLength={6}
                placeholder="New 6-digit PIN"
                value={pwd}
                onChange={e => setPwd(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={{ ...inp(focusPwd), paddingRight: 46 }}
                onFocus={() => setFocusPwd(true)}
                onBlur={() => setFocusPwd(false)}
              />
              <button aria-label="Toggle password visibility" type="button" onClick={() => setShowPwd(v => !v)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#b8d97a" }}>{showPwd ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
            <div style={{ position: "relative", marginBottom: 16 }}>
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#b8d97a", display: "flex" }}><Lock size={17} /></div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Confirm new PIN"
                value={confirm}
                onChange={e => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
                style={inp(focusConfirm)}
                onFocus={() => setFocusConfirm(true)}
                onBlur={() => setFocusConfirm(false)}
              />
            </div>
            <div style={{ textAlign: "center", marginBottom: 16, fontSize: 13, color: "#aaa" }}>
              Didn't get the code?{" "}
              {resendTimer > 0 ? (
                <span style={{ color: "#666" }}>Resend in {resendTimer}s</span>
              ) : (
                <button type="button" onClick={resendCode} disabled={loading} style={{ background: "none", border: "none", color: "#b8d97a", fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", padding: 0 }}>
                  Resend code
                </button>
              )}
            </div>
            <button onClick={confirmReset} disabled={loading} style={{ width: "100%", padding: "13px", background: GOLD, border: "none", borderRadius: 10, color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? <><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> Resetting…</> : "Reset PIN"}
            </button>
            <button onClick={() => { setStep(1); setCode(""); setError(""); setMsg(""); setDevCode(""); }} style={{ background: "none", border: "none", color: "#b8d97a", fontSize: 13, cursor: "pointer", marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <ChevronLeft size={14} /> Back
            </button>
          </>
        )}
        {!notEligible && step === 3 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#b8d97a", marginBottom: 8 }}>PIN Reset!</div>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 24 }}>You can now log in with your new PIN.</div>
            <button onClick={() => { onClose(); onSuccess && onSuccess(); }} style={{ padding: "12px 32px", background: GOLD, border: "none", borderRadius: 10, color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Go to Login</button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
