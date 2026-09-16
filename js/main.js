import { CONFIG } from './config.js';
import { Game } from './game.js';
import { BoardView } from './board-view.js';
import * as fx from './feedback.js';
import { load, save } from './storage.js';
import {
  MODE, MAX_LOCAL_ENTRIES, loadLocalScores, saveLocalScore, previewRank, sanitizeName, matchOwnEntry,
} from './scores.js';
import { leaderboardConfigured, newSubmissionId, submitScore, fetchTopScores } from './leaderboard.js';
import {
  t, setLanguage, resolveLanguage, browserLanguages, I18N_LANGUAGES,
} from './i18n.js';

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
  langIntro: $('lang-intro'),
  langOver: $('lang-over'),
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

/* Die Sprache steht fest, bevor irgendetwas gemalt wird: Eine ausdrueckliche
   Wahl gewinnt, sonst entscheidet der Browser, sonst Englisch. Alles Weitere
   laeuft ueber `t()` - siehe js/i18n.js. */
setLanguage(resolveLanguage(prefs.language, browserLanguages()));
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

/** Gewonnene Sekunden kurz neben der Uhr zeigen - auch, wenn es keine waren. */
function showBonus(ms) {
  el.bonus.textContent = t('hud.bonus', { seconds: Math.round(ms / 1000) });
  // Ein geschmaelerter Bonus soll sich nicht wie ein Gewinn anfuehlen.
  el.bonus.toggleAttribute('data-cut', ms < CONFIG.levelBonusMs);
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

/* `innerHTML` ist hier vertretbar, weil der Wert aus dem eigenen Sprachpaket
   kommt und nur <b> enthaelt. Fremder Text - Namen aus der globalen Liste -
   geht ausschliesslich ueber `textContent` hinein. */
function bestLine(target) {
  target.innerHTML = prefs.bestLevels
    ? t('best.line', { levels: prefs.bestLevels, found: prefs.bestFound })
    : t('best.none');
}

/**
 * Der Knopf unter dem Raster. Gemerkt wird der SCHLUESSEL, nicht der fertige
 * Text: Beim Sprachwechsel wird daraus wieder uebersetzt, ohne dass jemand
 * wissen muss, in welchem Zustand das Spiel gerade steckt.
 */
let actionKey = null;

function setAction(key) {
  actionKey = key;
  // Nur unsichtbar schalten, nicht ausblenden: Der Knopf haelt seinen Platz,
  // damit das Spielfeld beim Verdecken exakt stehen bleibt.
  el.action.toggleAttribute('data-idle', key === null);
  el.action.disabled = key === null;
  if (key !== null) el.action.textContent = t(key);
}

function paintLevel() {
  el.levelPill.textContent = t('hud.level', { n: game.level });
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
  paintLevel();
  setAction('action.hide');
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
  paintLevel();
  setAction('action.hide');
}

function onTap(cell) {
  const { result, value, levelDone, bonusMs } = game.tap(cell, now());

  if (result === 'correct') {
    view.reveal(cell, value);
    view.updateDots(game.next);
    flash('ok');
    fx.cue(levelDone ? 'level' : 'correct');
    if (levelDone) {
      view.celebrate();
      // Angezeigt wird, was die Runde WIRKLICH eingebracht hat: Fehler knabbern
      // am Bonus (siehe `levelBonus` in game.js). Auch die 0 wird gezeigt -
      // sonst bliebe die Regel unsichtbar, und die stehengebliebene Uhr saehe
      // nach einem Fehler aus wie ein Aussetzer.
      if (game.config.levelBonusMs) {
        showBonus(bonusMs);
        paintClock();
      }
      view.after('level', CONFIG.levelBreakMs, () => {
        if (game.phase === 'preview' || game.phase === 'playing') nextLevel();
      });
    }
  } else if (result === 'wrong') {
    view.blunder(cell, CONFIG.wrongRevealMs);
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

/**
 * Woraus die Endkarte gemalt ist - als Schluessel und Werte, nicht als fertiger
 * Text. Ein Sprachwechsel malt sie damit neu, statt eine deutsche Ueberschrift
 * ueber spanischen Zahlen stehen zu lassen.
 */
let overTitle = null;
let lastStats = null;

function paintOverTitle() {
  if (!overTitle) return;
  el.overTitle.textContent = t(overTitle.key, overTitle.params);
}

function gameOver() {
  const stats = game.summary();
  endRun();
  fx.cue('over');

  const isRecord = stats.levels > prefs.bestLevels ||
    (stats.levels === prefs.bestLevels && stats.found > prefs.bestFound);

  if (isRecord && !debugRun) {
    prefs = save({ bestLevels: stats.levels, bestFound: stats.found });
    overTitle = { key: 'over.record' };
  } else {
    overTitle = stats.levels
      ? { key: 'over.done', params: { levels: stats.levels } }
      : { key: 'over.none' };
  }
  paintOverTitle();

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
  lastStats = stats;
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

/**
 * Die Statuszeile unter dem Eintragen-Feld. Gemerkt wird der Schluessel samt
 * Werten, damit ein Sprachwechsel sie neu uebersetzen kann.
 *
 * `params` darf eine Funktion sein. Das braucht genau ein Fall: die Absage des
 * Servers, deren Grund selbst uebersetzt ist. Als fertiger String eingebacken
 * stuende nach einem Sprachwechsel ein deutscher Halbsatz in einem spanischen
 * Satz; als Funktion wird er beim Malen neu geholt.
 */
let entryStatus = null;

function setEntryStatus(key, params = null, tone = '') {
  entryStatus = key ? { key, params, tone } : null;
  paintEntryStatus();
}

function paintEntryStatus() {
  const state = entryStatus;
  el.entryStatus.textContent = state
    ? t(state.key, typeof state.params === 'function' ? state.params() : state.params)
    : '';
  if (state && state.tone) el.entryStatus.dataset.tone = state.tone;
  else el.entryStatus.removeAttribute('data-tone');
}

/** Eine Notiz statt einer Liste – "wird geladen", "noch leer", "nicht erreichbar". */
function scoreNote(key) {
  el.scoreList.textContent = '';
  const note = document.createElement('div');
  note.className = 'score-note';
  note.textContent = t(key);
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
    scoreNote('scores.empty');
    return;
  }

  el.scoreList.textContent = '';
  entries.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'score-row' + (i === highlight ? ' me' : '');
    row.title = t('scores.row.title', {
      levels: e.levels,
      found: e.found,
      mistakes: e.mistakes,
      date: entryDate(e),
    });

    const rank = document.createElement('span');
    rank.className = 'score-rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'score-name';
    name.textContent = e.name || t('scores.anon');

    const val = document.createElement('span');
    val.className = 'score-val';
    const found = document.createElement('b');
    found.textContent = String(e.found);
    // Fett bleibt nur die Zahl; alles dahinter kommt aus dem Sprachpaket
    // (`scores.row.value`), samt der Abkuerzung, die die Zeile auf 320 px haelt.
    val.append(found, t('scores.row.value', { found: e.found, levels: e.levels }));

    row.append(rank, name, val);
    el.scoreList.appendChild(row);
  });

  scrollRowIntoView(highlight);
}

/** Datum einer Zeile als Text, oder '' – der Server muss keines mitschicken. */
function entryDate(e) {
  const at = typeof e.date === 'string' ? Date.parse(e.date) : e.at;
  if (!Number.isFinite(at)) return '';
  // Das Format ist Sache der Sprache, nicht der Uebersetzung: Monatsname,
  // Reihenfolge und Trennzeichen kommen aus `Intl` im jeweiligen Paket.
  return t('scores.date', { at });
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
  scoreNote('scores.loading');
  const data = await fetchTopScores(MODE);
  globalLoading = false;
  globalEntries = data;

  if (scoreTab !== 'global') return; // inzwischen zurueckgeschaltet
  if (!data) {
    // Fehlschlagen ist hier ein vorgesehener Zustand, kein Ausnahmefall:
    // ohne Netz (oder vor dem Einrichten des Servers) spielt es sich genauso.
    scoreNote('scores.offline');
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

/**
 * Den Lauf sichern, ohne ihn aus der Hand zu geben. Fuer den Fall, dass die
 * Seite gleich verschwinden koennte (Tab zu, App in den Hintergrund) - dort
 * waere `pending = null` falsch: Kommt die Seite doch zurueck, steht die
 * Endkarte noch da und ihr "Eintragen" muss weiter funktionieren.
 *
 * Genommen wird der gerade getippte Name, nicht der gemerkte: Wer ihn eben
 * eingegeben hat, soll ihn auch in der Liste wiederfinden.
 *
 * Bewusst in Kauf genommen: Wer danach zurueckkommt, den Namen aendert und erst
 * dann "Eintragen" drueckt, steht lokal unter dem alten und global unter dem
 * neuen Namen. Ein gespeicherter Eintrag wird hier nicht noch einmal
 * umgeschrieben - das waere ein Aenderungspfad in den Punktespeicher fuer einen
 * Schoenheitsfehler.
 */
function persistPending() {
  if (pending && !pending.saved) commitPending(sanitizeName(el.entryName.value) || prefs.name);
}

/** Beim Verlassen der Endkarte: nicht Eingetragenes trotzdem sichern. */
function flushPending() {
  persistPending();
  pending = null;
}

/**
 * Was der Server abgelehnt hat, in Spielersprache – und die Frage, ob ein
 * zweiter Versuch ueberhaupt etwas aendern koennte. Nur ein Rate-Limit geht
 * vorueber; abgelehnte Werte bleiben abgelehnt.
 */
const REJECTIONS = {
  'rate limited': { key: 'reject.rateLimited', retry: true },
  'bad counters': { key: 'reject.badCounters', retry: false },
  'bad mode': { key: 'reject.badMode', retry: false },
  'missing submission id': { key: 'reject.missingId', retry: false },
};

/**
 * Der Grund bleibt ein SCHLUESSEL, kein Satz: Uebersetzt wird erst beim Malen,
 * damit ein Sprachwechsel auch die Absage mitnimmt. Die Grundworte des Servers
 * ("rate limited") sind Kennungen, keine Anzeige - sie werden nie uebersetzt,
 * nur nachgeschlagen.
 */
function rejectionCopy(reason) {
  const known = reason && REJECTIONS[String(reason).trim().toLowerCase()];
  if (known) return known;
  return reason
    ? { key: 'reject.other', params: { reason }, retry: false }
    : { key: 'reject.generic', retry: false };
}

/** Endkarte: Platzvorschau und Eintragen-Zeile fuer diesen Lauf herrichten. */
function prepareEntry(stats) {
  el.entryName.value = prefs.name || '';
  el.entrySubmit.disabled = false;
  setSubmitLabel('entry.submit');
  setEntryStatus(null);

  if (!pending) {
    el.rankLine.hidden = true;
    // Ein Uebungslauf zaehlt nicht – das gehoert dorthin, wo sonst der Knopf
    // waere, nicht in die Fussnoten. Das Feld bleibt benutzbar: Der Name ist
    // fuer den naechsten, echten Lauf schon gemerkt.
    el.entry.hidden = stats.found === 0;
    el.entrySubmit.disabled = true;
    if (stats.found > 0) setEntryStatus('entry.status.practice');
    return;
  }

  el.entry.hidden = false;
  el.rankLine.hidden = false;
  paintRankLine();
}

/** Die Platzvorschau - eigene Funktion, damit ein Sprachwechsel sie neu malt. */
function paintRankLine() {
  if (!pending || el.rankLine.hidden) return;
  const list = loadLocalScores();
  const rank = previewRank(pending.found, list);
  el.rankLine.textContent = rank >= MAX_LOCAL_ENTRIES
    ? t('entry.rank.miss', { max: MAX_LOCAL_ENTRIES })
    : t('entry.rank', { rank: rank + 1, total: Math.min(list.length + 1, MAX_LOCAL_ENTRIES) });
}

/**
 * Die Aufschrift des Eintragen-Knopfes. Gemerkt wird der Schluessel, weil
 * `applyTranslations` sonst beim Sprachwechsel ein "Erneut versuchen" wieder in
 * ein "Eintragen" zurueckverwandeln wuerde - der Knopf traegt im Markup ein
 * data-i18n mit genau diesem Standardtext.
 */
let submitKey = 'entry.submit';

function setSubmitLabel(key) {
  submitKey = key;
  el.entrySubmit.textContent = t(key);
}

async function onSubmit() {
  // Zweimal senden geht nicht: weder waehrend ein Versuch laeuft noch nachdem
  // einer angekommen ist. Der Server kennt zwar die Kennung des Laufs und legt
  // keine zweite Zeile an – aber gar nicht erst zu senden ist billiger.
  if (!pending || submitInFlight || pending.submittedGlobal) return;

  // Ab hier zaehlt DIESER Lauf, nicht das, was `pending` spaeter sein wird:
  // Ein Eintrag darf samt Wiederholungen ueber fuenf Sekunden brauchen, und in
  // der Zeit kann "Nochmal spielen" laengst gedrueckt sein. Ohne den Festhalter
  // lief die Antwort danach entweder in ein `null` (Absturz) oder markierte den
  // inzwischen frischen Lauf als eingetragen - unter dem alten Namen.
  const lauf = pending;

  const typed = sanitizeName(el.entryName.value);
  if (typed && typed !== prefs.name) prefs = save({ name: typed });
  commitPending(typed); // erst aufs Geraet, dann ins Netz
  globalEntries = null; // die globale Liste ist gleich nicht mehr aktuell

  if (!leaderboardConfigured()) {
    el.entrySubmit.disabled = true;
    setEntryStatus('entry.status.localOnly', null, 'ok');
    return;
  }

  submitInFlight = true;
  el.entrySubmit.disabled = true;
  setEntryStatus('entry.status.sending');

  const res = await submitScore(
    {
      name: typed,
      mode: MODE,
      levels: lauf.levels,
      found: lauf.found,
      mistakes: lauf.mistakes,
      submissionId: lauf.submissionId,
    },
    {
      onRetry: (attempt, total) => {
        if (pending !== lauf) return; // die Karte zeigt laengst etwas anderes
        setEntryStatus('entry.status.retrying', { attempt, total });
      },
    },
  );
  submitInFlight = false;

  // Inzwischen laeuft ein anderes Spiel: Die Antwort gehoert zu einer Karte,
  // die es nicht mehr gibt. Der Eintrag ist trotzdem angekommen (oder eben
  // nicht) - hier ist nur nichts mehr anzuzeigen. Der Lauf ist lokal
  // gespeichert, und seine Kennung verhindert eine Dublette, falls er je
  // erneut gesendet wird.
  if (pending !== lauf) return;

  if (res && Number.isFinite(res.rank)) {
    pending.submittedGlobal = true;
    pending.globalName = typed;
    el.entrySubmit.disabled = true;
    setEntryStatus('entry.status.done', { rank: res.rank, total: res.total }, 'ok');
  } else if (res && res.rejected) {
    // Der Server hat geantwortet und Nein gesagt. Das als "nicht erreichbar" zu
    // melden schickt die spielende Person auf die Suche nach einem Netzproblem,
    // das es nicht gibt.
    const { key, params, retry } = rejectionCopy(res.reason);
    el.entrySubmit.disabled = !retry;
    if (retry) setSubmitLabel('entry.retry');
    setEntryStatus('entry.status.rejected', () => ({ text: t(key, params) }), 'err');
  } else {
    // Die automatischen Versuche sind durch. Kein toter Punkt: Der Knopf wird
    // zum Wiederholen – der Lauf liegt ja schon sicher auf dem Geraet.
    el.entrySubmit.disabled = false;
    setSubmitLabel('entry.retry');
    setEntryStatus('entry.status.offline', null, 'err');
  }
}

/* ------------------------------------------------------------- Sprache */

/**
 * Alle beschrifteten Stellen im Markup uebersetzen.
 *
 * Drei Haken, mehr braucht die Seite nicht:
 *   `data-i18n`       -> textContent
 *   `data-i18n-attr`  -> "attribut:schluessel|attribut:schluessel"
 *   `data-i18n-html`  -> innerHTML, ausschliesslich fuer eigene Paketwerte
 *                        (die Regeln auf der Startkarte tragen <b>). Fremder
 *                        Text geht nie diesen Weg.
 *
 * Zum Schluss faellt `data-i18n-ready` auf <html>: Erst dann macht CSS die App
 * sichtbar. Vorher stuende dort die englische Grundlage aus index.html.
 */
function applyTranslations(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-html]')) node.innerHTML = t(node.dataset.i18nHtml);
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split('|')) {
      const sep = pair.indexOf(':');
      if (sep < 0) continue;
      node.setAttribute(pair.slice(0, sep).trim(), t(pair.slice(sep + 1).trim()));
    }
  }
  document.documentElement.lang = t('lang.htmlLang');
  document.documentElement.setAttribute('data-i18n-ready', '');
}

/**
 * Die beiden Auswahlfelder fuellen. Die Sprachnamen sind Endonyme und werden
 * NICHT uebersetzt: Wer gerade die falsche Sprache vor sich hat, muss seine
 * eigene trotzdem lesen koennen. Uebersetzt wird nur der erste Eintrag, die
 * automatische Erkennung.
 */
function fillLanguageSelects() {
  for (const select of langSelects) {
    select.textContent = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = t('chip.language.auto');
    select.appendChild(auto);
    for (const { code, name } of I18N_LANGUAGES) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = name;
      select.appendChild(option);
    }
    select.value = prefs.language;
  }
}

/**
 * Die ganze Oberflaeche in der aktuellen Sprache neu malen.
 *
 * Bewusst OHNE Neuladen der Seite - anders als im Queens-Clone, wo eine offene
 * Hinweiskarte und ein laufendes Brett den Neustart wert sind. Hier steht die
 * Sprachwahl nur auf der Start- und der Endkarte: Dann laeuft keine Uhr, und
 * die einzigen verganglichen Anzeigen sind die Endkarte und die Bestenliste,
 * die hier beide neu gemalt werden. Ein Neuladen wuerde stattdessen den noch
 * nicht eingetragenen Lauf kosten.
 *
 * Was `applyTranslations` nicht erwischt, steht darunter: alles, was aus
 * Spielstand zusammengesetzt ist und deshalb keinen festen Text im Markup hat.
 */
function applyLanguage() {
  applyTranslations();
  fillLanguageSelects();
  applySound();                        // "Ton an" / "Ton aus" an drei Stellen
  if (game.level) paintLevel();
  if (actionKey) el.action.textContent = t(actionKey);
  bestLine(el.bestIntro);
  bestLine(el.bestOver);
  paintOverTitle();
  paintRankLine();
  el.entrySubmit.textContent = t(submitKey);
  paintEntryStatus();
  if (scoresOpen()) selectTab(scoreTab); // die Liste traegt Datum und Plural
}

function onLanguageChange(event) {
  const chosen = event.target.value;
  if (chosen === prefs.language) return;
  prefs = save({ language: chosen });
  // '' heisst "wie der Browser" - was dabei herauskommt, entscheidet erst
  // `resolveLanguage`, nicht das Auswahlfeld.
  setLanguage(resolveLanguage(chosen, browserLanguages()));
  applyLanguage();
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

/* Die Sprache steht auf der Start- und auf der Endkarte - beide zeigen
   denselben Zustand, genau wie die drei Ton-Schalter. */
const langSelects = [el.langIntro, el.langOver];

for (const select of langSelects) {
  select.addEventListener('change', onLanguageChange);
}

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
    if (label) label.textContent = t(prefs.sound ? 'chip.sound.on' : 'chip.sound.off');
  }
}

/* Tab im Hintergrund: Uhr anhalten statt den Lauf zu verschenken. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persistPending();
  if (document.hidden && game.running && !game.paused) {
    game.pause(now());
    cancelAnimationFrame(raf);
    raf = 0;
    showSheet(el.cardPause);
  }
});

/*
 * Die Seite verschwindet gleich. Ein fertiger Lauf, der noch auf der Endkarte
 * steht, muss vorher in die Liste - sonst ist er weg, und das Versprechen
 * "gespeichert wird immer" waere keines.
 *
 * `pagehide` statt `beforeunload`: Auf dem Handy wird eine App oft gar nicht
 * "entladen", sondern eingefroren, und dann feuert `beforeunload` nie. Das
 * `visibilitychange` oben faengt genau diesen Fall zusaetzlich ab - doppelt
 * gemoppelt ist hier richtig, weil `commitPending` ohnehin nur einmal wirkt.
 */
window.addEventListener('pagehide', persistPending);

/* Tastatur: Ziffernblock-Layout auf das 3×3-Raster. */
const KEYS = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  // Wer gerade seinen Namen tippt, startet kein neues Spiel. Die Kuerzel liegen
  // auf blanken Buchstaben, und das "n" in einem Namen wuerde sonst genau den
  // Lauf wegwerfen, der gerade eingetragen werden soll. Fuer das Sprachfeld
  // gilt dasselbe: Dort sucht ein Buchstabe einen Eintrag aus, und Escape
  // schliesst die aufgeklappte Liste - beides darf nicht im Spiel landen.
  if (event.target instanceof Element && event.target.closest('input, textarea, select')) return;

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

/* Uebersetzt, fuellt die Sprachwahl, setzt Ton-Aufschrift und Rekordzeile -
   und macht die App damit ueberhaupt erst sichtbar (data-i18n-ready). */
applyLanguage();
showSheet(el.cardIntro);
