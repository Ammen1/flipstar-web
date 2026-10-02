import { ensureCampaignStyles } from './campaignStyles';

ensureCampaignStyles();

/**
 * A placeholder shaped like the card that replaces it.
 *
 * The old one was an image block, one line and a box -- shorter than the real
 * card, so the page jumped when the data arrived. These blocks sit where the
 * title, description, prize, stats and CTA will be, which is what makes the
 * swap invisible rather than a reflow.
 */
export function CampaignCardSkeleton({ theme, index = 0 }) {
  const T = theme;
  const base = T?.bg || '#0D0D0D';
  const highlight = T?.border || '#262626';
  const shimmer = {
    background: `linear-gradient(90deg, ${base} 0%, ${highlight} 50%, ${base} 100%)`,
  };

  const Block = ({ h, w = '100%', r = 8, mt = 0 }) => (
    <div
      className="camp-shimmer"
      style={{ height: h, width: w, borderRadius: r, marginTop: mt, ...shimmer }}
    />
  );

  return (
    <div
      aria-hidden="true"
      style={{
        background: T?.cardBg || '#1A1A1A',
        border: `1px solid ${T?.border || '#262626'}`,
        borderRadius: 18,
        overflow: 'hidden',
        animationDelay: `${Math.min(index, 7) * 45}ms`,
      }}
    >
      <div className="camp-card-media camp-shimmer" style={shimmer} />
      <div style={{ padding: 14 }}>
        <Block h={15} w="72%" />
        <Block h={11} w="100%" mt={9} />
        <Block h={11} w="58%" mt={6} />
        <Block h={58} r={12} mt={12} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Block h={44} r={10} />
          <Block h={44} r={10} />
        </div>
        <Block h={44} r={12} mt={12} />
      </div>
    </div>
  );
}

export default CampaignCardSkeleton;
