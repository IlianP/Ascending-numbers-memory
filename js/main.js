import { CONFIG } from './config.js';
import { Game } from './game.js';
import { BoardView } from './board-view.js';
import * as fx from './feedback.js';
import { load, save } from './storage.js';

const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'),
  levelPill: $('level-pill'),
  clock: $('clock'),
  clockFill: $('clock-fill'),
  flash: $('flash'),
  btnSound: $('btn-sound'),
  btnQuit: $('btn-quit'),
  board: $('board'),
  dots: $('dots'),
  action: $('action'),
  sheet: $('sheet'),
  cardIntro: $('card-intro'),
  cardOver: $('card-over'),
  cardPause: $('card-pause'),
  btnStart: $('btn-start'),
  btnAgain: $('btn-again'),
  btnResume: $('btn-resume'),
  bestIntro: $('best-intro'),
  bestOver: $('best-over'),
  overTitle: $('over-title'),
  statLevel: $('stat-level'),
  statFound: $('stat-found'),
  statMistakes: $('stat-mistakes'),
};

/**
 * Abkürzungen fürs Ausprobieren: ?runde=15 startet im 4x4-Raster,
 * ?zeit=10 verkürzt den Durchlauf auf 10 Sekunden.
 */
const params = new URLSearchParams(location.search);
const startLevel = Math.max(1, Math.trunc(Number(params.get('runde'))) || 1);
const seconds = Number(params.get('zeit'));
const overrides = seconds > 0 ? { totalMs: seconds * 1000 } : {};
/** Abgekürzte Läufe sind zum Ausprobieren da und zählen nicht für den Rekord. */
const debugRun = startLevel > 1 || seconds > 0;

const game = new Game(overrides);
const view = new BoardView(el.board, el.dots, onTap);
let prefs = load();
let raf = 0;
let flashTimer = 0;

/* --------------------------------------------------------------- Anzeige */

const now = () => performance.now();

function format(ms) {
  const total = Math.ceil(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function paintClock() {
  const left = game.remaining(now());
  el.clock.textContent = format(left);
  el.clock.classList.toggle('clock--low', left <= 10_000);
  el.clockFill.style.transform = `scaleX(${Math.max(0, left / game.config.totalMs)})`;
}

function flash(kind) {
  el.flash.dataset.on = kind;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.flash.removeAttribute('data-on'), 60);
}

let sheetTimer = 0;

function showSheet(card) {
  clearTimeout(sheetTimer);
  for (const c of [el.cardIntro, el.cardOver, el.cardPause]) c.hidden = c !== card;
  el.sheet.hidden = false;
  el.sheet.classList.remove('is-out');
}

function hideSheet() {
  clearTimeout(sheetTimer);
  el.sheet.classList.add('is-out');
  sheetTimer = setTimeout(() => { el.sheet.hidden = true; }, 250);
}

const rounds = (n) => `${n} ${n === 1 ? 'Runde' : 'Runden'}`;

function bestLine(target) {
  target.innerHTML = prefs.bestLevels
    ? `Rekord: <b>${rounds(prefs.bestLevels)}</b> &middot; <b>${prefs.bestFound} Zahlen</b>`
    : 'Noch kein Rekord &ndash; auf geht&rsquo;s.';
}

function setAction(label) {
  el.action.hidden = label === null;
  if (label !== null) el.action.textContent = label;
}

/* ----------------------------------------------------------------- Ablauf */

function startRun() {
  fx.unlock();
  hideSheet();
  el.hud.dataset.on = '1';
  el.hud.setAttribute('aria-hidden', 'false');
  view.render(game.start(now(), startLevel));
  el.levelPill.textContent = `Runde ${game.level}`;
  setAction('Verdecken');
  paintClock();
  loop();
}

function hideNumbers() {
  if (!game.hide()) return;
  view.hideAll();
  setAction(null);
}

function nextLevel() {
  view.render(game.nextLevel());
  el.levelPill.textContent = `Runde ${game.level}`;
  setAction('Verdecken');
}

function onTap(cell) {
  const { result, value, levelDone } = game.tap(cell, now());

  if (result === 'correct') {
    view.reveal(cell, value);
    view.updateDots(game.next);
    flash('ok');
    fx.cue(levelDone ? 'level' : 'correct');
    if (levelDone) {
      view.celebrate();
      view.after('level', CONFIG.levelBreakMs, () => {
        if (game.phase === 'preview' || game.phase === 'playing') nextLevel();
      });
    }
  } else if (result === 'wrong') {
    view.blunder(cell, value, CONFIG.wrongRevealMs);
    flash('no');
    fx.cue('wrong');
    paintClock();
  }
}

function endRun() {
  cancelAnimationFrame(raf);
  raf = 0;
  view.clearTimers();
  view.lock();
  el.hud.dataset.on = '0';
  el.hud.setAttribute('aria-hidden', 'true');
  setAction(null);
}

function gameOver() {
  const stats = game.summary();
  endRun();
  fx.cue('over');

  const isRecord = stats.levels > prefs.bestLevels ||
    (stats.levels === prefs.bestLevels && stats.found > prefs.bestFound);

  if (isRecord && !debugRun) {
    prefs = save({ bestLevels: stats.levels, bestFound: stats.found });
    el.overTitle.textContent = 'Neuer Rekord!';
  } else {
    el.overTitle.textContent = stats.levels
      ? `${rounds(stats.levels)} geschafft`
      : 'Keine Runde geschafft';
  }

  el.statLevel.textContent = stats.levels;
  el.statFound.textContent = stats.found;
  el.statMistakes.textContent = stats.mistakes;
  bestLine(el.bestOver);
  showSheet(el.cardOver);
}

function quit() {
  game.reset();
  endRun();
  bestLine(el.bestIntro);
  showSheet(el.cardIntro);
}

function loop() {
  raf = requestAnimationFrame(loop);
  paintClock();
  if (game.checkTime(now())) gameOver();
}

/* ------------------------------------------------------------ Bedienung */

el.btnStart.addEventListener('click', startRun);
el.btnAgain.addEventListener('click', startRun);
el.action.addEventListener('click', hideNumbers);
el.btnQuit.addEventListener('click', quit);

el.btnResume.addEventListener('click', () => {
  if (game.resume(now())) {
    hideSheet();
    paintClock();
    if (!raf) loop();
  }
});

el.btnSound.addEventListener('click', () => {
  prefs = save({ sound: !prefs.sound });
  applySound();
  fx.unlock();
  fx.play('correct');
});

function applySound() {
  fx.setEnabled(prefs.sound);
  el.btnSound.setAttribute('aria-pressed', String(prefs.sound));
}

/* Tab im Hintergrund: Uhr anhalten statt den Lauf zu verschenken. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.running && !game.paused) {
    game.pause(now());
    cancelAnimationFrame(raf);
    raf = 0;
    showSheet(el.cardPause);
  }
});

/* Tastatur: Ziffernblock-Layout auf das 3×3-Raster. */
const KEYS = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === ' ' || event.key === 'Enter') {
    if (game.phase === 'preview' && el.sheet.hidden) {
      event.preventDefault();
      hideNumbers();
    }
    return;
  }

  if (event.key === 'Escape' && game.running) {
    quit();
    return;
  }

  if (game.phase !== 'playing' || game.paused) return;
  if (game.board?.cols !== 3) return;

  const cell = KEYS[event.key];
  if (cell === undefined) return;
  event.preventDefault();
  onTap(cell);
});

/* ------------------------------------------------------------------ Start */

/* Offline-Betrieb ist ein Bonus: klappt die Registrierung nicht, läuft das Spiel trotzdem. */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

applySound();
bestLine(el.bestIntro);
showSheet(el.cardIntro);
