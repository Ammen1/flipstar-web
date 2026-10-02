import { Award, Clock, Users, Vote } from 'lucide-react';
import { ensureCampaignStyles } from './campaignStyles';
import {
  BRAND,
  formatPrize,
  pluralise,
  statusTheme,
  timeRemaining,
  typeAccent,
} from './campaignTheme';

ensureCampaignStyles();

/**
 * One campaign, as a card.
 *
 * This file existed before and was imported by nothing -- a 233-line copy of
 * a card the page drew inline. Rather than add a third, the page now renders
 * this, so there is one place the card is defined.
 *
 * It was a <div onClick>: invisible to the keyboard, announced as nothing by
 * a screen reader, and containing a second <button> for the CTA -- a nested
 * interactive the inner of which cannot be tabbed to.
 *
 * A real <button> would fix the keyboard but not the markup: <button> takes
 * phrasing content only, and a card has a heading and paragraphs in it. So
 * this is a div with the button role and its keyboard contract implemented
 * explicitly -- Enter and Space, which is what a native button does and what
 * a screen reader announces. One click target for the whole card, which is
 * also what a thumb expects.
 */
export function CampaignCard({ campaign, status, onOpen, index = 0, theme, imageUrl }) {
  const T = theme;
  const brand = T?.priFallback || BRAND;
  const meta = statusTheme(status);

  // The campaign's own accent if its type has one, otherwise its status
  // colour. Never derived from the title -- see campaignTheme.js.
  const accent = typeAccent(campaign.campaign_type) || meta.accent;

  const prize = formatPrize(campaign.prize_value) || campaign.prize_title || null;
  const left = timeRemaining(campaign.entry_deadline || campaign.voting_end);

  // The counts are shown as they are. They used to be rendered as
  // `total_entries === 0 ? 1 : total_entries`, so an empty campaign claimed
  // one entry and one vote -- a number on screen that no row in the database
  // supported, and the first thing anyone checking the figures would have
  // found wrong.
  const entries = Number(campaign.total_entries) || 0;
  const votes = Number(campaign.total_votes) || 0;

  const eligibilityShown = campaign.min_level > 1;
  const eligible = campaign.user_level >= campaign.min_level;

  return (
    <div
      role="button"
      tabIndex={0}
      className="camp-card"
      onClick={() => onOpen?.(campaign.id)}
      onKeyDown={(e) => {
        // Space scrolls the page by default; a button must not.
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          onOpen?.(campaign.id);
        }
      }}
      aria-label={`${campaign.title}. ${meta.srLabel}.${prize ? ` Prize ${prize}.` : ''}${
        left && left !== 'Ended' ? ` ${left} remaining.` : ''
      }`}
      style={{
        background: T?.cardBg || '#1A1A1A',
        border: `1px solid ${accent}38`,
        borderRadius: 18,
        color: accent,
        boxShadow: `0 1px 2px rgba(0,0,0,0.18), 0 12px 28px -18px ${meta.glow}`,
        animationDelay: `${Math.min(index, 7) * 45}ms`,
      }}
    >
      {/* ── media ─────────────────────────────────────────────────────── */}
      <div
        className="camp-card-media"
        style={{
          background: imageUrl
            ? '#000'
            : `linear-gradient(135deg, ${accent}2e, ${brand}18)`,
        }}
      >
        {imageUrl ? (
          <img
            className="camp-card-img"
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Award size={48} color={accent} strokeWidth={1.5} opacity={0.55} />
          </div>
        )}

        {/* Only over the lower half, so the status pill at the top keeps its
            own contrast and the time badge at the bottom gains some. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, transparent 38%, transparent 55%, rgba(0,0,0,0.62) 100%)',
          }}
        />

        {/* status */}
        <span
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 999,
            background: meta.accent,
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            maxWidth: 'calc(100% - 20px)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#fff',
              flexShrink: 0,
            }}
          />
          {meta.label}
        </span>

        {/* type */}
        {campaign.campaign_type && (
          <span
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              padding: '5px 10px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'capitalize',
              letterSpacing: '0.3px',
            }}
          >
            {campaign.campaign_type}
          </span>
        )}

        {/* time left */}
        {left && (
          <span
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.58)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <Clock size={11} strokeWidth={2.5} aria-hidden="true" />
            {left}
          </span>
        )}
      </div>

      {/* ── body ──────────────────────────────────────────────────────── */}
      <div className="camp-card-body" style={{ padding: 14, gap: 0 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 'clamp(15px, 3.8vw, 16px)',
            fontWeight: 800,
            lineHeight: 1.3,
            color: T?.txt || '#fff',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {campaign.title}
        </h3>

        {campaign.description && (
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 12.5,
              lineHeight: 1.5,
              color: T?.sub || '#9a9a9a',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {campaign.description}
          </p>
        )}

        {/* prize -- the loudest thing on the card after the image */}
        {prize && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 12,
              background: `linear-gradient(135deg, ${accent}22, ${accent}0a)`,
              border: `1px solid ${accent}33`,
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                background: `linear-gradient(135deg, ${accent}, ${accent}aa)`,
                boxShadow: `0 3px 10px ${accent}55`,
              }}
            >
              <Award size={17} color="#000" strokeWidth={2.5} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: '0.7px',
                  textTransform: 'uppercase',
                  color: T?.sub || '#9a9a9a',
                }}
              >
                Prize
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: 'clamp(16px, 4.4vw, 19px)',
                  fontWeight: 900,
                  lineHeight: 1.15,
                  color: accent,
                  overflowWrap: 'anywhere',
                }}
              >
                {prize}
              </span>
            </span>
          </div>
        )}

        {/* stats */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {[
            { icon: Users, n: entries, label: pluralise(entries, 'Entry', 'Entries') },
            { icon: Vote, n: votes, label: pluralise(votes, 'Vote') },
          ].map(({ icon: Icon, n, label }) => (
            <span
              key={label}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 10,
                background: T?.bg || '#0D0D0D',
                border: `1px solid ${T?.border || '#262626'}`,
              }}
            >
              <Icon size={14} color={accent} strokeWidth={2.4} aria-hidden="true" />
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 15,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    color: T?.txt || '#fff',
                  }}
                >
                  {n.toLocaleString('en-US')}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 9.5,
                    fontWeight: 600,
                    letterSpacing: '0.4px',
                    textTransform: 'uppercase',
                    color: T?.sub || '#9a9a9a',
                  }}
                >
                  {label.replace(/^[\d,]+\s/, '')}
                </span>
              </span>
            </span>
          ))}
        </div>

        {eligibilityShown && (
          <div
            style={{
              marginTop: 10,
              padding: '7px 10px',
              borderRadius: 10,
              textAlign: 'center',
              background: eligible ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.10)',
              border: `1px solid ${eligible ? '#10B981' : '#EF4444'}55`,
              fontSize: 10.5,
              fontWeight: 700,
              color: eligible ? '#10B981' : '#EF4444',
            }}
          >
            {eligible
              ? 'You are eligible'
              : `Level ${campaign.user_level ?? 0} of ${campaign.min_level} required`}
          </div>
        )}

        {/* Keeps the CTA on the bottom edge whatever the description's length,
            so a row of cards ends level. */}
        <span className="camp-card-spacer" />

        {/* Not a <button>: this card already is one. */}
        <span
          className="camp-cta"
          aria-hidden="true"
          style={{
            marginTop: 12,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: 12,
            background: accent,
            color: '#07130a',
            fontSize: 13.5,
            fontWeight: 800,
            boxShadow: `0 6px 18px -6px ${accent}aa`,
          }}
        >
          View Campaign
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
            →
          </span>
        </span>
      </div>
    </div>
  );
}

export default CampaignCard;
