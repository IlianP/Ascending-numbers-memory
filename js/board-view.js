/**
 * Alles, was das Raster im DOM betrifft.
 * Eingaben laufen über `pointerdown`, damit sich Tipps sofort anfühlen –
 * `click` feuert auf Touch-Geräten erst nach dem Loslassen.
 */
import { t } from './i18n.js';

export class BoardView {
  constructor(el, dotsEl, onTap) {
    this.el = el;
    this.dotsEl = dotsEl;
    this.tiles = [];
    this.timers = new Map();

    this.el.addEventListener('pointerdown', (event) => {
      const tile = event.target.closest('.tile');
      if (!tile || this.el.dataset.locked === '1') return;
      event.preventDefault();
      onTap(Number(tile.dataset.cell));
    });

    // Kontextmenü beim langen Drücken stört auf dem Handy nur.
    this.el.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /** Neues Raster aufbauen und die Zahlen offen zeigen (Vorschau). */
  render(board) {
    this.clearTimers();
    this.el.style.setProperty('--cols', board.cols);
    this.el.innerHTML = '';
    this.tiles = board.tiles.map((value, cell) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.cell = String(cell);
      tile.dataset.state = 'face';
      if (!value) tile.dataset.empty = '1';
      tile.setAttribute('role', 'gridcell');
      tile.setAttribute('aria-label', t('board.cell', { n: cell + 1 }));
      tile.innerHTML = `<span>${value || ''}</span>`;
      this.el.append(tile);
      return tile;
    });
    this.renderDots(board.count, 1);
    this.dotsEl.dataset.on = '0';
    this.unlock();
  }

  /** Vorschau beenden: alle Kacheln zudecken, leicht versetzt. */
  hideAll() {
    this.tiles.forEach((tile, i) => {
      tile.style.transitionDelay = `${Math.min(i * 22, 220)}ms`;
      tile.dataset.state = 'back';
      tile.querySelector('span').textContent = '';
      this.after(`delay-${i}`, 400, () => {
        tile.style.transitionDelay = '';
      });
    });
    this.dotsEl.dataset.on = '1';
  }

  /** Richtig getippt: Zahl dauerhaft zeigen. */
  reveal(cell, value) {
    const tile = this.tiles[cell];
    if (!tile) return;
    tile.querySelector('span').textContent = String(value);
    tile.dataset.state = 'face';
    tile.removeAttribute('data-empty');
    tile.setAttribute('aria-label', t('board.cell.value', { n: cell + 1, value }));
    this.pop(tile);
  }

  /**
   * Falsch getippt: Feld kurz aufblitzen lassen, dann wieder zudecken.
   *
   * Die Zahl des Feldes wird dabei bewusst NICHT gezeigt. Sie stand hier
   * einmal 380 ms lang offen da - und damit liess sich das Merkspiel komplett
   * umgehen: einmal quer ueber das Brett getippt, und die ganze Belegung war
   * bekannt. Rueckmeldung genug sind die graue Kachel, der Punkt oben rechts,
   * Ton und Vibration; welche Zahl dran ist, sagen die Fortschrittspunkte.
   */
  blunder(cell, ms) {
    const tile = this.tiles[cell];
    if (!tile) return;
    tile.dataset.state = 'wrong';
    this.after(`wrong-${cell}`, ms, () => {
      if (tile.dataset.state !== 'wrong') return;
      tile.dataset.state = 'back';
      tile.querySelector('span').textContent = '';
    });
  }

  /** Runde geschafft: kurzer Abgang für das ganze Raster. */
  celebrate() {
    this.lock();
    this.tiles.forEach((tile) => tile.classList.add('is-clear'));
  }

  renderDots(count, next) {
    this.dotsEl.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const dot = document.createElement('i');
      dot.toggleAttribute('data-done', i < next);
      dot.toggleAttribute('data-next', i === next);
      this.dotsEl.append(dot);
    }
  }

  updateDots(next) {
    [...this.dotsEl.children].forEach((dot, i) => {
      const n = i + 1;
      dot.toggleAttribute('data-done', n < next);
      dot.toggleAttribute('data-next', n === next);
    });
  }

  pop(tile) {
    tile.classList.remove('is-pop');
    void tile.offsetWidth; // Reflow erzwingen, sonst startet die Animation nicht neu
    tile.classList.add('is-pop');
  }

  lock() { this.el.dataset.locked = '1'; }
  unlock() { this.el.dataset.locked = '0'; }

  /** Timer gebündelt verwalten, damit ein Rundenwechsel nichts hinterherwirft. */
  after(key, ms, fn) {
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      fn();
    }, ms));
  }

  clearTimers() {
    this.timers.forEach((id) => clearTimeout(id));
    this.timers.clear();
  }
}
