import { useState, useEffect } from "react";
import { Phone, Lock, Eye, EyeOff, Loader, X, ChevronLeft, MessageSquare } from "lucide-react";
import api from "../../api";
import { useLegacyT } from "../../contexts/ThemeContext";
import { sanitizePhoneInput, toE164, PHONE_MAX_DIGITS, INVALID_PHONE_MESSAGE } from '../../utils/phone';

const GOLD = "linear-gradient(to bottom, #8fc441 0%, #b8d97a 50%, #6fa32e 100%)";

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
  const [step, setStep] = useState(1);
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

  const sendCode = async () => {
    setError(""); setMsg(""); setDevCode("");
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
      const err = e?.response?.data?.error || e?.message || "Failed to send code";
      setError(err);
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
      const err = e?.response?.data?.error || e?.message || "Failed to resend code";
      setError(err);
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
      const err = e?.response?.data?.error || e?.message || "Invalid or expired code";
      setError(err);
    } finally { setLoading(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 10000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 500, maxHeight: "88vh", overflowY: "auto", padding: "24px 20px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#b8d97a" }}>
            {step === 1 ? "Forgot PIN" : step === 2 ? "Enter Reset Code" : "PIN Reset!"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#b8d97a" }}><X size={22} /></button>
        </div>
        {error && <div style={{ padding: "10px 14px", background: "#2D1010", border: "1px solid #EF4444", borderRadius: 8, color: "#EF4444", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</div>}
        {msg && <div style={{ padding: "10px 14px", background: "#1A2A1A", border: "1px solid #22C55E", borderRadius: 8, color: "#22C55E", fontSize: 13, marginBottom: 12 }}>{msg}</div>}

        {step === 1 && (
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
                maxLength={10}
              />
            </div>
            <button onClick={sendCode} disabled={loading} style={{ width: "100%", padding: "13px", background: GOLD, border: "none", borderRadius: 10, color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? <><Loader size={16} style={{ animation: "spin 1s linear infinite" }} /> Sending…</> : "Send Reset Code"}
            </button>
          </>
        )}
        {step === 2 && (
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
        {step === 3 && (
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
