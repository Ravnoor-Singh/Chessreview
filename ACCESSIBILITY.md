# Accessibility

How this app is made usable with assistive technology and keyboards, and
how that is verified. Last audited: Round 2, Prompt 6 (2026-11-01).

## Automated gate

`tests/e2e/axe.spec.ts` runs axe-core over the three primary surfaces —
the home/import page, the home page with the settings drawer open, and a
completed review — and asserts **zero violations**. It runs in the light
Playwright project (the CI PR gate). Lighthouse CI additionally asserts
the accessibility category at ≥ 0.95 (it measures 1.00).

One scoped exception, documented in the spec: axe's
`label-content-name-mismatch` rule is disabled for the review surface
only. It fires on the 8 board squares that carry a coordinate glyph
("8", "a", …) because the glyph — decorative, `aria-hidden` — sits inside
the square whose accessible name already **leads** with that square's own
name ("a8, black rook"). The rule's voice-control intent (say what you
see) is met by the name itself.

## The board keyboard model

The chess board is a single tab stop when interactive:

- **Arrow keys** move a visible focus square (an inset accent ring),
  screen-relative (flipping the board flips the arrows).
- **Enter / Space** selects the piece on the focus square, or — when a
  piece is already selected and the focus square is a legal target —
  plays the move. This is the exact click-click plumbing, shared with
  the pointer path.
- **Escape** clears the selection.
- A polite **live region** announces every step: the focused square
  ("e4, white pawn"), selections with their legal-move list ("e2, white
  pawn selected. 2 legal moves: e3, e4"), played moves by SAN ("e4
  played"), and selection clears. The board carries a visually-hidden
  hint describing the model (`aria-describedby`).
- Handled keys are `stopPropagation`ed so they never also trigger the
  review page's own arrow-key ply navigation (found by the e2e test:
  without it, ArrowRight both moved the focus square and advanced the
  game).
- Squares are a real ARIA grid: `role="grid"` on the board, `role="row"`
  wrappers (`display: contents`, layout unchanged), `role="gridcell"`
  squares named "e4, white pawn" or the bare square when empty.

Verified by `tests/e2e/board-keyboard.spec.ts` (seeded review → first
position → focus, select, play 1.e4, select Black's e7 pawn, Escape).

## Semantics elsewhere

- The evaluation bar is a `role="meter"` (0–100, White's win chance)
  with a full text value ("Evaluation +0.3: White winning chance 57.0
  percent", plus the WDL breakdown when present).
- The evaluation graph is a `role="slider"` over plies with a text value
  naming the current move; the graph itself is `aria-hidden` decoration.
- The move list is a `role="listbox"` of options (virtualized for long
  games), labelled; the current move/classification is announced through
  the review page's polite live region ("3. Nf3 — Best") and the coach
  feedback section is itself a live region.
- The settings drawer is a `role="dialog"` (`aria-modal`) — it was an
  `<aside>` with a dialog role until Prompt 5's axe run flagged the
  disallowed combination.
- The summary counts panel is a labelled `role="group"` of toggle
  buttons (it is not a data table; `role="table"` around buttons was an
  axe `aria-required-children` violation, fixed in Prompt 5).

## Color contrast

Fixed under the Prompt 5 axe gate and kept since:

- White text on the brand green `#81b64c` is 2.41:1 — primary buttons
  and every accent-green text control now use dark `#1d2b12` text
  (6.21:1); the brand green itself is unchanged.
- The "Great" steel blue `#5c8bb0` (3.72:1 on the panel) was lightened
  to `#7fb0d8` (5.87:1) wherever it carries text.

## Motion

- A global CSS rule collapses all CSS animations/transitions under
  `prefers-reduced-motion: reduce`.
- JS-driven animation honors the same query explicitly: the settings
  drawer's framer-motion slide/fade is disabled under reduced motion
  (`useReducedMotion`), and the in-app animation setting can reduce
  piece-slide duration to zero.

## Touch targets

On coarse pointers, a global rule raises every `button` to a 44px
minimum height. The primary review action measures ≥ 44px in the 360px
mobile test; board squares are grid cells sized by the board (an
inherent 1/8-of-board dimension) and are fully keyboard-operable as
above. `tests/e2e/mobile.spec.ts` asserts no horizontal scrolling and
target sizes at 360px on both routes.

## Focus visibility

Interactive elements keep their native focus outline plus the app's
accent styling; the board's focus square is the visible indicator when
the board itself holds focus. A dedicated focus-visible styling pass
beyond the browser defaults has not been done and is noted as remaining
polish, not hidden debt.
