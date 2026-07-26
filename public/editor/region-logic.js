// ---- T-junction region puzzle: rules and derivation ----
//
// A puzzle is a grid whose cells each carry a region id (0 = background).
// Every region is a 4-connected set of cells; regions never overlap.
//
// A grid line is drawn black exactly when it separates two different labels,
// so the black lines are the union of all region boundaries.
//
// Three black arms meeting at a lattice point make a T-junction: two of them
// are collinear (the *bar*), the third sticks out (the *stem*). The region on
// the far side of the bar from the stem is the bar-side region; the (up to
// two) regions touching the stem are the stem-side regions. Every stem-side
// region sends a morphism to the bar-side region.
//
// Answer: shade every region that receives no morphism.
//
// Note a self-morphism is impossible here — the two cells flanking the stem
// are separated by a black arm of the bar, so they always sit in different
// regions than the bar-side one.

export const BG = 0;

export function makeCells(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(BG));
}

export function cellAt(p, r, c) {
  if (r < 0 || r >= p.rows || c < 0 || c >= p.cols) return BG;
  return p.cells[r][c];
}

export function regionIds(p) {
  const s = new Set();
  for (const row of p.cells) for (const v of row) if (v !== BG) s.add(v);
  return [...s].sort((a, b) => a - b);
}

// horizontal line from lattice (r,c) to (r,c+1) — separates cells (r-1,c)/(r,c)
export function hBlack(p, r, c) {
  return cellAt(p, r - 1, c) !== cellAt(p, r, c);
}

// vertical line from lattice (r,c) to (r+1,c) — separates cells (r,c-1)/(r,c)
export function vBlack(p, r, c) {
  return cellAt(p, r, c - 1) !== cellAt(p, r, c);
}

export function analyze(p) {
  const { rows, cols } = p;
  const junctions = [];
  const morphisms = [];

  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      const n = i >= 1 && vBlack(p, i - 1, j);
      const s = i <= rows - 1 && vBlack(p, i, j);
      const w = j >= 1 && hBlack(p, i, j - 1);
      const e = j <= cols - 1 && hBlack(p, i, j);
      const deg = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);

      if (deg === 4) {
        junctions.push({ i, j, kind: "X" });
        continue;
      }
      if (deg === 2) {
        // collinear pairs just pass straight through; perpendicular ones bend
        if (!((n && s) || (e && w))) junctions.push({ i, j, kind: "L" });
        continue;
      }
      if (deg !== 3) continue;

      // the stem is the arm opposite the missing one; `bar` names the two
      // cells behind the bar, which share a region because the line between
      // them is the missing arm.
      let stem, bar, stemCells;
      if (!w) {
        stem = "E"; bar = [[i - 1, j - 1], [i, j - 1]]; stemCells = [[i - 1, j], [i, j]];
      } else if (!e) {
        stem = "W"; bar = [[i - 1, j], [i, j]]; stemCells = [[i - 1, j - 1], [i, j - 1]];
      } else if (!n) {
        stem = "S"; bar = [[i - 1, j - 1], [i - 1, j]]; stemCells = [[i, j - 1], [i, j]];
      } else {
        stem = "N"; bar = [[i, j - 1], [i, j]]; stemCells = [[i - 1, j - 1], [i - 1, j]];
      }

      junctions.push({ i, j, kind: "T", stem });

      const to = cellAt(p, bar[0][0], bar[0][1]);
      if (to === BG) continue;
      const seen = new Set();
      for (const [r, c] of stemCells) {
        const from = cellAt(p, r, c);
        if (from === BG || from === to || seen.has(from)) continue;
        seen.add(from);
        morphisms.push({ from, to, i, j, stem });
      }
    }
  }

  const ids = regionIds(p);
  const inDeg = new Map(ids.map((id) => [id, 0]));
  for (const m of morphisms) inDeg.set(m.to, inDeg.get(m.to) + 1);
  const dark = new Set(ids.filter((id) => inDeg.get(id) === 0));
  return { ids, junctions, morphisms, inDeg, dark };
}

// region ids whose cells are not 4-connected — those puzzles are malformed
export function splitRegions(p) {
  const bad = [];
  for (const id of regionIds(p)) {
    const cells = [];
    for (let r = 0; r < p.rows; r++)
      for (let c = 0; c < p.cols; c++) if (p.cells[r][c] === id) cells.push([r, c]);
    const seen = new Set([cells[0].join(",")]);
    const st = [cells[0]];
    while (st.length) {
      const [r, c] = st.pop();
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (cellAt(p, nr, nc) === id && !seen.has(nr + "," + nc)) {
          seen.add(nr + "," + nc);
          st.push([nr, nc]);
        }
      }
    }
    if (seen.size !== cells.length) bad.push(id);
  }
  return bad;
}
