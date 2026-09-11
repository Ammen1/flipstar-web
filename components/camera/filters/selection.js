/**
 * Which filter is selected, as a reducer so the rules live in one tested
 * place rather than in click handlers:
 *
 *  - the camera starts on Normal;
 *  - only filters this device can render may be selected;
 *  - when the renderer turns out to be the limited fallback, a selection it
 *    cannot draw drops back to Normal instead of silently recording without it.
 */

import { DEFAULT_FILTER_ID, resolveFilterId } from './registry.js';

export const initialFilterState = Object.freeze({
  filterId: DEFAULT_FILTER_ID,
  // null until a renderer exists: every filter is assumed drawable.
  available: null,
});

const canUse = (state, id) => !state.available || state.available.includes(id);

export function filterReducer(state, action) {
  switch (action.type) {
    case 'select': {
      const id = resolveFilterId(action.id);
      if (!canUse(state, id) || id === state.filterId) return state;
      return { ...state, filterId: id };
    }
    case 'step': {
      // Keyboard arrows in the tray: move within the visible list, no wrap.
      const ids = (action.ids || []).filter((id) => canUse(state, id));
      if (!ids.length) return state;
      const at = ids.indexOf(state.filterId);
      const next = at < 0 ? 0 : Math.min(ids.length - 1, Math.max(0, at + action.delta));
      return ids[next] === state.filterId ? state : { ...state, filterId: ids[next] };
    }
    case 'available': {
      const available = [...action.ids];
      const filterId = available.includes(state.filterId) ? state.filterId : DEFAULT_FILTER_ID;
      return { filterId, available };
    }
    case 'reset':
      return state.filterId === DEFAULT_FILTER_ID ? state : { ...state, filterId: DEFAULT_FILTER_ID };
    default:
      return state;
  }
}
