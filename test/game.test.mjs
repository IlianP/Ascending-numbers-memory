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

test('pausiertes Spiel nimmt keine Tipps an', () => {
  const game = new Game({ totalMs: 10_000, levelBonusMs: 4000 }, seeded(13));
  game.start(0);
  game.hide();
  game.pause(1000);

  assert.equal(game.tap(cellOf(game, 1), 1000).result, 'ignored');
  assert.equal(game.found, 0);

  game.resume(1000);
  assert.equal(game.tap(cellOf(game, 1), 1000).result, 'correct');
});

test('Rundenbonus landet auf der Uhr', () => {
  const game = new Game({ totalMs: 10_000, levelBonusMs: 4000 }, seeded(19));
  game.start(0);
  game.hide();
  for (let n = 1; n <= game.board.count; n++) game.tap(cellOf(game, n), 0);

  assert.equal(game.remaining(0), 14_000);
});

test('Rundenbonus schrumpft mit den Fehlern, aber nie unter null', () => {
  const game = new Game({}, seeded(5));
  const { levelBonusMs, bonusFreeMistakesPerNumber, bonusPenaltyMs } = game.config;
  // Frei ist ein Fehler je Zahl der Runde - in einer Runde mit fuenf Zahlen
  // also fuenf. Das ist der Punkt: Grosse Runden laden zu mehr Vertippern ein.
  const frei = 5 * bonusFreeMistakesPerNumber;
  assert.equal(game.levelBonus(0, 5), levelBonusMs);
  assert.equal(game.levelBonus(frei, 5), levelBonusMs, 'die freien Fehler kosten nichts');
  assert.equal(game.levelBonus(frei + 1, 5), levelBonusMs - bonusPenaltyMs);
  assert.equal(game.levelBonus(frei + 99, 5), 0, 'der Bonus wird nie negativ');

  // Und die Grenze waechst wirklich mit der Runde mit.
  assert.equal(game.levelBonus(4, 3), levelBonusMs - bonusPenaltyMs, '3 Zahlen: ab dem vierten Fehler');
  assert.equal(game.levelBonus(4, 9), levelBonusMs, '9 Zahlen: vier Fehler sind frei');
});

test('pauschale und mitwachsende Freigrenze sind zweierlei', () => {
  // Diese Unterscheidung ist nicht akademisch: Eine Vergleichsvariante in
  // tools/balance.mjs bildete die frueher ausgelieferte Regel ("zwei Fehler
  // frei") mit `bonusFreeMistakesPerNumber: 0` nach. Das sind aber NULL freie
  // Fehler - der Vergleichswert war zu streng und die daraus abgeleitete
  // Begruendung fuer die neue Grenze wertlos.
  const pauschal = new Game({ bonusFreeMistakes: 2, bonusFreeMistakesPerNumber: 0 });
  const voll = pauschal.config.levelBonusMs;
  const strafe = pauschal.config.bonusPenaltyMs;

  assert.equal(pauschal.levelBonus(2, 5), voll, 'zwei Fehler sind frei');
  assert.equal(pauschal.levelBonus(3, 5), voll - strafe, 'der dritte kostet');
  assert.equal(pauschal.levelBonus(2, 12), voll, 'und zwar unabhaengig von der Rundengroesse');

  const keine = new Game({ bonusFreeMistakes: 0, bonusFreeMistakesPerNumber: 0 });
  assert.equal(keine.levelBonus(1, 5), voll - strafe, 'ohne Freigrenze kostet schon der erste');

  const mitwachsend = new Game({ bonusFreeMistakes: 0, bonusFreeMistakesPerNumber: 1 });
  assert.equal(mitwachsend.levelBonus(5, 5), voll);
  assert.equal(mitwachsend.levelBonus(5, 3), voll - 2 * strafe, 'kleine Runde, engere Grenze');
});

test('wildes Durchprobieren verdient keine Zeit', () => {
  // Der Schutz gegen das Abtippen: Wer eine Runde durchprobiert, schliesst sie
  // zwar ab, bekommt dafuer aber nichts - und ohne neue Zeit ist der Durchlauf
  // nach der Startzeit vorbei. Die Uhr darf dabei NICHT rueckwaerts gehen.
  const game = new Game({}, seeded(11));
  game.start(0);
  const deadlineVorher = game.deadline;
  game.hide();

  let letzter = { bonusMs: 0 };
  for (let n = 1; n <= game.board.count; n++) {
    // erst alle falschen Felder abklappern, dann das richtige
    for (let cell = 0; cell < game.board.tiles.length; cell++) {
      if (game.board.tiles[cell] === n || game.revealed.has(cell)) continue;
      game.tap(cell, 0);
    }
    letzter = game.tap(cellOf(game, n), 0);
  }

  assert.equal(letzter.levelDone, true, 'die Runde wurde abgeschlossen');
  assert.equal(letzter.bonusMs, 0, 'aber sie bringt keine Zeit ein');
  assert.equal(game.deadline, deadlineVorher, 'und sie kostet auch keine');
  assert.ok(
    game.levelMistakes > game.board.count * game.config.bonusFreeMistakesPerNumber,
    'der Abtipper muss ueber der Freigrenze der Runde liegen',
  );
});

test('Fehlerzaehler der Runde startet mit jeder Runde neu', () => {
  const game = new Game({}, seeded(3));
  game.start(0);
  game.hide();
  const falsch = game.board.tiles.findIndex((v) => v !== 1);
  game.tap(falsch, 0);
  assert.equal(game.levelMistakes, 1);

  for (let n = 1; n <= game.board.count; n++) game.tap(cellOf(game, n), 0);
  game.nextLevel();
  assert.equal(game.levelMistakes, 0, 'die neue Runde faengt ohne Altlasten an');
  assert.equal(game.mistakes, 1, 'der Gesamtzaehler behaelt ihn aber');
});

test('abgelaufene Zeit nimmt keine Tipps mehr an', () => {
  const game = new Game({ totalMs: 1000, levelBonusMs: 4000 }, seeded(23));
  game.start(0);
  game.hide();

  // Letzter Tipp faellt zwischen zwei Frames, nachdem die Zeit abgelaufen ist.
  const count = game.board.count;
  for (let n = 1; n < count; n++) game.tap(cellOf(game, n), 500);

  assert.equal(game.tap(cellOf(game, count), 1200).result, 'ignored');
  assert.equal(game.remaining(1200), 0, 'der Bonus darf den Durchlauf nicht wiederbeleben');
  assert.equal(game.checkTime(1200), true);
});
