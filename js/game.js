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
    this.startLevel = 1;
    this.board = null;
    this.next = 1;
    this.revealed = new Set();
    this.found = 0;
    this.mistakes = 0;
    this.levelMistakes = 0;
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
    this.startLevel = Math.max(1, Math.trunc(fromLevel) || 1);
    this.level = this.startLevel - 1;
    this.nextLevel();
    return this.board;
  }

  nextLevel() {
    this.level += 1;
    this.board = createBoard(this.level, this.config, this.rng);
    this.next = 1;
    this.revealed = new Set();
    this.levelMistakes = 0;
    this.phase = 'preview';
    return this.board;
  }

  /**
   * Der Bonus, den die laufende Runde noch einbringt.
   *
   * Frei sind `bonusFreeMistakes` Fehler plus einer je Zahl der Runde – also
   * mehr in den grossen Runden, die mehr zu merken geben. Jeder Fehler darueber hinaus knabbert am Bonus,
   * bis nichts mehr uebrig ist. Das ist der Schutz gegen wildes
   * Durchprobieren: Wer sich durch eine Runde tippt, statt sie sich zu merken,
   * bekommt keine Zeit dafuer – und ohne neue Zeit ist der Durchlauf nach der
   * Startzeit vorbei. Ausdruecklich KEIN Abzug von der Uhr: Sie geht nie
   * rueckwaerts, sie waechst nur langsamer.
   *
   * `count` ist die Zahlenmenge der Runde; ohne Brett (frisch gebaut, noch
   * nicht gestartet) ist die Grenze 0.
   */
  levelBonus(mistakes = this.levelMistakes, count = this.board ? this.board.count : 0) {
    const frei = this.config.bonusFreeMistakes + count * this.config.bonusFreeMistakesPerNumber;
    const over = Math.max(0, mistakes - frei);
    return Math.max(0, this.config.levelBonusMs - this.config.bonusPenaltyMs * over);
  }

  /** Vorschau beenden – ab jetzt wird getippt. */
  hide() {
    if (this.phase !== 'preview') return false;
    this.phase = 'playing';
    return true;
  }

  /**
   * Tipp auf ein Feld.
   * `bonusMs` ist die Zeit, die eine damit abgeschlossene Runde einbringt –
   * die Oberflaeche zeigt genau diesen Wert an, nicht den Wert aus der
   * Konfiguration (siehe `levelBonus`).
   * @returns {{result:'ignored'|'correct'|'wrong', value:number, levelDone:boolean, bonusMs:number}}
   */
  tap(cell, now = 0) {
    const miss = { result: 'ignored', value: 0, levelDone: false, bonusMs: 0 };
    if (this.phase !== 'playing' || this.paused || !this.board) return miss;
    // Zwischen zwei Frames kann die Zeit ablaufen, bevor `checkTime` es merkt.
    // Ein Tipp danach darf nichts mehr bewirken – sonst weckt der Rundenbonus
    // einen bereits beendeten Durchlauf wieder auf.
    if (this.remaining(now) <= 0) return miss;
    if (cell < 0 || cell >= this.board.tiles.length) return miss;
    if (this.revealed.has(cell)) return miss;

    const value = this.board.tiles[cell];

    if (value !== this.next) {
      this.mistakes += 1;
      this.levelMistakes += 1;
      if (this.config.wrongPenaltyMs) this.deadline -= this.config.wrongPenaltyMs;
      return { result: 'wrong', value, levelDone: false, bonusMs: 0 };
    }

    this.revealed.add(cell);
    this.next += 1;
    this.found += 1;

    const levelDone = this.next > this.board.count;
    const bonusMs = levelDone ? this.levelBonus() : 0;
    if (bonusMs) this.deadline += bonusMs;

    return { result: 'correct', value, levelDone, bonusMs };
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

  /**
   * Runden, die in *diesem* Durchlauf komplett geschafft wurden.
   * Beim Direkteinstieg (`fromLevel > 1`) zählen die übersprungenen Runden nicht mit.
   */
  get clearedLevels() {
    const done = this.board && this.next > this.board.count;
    return Math.max(0, this.level - this.startLevel + (done ? 1 : 0));
  }

  summary() {
    return {
      levels: this.clearedLevels,
      found: this.found,
      mistakes: this.mistakes,
    };
  }
}
