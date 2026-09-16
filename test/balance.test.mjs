import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluate } from '../tools/balance.mjs';
import { CONFIG } from '../js/config.js';

/**
 * Hält die Balance grob an Ort und Stelle: Die Simulation ist ein Modell, kein
 * Beweis – geprüft wird deshalb nur, was sich beim Schrauben an `config.js`
 * schnell kaputt macht.
 */
test('Durchläufe enden und belohnen Können', () => {
  const rows = evaluate(CONFIG, 40);
  const of = (name) => rows.find((row) => row.player === name);

  for (const row of rows) {
    assert.ok(row.seconds > 20, `${row.player}: Durchlauf ist mit ${row.seconds}s zu kurz`);
    assert.ok(row.seconds < 420, `${row.player}: Durchlauf endet nicht (${row.seconds}s)`);
    assert.ok(row.levels >= 1, `${row.player}: schafft im Schnitt keine Runde`);
  }

  assert.ok(of('schnell').levels > of('mittel').levels);
  assert.ok(of('mittel').levels > of('langsam').levels);
  assert.ok(of('schnell').maxGrid >= 4, 'gutes Spiel muss aus dem 3x3-Raster herauskommen');
});

/**
 * Der Grund fuer den schrumpfenden Rundenbonus. Ohne ihn kam der Abtipper
 * weiter als jeder Mensch: Sich durch eine Runde zu tippen war billiger als die
 * vier Sekunden, die es einbrachte - der Lauf finanzierte sich selbst. Geprueft
 * wird an `found`, denn das ist es, was in der Bestenliste steht.
 */
test('Abtippen schlaegt kein Merken', () => {
  const rows = evaluate(CONFIG, 40);
  const found = (name) => rows.find((row) => row.player === name).found;

  for (const rate of [4, 8, 12]) {
    assert.ok(
      found(`Abtipper ${rate}/s`) < found('mittel'),
      `Abtipper mit ${rate} Tipps/s kommt auf ${found(`Abtipper ${rate}/s`)} Zahlen ` +
      `und damit weiter als der mittlere Spieler (${found('mittel')})`,
    );
  }

  // Und er verhungert an der Startzeit, statt sich Zeit zu erspielen.
  const lauf = rows.find((row) => row.player === 'Abtipper 12/s');
  assert.ok(
    lauf.seconds < CONFIG.totalMs / 1000 + 5,
    `der Abtipper haelt sich ${lauf.seconds}s am Leben, erwartet waren rund ${CONFIG.totalMs / 1000}s`,
  );
});
