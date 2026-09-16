import test from 'node:test';
import assert from 'node:assert/strict';

import { findBrowser, openGame } from './helpers/browser.mjs';

/**
 * Das Spielfeld darf sich nicht bewegen, sobald es steht.
 *
 * Der Fall, der diese Datei rechtfertigt: Beim Verdecken verschwand der
 * "Verdecken"-Knopf per `hidden` aus dem Layout, das Raster der Bühne zentrierte
 * neu, und das Spielfeld sprang 26 px nach unten – genau in dem Moment, in dem
 * sich der Spieler die Positionen gemerkt hat und blind tippen will.
 *
 * Gemessen wird deshalb an echten Element-Rechtecken im Browser; reine Logik
 * kann das nicht sehen.
 */

const browser = findBrowser();
const missing = browser ? false : 'kein Chrome gefunden (CHROME_PATH setzen)';

/** Alle Kachel-Rechtecke – erwischt auch ein Verrutschen einzelner Felder. */
const TILES = `[...document.querySelectorAll('#board .tile')].map((t) => {
  const r = t.getBoundingClientRect();
  return [+r.top.toFixed(2), +r.left.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)];
})`;

test('Spielfeld bleibt beim Verdecken exakt stehen', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await page.click('#btn-start');
    await page.wait(500); // Karte ausblenden, Kacheln aufbauen

    const vorher = await page.rect('#board');
    const kachelnVorher = await page.evaluate(TILES);

    await page.click('#action');
    await page.wait(700); // Verdeck-Animation inklusive Versatz abwarten

    assert.deepEqual(await page.rect('#board'), vorher,
      'das Spielfeld darf sich beim Verdecken nicht bewegen');
    assert.deepEqual(await page.evaluate(TILES), kachelnVorher,
      'keine einzelne Kachel darf sich beim Verdecken bewegen');

    // Auch das Antippen selbst darf nichts verschieben.
    const ersteKachel = await page.evaluate(`(() => {
      const werte = ${TILES};
      return werte.length;
    })()`);
    assert.ok(ersteKachel > 0, 'es sollten Kacheln da sein');

    await page.click('#board .tile[data-cell="0"]');
    await page.wait(400);
    assert.deepEqual(await page.rect('#board'), vorher,
      'auch ein Tipp darf das Spielfeld nicht bewegen');

    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('Spielfeld steht auch durch eine ganze Runde still', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await page.click('#btn-start');
    await page.wait(500);

    // Reihenfolge aus der Vorschau lesen, dann verdecken und blind tippen.
    const reihenfolge = await page.evaluate(`[...document.querySelectorAll('#board .tile')]
      .map((t) => ({ cell: t.dataset.cell, value: Number(t.textContent) }))
      .filter((t) => t.value > 0)
      .sort((a, b) => a.value - b.value)
      .map((t) => t.cell)`);

    await page.click('#action');
    await page.wait(600);
    const stand = await page.rect('#board');

    for (const cell of reihenfolge.slice(0, reihenfolge.length - 1)) {
      await page.click(`#board .tile[data-cell="${cell}"]`);
      await page.wait(120);
      assert.deepEqual(await page.rect('#board'), stand,
        `Spielfeld verschoben nach Tipp auf Feld ${cell}`);
    }

    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('Uhr und Fortschrittspunkte verschieben nichts', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await page.click('#btn-start');
    await page.wait(500);
    const vorher = await page.rect('#board');

    // Die Punkte erscheinen erst beim Verdecken, die Uhr zaehlt sichtbar herunter,
    // und der Bonus blendet neben ihr ein - nichts davon darf Platz beanspruchen.
    await page.click('#action');
    await page.wait(1500);

    assert.deepEqual(await page.rect('#board'), vorher);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

/**
 * Der Kopfbereich muss auch auf dem schmalsten unterstuetzten Geraet passen.
 * Anlass: Der dritte Knopf (Neustart) sprengte bei 320 px die Zeile, weil die
 * Spalten symmetrisch waren (`1fr auto 1fr`) - die linke Spalte wurde so breit
 * wie die Knopfleiste rechts. Der Beenden-Knopf lag dann ausserhalb des Bildes.
 */
for (const width of [320, 360, 390]) {
  test(`Bedienung passt bei ${width} px ins Bild`, { skip: missing }, async () => {
    const page = await openGame('/index.html', { width, height: 720 });
    try {
      await page.click('#btn-start');
      await page.wait(400);

      for (const selector of ['#level-pill', '#clock', '#btn-sound', '#btn-restart', '#btn-quit', '#board', '#action']) {
        const box = await page.rect(selector);
        assert.ok(box.left >= 0, `${selector} ragt links heraus (${box.left})`);
        assert.ok(box.left + box.width <= width,
          `${selector} ragt rechts heraus (bis ${(box.left + box.width).toFixed(1)} bei ${width} px)`);
        assert.ok(box.width > 0 && box.height > 0, `${selector} ist unsichtbar klein`);
      }

      assert.equal(await page.evaluate('document.documentElement.scrollWidth'), width,
        'die Seite darf nicht seitlich scrollen');
      assert.deepEqual(page.errors, []);
    } finally {
      await page.close();
    }
  });
}

/**
 * Auf einem kleinen Display passt die Startkarte nicht mehr komplett ins Bild -
 * dann muss die Lade scrollen. Anlass: Bei 320x568 lag der "Spiel starten"-Knopf
 * bei 626 px und war schlicht nicht erreichbar; das Spiel liess sich dort gar
 * nicht starten. Ein zentrierter Inhalt, der ueberlaeuft, laesst sich nicht
 * herunterscrollen - deshalb `margin: auto` in einer Flex-Spalte statt
 * `place-items: center`.
 */
for (const [width, height] of [[320, 568], [360, 640], [390, 780]]) {
  test(`Startkarte ist bei ${width}x${height} bedienbar`, { skip: missing }, async () => {
    const page = await openGame('/index.html', { width, height });
    try {
      const oben = await page.evaluate(
        `+document.getElementById('card-intro').getBoundingClientRect().top.toFixed(1)`);
      assert.ok(oben >= 0, `die Karte ist oben abgeschnitten (${oben} px)`);

      // Ganz nach unten scrollen - danach muss der Startknopf vollstaendig da sein.
      await page.evaluate(`(() => {
        const sheet = document.getElementById('sheet');
        sheet.scrollTop = sheet.scrollHeight;
        return true;
      })()`);
      const knopf = await page.rect('#btn-start');
      assert.ok(knopf.top >= 0 && knopf.top + knopf.height <= height,
        `der Startknopf ist nicht erreichbar (${knopf.top} bis ${knopf.top + knopf.height} bei ${height} px)`);

      // Und er muss auch wirklich klickbar sein, nicht nur sichtbar.
      await page.click('#btn-start');
      await page.wait(400);
      assert.equal(await page.evaluate(`document.getElementById('hud').dataset.on`), '1',
        'der Startknopf laesst sich nicht druecken');

      assert.deepEqual(page.errors, []);
    } finally {
      await page.close();
    }
  });
}
