/**
 * Theme mode: light, dark, or follow the system.
 *
 * No flash of the wrong theme
 * ---------------------------
 * The stored mode is read in the `useState` initialiser, not in an effect. An
 * effect runs after the first paint, so a dark-mode user would see a white
 * frame before it corrected -- the exact behaviour the brief rules out.
 *
 * Storage is read defensively: a private window, cleared site data or a
 * browser configured to block it all throw on access rather than returning
 * null, and a theme preference is not worth a blank admin.
 *
 * System tracking
 * ---------------
 * In 'system' mode the OS preference is watched live, so a machine switching
 * at sunset moves the open dashboard with it. The listener is only attached in
 * that mode -- in light or dark the user has made an explicit choice, and the
 * OS should not override it.
 */

import { useCallback, useEffect, useState } from 'react';
import { resolvePalette } from './themes';

const STORAGE_KEY = 'adminThemeMode';
const VALID = ['light', 'dark', 'system'];

function readStoredMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(stored) ? stored : 'system';
  } catch {
    // Storage unavailable (private mode, blocked cookies). Following the OS
    // is a better default than forcing one, and it needs no persistence.
    return 'system';
  }
}

export function useThemeMode() {
  // Initialiser, not an effect -- see the note above about the flash.
  const [mode, setMode] = useState(readStoredMode);
  const [palette, setPalette] = useState(() => resolvePalette(readStoredMode()));

  const changeMode = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setMode(next);
    setPalette(resolvePalette(next));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still applies for this session; it just will not persist.
    }
  }, []);

  useEffect(() => {
    setPalette(resolvePalette(mode));

    if (mode !== 'system') return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setPalette(resolvePalette('system'));

    // addEventListener on MediaQueryList is unsupported in older Safari, which
    // still ships addListener. Both are wired so the fallback is not a silent
    // no-op on those browsers.
    if (query.addEventListener) query.addEventListener('change', onChange);
    else query.addListener(onChange);

    return () => {
      if (query.removeEventListener) query.removeEventListener('change', onChange);
      else query.removeListener(onChange);
    };
  }, [mode]);

  // Mirrored onto the document so anything outside React -- the scrollbar, the
  // browser's own form controls -- picks the right rendering.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = palette.mode;
  }, [palette.mode]);

  return { mode, palette, setMode: changeMode };
}
