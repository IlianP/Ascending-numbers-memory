/**
 * Balance-Simulation: spielt Durchläufe gegen die echte Spiellogik durch.
 *
 * Der simulierte Mensch braucht Zeit zum Einprägen (wächst mit der Zahlenmenge)
 * und pro Tipp eine Reaktionszeit; ab und zu vertippt er sich. Die Modellwerte
 * unten sind grob, aber sie reichen für die Frage, um die es hier geht:
 * Wie lange dauert ein Durchlauf, wie weit kommt man, und endet er überhaupt?
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

  return { levels: game.summary().levels, seconds: now / 1000, cols };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Mittelwerte über viele Seeds – ein einzelner Durchlauf sagt zu wenig. */
export function evaluate(config, runs = 200) {
  return PLAYERS.map((player) => {
    const results = Array.from({ length: runs }, (_, i) => playRun(config, player, i + 1));
    return {
      player: player.name,
      levels: +mean(results.map((r) => r.levels)).toFixed(1),
      seconds: +mean(results.map((r) => r.seconds)).toFixed(1),
      maxGrid: Math.max(...results.map((r) => r.cols)),
    };
  });
}

/*
 * Jede Variante nennt Startzeit und Bonus ausdruecklich. Wuerde sie die Werte aus
 * `config.js` erben, verschoebe sich die Vergleichsbasis still mit, sobald dort
 * jemand schraubt - und die Zeile "vorher" zeigte plötzlich das "nachher".
 */
const VARIANTS = {
  'vorher (50 s, kein Bonus)': { ...CONFIG, totalMs: 50_000, levelBonusMs: 0 },
  'aktuell (30 s, +4 s)': { ...CONFIG, totalMs: 30_000, levelBonusMs: 4000 },
  '50 s, +3 s': { ...CONFIG, totalMs: 50_000, levelBonusMs: 3000 },
  '35 s, +4 s': { ...CONFIG, totalMs: 35_000, levelBonusMs: 4000 },
  '30 s, +5 s': { ...CONFIG, totalMs: 30_000, levelBonusMs: 5000 },
  '30 s, +4 s, alle 3 Runden': { ...CONFIG, totalMs: 30_000, levelBonusMs: 4000, growEvery: 3 },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [label, config] of Object.entries(VARIANTS)) {
    console.log(`\n${label}`);
    for (const row of evaluate(config)) {
      console.log(`  ${row.player.padEnd(8)} ${String(row.levels).padStart(5)} Runden  ${String(row.seconds).padStart(5)}s  bis ${row.maxGrid}x${row.maxGrid}`);
    }
  }
}
