export type Color = "white" | "black";

export type PieceType =
  | "pawn"
  | "knight"
  | "bishop"
  | "rook"
  | "queen"
  | "king";

export type Piece = {
  color: Color;
  type: PieceType;
};

export type Move = {
  from: number;
  to: number;
  promotion?: Exclude<PieceType, "pawn" | "king">;
  castle?: "king" | "queen";
  enPassant?: boolean;
};

export type GameState = {
  board: Array<Piece | null>;
  turn: Color;
  castling: {
    K: boolean;
    Q: boolean;
    k: boolean;
    q: boolean;
  };
  enPassant: number | null;
  halfmove: number;
  fullmove: number;
};

export type GameStatus =
  | "playing"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw";

type PromotionPiece = Exclude<PieceType, "pawn" | "king">;
type Direction = readonly [number, number];

type SearchStats = {
  nodes: number;
  cutoffs: number;
};

type CandidateEvaluation = {
  move: Move;
  score: number;
};

export type SearchResult = {
  move: Move | null;
  score: number;
  nodes: number;
  cutoffs: number;
  candidates: CandidateEvaluation[];
};

const BOARD_SIZE = 8;
const MATE_SCORE = 1_000_000;

const PIECE_VALUES: Record<PieceType, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20_000,
};

const BISHOP_DIRECTIONS: Direction[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ROOK_DIRECTIONS: Direction[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const KNIGHT_OFFSETS: Direction[] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const PROMOTION_PIECES: PromotionPiece[] = [
  "queen",
  "rook",
  "bishop",
  "knight",
];

export const pieceGlyph: Record<Color, Record<PieceType, string>> = {
  white: {
    king: "♚︎",
    queen: "♛︎",
    rook: "♜︎",
    bishop: "♝︎",
    knight: "♞︎",
    pawn: "♟︎",
  },
  black: {
    king: "♚︎",
    queen: "♛︎",
    rook: "♜︎",
    bishop: "♝︎",
    knight: "♞︎",
    pawn: "♟︎",
  },
};

export function initialState(): GameState {
  const board: Array<Piece | null> = Array(64).fill(null);
  const backRank: PieceType[] = [
    "rook",
    "knight",
    "bishop",
    "queen",
    "king",
    "bishop",
    "knight",
    "rook",
  ];

  backRank.forEach((type, file) => {
    board[file] = { color: "black", type };
    board[8 + file] = { color: "black", type: "pawn" };
    board[48 + file] = { color: "white", type: "pawn" };
    board[56 + file] = { color: "white", type };
  });

  return {
    board,
    turn: "white",
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

function opposite(color: Color): Color {
  return color === "white" ? "black" : "white";
}

function rowOf(square: number): number {
  return Math.floor(square / BOARD_SIZE);
}

function colOf(square: number): number {
  return square % BOARD_SIZE;
}

function isOnBoard(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function squareAt(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

export function squareName(square: number): string {
  return `${"abcdefgh"[colOf(square)]}${BOARD_SIZE - rowOf(square)}`;
}

function isSquareAttacked(
  state: GameState,
  square: number,
  attacker: Color,
): boolean {
  const { board } = state;
  const row = rowOf(square);
  const col = colOf(square);
  const pawnSourceRow = row + (attacker === "white" ? 1 : -1);

  for (const colOffset of [-1, 1]) {
    const pawnSourceCol = col + colOffset;

    if (!isOnBoard(pawnSourceRow, pawnSourceCol)) {
      continue;
    }

    const piece = board[squareAt(pawnSourceRow, pawnSourceCol)];
    if (piece?.color === attacker && piece.type === "pawn") {
      return true;
    }
  }

  for (const [rowOffset, colOffset] of KNIGHT_OFFSETS) {
    const sourceRow = row + rowOffset;
    const sourceCol = col + colOffset;

    if (!isOnBoard(sourceRow, sourceCol)) {
      continue;
    }

    const piece = board[squareAt(sourceRow, sourceCol)];
    if (piece?.color === attacker && piece.type === "knight") {
      return true;
    }
  }

  const slidingDirections = [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS];

  for (const [rowStep, colStep] of slidingDirections) {
    let sourceRow = row + rowStep;
    let sourceCol = col + colStep;

    while (isOnBoard(sourceRow, sourceCol)) {
      const piece = board[squareAt(sourceRow, sourceCol)];

      if (piece) {
        const isDiagonal = rowStep !== 0 && colStep !== 0;
        const matchingSlider = isDiagonal
          ? piece.type === "bishop"
          : piece.type === "rook";

        if (
          piece.color === attacker &&
          (piece.type === "queen" || matchingSlider)
        ) {
          return true;
        }

        break;
      }

      sourceRow += rowStep;
      sourceCol += colStep;
    }
  }

  for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
    for (let colOffset = -1; colOffset <= 1; colOffset++) {
      if (rowOffset === 0 && colOffset === 0) {
        continue;
      }

      const sourceRow = row + rowOffset;
      const sourceCol = col + colOffset;

      if (!isOnBoard(sourceRow, sourceCol)) {
        continue;
      }

      const piece = board[squareAt(sourceRow, sourceCol)];
      if (piece?.color === attacker && piece.type === "king") {
        return true;
      }
    }
  }

  return false;
}

export function isInCheck(state: GameState, color: Color): boolean {
  const kingSquare = state.board.findIndex(
    (piece) => piece?.color === color && piece.type === "king",
  );

  return (
    kingSquare >= 0 &&
    isSquareAttacked(state, kingSquare, opposite(color))
  );
}

function addPawnMove(
  moves: Move[],
  from: number,
  to: number,
  promotionRow: number,
  extras: Partial<Move> = {},
): void {
  if (rowOf(to) === promotionRow) {
    for (const promotion of PROMOTION_PIECES) {
      moves.push({ from, to, promotion, ...extras });
    }
    return;
  }

  moves.push({ from, to, ...extras });
}

function addPawnMoves(state: GameState, from: number, moves: Move[]): void {
  const { board, turn } = state;
  const row = rowOf(from);
  const col = colOf(from);
  const rowStep = turn === "white" ? -1 : 1;
  const startingRow = turn === "white" ? 6 : 1;
  const promotionRow = turn === "white" ? 0 : 7;
  const oneStepSquare = squareAt(row + rowStep, col);

  if (isOnBoard(row + rowStep, col) && !board[oneStepSquare]) {
    addPawnMove(moves, from, oneStepSquare, promotionRow);

    const twoStepSquare = squareAt(row + rowStep * 2, col);
    if (row === startingRow && !board[twoStepSquare]) {
      moves.push({ from, to: twoStepSquare });
    }
  }

  for (const colOffset of [-1, 1]) {
    const targetRow = row + rowStep;
    const targetCol = col + colOffset;

    if (!isOnBoard(targetRow, targetCol)) {
      continue;
    }

    const to = squareAt(targetRow, targetCol);

    if (board[to]?.color === opposite(turn)) {
      addPawnMove(moves, from, to, promotionRow);
    } else if (state.enPassant === to) {
      addPawnMove(moves, from, to, promotionRow, { enPassant: true });
    }
  }
}

function addKnightMoves(
  state: GameState,
  from: number,
  moves: Move[],
): void {
  const row = rowOf(from);
  const col = colOf(from);

  for (const [rowOffset, colOffset] of KNIGHT_OFFSETS) {
    const targetRow = row + rowOffset;
    const targetCol = col + colOffset;

    if (!isOnBoard(targetRow, targetCol)) {
      continue;
    }

    const to = squareAt(targetRow, targetCol);
    if (state.board[to]?.color !== state.turn) {
      moves.push({ from, to });
    }
  }
}

function addSlidingMoves(
  state: GameState,
  from: number,
  directions: Direction[],
  moves: Move[],
): void {
  const row = rowOf(from);
  const col = colOf(from);

  for (const [rowStep, colStep] of directions) {
    let targetRow = row + rowStep;
    let targetCol = col + colStep;

    while (isOnBoard(targetRow, targetCol)) {
      const to = squareAt(targetRow, targetCol);
      const targetPiece = state.board[to];

      if (!targetPiece) {
        moves.push({ from, to });
      } else {
        if (targetPiece.color !== state.turn) {
          moves.push({ from, to });
        }
        break;
      }

      targetRow += rowStep;
      targetCol += colStep;
    }
  }
}

function addKingStepMoves(
  state: GameState,
  from: number,
  moves: Move[],
): void {
  const row = rowOf(from);
  const col = colOf(from);

  for (let rowOffset = -1; rowOffset <= 1; rowOffset++) {
    for (let colOffset = -1; colOffset <= 1; colOffset++) {
      if (rowOffset === 0 && colOffset === 0) {
        continue;
      }

      const targetRow = row + rowOffset;
      const targetCol = col + colOffset;

      if (!isOnBoard(targetRow, targetCol)) {
        continue;
      }

      const to = squareAt(targetRow, targetCol);
      if (state.board[to]?.color !== state.turn) {
        moves.push({ from, to });
      }
    }
  }
}

function addCastlingMoves(
  state: GameState,
  from: number,
  moves: Move[],
): void {
  const { board, castling, turn } = state;
  const enemy = opposite(turn);

  if (turn === "white" && from === 60 && !isSquareAttacked(state, 60, enemy)) {
    const canCastleKingSide =
      castling.K &&
      board[63]?.type === "rook" &&
      board[63]?.color === turn &&
      !board[61] &&
      !board[62] &&
      !isSquareAttacked(state, 61, enemy) &&
      !isSquareAttacked(state, 62, enemy);

    if (canCastleKingSide) {
      moves.push({ from, to: 62, castle: "king" });
    }

    const canCastleQueenSide =
      castling.Q &&
      board[56]?.type === "rook" &&
      board[56]?.color === turn &&
      !board[59] &&
      !board[58] &&
      !board[57] &&
      !isSquareAttacked(state, 59, enemy) &&
      !isSquareAttacked(state, 58, enemy);

    if (canCastleQueenSide) {
      moves.push({ from, to: 58, castle: "queen" });
    }
  }

  if (turn === "black" && from === 4 && !isSquareAttacked(state, 4, enemy)) {
    const canCastleKingSide =
      castling.k &&
      board[7]?.type === "rook" &&
      board[7]?.color === turn &&
      !board[5] &&
      !board[6] &&
      !isSquareAttacked(state, 5, enemy) &&
      !isSquareAttacked(state, 6, enemy);

    if (canCastleKingSide) {
      moves.push({ from, to: 6, castle: "king" });
    }

    const canCastleQueenSide =
      castling.q &&
      board[0]?.type === "rook" &&
      board[0]?.color === turn &&
      !board[3] &&
      !board[2] &&
      !board[1] &&
      !isSquareAttacked(state, 3, enemy) &&
      !isSquareAttacked(state, 2, enemy);

    if (canCastleQueenSide) {
      moves.push({ from, to: 2, castle: "queen" });
    }
  }
}

function pseudoLegalMoves(state: GameState): Move[] {
  const moves: Move[] = [];

  state.board.forEach((piece, from) => {
    if (!piece || piece.color !== state.turn) {
      return;
    }

    switch (piece.type) {
      case "pawn":
        addPawnMoves(state, from, moves);
        break;
      case "knight":
        addKnightMoves(state, from, moves);
        break;
      case "bishop":
        addSlidingMoves(state, from, BISHOP_DIRECTIONS, moves);
        break;
      case "rook":
        addSlidingMoves(state, from, ROOK_DIRECTIONS, moves);
        break;
      case "queen":
        addSlidingMoves(
          state,
          from,
          [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS],
          moves,
        );
        break;
      case "king":
        addKingStepMoves(state, from, moves);
        addCastlingMoves(state, from, moves);
        break;
    }
  });

  return moves;
}

export function applyMove(state: GameState, move: Move): GameState {
  const board = state.board.slice();
  const piece = board[move.from];

  if (!piece) {
    return state;
  }

  const capturedPiece = board[move.to];

  board[move.to] = move.promotion
    ? { color: piece.color, type: move.promotion }
    : piece;
  board[move.from] = null;

  if (move.enPassant) {
    const capturedPawnSquare = move.to + (piece.color === "white" ? 8 : -8);
    board[capturedPawnSquare] = null;
  }

  if (move.castle) {
    const rookFrom =
      piece.color === "white"
        ? move.castle === "king"
          ? 63
          : 56
        : move.castle === "king"
          ? 7
          : 0;
    const rookTo = move.castle === "king" ? move.to - 1 : move.to + 1;

    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }

  const castling = { ...state.castling };

  if (piece.type === "king") {
    if (piece.color === "white") {
      castling.K = false;
      castling.Q = false;
    } else {
      castling.k = false;
      castling.q = false;
    }
  }

  if (move.from === 63 || move.to === 63) castling.K = false;
  if (move.from === 56 || move.to === 56) castling.Q = false;
  if (move.from === 7 || move.to === 7) castling.k = false;
  if (move.from === 0 || move.to === 0) castling.q = false;

  const wasDoublePawnMove =
    piece.type === "pawn" && Math.abs(move.to - move.from) === 16;
  const resetHalfmoveClock =
    piece.type === "pawn" || Boolean(capturedPiece) || Boolean(move.enPassant);

  return {
    board,
    turn: opposite(state.turn),
    castling,
    enPassant: wasDoublePawnMove ? (move.from + move.to) / 2 : null,
    halfmove: resetHalfmoveClock ? 0 : state.halfmove + 1,
    fullmove: state.fullmove + (state.turn === "black" ? 1 : 0),
  };
}

export function legalMoves(state: GameState): Move[] {
  const movingColor = state.turn;

  return pseudoLegalMoves(state).filter(
    (move) => !isInCheck(applyMove(state, move), movingColor),
  );
}

function hasInsufficientMaterial(state: GameState): boolean {
  const pieces = state.board.filter((piece): piece is Piece => Boolean(piece));
  const hasMajorPieceOrPawn = pieces.some((piece) =>
    ["pawn", "rook", "queen"].includes(piece.type),
  );
  const minorPieces = pieces.filter((piece) => piece.type !== "king");

  return !hasMajorPieceOrPawn && minorPieces.length <= 1;
}

export function gameStatus(state: GameState): GameStatus {
  if (state.halfmove >= 100 || hasInsufficientMaterial(state)) {
    return "draw";
  }

  const moves = legalMoves(state);

  if (moves.length > 0) {
    return isInCheck(state, state.turn) ? "check" : "playing";
  }

  return isInCheck(state, state.turn) ? "checkmate" : "stalemate";
}

export function moveLabel(state: GameState, move: Move): string {
  if (move.castle) {
    return move.castle === "king" ? "O-O" : "O-O-O";
  }

  const piece = state.board[move.from];
  const isCapture = Boolean(state.board[move.to] || move.enPassant);

  let prefix = "";
  if (piece?.type === "pawn") {
    prefix = isCapture ? squareName(move.from)[0] : "";
  } else if (piece?.type === "knight") {
    prefix = "N";
  } else {
    prefix = piece?.type[0].toUpperCase() ?? "";
  }

  const nextState = applyMove(state, move);
  let suffix = "";

  if (gameStatus(nextState) === "checkmate") {
    suffix = "#";
  } else if (isInCheck(nextState, nextState.turn)) {
    suffix = "+";
  }

  const promotion = move.promotion
    ? `=${move.promotion[0].toUpperCase()}`
    : "";

  return `${prefix}${isCapture ? "x" : ""}${squareName(move.to)}${promotion}${suffix}`;
}

function positionalBonus(piece: Piece, square: number): number {
  const row = piece.color === "white" ? rowOf(square) : 7 - rowOf(square);
  const col = colOf(square);
  const centerDistance = Math.abs(3.5 - col) + Math.abs(3.5 - row);
  const centralization = 7 - centerDistance;

  let bonus =
    centralization *
    (piece.type === "knight" ? 8 : piece.type === "bishop" ? 4 : 2);

  if (piece.type === "pawn") {
    bonus += (6 - row) * 8;
  }

  return bonus;
}

function evaluate(state: GameState): number {
  let score = 0;

  state.board.forEach((piece, square) => {
    if (!piece) {
      return;
    }

    const colorSign = piece.color === "white" ? 1 : -1;
    score += colorSign * (PIECE_VALUES[piece.type] + positionalBonus(piece, square));
  });

  return score * (state.turn === "white" ? 1 : -1);
}

function moveOrderingScore(state: GameState, move: Move): number {
  const movingPiece = state.board[move.from];
  const capturedPiece = state.board[move.to];

  const captureScore = capturedPiece
    ? PIECE_VALUES[capturedPiece.type] * 10 - PIECE_VALUES[movingPiece!.type]
    : 0;
  const promotionScore = move.promotion ? PIECE_VALUES[move.promotion] : 0;

  return captureScore + promotionScore;
}

function orderedMoves(state: GameState, moves: Move[]): Move[] {
  return [...moves].sort(
    (first, second) =>
      moveOrderingScore(state, second) - moveOrderingScore(state, first),
  );
}

function negamax(
  state: GameState,
  depth: number,
  initialAlpha: number,
  beta: number,
  ply: number,
  stats: SearchStats,
): number {
  stats.nodes++;

  const moves = legalMoves(state);

  if (moves.length === 0) {
    return isInCheck(state, state.turn) ? -MATE_SCORE + ply : 0;
  }

  if (state.halfmove >= 100 || hasInsufficientMaterial(state)) {
    return 0;
  }

  if (depth === 0) {
    return evaluate(state);
  }

  let alpha = initialAlpha;
  let bestScore = -Infinity;

  for (const move of orderedMoves(state, moves)) {
    const childScore = negamax(
      applyMove(state, move),
      depth - 1,
      -beta,
      -alpha,
      ply + 1,
      stats,
    );
    const score = -childScore;

    bestScore = Math.max(bestScore, score);
    alpha = Math.max(alpha, score);

    if (alpha >= beta) {
      stats.cutoffs++;
      break;
    }
  }

  return bestScore;
}

export function findBestMove(state: GameState, depth: number): SearchResult {
  const moves = orderedMoves(state, legalMoves(state));
  const stats: SearchStats = { nodes: 0, cutoffs: 0 };
  const candidates: CandidateEvaluation[] = [];

  let bestMove: Move | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;

  for (const candidate of moves) {
    const score = -negamax(
      applyMove(state, candidate),
      depth - 1,
      -Infinity,
      -alpha,
      1,
      stats,
    );

    candidates.push({ move: candidate, score });

    if (score > bestScore) {
      bestScore = score;
      bestMove = candidate;
    }

    alpha = Math.max(alpha, score);
  }

  candidates.sort((first, second) => second.score - first.score);

  return {
    move: bestMove,
    score: bestScore,
    nodes: stats.nodes,
    cutoffs: stats.cutoffs,
    candidates,
  };
}
