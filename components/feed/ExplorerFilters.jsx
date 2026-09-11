import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Baby, BookOpen, Check, ChevronLeft, ChevronRight, Clock, Dumbbell, Gamepad2, LayoutGrid,
  Laugh, Music, Palette, Plane, Shirt, Sparkles, Utensils,
} from 'lucide-react';
import { ALL, TIME_RANGES } from '../../utils/explorerFeed';
import { readableOn } from '../../utils/color';

// Categories are admin-managed; their `icon` is free text. An emoji there is
// used as-is (that is what the admin picked); otherwise a known slug or icon
// name gets the matching line icon, and anything else goes without.
const LINE_ICONS = {
  music: Music, song: Music, songs: Music,
  comedy: Laugh, funny: Laugh, humor: Laugh,
  sport: Dumbbell, sports: Dumbbell, fitness: Dumbbell,
  food: Utensils, cooking: Utensils,
  travel: Plane,
  art: Palette, arts: Palette,
  gaming: Gamepad2, games: Gamepad2,
  fashion: Shirt, style: Shirt,
  beauty: Sparkles,
  education: BookOpen, learning: BookOpen,
  kids: Baby, family: Baby,
};

const isEmoji = (s) => typeof s === 'string' && /[^\u0000-\u007f]/.test(s.trim());

export function CategoryIcon({ category, size = 14, color }) {
  if (category.id === ALL) return <LayoutGrid size={size} color={color} aria-hidden="true" />;
  if (isEmoji(category.icon)) return <span aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>{category.icon.trim()}</span>;
  const Icon = LINE_ICONS[(category.icon || '').toLowerCase()] || LINE_ICONS[(category.slug || '').toLowerCase()];
  return Icon ? <Icon size={size} color={color} aria-hidden="true" /> : null;
}

/** A horizontal chip row that shows it scrolls: fades at the edges, arrows on desktop. */
function ScrollRow({ children, label, activeKey, itemCount, T }) {
  const ref = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, itemCount]);

  // Keep the selected chip in view, e.g. when it came from the URL.
  useEffect(() => {
    const el = ref.current && ref.current.querySelector('[aria-pressed="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeKey]);

  const nudge = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  const fade = (side) => ({
    position: 'absolute', top: 0, bottom: 0, [side]: 0, width: 28, pointerEvents: 'none',
    background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, ${T.bg}, transparent)`,
  });

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <div ref={ref} role="group" aria-label={label} className="ex-chip-row">
        {children}
      </div>
      {edges.left && <div style={fade('left')} />}
      {edges.right && <div style={fade('right')} />}
      {edges.left && (
        <button type="button" className="ex-nudge ex-nudge-left" aria-label="Scroll categories left" onClick={() => nudge(-1)}
          style={{ background: T.cardBg, border: `1px solid ${T.border}`, color: T.txt }}>
          <ChevronLeft size={16} />
        </button>
      )}
      {edges.right && (
        <button type="button" className="ex-nudge ex-nudge-right" aria-label="Scroll categories right" onClick={() => nudge(1)}
          style={{ background: T.cardBg, border: `1px solid ${T.border}`, color: T.txt }}>
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

/**
 * Two separate controls: what the posts are about (categories) and how recent
 * they are (time). They used to share one row of identical pills, where
 * "Dance" and "7 days" read as the same kind of choice.
 */
export function ExplorerFilters({ categories, category, onCategory, timeRange, onTimeRange, T }) {
  const onAccent = readableOn(T.pri);

  return (
    <div className="ex-filters">
      <section className="ex-filter-section ex-filter-categories" aria-labelledby="ex-cat-label">
        <div id="ex-cat-label" className="ex-filter-label" style={{ color: T.sub }}>Categories</div>
        <ScrollRow label="Categories" activeKey={category} itemCount={categories.length} T={T}>
          {categories.map((c) => {
            const on = c.id === category;
            return (
              <button
                key={c.id}
                type="button"
                className="ex-chip"
                aria-pressed={on}
                onClick={() => onCategory(c.id)}
                style={{
                  background: on ? T.pri : T.cardBg,
                  color: on ? onAccent : T.txt,
                  borderColor: on ? T.pri : T.border,
                  fontWeight: on ? 800 : 600,
                  boxShadow: on ? `0 4px 14px ${T.pri}40` : 'none',
                }}
              >
                {on ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <CategoryIcon category={c} color={T.sub} />}
                <span>{c.name}</span>
              </button>
            );
          })}
        </ScrollRow>
      </section>

      <section className="ex-filter-section ex-filter-time" aria-labelledby="ex-time-label">
        <div id="ex-time-label" className="ex-filter-label" style={{ color: T.sub }}>
          <Clock size={11} aria-hidden="true" /> Time
        </div>
        <div role="group" aria-label="Time range" className="ex-segmented" style={{ background: T.cardBg, borderColor: T.border }}>
          {TIME_RANGES.map((r) => {
            const on = r.id === timeRange;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => onTimeRange(r.id)}
                className="ex-segment"
                style={{
                  background: on ? T.pri : 'transparent',
                  color: on ? onAccent : T.txt,
                  fontWeight: on ? 800 : 600,
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** Styles for the filter bar; rendered once by the page. */
export function explorerFilterStyles(T) {
  return `
    .ex-filters { display: flex; flex-direction: column; gap: 10px; padding: 2px 0 12px; }
    .ex-filter-label { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800;
      letter-spacing: .08em; text-transform: uppercase; margin: 0 0 6px 2px; }
    .ex-chip-row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
      scroll-snap-type: x proximity; padding: 2px 2px 4px; -webkit-overflow-scrolling: touch; }
    .ex-chip-row::-webkit-scrollbar { display: none; }
    .ex-chip { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; min-height: 36px;
      padding: 0 14px; border-radius: 999px; border: 1px solid; font-size: 13px; white-space: nowrap;
      cursor: pointer; scroll-snap-align: start; transition: background .18s ease, color .18s ease,
      border-color .18s ease, box-shadow .18s ease, transform .12s ease;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
    .ex-chip:active { transform: scale(.96); }
    .ex-segmented { display: flex; border: 1px solid; border-radius: 12px; padding: 3px; gap: 2px; }
    .ex-segment { flex: 1; min-height: 34px; padding: 0 12px; border: none; border-radius: 9px; font-size: 13px;
      cursor: pointer; white-space: nowrap; transition: background .18s ease, color .18s ease;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
    .ex-chip:focus-visible, .ex-segment:focus-visible, .ex-nudge:focus-visible, .ex-focus:focus-visible {
      outline: 2px solid ${T.pri}; outline-offset: 2px; }
    .ex-nudge { display: none; position: absolute; top: 50%; transform: translateY(-50%); width: 30px; height: 30px;
      border-radius: 50%; align-items: center; justify-content: center; cursor: pointer; z-index: 1; padding: 0; }
    .ex-nudge-left { left: -2px; } .ex-nudge-right { right: -2px; }
    @media (hover: hover) and (pointer: fine) { .ex-nudge { display: flex; } }
    @media (min-width: 760px) {
      .ex-filters { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 20px; align-items: end; }
      .ex-segmented { min-width: 260px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .ex-chip, .ex-segment { transition: none; }
    }
  `;
}
