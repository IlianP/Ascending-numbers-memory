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
