import { useState } from "react";
import { Emblem } from "./Emblems.jsx";

const PAPER = "#F4F4F5";
const INK = "#141414";
const HAIR = "#D9D9D7";
const DOT = "#E4E4E2";

const SIZE = 152;
const PADDING = 24;
const CARD = SIZE + PADDING * 2;

// The reticle brackets from the games, reused here so hovering a choice reads
// as "focusing" it — the same gesture the player will use to pick a puzzle.
function Brackets({ on }) {
  const CLEAR = 15;             // breathing room between the card and the brackets
  const off = 10;               // room inside the svg for the stroke itself
  const R = CARD + 2 * (CLEAR + off);
  const len = 15;
  const corner = (dx, dy, k) => {
    const x = dx < 0 ? off : R - off, y = dy < 0 ? off : R - off;
    return (
      <path key={k}
        d={`M ${x} ${y + dy * -len} L ${x} ${y} L ${x + dx * -len} ${y}`}
        fill="none" stroke={on ? INK : "transparent"} strokeWidth={2} strokeLinecap="round"
      />
    );
  };
  return (
    <svg
      width={R} height={R} viewBox={`0 0 ${R} ${R}`} aria-hidden="true"
      style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none", transition: "opacity 140ms ease", opacity: on ? 1 : 0 }}
    >
      {corner(-1, -1, "a")}{corner(1, -1, "b")}{corner(-1, 1, "c")}{corner(1, 1, "d")}
    </svg>
  );
}

function Choice({ kind, label, onPick }) {
  const [hot, setHot] = useState(false);
  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
      <Brackets on={hot} />
      <button
        type="button"
        aria-label={label}
        onClick={() => onPick(kind)}
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => setHot(false)}
        onFocus={() => setHot(true)}
        onBlur={() => setHot(false)}
        style={{
          width: CARD, height: CARD, padding: PADDING,
          display: "grid", placeItems: "center",
          background: "#FFFFFF", cursor: "pointer",
          border: `1.5px solid ${hot ? INK : HAIR}`, borderRadius: 12,
          outline: "none",
          transition: "border-color 140ms ease, transform 140ms ease",
          transform: hot ? "translateY(-3px)" : "none",
        }}
      >
        <Emblem kind={kind} size={SIZE} />
      </button>
    </div>
  );
}

export default function StartScreen({ onPick }) {
  return (
    <div
      style={{
        width: "100%", minHeight: "100vh", background: PAPER,
        backgroundImage: `radial-gradient(circle, ${DOT} 1px, transparent 1px)`,
        backgroundSize: "44px 44px",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 64, flexWrap: "wrap", padding: 32,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      {/* labels are for screen readers only — the board is the name */}
      <Choice kind="mono" label="Mono puzzle" onPick={onPick} />
      <Choice kind="region" label="Area puzzle" onPick={onPick} />
    </div>
  );
}
