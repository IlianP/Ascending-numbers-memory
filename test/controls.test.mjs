import test from 'node:test';
import assert from 'node:assert/strict';

import { findBrowser, openGame } from './helpers/browser.mjs';

/**
 * Bedienung, die es vor dem Start und mitten im Spiel geben muss: den Ton
 * umschalten, ohne erst eine Runde zu starten, und ein neues Spiel beginnen,
 * ohne das Ende der Uhr abzuwarten.
 */

const missing = findBrowser() ? false : 'kein Chrome gefunden (CHROME_PATH setzen)';

const text = (selector) => `document.querySelector(${JSON.stringify(selector)}).textContent.trim()`;
const pressed = (selector) => `document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-pressed')`;

test('Ton laesst sich vor dem Spiel umschalten und bleibt gespeichert', { skip: missing }, async () => {
  const page = await openGame();
  try {
    assert.equal(await page.evaluate(pressed('#chip-sound-intro')), 'true');
    assert.equal(await page.evaluate(text('#chip-sound-intro .chip__label')), 'Ton an');

    await page.click('#chip-sound-intro');
    await page.wait(150);

    assert.equal(await page.evaluate(pressed('#chip-sound-intro')), 'false');
    assert.equal(await page.evaluate(text('#chip-sound-intro .chip__label')), 'Ton aus');
    // Der Schalter im Spiel zeigt denselben Zustand.
    assert.equal(await page.evaluate(pressed('#btn-sound')), 'false');
    assert.equal(
      await page.evaluate(`JSON.parse(localStorage.getItem('ascending-numbers/v1')).sound`),
      false,
      'die Einstellung muss den Neustart ueberleben',
    );

    await page.click('#chip-sound-intro');
    await page.wait(150);
    assert.equal(await page.evaluate(pressed('#btn-sound')), 'true');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('Neues Spiel startet sofort, ohne auf die Uhr zu warten', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await page.click('#btn-start');
    await page.wait(400);

    // Eine Runde abschliessen, damit der Neustart etwas zurueckzusetzen hat.
    const reihenfolge = await page.evaluate(`[...document.querySelectorAll('#board .tile')]
      .map((t) => ({ cell: t.dataset.cell, value: Number(t.textContent) }))
      .filter((t) => t.value > 0)
      .sort((a, b) => a.value - b.value)
      .map((t) => t.cell)`);
    await page.click('#action');
    await page.wait(400);
    for (const cell of reihenfolge) await page.click(`#board .tile[data-cell="${cell}"]`);
    await page.wait(800);

    assert.equal(await page.evaluate(text('#level-pill')), 'Runde 2');

    await page.click('#btn-restart');
    await page.wait(300);

    assert.equal(await page.evaluate(text('#level-pill')), 'Runde 1', 'Neustart beginnt wieder bei Runde 1');
    assert.equal(await page.evaluate(text('#clock')), '00:30', 'die Uhr faengt von vorn an');
    assert.equal(await page.evaluate(text('#action')), 'Verdecken', 'die neue Runde wartet auf das Verdecken');
    assert.equal(await page.evaluate(`document.getElementById('sheet').hidden`), true, 'keine Karte im Weg');

    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});

test('Taste N startet ein neues Spiel', { skip: missing }, async () => {
  const page = await openGame();
  try {
    await page.click('#btn-start');
    await page.wait(400);
    await page.click('#action');
    await page.wait(400);

    await page.press('n');
    await page.wait(300);

    assert.equal(await page.evaluate(text('#level-pill')), 'Runde 1');
    assert.equal(await page.evaluate(text('#action')), 'Verdecken');
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});
