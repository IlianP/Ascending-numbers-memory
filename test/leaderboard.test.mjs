import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchTopScores,
  leaderboardConfigured,
  newSubmissionId,
  submitScore,
} from '../js/leaderboard.js';

/**
 * Die Netzschicht gegen einen gefaelschten `fetch`. Geprueft wird vor allem das
 * Fehlverhalten – das ist hier der Normalfall: Ohne Netz, vor dem Einrichten des
 * Servers oder hinter einem Filter muss das Spiel vollstaendig bleiben.
 *
 * Es wird NIE gegen den echten Server gesprochen; `globalThis.fetch` ist in
 * jedem Test ersetzt.
 */

const original = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = original; });

/** Antworten der Reihe nach ausliefern und die Aufrufe mitschreiben. */
function stubFetch(...responses) {
  const calls = [];
  let i = 0;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
    const next = responses[Math.min(i++, responses.length - 1)];
    if (typeof next === 'function') return next();
    return next;
  };
  return calls;
}

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const fail = (status, body = '') => ({
  ok: false,
  status,
  statusText: `HTTP ${status}`,
  text: async () => body,
});
const boom = () => { throw Object.assign(new Error('offline'), { name: 'TypeError' }); };

const lauf = {
  name: 'Anna',
  mode: 'standard',
  levels: 7,
  found: 28,
  mistakes: 3,
  submissionId: '00000000-0000-4000-8000-000000000001',
};

test('ein eingerichteter Server wird auch benutzt', () => {
  assert.equal(leaderboardConfigured(), true);
});

test('jeder Durchlauf bekommt eine eigene Kennung', () => {
  const a = newSubmissionId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, newSubmissionId());
});

test('Eintragen schickt die Rohwerte und liefert den Platz zurueck', async () => {
  const calls = stubFetch(ok([{ rank: 4, total: 42 }]));
  const res = await submitScore(lauf);

  assert.deepEqual(res, { rank: 4, total: 42 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/ascending_submit_score$/);
  assert.deepEqual(calls[0].body, {
    p_name: 'Anna',
    p_mode: 'standard',
    p_levels: 7,
    p_found: 28,
    p_mistakes: 3,
    p_submission_id: lauf.submissionId,
  });
});

test('ein Aussetzer wird wiederholt – mit derselben Kennung', async () => {
  const calls = stubFetch(fail(503, 'bad gateway'), ok([{ rank: 1, total: 1 }]));
  const versuche = [];
  const res = await submitScore(lauf, { onRetry: (a, t) => versuche.push([a, t]) });

  assert.deepEqual(res, { rank: 1, total: 1 });
  assert.equal(calls.length, 2);
  assert.deepEqual(versuche, [[2, 4]], 'der Fortschritt wird gemeldet');
  assert.equal(
    calls[0].body.p_submission_id,
    calls[1].body.p_submission_id,
    'dieselbe Kennung – sonst legt der zweite Versuch eine zweite Zeile an',
  );
});

test('ein abgelehnter Eintrag wird nicht wiederholt, sondern begruendet', async () => {
  // Der Server hat geantwortet und Nein gesagt: Ein zweiter Versuch mit
  // denselben Werten kann daran nichts aendern.
  const calls = stubFetch(fail(400, JSON.stringify({ code: 'P0001', message: 'bad counters' })));
  const res = await submitScore(lauf);

  assert.equal(calls.length, 1);
  assert.equal(res.failed, true);
  assert.equal(res.rejected, true);
  assert.equal(res.reason, 'bad counters');
});

test('ohne Netz wird das Versuchsbudget aufgebraucht und protokolliert', async () => {
  const calls = stubFetch(boom);
  const res = await submitScore(lauf);

  assert.equal(calls.length, 4, 'ein Sofortversuch plus drei Wiederholungen');
  assert.equal(res.failed, true);
  assert.equal(res.rejected, false, 'nicht erreichbar ist nicht dasselbe wie abgelehnt');
  assert.equal(res.attempts.length, 4);
  assert.ok(res.attempts.every((a) => a.retriable && a.status === null));
});

test('eine unerwartete Antwort gilt als Fehlschlag, nicht als Erfolg', async () => {
  stubFetch(ok([]));
  const res = await submitScore(lauf);
  assert.equal(res.failed, true);
  assert.equal(res.rank, undefined);
});

test('die globale Liste kommt als Zeilen, ein Fehlschlag als null', async () => {
  const calls = stubFetch(ok([
    { name: 'Anna', levels: '7', found: '28', mistakes: '3', created_at: '2026-09-01T10:00:00Z' },
    { name: '', levels: 4, found: 15, mistakes: 0, created_at: null },
  ]));
  const list = await fetchTopScores('standard');

  assert.deepEqual(calls[0].body, { p_mode: 'standard', p_limit: 50 });
  assert.deepEqual(list, [
    { name: 'Anna', levels: 7, found: 28, mistakes: 3, at: Date.parse('2026-09-01T10:00:00Z') },
    { name: '', levels: 4, found: 15, mistakes: 0, at: null },
  ]);

  stubFetch(fail(404, 'function not found'));
  assert.equal(await fetchTopScores('standard'), null, 'Server ohne eingespieltes SQL');

  stubFetch(boom);
  assert.equal(await fetchTopScores('standard'), null, 'offline');
});
