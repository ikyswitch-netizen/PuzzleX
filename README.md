# PuzzleX

Two monochrome puzzle games built with React and SVG, sharing one pannable
world layout. `src/App.jsx` mounts both behind a MONO / AREA switch.

## MONO — Nurikabe-style

- `src/MonoPuzzle.jsx` — a pannable world of small grids. Drag empty space to
  pan; drag over a grid to paint/erase black tiles. A grid is solved when all
  black tiles form one connected region and every circled cell has exactly one
  same-colored neighbor.

## AREA — T-junction regions

Regions sit on a grid, drawn light grey with black lines along their
boundaries. Where three lines meet you get a T-junction: the two collinear
arms are the *bar*, the odd one is the *stem*. Every region touching the stem
sends a morphism to the region behind the bar. **Shade every region that
receives no morphism.**

The rule is never stated in-game — inferring it from the worked examples is
the point, so a wrong answer only shakes the board rather than naming the
regions at fault, and panning is never locked.

- `src/regionRules.js` — boundaries, junctions, morphisms and the answer.
  The single source of truth, shared by the game and the editor.
- `src/regionPuzzles.json` — the authored puzzles.
- `src/RegionPuzzle.jsx` — the game.

### Puzzle editor

`editor.html` (served at `/PuzzleX/editor.html`) is an authoring tool: paint
regions and it derives the black lines, T-junctions, morphisms and answer
live, validates that regions stay connected, and imports/exports the JSON that
goes into `src/regionPuzzles.json`.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
