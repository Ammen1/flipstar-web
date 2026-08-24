import React from 'react';

export function DeleteAccountPage() {
  const page = {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f6f8ef 0%, #ffffff 45%)',
    color: '#111827',
    fontFamily: 'Georgia, "Times New Roman", serif',
  };

  const wrap = {
    maxWidth: 900,
    margin: '0 auto',
    padding: '48px 20px 64px',
  };

  const hero = {
    borderRadius: 28,
    padding: '32px 28px',
    background: 'linear-gradient(135deg, #101820 0%, #1d2c17 100%)',
    color: '#f9fafb',
    boxShadow: '0 20px 60px rgba(16, 24, 32, 0.18)',
    marginBottom: 24,
  };

  const card = {
    background: '#ffffff',
    border: '1px solid #dbe4cc',
    borderRadius: 24,
    padding: '28px 24px',
    boxShadow: '0 12px 32px rgba(17, 24, 39, 0.06)',
    marginBottom: 20,
  };

  const h2 = {
    margin: '0 0 14px',
    fontSize: 24,
    lineHeight: 1.2,
    color: '#152312',
    fontWeight: 700,
  };

  const p = {
    margin: '0 0 14px',
    fontSize: 16,
    lineHeight: 1.7,
    color: '#334155',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  const list = {
    margin: '0 0 0 20px',
    padding: 0,
    color: '#334155',
    fontSize: 16,
    lineHeight: 1.7,
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  const link = {
    color: '#6f9730',
    fontWeight: 700,
    textDecoration: 'none',
  };

  const tag = {
    display: 'inline-block',
    padding: '6px 10px',
    borderRadius: 999,
    background: 'rgba(143, 196, 65, 0.14)',
    color: '#8fc441',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginBottom: 16,
  };

  const stepTitle = {
    fontSize: 18,
    fontWeight: 700,
    color: '#152312',
    margin: '0 0 8px',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  return (
    <div style={page}>
      <div style={wrap}>
        <section style={hero}>
          <div style={tag}>FlipStar Account Deletion</div>
          <h1 style={{ margin: '0 0 12px', fontSize: 42, lineHeight: 1.1, fontWeight: 700 }}>
            Request deletion of your FlipStar account and associated data
          </h1>
          <p style={{ ...p, color: 'rgba(249, 250, 251, 0.86)', marginBottom: 0 }}>
            This page is provided for FlipStar users and Google Play listing visitors. FlipStar is operated for the service described on the store listing, and this page explains how to request account deletion, what data is deleted, what data may be retained, and the applicable retention periods.
          </p>
        </section>

        <section style={card}>
          <h2 style={h2}>How to request account deletion</h2>
          <div style={{ display: 'grid', gap: 18 }}>
            <div>
              <div style={stepTitle}>Option 1: Request deletion inside the FlipStar app</div>
              <p style={p}>
                Sign in to your FlipStar account, open <strong>Profile</strong>, go to <strong>Settings</strong>, and choose <strong>Delete Account</strong>. Submit the request from the authenticated account you want removed.
              </p>
            </div>
            <div>
              <div style={stepTitle}>Option 2: Contact support if you cannot access the app</div>
              <p style={p}>
                Send your deletion request to <a href="mailto:support@flipstar.et" style={link}>support@flipstar.et</a>. Include the phone number, username, or email address associated with your FlipStar account so the request can be verified.
              </p>
              <p style={p}>
                You can also use SMS support at <strong>8994</strong> to request assistance with the deletion process.
              </p>
            </div>
          </div>
        </section>

        <section style={card}>
          <h2 style={h2}>What data is deleted</h2>
          <ul style={list}>
            <li>Your account profile and account access credentials</li>
            <li>Your posted content, including uploaded flips, captions, and profile details associated with the account</li>
            <li>Your comments, likes, saved items, and similar account-linked activity where deletion is supported by the system workflow</li>
            <li>Other user data directly associated with operating your FlipStar account</li>
          </ul>
        </section>

        <section style={card}>
          <h2 style={h2}>What data may be retained</h2>
          <p style={p}>
            Some limited records may be retained where required for legal compliance, fraud prevention, payment reconciliation, dispute handling, security investigations, or enforcement of platform rules.
          </p>
          <ul style={list}>
            <li>Transaction and financial compliance records</li>
            <li>Fraud, abuse, and security logs</li>
            <li>Records needed to comply with applicable legal or regulatory obligations</li>
          </ul>
        </section>

        <section style={card}>
          <h2 style={h2}>Deletion timeline and retention period</h2>
          <p style={p}>
            After FlipStar receives and confirms your deletion request, the account enters the deletion process. The current service flow states that the account is permanently deleted within <strong>30 days</strong>.
          </p>
          <p style={p}>
            Some retained records may be kept for legal compliance for up to <strong>7 years</strong>.
          </p>
        </section>

        <section style={card}>
          <h2 style={h2}>Need help?</h2>
          <p style={p}>
            For help with account deletion requests, contact <a href="mailto:support@flipstar.et" style={link}>support@flipstar.et</a> or visit <a href="https://flipstar.et" style={link}>https://flipstar.et</a>.
          </p>
          <p style={{ ...p, marginBottom: 0 }}>
            You can also review the public privacy policy at <a href="/privacy-policy" style={link}>/privacy-policy</a>.
          </p>
        </section>
      </div>
    </div>
  );
}