// src/lib/wheel.ts
// Pure geometry + spin maths. No React, no DOM.
//
// Angle convention: degrees, clockwise, 0 = 12 o'clock (where the pointer sits).
// Segment i spans [i * seg, (i + 1) * seg).

export type Entry = { id: string; label: string };

export const RADIUS = 100;

const mod360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Point on a circle at `deg` clockwise from 12 o'clock, in SVG coords (y down). */
function point(deg: number, r = RADIUS): readonly [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [r * Math.sin(rad), -r * Math.cos(rad)] as const;
}

/** Wedge path for segment `i` of `n`. Caller handles n === 1 with a plain circle. */
export function segmentPath(i: number, n: number, r = RADIUS): string {
  const seg = 360 / n;
  const [x1, y1] = point(i * seg, r);
  const [x2, y2] = point((i + 1) * seg, r);
  const largeArc = seg > 180 ? 1 : 0;
  return `M 0 0 L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

/** Evenly spread hues so neighbours are always distinguishable. */
export function segmentFill(i: number, n: number): string {
  const hue = Math.round((i * 360) / n);
  const light = i % 2 === 0 ? 62 : 52;
  return `hsl(${hue} 58% ${light}%)`;
}

/**
 * Radial label transform. The transform itself is in disc coords (fixed per
 * segment), but the flip decision uses the on-screen angle `mid + rotation`,
 * so labels read upright wherever the disc settles rather than only at rest.
 */
export function labelTransform(
  i: number,
  n: number,
  rotation = 0,
): { transform: string; anchor: 'start' | 'end'; x: number } {
  const seg = 360 / n;
  const mid = i * seg + seg / 2;
  const onScreen = mod360(mid + rotation);
  return onScreen > 180
    ? { transform: `rotate(${mid + 90})`, anchor: 'start', x: -(RADIUS - 12) }
    : { transform: `rotate(${mid - 90})`, anchor: 'end', x: RADIUS - 12 };
}

/** Shrinks as segments get thinner. Clamped so it never disappears. */
export function labelFontSize(n: number): number {
  return Math.max(3.5, Math.min(10, 200 / n));
}

/**
 * Radial text runs rim-to-hub, so its budget is that span rather than the
 * wedge chord. 0.58 approximates average glyph width for a proportional sans.
 */
export function labelMaxChars(fontSize: number): number {
  const span = RADIUS - 12 - 10;
  return Math.min(24, Math.max(4, Math.floor(span / (fontSize * 0.58))));
}

/**
 * Next absolute rotation that parks segment `index` under the pointer.
 * Always moves forward (current + at least `turns` full revolutions) so the
 * CSS transition never runs backwards. Lands off-centre within the segment so
 * repeat wins don't look identical.
 */
export function spinTo(current: number, index: number, n: number, turns = 5): number {
  const seg = 360 / n;
  const jitter = (Math.random() - 0.5) * seg * 0.7;
  const targetLocal = index * seg + seg / 2 + jitter;
  const delta = mod360(mod360(360 - targetLocal) - mod360(current));
  return current + delta + turns * 360;
}

/**
 * Uniform-ish random index. Modulo bias here is on the order of 1e-7 for any
 * realistic entry count — not worth a rejection loop.
 */
export function randomIndex(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

/** Splits a textarea blob into entries. Newlines and commas both separate. */
export function parseEntries(raw: string): Entry[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ id: crypto.randomUUID(), label }));
}