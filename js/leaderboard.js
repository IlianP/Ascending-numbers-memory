/**
 * Globale Bestenliste über die REST-Schnittstelle von Supabase.
 * Die einzige Datei im Projekt, die ins Netz greift – und sie kennt kein DOM.
 *
 * ## Fehlschlagen ist der Normalfall, nicht der Ausnahmefall
 *
 * Jeder Aufruf hier geht sanft daneben: kein Netz, keine Einrichtung, blockiert
 * durch einen Filter, Zeitüberschreitung, kaputte Antwort – Lesen liefert dann
 * `null`, und die Oberfläche zeigt eben die Liste vom Gerät. Das Spiel läuft
 * offline (Service Worker!) und muss offline vollständig sein; die globale
 * Liste ist eine Zugabe, keine Voraussetzung. Deshalb gibt es hier auch keinen
 * „Fehler anzeigen"-Pfad, sondern nur Rückgabewerte, die der Aufrufer deuten kann.
 *
 * ## Einrichtung (einmalig)
 *
 *   1. Kostenloses Supabase-Projekt anlegen (https://supabase.com) – oder das
 *      Projekt mitbenutzen, das schon für ein anderes Spiel läuft: alle Namen
 *      hier tragen das Präfix `ascending_`, kollidieren also nicht.
 *   2. `docs/leaderboard-setup.sql` im SQL-Editor des Projekts ausführen.
 *   3. Projekt-URL und den öffentlichen anon-/publishable-Key unten eintragen.
 *
 * Beide Werte gehören in den Browser: Der publishable Key ist dafür gemacht,
 * ausgeliefert zu werden, und geschützt wird die Tabelle durch Row Level
 * Security plus die SECURITY-DEFINER-Funktionen im SQL. Der `service_role`-Key
 * hat hier NICHTS verloren.
 *
 * ## Ehrlich bleiben
 *
 * Der Browser meldet sein Ergebnis selbst – eine solche Liste ist prinzipiell
 * nicht manipulationssicher. Die Prüfungen serverseitig halten groben Unfug ab
 * (unmögliche Werte, Sturzfluten), mehr nicht. Das gehört so gesagt und nicht
 * als „geschützt" verkauft.
 */

const SUPABASE_URL = 'https://bnyucmczsxzmsuylawgs.supabase.co'; // ohne Schrägstrich am Ende
const SUPABASE_ANON_KEY = 'sb_publishable_U83QRj1qXeApAkrEQlsRmA_B2wMBmDy'; // öffentlicher Key
const REQUEST_TIMEOUT_MS = 6000;

/**
 * Wartezeiten VOR dem jeweils nächsten Versuch; der erste läuft sofort. Ein
 * Eintrag macht also bis zu vier Versuche. Bewusst kurz: Wer gerade gespielt
 * hat, soll nicht auf einen Kreisel starren. Gedacht gegen den einen kurzen
 * Aussetzer – ein hart erspielter Lauf darf daran nicht verloren gehen.
 */
const RETRY_DELAYS_MS = [800, 1600, 3200];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ist überhaupt ein Server hinterlegt? Ohne das versteckt die Oberfläche alles Globale. */
export function leaderboardConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Eine Kennung pro beendetem Durchlauf. Der Server nutzt sie als
 * Idempotenz-Schlüssel: Geht die Antwort auf einem erfolgreichen Eintrag
 * verloren, legt der Wiederholungsversuch keine zweite Zeile an.
 */
export function newSubmissionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Kein randomUUID (alter Browser, unsicherer Kontext): Ein Zufallswert im
  // UUID-Format reicht – er muss nur einmalig sein, nicht kryptografisch stark.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Ein einzelner Aufruf. Das Ergebnis unterscheidet, ob sich ein zweiter Versuch
 * lohnt:
 *   { ok: true, data }
 *   { ok: false, retriable, status, error }
 * `retriable` bei Netzfehler, Zeitüberschreitung, 5xx oder 429. Ein 4xx ist
 * endgültig – der Server hat die Werte angesehen und abgelehnt, ein zweiter
 * Versuch ändert daran nichts. `error` ist ein kurzer Diagnosetext, nie etwas,
 * das der spielenden Person gezeigt wird.
 */
async function rpcOnce(fn, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
        /* Körper unlesbar – der Status allein hilft auch weiter */
      }
      return {
        ok: false,
        retriable: res.status >= 500 || res.status === 429,
        status: res.status,
        error: detail || res.statusText || null,
      };
    }
    return { ok: true, data: await res.json() };
  } catch (e) {
    // Offline, blockiert (CSP/CORS) oder abgebrochen (Zeitüberschreitung): kein HTTP-Status.
    return { ok: false, retriable: true, status: null, error: e ? `${e.name}: ${e.message}` : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Einmal versuchen, sonst `null`. Für Lesezugriffe: ein schnelles Nein schlägt einen langen Kreisel. */
async function rpc(fn, body) {
  if (!leaderboardConfigured()) return null;
  const r = await rpcOnce(fn, body);
  return r.ok ? r.data : null;
}

/**
 * Schreibende Variante: wiederholt nur, was sich zu wiederholen lohnt.
 * `onRetry(naechsterVersuch, gesamt)` meldet den Fortschritt an die Oberfläche.
 * `attempts` sammelt jeden Versuch (Status/retriable/Fehlertext), damit ein
 * Fehlschlag später erklärbar ist statt nur „ging nicht".
 */
async function rpcWithRetry(fn, body, onRetry) {
  if (!leaderboardConfigured()) return { ok: false, attempts: [] };
  const total = RETRY_DELAYS_MS.length + 1;
  const attempts = [];
  for (let attempt = 0; ; attempt++) {
    const r = await rpcOnce(fn, body);
    attempts.push({
      attempt: attempt + 1,
      status: r.status ?? null,
      retriable: !!r.retriable,
      error: r.ok ? null : r.error,
    });
    if (r.ok) return { ok: true, data: r.data, attempts };
    if (!r.retriable || attempt >= RETRY_DELAYS_MS.length) return { ok: false, attempts };
    if (onRetry) onRetry(attempt + 2, total);
    await wait(RETRY_DELAYS_MS[attempt]);
  }
}

/**
 * Den nackten Grund aus einer PostgREST-Fehlerantwort ziehen. Ein
 * `raise exception` kommt als {"code":"P0001",…,"message":"bad counters"} an;
 * etwas anderes wird gekürzt durchgereicht. Die Meldungen sind die des Servers
 * (englisch) – sie in Spielersprache zu übersetzen ist Sache der Oberfläche.
 */
function serverReason(body) {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body);
    const msg = parsed && (parsed.message || parsed.error || parsed.hint);
    if (msg) return String(msg).slice(0, 120);
  } catch {
    /* kein JSON – dann eben der Rohtext */
  }
  return String(body).trim().slice(0, 120) || null;
}

/**
 * Ein Ergebnis eintragen. Erfolg: `{ rank, total }` (Rang 1-basiert).
 * Fehlschlag: `{ failed: true, rejected, reason, attempts }` statt eines nackten
 * `null`, damit der Aufrufer „der Server hat Nein gesagt" von „der Server war
 * nicht da" unterscheiden kann. Nur Letzteres ist einen weiteren Versuch wert.
 */
export async function submitScore(entry, { onRetry } = {}) {
  const result = await rpcWithRetry(
    'ascending_submit_score',
    {
      p_name: entry.name,
      p_mode: entry.mode,
      p_levels: entry.levels,
      p_found: entry.found,
      p_mistakes: entry.mistakes,
      p_submission_id: entry.submissionId,
    },
    onRetry,
  );

  if (!result.ok) {
    const last = result.attempts[result.attempts.length - 1];
    const rejected = !!last && !last.retriable && last.status >= 400 && last.status < 500;
    return {
      failed: true,
      rejected,
      reason: rejected ? serverReason(last.error) : null,
      attempts: result.attempts,
    };
  }

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || row.rank == null) {
    return { failed: true, rejected: false, reason: null, attempts: result.attempts };
  }
  return { rank: Number(row.rank), total: Number(row.total) };
}

/** So viele Zeilen holt die globale Liste. Der Server deckelt auf 100. */
export const TOP_SCORES_LIMIT = 50;

/**
 * Die besten Läufe einer Wertungsklasse, bester zuerst.
 * Liefert ein (womöglich leeres) Array – oder `null`, wenn der Aufruf danebenging.
 * `at` ist der Zeitpunkt in ms, oder `null`, falls der Server keinen mitschickt.
 */
export async function fetchTopScores(mode, { limit = TOP_SCORES_LIMIT } = {}) {
  const data = await rpc('ascending_top_scores', { p_mode: mode, p_limit: limit });
  if (!Array.isArray(data)) return null;
  return data.map((r) => ({
    name: r.name,
    levels: Number(r.levels),
    found: Number(r.found),
    mistakes: Number(r.mistakes),
    at: r.created_at ? Date.parse(r.created_at) : null,
  }));
}
