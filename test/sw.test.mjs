import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

/** Die ASSETS-Liste aus dem Service Worker, ohne ihn ausführen zu müssen. */
function precachedAssets() {
  const block = source.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(block, 'ASSETS-Liste nicht gefunden');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/**
 * Alle Dateien, die im Browser wirklich geladen werden.
 *
 * Absteigend, nicht nur die oberste Ebene: Seit den Sprachpaketen liegt unter
 * `js/` ein Ordner. Waere die Suche flach geblieben, haette sie `js/i18n` als
 * fehlende Datei gemeldet und `js/i18n/fr.js` ueberhaupt nie gesehen - also
 * genau die Datei, deren Fehlen im Cache eine franzoesische Oberflaeche
 * offline leer laesst.
 */
function shippedFiles() {
  const inDir = (dir) => readdirSync(new URL(dir, `file://${root}`), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? inDir(`${dir}${entry.name}/`) : [`${dir}${entry.name}`]));
  return ['index.html', 'manifest.webmanifest', ...inDir('css/'), ...inDir('js/'), ...inDir('icons/')];
}

test('Service Worker cached jede ausgelieferte Datei', () => {
  const assets = new Set(precachedAssets());
  for (const file of shippedFiles()) {
    assert.ok(assets.has(file), `${file} fehlt in der ASSETS-Liste von sw.js`);
  }
  assert.ok(assets.has('.'), 'Der Einstiegspfad "." fehlt in der ASSETS-Liste');
});

test('Service Worker cached nichts, was es nicht gibt', () => {
  const shipped = new Set([...shippedFiles(), '.']);
  for (const asset of precachedAssets()) {
    assert.ok(shipped.has(asset), `${asset} steht in sw.js, existiert aber nicht`);
  }
});

test('Cache-Name trägt die Version', () => {
  const version = source.match(/const VERSION = '([^']+)'/);
  assert.ok(version, 'VERSION nicht gefunden');
  assert.match(version[1], /^v\d+$/);
});
