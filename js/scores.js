/**
 * Bewertung eines Durchlaufs und die Bestenliste auf dem Gerät.
 * Reine Logik: kein DOM, kein Netz – damit `node --test` sie ohne Browser prüfen kann.
 *
 * ## Was wird verglichen?
 *
 * Gefundene Zahlen, nicht geschaffte Runden. Das sieht nach der kleineren Zahl
 * aus, ist aber die feinere *und* die verträgliche: Wer mehr Runden schafft, hat
 * zwangsläufig mehr Zahlen gefunden. Eine Runde ist erst geschafft, wenn alle
 * ihre Zahlen sitzen, und die Rundengrößen wachsen monoton – wer L Runden
 * schafft, hat also mindestens die Summe der ersten L Runden gefunden, und wer
 * nur L-1 Runden schafft, kommt selbst mit einer fast fertigen Runde L nicht
 * heran. `found` ordnet damit genau wie `levels`, unterscheidet aber zusätzlich
 * die beiden, die bei „7 Runden" gleichauf wären: einer stand mitten in Runde 8,
 * der andere hatte gerade erst verdeckt.
 *
 * Fehler zählen mit, kosten aber keinen Platz – weder als Abzug noch als
 * Stichentscheid. Ein Fehltipp ist auf dem Handy eine Daumenbreite weit weg und
 * kostet ohnehin die Zeit, die er braucht; ihn zusätzlich zu verrechnen würde
 * die Eingabe bestrafen statt das Gedächtnis. Er steht in der Zeile, weil er
 * etwas über den Lauf erzählt, nicht weil er ihn bewertet.
 *
 * ## Gleichstand überholt nicht
 *
 * Wer dieselbe Zahl noch einmal erreicht, steht HINTER dem älteren Eintrag.
 * Diese Regel gilt an drei Stellen und muss überall dieselbe sein, sonst
 * markiert die Oberfläche die falsche Zeile: `sortEntries` (stabil, der neue
 * Eintrag wird hinten angehängt), `previewRank` (zählt Gleichstand als davor)
 * und serverseitig `ascending_top_scores` (`found desc, created_at asc, id asc`).
 */

/**
 * Wertungsklasse. Zurzeit gibt es nur eine; der Wert wandert trotzdem in jede
 * Zeile und in jeden Serveraufruf, damit ein späterer „harter Modus"
 * (Zeitstrafe für Fehltipps, andere Startzeit) seine eigene Liste bekommt,
 * ohne dass Bestandsdaten angefasst werden müssen.
 */
export const MODE = 'standard';

/** So viele Einträge hält die Liste auf dem Gerät. Die Liste scrollt, also kostet das kein Layout. */
export const MAX_LOCAL_ENTRIES = 50;
export const MAX_NAME_LENGTH = 20;

const KEY = 'ascending-numbers/scores/v1';

/**
 * Notfall-Liste im Arbeitsspeicher. Sie wird gesetzt, sobald ein Schreibversuch
 * scheitert (Privatmodus, voller Speicher), und ab dann bevorzugt gelesen.
 *
 * Ohne sie war das Versprechen "dann haelt die Liste eben nur diese Sitzung"
 * schlicht falsch: Der Eintrag wurde gemeldet und beim naechsten Lesen war er
 * weg - die Oberflaeche sagte "gespeichert" und markierte eine fremde Zeile.
 * Entweder die Liste haelt die Sitzung, oder man muesste es ehrlich anders
 * sagen; das hier ist die freundlichere Haelfte.
 */
let sessionList = null;

/** Whitespace zusammenfassen, kürzen. Leer bleibt leer – siehe `renderScores` in main.js. */
export function sanitizeName(name) {
  return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

/** Bester zuerst. Stabil sortiert, damit Gleichstand die ältere Zeile vorn lässt. */
function byFound(a, b) {
  return b.found - a.found;
}

/** Eine gespeicherte oder frisch gebaute Zeile säubern – oder `null`, wenn unbrauchbar. */
function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const found = Math.floor(Number(e.found));
  if (!Number.isFinite(found) || found < 0) return null;
  const count = (value) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    name: sanitizeName(e.name),
    levels: count(e.levels),
    found,
    mistakes: count(e.mistakes),
    date: typeof e.date === 'string' ? e.date : new Date().toISOString(),
  };
}

/** Die ganze Liste lesen, Kaputtes still verwerfen. Wirft nie (Privatmodus!). */
export function loadLocalScores() {
  // Hat das Speichern einmal nicht geklappt, ist der Arbeitsspeicher die
  // Wahrheit - im `localStorage` steht dann ein aelterer Stand.
  if (sessionList) return sessionList.slice();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map(normalizeEntry).filter(Boolean).sort(byFound).slice(0, MAX_LOCAL_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Eintragen, sortieren, kappen, speichern – und melden, wo die Zeile gelandet ist.
 * @returns {{list: object[], rank: number}} `rank` ist 0-basiert, -1 wenn es nicht gereicht hat.
 */
export function saveLocalScore(entry) {
  const norm = normalizeEntry(entry);
  if (!norm) return { list: loadLocalScores(), rank: -1 };

  const list = loadLocalScores();
  list.push(norm); // hinten anhängen + stabil sortieren = Gleichstand überholt nicht
  list.sort(byFound);
  const trimmed = list.slice(0, MAX_LOCAL_ENTRIES);

  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
    sessionList = null; // wieder beschreibbar: der Speicher fuehrt jetzt wieder
  } catch {
    // Kein Speicher (Privatmodus, Kontingent voll). Den Eintrag hier fallen zu
    // lassen hiesse, einen Platz zu melden, den es beim naechsten Lesen nicht
    // mehr gibt - also haelt ihn wenigstens die Sitzung.
    sessionList = trimmed;
  }
  return { list: trimmed, rank: trimmed.indexOf(norm) };
}

/**
 * Welchen Platz ein Ergebnis bekäme, ohne es zu speichern – für die Vorschau auf
 * der Endkarte. 0-basiert. Gleichstand zählt als davor, genau wie beim Speichern:
 * Eine Vorschau, die den frischen Lauf vor die gleichwertigen älteren setzt, lässt
 * die Liste im Moment des Eintragens sichtbar umspringen.
 */
export function previewRank(found, list = loadLocalScores()) {
  let rank = 0;
  for (const e of list) {
    if (e.found >= found) rank++;
    else break;
  }
  return rank;
}

/**
 * Die eigene Zeile in einer Liste finden – ohne sich auf den vom Server
 * gemeldeten Rang zu verlassen. Der zeigt bei Gleichstand auf die erste Zeile
 * der Gruppe, während der frische Eintrag als letzte steht; danach zu indizieren
 * markierte zuverlässig die Zeile darüber.
 *
 * Gesucht wird deshalb nach den Werten: unter allen wertgleichen Zeilen die
 * jüngste (`at`), bei einer Liste ganz ohne Zeitstempel die letzte.
 * @returns {number} Index oder -1.
 */
export function matchOwnEntry(entries, own) {
  if (!Array.isArray(entries) || !own) return -1;
  const name = sanitizeName(own.name);
  let best = -1;
  let bestAt = -Infinity;
  entries.forEach((e, i) => {
    if (e.found !== own.found || sanitizeName(e.name) !== name) return;
    if (own.levels != null && e.levels !== own.levels) return;
    const at = Number.isFinite(e.at) ? e.at : -Infinity;
    if (best === -1 || at >= bestAt) {
      best = i;
      bestAt = at;
    }
  });
  return best;
}
