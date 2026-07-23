import React, { useRef, useState, useEffect, useCallback } from "react";

// ---- palette (strict monochrome) ----
const PAPER = "#F4F4F5";
const INK = "#141414";
const HAIR = "#D9D9D7";
const DOT = "#E4E4E2";
const DIM = "#B5B5B2";
const RED = "#E23B3B";   // brief error flash on rule-breaking cells

// ---- geometry ----
const T = 62;       // tile size
const PADX = 26;
const PADTOP = 44;
const PADBOT = 26;

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---- triangular puzzles ----
// A "tri" puzzle is a big equilateral triangle split into rows of small
// triangles. Row r holds 2r+1 triangles; even col = points up, odd = down.
// Cells are labelled left-to-right, top-to-bottom (1..N); label L in row r
// (with r*r cells above it) has col = L - r*r - 1.
const TRI_S = 72;                  // small-triangle side
const TRI_H = TRI_S * 0.8660254;   // small-triangle height (S * sqrt(3)/2)

// ---- hexagonal puzzles ----
// A "hex" puzzle is a diamond of flat-top hexagons arranged in columns;
// column r holds m.colCounts[r] hexagons, vertically centered on the frame.
// Adjacent columns are offset by half a hex-height, the standard flat-top
// hex-grid stagger, so consecutive column counts must differ by exactly 1
// for the whole diamond to stay mirror-symmetric on both axes.
const HEX_R = 40;                 // hex circumradius
const HEX_W = HEX_R * 2;          // hex width (point to point)
const HEX_H = HEX_R * Math.sqrt(3); // hex height (flat to flat)
const HEX_COLGAP = HEX_R * 1.5;   // horizontal spacing between column centers

// label (1-based, reading order: top to bottom, then left to right) -> [col, idx]
function hexLabelOrder(colCounts) {
  const cells = [];
  colCounts.forEach((n, r) => {
    for (let c = 0; c < n; c++) cells.push([r, c, c - (n - 1) / 2]);
  });
  cells.sort((a, b) => (a[2] - b[2]) || (a[0] - b[0]));
  return cells.map(([r, c]) => [r, c]);
}

// number of cells in row/column r
const colsOf = (m, r) => {
  if (m.shape === "tri") return 2 * r + 1;
  if (m.shape === "hex") return m.colCounts[r];
  return m.cols;
};

// label (1-based, reading order) -> [row, col] for a tri puzzle
function triLabelRC(label) {
  const r = Math.floor(Math.sqrt(label - 1));
  return [r, label - r * r - 1];
}

// six [x,y] vertices of hex column r, index c, in world coords (flat-top)
function hexVerts(m, r, c) {
  const maxCol = Math.max(...m.colCounts);
  const cx = m.x + PADX + HEX_R + r * HEX_COLGAP;
  const cy = m.y + PADTOP + (maxCol * HEX_H) / 2 + (c - (colsOf(m, r) - 1) / 2) * HEX_H;
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const ang = (Math.PI / 180) * (60 * k);
    pts.push([cx + HEX_R * Math.cos(ang), cy + HEX_R * Math.sin(ang)]);
  }
  return pts;
}

// three [x,y] vertices of tri cell (r,c) in world coords
function triVerts(m, r, c) {
  const ox = m.x + PADX, oy = m.y + PADTOP;
  const W = m.rows * TRI_S;
  const topLeft = ox + (W - r * TRI_S) / 2;
  const botLeft = ox + (W - (r + 1) * TRI_S) / 2;
  const yTop = oy + r * TRI_H, yBot = oy + (r + 1) * TRI_H;
  if (c % 2 === 0) {
    const k = c / 2;
    return [[topLeft + k * TRI_S, yTop], [botLeft + k * TRI_S, yBot], [botLeft + (k + 1) * TRI_S, yBot]];
  }
  const k = (c - 1) / 2;
  return [[topLeft + k * TRI_S, yTop], [topLeft + (k + 1) * TRI_S, yTop], [botLeft + (k + 1) * TRI_S, yBot]];
}

// edge-adjacent cells of (r,c)
function neighbors(m, r, c) {
  const res = [];
  if (m.shape === "tri") {
    if (c - 1 >= 0) res.push([r, c - 1]);
    if (c + 1 <= 2 * r) res.push([r, c + 1]);
    if (c % 2 === 0) {
      if (r + 1 < m.rows) res.push([r + 1, c + 1]); // up-tri shares base with down-tri below
    } else if (r - 1 >= 0) {
      res.push([r - 1, c - 1]);                     // down-tri shares top with up-tri above
    }
    return res;
  }
  if (m.shape === "hex") {
    const n = colsOf(m, r);
    if (c - 1 >= 0) res.push([r, c - 1]);
    if (c + 1 < n) res.push([r, c + 1]);
    const y1 = c - (n - 1) / 2;
    for (const dr of [-1, 1]) {
      const r2 = r + dr;
      if (r2 < 0 || r2 >= m.rows) continue;
      const n2 = colsOf(m, r2);
      for (let c2 = 0; c2 < n2; c2++) {
        const y2 = c2 - (n2 - 1) / 2;
        if (Math.abs(Math.abs(y2 - y1) - 0.5) < 1e-6) res.push([r2, c2]);
      }
    }
    return res;
  }
  for (const [dr, dc] of NB) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nc >= 0 && nr < m.rows && nc < m.cols) res.push([nr, nc]);
  }
  return res;
}

// point-in-convex-polygon (same-sign cross product test; works for triangles and hexagons)
function pointInPoly(px, py, pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (sign !== s) return false;
    }
  }
  return true;
}

// puzzle metadata (circles/fixedBlack/fixedWhite are 0-indexed [row,col])
const METAS = [
  { id: 1,  x: 0,    y: 0, rows: 3, cols: 3, circles: [[0, 0], [1, 2]] },
  { id: 2,  x: 380,  y: 0, rows: 3, cols: 3, circles: [[0, 2], [1, 0]] },
  { id: 3,  x: 760,  y: 0, rows: 3, cols: 3, circles: [[0, 2], [2, 0]] },
  { id: 4,  x: 1140, y: 0, rows: 3, cols: 3, circles: [[0, 0], [1, 1], [2, 0]] },
  { id: 5,  x: 1520, y: 0, rows: 3, cols: 3, circles: [[1, 0], [1, 2]], fixedBlack: [[2, 2]] },
  { id: 6,  x: 1900, y: 0, rows: 3, cols: 3, circles: [[1, 1]] },
  { id: 7,  x: 2280, y: 0, rows: 3, cols: 3, circles: [[0, 0], [0, 2], [2, 0], [2, 2]] },
  { id: 8,  x: 2660, y: 0, rows: 3, cols: 3, circles: [[1, 1], [2, 2]], fixedBlack: [[0, 0]] },
  { id: 9,  x: 3040, y: 0, rows: 3, cols: 3, circles: [[0, 1], [2, 1]], fixedWhite: [[0, 1], [2, 1]] },
  { id: 10, x: 3420, y: 0, rows: 3, cols: 3, circles: [[2, 0], [2, 1], [1, 0]] },
  { id: 11, x: 3800, y: 0, rows: 4, cols: 4, circles: [[1, 2], [1, 3], [2, 2], [2, 3]] },
  { id: 12, x: 4180, y: 0, rows: 4, cols: 4, circles: [
      [0, 0], [0, 1], [0, 2], [0, 3],
      [1, 0], [1, 3],
      [2, 0], [2, 3],
      [3, 0], [3, 1], [3, 2], [3, 3],
    ] },
  // triangular puzzles: circles/fixed listed as cell labels (1..9, reading order)
  { id: 13, x: 4560, y: 0, shape: "tri", rows: 3, triCircles: [3, 5, 7, 9] },
  { id: 14, x: 4920, y: 0, shape: "tri", rows: 3, triCircles: [1, 2, 3, 4, 5, 9], triFixedBlack: [5, 9] },
  // hexagonal puzzle: a flat-top-hex diamond, columns of 1,2,3,2,1 cells;
  // circles/fixed listed as cell labels (1..9, reading order top-to-bottom then left-to-right)
  { id: 15, x: 5320, y: 0, shape: "hex", colCounts: [1, 2, 3, 2, 1], rows: 5, hexCircles: [1, 4, 6, 7, 8, 9] },
].map((m) => {
  const hexOrder = m.shape === "hex" ? hexLabelOrder(m.colCounts) : null;
  const circles = m.shape === "tri"
    ? (m.triCircles || []).map(triLabelRC)
    : m.shape === "hex"
    ? (m.hexCircles || []).map((lbl) => hexOrder[lbl - 1])
    : m.circles;
  const fixedBlack = m.shape === "tri"
    ? (m.triFixedBlack || []).map(triLabelRC)
    : m.shape === "hex"
    ? (m.hexFixedBlack || []).map((lbl) => hexOrder[lbl - 1])
    : m.fixedBlack;
  const fixedWhite = m.shape === "tri"
    ? (m.triFixedWhite || []).map(triLabelRC)
    : m.shape === "hex"
    ? (m.hexFixedWhite || []).map((lbl) => hexOrder[lbl - 1])
    : m.fixedWhite;
  const fw = m.shape === "tri"
    ? m.rows * TRI_S + 2 * PADX
    : m.shape === "hex"
    ? (m.colCounts.length - 1) * HEX_COLGAP + HEX_W + 2 * PADX
    : m.cols * T + 2 * PADX;
  const fh = m.shape === "tri"
    ? PADTOP + m.rows * TRI_H + PADBOT
    : m.shape === "hex"
    ? PADTOP + Math.max(...m.colCounts) * HEX_H + PADBOT
    : PADTOP + m.rows * T + PADBOT;
  return {
    ...m,
    circles,
    fixedBlack,
    fixedWhite,
    fw,
    fh,
    circleSet: new Set(circles.map(([r, c]) => r + "," + c)),
    fixedSet: new Set(
      [...(fixedBlack || []), ...(fixedWhite || [])].map(([r, c]) => r + "," + c)
    ),
    fixedColor: new Map([
      ...(fixedBlack || []).map(([r, c]) => [r + "," + c, 1]),
      ...(fixedWhite || []).map(([r, c]) => [r + "," + c, 0]),
    ]),
  };
});

const frameCenter = (m) => ({ x: m.x + m.fw / 2, y: m.y + m.fh / 2 });

// ---- per-puzzle answer button (world coords, centered below each frame) ----
const BTN_W = 48, BTN_H = 30, BTN_GAP = 16;
const buttonRect = (m) => ({ x: m.x + m.fw / 2 - BTN_W / 2, y: m.y + m.fh + BTN_GAP, w: BTN_W, h: BTN_H });

// ---- tutorial guide: a worked example shown above puzzle 1 until it's solved ----
const GUIDE_SOLUTION = [
  [1, 1, 0],
  [0, 1, 1],
  [0, 0, 0],
];
const GT = 28;    // guide tile size
const GPAD = 10;
const GLABEL = 20;
const GGAP = 22;  // gap between guide and puzzle 1's frame
const GUIDE_W = GPAD * 2 + GUIDE_SOLUTION[0].length * GT;
const GUIDE_H = GLABEL + GUIDE_SOLUTION.length * GT + GPAD;

function isSolved(m, grid) {
  const key = (r, c) => r + "," + c;
  const blacks = [];
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < colsOf(m, r); c++) if (grid[r][c] === 1) blacks.push([r, c]);
  if (blacks.length > 0) {
    const seen = new Set();
    const st = [blacks[0]];
    seen.add(key(...blacks[0]));
    while (st.length) {
      const [r, c] = st.pop();
      for (const [nr, nc] of neighbors(m, r, c)) {
        if (grid[nr][nc] === 1 && !seen.has(key(nr, nc))) {
          seen.add(key(nr, nc));
          st.push([nr, nc]);
        }
      }
    }
    if (seen.size !== blacks.length) return false;
  }
  for (const [r, c] of m.circles) {
    const col = grid[r][c];
    let cnt = 0;
    for (const [nr, nc] of neighbors(m, r, c)) {
      if (grid[nr][nc] === col) cnt++;
    }
    if (cnt !== 1) return false;
  }
  return true;
}

// which cells break the rules — used to highlight mistakes after a wrong answer.
// Returns a Set of "r,c" keys: circled cells without exactly one same-colored
// neighbor, plus (when the black cells don't form a single connected region)
// every black cell, since none of the disconnected pieces is the region.
function findViolations(m, grid) {
  const key = (r, c) => r + "," + c;
  const bad = new Set();
  for (const [r, c] of m.circles) {
    const col = grid[r][c];
    let cnt = 0;
    for (const [nr, nc] of neighbors(m, r, c)) if (grid[nr][nc] === col) cnt++;
    if (cnt !== 1) bad.add(key(r, c));
  }
  const blacks = [];
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < colsOf(m, r); c++) if (grid[r][c] === 1) blacks.push([r, c]);
  if (blacks.length > 0) {
    const seen = new Set([key(...blacks[0])]);
    const st = [blacks[0]];
    while (st.length) {
      const [cr, cc] = st.pop();
      for (const [nr, nc] of neighbors(m, cr, cc))
        if (grid[nr][nc] === 1 && !seen.has(key(nr, nc))) {
          seen.add(key(nr, nc));
          st.push([nr, nc]);
        }
    }
    if (seen.size !== blacks.length)
      for (const [r, c] of blacks) bad.add(key(r, c));
  }
  return bad;
}

export default function MonoPuzzle() {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const flashTimer = useRef(null);
  // always-fresh drag handlers, so the native touch listeners (attached once)
  // never see stale state
  const handlersRef = useRef({});

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState({ x: 0, y: 0 });
  const [grids, setGrids] = useState(() =>
    METAS.map((m) => {
      const g = Array.from({ length: m.rows }, (_, r) => Array(colsOf(m, r)).fill(0));
      m.fixedColor.forEach((color, k) => {
        const [r, c] = k.split(",").map(Number);
        g[r][c] = color;
      });
      return g;
    })
  );
  const [ready, setReady] = useState(false);
  // solved[i]: last check passed and the board hasn't been edited since
  const [solved, setSolved] = useState(() => METAS.map(() => false));
  // once puzzle 1 is solved, scrolling stays unlocked even if it's edited later
  const [unlocked, setUnlocked] = useState(false);
  // transient result of the last submit: { i, ok, bad } — a brief flash; on a
  // wrong answer `bad` is the Set of rule-breaking cell keys (flashed red)
  const [flash, setFlash] = useState(null);

  // measure + initial framing on the first puzzle
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setSize({ w, h });
      if (!ready) {
        const c = frameCenter(METAS[0]);
        setCam({ x: c.x - w / 2, y: c.y - h / 2 });
        setReady(true);
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  // Touch is handled with native Touch events (not Pointer events): iOS WebKit's
  // pointermove/setPointerCapture during a touch-drag is unreliable, so a swipe
  // would only paint the first tile. Native touchmove with a fresh coordinate
  // stream + preventDefault gives reliable continuous drag-painting on iOS.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const start = (e) => {
      if (!e.touches.length) return;
      e.preventDefault();
      const t = e.touches[0];
      handlersRef.current.begin?.(t.clientX, t.clientY);
    };
    const move = (e) => {
      if (!e.touches.length) return;
      e.preventDefault();
      const t = e.touches[0];
      handlersRef.current.move?.(t.clientX, t.clientY);
    };
    const end = (e) => {
      e.preventDefault();
      handlersRef.current.end?.();
    };
    svg.addEventListener("touchstart", start, { passive: false });
    svg.addEventListener("touchmove", move, { passive: false });
    svg.addEventListener("touchend", end, { passive: false });
    svg.addEventListener("touchcancel", end, { passive: false });
    return () => {
      svg.removeEventListener("touchstart", start);
      svg.removeEventListener("touchmove", move);
      svg.removeEventListener("touchend", end);
      svg.removeEventListener("touchcancel", end);
    };
  }, []);

  const centerW = { x: cam.x + size.w / 2, y: cam.y + size.h / 2 };
  const activeIndex = METAS.findIndex(
    (m) => centerW.x >= m.x && centerW.x <= m.x + m.fw && centerW.y >= m.y && centerW.y <= m.y + m.fh
  );

  const firstSolved = unlocked;

  // evaluate a puzzle when the player presses its answer button
  const submit = useCallback((i) => {
    if (i < 0 || solved[i]) return;
    const ok = isSolved(METAS[i], grids[i]);
    if (ok) {
      setSolved((prev) => prev.map((v, j) => (j === i ? true : v)));
      if (i === 0) setUnlocked(true);
    }
    const bad = ok ? null : findViolations(METAS[i], grids[i]);
    setFlash({ i, ok, bad, t: Date.now() });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), ok ? 500 : 700);
  }, [solved, grids]);

  // world point -> puzzle index if inside its (unsolved) answer button
  const buttonAt = useCallback((wx, wy) => {
    for (let i = 0; i < METAS.length; i++) {
      if (solved[i]) continue;
      const b = buttonRect(METAS[i]);
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return i;
    }
    return -1;
  }, [solved]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  // world point -> {i,row,col} if inside some puzzle's tile area
  const tileAt = useCallback((wx, wy) => {
    for (let i = 0; i < METAS.length; i++) {
      const m = METAS[i];
      const gx = m.x + PADX, gy = m.y + PADTOP;
      if (m.shape === "tri") {
        for (let r = 0; r < m.rows; r++)
          for (let c = 0; c < colsOf(m, r); c++)
            if (pointInPoly(wx, wy, triVerts(m, r, c))) return { i, row: r, col: c };
        continue;
      }
      if (m.shape === "hex") {
        for (let r = 0; r < m.rows; r++)
          for (let c = 0; c < colsOf(m, r); c++)
            if (pointInPoly(wx, wy, hexVerts(m, r, c))) return { i, row: r, col: c };
        continue;
      }
      if (wx >= gx && wx < gx + m.cols * T && wy >= gy && wy < gy + m.rows * T) {
        const col = Math.floor((wx - gx) / T);
        const row = Math.floor((wy - gy) / T);
        return { i, row, col };
      }
    }
    return null;
  }, []);

  const toggle = useCallback((i, row, col) => {
    const m = METAS[i];
    if (m.fixedSet.has(row + "," + col)) return;
    setGrids((prev) => {
      const next = prev.map((g) => g);
      const g2 = prev[i].map((r) => r.slice());
      g2[row][col] = g2[row][col] ^ 1;
      next[i] = g2;
      return next;
    });
    // editing a checked puzzle marks it unverified again (button reappears)
    setSolved((prev) => (prev[i] ? prev.map((v, j) => (j === i ? false : v)) : prev));
  }, []);

  // ---- shared drag logic (used by both mouse/pen pointer events and touch events) ----
  const worldFrom = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: clientX - r.left + cam.x, y: clientY - r.top + cam.y };
  };

  const begin = (clientX, clientY) => {
    const w = worldFrom(clientX, clientY);
    const btn = buttonAt(w.x, w.y);
    if (btn >= 0) {
      submit(btn);
      dragRef.current = null;
      return;
    }
    const hit = tileAt(w.x, w.y);
    if (hit && hit.i === activeIndex) {
      const painted = new Set();
      toggle(hit.i, hit.row, hit.col);
      painted.add(hit.row + "," + hit.col);
      dragRef.current = { mode: "paint", puzzle: hit.i, painted };
    } else if (firstSolved) {
      dragRef.current = { mode: "pan", sx: clientX, sy: clientY, cx: cam.x, cy: cam.y };
    } else {
      dragRef.current = null;
    }
  };

  const move = (clientX, clientY) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "pan") {
      setCam({ x: d.cx - (clientX - d.sx), y: d.cy - (clientY - d.sy) });
      return;
    }
    const w = worldFrom(clientX, clientY);
    const hit = tileAt(w.x, w.y);
    if (hit && hit.i === d.puzzle) {
      const k = hit.row + "," + hit.col;
      if (!d.painted.has(k)) {
        d.painted.add(k);
        toggle(hit.i, hit.row, hit.col);
      }
    }
  };

  const end = () => { dragRef.current = null; };

  // keep the native touch listeners pointed at the latest closures
  handlersRef.current = { begin, move, end };

  // mouse/pen only — touch is handled by the native listeners above
  const onPointerDown = (e) => {
    if (e.pointerType === "touch") return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    begin(e.clientX, e.clientY);
  };
  const onPointerMove = (e) => {
    if (e.pointerType === "touch") return;
    move(e.clientX, e.clientY);
  };
  const endDrag = (e) => {
    if (e && e.pointerType === "touch") return;
    if (svgRef.current && e && e.pointerId != null) {
      try { svgRef.current.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    end();
  };

  // ---- dot field (shows camera motion over empty space) ----
  const dots = [];
  const step = 44;
  const x0 = Math.floor(cam.x / step) * step;
  const y0 = Math.floor(cam.y / step) * step;
  for (let x = x0; x < cam.x + size.w + step; x += step)
    for (let y = y0; y < cam.y + size.h + step; y += step)
      dots.push(<circle key={x + ":" + y} cx={x} cy={y} r={1} fill={DOT} />);

  return (
    <div
      ref={wrapRef}
      style={{ width: "100%", height: "100vh", background: PAPER, position: "relative", overflow: "hidden", userSelect: "none", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      <style>{`
        @keyframes puzShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(3px)} }
        @keyframes puzPulse { 0%{transform:scale(1)} 45%{transform:scale(1.05)} 100%{transform:scale(1)} }
        .puz-shake { animation: puzShake .42s ease; transform-box: fill-box; transform-origin: center; }
        .puz-pulse { animation: puzPulse .42s ease; transform-box: fill-box; transform-origin: center; }
        @keyframes hintBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(4px)} }
        .hint-bob { animation: hintBob 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      `}</style>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        style={{ display: "block", touchAction: "none", cursor: dragRef.current?.mode === "pan" ? "grabbing" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {/* WORLD LAYER */}
        <g transform={`translate(${-cam.x},${-cam.y})`}>
          {dots}
          {!firstSolved && (
            <GuideBoard x={METAS[0].x + (METAS[0].fw - GUIDE_W) / 2} y={-GGAP - GUIDE_H} />
          )}
          {METAS.map((m, i) => {
            const active = i === activeIndex;
            const isDone = solved[i];
            const wrong = flash && flash.i === i && !flash.ok;
            const right = flash && flash.i === i && flash.ok;
            const vio = wrong ? flash.bad : null;
            const gx = m.x + PADX, gy = m.y + PADTOP;
            const b = buttonRect(m);
            return (
              <g key={m.id} className={wrong ? "puz-shake" : right ? "puz-pulse" : undefined} opacity={active || isDone ? 1 : 0.72}>
                {/* frame */}
                <rect
                  x={m.x} y={m.y} width={m.fw} height={m.fh} rx={10}
                  fill="none"
                  stroke={isDone ? INK : active ? "#8A8A87" : HAIR}
                  strokeWidth={isDone ? 2 : 1.5}
                  strokeDasharray={wrong ? "6 4" : undefined}
                />
                {/* index */}
                <text x={m.x + PADX} y={m.y + 26} fontSize={13} fill={DIM} letterSpacing="2">
                  {String(m.id).padStart(2, "0")}
                </text>
                {/* captured mark */}
                {isDone && (
                  <rect x={m.x + m.fw - 26} y={m.y + 15} width={9} height={9} fill={INK} />
                )}
                {/* tiles */}
                {m.shape === "tri"
                  ? Array.from({ length: m.rows }).map((_, r) =>
                      Array.from({ length: colsOf(m, r) }).map((__, c) => {
                        const black = grids[i][r][c] === 1;
                        const hasCircle = m.circleSet.has(r + "," + c);
                        const isFixed = m.fixedSet.has(r + "," + c);
                        const isBad = vio && vio.has(r + "," + c);
                        const v = triVerts(m, r, c);
                        const cx = (v[0][0] + v[1][0] + v[2][0]) / 3;
                        const cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
                        return (
                          <g key={r + "-" + c}>
                            <polygon
                              points={v.map(([px, py]) => px + "," + py).join(" ")}
                              fill={black ? INK : "#FFFFFF"}
                              stroke={black ? INK : HAIR}
                              strokeWidth={1}
                              strokeLinejoin="round"
                            />
                            {isFixed && (
                              <circle
                                cx={cx} cy={cy - TRI_H * 0.28} r={3}
                                fill={black ? "#FFFFFF" : INK}
                                opacity={0.5}
                              />
                            )}
                            {hasCircle && (
                              <circle
                                cx={cx} cy={cy} r={TRI_S * 0.2}
                                fill="none"
                                stroke={black ? "#FFFFFF" : INK}
                                strokeWidth={3}
                              />
                            )}
                            {isBad && (
                              <polygon
                                points={v.map(([px, py]) => px + "," + py).join(" ")}
                                fill={RED}
                                opacity={0.6}
                                stroke={RED}
                                strokeWidth={1}
                                strokeLinejoin="round"
                              />
                            )}
                          </g>
                        );
                      })
                    )
                  : m.shape === "hex"
                  ? Array.from({ length: m.rows }).map((_, r) =>
                      Array.from({ length: colsOf(m, r) }).map((__, c) => {
                        const black = grids[i][r][c] === 1;
                        const hasCircle = m.circleSet.has(r + "," + c);
                        const isFixed = m.fixedSet.has(r + "," + c);
                        const isBad = vio && vio.has(r + "," + c);
                        const v = hexVerts(m, r, c);
                        const cx = v.reduce((s, p) => s + p[0], 0) / v.length;
                        const cy = v.reduce((s, p) => s + p[1], 0) / v.length;
                        return (
                          <g key={r + "-" + c}>
                            <polygon
                              points={v.map(([px, py]) => px + "," + py).join(" ")}
                              fill={black ? INK : "#FFFFFF"}
                              stroke={black ? INK : HAIR}
                              strokeWidth={1}
                              strokeLinejoin="round"
                            />
                            {isFixed && (
                              <circle
                                cx={cx - HEX_R * 0.55} cy={cy} r={3}
                                fill={black ? "#FFFFFF" : INK}
                                opacity={0.5}
                              />
                            )}
                            {hasCircle && (
                              <circle
                                cx={cx} cy={cy} r={HEX_R * 0.4}
                                fill="none"
                                stroke={black ? "#FFFFFF" : INK}
                                strokeWidth={3}
                              />
                            )}
                            {isBad && (
                              <polygon
                                points={v.map(([px, py]) => px + "," + py).join(" ")}
                                fill={RED}
                                opacity={0.6}
                                stroke={RED}
                                strokeWidth={1}
                                strokeLinejoin="round"
                              />
                            )}
                          </g>
                        );
                      })
                    )
                  : Array.from({ length: m.rows }).map((_, r) =>
                      Array.from({ length: m.cols }).map((__, c) => {
                        const black = grids[i][r][c] === 1;
                        const tx = gx + c * T, ty = gy + r * T;
                        const hasCircle = m.circleSet.has(r + "," + c);
                        const isFixed = m.fixedSet.has(r + "," + c);
                        const isBad = vio && vio.has(r + "," + c);
                        return (
                          <g key={r + "-" + c}>
                            <rect
                              x={tx + 1} y={ty + 1} width={T - 2} height={T - 2} rx={4}
                              fill={black ? INK : "#FFFFFF"}
                              stroke={black ? INK : HAIR}
                              strokeWidth={1}
                            />
                            {isFixed && (
                              <path
                                d={`M ${tx + T - 12} ${ty + 4} L ${tx + T - 4} ${ty + 4} L ${tx + T - 4} ${ty + 12} Z`}
                                fill={black ? "#FFFFFF" : INK}
                                opacity={0.5}
                              />
                            )}
                            {hasCircle && (
                              <circle
                                cx={tx + T / 2} cy={ty + T / 2} r={T * 0.27}
                                fill="none"
                                stroke={black ? "#FFFFFF" : INK}
                                strokeWidth={3}
                              />
                            )}
                            {isBad && (
                              <rect
                                x={tx + 1} y={ty + 1} width={T - 2} height={T - 2} rx={4}
                                fill={RED}
                                opacity={0.6}
                              />
                            )}
                          </g>
                        );
                      })
                    )}
                {/* answer button (checkmark) — hidden once solved */}
                {!isDone && (
                  <g style={{ cursor: "pointer" }}>
                    <rect
                      x={b.x} y={b.y} width={b.w} height={b.h} rx={9}
                      fill="#FFFFFF"
                      stroke={active ? INK : DIM}
                      strokeWidth={1.5}
                    />
                    <path
                      d={`M ${b.x + b.w / 2 - 9} ${b.y + b.h / 2} l 6 7 l 12 -13`}
                      fill="none"
                      stroke={active ? INK : DIM}
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* SCREEN LAYER: viewfinder reticle at exact center */}
        <Reticle w={size.w} h={size.h} locked={activeIndex >= 0} solved={activeIndex >= 0 && solved[activeIndex]} />
      </svg>

      {/* non-verbal lock cue while puzzle 1 is unsolved */}
      {!firstSolved && <LockCue />}

      {/* progress pips */}
      <div style={{ position: "absolute", bottom: 18, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
        {solved.map((s, i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: 9, background: s ? INK : "transparent", border: `1.5px solid ${s ? INK : DIM}` }} />
        ))}
      </div>
    </div>
  );
}

function GuideBoard({ x, y }) {
  const cxg = x + GUIDE_W / 2;
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={x} y={y} width={GUIDE_W} height={GUIDE_H} rx={8} fill="none" stroke={HAIR} strokeWidth={1} strokeDasharray="4 3" />
      {GUIDE_SOLUTION.map((row, r) =>
        row.map((v, c) => {
          const tx = x + GPAD + c * GT, ty = y + GLABEL + r * GT;
          return (
            <rect
              key={r + "-" + c}
              x={tx + 1} y={ty + 1} width={GT - 2} height={GT - 2} rx={3}
              fill={v ? INK : "#FFFFFF"}
              stroke={v ? INK : HAIR}
              strokeWidth={1}
            />
          );
        })
      )}
      {/* bobbing down-arrow: "copy this into the puzzle below" */}
      <g className="hint-bob">
        <path
          d={`M ${cxg} ${y + GUIDE_H + 3} l 0 12 M ${cxg - 6} ${y + GUIDE_H + 9} l 6 6 l 6 -6`}
          fill="none" stroke={DIM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

// small padlock icon, top-center: non-verbal "solve first to scroll" cue
function LockCue() {
  return (
    <div style={{ position: "absolute", top: 16, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <path d="M 8 12 v -2.5 a 5 5 0 0 1 10 0 v 2.5" fill="none" stroke={DIM} strokeWidth="1.6" strokeLinecap="round" />
        <rect x="6.5" y="12" width="13" height="10" rx="2.5" fill="none" stroke={DIM} strokeWidth="1.6" />
        <circle cx="13" cy="16.5" r="1.5" fill={DIM} />
      </svg>
    </div>
  );
}

function Reticle({ w, h, locked, solved }) {
  const cx = w / 2, cy = h / 2;
  const s = locked ? 118 : 140;         // half-extent shrinks when a puzzle is focused
  const len = 16;
  const col = solved ? INK : locked ? "#6B6B68" : DIM;
  const sw = locked ? 2 : 1.5;
  const corner = (dx, dy) => {
    const x = cx + dx * s, y = cy + dy * s;
    return (
      <path
        d={`M ${x} ${y + dy * -len} L ${x} ${y} L ${x + dx * -len} ${y}`}
        fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
      />
    );
  };
  return (
    <g style={{ pointerEvents: "none", transition: "all 140ms ease" }}>
      {corner(-1, -1)}{corner(1, -1)}{corner(-1, 1)}{corner(1, 1)}
    </g>
  );
}
