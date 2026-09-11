import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { FILTER_CATEGORIES } from './filters/registry';

/**
 * Filter picker that sits above the record button.
 *
 * Thumbnails are the live camera run through each filter (see
 * filters/thumbnails.js); until the first set arrives each tile shows a colour
 * swatch through the filter's CSS approximation. Categories are tabs; the
 * filters form a radio group, so arrow keys move the selection and screen
 * readers announce "Warm, radio button, 3 of 6, selected".
 */
export function FilterTray({ filters, selectedId, thumbnails = {}, onSelect, onClose, notice, accent = '#8fc441' }) {
  const selected = filters.find((f) => f.id === selectedId) || filters[0];
  const categories = useMemo(
    () => FILTER_CATEGORIES.filter((c) => filters.some((f) => f.category === c.id)),
    [filters]
  );
  const [category, setCategory] = useState((selected && selected.category) || 'basic');
  const visible = filters.filter((f) => f.category === category);
  const itemRefs = useRef({});

  // Follow the selection to its tab when it changes from outside the tray.
  useEffect(() => {
    if (selected && selected.category !== category && !visible.some((f) => f.id === selectedId)) {
      setCategory(selected.category);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = itemRefs.current[selectedId];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedId, category]);

  const choose = (id, focus) => {
    onSelect(id);
    if (focus && itemRefs.current[id]) itemRefs.current[id].focus();
  };

  const onKeyDown = (e) => {
    const at = Math.max(0, visible.findIndex((f) => f.id === selectedId));
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(visible.length - 1, at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, at - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visible.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (next === null || !visible[next]) return;
    e.preventDefault();
    choose(visible[next].id, true);
  };

  const inVisible = visible.some((f) => f.id === selectedId);

  return (
    <div
      role="dialog"
      aria-label="Filters"
      style={{
        width: '100%', maxWidth: 560, boxSizing: 'border-box',
        background: 'rgba(12,12,12,0.72)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
        padding: '10px 0 12px', animation: 'ep-fade-in .22s ease both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Filters</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selected ? selected.name : ''}
          </span>
        </div>
        <button type="button" className="ep-btn" onClick={onClose} aria-label="Close filters"
          style={{ minWidth: 44, height: 36, borderRadius: 18, padding: '0 12px', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          Done
        </button>
      </div>

      {notice && (
        <div role="note" style={{ margin: '10px 16px 0', fontSize: 12.5, lineHeight: 1.4, color: 'rgba(255,255,255,0.8)' }}>
          {notice}
        </div>
      )}

      {categories.length > 1 && (
        <div role="group" aria-label="Filter categories" className="ep-filter-scroll"
          style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 12px 4px', scrollbarWidth: 'none' }}>
          {categories.map((c) => {
            const on = c.id === category;
            return (
              <button key={c.id} type="button" className="ep-btn" aria-pressed={on} onClick={() => setCategory(c.id)}
                style={{
                  flexShrink: 0, height: 32, padding: '0 14px', borderRadius: 16,
                  background: on ? '#fff' : 'rgba(255,255,255,0.1)',
                  color: on ? '#0B0B0B' : 'rgba(255,255,255,0.85)',
                  fontSize: 12.5, fontWeight: 700,
                }}>
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      <div role="radiogroup" aria-label={`${(categories.find((c) => c.id === category) || {}).label || ''} filters`}
        className="ep-filter-scroll" onKeyDown={onKeyDown}
        style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '8px 16px 2px', scrollbarWidth: 'none', scrollSnapType: 'x proximity' }}>
        {visible.map((f, i) => {
          const on = f.id === selectedId;
          const thumb = thumbnails[f.id];
          return (
            <button
              key={f.id}
              ref={(el) => { itemRefs.current[f.id] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={f.name}
              tabIndex={on || (!inVisible && i === 0) ? 0 : -1}
              className="ep-btn"
              onClick={() => choose(f.id, false)}
              style={{ flexShrink: 0, width: 66, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', padding: 0, scrollSnapAlign: 'center' }}
            >
              <span style={{
                position: 'relative', width: 58, height: 58, borderRadius: 16, overflow: 'hidden', display: 'block',
                boxShadow: on ? `0 0 0 2.5px ${accent}, 0 0 0 5px rgba(0,0,0,0.55)` : '0 0 0 1px rgba(255,255,255,0.25)',
                transform: on ? 'scale(1.04)' : 'none', transition: 'transform .15s ease, box-shadow .15s ease',
                background: '#222',
              }}>
                {thumb ? (
                  <img src={thumb} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <span style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(135deg, #f4c7a1 0%, #d98c6a 35%, #5b8fd6 70%, #2b3a55 100%)',
                    filter: f.css && f.css !== 'none' ? f.css : 'none',
                  }} />
                )}
                {on && (
                  <span aria-hidden="true" style={{
                    position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%',
                    background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={12} strokeWidth={3.2} color="#0B0B0B" />
                  </span>
                )}
              </span>
              <span style={{
                fontSize: 11, lineHeight: 1.2, textAlign: 'center', maxWidth: 66,
                color: on ? '#fff' : 'rgba(255,255,255,0.72)', fontWeight: on ? 800 : 600,
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              }}>
                {f.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The chip above the preview naming the active filter, with a reset. */
export function ActiveFilterChip({ name, onOpen, onClear }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 2, height: 32, borderRadius: 16,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.15)', color: '#fff',
    }}>
      <button type="button" className="ep-btn" onClick={onOpen} aria-label={`Filter: ${name}. Change filter`}
        style={{ height: 32, padding: '0 6px 0 12px', background: 'none', color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
        {name}
      </button>
      <button type="button" className="ep-btn" onClick={onClear} aria-label="Remove filter"
        style={{ width: 32, height: 32, borderRadius: 16, background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={14} color="#fff" />
      </button>
    </div>
  );
}
