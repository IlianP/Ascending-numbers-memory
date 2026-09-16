/**
 * Die Sprache im echten Browser: erkennen, umschalten, merken – und dabei nicht
 * das Layout sprengen.
 *
 * Warum das hier und nicht in `test/i18n.test.mjs` steht: Dort wird geprüft, ob
 * die Pakete zueinander passen. Hier wird geprüft, ob überhaupt jemand sie
 * benutzt – dass die Browsersprache ankommt, dass ein Wechsel auch die Stellen
 * erwischt, die aus Spielstand zusammengesetzt sind, und dass die Wahl einen
 * Neustart überlebt. Jede dieser drei Verbindungen kann still reissen, ohne dass
 * ein einziger Schlüssel fehlt.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { openGame, findBrowser } from './helpers/browser.mjs';

const missing = findBrowser() ? false : 'kein Chrome gefunden';
const phone = { width: 390, height: 780 };

const text = (selector) => `document.querySelector(${JSON.stringify(selector)}).textContent.trim()`;

/** Sprache im Auswahlfeld setzen – wie ein Griff ins Menü, nur ohne Menü. */
const pick = (id, value) => `(() => {
  const select = document.getElementById(${JSON.stringify(id)});
  select.value = ${JSON.stringify(value)};
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return select.value;
})()`;

/** Warten, bis die Seite wieder übersetzt ist (setzt applyTranslations zum Schluss). */
async function ready(page) {
  for (let i = 0; i < 100; i++) {
    const done = await page.evaluate('document.documentElement.hasAttribute("data-i18n-ready")')
      .catch(() => false);
    if (done) return;
    await page.wait(50);
  }
  throw new Error('die Seite wurde nicht übersetzt');
}

test('die Browsersprache entscheidet, wenn niemand gewählt hat', { skip: missing }, async () => {
  const page = await openGame('/index.html', phone, 'fr-FR');
  try {
    assert.equal(await page.evaluate('document.documentElement.lang'), 'fr');
    assert.equal(await page.evaluate(text('#action')), 'Masquer');
    assert.equal(await page.evaluate(text('#btn-start')), 'Commencer');
    // Automatisch heisst automatisch: Das Feld bleibt auf dem leeren Eintrag
    // stehen, sonst wäre die Sprache ab dem ersten Blick festgenagelt.
    assert.equal(await page.evaluate('document.getElementById("lang-intro").value'), '');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('eine Sprache ohne Paket landet auf Englisch, nicht auf Deutsch', { skip: missing }, async () => {
  // Isländisch gibt es hier nicht. Wer eine unbekannte Sprache mitbringt, soll
  // die mit der grössten Reichweite bekommen – nicht die, in der das Spiel
  // zufällig geschrieben wurde.
  const page = await openGame('/index.html', phone, 'is-IS');
  try {
    assert.equal(await page.evaluate('document.documentElement.lang'), 'en');
    assert.equal(await page.evaluate(text('#action')), 'Cover up');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('umschalten wirkt sofort – auch auf zusammengesetzten Text', { skip: missing }, async () => {
  const page = await openGame('/index.html', phone, 'de-DE');
  try {
    assert.equal(await page.evaluate(text('#action')), 'Verdecken');
    assert.equal(await page.evaluate(text('#chip-sound-intro .chip__label')), 'Ton an');

    assert.equal(await page.evaluate(pick('lang-intro', 'es')), 'es');

    // Fest im Markup …
    assert.equal(await page.evaluate('document.documentElement.lang'), 'es');
    assert.equal(await page.evaluate(text('#btn-start')), 'Empezar partida');
    // … aus einer Vorlage …
    assert.equal(await page.evaluate(text('#chip-sound-intro .chip__label')), 'Con sonido');
    // … und in einem Attribut, das niemand sieht, bis jemand vorliest.
    assert.equal(
      await page.evaluate('document.getElementById("board").getAttribute("aria-label")'),
      'Tablero',
    );
    // Die Seite wurde NICHT neu geladen: Der Sprachwechsel darf einen noch nicht
    // eingetragenen Lauf nicht kosten.
    assert.equal(await page.evaluate('performance.getEntriesByType("navigation").length'), 1);

    // Und der zusammengesetzte Text wandert mit: Rekordzeile und Rundenanzeige
    // stehen in keinem data-i18n, sondern werden aus dem Spielstand gebaut.
    await page.click('#btn-start');
    await page.wait(120);
    assert.equal(await page.evaluate(text('#level-pill')), 'Ronda 1');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('die gewählte Sprache überlebt den Neustart und schlägt den Browser', { skip: missing }, async () => {
  const page = await openGame('/index.html', phone, 'de-DE');
  try {
    await page.evaluate(pick('lang-intro', 'fr'));
    assert.equal(await page.evaluate(text('#action')), 'Masquer');

    await page.evaluate('location.reload()');
    await ready(page);

    // Der Browser sagt immer noch Deutsch – die ausdrückliche Wahl gewinnt.
    assert.equal(await page.evaluate('navigator.language'), 'de-DE');
    assert.equal(await page.evaluate('document.documentElement.lang'), 'fr');
    assert.equal(await page.evaluate(text('#action')), 'Masquer');
    assert.equal(await page.evaluate('document.getElementById("lang-intro").value'), 'fr');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('zurück auf Automatik heisst wieder Browsersprache', { skip: missing }, async () => {
  const page = await openGame('/index.html', phone, 'fr-FR');
  try {
    await page.evaluate(pick('lang-intro', 'de'));
    assert.equal(await page.evaluate('document.documentElement.lang'), 'de');

    await page.evaluate(pick('lang-intro', ''));
    assert.equal(await page.evaluate('document.documentElement.lang'), 'fr',
      'ohne Wahl entscheidet wieder der Browser');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('beide Sprachfelder zeigen denselben Zustand', { skip: missing }, async () => {
  // Start- und Endkarte tragen je ein Feld. Sie nicht gleichzuschalten wäre
  // nicht bloss hässlich: Auf der Endkarte stünde dann eine Sprache, die die
  // Seite gar nicht spricht.
  const page = await openGame('/index.html?zeit=2', phone, 'de-DE');
  try {
    await page.evaluate(pick('lang-intro', 'fr'));
    assert.equal(await page.evaluate('document.getElementById("lang-over").value'), 'fr');

    await page.click('#btn-start');
    await page.wait(2600); // die abgekürzte Uhr läuft ab, die Endkarte kommt
    assert.equal(await page.evaluate('document.getElementById("card-over").hidden'), false);
    assert.equal(await page.evaluate(text('#btn-again')), 'Rejouer');

    await page.evaluate(pick('lang-over', 'es'));
    assert.equal(await page.evaluate('document.getElementById("lang-intro").value'), 'es');
    assert.equal(await page.evaluate(text('#btn-again')), 'Jugar otra vez');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('drei Chips passen auf 320 px – in jeder Sprache', { skip: missing }, async () => {
  // Französisch und Spanisch laufen 15 bis 30 Prozent länger als Englisch, und
  // das schmalste verbreitete Gerät ist 320 px breit. Gemessen wird deshalb an
  // der Geometrie, nicht am Augenschein: Was aus der Karte herausragt, fällt
  // sonst erst jemandem mit einem alten Telefon auf.
  for (const lang of ['de-DE', 'en-GB', 'fr-FR', 'es-ES']) {
    const page = await openGame('/index.html', { width: 320, height: 720 }, lang);
    try {
      const card = await page.rect('#card-intro');
      for (const selector of ['#chip-sound-intro', '#chip-scores-intro', '.chip--lang']) {
        const chip = await page.rect(selector);
        assert.ok(chip.left >= card.left - 0.5 && chip.left + chip.width <= card.left + card.width + 0.5,
          `${lang}: ${selector} steht seitlich aus der Karte heraus`);
        assert.ok(chip.width > 24 && chip.height > 24, `${lang}: ${selector} ist kein Ziel für einen Daumen`);
      }
      assert.equal(await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'),
        true, `${lang}: die Seite lässt sich seitlich schieben`);
      assert.deepEqual(page.errors, []);
    } finally {
      await page.close();
    }
  }
});
