"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { applyMove, findBestMove, gameStatus, GameState, initialState, legalMoves, Move, moveLabel, pieceGlyph, squareName } from "@/lib/chess";

type RecordEntry = { state: GameState; move: Move; label: string };
type ChatEntry = { id: string; text: string; detail?: string; pending?: boolean };
const welcomeMessage: ChatEntry = { id: "welcome", text: "Ready when you are.", detail: "I compare legal replies using material, central control, and pawn progress." };
const statusText = { playing: "Your move", check: "Check — find a safe move", checkmate: "Checkmate", stalemate: "Draw by stalemate", draw: "Draw" };

export default function Home() {
  const [game, setGame] = useState(initialState);
  const [history, setHistory] = useState<RecordEntry[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [promotionMoves, setPromotionMoves] = useState<Move[]>([]);
  const [depth, setDepth] = useState(5);
  const [analysis, setAnalysis] = useState("Ready");
  const [chat, setChat] = useState<ChatEntry[]>([welcomeMessage]);
  const status = useMemo(() => gameStatus(game), [game]);
  const thinking = game.turn === "black" && ["playing", "check"].includes(status);
  const possible = useMemo(() => selected === null ? [] : legalMoves(game).filter(move => move.from === selected), [game, selected]);

  const play = (move: Move, state = game) => {
    setHistory(current => [...current, { state, move, label: moveLabel(state, move) }]);
    setGame(applyMove(state, move)); setSelected(null); setPromotionMoves([]);
  };

  useEffect(() => {
    if (game.turn !== "black" || !["playing", "check"].includes(status)) return;
    let searchTimer: number | undefined;
    const messageId = `search-${game.fullmove}-${history.length}`;
    const timer = window.setTimeout(() => {
      setAnalysis("Calculating variations…");
      const lastMove = history.at(-1)?.label ?? "your move";
      setChat(current => [...current.filter(entry => !entry.pending), { id: messageId, text: `Analyzing ${lastMove}…`, detail: `Searching ${depth} plies ahead`, pending: true }]);
      searchTimer = window.setTimeout(() => {
        const started = performance.now(); const result = findBestMove(game, depth); const elapsed = performance.now() - started;
        if (result.move) {
          const choice = moveLabel(game, result.move);
          const evaluation = `${result.score >= 0 ? "+" : ""}${(result.score / 100).toFixed(2)}`;
          const alternatives = result.candidates.slice(1, 4).map(candidate => `${moveLabel(game, candidate.move)} ${candidate.score >= 0 ? "+" : ""}${(candidate.score / 100).toFixed(2)}`).join(" · ");
          setChat(current => current.map(entry => entry.id === messageId ? {
            id: messageId,
            text: `I chose ${choice}. Evaluation ${evaluation} for Black.`,
            detail: `${result.nodes.toLocaleString()} positions · ${result.cutoffs.toLocaleString()} cutoffs · ${(elapsed / 1000).toFixed(2)}s${alternatives ? ` · Next: ${alternatives}` : ""}`,
          } : entry).slice(-5));
          play(result.move, game);
        }
        setAnalysis(`${result.nodes.toLocaleString()} positions · ${(elapsed / 1000).toFixed(2)}s · depth ${depth}`);
      }, 60);
    }, 180);
    return () => { window.clearTimeout(timer); if (searchTimer) window.clearTimeout(searchTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, depth, status]);

  const chooseSquare = (square: number) => {
    if (thinking || game.turn !== "white" || !["playing", "check"].includes(status)) return;
    const candidates = possible.filter(move => move.to === square);
    if (candidates.length > 1) return setPromotionMoves(candidates);
    if (candidates.length === 1) return play(candidates[0]);
    setSelected(game.board[square]?.color === "white" ? square : null);
  };
  const reset = () => { setGame(initialState()); setHistory([]); setSelected(null); setPromotionMoves([]); setAnalysis("Ready"); setChat([welcomeMessage]); };
  const undo = () => {
    if (thinking || !history.length) return; const rewind = history.length >= 2 ? history.length - 2 : 0;
    setGame(history[rewind]?.state ?? initialState()); setHistory(history.slice(0, rewind)); setSelected(null); setAnalysis("Move taken back");
  };
  const message = status === "checkmate" ? `${game.turn === "white" ? "Black" : "White"} wins by checkmate` : statusText[status];

  return <main className={styles.shell}>
    <header className={styles.header}><div><p className={styles.eyebrow}>LOCAL CHESS ENGINE</p><h1>Quiet Gambit</h1></div><span className={styles.live}><i /> No neural net</span></header>
    <section className={styles.gameLayout}>
      <div className={styles.boardWrap}>
        <div className={styles.opponent}><span className={styles.avatar}>QG</span><span><strong>Gambit AI</strong><small>{thinking ? "Thinking…" : "Black"}</small></span><span className={styles.dots}>{thinking ? "•••" : ""}</span></div>
        <div className={styles.board} aria-label="Chess board">
          {game.board.map((piece, square) => {
            const row = Math.floor(square / 8), col = square % 8, target = possible.some(move => move.to === square), last = history.at(-1)?.move;
            return <button key={square} className={`${styles.square} ${(row + col) % 2 ? styles.dark : styles.light} ${selected === square ? styles.selected : ""} ${last && (last.from === square || last.to === square) ? styles.last : ""}`} onClick={() => chooseSquare(square)} aria-label={`${squareName(square)}${piece ? ` ${piece.color} ${piece.type}` : ""}`}>
              {col === 0 && <span className={styles.rank}>{8 - row}</span>}{row === 7 && <span className={styles.file}>{"abcdefgh"[col]}</span>}
              {target && <span className={piece ? styles.capture : styles.target} />}
              {piece && <span className={`${styles.piece} ${piece.color === "white" ? styles.whitePiece : styles.blackPiece}`}>{pieceGlyph[piece.color][piece.type]}</span>}
            </button>;
          })}
        </div>
        <div className={styles.player}><span className={`${styles.avatar} ${styles.you}`}>YOU</span><span><strong>You</strong><small>White</small></span><span className={styles.turnPill}>{game.turn === "white" && !thinking ? "YOUR TURN" : ""}</span></div>
      </div>
      <aside className={styles.panel}>
        <div className={styles.status}><span className={`${styles.statusIcon} ${status === "checkmate" ? styles.danger : ""}`}>♟︎</span><div><small>GAME STATUS</small><strong>{thinking ? "Gambit is thinking" : message}</strong></div></div>
        <div className={styles.control}><label htmlFor="difficulty">Engine strength</label><select id="difficulty" value={depth} onChange={event => setDepth(Number(event.target.value))} disabled={thinking}><option value={4}>Casual · depth 4</option><option value={5}>Sharp · depth 5</option><option value={6}>Deep · depth 6</option></select><p>{analysis}</p></div>
        <div className={styles.chat} aria-live="polite">
          <div className={styles.chatHead}><span>Gambit analysis</span><span>LIVE</span></div>
          <div className={styles.chatFeed}>{chat.map(entry => <div className={`${styles.chatMessage} ${entry.pending ? styles.pending : ""}`} key={entry.id}><span className={styles.chatAvatar}>AI</span><div><strong>{entry.text}</strong>{entry.detail && <p>{entry.detail}</p>}</div></div>)}</div>
        </div>
        <div className={styles.moves}><div className={styles.movesHead}><span>Moves</span><span>{Math.ceil(history.length / 2)} turns</span></div><div className={styles.moveList}>
          {!history.length && <p className={styles.empty}>Your game will appear here.</p>}
          {Array.from({ length: Math.ceil(history.length / 2) }, (_, index) => <div className={styles.moveRow} key={index}><span>{index + 1}.</span><strong>{history[index * 2]?.label}</strong><strong>{history[index * 2 + 1]?.label}</strong></div>)}
        </div></div>
        <div className={styles.actions}><button onClick={undo} disabled={thinking || !history.length}>↶ Take back</button><button className={styles.newGame} onClick={reset}>New game</button></div>
        <p className={styles.engineNote}>Minimax search · alpha-beta pruning · handcrafted evaluation</p>
      </aside>
    </section>
    {promotionMoves.length > 0 && <div className={styles.modalBackdrop}><div className={styles.promotion} role="dialog" aria-modal="true" aria-label="Choose promotion piece"><p>Promote your pawn</p><div>{promotionMoves.map(move => <button key={move.promotion} onClick={() => play(move)} aria-label={`Promote to ${move.promotion}`}>{pieceGlyph.white[move.promotion!]}</button>)}</div></div></div>}
  </main>;
}
