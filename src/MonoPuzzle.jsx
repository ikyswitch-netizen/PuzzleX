import React, { useRef, useState, useEffect, useCallback } from "react";

// ---- palette (strict monochrome) ----
const PAPER = "#F4F4F5";
const INK = "#141414";
const HAIR = "#D9D9D7";
const DOT = "#E4E4E2";
const DIM = "#B5B5B2";

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

export default function MonoPuzzle() {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);

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

  const centerW = { x: cam.x + size.w / 2, y: cam.y + size.h / 2 };
  const activeIndex = METAS.findIndex(
    (m) => centerW.x >= m.x && centerW.x <= m.x + m.fw && centerW.y >= m.y && centerW.y <= m.y + m.fh
  );

  const solvedFlags = grids.map((g, i) => isSolved(METAS[i], g));
  const firstSolved = solvedFlags[0];

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
  }, []);

  const clientToWorld = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left + cam.x, y: e.clientY - r.top + cam.y };
  };

  const onPointerDown = (e) => {
    svgRef.current.setPointerCapture(e.pointerId);
    const w = clientToWorld(e);
    const hit = tileAt(w.x, w.y);
    if (hit && hit.i === activeIndex) {
      const painted = new Set();
      toggle(hit.i, hit.row, hit.col);
      painted.add(hit.row + "," + hit.col);
      dragRef.current = { mode: "paint", puzzle: hit.i, painted };
    } else if (firstSolved) {
      dragRef.current = {
        mode: "pan",
        sx: e.clientX, sy: e.clientY,
        cx: cam.x, cy: cam.y,
      };
    } else {
      dragRef.current = null;
    }
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "pan") {
      setCam({ x: d.cx - (e.clientX - d.sx), y: d.cy - (e.clientY - d.sy) });
    } else {
      const w = clientToWorld(e);
      const hit = tileAt(w.x, w.y);
      if (hit && hit.i === d.puzzle) {
        const k = hit.row + "," + hit.col;
        if (!d.painted.has(k)) {
          d.painted.add(k);
          toggle(hit.i, hit.row, hit.col);
        }
      }
    }
  };

  const endDrag = (e) => {
    if (svgRef.current && e.pointerId != null) {
      try { svgRef.current.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    dragRef.current = null;
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
            const solved = solvedFlags[i];
            const gx = m.x + PADX, gy = m.y + PADTOP;
            return (
              <g key={m.id} opacity={active || solved ? 1 : 0.72}>
                {/* frame */}
                <rect
                  x={m.x} y={m.y} width={m.fw} height={m.fh} rx={10}
                  fill="none"
                  stroke={solved ? INK : active ? "#8A8A87" : HAIR}
                  strokeWidth={solved ? 2 : 1.5}
                />
                {/* index */}
                <text x={m.x + PADX} y={m.y + 26} fontSize={13} fill={DIM} letterSpacing="2">
                  {String(m.id).padStart(2, "0")}
                </text>
                {/* captured mark */}
                {solved && (
                  <rect x={m.x + m.fw - 26} y={m.y + 15} width={9} height={9} fill={INK} />
                )}
                {/* tiles */}
                {m.shape === "tri"
                  ? Array.from({ length: m.rows }).map((_, r) =>
                      Array.from({ length: colsOf(m, r) }).map((__, c) => {
                        const black = grids[i][r][c] === 1;
                        const hasCircle = m.circleSet.has(r + "," + c);
                        const isFixed = m.fixedSet.has(r + "," + c);
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
                          </g>
                        );
                      })
                    )}
              </g>
            );
          })}
        </g>

        {/* SCREEN LAYER: viewfinder reticle at exact center */}
        <Reticle w={size.w} h={size.h} locked={activeIndex >= 0} solved={activeIndex >= 0 && solvedFlags[activeIndex]} />
      </svg>

      {!firstSolved && (
        <div style={{ position: "absolute", top: 18, left: 0, right: 0, textAlign: "center", fontSize: 12, letterSpacing: 2, color: DIM, pointerEvents: "none" }}>
          SOLVE TO UNLOCK SCROLLING
        </div>
      )}

      {/* progress pips */}
      <div style={{ position: "absolute", bottom: 18, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 10, pointerEvents: "none" }}>
        {solvedFlags.map((s, i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: 9, background: s ? INK : "transparent", border: `1.5px solid ${s ? INK : DIM}` }} />
        ))}
      </div>
    </div>
  );
}

function GuideBoard({ x, y }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={x} y={y} width={GUIDE_W} height={GUIDE_H} rx={8} fill="none" stroke={HAIR} strokeWidth={1} strokeDasharray="4 3" />
      <text x={x + GPAD} y={y + 14} fontSize={10} fill={DIM} letterSpacing="2">
        EXAMPLE
      </text>
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
    </g>
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
