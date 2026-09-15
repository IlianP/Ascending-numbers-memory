/**
 * Erzeugt die Runden: Rastergröße, Zahlenmenge und Positionen.
 * Bewusst frei von DOM und Zufall-Globals, damit es testbar bleibt.
 */

/** Wie viele Zahlen und wie groß das Raster in Runde `level` ist. */
export function levelSpec(level, { baseCount, growEvery }) {
  const wanted = baseCount + Math.floor((level - 1) / growEvery);
  const cols = wanted <= 9 ? 3 : wanted <= 16 ? 4 : 5;
  return { cols, count: Math.min(wanted, cols * cols) };
}

/** Fisher-Yates, mit injizierbarer Zufallsquelle. */
export function shuffle(items, rng = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Baut ein Spielfeld für eine Runde.
 * `tiles[i]` ist die Zahl auf Feld i, oder 0 für ein leeres Feld.
 */
export function createBoard(level, config, rng = Math.random) {
  const { cols, count } = levelSpec(level, config);
  const cells = cols * cols;
  const tiles = new Array(cells).fill(0);
  const picked = shuffle([...Array(cells).keys()], rng).slice(0, count);

  picked.forEach((cell, i) => {
    tiles[cell] = i + 1;
  });

  return { level, cols, count, tiles };
}
