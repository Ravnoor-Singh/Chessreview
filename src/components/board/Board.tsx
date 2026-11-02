'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { Move, Square } from 'chess.js';
import type { ClassificationReason, MoveClass } from '@/lib/types';
import { Arrows } from './Arrows';
import ThemeFilterDefs, { FilteredSquare } from './ThemeFilterDefs';
import type { ArrowDef, CircleDef } from './Arrows';
import { ClassBadge } from './SquareBadge';
import { PieceImage, pieceLetterToSetKey } from './Piece';
import { PromotionPicker } from './PromotionPicker';
import type { PromotionPiece } from './PromotionPicker';
import { boardThemeTokens, type BoardThemeTokens } from '@/lib/boardThemes';
import { animationTimingFunction } from '@/themes/animations';
import { preloadPieceSet } from '@/lib/pieces';
import type { CoordinatesMode } from '@/components/ui/SettingsDrawer';
import { useSettingsStore } from '@/store/settingsStore';
import { useMessages } from '@/i18n/useMessages';
import type { MessageKey } from '@/i18n';

export interface BoardProps {
  fen: string;
  orientation: 'w' | 'b';
  interactive?: boolean;
  /** Called with a UCI move; return false to reject it (piece snaps back). */
  onUserMove?: (uci: string) => boolean;
  lastMove?: { from: string; to: string } | null;
  suggestionArrows?: ArrowDef[];
  badge?: { square: string; classification: MoveClass; reason?: ClassificationReason } | null;
  boardTheme?: string;
  /** Coordinate placement (Prompt 7). Supersedes `showCoordinates`. */
  coordinates?: CoordinatesMode;
  /** @deprecated Legacy boolean: true → 'inside', false → 'off'. */
  showCoordinates?: boolean;
  animationMs?: number;
}

const PIECE_NAME_KEY: Record<string, MessageKey> = {
  p: 'pieces.pawn',
  n: 'pieces.knight',
  b: 'pieces.bishop',
  r: 'pieces.rook',
  q: 'pieces.queen',
  k: 'pieces.king',
};

const FILES = 'abcdefgh';

/** 'e4' → { file: 0..7, rank: 0..7 (rank 1 = 0) }, null when malformed. */
function parseSquare(square: string): { file: number; rank: number } | null {
  if (square.length !== 2) return null;
  const file = FILES.indexOf(square.charAt(0));
  const rank = square.charCodeAt(1) - '1'.charCodeAt(0);
  if (file < 0 || rank < 0 || rank > 7) return null;
  return { file, rank };
}

function toSquare(file: number, rank: number): string {
  return `${FILES.charAt(file)}${rank + 1}`;
}

/** Display column/row (0 = left/top as rendered) for a board square. */
function displayPos(square: string, orientation: 'w' | 'b'): { col: number; row: number } | null {
  const parsed = parseSquare(square);
  if (!parsed) return null;
  return {
    col: orientation === 'w' ? parsed.file : 7 - parsed.file,
    row: orientation === 'w' ? 7 - parsed.rank : parsed.rank,
  };
}

interface FlatPiece {
  square: string;
  type: string;
  color: 'w' | 'b';
}

interface PieceInstance extends FlatPiece {
  id: number;
}

function squareDistance(a: string, b: string): number {
  const pa = parseSquare(a);
  const pb = parseSquare(b);
  if (!pa || !pb) return Number.POSITIVE_INFINITY;
  return Math.hypot(pa.file - pb.file, pa.rank - pb.rank);
}

/* ------------------------------------------------------------------ */
/*  One board square (memoized: re-renders only when its props change) */
/* ------------------------------------------------------------------ */

interface SquareCellProps {
  square: string;
  bg: string;
  bgImage?: string;
  coordColor: string;
  lastMoveColor: string;
  selectedColor: string;
  checkColor: string;
  legalDotColor: string;
  rankLabel: string | null;
  fileLabel: string | null;
  isLastMove: boolean;
  isSelected: boolean;
  isCheck: boolean;
  isTarget: boolean;
  isCaptureTarget: boolean;
  /** Keyboard focus square (Prompt 6): draws the focus ring. */
  kbFocused: boolean;
  ariaLabel: string;
  /** Last-move/selected highlight rendering (Themes & Presets, Stage A). */
  highlightStyle: 'solid' | 'ring';
  /** Legal-move hint rendering (Themes & Presets, Stage A). */
  moveHintStyle: 'dots' | 'rings' | 'none';
  /** SVG texture filter id from the board tokens (Themes & Presets, Stage B). */
  filterId?: string;
}

const SquareCell = React.memo(function SquareCell({
  square,
  bg,
  bgImage,
  coordColor,
  lastMoveColor,
  selectedColor,
  checkColor,
  legalDotColor,
  rankLabel,
  fileLabel,
  isLastMove,
  isSelected,
  isCheck,
  isTarget,
  isCaptureTarget,
  kbFocused,
  ariaLabel,
  highlightStyle,
  moveHintStyle,
  filterId,
}: SquareCellProps): React.JSX.Element {
  return (
    <div
      role="gridcell"
      aria-label={ariaLabel}
      data-square={square}
      className="relative"
      style={{ backgroundColor: bg, backgroundImage: bgImage }}
    >
      {filterId ? <FilteredSquare filterId={filterId} color={bg} /> : null}
      {kbFocused && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ boxShadow: 'inset 0 0 0 3px var(--accent)', zIndex: 6 }}
        />
      )}
      {isLastMove &&
        (highlightStyle === 'ring' ? (
          <div
            className="absolute inset-0"
            style={{ boxShadow: `inset 0 0 0 5px ${lastMoveColor}` }}
          />
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: lastMoveColor }} />
        ))}
      {isSelected &&
        (highlightStyle === 'ring' ? (
          <div
            className="absolute inset-0"
            style={{ boxShadow: `inset 0 0 0 5px ${selectedColor}` }}
          />
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: selectedColor }} />
        ))}
      {isCheck && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at center, ${checkColor}e6 0%, ${checkColor}80 52%, ${checkColor}00 74%)`,
          }}
        />
      )}
      {rankLabel !== null && (
        <span
          aria-hidden="true"
          className="absolute font-semibold"
          style={{
            top: '3%',
            left: '5%',
            fontSize: 'clamp(8px, 1.6vw, 13px)',
            color: coordColor,
            lineHeight: 1,
          }}
        >
          {rankLabel}
        </span>
      )}
      {fileLabel !== null && (
        <span
          aria-hidden="true"
          className="absolute font-semibold"
          style={{
            bottom: '3%',
            right: '5%',
            fontSize: 'clamp(8px, 1.6vw, 13px)',
            color: coordColor,
            lineHeight: 1,
          }}
        >
          {fileLabel}
        </span>
      )}
      {isTarget && !isCaptureTarget && moveHintStyle === 'dots' && (
        <div
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            width: '31%',
            height: '31%',
            left: '34.5%',
            top: '34.5%',
            backgroundColor: legalDotColor,
          }}
        />
      )}
      {isTarget && !isCaptureTarget && moveHintStyle === 'rings' && (
        <div
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            width: '62%',
            height: '62%',
            left: '19%',
            top: '19%',
            border: `4px solid ${legalDotColor}`,
            boxSizing: 'border-box',
          }}
        />
      )}
      {isCaptureTarget && moveHintStyle !== 'none' && (
        <div
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            inset: '2.5%',
            border: `5px solid ${legalDotColor}`,
            boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Board                                                              */
/* ------------------------------------------------------------------ */

interface DragState {
  instanceId: number;
  from: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
}

interface RightDrawState {
  from: string;
  to: string | null;
  color: string;
}

interface PendingPromotion {
  from: string;
  to: string;
  color: 'w' | 'b';
}

function arrowColorFor(e: React.PointerEvent, theme: BoardThemeTokens): string {
  if (e.shiftKey) return theme.arrowShift;
  if (e.altKey) return theme.arrowAlt;
  if (e.ctrlKey || e.metaKey) return theme.arrowCtrl;
  return theme.arrowDefault;
}

const BADGE_STYLE = `
@keyframes cr-badge-pop {
  0% { transform: scale(0); }
  60% { transform: scale(1.18); }
  100% { transform: scale(1); }
}
.cr-badge-pop {
  display: block;
  transform-origin: center;
  animation: cr-badge-pop 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
`;

export function Board({
  fen,
  orientation,
  interactive,
  onUserMove,
  lastMove,
  suggestionArrows,
  badge,
  boardTheme = 'green',
  coordinates,
  showCoordinates,
  animationMs = 150,
}: BoardProps): React.JSX.Element {
  const { t } = useMessages();
  const isInteractive = interactive ?? onUserMove !== undefined;
  const theme = boardThemeTokens(boardTheme);
  const coordMode: CoordinatesMode =
    coordinates ?? (showCoordinates === undefined ? 'inside' : showCoordinates ? 'inside' : 'off');

  // Preload the active piece set's images on mount / set change so a set
  // switch renders instantly; other sets stay lazy.
  const pieceSet = useSettingsStore((s) => s.settings.pieceSet);
  useEffect(() => {
    preloadPieceSet(pieceSet);
  }, [pieceSet]);

  // Theme display options (Themes & Presets, Stage A): highlight/hint
  // rendering and the piece animation style come from the settings
  // store; the defaults reproduce the pre-registry rendering exactly.
  const highlightStyleRaw = useSettingsStore((s) => s.settings.highlightStyle);
  const highlightStyle: 'solid' | 'ring' = highlightStyleRaw === 'ring' ? 'ring' : 'solid';
  const moveHintStyleRaw = useSettingsStore((s) => s.settings.moveHintStyle);
  const moveHintStyle: 'dots' | 'rings' | 'none' =
    moveHintStyleRaw === 'rings' || moveHintStyleRaw === 'none' ? moveHintStyleRaw : 'dots';
  const animationStyleId = useSettingsStore((s) => s.settings.animationStyleId) ?? 'slide';
  const animTiming = animationTimingFunction(animationStyleId);
  const effectiveAnimationMs = animationStyleId === 'off' ? 0 : animationMs;
  // Blindfold mode (Themes & Presets, Stage C): piece images are not
  // rendered at all; squares, coordinates, hints and the move list are
  // untouched, and the pieces' accessible names stay on the squares.
  const blindfold = useSettingsStore((s) => s.settings.blindfoldMode) === true;

  const boardRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState(0);

  const [selected, setSelected] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<Move[]>([]);
  // Keyboard model (Round 2, Prompt 6): the board container is the tab
  // stop; arrow keys move a visible focus square, Enter selects the
  // piece / completes the move (same plumbing as click-click), Escape
  // clears. Announcements go to a polite live region so screen-reader
  // users hear selections, legal targets and played moves.
  const [kbSquare, setKbSquare] = useState<string | null>(null);
  const [kbActive, setKbActive] = useState(false);
  const [kbAnnouncement, setKbAnnouncement] = useState('');
  const kbHintId = useId();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [userArrows, setUserArrows] = useState<ArrowDef[]>([]);
  const [userCircles, setUserCircles] = useState<CircleDef[]>([]);
  const [rightDraw, setRightDraw] = useState<RightDrawState | null>(null);

  /* ---------------- position model ---------------- */

  const chess = useMemo<Chess>(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const flatPieces = useMemo<FlatPiece[]>(() => {
    const out: FlatPiece[] = [];
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell) out.push({ square: cell.square, type: cell.type, color: cell.color });
      }
    }
    return out;
  }, [chess]);

  const pieceBySquare = useMemo<Map<string, FlatPiece>>(() => {
    const map = new Map<string, FlatPiece>();
    for (const p of flatPieces) map.set(p.square, p);
    return map;
  }, [flatPieces]);

  const checkSquare = useMemo<string | null>(() => {
    if (!chess.inCheck()) return null;
    const turn = chess.turn();
    const king = flatPieces.find((p) => p.type === 'k' && p.color === turn);
    return king ? king.square : null;
  }, [chess, flatPieces]);

  /* ------- piece identity across FEN changes (slide animation) ------- */
  // Instances are matched between consecutive positions by color+type and
  // nearest square, so a moved piece keeps its React key and its CSS
  // transform transition animates the slide. Captured pieces have no match
  // and unmount; new pieces (incl. promotion results, matched via the
  // any-type proximity fallback) mount at their square.
  const instancesRef = useRef<{ fen: string; list: PieceInstance[]; nextId: number }>({
    fen: '',
    list: [],
    nextId: 1,
  });

  const instances = useMemo<PieceInstance[]>(() => {
    const cache = instancesRef.current;
    if (cache.fen === fen) return cache.list;
    const used = new Set<number>();
    const next: PieceInstance[] = [];
    // Pass 1: same color + type, nearest square.
    const unmatched: FlatPiece[] = [];
    for (const piece of flatPieces) {
      let bestId = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const prev of cache.list) {
        if (used.has(prev.id) || prev.color !== piece.color || prev.type !== piece.type) continue;
        const d = squareDistance(prev.square, piece.square);
        if (d < bestDist) {
          bestDist = d;
          bestId = prev.id;
        }
      }
      if (bestId >= 0) {
        used.add(bestId);
        next.push({ ...piece, id: bestId });
      } else {
        unmatched.push(piece);
      }
    }
    // Pass 2: any remaining piece of the same color within one square —
    // covers promotion (pawn → queen on the promotion square).
    const stillUnmatched: FlatPiece[] = [];
    for (const piece of unmatched) {
      let bestId = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const prev of cache.list) {
        if (used.has(prev.id) || prev.color !== piece.color) continue;
        const d = squareDistance(prev.square, piece.square);
        if (d < bestDist) {
          bestDist = d;
          bestId = prev.id;
        }
      }
      if (bestId >= 0 && bestDist <= 1.5) {
        used.add(bestId);
        next.push({ ...piece, id: bestId });
      } else {
        stillUnmatched.push(piece);
      }
    }
    for (const piece of stillUnmatched) {
      next.push({ ...piece, id: cache.nextId });
      cache.nextId += 1;
    }
    instancesRef.current = { fen, list: next, nextId: cache.nextId };
    return next;
  }, [fen, flatPieces]);

  /* ---------------- effects ---------------- */

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    setBoardSize(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setBoardSize(rect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A new position invalidates any in-progress interaction. (The
  // keyboard focus square and its live-region announcement deliberately
  // survive: the focus square is a UI cursor, and clearing the
  // announcement here would erase the "move played" message set by the
  // very keypress that caused the position change.)
  useEffect(() => {
    setSelected(null);
    setLegalTargets([]);
    setDrag(null);
    setPendingPromotion(null);
  }, [fen]);

  /* ---------------- move plumbing ---------------- */

  const movesFrom = (square: string): Move[] => {
    try {
      return chess.moves({ square: square as Square, verbose: true });
    } catch {
      return [];
    }
  };

  const selectSquare = (square: string): void => {
    setSelected(square);
    setLegalTargets(movesFrom(square));
  };

  const clearSelection = (): void => {
    setSelected(null);
    setLegalTargets([]);
  };

  const attemptMove = (from: string, to: string): void => {
    if (!onUserMove) return;
    const candidates = movesFrom(from).filter((m) => m.to === to);
    if (candidates.length === 0) return;
    setDrag(null);
    if (candidates.some((m) => m.promotion !== undefined)) {
      const mover = pieceBySquare.get(from);
      setPendingPromotion({ from, to, color: mover ? mover.color : chess.turn() });
      return;
    }
    onUserMove(`${from}${to}`);
    clearSelection();
  };

  const handlePromotionPick = (piece: PromotionPiece): void => {
    if (!pendingPromotion || !onUserMove) return;
    onUserMove(`${pendingPromotion.from}${pendingPromotion.to}${piece}`);
    setPendingPromotion(null);
    clearSelection();
  };

  const handlePromotionCancel = (): void => {
    setPendingPromotion(null);
  };

  /* ---------------- keyboard handling (Prompt 6) ---------------- */

  /** Accessible name of a square, identical to its gridcell label. */
  const squareLabel = (square: string): string => {
    const piece = pieceBySquare.get(square);
    if (!piece) return square;
    return t('engine.squareWithPiece', {
      square,
      color: t(piece.color === 'w' ? 'common.whiteLower' : 'common.blackLower'),
      piece: PIECE_NAME_KEY[piece.type] ? t(PIECE_NAME_KEY[piece.type]) : piece.type,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (!isInteractive || pendingPromotion) return;
    const current = kbSquare ?? selected ?? (orientation === 'w' ? 'e2' : 'e7');
    const pos = parseSquare(current);
    if (!pos) return;

    const arrowDelta: Record<string, { df: number; dr: number }> = {
      // Screen-space arrows: "up" is toward rank 8 for White's
      // orientation, toward rank 1 when the board is flipped.
      ArrowUp: { df: 0, dr: orientation === 'w' ? 1 : -1 },
      ArrowDown: { df: 0, dr: orientation === 'w' ? -1 : 1 },
      ArrowRight: { df: orientation === 'w' ? 1 : -1, dr: 0 },
      ArrowLeft: { df: orientation === 'w' ? -1 : 1, dr: 0 },
    };
    const delta = arrowDelta[e.key];
    if (delta) {
      e.preventDefault();
      // Handled keys must not leak to page-level shortcuts (the review
      // page binds ArrowLeft/Right to ply navigation on window).
      e.stopPropagation();
      const next = toSquare(
        Math.min(7, Math.max(0, pos.file + delta.df)),
        Math.min(7, Math.max(0, pos.rank + delta.dr)),
      );
      setKbSquare(next);
      setKbAnnouncement(squareLabel(next));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      // Completing a move wins over re-selection, exactly like click-click.
      if (selected && current !== selected) {
        const candidate = movesFrom(selected).find((m) => m.to === current);
        if (candidate) {
          attemptMove(selected, current);
          setKbSquare(current);
          setKbAnnouncement(t('engine.kbMovePlayed', { san: candidate.san }));
          return;
        }
      }
      const piece = pieceBySquare.get(current);
      if (piece && piece.color === chess.turn()) {
        selectSquare(current);
        setKbSquare(current);
        const targets = movesFrom(current);
        setKbAnnouncement(
          t('engine.kbSelected', {
            label: squareLabel(current),
            count: targets.length,
            moves: targets.map((m) => m.san).join(', '),
          }),
        );
      } else if (selected) {
        clearSelection();
        setKbAnnouncement(t('engine.kbSelectionCleared'));
      } else {
        setKbAnnouncement(squareLabel(current));
      }
      return;
    }
    if (e.key === 'Escape' && selected) {
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
      setKbAnnouncement(t('engine.kbSelectionCleared'));
    }
  };

  /* ---------------- pointer handling ---------------- */

  const pointFromEvent = (e: React.PointerEvent): { x: number; y: number } | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const squareFromEvent = (e: React.PointerEvent): string | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null;
    const col = Math.floor(fx * 8);
    const row = Math.floor(fy * 8);
    const file = orientation === 'w' ? col : 7 - col;
    const rank = orientation === 'w' ? 7 - row : row;
    return toSquare(file, rank);
  };

  const handlePointerDown = (e: React.PointerEvent): void => {
    if (pendingPromotion) return;
    if (e.button === 2) {
      e.preventDefault();
      const square = squareFromEvent(e);
      if (square) {
        setRightDraw({ from: square, to: square, color: arrowColorFor(e, theme) });
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* capture is best-effort */
        }
      }
      return;
    }
    if (e.button !== 0) return;

    // Any left click clears the user's drawings.
    setUserArrows([]);
    setUserCircles([]);

    if (!isInteractive || !onUserMove) {
      clearSelection();
      return;
    }
    const square = squareFromEvent(e);
    if (!square) return;

    // Click-click: a target of the current selection completes the move.
    if (selected && square !== selected && legalTargets.some((m) => m.to === square)) {
      attemptMove(selected, square);
      return;
    }

    const piece = pieceBySquare.get(square);
    if (piece && piece.color === chess.turn()) {
      selectSquare(square);
      const point = pointFromEvent(e);
      const instance = instances.find((inst) => inst.square === square);
      if (point && instance) {
        setDrag({
          instanceId: instance.id,
          from: square,
          pointerId: e.pointerId,
          startX: point.x,
          startY: point.y,
          x: point.x,
          y: point.y,
          active: false,
        });
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* capture is best-effort */
        }
      }
    } else {
      clearSelection();
    }
  };

  const handlePointerMove = (e: React.PointerEvent): void => {
    if (rightDraw) {
      const square = squareFromEvent(e);
      if (square && square !== rightDraw.to) {
        setRightDraw({ ...rightDraw, to: square });
      }
      return;
    }
    if (!drag || e.pointerId !== drag.pointerId) return;
    const point = pointFromEvent(e);
    if (!point) return;
    if (!drag.active) {
      if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 6) {
        setDrag({ ...drag, x: point.x, y: point.y, active: true });
      }
      return;
    }
    setDrag({ ...drag, x: point.x, y: point.y });
  };

  const handlePointerUp = (e: React.PointerEvent): void => {
    if (rightDraw && e.button === 2) {
      const { from, to, color } = rightDraw;
      if (!to || to === from) {
        // Plain right-click: toggle a circle.
        setUserCircles((prev) => {
          const exists = prev.some((c) => c.square === from && c.color === color);
          return exists
            ? prev.filter((c) => !(c.square === from && c.color === color))
            : [...prev, { square: from, color }];
        });
      } else {
        // Right-drag: toggle an arrow.
        setUserArrows((prev) => {
          const exists = prev.some((a) => a.from === from && a.to === to && a.color === color);
          return exists
            ? prev.filter((a) => !(a.from === from && a.to === to && a.color === color))
            : [...prev, { from, to, color, opacity: 0.85 }];
        });
      }
      setRightDraw(null);
      return;
    }
    if (e.button !== 0) return;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const wasActive = drag.active;
    const from = drag.from;
    setDrag(null);
    if (wasActive) {
      const dropSquare = squareFromEvent(e);
      if (dropSquare && dropSquare !== from) {
        attemptMove(from, dropSquare);
      }
      // Dropping back on the origin (or off-board) snaps back and keeps the
      // selection, matching click-to-select behavior.
    }
  };

  const handlePointerCancel = (): void => {
    setDrag(null);
    setRightDraw(null);
  };

  /* ---------------- composed overlays ---------------- */

  const previewArrow: ArrowDef[] =
    rightDraw && rightDraw.to && rightDraw.to !== rightDraw.from
      ? [{ from: rightDraw.from, to: rightDraw.to, color: rightDraw.color, opacity: 0.9 }]
      : [];

  const allArrows: ArrowDef[] = [...(suggestionArrows ?? []), ...userArrows, ...previewArrow];

  const targetSquares = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of legalTargets) map.set(m.to, m.captured !== undefined || m.flags.includes('e'));
    return map;
  }, [legalTargets]);

  const badgePos = badge ? displayPos(badge.square, orientation) : null;
  const badgeSize = boardSize > 0 ? Math.max(18, Math.round((boardSize / 8) * 0.48)) : 24;
  const promoPos = pendingPromotion ? displayPos(pendingPromotion.to, orientation) : null;

  /* ---------------- render ---------------- */

  const cells: React.JSX.Element[] = [];
  for (let row = 0; row < 8; row += 1) {
    const rowCells: React.JSX.Element[] = [];
    for (let col = 0; col < 8; col += 1) {
      const file = orientation === 'w' ? col : 7 - col;
      const rank = orientation === 'w' ? 7 - row : row;
      const square = toSquare(file, rank);
      const isLight = (file + rank) % 2 === 1;
      const piece = pieceBySquare.get(square);
      const ariaLabel = piece
        ? t('engine.squareWithPiece', {
            square,
            color: t(piece.color === 'w' ? 'common.whiteLower' : 'common.blackLower'),
            piece: PIECE_NAME_KEY[piece.type] ? t(PIECE_NAME_KEY[piece.type]) : piece.type,
          })
        : square;
      rowCells.push(
        <SquareCell
          key={square}
          square={square}
          bg={isLight ? theme.light : theme.dark}
          bgImage={isLight ? theme.textureLight : theme.textureDark}
          coordColor={isLight ? theme.coordOnLight : theme.coordOnDark}
          lastMoveColor={theme.lastMove}
          selectedColor={theme.selected}
          checkColor={theme.check}
          legalDotColor={theme.legalDot}
          rankLabel={coordMode === 'inside' && col === 0 ? String(rank + 1) : null}
          fileLabel={coordMode === 'inside' && row === 7 ? FILES.charAt(file) : null}
          isLastMove={Boolean(lastMove && (lastMove.from === square || lastMove.to === square))}
          isSelected={selected === square}
          isCheck={checkSquare === square}
          isTarget={targetSquares.has(square)}
          isCaptureTarget={targetSquares.get(square) === true}
          kbFocused={kbActive && kbSquare === square}
          ariaLabel={ariaLabel}
          highlightStyle={highlightStyle}
          moveHintStyle={moveHintStyle}
          filterId={theme.filterId}
        />,
      );
    }
    // role="row" wrapper with display:contents — the CSS grid layout is
    // unchanged (children participate directly), the ARIA tree gains the
    // grid structure (Prompt 6).
    cells.push(
      <div key={`row-${row}`} role="row" style={{ display: 'contents' }}>
        {rowCells}
      </div>,
    );
  }

  const squarePx = boardSize / 8;

  const boardEl = (
    <div
      ref={boardRef}
      className="relative w-full select-none"
      style={{
        aspectRatio: '1 / 1',
        touchAction: 'none',
        cursor: isInteractive ? 'grab' : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      // Keyboard model (Prompt 6): the board is one tab stop when
      // interactive; arrow keys move the focus square (see
      // handleKeyDown). The grid semantics live on the squares wrapper.
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        setKbActive(true);
        setKbSquare((prev) => prev ?? selected ?? (orientation === 'w' ? 'e2' : 'e7'));
      }}
      onBlur={() => setKbActive(false)}
      aria-describedby={isInteractive ? kbHintId : undefined}
    >
      <style>{BADGE_STYLE}</style>
      <ThemeFilterDefs />
      {isInteractive && (
        <span id={kbHintId} className="sr-only">
          {t('engine.kbBoardHint')}
        </span>
      )}
      <div aria-live="polite" className="sr-only">
        {kbAnnouncement}
      </div>

      {/* squares */}
      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)' }}
        role="grid"
        aria-label={t('engine.chessBoard')}
        aria-rowcount={8}
        aria-colcount={8}
      >
        {cells}
      </div>

      {/* arrows + user circles (below pieces, above squares) */}
      <div className="absolute inset-0" style={{ zIndex: 15 }}>
        <Arrows arrows={allArrows} orientation={orientation} circles={userCircles} />
      </div>

      {/* pieces */}
      <div className="absolute inset-0" style={{ pointerEvents: 'none', zIndex: 20 }}>
        {instances.map((inst) => {
          const pos = displayPos(inst.square, orientation);
          if (!pos) return null;
          const isDragged = drag !== null && drag.active && drag.instanceId === inst.id;
          const transform = isDragged
            ? `translate(${drag.x - squarePx / 2}px, ${drag.y - squarePx / 2}px)`
            : `translate(${pos.col * 100}%, ${pos.row * 100}%)`;
          return (
            <div
              key={inst.id}
              className="absolute"
              style={{
                left: 0,
                top: 0,
                width: '12.5%',
                height: '12.5%',
                padding: '0.6%',
                boxSizing: 'border-box',
                transform,
                transition: isDragged
                  ? 'none'
                  : `transform ${effectiveAnimationMs}ms ${animTiming}`,
                zIndex: isDragged ? 50 : 20,
                filter: isDragged ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))' : undefined,
              }}
            >
              {!blindfold && <PieceImage piece={pieceLetterToSetKey(inst.color, inst.type)} />}
            </div>
          );
        })}
      </div>

      {/* classification badge */}
      {badge && badgePos && (
        <div
          key={`${badge.square}-${badge.classification}`}
          className="absolute"
          style={{
            left: `${badgePos.col * 12.5}%`,
            top: `${badgePos.row * 12.5}%`,
            width: '12.5%',
            height: '12.5%',
            pointerEvents: 'none',
            zIndex: 40,
          }}
        >
          <div className="absolute" style={{ right: 0, top: 0, transform: 'translate(32%, -32%)' }}>
            <span className="cr-badge-pop">
              <ClassBadge
                classification={badge.classification}
                size={badgeSize}
                reason={badge.reason}
              />
            </span>
          </div>
        </div>
      )}

      {/* promotion picker */}
      {pendingPromotion && promoPos && (
        <PromotionPicker
          color={pendingPromotion.color}
          file={promoPos.col}
          orientation={orientation}
          onPick={handlePromotionPick}
          onCancel={handlePromotionCancel}
        />
      )}
    </div>
  );

  if (coordMode !== 'outside') return boardEl;

  // Outside coordinates: a gutter column/row rendered as an extension of
  // the board edge — each label cell takes the adjacent square's color and
  // the theme's coordinate color for that square (contrast ≥ 4.5:1).
  const gutter = 18;
  const rankCells = Array.from({ length: 8 }, (_, row) => {
    const file = orientation === 'w' ? 0 : 7;
    const rank = orientation === 'w' ? 7 - row : row;
    const isLight = (file + rank) % 2 === 1;
    return (
      <div
        key={row}
        aria-hidden="true"
        className="grid flex-1 place-items-center text-[11px] font-semibold"
        style={{
          backgroundColor: isLight ? theme.light : theme.dark,
          backgroundImage: isLight ? theme.textureLight : theme.textureDark,
          color: isLight ? theme.coordOnLight : theme.coordOnDark,
        }}
      >
        {rank + 1}
      </div>
    );
  });
  const fileCells = Array.from({ length: 8 }, (_, col) => {
    const file = orientation === 'w' ? col : 7 - col;
    const rank = orientation === 'w' ? 0 : 7;
    const isLight = (file + rank) % 2 === 1;
    return (
      <div
        key={col}
        aria-hidden="true"
        className="grid flex-1 place-items-center text-[11px] font-semibold"
        style={{
          backgroundColor: isLight ? theme.light : theme.dark,
          backgroundImage: isLight ? theme.textureLight : theme.textureDark,
          color: isLight ? theme.coordOnLight : theme.coordOnDark,
        }}
      >
        {FILES.charAt(file)}
      </div>
    );
  });

  return (
    <div
      className="grid w-full"
      style={{
        gridTemplateColumns: `${gutter}px 1fr`,
        gridTemplateRows: `1fr ${gutter}px`,
      }}
    >
      <div className="flex flex-col">{rankCells}</div>
      {boardEl}
      <div style={{ backgroundColor: theme.dark, backgroundImage: theme.textureDark }} />
      <div className="flex">{fileCells}</div>
    </div>
  );
}

export default Board;
