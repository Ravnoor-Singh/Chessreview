# ♞ Chess Review

A chess.com-style **Game Review** web app powered by the real **Stockfish 19** engine, running entirely in your browser via WebAssembly. Paste a PGN, enter a FEN, drop in a board screenshot, or import from **Chess.com** / **Lichess** — get accuracy scores, move classifications, opening names, engine lines and coach feedback. All analysis is local; nothing is uploaded.

🔗 **Live demo:** https://chess-review-ravnoor.vercel.app/

## Features

- **Game review** — accuracy for both players, move classifications (Brilliant `!!` … Blunder `??`), eval bar & graph, best-move arrows, explorable variations
- **Openings** — ECO codes and names from a built-in book
- **Coach & Retry mode** — plain-language mistake explanations; retry the position yourself
- **Import anywhere** — PGN, FEN, Chess.com/Lichess usernames, share links, and screenshot-to-FEN board recognition (on-device)
- **Themes** — 34 boards, 36 piece sets, 28 backgrounds, 8 sound themes, blindfold mode, 22+ presets
- **4 languages** — English, हिन्दी, Español, ਪੰਜਾਬੀ · **PWA** — installable, works offline

## Tech stack

Next.js 15 · React 19 · TypeScript (strict) · Stockfish 19.0.1 WASM · Tailwind CSS 3 · Zustand · Vitest + Playwright (1,001 tests)

## Quick start

```bash
npm install   # also copies the Stockfish builds into /public/engine
npm run dev   # http://localhost:3000
```

## License

Application code © Ravnoor Singh, licensed under GPL-3.0 (see `LICENSE`). Stockfish is GPL-3.0; third-party assets keep their own licenses, see `LICENSES.md`. Security policy: `docs/SECURITY.md`. Piece/board artwork provenance: `src/themes/PROVENANCE.md`.

> Not affiliated with chess.com; no chess.com trademarks or proprietary artwork are used.
