/**
 * Text colour that stays readable on a background colour. The accent is chosen
 * in the admin panel and can be anything from a light green to near-black:
 * dark text on the first, white on the second.
 */
export function readableOn(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#FFFFFF';
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0B0F07' : '#FFFFFF';
}
