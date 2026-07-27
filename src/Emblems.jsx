import { hBlack, vBlack, cellAt } from "./regionRules.js";
import REGION_DATA from "./regionPuzzles.json";

// Each game is identified by a miniature of itself rather than a name — the
// board *is* the label. Both emblems draw into the same 100x100 box so they
// can sit side by side at any size.

const INK = "#141414";
const HAIR = "#D9D9D7";
const DARK = "#8F8F8C";
const PAPER = "#F4F4F5";

const BOX = 100, INSET = 11, SPAN = BOX - INSET * 2;

// MONO: puzzle 1's worked solution — connected black tiles, two circled cells
const MONO_TILES = [
  [1, 1, 0],
  [0, 1, 1],
  [0, 0, 0],
];
const MONO_CIRCLES = [[0, 0], [1, 2]];

// AREA: puzzle 1 — white regions, black boundaries, the answer region shaded
const AREA = REGION_DATA["1"];
const AREA_ANSWER = 3;

export function MonoEmblem() {
  const n = MONO_TILES.length;
  const t = SPAN / n;
  const circled = new Set(MONO_CIRCLES.map(([r, c]) => r + "," + c));
  const cells = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const black = MONO_TILES[r][c] === 1;
      const x = INSET + c * t, y = INSET + r * t;
      cells.push(
        <rect key={`t${r}-${c}`} x={x + 0.6} y={y + 0.6} width={t - 1.2} height={t - 1.2} rx={2.5}
          fill={black ? INK : "#FFFFFF"} stroke={black ? INK : HAIR} strokeWidth={1} />
      );
      if (circled.has(r + "," + c))
        cells.push(
          <circle key={`c${r}-${c}`} cx={x + t / 2} cy={y + t / 2} r={t * 0.27}
            fill="none" stroke={black ? "#FFFFFF" : INK} strokeWidth={2.2} />
        );
    }
  }
  return <g>{cells}</g>;
}

export function AreaEmblem() {
  const t = SPAN / Math.max(AREA.rows, AREA.cols);
  const ox = INSET + (SPAN - AREA.cols * t) / 2;
  const oy = INSET + (SPAN - AREA.rows * t) / 2;
  const parts = [];
  for (let r = 0; r < AREA.rows; r++)
    for (let c = 0; c < AREA.cols; c++) {
      const id = cellAt(AREA, r, c);
      if (id === 0) continue;
      parts.push(
        <rect key={`f${r}-${c}`} x={ox + c * t} y={oy + r * t} width={t} height={t}
          fill={id === AREA_ANSWER ? DARK : "#FFFFFF"} />
      );
    }
  for (let r = 0; r <= AREA.rows; r++)
    for (let c = 0; c < AREA.cols; c++)
      if (hBlack(AREA, r, c))
        parts.push(
          <line key={`h${r}-${c}`} x1={ox + c * t} y1={oy + r * t} x2={ox + (c + 1) * t} y2={oy + r * t}
            stroke={INK} strokeWidth={2.4} strokeLinecap="square" />
        );
  for (let r = 0; r < AREA.rows; r++)
    for (let c = 0; c <= AREA.cols; c++)
      if (vBlack(AREA, r, c))
        parts.push(
          <line key={`v${r}-${c}`} x1={ox + c * t} y1={oy + r * t} x2={ox + c * t} y2={oy + (r + 1) * t}
            stroke={INK} strokeWidth={2.4} strokeLinecap="square" />
        );
  return <g>{parts}</g>;
}

export function Emblem({ kind, size }) {
  const Shape = kind === "mono" ? MonoEmblem : AreaEmblem;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true">
      {/* both games play out on the grey paper ground, and AREA in particular
          needs it: its regions are white, so on a white card the cells outside
          them would vanish and the shapes would read wrong */}
      <rect x={0} y={0} width={BOX} height={BOX} rx={7} fill={PAPER} />
      <Shape />
    </svg>
  );
}
