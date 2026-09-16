import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_LOCAL_ENTRIES,
  loadLocalScores,
  matchOwnEntry,
  previewRank,
  sanitizeName,
  saveLocalScore,
} from '../js/scores.js';
import { levelSpec } from '../js/level.js';
import { CONFIG } from '../js/config.js';

/** Node hat kein localStorage – ein Attrappe reicht, das Modul kennt nur get/set. */
function fakeStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return store;
}

/** Ein Lauf mit `found` Zahlen; Runden und Datum sind hier nur Beiwerk. */
const run = (found, extra = {}) => ({ name: 'A', levels: 2, found, mistakes: 0, ...extra });

test.beforeEach(() => fakeStorage());

test('gefundene Zahlen ordnen genau wie geschaffte Runden', () => {
  // Die Grundlage der ganzen Wertung: Wer eine Runde mehr schafft, hat
  // zwangslaeufig mehr Zahlen gefunden – selbst gegen jemanden, der in seiner
  // letzten Runde bis auf eine Zahl fertig geworden ist.
  let sum = 0;
  for (let level = 1; level <= 30; level++) {
    const { count } = levelSpec(level, CONFIG);
    const bestMitEinerRundeWeniger = sum + count - 1; // Runde `level` fast geschafft
    sum += count;
    assert.ok(
      sum > bestMitEinerRundeWeniger,
      `Runde ${level}: ${sum} Zahlen muessen mehr sein als ${bestMitEinerRundeWeniger}`,
    );
  }
});

test('Liste steht bester zuerst und haelt die Kappung ein', () => {
  for (const found of [12, 40, 7, 25]) saveLocalScore(run(found));
  assert.deepEqual(loadLocalScores().map((e) => e.found), [40, 25, 12, 7]);

  for (let i = 0; i < MAX_LOCAL_ENTRIES + 10; i++) saveLocalScore(run(100 + i));
  const list = loadLocalScores();
  assert.equal(list.length, MAX_LOCAL_ENTRIES);
  assert.equal(list[0].found, 100 + MAX_LOCAL_ENTRIES + 9, 'der beste Lauf bleibt oben');
});

test('Gleichstand ueberholt nicht – und die Vorschau sagt dasselbe', () => {
  saveLocalScore(run(20, { name: 'Alt' }));
  saveLocalScore(run(20, { name: 'Mittel' }));

  // Erst fragen, wo der neue Lauf landen wuerde ...
  const vorschau = previewRank(20);
  // ... dann eintragen. Beides muss denselben Platz meinen, sonst sortiert
  // sich die Liste im Moment des Speicherns sichtbar um.
  const { rank } = saveLocalScore(run(20, { name: 'Neu' }));

  assert.equal(vorschau, 2);
  assert.equal(rank, 2);
  assert.deepEqual(loadLocalScores().map((e) => e.name), ['Alt', 'Mittel', 'Neu']);
});

test('previewRank zaehlt Bessere, nicht Gleiche daneben', () => {
  for (const found of [40, 25, 25, 7]) saveLocalScore(run(found));
  assert.equal(previewRank(99), 0);
  assert.equal(previewRank(25), 3, 'hinter beide 25er');
  assert.equal(previewRank(1), 4);
});

test('kaputte Eintraege fliegen beim Lesen raus, statt das Spiel zu stoppen', () => {
  const store = fakeStorage();
  store.set('ascending-numbers/scores/v1', JSON.stringify([
    { name: 'ok', levels: 2, found: 9, mistakes: 0, date: '2026-01-01T00:00:00.000Z' },
    { name: 'ohne Zahlen' },
    'Text statt Objekt',
    { name: 'negativ', found: -3 },
    null,
  ]));
  assert.deepEqual(loadLocalScores().map((e) => e.name), ['ok']);

  store.set('ascending-numbers/scores/v1', '{kein JSON');
  assert.deepEqual(loadLocalScores(), []);
});

test('ein voller Speicher kostet den Eintrag, nicht den Lauf', () => {
  fakeStorage();
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
  const { list, rank } = saveLocalScore(run(12));
  assert.equal(rank, 0, 'der Platz wird trotzdem gemeldet');
  assert.equal(list.length, 1);
});

test('Namen werden gesaeubert, ein leerer bleibt leer', () => {
  assert.equal(sanitizeName('   Anna    Lena  '), 'Anna Lena');
  assert.equal(sanitizeName('   '), '');
  assert.equal(sanitizeName(null), '');
  assert.equal(sanitizeName('x'.repeat(40)).length, 20);
});

test('die eigene Zeile wird ueber die Werte gefunden, nicht ueber den Rang', () => {
  // Drei wertgleiche Zeilen desselben Namens: Die eigene ist die juengste –
  // der vom Server gemeldete Rang zeigt dagegen auf die erste der Gruppe.
  const liste = [
    { name: 'Anna', levels: 5, found: 20, at: 1000 },
    { name: 'Anna', levels: 5, found: 20, at: 3000 },
    { name: 'Bea', levels: 5, found: 20, at: 4000 },
  ];
  assert.equal(matchOwnEntry(liste, { name: 'Anna', levels: 5, found: 20 }), 1);
  assert.equal(matchOwnEntry(liste, { name: 'Anna', levels: 5, found: 21 }), -1);

  // Ohne Zeitstempel (Server ohne created_at) die letzte passende Zeile.
  const ohneZeit = [
    { name: 'Anna', levels: 5, found: 20 },
    { name: 'Anna', levels: 5, found: 20 },
  ];
  assert.equal(matchOwnEntry(ohneZeit, { name: 'Anna', levels: 5, found: 20 }), 1);
});
