/**
 * Balance-Simulation: spielt Durchläufe gegen die echte Spiellogik durch.
 *
 * Der simulierte Mensch braucht Zeit zum Einprägen (wächst mit der Zahlenmenge)
 * und pro Tipp eine Reaktionszeit; ab und zu vertippt er sich. Die Modellwerte
 * unten sind grob, aber sie reichen für die Frage, um die es hier geht:
 * Wie lange dauert ein Durchlauf, wie weit kommt man, und endet er überhaupt?
 *
 * Dazu kommt der **Abtipper**: Er prägt sich nichts ein, drückt sofort
 * „Verdecken" und tippt die Felder reihum ab, bis das richtige dabei ist. Er ist
 * der Grund für den schrumpfenden Rundenbonus (`bonusPenaltyMs` in config.js) –
 * ohne den kam er weiter als jeder Mensch, weil Durchprobieren billiger war als
 * die vier Sekunden, die es einbrachte. Gemessen wird er an `found` (gefundene
 * Zahlen), denn genau das wertet die Bestenliste.
 *
 *   node tools/balance.mjs
 */

import { Game } from '../js/game.js';
import { CONFIG } from '../js/config.js';

/** Spielertypen als Tempo-Faktor auf die Zeiten unten. */
const PLAYERS = [
  { name: 'schnell', factor: 0.75, errorRate: 0.04 },
  { name: 'mittel', factor: 1, errorRate: 0.08 },
  { name: 'langsam', factor: 1.35, errorRate: 0.14 },
];

/** Tempi des Abtippers, in Tipps pro Sekunde. 4/s tippt jeder, 12/s sind zwei Daumen im Akkord. */
const BRUTE_RATES = [4, 8, 12];

/** Vorschau: Grundzeit plus Aufwand je Zahl. */
const memoriseMs = (count, factor) => (600 + 280 * count) * factor;
/** Ein Tipp: Zielen und Antippen. */
const tapMs = (factor) => 330 * factor;

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Ein Durchlauf; liefert Runden, Dauer und größtes erreichtes Raster. */
function playRun(config, player, seed) {
  const rng = seeded(seed);
  const game = new Game(config, rng);
  let now = 0;
  let cols = 3;

  game.start(now);

  while (!game.checkTime(now)) {
    const { count } = game.board;
    cols = Math.max(cols, game.board.cols);

    now += memoriseMs(count, player.factor);
    if (game.checkTime(now)) break;
    game.hide();

    for (let n = 1; n <= count; n++) {
      // Fehltipp: kostet einen Tipp Zeit, der Zug wird danach wiederholt.
      if (rng() < player.errorRate) {
        now += tapMs(player.factor);
        const wrong = game.board.tiles.findIndex((v, i) => v !== n && !game.revealed.has(i));
        if (wrong >= 0) game.tap(wrong, now);
      }

      now += tapMs(player.factor);
      if (game.checkTime(now)) break;
      game.tap(game.board.tiles.indexOf(n), now);
    }

    if (game.phase === 'over') break;
    if (game.next > game.board.count) {
      now += config.levelBreakMs ?? CONFIG.levelBreakMs;
      if (game.checkTime(now)) break;
      game.nextLevel();
    }
  }

  const summary = game.summary();
  return { levels: summary.levels, found: summary.found, seconds: now / 1000, cols };
}

/** Ein Durchlauf des Abtippers: kein Einprägen, nur Durchprobieren. */
function playBrute(config, tapsPerSecond, seed) {
  const rng = seeded(seed);
  const game = new Game(config, rng);
  const tap = 1000 / tapsPerSecond;
  let now = 0;
  let cols = 3;

  game.start(now);

  while (!game.checkTime(now)) {
    cols = Math.max(cols, game.board.cols);
    now += 150; // er drückt sofort auf „Verdecken", statt sich etwas zu merken
    if (game.checkTime(now)) break;
    game.hide();

    // Felder, die für die aktuelle Zielzahl schon durch sind. Nach einem Treffer
    // beginnt die Suche von vorn – ein Fehltipp verrät ja nichts über das Feld.
    let tried = new Set();
    let guard = 0;

    while (game.phase === 'playing' && !game.checkTime(now) && guard++ < 6000) {
      const target = game.board.tiles.findIndex(
        (_, cell) => !game.revealed.has(cell) && !tried.has(cell),
      );
      if (target < 0) break;

      now += tap;
      const res = game.tap(target, now);
      tried.add(target);
      if (res.result === 'correct') tried = new Set();
      if (res.levelDone) {
        now += config.levelBreakMs ?? CONFIG.levelBreakMs;
        if (!game.checkTime(now)) game.nextLevel();
        break;
      }
    }
    if (game.phase === 'over') break;
  }

  const summary = game.summary();
  return { levels: summary.levels, found: summary.found, seconds: now / 1000, cols };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const summarise = (name, results) => ({
  player: name,
  levels: +mean(results.map((r) => r.levels)).toFixed(1),
  found: +mean(results.map((r) => r.found)).toFixed(1),
  seconds: +mean(results.map((r) => r.seconds)).toFixed(1),
  maxGrid: Math.max(...results.map((r) => r.cols)),
});

/** Mittelwerte über viele Seeds – ein einzelner Durchlauf sagt zu wenig. */
export function evaluate(config, runs = 200) {
  const rows = PLAYERS.map((player) =>
    summarise(player.name, Array.from({ length: runs }, (_, i) => playRun(config, player, i + 1))));

  for (const rate of BRUTE_RATES) {
    rows.push(summarise(
      `Abtipper ${rate}/s`,
      Array.from({ length: runs }, (_, i) => playBrute(config, rate, i + 1)),
    ));
  }
  return rows;
}

/*
 * Jede Variante nennt Startzeit und Bonus ausdruecklich. Wuerde sie die Werte aus
 * `config.js` erben, verschoebe sich die Vergleichsbasis still mit, sobald dort
 * jemand schraubt - und die Zeile "vorher" zeigte plötzlich das "nachher".
 */
const VARIANTS = {
  'vorher (50 s, kein Bonus)': { ...CONFIG, totalMs: 50_000, levelBonusMs: 0 },
  'ohne Schutz (30 s, +4 s, Fehler kostenlos)':
    { ...CONFIG, totalMs: 30_000, levelBonusMs: 4000, bonusPenaltyMs: 0 },
  'aktuell (30 s, +4 s, ab dem 3. Fehler -2 s)':
    { ...CONFIG, totalMs: 30_000, levelBonusMs: 4000, bonusFreeMistakes: 2, bonusPenaltyMs: 2000 },
  '50 s, +3 s': { ...CONFIG, totalMs: 50_000, levelBonusMs: 3000 },
  '35 s, +4 s': { ...CONFIG, totalMs: 35_000, levelBonusMs: 4000 },
  '30 s, +5 s': { ...CONFIG, totalMs: 30_000, levelBonusMs: 5000 },
  '30 s, +4 s, alle 3 Runden': { ...CONFIG, totalMs: 30_000, levelBonusMs: 4000, growEvery: 3 },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [label, config] of Object.entries(VARIANTS)) {
    console.log(`\n${label}`);
    for (const row of evaluate(config)) {
      console.log(`  ${row.player.padEnd(14)} ${String(row.levels).padStart(5)} Runden  ${String(row.found).padStart(6)} Zahlen  ${String(row.seconds).padStart(5)}s  bis ${row.maxGrid}x${row.maxGrid}`);
    }
  }
}
