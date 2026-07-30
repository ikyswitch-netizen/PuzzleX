import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { analyze, cellAt } from "./regionRules.js";
import PUZZLE_DATA from "./regionPuzzles.json";

// ---- palette (shared with MonoPuzzle) ----
const PAPER = "#F4F4F5";
const INK = "#141414";
const HAIR = "#D9D9D7";
const DOT = "#E4E4E2";
const DIM = "#B5B5B2";
// regions read as white sheets on the grey world; cells outside every region
// are left unpainted so the background shows through
const REGION = "#FFFFFF";
const DARK = "#8F8F8C";    // a region the player has shaded
const GOLD_LIGHT = "#FFE49A";

// ---- geometry ----
const CELL = 44;
const PADX = 22, PADTOP = 42, PADBOT = 22;
const GAP = 96;
const BTN_W = 48, BTN_H = 30, BTN_GAP = 16;

// Puzzles are laid out left to right on one horizontal band, each vertically
// centred on y = 0 so boards of different sizes still read as a single row.
const METAS = (() => {
  let x = 0;
  return Object.keys(PUZZLE_DATA)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => {
      const p = PUZZLE_DATA[key];
      const fw = p.cols * CELL + PADX * 2;
      const fh = PADTOP + p.rows * CELL + PADBOT;
      const m = { id: Number(key), p, x, y: -fh / 2, fw, fh, answer: analyze(p).dark };
      x += fw + GAP;
      return m;
    });
})();

const frameCenter = (m) => ({ x: m.x + m.fw / 2, y: m.y + m.fh / 2 });
const buttonRect = (m) => ({ x: m.x + m.fw / 2 - BTN_W / 2, y: m.y + m.fh + BTN_GAP, w: BTN_W, h: BTN_H });

// how long the camera takes to slide from one puzzle to the next
const SLIDE_MS = 260;

// dot-field extent in world coords: every frame plus a wide margin, so the
// field still fills the screen mid-slide
const DOT_STEP = 44;
const DOT_FIELD = (() => {
  const pad = 3000;
  const x0 = Math.min(...METAS.map((m) => m.x)) - pad;
  const y0 = Math.min(...METAS.map((m) => m.y)) - pad;
  const x1 = Math.max(...METAS.map((m) => m.x + m.fw)) + pad;
  const y1 = Math.max(...METAS.map((m) => m.y + m.fh)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
})();

const sameSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

export default function RegionPuzzle() {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const flashTimer = useRef(null);
  const handlersRef = useRef({});
  // timestamp the current camera slide ends; taps are ignored until then, so a
  // tap chasing the previous one can't land on a region that has moved under it
  const slideUntil = useRef(0);

  const [size, setSize] = useState({ w: 800, h: 600 });
  // the puzzle on screen. The camera is derived from it: one puzzle is always
  // centered, so there is no free panning to mis-trigger while shading.
  const [index, setIndex] = useState(0);
  // shaded[i]: the set of region ids the player has darkened on puzzle i
  const [shaded, setShaded] = useState(() => METAS.map(() => new Set()));
  const [solved, setSolved] = useState(() => METAS.map(() => false));
  const [flash, setFlash] = useState(null);

  // measure the viewport; the camera follows from `index` and this size
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Touch goes through native Touch events for the same reason as MonoPuzzle:
  // iOS WebKit's pointermove during a touch-drag is unreliable.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const start = (e) => {
      if (!e.touches.length) return;
      e.preventDefault();
      handlersRef.current.begin?.(e.touches[0].clientX, e.touches[0].clientY);
    };
    const move = (e) => {
      if (!e.touches.length) return;
      e.preventDefault();
      handlersRef.current.move?.(e.touches[0].clientX, e.touches[0].clientY);
    };
    const end = (e) => { e.preventDefault(); handlersRef.current.end?.(); };
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

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const cam = useMemo(() => {
    const c = frameCenter(METAS[index]);
    return { x: c.x - size.w / 2, y: c.y - size.h / 2 };
  }, [index, size.w, size.h]);

  const activeIndex = index;
  const allSolved = solved.length > 0 && solved.every(Boolean);

  // browsing is never locked here: inferring the rule needs many examples, so
  // the player must be free to look ahead from the start
  const canPrev = index > 0;
  const canNext = index < METAS.length - 1;

  const go = useCallback((dir) => {
    const next = index + dir;
    if (next < 0 || next >= METAS.length) return;
    slideUntil.current = Date.now() + SLIDE_MS;
    dragRef.current = null;   // a slide cancels any drag in progress
    setIndex(next);
  }, [index]);

  // arrow keys mirror the buttons
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // The answer is only ever "right" or "wrong" — naming the offending regions
  // would hand over the rule, and inferring the rule is the whole game.
  const submit = useCallback((i) => {
    if (i < 0 || solved[i]) return;
    const ok = sameSet(shaded[i], METAS[i].answer);
    if (ok) setSolved((prev) => prev.map((v, j) => (j === i ? true : v)));
    setFlash({ i, ok });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), ok ? 500 : 700);
  }, [solved, shaded]);

  const buttonAt = useCallback((wx, wy) => {
    for (let i = 0; i < METAS.length; i++) {
      if (solved[i]) continue;
      const b = buttonRect(METAS[i]);
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return i;
    }
    return -1;
  }, [solved]);

  // world point -> { i, region } when it lands on a painted region
  const regionAt = useCallback((wx, wy) => {
    for (let i = 0; i < METAS.length; i++) {
      const m = METAS[i];
      const gx = m.x + PADX, gy = m.y + PADTOP;
      if (wx < gx || wx >= gx + m.p.cols * CELL || wy < gy || wy >= gy + m.p.rows * CELL) continue;
      const col = Math.floor((wx - gx) / CELL);
      const row = Math.floor((wy - gy) / CELL);
      const region = cellAt(m.p, row, col);
      return region ? { i, region } : null;
    }
    return null;
  }, []);

  const toggle = useCallback((i, region) => {
    setShaded((prev) => {
      const next = prev.slice();
      const s = new Set(prev[i]);
      if (s.has(region)) s.delete(region); else s.add(region);
      next[i] = s;
      return next;
    });
    setSolved((prev) => (prev[i] ? prev.map((v, j) => (j === i ? false : v)) : prev));
  }, []);

  // ---- drag (shared by pointer and touch paths) ----
  const worldFrom = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: clientX - r.left + cam.x, y: clientY - r.top + cam.y };
  };

  // Dragging only ever shades: the camera moves by button, never by drag, so a
  // swipe meant to change puzzles can no longer flip regions by accident.
  const begin = (clientX, clientY) => {
    dragRef.current = null;
    if (Date.now() < slideUntil.current) return;
    const w = worldFrom(clientX, clientY);
    const btn = buttonAt(w.x, w.y);
    if (btn >= 0) { submit(btn); return; }
    const hit = regionAt(w.x, w.y);
    if (hit && hit.i === activeIndex) {
      toggle(hit.i, hit.region);
      dragRef.current = { mode: "paint", puzzle: hit.i, touched: new Set([hit.region]) };
    }
  };

  const move = (clientX, clientY) => {
    const d = dragRef.current;
    if (!d) return;
    const w = worldFrom(clientX, clientY);
    const hit = regionAt(w.x, w.y);
    if (hit && hit.i === d.puzzle && !d.touched.has(hit.region)) {
      d.touched.add(hit.region);
      toggle(hit.i, hit.region);
    }
  };

  const end = () => { dragRef.current = null; };
  handlersRef.current = { begin, move, end };

  const onPointerDown = (e) => {
    if (e.pointerType === "touch") return;
    try { svgRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    begin(e.clientX, e.clientY);
  };
  const onPointerMove = (e) => { if (e.pointerType !== "touch") move(e.clientX, e.clientY); };
  const endDrag = (e) => {
    if (e && e.pointerType === "touch") return;
    if (svgRef.current && e && e.pointerId != null) {
      try { svgRef.current.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    end();
  };

  return (
    <div
      ref={wrapRef}
      style={{ width: "100%", height: "100vh", background: PAPER, position: "relative", overflow: "hidden", userSelect: "none", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
    >
      <style>{`
        @keyframes rgShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(3px)} }
        @keyframes rgPulse { 0%{transform:scale(1)} 45%{transform:scale(1.04)} 100%{transform:scale(1)} }
        .rg-shake { animation: rgShake .42s ease; transform-box: fill-box; transform-origin: center; }
        .rg-pulse { animation: rgPulse .42s ease; transform-box: fill-box; transform-origin: center; }
        @keyframes rgGold {
          0%,100% { filter: drop-shadow(0 0 2px rgba(212,167,44,.65)) drop-shadow(0 0 6px rgba(212,167,44,.35)); }
          50% { filter: drop-shadow(0 0 6px rgba(255,228,154,.95)) drop-shadow(0 0 16px rgba(255,228,154,.6)); }
        }
        .rg-gold { animation: rgGold 1.8s ease-in-out infinite; }
      `}</style>
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        style={{ display: "block", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <defs>
          <pattern id="rg-dots" x={0} y={0} width={DOT_STEP} height={DOT_STEP} patternUnits="userSpaceOnUse">
            <circle cx={DOT_STEP / 2} cy={DOT_STEP / 2} r={1} fill={DOT} />
          </pattern>
        </defs>

        {/* WORLD LAYER — slides between puzzles when a nav button is pressed */}
        <g
          style={{
            transform: `translate(${-cam.x}px,${-cam.y}px)`,
            transition: `transform ${SLIDE_MS}ms cubic-bezier(.22,.61,.36,1)`,
          }}
        >
          <rect x={DOT_FIELD.x} y={DOT_FIELD.y} width={DOT_FIELD.w} height={DOT_FIELD.h} fill="url(#rg-dots)" />
          {METAS.map((m, i) => {
            const active = i === activeIndex;
            const isDone = solved[i];
            const wrong = flash && flash.i === i && !flash.ok;
            const right = flash && flash.i === i && flash.ok;
            const gx = m.x + PADX, gy = m.y + PADTOP;
            const b = buttonRect(m);
            const mark = shaded[i];
            const at = (r, c) => cellAt(m.p, r, c);

            const lines = [];
            for (let r = 0; r <= m.p.rows; r++)
              for (let c = 0; c < m.p.cols; c++)
                if (at(r - 1, c) !== at(r, c))
                  lines.push(
                    <line key={`h${r}-${c}`}
                      x1={gx + c * CELL} y1={gy + r * CELL}
                      x2={gx + (c + 1) * CELL} y2={gy + r * CELL}
                      stroke={INK} strokeWidth={3} strokeLinecap="square" />
                  );
            for (let r = 0; r < m.p.rows; r++)
              for (let c = 0; c <= m.p.cols; c++)
                if (at(r, c - 1) !== at(r, c))
                  lines.push(
                    <line key={`v${r}-${c}`}
                      x1={gx + c * CELL} y1={gy + r * CELL}
                      x2={gx + c * CELL} y2={gy + (r + 1) * CELL}
                      stroke={INK} strokeWidth={3} strokeLinecap="square" />
                  );

            return (
              <g key={m.id} className={wrong ? "rg-shake" : right ? "rg-pulse" : undefined} opacity={active || isDone ? 1 : 0.72}>
                <rect
                  x={m.x} y={m.y} width={m.fw} height={m.fh} rx={10}
                  fill="none"
                  className={allSolved ? "rg-gold" : undefined}
                  stroke={allSolved ? GOLD_LIGHT : isDone ? INK : active ? "#8A8A87" : HAIR}
                  strokeWidth={allSolved ? 2.5 : isDone ? 2 : 1.5}
                  strokeDasharray={wrong ? "6 4" : undefined}
                />
                <text x={m.x + PADX} y={m.y + 28} fontSize={13} fill={DIM} letterSpacing="2">
                  {String(m.id).padStart(2, "0")}
                </text>
                {isDone && <rect x={m.x + m.fw - 26} y={m.y + 17} width={9} height={9} fill={INK} />}

                {Array.from({ length: m.p.rows }).map((_, r) =>
                  Array.from({ length: m.p.cols }).map((__, c) => {
                    const id = at(r, c);
                    if (id === 0) return null;
                    return (
                      <rect
                        key={`${r}-${c}`}
                        x={gx + c * CELL} y={gy + r * CELL} width={CELL} height={CELL}
                        fill={mark.has(id) ? DARK : REGION}
                      />
                    );
                  })
                )}
                {lines}

                {!isDone && (
                  <g style={{ cursor: "pointer" }}>
                    <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={9} fill="#FFFFFF" stroke={active ? INK : DIM} strokeWidth={1.5} />
                    <path
                      d={`M ${b.x + b.w / 2 - 9} ${b.y + b.h / 2} l 6 7 l 12 -13`}
                      fill="none" stroke={active ? INK : DIM} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
                    />
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* boards range from 4x4 to 7x7, so the reticle sizes itself to whichever
            one is focused instead of using one fixed extent */}
        <Reticle
          w={size.w} h={size.h}
          locked={activeIndex >= 0}
          solved={activeIndex >= 0 && solved[activeIndex]}
          sx={activeIndex >= 0 ? METAS[activeIndex].fw / 2 + 16 : 150}
          sy={activeIndex >= 0 ? METAS[activeIndex].fh / 2 + 16 : 150}
        />
      </svg>

      {/* nav arrows flanking the progress pips */}
      <NavBar
        index={index}
        solved={solved}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
      />
    </div>
  );
}

// The only way to change puzzles: one step left or right per press. Pips double
// as a position readout — the ringed pip is where the camera is.
function NavBar({ index, solved, canPrev, canNext, onPrev, onNext }) {
  return (
    <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
      <NavButton dir={-1} enabled={canPrev} onClick={onPrev} label="Previous puzzle" />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 9, flexWrap: "wrap", maxWidth: 300, pointerEvents: "none" }}>
        {solved.map((s, i) => (
          <div
            key={i}
            style={{
              width: 9, height: 9, borderRadius: 9,
              background: s ? INK : "transparent",
              border: `1.5px solid ${s ? INK : DIM}`,
              outline: i === index ? `1.5px solid ${INK}` : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </div>
      <NavButton dir={1} enabled={canNext} onClick={onNext} label="Next puzzle" />
    </div>
  );
}

function NavButton({ dir, enabled, onClick, label }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!enabled}
      onClick={onClick}
      style={{
        width: 46, height: 46, padding: 0, display: "grid", placeItems: "center",
        background: "#FFFFFF", borderRadius: 12,
        border: `1.5px solid ${enabled ? INK : HAIR}`,
        cursor: enabled ? "pointer" : "default",
        opacity: enabled ? 1 : 0.4,
        touchAction: "manipulation",
        transition: "opacity 140ms ease, border-color 140ms ease",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d={dir < 0 ? "M 12.5 4 L 6.5 10 L 12.5 16" : "M 7.5 4 L 13.5 10 L 7.5 16"}
          fill="none" stroke={enabled ? INK : DIM} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function Reticle({ w, h, locked, solved, sx, sy }) {
  const cx = w / 2, cy = h / 2;
  const len = 16;
  const col = solved ? INK : locked ? "#6B6B68" : DIM;
  const sw = locked ? 2 : 1.5;
  const corner = (dx, dy, k) => {
    const x = cx + dx * sx, y = cy + dy * sy;
    return (
      <path key={k}
        d={`M ${x} ${y + dy * -len} L ${x} ${y} L ${x + dx * -len} ${y}`}
        fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round"
      />
    );
  };
  return (
    <g style={{ pointerEvents: "none", transition: "all 140ms ease" }}>
      {corner(-1, -1, "a")}{corner(1, -1, "b")}{corner(-1, 1, "c")}{corner(1, 1, "d")}
    </g>
  );
}
