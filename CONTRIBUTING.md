# Contributing

Thanks for helping improve Chess Review. Keep changes small, verified,
and documented — the rules below are what CI and review enforce.

## Setup

```bash
npm ci        # installs dependencies; postinstall copies the Stockfish
              # engine builds into public/engine/ (generated, gitignored)
```

## Checks (run before opening a PR)

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # unit + component suite (Vitest)
npm run i18n:check    # locale catalogues: key parity + placeholders
npm run themes:check  # theme registry: ids, labels, contrast, provenance
npm run build         # production build + bundle budgets
node scripts/check-repo-hygiene.mjs   # no tracked *.log, no likely secrets
```

Also run `npm run format:check` — the repo is Prettier-formatted
(`npm run format` fixes it).

### Integration and e2e tests

```bash
npm run test:integration   # real-Stockfish integration tests (Node)
npm run test:e2e:light     # Playwright, chromium project (PR gate)
npm run test:e2e           # full Playwright run (builds the no-isolation variant)
```

Heavy e2e specs run real engine analyses for minutes; CI runs them on
pushes to `main`, not on every PR (see `.github/workflows/ci.yml`).

## Rules

- **Never weaken a test** to make it pass — no deleted assertions, no
  widened tolerances, no skipped tests without a documented reason.
- **User-visible strings go through the i18n catalogues**
  (`src/i18n/`); never hard-code UI copy in a component. `i18n:check`
  must pass.
- **Update `README.md` and `RELEASE_REPORT.md`** with every change:
  behaviour, commands, and measured numbers (only numbers from commands
  you actually ran).
- **Generated files are not committed**: `public/engine/`,
  `.next*/`, `coverage/`, `*.log` and `PERFORMANCE_BASELINE.raw.json`
  are all gitignored; the hygiene check above fails CI if a tracked
  file slips through.
- Theme assets are original and registered in
  `src/themes/PROVENANCE.md`; `themes:check` enforces it.

## License

By contributing you agree your contributions are licensed under
GPL-3.0 (see the License section of `README.md`).
