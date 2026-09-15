import { CONFIG } from './config.js';
import { createBoard } from './level.js';

/** @typedef {'idle'|'preview'|'playing'|'over'} Phase */

/**
 * Regelwerk des Spiels – kennt weder DOM noch Timer.
 * Die Uhr wird von außen mit `now` (ms) gefüttert, das macht Tests trivial
 * und erlaubt Pausieren, ohne dass die Logik davon etwas wissen muss.
 */
export class Game {
  constructor(config = {}, rng = Math.random) {
    this.config = { ...CONFIG, ...config };
    this.rng = rng;
    this.reset();
  }

  reset() {
    /** @type {Phase} */
    this.phase = 'idle';
    this.level = 0;
    this.board = null;
    this.next = 1;
    this.revealed = new Set();
    this.found = 0;
    this.mistakes = 0;
    this.deadline = 0;
    this.frozenMs = null;
  }

  /**
   * Startet einen neuen Durchlauf und legt die erste Runde als Vorschau an.
   * `fromLevel` erlaubt den Direkteinstieg in eine spätere Runde (zum Testen).
   */
  start(now, fromLevel = 1) {
    this.reset();
    this.deadline = now + this.config.totalMs;
    this.level = Math.max(0, fromLevel - 1);
    this.nextLevel();
    return this.board;
  }

  nextLevel() {
    this.level += 1;
    this.board = createBoard(this.level, this.config, this.rng);
    this.next = 1;
    this.revealed = new Set();
    this.phase = 'preview';
    return this.board;
  }

  /** Vorschau beenden – ab jetzt wird getippt. */
  hide() {
    if (this.phase !== 'preview') return false;
    this.phase = 'playing';
    return true;
  }

  /**
   * Tipp auf ein Feld.
   * @returns {{result:'ignored'|'correct'|'wrong', value:number, levelDone:boolean}}
   */
  tap(cell, now = 0) {
    const miss = { result: 'ignored', value: 0, levelDone: false };
    if (this.phase !== 'playing' || !this.board) return miss;
    if (cell < 0 || cell >= this.board.tiles.length) return miss;
    if (this.revealed.has(cell)) return miss;

    const value = this.board.tiles[cell];

    if (value !== this.next) {
      this.mistakes += 1;
      if (this.config.wrongPenaltyMs) this.deadline -= this.config.wrongPenaltyMs;
      return { result: 'wrong', value, levelDone: false };
    }

    this.revealed.add(cell);
    this.next += 1;
    this.found += 1;

    const levelDone = this.next > this.board.count;
    if (levelDone && this.config.levelBonusMs) this.deadline += this.config.levelBonusMs;

    return { result: 'correct', value, levelDone };
  }

  remaining(now) {
    if (this.frozenMs !== null) return this.frozenMs;
    return Math.max(0, this.deadline - now);
  }

  get running() {
    return this.phase === 'preview' || this.phase === 'playing';
  }

  get paused() {
    return this.frozenMs !== null;
  }

  pause(now) {
    if (!this.running || this.paused) return false;
    this.frozenMs = this.remaining(now);
    return true;
  }

  resume(now) {
    if (!this.paused) return false;
    this.deadline = now + this.frozenMs;
    this.frozenMs = null;
    return true;
  }

  /** Zeit prüfen; liefert true, sobald der Durchlauf vorbei ist. */
  checkTime(now) {
    if (!this.running || this.paused) return this.phase === 'over';
    if (this.remaining(now) <= 0) {
      this.phase = 'over';
      return true;
    }
    return false;
  }

  /** Runden, die komplett geschafft wurden. */
  get clearedLevels() {
    const done = this.board && this.next > this.board.count;
    return done ? this.level : this.level - 1;
  }

  summary() {
    return {
      levels: Math.max(0, this.clearedLevels),
      found: this.found,
      mistakes: this.mistakes,
    };
  }
}
