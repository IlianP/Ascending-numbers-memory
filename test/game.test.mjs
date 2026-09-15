import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../js/game.js';
import { createBoard, levelSpec, shuffle } from '../js/level.js';
import { CONFIG } from '../js/config.js';

/** Deterministische Zufallsquelle für reproduzierbare Felder. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Feld-Index der Zahl `n` im aktuellen Board. */
const cellOf = (game, n) => game.board.tiles.indexOf(n);

test('Rundenplan: alle zwei Runden eine Zahl mehr', () => {
  assert.deepEqual(levelSpec(1, CONFIG), { cols: 3, count: 3 });
  assert.deepEqual(levelSpec(2, CONFIG), { cols: 3, count: 3 });
  assert.deepEqual(levelSpec(3, CONFIG), { cols: 3, count: 4 });
  assert.deepEqual(levelSpec(13, CONFIG), { cols: 3, count: 9 });
});

test('Raster wächst, sobald 3x3 nicht mehr reicht', () => {
  assert.equal(levelSpec(15, CONFIG).cols, 4);
  assert.equal(levelSpec(15, CONFIG).count, 10);
  assert.equal(levelSpec(29, CONFIG).cols, 5);
});

test('Board enthält 1..count genau einmal', () => {
  const board = createBoard(7, CONFIG, seeded(42));
  const numbers = board.tiles.filter(Boolean).sort((a, b) => a - b);
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6]);
  assert.equal(board.tiles.length, board.cols * board.cols);
});

test('shuffle verliert und erfindet keine Elemente', () => {
  const input = [...Array(20).keys()];
  const out = shuffle(input, seeded(7));
  assert.deepEqual(out.slice().sort((a, b) => a - b), input);
  assert.notDeepEqual(out, input);
});

test('Vorschau nimmt keine Tipps an', () => {
  const game = new Game({}, seeded(3));
  game.start(0);
  assert.equal(game.phase, 'preview');
  assert.equal(game.tap(cellOf(game, 1), 0).result, 'ignored');
  assert.equal(game.found, 0);
});

test('richtige Reihenfolge deckt auf und schließt die Runde ab', () => {
  const game = new Game({}, seeded(11));
  game.start(0);
  game.hide();

  const count = game.board.count;
  for (let n = 1; n <= count; n++) {
    const res = game.tap(cellOf(game, n), 0);
    assert.equal(res.result, 'correct');
    assert.equal(res.levelDone, n === count);
  }

  assert.equal(game.found, count);
  assert.equal(game.mistakes, 0);
  assert.equal(game.clearedLevels, 1);
});

test('falscher Tipp zählt als Fehler, ohne Aufgedecktes zu verlieren', () => {
  const game = new Game({}, seeded(5));
  game.start(0);
  game.hide();
  game.tap(cellOf(game, 1), 0);

  const res = game.tap(cellOf(game, 3), 0);
  assert.equal(res.result, 'wrong');
  assert.equal(game.mistakes, 1);
  assert.equal(game.next, 2);
  assert.ok(game.revealed.has(cellOf(game, 1)));

  assert.equal(game.tap(cellOf(game, 2), 0).result, 'correct');
});

test('bereits aufgedecktes Feld wird ignoriert und zählt nicht als Fehler', () => {
  const game = new Game({}, seeded(9));
  game.start(0);
  game.hide();
  const first = cellOf(game, 1);
  game.tap(first, 0);

  assert.equal(game.tap(first, 0).result, 'ignored');
  assert.equal(game.mistakes, 0);
});

test('nächste Runde bringt neues Feld und setzt den Zähler zurück', () => {
  const game = new Game({}, seeded(17));
  game.start(0);
  game.hide();
  for (let n = 1; n <= game.board.count; n++) game.tap(cellOf(game, n), 0);

  game.nextLevel();
  assert.equal(game.level, 2);
  assert.equal(game.next, 1);
  assert.equal(game.phase, 'preview');
  assert.equal(game.revealed.size, 0);
});

test('Uhr läuft ab und beendet den Durchlauf', () => {
  const game = new Game({ totalMs: 1000 }, seeded(2));
  game.start(0);
  assert.equal(game.checkTime(400), false);
  assert.equal(game.remaining(400), 600);
  assert.equal(game.checkTime(1000), true);
  assert.equal(game.phase, 'over');
  assert.equal(game.tap(0, 1200).result, 'ignored');
});

test('Pause friert die Restzeit ein', () => {
  const game = new Game({ totalMs: 10_000 }, seeded(4));
  game.start(0);
  game.pause(3000);
  assert.equal(game.remaining(9999), 7000);
  assert.equal(game.checkTime(60_000), false);

  game.resume(50_000);
  assert.equal(game.remaining(50_000), 7000);
  assert.equal(game.checkTime(58_000), true);
});

test('Zeitstrafe und Rundenbonus sind konfigurierbar', () => {
  const game = new Game({ totalMs: 10_000, wrongPenaltyMs: 2000, levelBonusMs: 3000 }, seeded(6));
  game.start(0);
  game.hide();

  game.tap(game.board.tiles.findIndex((v) => v !== 1), 0);
  assert.equal(game.remaining(0), 8000);

  for (let n = 1; n <= game.board.count; n++) game.tap(cellOf(game, n), 0);
  assert.equal(game.remaining(0), 11_000);
});

test('Auswertung zählt nur abgeschlossene Runden', () => {
  const game = new Game({}, seeded(8));
  game.start(0);
  game.hide();
  for (let n = 1; n <= game.board.count; n++) game.tap(cellOf(game, n), 0);
  game.nextLevel();
  game.hide();
  game.tap(cellOf(game, 1), 0);

  assert.deepEqual(game.summary(), { levels: 1, found: 4, mistakes: 0 });
});

test('Direkteinstieg zählt die übersprungenen Runden nicht mit', () => {
  const game = new Game({}, seeded(23));
  game.start(0, 15);

  assert.equal(game.level, 15);
  assert.equal(game.board.cols, 4);
  assert.deepEqual(game.summary(), { levels: 0, found: 0, mistakes: 0 });

  game.hide();
  for (let n = 1; n <= game.board.count; n++) game.tap(cellOf(game, n), 0);
  assert.equal(game.clearedLevels, 1);

  game.nextLevel();
  assert.equal(game.level, 16);
  assert.equal(game.clearedLevels, 1);
});

test('Neustart setzt den Einstiegspunkt zurück', () => {
  const game = new Game({}, seeded(31));
  game.start(0, 12);
  game.start(0);

  assert.equal(game.level, 1);
  assert.equal(game.clearedLevels, 0);
});
