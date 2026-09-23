/**
 * The SMS check a payer passes before a USSD Push is sent.
 *
 * Shared by the Buy Coins sheet and the subscription page so the two cannot
 * drift apart -- a payer meets the same step whichever they are paying for.
 *
 * What this component does NOT do is decide anything. It asks the server for
 * a code, hands back whatever the server says, and reports the session id
 * upward. The page then sends that id with the payment, and the server checks
 * it again. There is no local "verified" flag that means anything: if this
 * component were replaced wholesale with one that always claimed success, the
 * push would still be refused.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api';
import {
  CODE_LENGTH,
  IDLE,
  SENT,
  VERIFIED,
  canResend,
  cooldownRemaining,
  hintFor,
  isCompleteCode,
  messageFor,
} from '../../utils/paymentOtp';

const CSS = `
.otp-step{display:flex;flex-direction:column;gap:10px;padding:13px 14px;border-radius:14px;
  border:1px solid var(--otp-line,rgba(255,255,255,.1));background:var(--otp-bg,rgba(255,255,255,.03));}
.otp-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
.otp-title{font-size:13.5px;font-weight:650;margin:0;}
.otp-sub{font-size:11.5px;opacity:.68;margin:0;line-height:1.45;}
.otp-boxes{display:flex;gap:7px;}
.otp-boxes input{flex:1;min-width:0;height:46px;text-align:center;font-size:19px;font-weight:650;
  border-radius:10px;border:1px solid var(--otp-line,rgba(255,255,255,.14));
  background:var(--otp-field,rgba(0,0,0,.25));color:inherit;font-family:inherit;}
.otp-boxes input:focus{outline:2px solid var(--otp-accent,#9ae66e);outline-offset:1px;}
.otp-row{display:flex;gap:8px;align-items:center;}
.otp-btn{flex:1;min-height:42px;border-radius:11px;border:0;font:inherit;font-weight:650;
  cursor:pointer;background:var(--otp-accent,#9ae66e);color:#10240a;}
.otp-btn:disabled{opacity:.45;cursor:not-allowed;}
.otp-link{background:none;border:0;font:inherit;font-size:12px;cursor:pointer;
  color:var(--otp-accent,#9ae66e);text-decoration:underline;padding:6px 2px;}
.otp-link:disabled{opacity:.5;cursor:not-allowed;text-decoration:none;}
.otp-hint{font-size:11.5px;margin:0;min-height:15px;line-height:1.4;}
.otp-hint[data-tone="error"]{color:var(--otp-bad,#ff8f8f);}
.otp-hint[data-tone="quiet"]{opacity:.62;}
.otp-done{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;
  color:var(--otp-accent,#9ae66e);}
`;

/**
 * @param {object}   props
 * @param {string}   props.purpose        'coin_purchase' | 'subscription'
 * @param {object}   props.reference      { package_id | amount_etb | tier_id }
 * @param {string}   [props.phoneNumber]  only for payers without an account
 * @param {function} props.onVerified     (sessionId) => void
 * @param {function} props.onReset        () => void, when the step stops being verified
 */
export default function UssdOtpStep({
  purpose,
  reference,
  phoneNumber,
  onVerified,
  onReset,
  disabled = false,
}) {
  const [step, setStep] = useState(IDLE);
  const [sessionId, setSessionId] = useState(null);
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState(null);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [lastSentAt, setLastSentAt] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const [now, setNow] = useState(() => Date.now());

  const boxes = useRef([]);
  const code = digits.join('');

  // One ticker while a cooldown is running, so the countdown moves without a
  // timer per render.
  useEffect(() => {
    if (step === VERIFIED || !lastSentAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step, lastSentAt]);

  const cooldown = cooldownRemaining(lastSentAt, now, cooldownSeconds);

  // The payment this step is standing in front of changed, so a verification
  // made for the old one is no longer about anything. The server would refuse
  // it anyway (the fingerprint would not match); clearing here means the
  // payer is told before they press Pay rather than after.
  const referenceKey = JSON.stringify(reference || {});
  useEffect(() => {
    setStep(IDLE);
    setSessionId(null);
    setDigits(Array(CODE_LENGTH).fill(''));
    setError('');
    setAttemptsRemaining(null);
    setLastSentAt(null);
    if (onReset) onReset();
    // onReset is intentionally not a dependency: pages pass an inline
    // function, and depending on it would clear the step on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceKey, phoneNumber]);

  const send = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const body = { purpose, ...(reference || {}) };
      if (phoneNumber) body.phone_number = phoneNumber;
      if (sessionId) body.session_id = sessionId;

      const response = await api.request('/charging/ussd-push/request-otp/', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!response || !response.success) {
        setError(messageFor(response && response.code, response && response.error));
        return;
      }
      setSessionId(response.session_id);
      setMaskedPhone(response.phone_number || '');
      setCooldownSeconds(response.resend_after || 60);
      setLastSentAt(Date.now());
      setNow(Date.now());
      setStep(SENT);
      setAttemptsRemaining(null);
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => boxes.current[0] && boxes.current[0].focus(), 40);
    } catch (e) {
      const payload = (e && e.data) || {};
      setError(messageFor(payload.code, payload.error || (e && e.message)));
    } finally {
      setBusy(false);
    }
  }, [purpose, reference, phoneNumber, sessionId]);

  const verify = useCallback(async () => {
    if (!isCompleteCode(code)) {
      setError(messageFor('OTP_REQUIRED'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = { session_id: sessionId, code, purpose };
      if (phoneNumber) body.phone_number = phoneNumber;

      const response = await api.request('/charging/ussd-push/verify-otp/', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!response || !response.success) {
        setError(messageFor(response && response.code, response && response.error));
        if (response && typeof response.attempts_remaining === 'number') {
          setAttemptsRemaining(response.attempts_remaining);
        }
        return;
      }
      setStep(VERIFIED);
      setError('');
      if (onVerified) onVerified(response.session_id || sessionId);
    } catch (e) {
      const payload = (e && e.data) || {};
      setError(messageFor(payload.code, payload.error || (e && e.message)));
      if (typeof payload.attempts_remaining === 'number') {
        setAttemptsRemaining(payload.attempts_remaining);
      }
    } finally {
      setBusy(false);
    }
  }, [code, sessionId, purpose, phoneNumber, onVerified]);

  function typeDigit(index, value) {
    const digit = (value || '').replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < CODE_LENGTH - 1 && boxes.current[index + 1]) {
      boxes.current[index + 1].focus();
    }
  }

  function onKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      boxes.current[index - 1].focus();
    }
  }

  function onPaste(event) {
    const pasted = (event.clipboardData.getData('text') || '').replace(/\D/g, '');
    if (!pasted) return;
    event.preventDefault();
    const next = Array(CODE_LENGTH).fill('');
    pasted.slice(0, CODE_LENGTH).split('').forEach((d, i) => { next[i] = d; });
    setDigits(next);
    const last = Math.min(pasted.length, CODE_LENGTH) - 1;
    if (boxes.current[last]) boxes.current[last].focus();
  }

  const hint = hintFor({ error, cooldown, attemptsRemaining });
  const resendAllowed = canResend({ step, lastSentAt, now, cooldownSeconds, busy });

  if (step === VERIFIED) {
    return (
      <div className="otp-step" data-otp-step data-otp-state="verified">
        <style>{CSS}</style>
        <div className="otp-done" data-otp-verified>
          <span aria-hidden="true">✓</span>
          <span>Phone number verified{maskedPhone ? ` — ${maskedPhone}` : ''}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="otp-step" data-otp-step data-otp-state={step}>
      <style>{CSS}</style>

      <div className="otp-head">
        <h3 className="otp-title">Verify your phone number</h3>
      </div>

      {step === IDLE ? (
        <>
          <p className="otp-sub">
            We&apos;ll text you a 6-digit code. Payment starts only after you enter it.
          </p>
          <button
            type="button"
            className="otp-btn"
            data-otp-send
            disabled={busy || disabled}
            onClick={send}
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </>
      ) : (
        <>
          <p className="otp-sub">
            Enter the code we sent{maskedPhone ? ` to ${maskedPhone}` : ''}.
          </p>

          <div className="otp-boxes" onPaste={onPaste}>
            {digits.map((digit, index) => (
              <input
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                ref={(el) => { boxes.current[index] = el; }}
                value={digit}
                onChange={(e) => typeDigit(index, e.target.value)}
                onKeyDown={(e) => onKeyDown(index, e)}
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
                disabled={busy}
              />
            ))}
          </div>

          <div className="otp-row">
            <button
              type="button"
              className="otp-btn"
              data-otp-verify
              disabled={busy || !isCompleteCode(code)}
              onClick={verify}
            >
              {busy ? 'Checking…' : 'Verify'}
            </button>
            <button
              type="button"
              className="otp-link"
              data-otp-resend
              disabled={!resendAllowed}
              onClick={send}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </>
      )}

      <p className="otp-hint" data-otp-hint data-tone={error ? 'error' : 'quiet'}>
        {hint}
      </p>
    </div>
  );
}
