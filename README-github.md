# ♞ Chess Review

A chess.com-style **Game Review** web app powered by the real **Stockfish 19** engine running entirely in your browser via WebAssembly. Paste a PGN, enter a FEN, drop in a screenshot of a board, or import a game from **Chess.com** / **Lichess** — and get accuracy scores, move classifications, opening identification, engine lines and coach-style feedback. All analysis happens locally on your device; nothing is uploaded.

🔗 **Live demo:** https://chess-review-ravnoor.vercel.app/

> Not affiliated with chess.com. The interface is "chess.com-style"; no chess.com trademarks, logos or proprietary artwork are used. All piece sets, boards and artwork in this repo are original or open-licensed — see `src/themes/PROVENANCE.md` and `LICENSES.md`. Stockfish is GPLv3.

## Features

- **Full game review** — accuracy scores for both players, move classifications (Brilliant `!!`, Great `!`, Best, Excellent, Good, Book, Inaccuracy `?!`, Mistake `?`, Blunder `??`, Miss), evaluation bar and graph, best-move arrows and explorable variations
- **Opening identification** — ECO codes and opening names from a built-in book, with continuation stats
- **Coach feedback & Retry mode** — plain-language explanations of mistakes, with a retry-the-position mode to find the right move yourself
- **Import anywhere** — PGN paste/upload, FEN, Chess.com and Lichess username import, share links, and **screenshot-to-FEN** board recognition (classical CV, fully on-device)
- **Themes & presets** — 34 boards, 36 piece sets, 28 backgrounds (including your own photo, stored on-device only), 8 synthesized sound themes, blindfold mode, 22 curated presets plus your own shareable presets
- **Four languages** — English, हिन्दी, Español, ਪੰਜਾਬੀ
- **PWA** — installable, works offline after first load

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict)
- **Stockfish 19.0.1** WASM in Web Workers (multi-threaded where available)
- **Tailwind CSS 3**, Zustand, Zod
- **Vitest** + **Playwright** — 1,001 unit/component tests and a full e2e suite

## Quick start

```bash
npm install     # also copies the Stockfish builds into /public/engine
npm run dev     # http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

Tests:

```bash
npm test                 # unit + component suite
npm run test:e2e         # Playwright end-to-end
npm run typecheck        # TypeScript strict check
```

## Project structure

```
src/
  analysis/   classification, accuracy, openings, sacrifices, statistics
  engine/     Stockfish worker pool, UCI client, WDL/win-probability
  vision/     screenshot-to-FEN board detection (on-device CV)
  themes/     theme registry: boards, pieces, backgrounds, sounds, presets
  components/ board, review, settings, input, eval UI
  app/        routes: /, /review, /settings, /theme-gallery, api importers
tests/        unit, component, integration, e2e + fixtures
public/       piece sets, openings book, fonts, sounds, PWA icons
```

## Privacy

Analysis never leaves your device. Imported games are fetched directly from the public Chess.com/Lichess APIs. Custom background images are stored only in your browser's IndexedDB.

## License

Application code © Ravnoor Singh. Stockfish is licensed under GPLv3; third-party assets keep their own licenses — see `LICENSES.md`.
