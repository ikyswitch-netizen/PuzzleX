import { useState } from "react";
import MonoPuzzle from "./MonoPuzzle.jsx";
import RegionPuzzle from "./RegionPuzzle.jsx";
import StartScreen from "./StartScreen.jsx";
import { Emblem } from "./Emblems.jsx";

const INK = "#141414";
const HAIR = "#D9D9D7";

const GAMES = {
  mono: { label: "Mono puzzle", render: () => <MonoPuzzle /> },
  region: { label: "Area puzzle", render: () => <RegionPuzzle /> },
};

// In-game switcher: the same emblems as the start screen, so swapping games
// never needs a word either.
function Switcher({ game, onPick }) {
  return (
    <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 8 }}>
      {Object.entries(GAMES).map(([key, g]) => {
        const on = key === game;
        return (
          <button
            key={key}
            type="button"
            aria-label={g.label}
            aria-pressed={on}
            onClick={() => onPick(key)}
            style={{
              width: 42, height: 42, padding: 4, display: "grid", placeItems: "center",
              background: "#FFFFFF", cursor: "pointer", borderRadius: 8,
              border: `1.5px solid ${on ? INK : HAIR}`,
              opacity: on ? 1 : 0.55,
              transition: "opacity 140ms ease, border-color 140ms ease",
            }}
          >
            <Emblem kind={key} size={30} />
          </button>
        );
      })}
    </div>
  );
}

function App() {
  const [game, setGame] = useState(null);

  if (!game) return <StartScreen onPick={setGame} />;

  return (
    <div style={{ position: "relative" }}>
      {/* remounting on switch resets that game's camera to its first puzzle */}
      <div key={game}>{GAMES[game].render()}</div>
      <Switcher game={game} onPick={setGame} />
    </div>
  );
}

export default App;
