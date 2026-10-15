# Quiet Gambit

A small, self-contained chess game built with Next.js. You play White against a local search engine that runs entirely in the browser. There is no chess package, neural network, API, or server-side game state.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), select a piece, and choose one of its highlighted legal squares.

For hosted experiments, port `43127` is reserved for this app and proxied by
`test.timbhanson.com`:

```bash
npm run dev:test
```

## Engine design

The implementation in `src/lib/chess.ts` includes:

- legal move generation, check detection, castling, en passant, and all four promotion choices;
- depth-limited negamax (the symmetric form of minimax) with alpha-beta pruning;
- capture-first move ordering to produce earlier alpha-beta cutoffs;
- a handcrafted evaluation using standard material values, centralization, and pawn advancement;
- terminal scoring for checkmate, stalemate, insufficient material, and the fifty-move rule.

The three difficulty settings search 4, 5, or 6 plies. The game reports the positions searched and elapsed time after every AI move.

The design follows Claude Shannon's classic proposal of a depth-limited game tree plus a static evaluation function and the standard alpha-beta approach described in MIT's game-search lecture.

## Checks

```bash
npm run lint
npm run build
```

The move generator also matches the standard initial-position perft totals through depth 3: 20, 400, and 8,902 nodes.
