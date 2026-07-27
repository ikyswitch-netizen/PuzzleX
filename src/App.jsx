import { useState } from "react";
import MonoPuzzle from "./MonoPuzzle.jsx";
import RegionPuzzle from "./RegionPuzzle.jsx";

const INK = "#141414";
const DIM = "#B5B5B2";

const GAMES = [
  { key: "mono", label: "MONO", render: () => <MonoPuzzle /> },
  { key: "region", label: "AREA", render: () => <RegionPuzzle /> },
];

function App() {
  const [game, setGame] = useState("mono");
  const active = GAMES.find((g) => g.key === game) ?? GAMES[0];

  return (
    <div style={{ position: "relative" }}>
      {/* remounting on switch resets each game's camera to its first puzzle */}
      <div key={active.key}>{active.render()}</div>

      <div
        style={{
          position: "absolute", top: 16, left: 16, display: "flex",
          border: `1px solid ${DIM}`, borderRadius: 8, overflow: "hidden",
          background: "#FFFFFF",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {GAMES.map((g) => {
          const on = g.key === game;
          return (
            <button
              key={g.key}
              onClick={() => setGame(g.key)}
              aria-pressed={on}
              style={{
                font: "inherit", fontSize: 11, letterSpacing: 2,
                padding: "6px 13px", border: 0, cursor: "pointer",
                background: on ? INK : "transparent",
                color: on ? "#FFFFFF" : DIM,
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default App;
