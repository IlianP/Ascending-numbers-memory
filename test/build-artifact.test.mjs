/**
 * Der Bündel-Bau aus `tools/build-artifact.mjs`.
 *
 * Er liefert nichts aus – er baut nur die Datei, mit der ein Zweig vor dem Pull
 * Request auf dem Telefon ausprobiert wird. Genau deshalb steht er hier: Ein
 * Werkzeug, das man alle paar Wochen einmal braucht, ist kaputt, wenn man es
 * braucht. Der Bau selbst besteht aus Annahmen über die Quellen (Reihenfolge,
 * Namen, Haken im Markup), und jede davon endet im Bau als `throw`. Dieser Test
 * ist bloss der Auslöser – er lässt den Bau in CI laufen und sieht nach, dass
 * dabei wirklich etwas Lauffähiges herauskommt.
 *
 * Was hier NICHT geprüft wird: wie das Bündel aussieht. Dafür gibt es keinen
 * Ersatz für einen Blick aufs Telefon.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArtifact } from '../tools/build-artifact.mjs';

const page = buildArtifact();

test('das Buendel bringt alles mit, was die Seite braucht', () => {
  assert.match(page, /^<title>Ascending Numbers<\/title>/, 'der Titel steht oben');
  assert.ok(page.includes('id="board"'), 'das Spielfeld fehlt');
  assert.ok(page.includes('id="lang-intro"'), 'der Sprachwaehler fehlt');
  assert.ok(page.includes('data-i18n-ready'), 'ohne die CSS-Sperre bliebe die Seite unsichtbar');

  // Alle vier Sprachen, nicht nur die gerade benutzte: Im Buendel laesst sich
  // nichts nachladen, also muessen sie drin sein.
  for (const marker of ['I18N_EN', 'I18N_DE', 'I18N_FR', 'I18N_ES']) {
    assert.ok(page.includes(marker), `${marker} fehlt im Buendel`);
  }

  // Eine Artifact-Seite bekommt ihr Geruest gestellt. Geprueft werden echte
  // Tags, nicht jede Erwaehnung: In den Kommentaren steht "<html>" als Wort.
  assert.ok(!/^\s*<!doctype/i.test(page), 'das Buendel faengt mit einer Doctype-Zeile an');
  for (const tag of ['<body>', '</body>', '<head>', '</html>']) {
    assert.ok(!page.includes(tag), `${tag} gehoert nicht ins Buendel - das Geruest kommt von aussen`);
  }
});

test('aus den Modulen ist ein gueltiges klassisches Skript geworden', () => {
  const script = page.match(/<script>([\s\S]*)<\/script>/)[1];

  assert.ok(!/^\s*(import|export)\s/m.test(script), 'ein import/export hat ueberlebt');
  assert.ok(!script.includes('import.meta'), 'import.meta gibt es in einem klassischen Skript nicht');

  // Der eigentliche Punkt: Das Ergebnis muss der Browser auch lesen koennen.
  // Ein doppelter `const` aus zwei Modulen faellt genau hier auf - und sonst
  // erst als leere Seite auf dem Telefon.
  assert.doesNotThrow(() => new Function(script), 'das zusammengebaute Skript parst nicht');
});

test('das gestempelte Thema schlaegt die Systemeinstellung', () => {
  // Die Vorschau laesst den Betrachter Hell oder Dunkel erzwingen. Beide
  // Token-Saetze werden aus dem echten Stylesheet gelesen, nicht abgeschrieben.
  for (const [stamp, pattern] of [
    ['hell', /:root\[data-theme="light"\]\s*\{([^}]*)\}/],
    ['dunkel', /:root\[data-theme="dark"\]\s*\{([^}]*)\}/],
  ]) {
    const block = page.match(pattern);
    assert.ok(block, `der gestempelte Satz "${stamp}" fehlt`);
    assert.match(block[1], /--bg:\s*#/, `"${stamp}" traegt keine Hintergrundfarbe`);
  }
});
