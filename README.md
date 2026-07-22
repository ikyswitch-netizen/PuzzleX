# PuzzleX

A monochrome Nurikabe-style puzzle prototype built with React and SVG.

- `src/MonoPuzzle.jsx` — the puzzle canvas: a pannable world containing several
  3x3 grids. Drag empty space to pan; drag over a grid to paint/erase black
  tiles. Each grid is solved when all black tiles form one connected region
  and every circled cell has exactly one same-colored neighbor.
- `src/App.jsx` — mounts `MonoPuzzle`.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
