import React from 'react';

export function PrivacyPolicyPage() {
  const page = {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f4f7ee 0%, #ffffff 45%)',
    color: '#111827',
    fontFamily: 'Georgia, "Times New Roman", serif',
  };

  const wrap = {
    maxWidth: 960,
    margin: '0 auto',
    padding: '48px 20px 64px',
  };

  const hero = {
    borderRadius: 28,
    padding: '32px 28px',
    background: 'linear-gradient(135deg, #101820 0%, #25371d 100%)',
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

  return (
    <div style={page}>
      <div style={wrap}>
        <section style={hero}>
          <div style={tag}>FlipStar Privacy Policy</div>
          <h1 style={{ margin: '0 0 12px', fontSize: 42, lineHeight: 1.1, fontWeight: 700 }}>
            Privacy policy for FlipStar users and store listing visitors
          </h1>
          <p style={{ ...p, color: 'rgba(249, 250, 251, 0.86)', marginBottom: 10 }}>
            This public page explains what personal data FlipStar collects, how the service uses that data, how long it may be retained, and how users can exercise privacy rights including data export and account deletion.
          </p>
          <p style={{ ...p, color: 'rgba(249, 250, 251, 0.74)', marginBottom: 0 }}>
            Current public version: <strong>2026.05</strong>
          </p>
        </section>

        <section style={card}>
          <h2 style={h2}>Data we collect</h2>
          <ul style={list}>
            <li>Account details such as username, phone number, profile information, and credentials required to operate FlipStar</li>
            <li>User-generated content including uploaded media, captions, comments, messages, consent records, and other activity you choose to create in the service</li>
            <li>Subscription, payment, wallet, reward, and transaction data needed to process purchases, withdrawals, and compliance obligations</li>
            <li>Security, device, and abuse-prevention information reasonably required to protect the service and investigate misuse</li>
          </ul>
        </section>

        <section style={card}>
          <h2 style={h2}>How FlipStar uses personal data</h2>
          <ul style={list}>
            <li>To create and manage your account, authenticate access, and deliver FlipStar features</li>
            <li>To publish and distribute content you submit, including social interactions, campaigns, gifting, and messaging features</li>
            <li>To process subscriptions, billing, payouts, customer support requests, moderation, fraud review, and security monitoring</li>
            <li>To comply with legal obligations and maintain service integrity</li>
          </ul>
        </section>

        <section style={card}>
          <h2 style={h2}>Your privacy controls</h2>
          <p style={p}>
            FlipStar users can manage notification and consent choices in the app, export their data from the authenticated account area, and request account deletion from the app or through support.
          </p>
          <ul style={list}>
            <li>Public deletion instructions: <a href="/delete-account" style={link}>/delete-account</a></li>
            <li>Support contact for privacy questions: <a href="mailto:privacy@flipstar.et" style={link}>privacy@flipstar.et</a></li>
            <li>General support: <a href="mailto:support@flipstar.et" style={link}>support@flipstar.et</a></li>
          </ul>
        </section>

        <section style={card}>
          <h2 style={h2}>Retention and deletion</h2>
          <p style={p}>
            When a user requests deletion, FlipStar removes the account and associated stored media through the current service workflow. Some limited records may still be retained where necessary for legal compliance, fraud prevention, payment reconciliation, dispute handling, or security investigations.
          </p>
          <p style={{ ...p, marginBottom: 0 }}>
            Operational account deletion is processed through the service workflow, while certain compliance or financial records may be retained for up to <strong>7 years</strong> where required.
          </p>
        </section>

        <section style={card}>
          <h2 style={h2}>Contact and updates</h2>
          <p style={p}>
            Material privacy policy changes are reflected on this page and may also be announced inside the app where appropriate. For questions about privacy rights or data handling, contact <a href="mailto:privacy@flipstar.et" style={link}>privacy@flipstar.et</a>.
          </p>
          <p style={{ ...p, marginBottom: 0 }}>
            Main website: <a href="https://flipstar.et" style={link}>https://flipstar.et</a>
          </p>
        </section>
      </div>
    </div>
  );
}