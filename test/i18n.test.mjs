/**
 * Der Wächter über die Sprachpakete.
 *
 * Nichts hier beurteilt eine Übersetzung – das kann keine Maschine. Geprüft
 * wird alles, was sich mechanisch prüfen lässt, damit ein Paket nicht
 * unbemerkt verrottet: Eine Sprache, die erst beim spielenden Menschen auffällt,
 * ist zu spät aufgefallen.
 *
 *   1. jedes angebotene Kürzel hat ein Paket und jedes Paket wird angeboten,
 *   2. alle Pakete tragen genau die Schlüsselmenge der Rückfallsprache,
 *   3. ein Schlüssel ist überall ein String oder überall eine Funktion – eine
 *      still zum String gewordene Vorlage würde ihre Parameter verschlucken,
 *   4. jede Funktion läuft und liefert einen nicht-leeren String,
 *   5. eine Übersetzung benutzt jeden Parameter, den die Rückfallsprache
 *      benutzt (ein fallengelassener Rang macht aus "Platz 3 von 12" ein
 *      "Platz von 12", ohne dass irgendetwas kaputtgeht),
 *   6. jeder aus index.html verwiesene Schlüssel existiert,
 *   7. jeder wörtliche `t('…')`-Aufruf in js/ existiert,
 *   8. und umgekehrt: kein Schlüssel steht ungenutzt herum.
 *
 * Prüfung 8 ist die, die ohne Pflegeliste auskommt. Viele Schlüssel erreichen
 * `t()` nicht wörtlich, sondern über eine Variable (`setEntryStatus`,
 * `REJECTIONS`, der gemerkte Knopf-Schlüssel). Statt zu raten, was nach einem
 * Schlüssel *aussieht*, wird verglichen, welche Zeichenketten in js/ einem
 * bekannten Schlüssel *gleichen*. Das ist exakt, braucht keine Ausnahmeliste –
 * und meldet beim Umbenennen genau die Stelle, die niemand mitgezogen hat.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { I18N_PACKS, I18N_FALLBACK, I18N_LANGUAGES, resolveLanguage, t, setLanguage } from '../js/i18n.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const fallback = I18N_PACKS[I18N_FALLBACK];
const fallbackKeys = Object.keys(fallback);
const codes = Object.keys(I18N_PACKS);

/**
 * Welche Parameter eine Vorlage liest: Sie wird mit einem Proxy aufgerufen, der
 * jeden Zugriff notiert. Vorlagen setzen nur Text zusammen, mehr passiert dort
 * nicht.
 */
function paramsUsedBy(fn) {
  const used = new Set();
  const probe = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      used.add(prop);
      // Eine Zahl passt sowohl in eine Rechnung als auch in einen Satz.
      return 1;
    },
  });
  return { used, out: fn(probe) };
}

/** Alle ausgelieferten js-Dateien AUSSER den Paketen selbst. */
function appSources() {
  const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'i18n') return []; // die Pakete enthalten naturgemäß jeden Schlüssel
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : path.endsWith('.js') ? [path] : [];
  });
  return walk('js').map((path) => readFileSync(join(ROOT, path), 'utf8'));
}

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** Schlüssel, auf die index.html über data-i18n, -html oder -attr verweist. */
function htmlKeys() {
  const keys = new Set();
  for (const m of html.matchAll(/\sdata-i18n(?:-html)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of html.matchAll(/\sdata-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split('|')) {
      const sep = pair.indexOf(':');
      if (sep >= 0) keys.add(pair.slice(sep + 1).trim());
    }
  }
  return keys;
}

test('jede angebotene Sprache hat ein Paket – und jedes Paket wird angeboten', () => {
  for (const { code, name } of I18N_LANGUAGES) {
    assert.ok(I18N_PACKS[code], `${code} steht im Auswahlfeld, hat aber kein Paket`);
    assert.ok(name.trim(), `${code} hat keinen Namen im Auswahlfeld`);
  }
  for (const code of codes) {
    assert.ok(I18N_LANGUAGES.some((l) => l.code === code),
      `Das Paket ${code} ist über das Auswahlfeld nicht erreichbar`);
  }
  assert.ok(fallback, `Die Rückfallsprache ${I18N_FALLBACK} hat kein Paket`);
});

test('alle Pakete tragen dieselben Schlüssel, in derselben Form', () => {
  for (const code of codes) {
    if (code === I18N_FALLBACK) continue;
    const pack = I18N_PACKS[code];

    for (const key of fallbackKeys) {
      assert.ok(key in pack, `[${code}] fehlt "${key}"`);
      const want = typeof fallback[key];
      const got = typeof pack[key];
      assert.equal(got, want, `[${code}] "${key}" ist ${got}, in ${I18N_FALLBACK} aber ${want}`);
    }

    for (const key of Object.keys(pack)) {
      assert.ok(key in fallback, `[${code}] hat "${key}", ${I18N_FALLBACK} aber nicht – Tippfehler oder Leiche`);
    }
  }
});

test('jeder Wert ergibt Text, und keine Vorlage verliert einen Parameter', () => {
  for (const code of codes) {
    const pack = I18N_PACKS[code];
    for (const key of fallbackKeys) {
      const value = pack[key];
      if (typeof value === 'string') {
        assert.ok(value.trim(), `[${code}] "${key}" ist leer`);
        continue;
      }
      const want = paramsUsedBy(fallback[key]);
      const got = paramsUsedBy(value);
      assert.equal(typeof got.out, 'string', `[${code}] "${key}" liefert keinen String`);
      assert.ok(got.out.trim(), `[${code}] "${key}" liefert leeren Text`);
      for (const param of want.used) {
        assert.ok(got.used.has(param),
          `[${code}] "${key}" benutzt den Parameter "${param}" nicht, den ${I18N_FALLBACK} benutzt`);
      }
    }
  }
});

test('index.html verweist nur auf Schlüssel, die es gibt', () => {
  const keys = htmlKeys();
  assert.ok(keys.size > 0, 'index.html verweist auf gar keinen Schlüssel – hat sich das Markup geändert?');
  for (const key of keys) {
    assert.ok(key in fallback, `index.html benutzt "${key}", das kein Paket kennt`);
  }
});

test('jeder wörtliche t()-Aufruf in js/ trifft einen Schlüssel', () => {
  for (const source of appSources()) {
    for (const m of source.matchAll(/\bt\(\s*'([a-z][\w.]*)'/g)) {
      assert.ok(m[1] in fallback, `js/ ruft t('${m[1]}') auf, das kein Paket kennt`);
    }
  }
});

test('kein Schlüssel steht ungenutzt herum', () => {
  const used = htmlKeys();
  for (const source of appSources()) {
    for (const m of source.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"/g)) {
      const literal = m[1] ?? m[2];
      if (literal in fallback) used.add(literal);
    }
  }
  const dead = fallbackKeys.filter((key) => !used.has(key));
  assert.deepEqual(dead, [], `Diese Schlüssel benutzt niemand mehr: ${dead.join(', ')}`);
});

test('die Sprachwahl: ausdrücklich schlägt Browser schlägt Englisch', () => {
  assert.equal(resolveLanguage('fr', ['de-DE', 'de']), 'fr', 'die ausdrückliche Wahl gewinnt');
  assert.equal(resolveLanguage('', ['de-AT', 'en']), 'de', 'sonst die erste passende Browsersprache');
  assert.equal(resolveLanguage('', ['DE_at']), 'de', 'Schreibweise und Region sind egal');
  assert.equal(resolveLanguage('', ['is', 'sv']), I18N_FALLBACK, 'sonst die Rückfallsprache');
  assert.equal(resolveLanguage('kl', ['is']), I18N_FALLBACK, 'eine Sprache ohne Paket ist keine Wahl');
  assert.equal(resolveLanguage(undefined, undefined), I18N_FALLBACK, 'auch ohne alles kommt Text heraus');
});

test('ein unbekannter Schlüssel verschwindet nicht still', () => {
  setLanguage('de');
  // Sichtbar statt leer: Wer den Schlüssel auf dem Bildschirm sieht, meldet ihn.
  assert.equal(t('gibt.es.nicht'), 'gibt.es.nicht');
  // Und eine Lücke in einem Paket fällt auf die Rückfallsprache zurück, statt
  // die Seite umzulegen.
  assert.equal(typeof t('scores.title'), 'string');
  setLanguage(I18N_FALLBACK);
});
