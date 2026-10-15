export type Color = "white" | "black";
export type PieceType = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
export type Piece = { color: Color; type: PieceType };
export type Move = { from: number; to: number; promotion?: Exclude<PieceType, "pawn" | "king">; castle?: "king" | "queen"; enPassant?: boolean };
export type GameState = { board: Array<Piece | null>; turn: Color; castling: { K: boolean; Q: boolean; k: boolean; q: boolean }; enPassant: number | null; halfmove: number; fullmove: number };
export type GameStatus = "playing" | "check" | "checkmate" | "stalemate" | "draw";

const values: Record<PieceType, number> = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20_000 };
const directions = { bishop: [[-1, -1], [-1, 1], [1, -1], [1, 1]], rook: [[-1, 0], [1, 0], [0, -1], [0, 1]] };
export const pieceGlyph: Record<Color, Record<PieceType, string>> = {
  white: { king: "♚︎", queen: "♛︎", rook: "♜︎", bishop: "♝︎", knight: "♞︎", pawn: "♟︎" },
  black: { king: "♚︎", queen: "♛︎", rook: "♜︎", bishop: "♝︎", knight: "♞︎", pawn: "♟︎" },
};

export function initialState(): GameState {
  const board: Array<Piece | null> = Array(64).fill(null);
  const back: PieceType[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  back.forEach((type, file) => {
    board[file] = { color: "black", type }; board[8 + file] = { color: "black", type: "pawn" };
    board[48 + file] = { color: "white", type: "pawn" }; board[56 + file] = { color: "white", type };
  });
  return { board, turn: "white", castling: { K: true, Q: true, k: true, q: true }, enPassant: null, halfmove: 0, fullmove: 1 };
}

const opposite = (color: Color): Color => color === "white" ? "black" : "white";
const rowOf = (square: number) => Math.floor(square / 8);
const colOf = (square: number) => square % 8;
const inside = (row: number, col: number) => row >= 0 && row < 8 && col >= 0 && col < 8;
const at = (row: number, col: number) => row * 8 + col;
export const squareName = (square: number) => `${"abcdefgh"[colOf(square)]}${8 - rowOf(square)}`;

function attacked(state: GameState, square: number, by: Color): boolean {
  const { board } = state; const row = rowOf(square); const col = colOf(square);
  const pawnRow = row + (by === "white" ? 1 : -1);
  for (const dc of [-1, 1]) if (inside(pawnRow, col + dc)) {
    const piece = board[at(pawnRow, col + dc)]; if (piece?.color === by && piece.type === "pawn") return true;
  }
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) if (inside(row + dr, col + dc)) {
    const piece = board[at(row + dr, col + dc)]; if (piece?.color === by && piece.type === "knight") return true;
  }
  for (const [dr, dc] of [...directions.bishop, ...directions.rook]) {
    let r = row + dr, c = col + dc;
    while (inside(r, c)) { const piece = board[at(r, c)]; if (piece) {
      if (piece.color === by && (piece.type === "queen" || (dr && dc ? piece.type === "bishop" : piece.type === "rook"))) return true; break;
    } r += dr; c += dc; }
  }
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && inside(row + dr, col + dc)) {
    const piece = board[at(row + dr, col + dc)]; if (piece?.color === by && piece.type === "king") return true;
  }
  return false;
}

export function isInCheck(state: GameState, color: Color) {
  const king = state.board.findIndex(piece => piece?.color === color && piece.type === "king");
  return king >= 0 && attacked(state, king, opposite(color));
}

function pawnMove(moves: Move[], from: number, to: number, promotionRow: number, extras: Partial<Move> = {}) {
  if (rowOf(to) === promotionRow) (["queen", "rook", "bishop", "knight"] as const).forEach(promotion => moves.push({ from, to, promotion, ...extras }));
  else moves.push({ from, to, ...extras });
}

function pseudoMoves(state: GameState) {
  const moves: Move[] = []; const { board, turn } = state;
  board.forEach((piece, from) => {
    if (!piece || piece.color !== turn) return; const row = rowOf(from), col = colOf(from);
    if (piece.type === "pawn") {
      const dr = turn === "white" ? -1 : 1, start = turn === "white" ? 6 : 1, promotion = turn === "white" ? 0 : 7;
      const one = at(row + dr, col);
      if (inside(row + dr, col) && !board[one]) { pawnMove(moves, from, one, promotion); const two = at(row + dr * 2, col); if (row === start && !board[two]) moves.push({ from, to: two }); }
      for (const dc of [-1, 1]) if (inside(row + dr, col + dc)) { const to = at(row + dr, col + dc); if (board[to]?.color === opposite(turn)) pawnMove(moves, from, to, promotion); else if (state.enPassant === to) pawnMove(moves, from, to, promotion, { enPassant: true }); }
      return;
    }
    if (piece.type === "knight") {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) if (inside(row + dr, col + dc)) { const to = at(row + dr, col + dc); if (board[to]?.color !== turn) moves.push({ from, to }); } return;
    }
    if (piece.type === "bishop" || piece.type === "rook" || piece.type === "queen") {
      const dirs = piece.type === "queen" ? [...directions.bishop, ...directions.rook] : directions[piece.type];
      for (const [dr, dc] of dirs) { let r = row + dr, c = col + dc; while (inside(r, c)) { const to = at(r, c); if (!board[to]) moves.push({ from, to }); else { if (board[to]?.color !== turn) moves.push({ from, to }); break; } r += dr; c += dc; } } return;
    }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && inside(row + dr, col + dc)) { const to = at(row + dr, col + dc); if (board[to]?.color !== turn) moves.push({ from, to }); }
    const enemy = opposite(turn);
    if (turn === "white" && from === 60 && !attacked(state, 60, enemy)) {
      if (state.castling.K && board[63]?.type === "rook" && board[63]?.color === turn && !board[61] && !board[62] && !attacked(state,61,enemy) && !attacked(state,62,enemy)) moves.push({ from, to: 62, castle: "king" });
      if (state.castling.Q && board[56]?.type === "rook" && board[56]?.color === turn && !board[59] && !board[58] && !board[57] && !attacked(state,59,enemy) && !attacked(state,58,enemy)) moves.push({ from, to: 58, castle: "queen" });
    }
    if (turn === "black" && from === 4 && !attacked(state, 4, enemy)) {
      if (state.castling.k && board[7]?.type === "rook" && board[7]?.color === turn && !board[5] && !board[6] && !attacked(state,5,enemy) && !attacked(state,6,enemy)) moves.push({ from, to: 6, castle: "king" });
      if (state.castling.q && board[0]?.type === "rook" && board[0]?.color === turn && !board[3] && !board[2] && !board[1] && !attacked(state,3,enemy) && !attacked(state,2,enemy)) moves.push({ from, to: 2, castle: "queen" });
    }
  }); return moves;
}

export function applyMove(state: GameState, move: Move): GameState {
  const board = state.board.slice(), piece = board[move.from]; if (!piece) return state; const captured = board[move.to];
  board[move.to] = move.promotion ? { color: piece.color, type: move.promotion } : piece; board[move.from] = null;
  if (move.enPassant) board[move.to + (piece.color === "white" ? 8 : -8)] = null;
  if (move.castle) { const rookFrom = piece.color === "white" ? (move.castle === "king" ? 63 : 56) : (move.castle === "king" ? 7 : 0); const rookTo = move.castle === "king" ? move.to - 1 : move.to + 1; board[rookTo] = board[rookFrom]; board[rookFrom] = null; }
  const castling = { ...state.castling };
  if (piece.type === "king") { if (piece.color === "white") { castling.K = false; castling.Q = false; } else { castling.k = false; castling.q = false; } }
  if (move.from === 63 || move.to === 63) castling.K = false; if (move.from === 56 || move.to === 56) castling.Q = false;
  if (move.from === 7 || move.to === 7) castling.k = false; if (move.from === 0 || move.to === 0) castling.q = false;
  return { board, turn: opposite(state.turn), castling, enPassant: piece.type === "pawn" && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : null, halfmove: piece.type === "pawn" || captured || move.enPassant ? 0 : state.halfmove + 1, fullmove: state.fullmove + (state.turn === "black" ? 1 : 0) };
}

export function legalMoves(state: GameState) { const mover = state.turn; return pseudoMoves(state).filter(move => !isInCheck(applyMove(state, move), mover)); }
function insufficient(state: GameState) { const pieces = state.board.filter((piece): piece is Piece => Boolean(piece)); return !pieces.some(piece => ["pawn","rook","queen"].includes(piece.type)) && pieces.filter(piece => piece.type !== "king").length <= 1; }
export function gameStatus(state: GameState): GameStatus { if (state.halfmove >= 100 || insufficient(state)) return "draw"; const moves = legalMoves(state); if (moves.length) return isInCheck(state,state.turn) ? "check" : "playing"; return isInCheck(state,state.turn) ? "checkmate" : "stalemate"; }
export function moveLabel(state: GameState, move: Move) {
  if (move.castle) return move.castle === "king" ? "O-O" : "O-O-O"; const piece = state.board[move.from], capture = Boolean(state.board[move.to] || move.enPassant);
  const prefix = piece?.type === "pawn" ? (capture ? squareName(move.from)[0] : "") : piece?.type === "knight" ? "N" : piece?.type[0].toUpperCase(); const next = applyMove(state,move); const suffix = gameStatus(next) === "checkmate" ? "#" : isInCheck(next,next.turn) ? "+" : "";
  return `${prefix}${capture ? "x" : ""}${squareName(move.to)}${move.promotion ? `=${move.promotion[0].toUpperCase()}` : ""}${suffix}`;
}

function evaluate(state: GameState) {
  let score = 0; state.board.forEach((piece,square) => { if (!piece) return; const row = piece.color === "white" ? rowOf(square) : 7-rowOf(square), col = colOf(square), center = 7-Math.abs(3.5-col)-Math.abs(3.5-row); let bonus = center * (piece.type === "knight" ? 8 : piece.type === "bishop" ? 4 : 2); if (piece.type === "pawn") bonus += (6-row)*8; score += (piece.color === "white" ? 1 : -1) * (values[piece.type]+bonus); }); return score * (state.turn === "white" ? 1 : -1);
}
function ordered(state: GameState,moves: Move[]) { return [...moves].sort((a,b) => { const score = (m: Move) => (state.board[m.to] ? values[state.board[m.to]!.type]*10-values[state.board[m.from]!.type] : 0)+(m.promotion ? values[m.promotion] : 0); return score(b)-score(a); }); }
const MATE = 1_000_000;
function negamax(state: GameState,depth: number,alpha: number,beta: number,ply: number,stats:{nodes:number;cutoffs:number}): number {
  stats.nodes++; const moves = legalMoves(state); if (!moves.length) return isInCheck(state,state.turn) ? -MATE+ply : 0; if (state.halfmove >= 100 || insufficient(state)) return 0; if (!depth) return evaluate(state);
  let best = -Infinity; for (const move of ordered(state,moves)) { const score = -negamax(applyMove(state,move),depth-1,-beta,-alpha,ply+1,stats); best = Math.max(best,score); alpha = Math.max(alpha,score); if (alpha >= beta) { stats.cutoffs++; break; } } return best;
}
export function findBestMove(state: GameState,depth: number) {
  const moves = ordered(state,legalMoves(state)), stats = { nodes: 0, cutoffs: 0 }; let move: Move|null = null, score = -Infinity, alpha = -Infinity;
  const candidates: Array<{move: Move; score: number}> = [];
  for (const candidate of moves) { const value = -negamax(applyMove(state,candidate),depth-1,-Infinity,-alpha,1,stats); candidates.push({ move: candidate, score: value }); if (value > score) { score = value; move = candidate; } alpha = Math.max(alpha,value); }
  candidates.sort((a,b) => b.score-a.score);
  return { move, score, nodes: stats.nodes, cutoffs: stats.cutoffs, candidates };
}
