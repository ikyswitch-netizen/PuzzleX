import { BG, makeCells, analyze, splitRegions, hBlack, vBlack } from "./regionRules.js";

const S = 42, PAD = 16, MAXR = 12;
const TINTS = ["#DCDCD9","#D7E1E6","#E3DCE6","#E6E0D4","#D7E6DD","#E6D8D8","#DDDFEA","#E9E3D5","#D5E4E4","#E4D5DD","#DEE6D5","#E6DEEA"];
// hairline is translucent ink so it reads on white, tinted and dark cells alike
const LIGHT = "#E3E3E1", DARK = "#8F8F8C", INK = "#141414", HAIR = "rgba(20,20,20,0.10)";

const state = {
  rows: 9, cols: 9, cells: makeCells(9, 9),
  current: 1,
  show: { answer: false, arrows: false, junctions: false, preview: false },
  play: null,
  undo: [],
};
const puzzle = () => ({ rows: state.rows, cols: state.cols, cells: state.cells });
const snapshot = () => state.cells.map((r) => [...r]);

const svg = document.getElementById("svg");
const NS = "http://www.w3.org/2000/svg";
const el = (n, a) => { const x = document.createElementNS(NS, n); for (const k in a) x.setAttribute(k, a[k]); return x; };

function render() {
  const p = puzzle();
  const a = analyze(p);
  const split = splitRegions(p);
  const W = state.cols * S + PAD * 2, H = state.rows * S + PAD * 2;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.innerHTML = "";

  const defs = el("defs");
  const mk = el("marker", { id: "ah", viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 5, markerHeight: 5, orient: "auto" });
  mk.appendChild(el("path", { d: "M0,0 L8,4 L0,8 z", fill: "#C0392B" }));
  defs.appendChild(mk);
  svg.appendChild(defs);

  // cells
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const id = state.cells[r][c];
      let fill = "#FFFFFF";
      if (id !== BG) {
        const shaded = state.play ? state.play.has(id) : (state.show.answer && a.dark.has(id));
        fill = shaded ? DARK : (state.show.preview || state.play) ? LIGHT : TINTS[(id - 1) % TINTS.length];
      }
      svg.appendChild(el("rect", { x: PAD + c * S, y: PAD + r * S, width: S, height: S, fill, stroke: HAIR, "stroke-width": 1 }));
      if (id !== BG && !state.show.preview && !state.play) {
        const t = el("text", {
          x: PAD + c * S + S / 2, y: PAD + r * S + S / 2 + 4,
          "text-anchor": "middle", "font-size": 11, fill: "#9A9A95",
          "font-family": "ui-monospace, monospace",
        });
        t.textContent = id;
        svg.appendChild(t);
      }
    }
  }

  // black region boundaries
  for (let r = 0; r <= state.rows; r++)
    for (let c = 0; c < state.cols; c++)
      if (hBlack(p, r, c))
        svg.appendChild(el("line", { x1: PAD + c * S, y1: PAD + r * S, x2: PAD + (c + 1) * S, y2: PAD + r * S, stroke: INK, "stroke-width": 3, "stroke-linecap": "square" }));
  for (let r = 0; r < state.rows; r++)
    for (let c = 0; c <= state.cols; c++)
      if (vBlack(p, r, c))
        svg.appendChild(el("line", { x1: PAD + c * S, y1: PAD + r * S, x2: PAD + c * S, y2: PAD + (r + 1) * S, stroke: INK, "stroke-width": 3, "stroke-linecap": "square" }));

  // overlays
  if (state.show.junctions)
    for (const j of a.junctions)
      if (j.kind === "T")
        svg.appendChild(el("circle", { cx: PAD + j.j * S, cy: PAD + j.i * S, r: 4.5, fill: "#FFF", stroke: "#C0392B", "stroke-width": 2 }));

  if (state.show.arrows) {
    const D = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    const drawn = new Set();
    for (const m of a.morphisms) {
      const k = m.i + "," + m.j;
      if (drawn.has(k)) continue;
      drawn.add(k);
      const [dx, dy] = D[m.stem];
      const x = PAD + m.j * S, y = PAD + m.i * S;
      svg.appendChild(el("line", {
        x1: x - dx * S * 0.08, y1: y - dy * S * 0.08,
        x2: x - dx * S * 0.46, y2: y - dy * S * 0.46,
        stroke: "#C0392B", "stroke-width": 2, "marker-end": "url(#ah)",
      }));
    }
  }

  // info
  const pairs = [...new Set(a.morphisms.map((m) => `${m.from}→${m.to}`))].sort();
  const tN = a.junctions.filter((j) => j.kind === "T").length;
  document.getElementById("info").innerHTML =
    `領域 <b>${a.ids.length}</b> ／ T字接合 <b>${tN}</b> ／ 射 <b>${pairs.length}</b> 種 ／ 答え（濃いグレー） <b>${a.dark.size}</b>` +
    (pairs.length ? `<br>射: ${pairs.join("  ")}` : "") +
    (a.dark.size ? `<br>答え: 領域 ${[...a.dark].join(", ")}` : "") +
    (split.length ? `<br><span class="warn">⚠ 領域 ${split.join(", ")} が分断されています（連結にしてください）</span>` : "") +
    (a.ids.length && a.dark.size === a.ids.length ? `<br><span class="warn">⚠ 全領域が答えになっています（T字接合が足りません）</span>` : "");

  document.getElementById("json").value = JSON.stringify({ rows: state.rows, cols: state.cols, cells: state.cells });
  renderSwatches(a);
}

function renderSwatches(a) {
  const host = document.getElementById("swatches");
  host.innerHTML = "";
  const used = a.ids;
  const next = Math.min(MAXR, (used.length ? Math.max(...used) : 0) + 1);
  const opts = [0, ...new Set([...used, next])].filter((v) => v <= MAXR);
  for (const id of opts) {
    const d = document.createElement("div");
    d.className = "sw" + (state.current === id ? " on" : "");
    d.style.background = id === BG ? "#FFF" : TINTS[(id - 1) % TINTS.length];
    d.textContent = id === BG ? "消" : id;
    d.onclick = () => { state.current = id; render(); };
    host.appendChild(d);
  }
}

// ---- painting ----
function cellFromEvent(ev) {
  const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const c = Math.floor((pt.x - PAD) / S), r = Math.floor((pt.y - PAD) / S);
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null;
  return [r, c];
}

let painting = null;
svg.addEventListener("contextmenu", (e) => e.preventDefault());
svg.addEventListener("pointerdown", (ev) => {
  const rc = cellFromEvent(ev);
  if (!rc) return;
  svg.setPointerCapture(ev.pointerId);
  if (state.play) {
    const id = state.cells[rc[0]][rc[1]];
    if (id !== BG) {
      if (state.play.has(id)) state.play.delete(id); else state.play.add(id);
      render();
    }
    return;
  }
  state.undo.push(snapshot());
  if (state.undo.length > 60) state.undo.shift();
  painting = ev.button === 2 ? BG : state.current;
  apply(rc);
});
svg.addEventListener("pointermove", (ev) => { if (painting !== null) { const rc = cellFromEvent(ev); if (rc) apply(rc); } });
const stop = () => { painting = null; };
svg.addEventListener("pointerup", stop);
svg.addEventListener("pointercancel", stop);

function apply([r, c]) {
  if (state.cells[r][c] === painting) return;
  state.cells[r][c] = painting;
  render();
}

// ---- controls ----
document.getElementById("resize").onclick = () => {
  const nr = Math.max(2, Math.min(20, +document.getElementById("rows").value));
  const nc = Math.max(2, Math.min(20, +document.getElementById("cols").value));
  state.undo.push(snapshot());
  const old = state.cells;
  state.cells = makeCells(nr, nc);
  for (let r = 0; r < Math.min(nr, state.rows); r++)
    for (let c = 0; c < Math.min(nc, state.cols); c++) state.cells[r][c] = old[r][c];
  state.rows = nr; state.cols = nc;
  render();
};
document.getElementById("clear").onclick = () => {
  state.undo.push(snapshot());
  state.cells = makeCells(state.rows, state.cols);
  render();
};
document.getElementById("undo").onclick = () => {
  const prev = state.undo.pop();
  if (!prev) return;
  state.cells = prev; state.rows = prev.length; state.cols = prev[0].length;
  document.getElementById("rows").value = state.rows;
  document.getElementById("cols").value = state.cols;
  render();
};
for (const b of document.querySelectorAll("[data-t]"))
  b.onclick = () => { const k = b.dataset.t; state.show[k] = !state.show[k]; b.classList.toggle("on", state.show[k]); render(); };

document.getElementById("playToggle").onclick = (e) => {
  state.play = state.play ? null : new Set();
  e.target.classList.toggle("on", !!state.play);
  document.getElementById("playInfo").textContent = state.play ? "領域をクリックして濃いグレーだと思うものを選択" : "";
  render();
};
document.getElementById("playCheck").onclick = () => {
  if (!state.play) return;
  const { dark } = analyze(puzzle());
  const ok = dark.size === state.play.size && [...dark].every((d) => state.play.has(d));
  document.getElementById("playInfo").innerHTML = ok
    ? '<span class="good">正解！</span>'
    : `<span class="warn">不正解</span>（正しくは ${dark.size} 領域）`;
};
document.getElementById("load").onclick = () => {
  try {
    const d = JSON.parse(document.getElementById("json").value);
    if (!d.rows || !d.cols || !Array.isArray(d.cells)) throw new Error("形式が違います");
    state.undo.push(snapshot());
    state.rows = d.rows; state.cols = d.cols; state.cells = d.cells.map((r) => [...r]);
    document.getElementById("rows").value = d.rows;
    document.getElementById("cols").value = d.cols;
    render();
  } catch (e) { alert("読み込めません: " + e.message); }
};
document.getElementById("copy").onclick = () => {
  const t = document.getElementById("json");
  t.select();
  navigator.clipboard?.writeText(t.value);
};
addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  if (/^[0-9]$/.test(e.key)) { state.current = +e.key; render(); }
});

render();
