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
].map((m) => ({
  ...m,
  fw: m.cols * T + 2 * PADX,
  fh: PADTOP + m.rows * T + PADBOT,
  circleSet: new Set(m.circles.map(([r, c]) => r + "," + c)),
  fixedSet: new Set(
    [...(m.fixedBlack || []), ...(m.fixedWhite || [])].map(([r, c]) => r + "," + c)
  ),
  fixedColor: new Map([
    ...(m.fixedBlack || []).map(([r, c]) => [r + "," + c, 1]),
    ...(m.fixedWhite || []).map(([r, c]) => [r + "," + c, 0]),
  ]),
}));

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
  const { rows, cols } = m;
  const blacks = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if (grid[r][c] === 1) blacks.push([r, c]);
  if (blacks.length > 0) {
    const seen = new Set();
    const key = (r, c) => r + "," + c;
    const st = [blacks[0]];
    seen.add(key(...blacks[0]));
    while (st.length) {
      const [r, c] = st.pop();
      for (const [dr, dc] of NB) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
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
    for (const [dr, dc] of NB) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
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
      const g = Array.from({ length: m.rows }, () => Array(m.cols).fill(0));
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
                {Array.from({ length: m.rows }).map((_, r) =>
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
