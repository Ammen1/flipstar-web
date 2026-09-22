import { useEffect } from 'react';

// Hold the page still while something is open on top of it.
//
// Without this, a full-screen sheet is only visually on top: the page
// underneath still scrolls, so dragging anywhere slides the login form up
// behind the sheet and the person ends up looking at two screens at once.
//
// Restores exactly what was there before rather than assuming `visible` or
// `auto`, because more than one thing can be open at a time and the last one
// to close must not overwrite a lock the first one still needs.

/**
 * Lock scrolling on the page while `active`.
 *
 * Locks `<html>` as well as `<body>`: iOS Safari scrolls the documentElement,
 * so locking the body alone leaves the page free to move under a fixed sheet.
 */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;

    const { body, documentElement: html } = document;
    const previous = { body: body.style.overflow, html: html.style.overflow };

    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previous.body;
      html.style.overflow = previous.html;
    };
  }, [active]);
}

export default useBodyScrollLock;
