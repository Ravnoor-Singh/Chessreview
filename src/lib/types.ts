// Shared data models (spec Section 12).

export type MoveClass =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss'
  | 'forced';

export interface EngineLine {
  multipv: number;
  depth: number;
  /** Score in centipawns from the side-to-move perspective. */
  scoreCp?: number;
  /** Signed moves-to-mate from the side-to-move perspective. */
  scoreMate?: number;
  /** Win/draw/loss per mille from the side-to-move perspective. */
  wdl?: [number, number, number];
  /** Principal variation as UCI moves. */
  pv: string[];
  nodes?: number;
  nps?: number;
  seldepth?: number;
}

/**
 * Machine-readable reason a move got its classification (Prompt 4,
 * explainability). Set by classifyMoveDetailed, surfaced in coach
 * feedback and as the "Why this label?" tooltip on badges.
 */
export type ClassificationReason =
  | 'forced'
  | 'book'
  | 'only_move'
  | 'turning_point'
  | 'critical_moment'
  | 'mate_threat'
  | 'sacrifice_piece'
  | 'sacrifice_exchange'
  | 'sacrifice_queen'
  | 'sacrifice_mate'
  | 'trivial_recapture_blocked'
  | 'recapture_not_sacrifice'
  | 'epl_threshold'
  | 'best_move'
  | 'missed_tactic';

export interface PlyAnalysis {
  ply: number; // 0 = start position
  fen: string;
  san?: string; // move that led here
  uci?: string;
  color?: 'w' | 'b'; // mover
  /** Evaluation from White's perspective; mates encoded as ±(100000 - |mate|). */
  evalWhiteCp: number;
  mate?: number; // from White's perspective
  lines: EngineLine[]; // top MultiPV lines from THIS position (side to move)
  depth: number;
  winProbWhite: number; // 0..100
  epl?: number; // expected-points loss of the move that led here
  accuracy?: number; // per-move accuracy 0..100
  classification?: MoveClass;
  /** Why the move got that classification (see ClassificationReason). */
  reason?: ClassificationReason;
  clockMs?: number;
  timeSpentMs?: number;
  bookName?: string;
  bookEco?: string;
  feedback?: string;
  bestMoveSan?: string;
  bestMoveUci?: string;
}

export type ClassCounts = Record<MoveClass, number>;

/**
 * Qualitative single-game performance band (Prompt 5). Deliberately
 * NOT a numeric rating: measured on 250 real games, single-game
 * accuracy + ACPL cannot pin a rating closer than ≈ ±490 Elo (80%
 * band), so the app shows a rough labelled band instead. See
 * src/analysis/rating.ts and README "How accuracy is computed".
 */
export interface PerformanceEstimate {
  band: 'beginner' | 'club' | 'strong-club' | 'expert' | 'master';
  label: string;
}

export interface GameReview {
  id: string; // hash of PGN
  pgn: string;
  headers: Record<string, string>;
  plies: PlyAnalysis[];
  accuracy: { white: number | null; black: number | null };
  counts: Record<'white' | 'black', ClassCounts>;
  opening?: { eco: string; name: string; leftBookAtPly?: number; sequenceSan: string[] };
  /** Resolved game ending (Prompt 12); absent on reviews saved before it existed. */
  termination?: GameTermination;
  /** Qualitative performance bands (Prompt 5); replaces the removed numeric estimatedRating. */
  performance?: { white: PerformanceEstimate | null; black: PerformanceEstimate | null };
  acpl: { white: number; black: number };
  engine: { name: string; depth: number; mode: EngineMode };
  createdAt: number;
}

export type EngineMode = 'multi' | 'single' | 'lite';

export type AnalysisDepth = 'quick' | 'standard' | 'deep';

export interface DepthPreset {
  depth: number;
  movetimeMs: number;
  label: string;
}

export interface ImportedGameSummary {
  id: string;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  result: string;
  date: string;
  event: string;
  timeClass?: string;
  url?: string;
  pgn: string;
}

/**
 * How a game ended (Prompt 12). The full taxonomy lives in
 * src/analysis/termination.ts, which resolves a kind from, in priority
 * order: the final position itself, repetition / move-counter state,
 * Termination tags + importer metadata, and finally the result string.
 */
export type TerminationKind =
  | 'checkmate'
  | 'stalemate'
  | 'repetition-threefold'
  | 'repetition-fivefold'
  | 'fifty-move'
  | 'seventyfive-move'
  | 'insufficient-material'
  | 'agreement'
  | 'resignation'
  | 'timeout'
  | 'timeout-vs-insufficient-material'
  | 'abandonment'
  | 'forfeit'
  | 'unfinished';

export type GameResultToken = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface GameTermination {
  kind: TerminationKind;
  /** Winning side, or null for draws and unfinished games. */
  winner: 'white' | 'black' | null;
  result: GameResultToken;
  /**
   * How the kind was determined, e.g. 'position', 'fivefold',
   * 'termination-tag', 'chesscom-result', 'lichess-status',
   * 'result-only-kind-unknown' (winner/result known, mechanism not —
   * `kind` then carries the conventional fallback and UIs must not
   * present the mechanism as fact).
   */
  detail?: string;
}

/** Importer-supplied ending metadata (additive; all fields optional). */
export interface TerminationMetadata {
  chesscomWhiteResult?: string;
  chesscomBlackResult?: string;
  lichessStatus?: string;
  lichessWinner?: 'white' | 'black' | null;
  terminationTag?: string;
}

/** A PGN that stopped parsing mid-game (Prompt 12 truncation support). */
export interface PgnParseErrorInfo {
  /** 1-based ply at which parsing failed. */
  ply: number;
  /** The offending SAN token, exactly as written (after cleaning). */
  san: string;
  /** Localized, human-readable message naming the ply and the SAN. */
  message: string;
  /** Number of main-line moves that DID parse (the analyzable prefix). */
  validMoves: number;
  /** Legal SAN moves available at the failure position (when known). */
  legalMoves?: string[];
}

export interface ParsedGame {
  headers: Record<string, string>;
  /** SAN main line. */
  moves: string[];
  /** FEN before each ply and after the last one: fens[0] is the start. */
  fens: string[];
  startFen: string;
  clocksMs: (number | null)[];
  result: string;
  /** Resolved game ending (Prompt 12); computed by the PGN parser. */
  termination?: GameTermination;
  /** Importer metadata the termination was (or can be) resolved from. */
  terminationMeta?: TerminationMetadata;
  /**
   * True when the game is a Chess960 / Fischer Random game. Chess960 is
   * NOT supported: chess.js 1.4 generates only standard castling (king
   * ±2 squares, KQkq castling rights), so a 960 game must never be
   * analyzed as standard chess — the UI shows a localized "not
   * supported yet" screen instead (see README "Chess960").
   */
  isChess960?: boolean;
  /**
   * Set when the movetext was truncated/corrupt: `moves`/`fens` hold the
   * valid prefix only, and the owning `pgn` text is a clean re-serialized
   * PGN of that prefix, safe to analyze.
   */
  parseError?: PgnParseErrorInfo;
}

export interface VariationNode {
  id: string;
  san: string;
  uci: string;
  fen: string;
  parentPly: number; // ply index in the main line this branches from (position index)
  children: VariationNode[];
}
