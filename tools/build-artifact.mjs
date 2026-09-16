/**
 * Den aktuellen Stand zu EINER eigenständigen HTML-Datei zusammenbauen – zum
 * Ausprobieren auf dem Telefon, bevor ein Pull Request aufgemacht wird.
 *
 *   node tools/build-artifact.mjs [ziel.html]     # Standard: ascending-numbers.html
 *
 * Das Ergebnis lässt sich als Artifact veröffentlichen und dann auf dem Handy
 * öffnen. Das ist der Punkt: Dieses Spiel wird mit dem Daumen gespielt, und der
 * Sprachwähler ist auf dem Telefon ein Rad, nicht ein Klappmenü – das sieht man
 * auf keinem Entwicklungsrechner.
 *
 * ## Warum überhaupt ein Bündel
 *
 * Die App besteht aus echten ES-Modulen und lädt CSS, Sprachpakete und einen
 * Service Worker nach. Eine Artifact-Seite darf unter ihrer CSP **nichts**
 * nachladen. Also werden die Quellen in Abhängigkeitsreihenfolge
 * aneinandergehängt und zu einem klassischen Skript gemacht.
 *
 * ## Was das Bündel NICHT ist
 *
 * Kein Ersatz für die echte Seite und kein Teil der Auslieferung. Es fehlt der
 * Service Worker (also der Offline-Betrieb), und die globale Bestenliste ist
 * tot, weil die CSP den Netzzugriff blockt – sie fällt still auf die Liste im
 * Gerät zurück, genau wie ohne Netz. `.github/workflows/pages.yml` liefert
 * weiterhin die echten Dateien aus; `tools/` ist nicht dabei.
 *
 * ## Drei Dinge, die ein klassisches Skript anders macht
 *
 * 1. **Ein Namensraum statt vieler.** `storage.js` und `scores.js` nennen ihren
 *    Speicherschlüssel beide `KEY` – in Modulen völlig in Ordnung, hier ein
 *    doppelter `const`. `deconflict` benennt solche Kollisionen um, statt den
 *    Quellen eine Bündel-Regel aufzuzwingen, die im Browser niemanden
 *    interessiert.
 * 2. **`import * as fx` verschwindet, `fx` nicht.** Der Namensraum wird aus den
 *    Exporten der Datei nachgebaut.
 * 3. **Die Reihenfolge ist nicht beliebig.** Die Sprachpakete müssen VOR
 *    `js/i18n.js` stehen: Das baut `I18N_PACKS` in einem `const` auf oberster
 *    Ebene, und eine spätere Deklaration läge in der temporalen Todeszone.
 *
 * Alle Annahmen sind als `throw` festgehalten. Wenn hier etwas umbenannt wird,
 * scheitert der Bau – statt still ein Bündel auszuliefern, das anders aussieht
 * als die Seite. `test/build-artifact.test.mjs` lässt ihn deshalb in CI laufen.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Abhängigkeitsreihenfolge. Die Pakete vor js/i18n.js – siehe Kopf. */
const ORDER = [
  'js/config.js', 'js/storage.js', 'js/scores.js', 'js/leaderboard.js',
  'js/i18n/en.js', 'js/i18n/de.js', 'js/i18n/fr.js', 'js/i18n/es.js', 'js/i18n.js',
  'js/level.js', 'js/game.js', 'js/board-view.js', 'js/feedback.js', 'js/main.js',
];

const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/** `import`/`export` entfernen – und darauf bestehen, dass keines überlebt. */
function strip(src) {
  const out = src
    .replace(/^import\s+[\s\S]*?from\s+'[^']+';\s*$/gm, '')
    .replace(/^import\s+'[^']+';\s*$/gm, '')
    .replace(/^export\s+(?=(const|let|var|function|class|async))/gm, '');
  if (/^\s*(import|export)\s/m.test(out)) {
    throw new Error('ein import/export hat das Strippen überlebt – mehrzeilige Form?');
  }
  return out;
}

/** Namen, die zweimal auf oberster Ebene stehen, pro Datei umbenennen. */
function makeDeconflicter() {
  const seen = new Map();
  return (src, file) => {
    const tag = file.replace(/[^a-z]/gi, '_');
    for (const [, name] of src.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (!seen.has(name)) { seen.set(name, file); continue; }
      if (seen.get(name) === file) continue;
      src = src.replace(new RegExp(`\\b${name}\\b`, 'g'), `${name}__${tag}`);
    }
    return src;
  };
}

/** Für jedes `import * as NS from './datei.js'`: `const NS = { …Exporte };`. */
function namespaceShim(src, file, allSources) {
  const shims = [];
  for (const [, ns, target] of allSources.matchAll(/import\s+\*\s+as\s+([\w$]+)\s+from\s+'\.\/([^']+)'/g)) {
    if (`js/${target}` !== file) continue;
    const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/gm)]
      .map((m) => m[1]);
    if (!names.length) throw new Error(`${file} exportiert nichts, was ${ns} füllen könnte`);
    shims.push(`const ${ns} = { ${names.join(', ')} };`);
  }
  return shims.join('\n');
}

export function buildArtifact() {
  const sources = new Map(ORDER.map((file) => [file, read(file)]));
  const allSources = [...sources.values()].join('\n');
  const deconflict = makeDeconflicter();

  const js = ORDER.map((file) => {
    const raw = sources.get(file);
    return [
      `/* ===== ${file} ===== */`,
      deconflict(strip(raw), file),
      namespaceShim(raw, file, allSources),
    ].join('\n');
  }).join('\n');

  const css = read('css/style.css');
  const html = read('index.html');

  // Nur der Rumpf: Eine Artifact-Seite bringt ihr eigenes <head> mit.
  const body = html.match(/<body>([\s\S]*?)<script/)?.[1];
  if (!body) throw new Error('der <body> von index.html liess sich nicht herausschneiden');
  if (!/data-i18n/.test(body)) throw new Error('die i18n-Haken fehlen im Rumpf');
  // Ohne diese Sperre bliebe die App unsichtbar – im Bündel gäbe es eine leere Seite.
  if (!/data-i18n-ready/.test(css)) throw new Error('die CSS-Sperre fuer data-i18n-ready fehlt');

  /*
   * Hell und Dunkel kommen aus `prefers-color-scheme`. In der Artifact-Vorschau
   * kann der Betrachter das Thema aber ausdrücklich stempeln (`data-theme`), und
   * ein Stempel muss die Systemeinstellung schlagen. Beide Token-Sätze werden
   * deshalb aus dem echten Stylesheet GELESEN und unter den gestempelten
   * Auswahlen wiederholt – gelesen statt abgeschrieben, damit die Vorschau nicht
   * mit einer Farbe stehenbleibt, die es längst nicht mehr gibt.
   */
  const light = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1];
  const dark = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n  \}/)?.[1];
  if (!light?.includes('--bg:') || !dark?.includes('--bg:')) {
    throw new Error('die Farbtoken liessen sich nicht aus dem Stylesheet lesen');
  }

  return `<title>Ascending Numbers</title>
<style>
${css}

/* ===== nur fuer die Artifact-Vorschau: gestempeltes Thema schlaegt das System ===== */
:root[data-theme="light"] {${light}
}
:root[data-theme="dark"] {${dark}
}
</style>
${body}
<script>
${js}
<\/script>
`;
}

// Direkt aufgerufen? Dann bauen und schreiben. Importiert (Test)? Dann nicht.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const target = process.argv[2] ?? 'ascending-numbers.html';
  writeFileSync(target, buildArtifact());
  console.log(`gebaut: ${target}`);
}
