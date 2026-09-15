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
| 🎯 **Fit** | Click an empty spot beside the assembly: loose pieces and small groups are filtered by shape (a tab must meet a hole, border sides must match; skipped when rotation is on) and ranked by how well their edge colours continue the neighbours'. A group is tried through each of its members, and only counts if the rest of the group would land on empty squares. The best candidate is dropped onto the slot first: if the player's own snap logic accepts it, it is joined right there; otherwise the best 8 are pulled next to the slot and the rest are dimmed. Click the assembly itself instead and the best 3 candidates for *every* open slot gather around its rim while everything else is parked outside a keep-out ring. `Esc` exits. |

Keyboard: `Alt+G` Gradient, `Alt+P` Piles, `Alt+M` Magnet, `Alt+S` Stack, `Alt+D` Deal, `Alt+F` Fit
(Option on macOS). Plain letters are left to the player's own shortcuts.

The largest joined cluster is treated as the assembly and never moves; every other piece or
group (any size) is movable.

## Install

1. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
2. **Load unpacked** → choose this folder.
3. Open any puzzle in the player; the toolbar appears bottom-right.

No extension? Paste the contents of `bookmarklet.txt` into a bookmark's URL and click it on the puzzle page.

## Console API

```js
jigexColorSort({ mode: 'gradient' | 'piles' | 'magnet' | 'stack' | 'deal', k: 4 }) // k = pile count; returns pieces moved
jigexFit.at(x, y, { snap: false })  // canvas coordinates of an empty slot; returns candidates shown (1 if snapped in); snap:false only suggests
jigexFit.frontier()    // candidates for every open slot to the rim, everything else parked away
jigexFit.toggle()      // enter / leave click-to-fit mode
```

`jigexColorSort.util` exposes the internals (Lab conversion, k-means, layout grid…) that `fit.js` and the tests share.

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

```
manifest.json               MV3 manifest: loads the three src files as MAIN-world content scripts
src/core.js                 window.jigexColorSort — colour maths, occupancy grid, the five modes
src/fit.js                  window.jigexFit — slot detection, candidate ranking, click-to-fit mode
src/ui.js                   floating toolbar
test/fixture.js             synthetic puzzle with the same fields as the real player
test/core.test.js           sorting/layout tests
test/fit.test.js            slot + ranking tests
scripts/build-bookmarklet.js
bookmarklet.txt             generated; never edit by hand
```

The src files are plain scripts (no modules, no bundler, no runtime dependencies) so the same code runs
as a content script, as a bookmarklet and under `require()` in the tests. Keep the IIFE + `module.exports`
shim when adding to them, and run `npm run build` before committing so `bookmarklet.txt` matches `src/`.

## Contributing

Issues and pull requests are welcome. Keep changes small, keep `npm test` green, and describe how you
verified a change in the real player (the fixture cannot cover the player's own move/undo behaviour).

## License

MIT
