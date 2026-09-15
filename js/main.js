import { CONFIG } from './config.js';
import { Game } from './game.js';
import { BoardView } from './board-view.js';
import * as fx from './feedback.js';
import { load, save } from './storage.js';
import {
  MODE, MAX_LOCAL_ENTRIES, loadLocalScores, saveLocalScore, previewRank, sanitizeName, matchOwnEntry,
} from './scores.js';
import { leaderboardConfigured, newSubmissionId, submitScore, fetchTopScores } from './leaderboard.js';

const $ = (id) => document.getElementById(id);

const el = {
  hud: $('hud'),
  levelPill: $('level-pill'),
  clock: $('clock'),
  clockFill: $('clock-fill'),
  flash: $('flash'),
  btnSound: $('btn-sound'),
  btnQuit: $('btn-quit'),
  btnRestart: $('btn-restart'),
  chipSoundIntro: $('chip-sound-intro'),
  chipSoundOver: $('chip-sound-over'),
  bonus: $('bonus'),
  board: $('board'),
  dots: $('dots'),
  action: $('action'),
  sheet: $('sheet'),
  cardIntro: $('card-intro'),
  cardOver: $('card-over'),
  cardPause: $('card-pause'),
  cardScores: $('card-scores'),
  chipScoresIntro: $('chip-scores-intro'),
  chipScoresOver: $('chip-scores-over'),
  tabLocal: $('tab-local'),
  tabGlobal: $('tab-global'),
  scoreList: $('score-list'),
  btnScoresClose: $('btn-scores-close'),
  rankLine: $('rank-line'),
  entry: $('entry'),
  entryName: $('entry-name'),
  entrySubmit: $('entry-submit'),
  entryStatus: $('entry-status'),
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
  // Mit Rundenbonus kann mehr Zeit da sein als am Start – der Balken bleibt dann voll.
  const share = Math.min(1, Math.max(0, left / game.config.totalMs));
  el.clockFill.style.transform = `scaleX(${share})`;
}

/** Gewonnene Sekunden kurz neben der Uhr zeigen. */
function showBonus(ms) {
  el.bonus.textContent = `+${Math.round(ms / 1000)} s`;
  el.bonus.removeAttribute('data-on');
  void el.bonus.offsetWidth; // Animation neu starten
  el.bonus.dataset.on = '1';
}

function flash(kind) {
  el.flash.dataset.on = kind;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.flash.removeAttribute('data-on'), 60);
}

let sheetTimer = 0;

function showSheet(card) {
  clearTimeout(sheetTimer);
  for (const c of [el.cardIntro, el.cardOver, el.cardPause, el.cardScores]) c.hidden = c !== card;
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
  // Nur unsichtbar schalten, nicht ausblenden: Der Knopf haelt seinen Platz,
  // damit das Spielfeld beim Verdecken exakt stehen bleibt.
  el.action.toggleAttribute('data-idle', label === null);
  el.action.disabled = label === null;
  if (label !== null) el.action.textContent = label;
}

/* ----------------------------------------------------------------- Ablauf */

function startRun() {
  flushPending(); // das vorige Ergebnis nicht am Knopfdruck haengen lassen

  // Ein laufender Durchlauf wird ersetzt, nicht verdoppelt: sonst liefen nach
  // einem Neustart zwei Schleifen und ein alter Rundentimer ins neue Spiel.
  cancelAnimationFrame(raf);
  raf = 0;
  view.clearTimers();

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
      if (game.config.levelBonusMs) {
        showBonus(game.config.levelBonusMs);
        paintClock();
      }
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

  // Eingetragen wird nur, was unter normalen Bedingungen gespielt wurde – und
  // nur, wenn ueberhaupt eine Zahl gefunden wurde. Die Kennung entsteht hier,
  // einmal pro Durchlauf: Sie macht Wiederholungsversuche beim Senden
  // ungefaehrlich, weil der Server dieselbe Zeile wiedererkennt.
  pending = !debugRun && stats.found > 0
    ? {
        levels: stats.levels,
        found: stats.found,
        mistakes: stats.mistakes,
        at: Date.now(),
        submissionId: newSubmissionId(),
        saved: false,
        savedRank: -1,
        submittedGlobal: false,
        globalName: '',
      }
    : null;
  globalEntries = null; // mit diesem Lauf ist die zuletzt geholte Liste veraltet
  prepareEntry(stats);
  showSheet(el.cardOver);
}

function quit() {
  flushPending();
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

/* ----------------------------------------------------------- bestenliste */

/**
 * Das Ergebnis des letzten Durchlaufs, solange es noch keinen Namen hat.
 * `null` heisst: nichts einzutragen (Uebungslauf oder keine Zahl gefunden).
 */
let pending = null;
/** Welcher Reiter in der Bestenliste zuletzt offen war. */
let scoreTab = 'local';
/** Zuletzt geholte globale Liste, `null` = noch nicht (oder nicht) geladen. */
let globalEntries = null;
let globalLoading = false;
let submitInFlight = false;
/** Karte, zu der der "Zurueck"-Knopf der Bestenliste fuehrt. */
let scoresReturn = null;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function setEntryStatus(text, tone = '') {
  el.entryStatus.textContent = text;
  if (tone) el.entryStatus.dataset.tone = tone;
  else el.entryStatus.removeAttribute('data-tone');
}

/** Eine Notiz statt einer Liste – "wird geladen", "noch leer", "nicht erreichbar". */
function scoreNote(text) {
  el.scoreList.textContent = '';
  const note = document.createElement('div');
  note.className = 'score-note';
  note.textContent = text;
  el.scoreList.appendChild(note);
}

/**
 * Zeilen in die Liste malen. `highlight` (0-basiert) markiert die eigene.
 *
 * Namen koennen von anderen Leuten aus der globalen Liste kommen und gehen
 * deshalb ausschliesslich ueber `textContent` hinein – nie ueber `innerHTML`.
 */
function renderScoreRows(entries, highlight = -1) {
  if (!entries || entries.length === 0) {
    scoreNote('Noch nichts eingetragen.');
    return;
  }

  el.scoreList.textContent = '';
  entries.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'score-row' + (i === highlight ? ' me' : '');
    row.title = [
      plural(e.levels, 'Runde', 'Runden'),
      plural(e.found, 'Zahl', 'Zahlen'),
      plural(e.mistakes, 'Fehler', 'Fehler'),
      entryDate(e),
    ].filter(Boolean).join(' · ');

    const rank = document.createElement('span');
    rank.className = 'score-rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'score-name';
    name.textContent = e.name || 'Ohne Namen';

    const val = document.createElement('span');
    val.className = 'score-val';
    const found = document.createElement('b');
    found.textContent = String(e.found);
    // "R." statt "Runden": Die Zeile muss samt 20-Zeichen-Namen auf 320 px passen.
    val.append(found, `\u00a0${e.found === 1 ? 'Zahl' : 'Zahlen'} · ${e.levels}\u00a0R.`);

    row.append(rank, name, val);
    el.scoreList.appendChild(row);
  });

  scrollRowIntoView(highlight);
}

/** Datum einer Zeile als Text, oder '' – der Server muss keines mitschicken. */
function entryDate(e) {
  const at = typeof e.date === 'string' ? Date.parse(e.date) : e.at;
  if (!Number.isFinite(at)) return '';
  return new Date(at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Die markierte Zeile in den sichtbaren Bereich holen. Notwendig, weil die
 * Liste bis zu 50 Zeilen hat: Platz 34 waere sonst irgendwo ausserhalb markiert.
 * Bewusst NICHT scrollIntoView() – das wuerde die ganze Karte mitverschieben.
 * Eine Bildfrequenz spaeter, weil die Karte beim Rendern noch `hidden` sein kann
 * und dann jedes Rechteck 0 misst.
 */
function scrollRowIntoView(index) {
  if (index < 0) return;
  const row = el.scoreList.children[index];
  if (!row) return;
  requestAnimationFrame(() => {
    if (row.parentElement !== el.scoreList) return; // inzwischen neu gemalt
    const box = el.scoreList.getBoundingClientRect();
    if (!box.height) return;
    const r = row.getBoundingClientRect();
    el.scoreList.scrollTop += r.top - box.top - (box.height - r.height) / 2;
  });
}

/**
 * Die Liste vom Geraet – mit dem frischen Lauf als Vorschauzeile, solange er
 * noch nicht gespeichert ist. Die Vorschau steht dort, wo der Eintrag auch
 * landen wird (`previewRank`), sonst spraenge die Liste beim Speichern um.
 */
function localList() {
  const list = loadLocalScores();
  if (!pending) return { entries: list, mark: -1 };
  if (pending.saved) return { entries: list, mark: pending.savedRank };

  const rank = previewRank(pending.found, list);
  if (rank >= MAX_LOCAL_ENTRIES) return { entries: list, mark: -1 };
  const preview = {
    name: sanitizeName(el.entryName.value),
    levels: pending.levels,
    found: pending.found,
    mistakes: pending.mistakes,
    date: new Date(pending.at).toISOString(),
  };
  const entries = list.slice();
  entries.splice(rank, 0, preview);
  return { entries: entries.slice(0, MAX_LOCAL_ENTRIES), mark: rank };
}

function renderLocal() {
  const { entries, mark } = localList();
  renderScoreRows(entries, mark);
}

/** Die eigene Zeile in der globalen Liste – ueber die Werte, nicht ueber den Rang. */
function ownGlobalRow(entries) {
  if (!pending || !pending.submittedGlobal) return -1;
  return matchOwnEntry(entries, {
    name: pending.globalName,
    levels: pending.levels,
    found: pending.found,
  });
}

async function renderGlobal() {
  if (globalEntries) {
    renderScoreRows(globalEntries, ownGlobalRow(globalEntries));
    return;
  }
  if (globalLoading) return;

  globalLoading = true;
  scoreNote('Wird geladen …');
  const data = await fetchTopScores(MODE);
  globalLoading = false;
  globalEntries = data;

  if (scoreTab !== 'global') return; // inzwischen zurueckgeschaltet
  if (!data) {
    // Fehlschlagen ist hier ein vorgesehener Zustand, kein Ausnahmefall:
    // ohne Netz (oder vor dem Einrichten des Servers) spielt es sich genauso.
    scoreNote('Die globale Liste ist gerade nicht erreichbar. Auf dem Gerät ist alles gespeichert.');
    return;
  }
  renderScoreRows(data, ownGlobalRow(data));
}

function selectTab(which) {
  scoreTab = which;
  el.tabLocal.setAttribute('aria-selected', String(which === 'local'));
  el.tabGlobal.setAttribute('aria-selected', String(which === 'global'));
  if (which === 'global') renderGlobal();
  else renderLocal();
}

function openScores(from) {
  scoresReturn = from;
  el.tabGlobal.hidden = !leaderboardConfigured();
  if (el.tabGlobal.hidden) scoreTab = 'local';
  selectTab(scoreTab);
  showSheet(el.cardScores);
}

function closeScores() {
  showSheet(scoresReturn ?? el.cardIntro);
}

const scoresOpen = () => !el.sheet.hidden && !el.cardScores.hidden;

/**
 * Den Lauf auf dem Geraet festhalten – genau einmal. Passiert beim Eintragen
 * und spaetestens, wenn die Endkarte verlassen wird: Ein Ergebnis darf nicht
 * daran haengen, ob jemand den Knopf noch gedrueckt hat.
 */
function commitPending(name) {
  if (!pending || pending.saved) return;
  const { rank } = saveLocalScore({
    name: sanitizeName(name),
    levels: pending.levels,
    found: pending.found,
    mistakes: pending.mistakes,
    // Datiert wird der Moment des Spielens, nicht der des Speicherns: Die
    // Endkarte kann Minuten offen stehen, bevor jemand den Knopf drueckt.
    date: new Date(pending.at).toISOString(),
  });
  pending.saved = true;
  pending.savedRank = rank;
}

/** Beim Verlassen der Endkarte: nicht Eingetragenes trotzdem sichern. */
function flushPending() {
  if (pending && !pending.saved) commitPending(prefs.name);
  pending = null;
}

/**
 * Was der Server abgelehnt hat, in Spielersprache – und die Frage, ob ein
 * zweiter Versuch ueberhaupt etwas aendern koennte. Nur ein Rate-Limit geht
 * vorueber; abgelehnte Werte bleiben abgelehnt.
 */
const REJECTIONS = {
  'rate limited': { text: 'Gerade zu viele Einträge. In einer Minute klappt es wieder.', retry: true },
  'bad counters': { text: 'Der Server hält diese Werte für unmöglich.', retry: false },
  'bad mode': { text: 'Diese Wertung kennt der Server nicht.', retry: false },
  'missing submission id': { text: 'Dem Eintrag fehlt seine Kennung.', retry: false },
};

function rejectionCopy(reason) {
  const known = reason && REJECTIONS[String(reason).trim().toLowerCase()];
  if (known) return known;
  return {
    text: reason ? `Der Server hat abgelehnt: „${reason}“.` : 'Der Server hat den Eintrag abgelehnt.',
    retry: false,
  };
}

/** Endkarte: Platzvorschau und Eintragen-Zeile fuer diesen Lauf herrichten. */
function prepareEntry(stats) {
  el.entryName.value = prefs.name || '';
  el.entrySubmit.disabled = false;
  el.entrySubmit.textContent = 'Eintragen';
  setEntryStatus('');

  if (!pending) {
    el.rankLine.hidden = true;
    // Ein Uebungslauf zaehlt nicht – das gehoert dorthin, wo sonst der Knopf
    // waere, nicht in die Fussnoten. Das Feld bleibt benutzbar: Der Name ist
    // fuer den naechsten, echten Lauf schon gemerkt.
    el.entry.hidden = stats.found === 0;
    el.entrySubmit.disabled = true;
    if (stats.found > 0) setEntryStatus('Übungslauf (?zeit / ?runde) – zählt nicht für die Bestenliste.');
    return;
  }

  el.entry.hidden = false;
  el.rankLine.hidden = false;
  const list = loadLocalScores();
  const rank = previewRank(pending.found, list);
  el.rankLine.textContent = rank >= MAX_LOCAL_ENTRIES
    ? `Reicht diesmal nicht in die besten ${MAX_LOCAL_ENTRIES} auf diesem Gerät.`
    : `Platz ${rank + 1} von ${Math.min(list.length + 1, MAX_LOCAL_ENTRIES)} auf diesem Gerät.`;
}

async function onSubmit() {
  // Zweimal senden geht nicht: weder waehrend ein Versuch laeuft noch nachdem
  // einer angekommen ist. Der Server kennt zwar die Kennung des Laufs und legt
  // keine zweite Zeile an – aber gar nicht erst zu senden ist billiger.
  if (!pending || submitInFlight || pending.submittedGlobal) return;

  const typed = sanitizeName(el.entryName.value);
  if (typed && typed !== prefs.name) prefs = save({ name: typed });
  commitPending(typed); // erst aufs Geraet, dann ins Netz
  globalEntries = null; // die globale Liste ist gleich nicht mehr aktuell

  if (!leaderboardConfigured()) {
    el.entrySubmit.disabled = true;
    setEntryStatus('Auf diesem Gerät gespeichert.', 'ok');
    return;
  }

  submitInFlight = true;
  el.entrySubmit.disabled = true;
  setEntryStatus('Wird gesendet …');

  const res = await submitScore(
    {
      name: typed,
      mode: MODE,
      levels: pending.levels,
      found: pending.found,
      mistakes: pending.mistakes,
      submissionId: pending.submissionId,
    },
    { onRetry: (attempt, total) => setEntryStatus(`Kein Durchkommen – Versuch ${attempt} von ${total} …`) },
  );
  submitInFlight = false;

  if (res && Number.isFinite(res.rank)) {
    pending.submittedGlobal = true;
    pending.globalName = typed;
    el.entrySubmit.disabled = true;
    setEntryStatus(`Eingetragen: Platz ${res.rank} von ${res.total}.`, 'ok');
  } else if (res && res.rejected) {
    // Der Server hat geantwortet und Nein gesagt. Das als "nicht erreichbar" zu
    // melden schickt die spielende Person auf die Suche nach einem Netzproblem,
    // das es nicht gibt.
    const { text, retry } = rejectionCopy(res.reason);
    el.entrySubmit.disabled = !retry;
    if (retry) el.entrySubmit.textContent = 'Erneut versuchen';
    setEntryStatus(`${text} Auf diesem Gerät ist der Lauf gespeichert.`, 'err');
  } else {
    // Die automatischen Versuche sind durch. Kein toter Punkt: Der Knopf wird
    // zum Wiederholen – der Lauf liegt ja schon sicher auf dem Geraet.
    el.entrySubmit.disabled = false;
    el.entrySubmit.textContent = 'Erneut versuchen';
    setEntryStatus('Server nicht erreichbar. Auf diesem Gerät ist der Lauf gespeichert.', 'err');
  }
}

/* ------------------------------------------------------------ Bedienung */

el.btnStart.addEventListener('click', startRun);
el.btnAgain.addEventListener('click', startRun);
el.action.addEventListener('click', hideNumbers);
el.btnQuit.addEventListener('click', quit);
el.btnRestart.addEventListener('click', startRun);

el.chipScoresIntro.addEventListener('click', () => openScores(el.cardIntro));
el.chipScoresOver.addEventListener('click', () => openScores(el.cardOver));
el.btnScoresClose.addEventListener('click', closeScores);
el.tabLocal.addEventListener('click', () => selectTab('local'));
el.tabGlobal.addEventListener('click', () => selectTab('global'));
el.entrySubmit.addEventListener('click', onSubmit);
el.entryName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !el.entrySubmit.disabled) onSubmit();
});

el.btnResume.addEventListener('click', () => {
  if (game.resume(now())) {
    hideSheet();
    paintClock();
    if (!raf) loop();
  }
});

/* Der Ton laesst sich an drei Stellen schalten - alle zeigen denselben Zustand. */
const soundControls = [el.btnSound, el.chipSoundIntro, el.chipSoundOver];

for (const control of soundControls) {
  control.addEventListener('click', toggleSound);
}

function toggleSound() {
  prefs = save({ sound: !prefs.sound });
  applySound();
  fx.unlock();
  fx.play('correct'); // beim Ausschalten still - genau das ist die Rueckmeldung
}

function applySound() {
  fx.setEnabled(prefs.sound);
  for (const control of soundControls) {
    control.setAttribute('aria-pressed', String(prefs.sound));
    const label = control.querySelector('.chip__label');
    if (label) label.textContent = prefs.sound ? 'Ton an' : 'Ton aus';
  }
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

  // Wer gerade seinen Namen tippt, startet kein neues Spiel. Die Kuerzel liegen
  // auf blanken Buchstaben, und das "n" in einem Namen wuerde sonst genau den
  // Lauf wegwerfen, der gerade eingetragen werden soll.
  if (event.target instanceof Element && event.target.closest('input, textarea')) return;

  // Die Bestenliste liegt ueber der Start- oder Endkarte. Escape schliesst
  // deshalb zuerst sie und kehrt dorthin zurueck, statt das Spiel zu beenden.
  if (event.key === 'Escape' && scoresOpen()) {
    closeScores();
    return;
  }

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

  // Neues Spiel, ohne das Ende abzuwarten.
  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    startRun();
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
