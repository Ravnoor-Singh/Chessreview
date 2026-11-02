# Translation glossary

Canonical wording for the chess and UI terms that recur across the
catalogue. When a translation is added or revised, use the rendering in
this table for the listed keys — `npm run glossary:check` compares the
catalogues against this table and fails on any deviation, so update the
table and the catalogues together (a native-speaker reviewer working
through `i18n/review/<locale>.csv` is the expected source of changes).

## Policies

- **Never translated:** `Stockfish` (product name) — the glossary check
  verifies every key whose English text mentions Stockfish keeps the
  name intact in all locales. `Beta` stays `Beta` in all locales.
- **Opening names stay in English** (e.g. "Sicilian Defense",
  "Philidor") — they are proper nouns from the opening dataset, not
  catalogue strings, and chess literature in all four languages cites
  them in English.
- **Classifications** are short labels, not sentences: keep them to one
  or two words so badges and lists stay compact in every locale.
- **Piece names** in Hindi/Punjabi use the traditional Indian names
  (ऊंट/ਊਠ for bishop, हाथी/ਹਾਥੀ for rook, वज़ीर/ਵਜ਼ੀਰ for queen) —
  the terms Indian players actually use; a reviewer may revisit this,
  but consistency matters more than the choice.
- **Sentences are whole templates.** Feedback and coach strings are
  complete sentences with placeholders; code never concatenates
  fragments (word order differs per language). Count-dependent nouns
  use plural entries (`{ one, other }`, selected via
  `Intl.PluralRules`).
- **Politeness:** Hindi and Punjabi use the respectful आप/ਤੁਸੀਂ forms;
  Spanish uses the informal tú forms (the app addresses one player
  directly, matching chess.com's Spanish voice).

## Canonical terms

| Key                          | en           | hi             | es                     | pa              |
| ---------------------------- | ------------ | -------------- | ---------------------- | --------------- |
| `classifications.brilliant`  | Brilliant    | शानदार         | Brillante              | ਸ਼ਾਨਦਾਰ         |
| `classifications.great`      | Great        | बहुत बढ़िया    | Excelente jugada       | ਬਹੁਤ ਵਧੀਆ       |
| `classifications.best`       | Best         | सर्वश्रेष्ठ    | La mejor               | ਸਰਵੋਤਮ          |
| `classifications.excellent`  | Excellent    | उत्कृष्ट       | Excelente              | ਉੱਤਮ            |
| `classifications.good`       | Good         | अच्छा          | Buena                  | ਚੰਗਾ            |
| `classifications.book`       | Book         | किताबी         | De libro               | ਕਿਤਾਬੀ          |
| `classifications.inaccuracy` | Inaccuracy   | अशुद्धि        | Imprecisión            | ਅਸ਼ੁੱਧੀ         |
| `classifications.mistake`    | Mistake      | गलती           | Error                  | ਗਲਤੀ            |
| `classifications.blunder`    | Blunder      | भारी गलती      | Error grave            | ਵੱਡੀ ਗਲਤੀ       |
| `classifications.miss`       | Miss         | चूक            | Oportunidad perdida    | ਚੂਕ             |
| `classifications.forced`     | Forced       | मजबूरी         | Forzada                | ਮਜਬੂਰੀ          |
| `pieces.pawn`                | pawn         | प्यादा         | peón                   | ਪਿਆਦਾ           |
| `pieces.knight`              | knight       | घोड़ा          | caballo                | ਘੋੜਾ            |
| `pieces.bishop`              | bishop       | ऊंट            | alfil                  | ਊਠ              |
| `pieces.rook`                | rook         | हाथी           | torre                  | ਹਾਥੀ            |
| `pieces.queen`               | queen        | वज़ीर          | dama                   | ਵਜ਼ੀਰ           |
| `pieces.king`                | king         | राजा           | rey                    | ਰਾਜਾ            |
| `review.title`               | Game Review  | गेम समीक्षा    | Revisión de la partida | ਖੇਡ ਸਮੀਖਿਆ      |
| `summary.accuracyLabel`      | Accuracy     | सटीकता         | Precisión              | ਸ਼ੁੱਧਤਾ         |
| `engine.engineLinesLabel`    | Engine lines | इंजन लाइनें    | Líneas del motor       | ਇੰਜਣ ਲਾਈਨਾਂ     |
| `moves.retry`                | Retry        | फिर से आज़माएँ | Reintentar             | ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ |

## Plural audit (Round 2, Prompt 10)

Count-bearing strings were audited key by key. Conversions to plural
entries in this prompt: `input.parseErrorBody` (the readable prefix can
be a single move), `board.kbSelected` (a square can have exactly one
legal move), `settings.cacheCurrently` (the cache can hold one
position) — joining `input.multiGames`, which already had forms.
Deliberately left as single forms, with reasons: the FEN count errors
(`needWhiteKingCount`/`needBlackKingCount`) embed the count in a
parenthetical "(found N)", which is grammar-neutral in all four
locales; `tooManyPieces`/`tooManyPawns` only occur at counts ≥ 9/17,
where the plural is always correct; progress strings (`Move {done} of
{total}`) substitute numerals into a fixed frame that every locale
shares. Dates and decimals go through `Intl.DateTimeFormat` /
`Intl.NumberFormat` with the active locale.
