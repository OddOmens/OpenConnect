import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';

// Hand-drawn shapes for doodle stickers and headline marks, drawn with rough.js as plain SVG paths so the
// editor and the headless export render exactly the same strokes (a fixed seed per shape).

const gen = rough.generator();

export interface PathSpec {
  d: string;
  stroke: string;
  strokeWidth: number;
  fill: string;
}

export type Pt = [number, number];
type Draw = (g: typeof gen, o: Options) => ReturnType<typeof gen.curve>[];

/** Stable seed for a string, so a doodle or mark keeps its wobble between renders. */
export function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (Math.abs(h) % 2_000_000) + 1;
}

export function paths(draw: Draw, o: Options): PathSpec[] {
  return draw(gen, o).flatMap((d) => gen.toPaths(d)) as PathSpec[];
}

/** Two short strokes forming an arrowhead at `tip`, pointing away from `from`. */
export function arrowHead(g: typeof gen, from: Pt, tip: Pt, len: number, o: Options) {
  const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const wing = (s: number): Pt => [tip[0] - len * Math.cos(a + s * 0.5), tip[1] - len * Math.sin(a + s * 0.5)];
  return [g.line(tip[0], tip[1], ...wing(1), o), g.line(tip[0], tip[1], ...wing(-1), o)];
}

const star = (cx: number, cy: number, outer: number, inner: number, n: number): Pt[] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });

/** Doodle stickers: name → box size and how to draw it in that box. */
export const DOODLES: Record<string, { label: string; w: number; h: number; filled?: boolean; draw: Draw }> = {
  'arrow-curve': {
    label: 'Curved arrow',
    w: 220,
    h: 130,
    draw: (g, o) => {
      const pts: Pt[] = [[12, 110], [50, 40], [120, 18], [196, 62]];
      return [g.curve(pts, o), ...arrowHead(g, pts[2], pts[3], 34, o)];
    },
  },
  'arrow-down': {
    label: 'Arrow down',
    w: 120,
    h: 190,
    draw: (g, o) => {
      const pts: Pt[] = [[30, 12], [80, 60], [50, 120], [72, 172]];
      return [g.curve(pts, o), ...arrowHead(g, pts[2], pts[3], 32, o)];
    },
  },
  'arrow-loop': {
    label: 'Loop arrow',
    w: 240,
    h: 150,
    draw: (g, o) => {
      const pts: Pt[] = [[10, 120], [70, 70], [110, 20], [80, 15], [70, 60], [140, 95], [222, 60]];
      return [g.curve(pts, o), ...arrowHead(g, pts[5], pts[6], 32, o)];
    },
  },
  'arrow-straight': {
    label: 'Arrow',
    w: 220,
    h: 70,
    draw: (g, o) => [g.line(12, 40, 205, 32, o), ...arrowHead(g, [12, 40], [205, 32], 34, o)],
  },
  underline: { label: 'Swoosh', w: 240, h: 50, draw: (g, o) => [g.curve([[10, 36], [80, 20], [170, 22], [230, 12]], o)] },
  squiggle: {
    label: 'Squiggle',
    w: 240,
    h: 60,
    draw: (g, o) => [g.curve(Array.from({ length: 13 }, (_, i) => [10 + i * 18.3, 30 + (i % 2 ? -16 : 16)] as Pt), o)],
  },
  circle: { label: 'Circle', w: 200, h: 130, draw: (g, o) => [g.ellipse(100, 65, 180, 110, o)] },
  star: { label: 'Star', w: 130, h: 130, draw: (g, o) => [g.polygon(star(65, 68, 58, 24, 5), o)] },
  'star-filled': { label: 'Star (filled)', w: 130, h: 130, filled: true, draw: (g, o) => [g.polygon(star(65, 68, 58, 24, 5), o)] },
  sparkle: { label: 'Sparkle', w: 120, h: 120, filled: true, draw: (g, o) => [g.polygon(star(60, 60, 56, 13, 4), o)] },
  burst: {
    label: 'Burst',
    w: 150,
    h: 150,
    draw: (g, o) =>
      Array.from({ length: 10 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 10;
        return g.line(75 + 34 * Math.cos(a), 75 + 34 * Math.sin(a), 75 + 68 * Math.cos(a), 75 + 68 * Math.sin(a), o);
      }),
  },
  heart: {
    label: 'Heart',
    w: 130,
    h: 120,
    draw: (g, o) => [g.path('M65 108 C 20 78 6 52 18 30 C 30 8 58 12 65 34 C 72 12 100 8 112 30 C 124 52 110 78 65 108 Z', o)],
  },
  'heart-filled': {
    label: 'Heart (filled)',
    w: 130,
    h: 120,
    filled: true,
    draw: (g, o) => [g.path('M65 108 C 20 78 6 52 18 30 C 30 8 58 12 65 34 C 72 12 100 8 112 30 C 124 52 110 78 65 108 Z', o)],
  },
  spiral: {
    label: 'Spiral',
    w: 130,
    h: 130,
    draw: (g, o) =>
      [g.curve(Array.from({ length: 40 }, (_, i) => {
        const a = i * 0.45;
        const r = 4 + i * 1.4;
        return [65 + r * Math.cos(a), 65 + r * Math.sin(a)] as Pt;
      }), o)],
  },
  check: { label: 'Check', w: 130, h: 110, draw: (g, o) => [g.curve([[12, 58], [45, 92], [118, 14]], o)] },
  cross: { label: 'Cross', w: 110, h: 110, draw: (g, o) => [g.line(14, 14, 96, 96, o), g.line(96, 14, 14, 96, o)] },
  exclaim: { label: 'Exclamation', w: 60, h: 150, draw: (g, o) => [g.line(30, 10, 28, 104, o), g.circle(29, 132, 12, { ...o, fill: o.stroke, fillStyle: 'solid' })] },
  lightning: {
    label: 'Lightning',
    w: 100,
    h: 150,
    filled: true,
    draw: (g, o) => [g.polygon([[58, 6], [14, 84], [48, 84], [36, 144], [88, 58], [54, 58], [70, 6]], o)],
  },
  crown: { label: 'Crown', w: 150, h: 110, draw: (g, o) => [g.polygon([[14, 96], [14, 30], [48, 62], [75, 14], [102, 62], [136, 30], [136, 96]], o)] },
  scribble: {
    label: 'Scribble',
    w: 220,
    h: 90,
    draw: (g, o) => [g.curve(Array.from({ length: 16 }, (_, i) => [14 + i * 12.8, 45 + Math.sin(i * 1.7) * 30] as Pt), o)],
  },
  bracket: { label: 'Bracket', w: 70, h: 200, draw: (g, o) => [g.curve([[56, 10], [22, 30], [22, 100], [8, 100], [22, 100], [22, 170], [56, 190]], o)] },
};
