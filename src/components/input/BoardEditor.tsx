'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import PieceImage from '@/components/board/Piece';
import { preloadPieceSet } from '@/lib/pieces';
import { useSettingsStore } from '@/store/settingsStore';
import { t as translate, type Locale } from '@/i18n';
import { useMessages } from '@/i18n/useMessages';

export interface BoardEditorProps {
  initialFen: string;
  onDone: (fen: string) => void;
  onCancel: () => void;
  /**
   * Optional per-square highlight (screenshot review step): 'low' renders
   * an orange ring, 'uncertain' a yellow ring. Keyed by square name ('e4').
   */
  highlightSquares?: Record<string, 'low' | 'uncertain'>;
  /** Label for the confirm button (default 'Done'; the screenshot review
   *  step passes 'Analyze this position'). */
  confirmLabel?: string;
  /** Optional callback fired whenever the edited FEN changes. */
  onFenChange?: (fen: string) => void;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const PIECE_TYPES = ['K', 'Q', 'R', 'B', 'N', 'P'] as const;
type PieceCode = string; // e.g. 'wP', 'bK' (cburnett file names)
type CastlingKey = 'K' | 'Q' | 'k' | 'q';

type BoardMap = Record<string, PieceCode>; // square ('a8') -> piece code

function parseFenParts(fen: string): {
  board: BoardMap;
  turn: 'w' | 'b';
  castling: Record<CastlingKey, boolean>;
} | null {
  const parts = fen.trim().split(/\s+/);
  const castlingStr = parts[2] ?? '-';
  const castling = {
    K: castlingStr.includes('K'),
    Q: castlingStr.includes('Q'),
    k: castlingStr.includes('k'),
    q: castlingStr.includes('q'),
  };
  const turn = parts[1] === 'b' ? 'b' : 'w';
  try {
    const chess = new Chess(fen);
    const board: BoardMap = {};
    for (const row of chess.board()) {
      for (const sq of row) {
        if (sq) board[sq.square] = sq.color + sq.type.toUpperCase();
      }
    }
    return { board, turn, castling };
  } catch {
    // chess.js rejects structurally illegal FENs (e.g. a board with no
    // kings). The editor exists to FIX such positions, so fall back to a
    // manual placement parse; validatePosition below reports the problem
    // and keeps Done disabled until it is fixed.
    const rows = (parts[0] ?? '').split('/');
    if (rows.length !== 8) return null;
    const board: BoardMap = {};
    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) {
          file += Number(ch);
          continue;
        }
        if (!'pnbrqkPNBRQK'.includes(ch) || file > 7) return null;
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        board[`${FILES[file]}${8 - r}`] = color + ch.toUpperCase();
        file += 1;
      }
      if (file !== 8) return null;
    }
    return { board, turn, castling };
  }
}

const START_PARTS = parseFenParts(START_FEN) ?? {
  board: {} as BoardMap,
  turn: 'w' as const,
  castling: { K: true, Q: true, k: true, q: true },
};

function buildFen(
  board: BoardMap,
  turn: 'w' | 'b',
  castling: Record<CastlingKey, boolean>,
): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let empty = 0;
    for (const file of FILES) {
      const piece = board[`${file}${rank}`];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += piece[0] === 'w' ? piece[1] : piece[1].toLowerCase();
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  const castlingStr = (['K', 'Q', 'k', 'q'] as CastlingKey[]).filter((k) => castling[k]).join('');
  return `${rows.join('/')} ${turn} ${castlingStr || '-'} - 0 1`;
}

function validatePosition(board: BoardMap, fen: string, locale: Locale): string | null {
  const pieces = Object.entries(board);
  if (pieces.filter(([, p]) => p === 'wK').length !== 1)
    return translate(locale, 'editor.needWhiteKing');
  if (pieces.filter(([, p]) => p === 'bK').length !== 1)
    return translate(locale, 'editor.needBlackKing');
  for (const [square, piece] of pieces) {
    if ((piece === 'wP' || piece === 'bP') && (square[1] === '1' || square[1] === '8')) {
      return translate(locale, 'editor.pawnOnBackRank');
    }
  }
  try {
    // chess.js throws on structurally illegal FENs.
    new Chess(fen);
  } catch (err) {
    return err instanceof Error ? err.message : translate(locale, 'editor.invalidPosition');
  }
  return null;
}

export default function BoardEditor({
  initialFen,
  onDone,
  onCancel,
  highlightSquares,
  confirmLabel,
  onFenChange,
}: BoardEditorProps) {
  // Warm the active piece set's cache (the palette + board render it).
  const { t, locale } = useMessages();
  const pieceSet = useSettingsStore((s) => s.settings.pieceSet);
  useEffect(() => {
    preloadPieceSet(pieceSet);
  }, [pieceSet]);

  const initial = useMemo(() => parseFenParts(initialFen) ?? START_PARTS, [initialFen]);
  const [board, setBoard] = useState<BoardMap>(initial.board);
  const [turn, setTurn] = useState<'w' | 'b'>(initial.turn);
  const [castling, setCastling] = useState<Record<CastlingKey, boolean>>(initial.castling);
  const [selected, setSelected] = useState<PieceCode | 'eraser' | null>('wP');
  const [flipped, setFlipped] = useState(false);

  const fen = useMemo(() => buildFen(board, turn, castling), [board, turn, castling]);
  const error = useMemo(() => validatePosition(board, fen, locale), [board, fen, locale]);

  useEffect(() => {
    onFenChange?.(fen);
  }, [fen, onFenChange]);

  const placeAt = (square: string) => {
    setBoard((prev) => {
      const next = { ...prev };
      if (selected === 'eraser' || selected === null) {
        if (selected === 'eraser') delete next[square];
        return selected === 'eraser' ? next : prev;
      }
      next[square] = selected;
      return next;
    });
  };

  const removeAt = (square: string) => {
    setBoard((prev) => {
      if (!(square in prev)) return prev;
      const next = { ...prev };
      delete next[square];
      return next;
    });
  };

  const loadParts = (parts: typeof START_PARTS) => {
    setBoard(parts.board);
    setTurn(parts.turn);
    setCastling(parts.castling);
  };

  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? [...FILES].reverse() : [...FILES];

  return (
    <div className="rounded-base bg-panel p-4">
      <h3 className="text-base font-bold text-ink">{t('editor.title')}</h3>
      <p className="mt-0.5 text-xs text-muted">{t('editor.hint')}</p>

      {/* Palette */}
      <div className="mt-3 space-y-1.5" role="toolbar" aria-label={t('editor.piecePalette')}>
        {(['w', 'b'] as const).map((color) => (
          <div key={color} className="flex flex-wrap items-center gap-1">
            {PIECE_TYPES.map((type) => {
              const code = `${color}${type}`;
              const active = selected === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSelected(code)}
                  aria-pressed={active}
                  aria-label={t('editor.placePiece', {
                    color: t(color === 'w' ? 'common.whiteLower' : 'common.blackLower'),
                    piece: type,
                  })}
                  className={`h-10 w-10 rounded p-0.5 transition-colors ${
                    active ? 'bg-accent/25 ring-2 ring-accent' : 'bg-panel2 hover:bg-hover'
                  }`}
                >
                  <span className="pointer-events-none block h-full w-full [&_img]:h-full [&_img]:w-full">
                    <PieceImage piece={code} />
                  </span>
                </button>
              );
            })}
            {color === 'b' && (
              <button
                type="button"
                onClick={() => setSelected('eraser')}
                aria-pressed={selected === 'eraser'}
                className={`ml-1 h-10 rounded px-3 text-sm font-semibold transition-colors ${
                  selected === 'eraser'
                    ? 'bg-[#ca3431]/25 text-[#f0938f] ring-2 ring-[#ca3431]'
                    : 'bg-panel2 text-ink hover:bg-hover'
                }`}
              >
                {t('editor.eraser')}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-5">
        {/* Mini board */}
        <div
          className="grid shrink-0 select-none overflow-hidden rounded border border-line"
          style={{
            gridTemplateColumns: 'repeat(8, 2.5rem)',
            gridTemplateRows: 'repeat(8, 2.5rem)',
            width: '20rem',
            height: '20rem',
          }}
          role="grid"
          aria-label={t('editor.boardLabel')}
        >
          {ranks.map((rank) =>
            files.map((file) => {
              const square = `${file}${rank}`;
              const piece = board[square];
              const fileIdx = FILES.indexOf(file as (typeof FILES)[number]);
              const isLight = (fileIdx + rank) % 2 === 1;
              const highlight = highlightSquares?.[square];
              return (
                <button
                  key={square}
                  type="button"
                  role="gridcell"
                  aria-label={
                    piece
                      ? t('editor.squarePiece', { square, piece })
                      : t('editor.squareEmpty', { square })
                  }
                  data-highlight={highlight ?? undefined}
                  onClick={() => placeAt(square)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    removeAt(square);
                  }}
                  className={`relative flex items-center justify-center ${
                    isLight ? 'bg-boardlight' : 'bg-boarddark'
                  } hover:brightness-110 ${
                    highlight === 'low'
                      ? 'shadow-[inset_0_0_0_3px_#f97316]'
                      : highlight === 'uncertain'
                        ? 'shadow-[inset_0_0_0_3px_#eab308]'
                        : ''
                  }`}
                >
                  {piece && (
                    <span className="pointer-events-none block h-[92%] w-[92%] [&_img]:h-full [&_img]:w-full">
                      <PieceImage piece={piece} />
                    </span>
                  )}
                </button>
              );
            }),
          )}
        </div>

        {/* Controls */}
        <div className="min-w-[220px] flex-1 space-y-4">
          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wide text-muted">
              {t('editor.sideToMove')}
            </legend>
            <div className="mt-1.5 flex gap-1">
              {(['w', 'b'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTurn(c)}
                  aria-pressed={turn === c}
                  className={`rounded px-3 py-1.5 text-sm font-semibold ${
                    turn === c
                      ? 'bg-panel2 text-white ring-1 ring-line'
                      : 'text-muted hover:bg-hover'
                  }`}
                >
                  {c === 'w' ? t('editor.whiteKingName') : t('editor.blackKingName')}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wide text-muted">
              {t('editor.castlingRights')}
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {(
                [
                  ['K', t('editor.castleWhiteShort')],
                  ['Q', t('editor.castleWhiteLong')],
                  ['k', t('editor.castleBlackShort')],
                  ['q', t('editor.castleBlackLong')],
                ] as [CastlingKey, string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-1.5 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={castling[key]}
                    onChange={(e) => setCastling((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="h-4 w-4 accent-[#81b64c]"
                  />
                  {label} <span className="font-mono text-xs text-muted">({key})</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                loadParts({ board: {}, turn, castling: { K: false, Q: false, k: false, q: false } })
              }
              className="rounded bg-panel2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
            >
              {t('editor.clearBoard')}
            </button>
            <button
              type="button"
              onClick={() => loadParts(START_PARTS)}
              className="rounded bg-panel2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
            >
              {t('editor.startPosition')}
            </button>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="rounded bg-panel2 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-hover"
            >
              {t('editor.flipBoard')}
            </button>
          </div>

          <div>
            <p className="break-all rounded bg-panel2 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted">
              {fen}
            </p>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-[#f0938f]">
                {error}
              </p>
            ) : (
              <p className="mt-2 text-sm text-accent">{t('editor.positionValid')}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={error !== null}
              onClick={() => onDone(fen)}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white shadow-[0_3px_0_0_var(--accent-shadow)] transition hover:brightness-110 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {confirmLabel ?? t('editor.done')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded bg-panel2 px-4 py-2 text-sm font-semibold text-ink hover:bg-hover"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
