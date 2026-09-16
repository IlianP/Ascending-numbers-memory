import test from 'node:test';
import assert from 'node:assert/strict';

import { findBrowser, openGame } from './helpers/browser.mjs';

/**
 * Die Bestenliste im echten Browser: oeffnen, schliessen, Zeilen malen, und der
 * globale Reiter, wenn der Server nicht antwortet.
 *
 * Gegen den echten Server wird dabei NIE gesprochen – `fetch` ist in jedem Test
 * ersetzt, bevor der globale Reiter angefasst wird.
 */

const missing = findBrowser() ? false : 'kein Chrome gefunden (CHROME_PATH setzen)';

const text = (selector) => `document.querySelector(${JSON.stringify(selector)}).textContent.trim()`;
const hidden = (selector) => `document.querySelector(${JSON.stringify(selector)}).hidden`;

/** Ein paar Laeufe in den Speicher legen, als haette das Geraet schon gespielt. */
const seed = (page, entries) => page.evaluate(
  `localStorage.setItem('ascending-numbers/scores/v1', ${JSON.stringify(JSON.stringify(entries))}), true`,
);

const lauf = (name, found, levels) => ({
  name, levels, found, mistakes: 0, date: '2026-09-01T10:00:00.000Z',
});

/** Der Netzzugriff wird ersetzt, bevor irgendetwas Globales angeklickt wird. */
const stubFetch = (page, body) => page.evaluate(`(() => {
  window.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(${JSON.stringify(body)}) });
  return true;
})()`);

const breakFetch = (page) => page.evaluate(`(() => {
  window.fetch = () => Promise.reject(new TypeError('offline'));
  return true;
})()`);

const rowTexts = (page) => page.evaluate(
  `[...document.querySelectorAll('#score-list .score-row')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim())`,
);

test('Bestenliste oeffnet ueber der Startkarte und kehrt dorthin zurueck', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await seed(page, [lauf('Anna', 28, 7), lauf('Bea', 15, 4)]);

    await page.click('#chip-scores-intro');
    await page.wait(150);

    assert.equal(await page.evaluate(hidden('#card-scores')), false);
    assert.equal(await page.evaluate(hidden('#card-intro')), true);

    const rows = await rowTexts(page);
    assert.equal(rows.length, 2);
    assert.match(rows[0], /^1\.\s*Anna\s*28 Zahlen/);
    assert.match(rows[1], /^2\.\s*Bea\s*15 Zahlen/);

    // Escape schliesst zuerst die Bestenliste, nicht das Spiel.
    await page.press('Escape');
    await page.wait(150);
    assert.equal(await page.evaluate(hidden('#card-intro')), false, 'zurueck zur Startkarte');
    assert.equal(await page.evaluate(hidden('#card-scores')), true);

    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('eine leere Liste sagt das, statt leer zu bleiben', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await page.click('#chip-scores-intro');
    await page.wait(150);
    assert.match(await page.evaluate(text('#score-list')), /Noch nichts eingetragen/);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('der globale Reiter malt die Serverzeilen', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await stubFetch(page, [
      { name: 'Cem', levels: 9, found: 40, mistakes: 2, created_at: '2026-09-10T08:00:00Z' },
      { name: '', levels: 3, found: 10, mistakes: 0, created_at: null },
    ]);
    await page.click('#chip-scores-intro');
    await page.wait(150);
    await page.click('#tab-global');
    await page.wait(300);

    const rows = await rowTexts(page);
    assert.match(rows[0], /^1\.\s*Cem\s*40 Zahlen/);
    // Ein leerer Name bleibt leer gespeichert; den Platzhalter setzt erst die Anzeige.
    assert.match(rows[1], /Ohne Namen/);
    assert.equal(await page.evaluate(`document.getElementById('tab-global').getAttribute('aria-selected')`), 'true');

    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('ist der Server nicht erreichbar, sagt der Reiter das und die Karte bleibt heil', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await seed(page, [lauf('Anna', 28, 7)]);
    await breakFetch(page);

    await page.click('#chip-scores-intro');
    await page.wait(150);
    await page.click('#tab-global');
    await page.wait(400);

    assert.match(await page.evaluate(text('#score-list')), /nicht erreichbar/);

    // Zurueck auf den lokalen Reiter: Die Liste vom Geraet ist unberuehrt da.
    await page.click('#tab-local');
    await page.wait(150);
    assert.equal((await rowTexts(page)).length, 1);

    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('die Reiterzeile passt auf 320 px', { skip: missing }, async () => {
  // Die schmalste Stelle der Karte: zwei Reiter nebeneinander. Gemessen wird am
  // Element, nicht an der Seite – `overflow-x: hidden` am Body wuerde ein
  // Ueberlaufen sonst still verschlucken.
  const page = await openGame('/index.html', { width: 320, height: 720 });
  try {
    // Der schlimmste Fall in einer Zeile: 20 Zeichen Name (mehr laesst der
    // Server nicht zu) neben vierstelligen Zahlen.
    await seed(page, [lauf('Maximilian Kastanie', 1234, 321), lauf('Bea', 15, 4)]);
    await page.click('#chip-scores-intro');
    await page.wait(200);

    const masse = await page.evaluate(`(() => {
      const tabs = document.querySelector('.tabs');
      const card = document.getElementById('card-scores');
      const row = document.querySelector('#score-list .score-row');
      const val = row.querySelector('.score-val');
      const name = row.querySelector('.score-name');
      return {
        tabsOverflow: tabs.scrollWidth - tabs.clientWidth,
        cardOverflow: card.scrollWidth - card.clientWidth,
        cardRight: card.getBoundingClientRect().right,
        viewport: window.innerWidth,
        rowOverflow: row.scrollWidth - row.clientWidth,
        // Der Wert rechts darf nicht umbrechen und nicht unter den Namen rutschen.
        valLines: Math.round(val.getBoundingClientRect().height / parseFloat(getComputedStyle(val).lineHeight)),
        nameRight: name.getBoundingClientRect().right,
        valLeft: val.getBoundingClientRect().left,
      };
    })()`);

    assert.ok(masse.tabsOverflow <= 1, `Reiterzeile laeuft um ${masse.tabsOverflow} px ueber`);
    assert.ok(masse.cardOverflow <= 1, `Karte laeuft um ${masse.cardOverflow} px ueber`);
    assert.ok(masse.cardRight <= masse.viewport, 'die Karte steht ueber dem rechten Rand');
    assert.ok(masse.rowOverflow <= 1, `die Zeile laeuft um ${masse.rowOverflow} px ueber`);
    assert.equal(masse.valLines, 1, 'der Wert rechts bricht um');
    assert.ok(masse.nameRight <= masse.valLeft, 'Name und Wert ueberlappen');

    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('die Endkarte bleibt mit Eintragen-Zeile auf 320 px im Bild', { skip: missing }, async () => {
  // Ein Eingabefeld bringt eine Wunschbreite von rund 20 Zeichen mit. Die
  // Karte hat sich daran schon einmal aufgehaengt und stand ueber dem rechten
  // Rand - deshalb wird hier am Element gemessen: `overflow-x: hidden` am Body
  // wuerde genau das still verschlucken.
  const page = await openGame('/index.html?zeit=5', { width: 320, height: 720 });
  try {
    await page.click('#btn-start');
    await page.wait(300);
    const erste = await page.evaluate(`[...document.querySelectorAll('#board .tile')]
      .find((t) => Number(t.textContent) === 1).dataset.cell`);
    await page.click('#action');
    await page.wait(250);
    await page.click(`#board .tile[data-cell="${erste}"]`);
    await page.wait(5200);

    const masse = await page.evaluate(`(() => {
      const card = document.getElementById('card-over');
      const entry = document.getElementById('entry');
      const feld = document.getElementById('entry-name');
      const knopf = document.getElementById('entry-submit');
      const r = card.getBoundingClientRect();
      return {
        left: +r.left.toFixed(1),
        right: +r.right.toFixed(1),
        viewport: window.innerWidth,
        entryOverflow: entry.scrollWidth - entry.clientWidth,
        feldBreite: +feld.getBoundingClientRect().width.toFixed(1),
        knopfRechts: +knopf.getBoundingClientRect().right.toFixed(1),
        entryRechts: +entry.getBoundingClientRect().right.toFixed(1),
      };
    })()`);

    assert.ok(masse.left >= 0, `die Karte beginnt bei ${masse.left} px`);
    assert.ok(masse.right <= masse.viewport, `die Karte endet bei ${masse.right} px von ${masse.viewport} px`);
    assert.ok(masse.entryOverflow <= 1, `die Eintragen-Zeile laeuft um ${masse.entryOverflow} px ueber`);
    assert.ok(masse.feldBreite >= 100, `das Namensfeld ist mit ${masse.feldBreite} px zu schmal`);
    assert.ok(masse.knopfRechts <= masse.entryRechts + 1, 'der Knopf steht ueber der Zeile hinaus');

    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('ein Uebungslauf sagt, dass er nicht zaehlt – und Tippen startet kein neues Spiel', { skip: missing }, async () => {
  // ?zeit=5 kuerzt den Durchlauf ab. Genau solche Laeufe duerfen nicht in die
  // Bestenliste: Sie sind zum Ausprobieren da.
  const page = await openGame('/index.html?zeit=5');
  try {
    await page.click('#btn-start');
    await page.wait(300);

    const erste = await page.evaluate(`[...document.querySelectorAll('#board .tile')]
      .find((t) => Number(t.textContent) === 1).dataset.cell`);
    await page.click('#action');
    await page.wait(300);
    await page.click(`#board .tile[data-cell="${erste}"]`);

    await page.wait(5200); // die Uhr laeuft ab
    assert.equal(await page.evaluate(hidden('#card-over')), false, 'die Endkarte muss da sein');
    assert.equal(await page.evaluate(text('#stat-found')), '1');
    assert.match(await page.evaluate(text('#entry-status')), /Übungslauf/);
    assert.equal(await page.evaluate(`document.getElementById('entry-submit').disabled`), true);
    assert.equal(await page.evaluate(hidden('#rank-line')), true, 'ohne Wertung auch keine Platzvorschau');

    // "n" startet sonst ein neues Spiel. Im Namensfeld darf es das nicht.
    await page.typeInto('#entry-name', 'Anne');
    await page.wait(200);
    assert.equal(await page.evaluate(`document.getElementById('entry-name').value`), 'Anne');
    assert.equal(await page.evaluate(hidden('#card-over')), false, 'das Spiel wurde neu gestartet');

    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

/**
 * Zwei Wege, auf denen ein fertiger Lauf verloren ging. Beide brauchen einen
 * Lauf, der wirklich zaehlt - und der dauert die volle Startzeit, weil eine
 * abgeschlossene Runde Zeit dazugeben wuerde. Deshalb steckt beides in einem
 * Test: einmal 30 Sekunden, zwei Befunde.
 */
test('ein fertiger Lauf ueberlebt das Schliessen der Seite und einen Neustart', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await page.click('#btn-start');
    await page.wait(400);
    const erste = await page.evaluate(`[...document.querySelectorAll('#board .tile')]
      .find((t) => Number(t.textContent) === 1).dataset.cell`);
    await page.click('#action');
    await page.wait(300);
    // Nur EINE Zahl: Eine fertige Runde brachte Bonuszeit und der Lauf liefe laenger.
    await page.click(`#board .tile[data-cell="${erste}"]`);
    await page.wait(31000);

    assert.equal(await page.evaluate(hidden('#card-over')), false, 'die Endkarte muss da sein');
    assert.equal(await page.evaluate(`document.getElementById('entry').hidden`), false,
      'dieser Lauf zaehlt, also gibt es die Eintragen-Zeile');
    assert.equal(await page.evaluate(`localStorage.getItem('ascending-numbers/scores/v1')`), null,
      'vor dem Eintragen steht der Lauf noch nicht in der Liste');

    // (1) Tab zu, ohne "Eintragen" zu druecken: Der Lauf muss trotzdem in der Liste landen.
    await page.typeInto('#entry-name', 'Ida');
    await page.evaluate(`(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); return true; })()`);
    await page.wait(200);

    const gespeichert = JSON.parse(
      await page.evaluate(`localStorage.getItem('ascending-numbers/scores/v1')`) ?? 'null');
    assert.ok(Array.isArray(gespeichert) && gespeichert.length === 1,
      'der Lauf muss beim Verschwinden der Seite gesichert werden');
    assert.equal(gespeichert[0].name, 'Ida', 'und zwar unter dem gerade getippten Namen');
    assert.equal(gespeichert[0].found, 1);

    // Die Karte lebt weiter: "Eintragen" muss danach noch funktionieren.
    assert.equal(await page.evaluate(`document.getElementById('entry-submit').disabled`), false);

    // (2) Eintragen, und mitten in der laufenden Anfrage ein neues Spiel starten.
    await page.evaluate(`(() => {
      window.fetch = () => new Promise((resolve) => setTimeout(() => resolve({
        ok: true, status: 200, json: () => Promise.resolve([{ rank: 1, total: 1 }]),
      }), 1500));
      return true;
    })()`);
    await page.click('#entry-submit');
    await page.wait(200);
    await page.click('#btn-again');     // raeumt `pending` weg, waehrend die Antwort unterwegs ist
    await page.wait(2500);              // Antwort trifft ein - auf einen Lauf, den es nicht mehr gibt

    assert.deepEqual(page.errors, [], 'die verspaetete Antwort darf nichts umwerfen');
    assert.equal(await page.evaluate(text('#level-pill')), 'Runde 1', 'das neue Spiel laeuft normal');
    // `hideSheet()` blendet die Lade aus, nicht die einzelne Karte - also hier messen.
    assert.equal(await page.evaluate(hidden('#sheet')), true, 'und die alte Endkarte ist weg');
  } finally {
    await page.close();
  }
});
