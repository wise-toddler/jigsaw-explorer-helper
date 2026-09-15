# Jigsaw Explorer Helper

A small browser extension (Chrome / Edge, Manifest V3) that adds sorting and hint tools to the
[Jigsaw Explorer](https://www.jigsawexplorer.com) puzzle player. It talks to the player's own
piece objects, so everything it moves is a normal move: saving, undo and multiplayer keep working.

## Tools

| Button | What it does |
| --- | --- |
| 🎨 **Gradient** | Lays every loose piece out as one continuous colour gradient (nearest-neighbour chain in CIE Lab, smoothed with 2-opt). |
| 🗂 **Piles** | Clusters loose pieces into 2–6 colour piles (k-means) and puts each pile in its own band. |
| 🧲 **Magnet** | Pulls each loose piece next to the part of the assembly whose colour matches it best, preferring open sides where a piece could still attach. |
| 📚 **Stack** | Collapses the piles into decks (top piece visible) parked along the bottom of the table — clears the table for very large puzzles. |
| 🃏 **Deal** | Spreads the deck of the piece you last picked up, as a gradient, around where the deck sits. |
| 🎯 **Fit** | Click an empty spot beside the assembly: loose pieces are filtered by shape (a tab must meet a hole, border sides must match) and ranked by how well their edge colours continue the neighbours'. The best 8 are pulled next to the slot, the rest are dimmed. `Esc` exits. |

The largest joined cluster is treated as the assembly and never moves; every other piece or
group (any size) is movable.

## Install

1. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
2. **Load unpacked** → choose this folder.
3. Open any puzzle in the player; the toolbar appears bottom-right.

No extension? Paste the contents of `bookmarklet.txt` into a bookmark's URL and click it on the puzzle page.

## Console API

```js
jigexColorSort({ mode: 'gradient' | 'piles' | 'magnet' | 'stack' | 'deal', k: 4 }) // k = pile count
jigexFit.at(x, y)      // canvas coordinates of an empty slot
jigexFit.toggle()      // enter / leave click-to-fit mode
```

## How it works

The player exposes its state at `window.jigexGlobals.modules.player.Puzzle.curr`. For every piece we
know its crop rectangle in the subject image (`spec.image.bounds` / `spec.core`), the tab/hole shape of
each side (`spec.edges`), its true neighbours (`neighbors`) and its table position.

- **Colour** — the average of the piece's core (body without tabs), converted to Lab.
- **Layout** — an occupancy grid over the table; cells covered by assembly pieces are skipped, groups
  span as many cells as they need, and cells only shrink (letting tabs overlap) when the table is full.
- **Fit** — slot geometry comes from the assembly's open sides. Candidates are scored by the mean Lab
  distance between a 12-sample strip along the neighbour's facing edge and the candidate's opposite edge.
  Neighbour identity is never used to pick a piece — only to know where the slot is and whether it
  lies on the puzzle border.

## Development

```sh
npm install      # terser, used only for the bookmarklet
npm test         # unit tests (node:test) against a synthetic puzzle in test/fixture.js
npm run build    # regenerates bookmarklet.txt from src/
```

Layout: `src/core.js` (sorting + layout), `src/fit.js` (slot candidates), `src/ui.js` (toolbar),
`test/` (fixture + tests), `scripts/build-bookmarklet.js`.

## License

MIT
