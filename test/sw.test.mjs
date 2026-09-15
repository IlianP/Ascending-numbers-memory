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

/** Alle Dateien, die im Browser wirklich geladen werden. */
function shippedFiles() {
  const inDir = (dir) => readdirSync(new URL(dir, `file://${root}`)).map((name) => `${dir}${name}`);
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
