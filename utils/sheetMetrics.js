// How tall a bottom sheet should be, and how far to lift it off the bottom of
// the screen, measured from the *visual* viewport.
//
// Two problems this solves, both of them visible on a phone:
//
//  * a sheet as tall as its contents: "no comments yet" made a stub a few
//    lines high, with the input off the bottom of the screen;
//  * the keyboard: the browser shrinks the visual viewport when it opens, but
//    a `position: fixed` element still spans the layout viewport, so the input
//    the user just tapped ends up underneath the keyboard.
//
// visualViewport reports both, so one measurement answers both questions --
// and no device-specific offset appears anywhere.

/** A keyboard takes a serious bite out of the viewport; browser chrome
 *  collapsing takes a small one, and that must not resize the sheet. */
const KEYBOARD_MIN = 120;

/** Below this a sheet cannot show a list and an input at once. */
const MIN_HEIGHT = 280;

export function readSheetMetrics(view = typeof window === 'undefined' ? null : window) {
  if (!view) return { height: 0, lift: 0, keyboard: false };
  const vv = view.visualViewport;
  const viewport = vv ? vv.height : view.innerHeight;
  // What is covering the bottom of the layout viewport: the keyboard, or nothing.
  const covered = vv ? Math.max(0, Math.round(view.innerHeight - vv.height - vv.offsetTop)) : 0;
  const keyboard = covered > KEYBOARD_MIN;
  // 85% of what the user can actually see; nearly all of it while the keyboard
  // is up, where every pixel counts.
  const share = keyboard ? 0.92 : 0.85;
  const height = Math.max(MIN_HEIGHT, Math.round(viewport * share));
  return { height, lift: keyboard ? covered : 0, keyboard };
}

/** Subscribe to everything that changes those metrics. Returns an unsubscribe. */
export function watchSheetMetrics(onChange, view = typeof window === 'undefined' ? null : window) {
  if (!view) return () => {};
  const fire = () => onChange(readSheetMetrics(view));
  const vv = view.visualViewport;
  if (vv) {
    vv.addEventListener('resize', fire);
    vv.addEventListener('scroll', fire);
  }
  view.addEventListener('resize', fire);
  view.addEventListener('orientationchange', fire);
  return () => {
    if (vv) {
      vv.removeEventListener('resize', fire);
      vv.removeEventListener('scroll', fire);
    }
    view.removeEventListener('resize', fire);
    view.removeEventListener('orientationchange', fire);
  };
}
