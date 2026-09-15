/**
 * Winziger Browser-Treiber fürs Testen echter Layouts – ohne Abhängigkeiten.
 *
 * Warum kein Playwright: Das Projekt kommt ohne `npm install` aus, und genau das
 * soll auch für die Tests gelten. Node 22 bringt einen `WebSocket` mit, Chrome
 * bringt das DevTools-Protokoll mit – mehr braucht es nicht, um eine Seite zu
 * öffnen, darauf zu klicken und Positionen zu messen.
 *
 * Gesucht wird ein Chrome/Chromium in dieser Reihenfolge: `CHROME_PATH`, dann
 * die üblichen Pfade. Findet sich keiner, meldet `findBrowser()` das mit `null`,
 * und die Tests überspringen sich selbst statt falschen Alarm zu schlagen.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

/** Pfad zu einem nutzbaren Browser oder `null`. */
export function findBrowser() {
  for (const path of CANDIDATES) {
    if (path && existsSync(path)) return path;
  }
  // Ein von Playwright installiertes Chromium liegt unter wechselnder Versionsnummer.
  const pw = '/opt/pw-browsers';
  if (existsSync(pw)) {
    for (const dir of ['chromium', 'chromium-1194']) {
      const guess = join(pw, dir, 'chrome-linux', 'chrome');
      if (existsSync(guess)) return guess;
    }
  }
  return null;
}

/** Statischer Server auf dem Projektverzeichnis; liefert die Basis-URL. */
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('nicht gefunden');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

/** Auf die DevTools-Adresse warten, die Chrome beim Start auf stderr schreibt. */
function devtoolsUrl(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Chrome meldete keine DevTools-Adresse:\n${output}`)), 20_000);
    child.stderr.on('data', (chunk) => {
      output += chunk;
      const hit = output.match(/ws:\/\/[^\s]+/);
      if (!hit) return;
      clearTimeout(timer);
      resolve(hit[0]);
    });
    child.once('error', reject);
  });
}

/**
 * Browser starten, Seite öffnen und einen kleinen Werkzeugkasten zurückgeben.
 * `viewport` ist absichtlich Handy-Format – das Spiel wird mit dem Daumen gespielt.
 */
export async function openGame(path = '/index.html', viewport = { width: 390, height: 780 }) {
  const executable = findBrowser();
  if (!executable) throw new Error('kein Chrome gefunden');

  const { server, base } = await serve();
  const profile = await mkdtemp(join(tmpdir(), 'ascending-'));
  const child = spawn(executable, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--force-device-scale-factor=1',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const socket = new WebSocket(await devtoolsUrl(child));
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const errors = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      return;
    }
    // Konsolenfehler und unbehandelte Ausnahmen sammeln.
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description ?? 'Ausnahme');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: true,
  });

  /** JavaScript auf der Seite ausführen und das Ergebnis zurückholen. */
  async function evaluate(expression) {
    const { result, exceptionDetails } = await call('Runtime.evaluate', {
      expression: `(() => { return (${expression}); })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'Fehler in evaluate');
    return result.value;
  }

  const loaded = new Promise((resolve) => {
    const onLoad = (event) => {
      if (JSON.parse(event.data).method === 'Page.loadEventFired') {
        socket.removeEventListener('message', onLoad);
        resolve();
      }
    };
    socket.addEventListener('message', onLoad);
  });
  await call('Page.navigate', { url: base + path });
  await loaded;

  /** Rechteck eines Elements, auf zwei Nachkommastellen gerundet. */
  const rect = (selector) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('kein Element: ' + ${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    return { top: +r.top.toFixed(2), left: +r.left.toFixed(2),
             width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
  })()`);

  /**
   * Echter Mausklick auf die Mitte des Elements. Handgebaute Events wuerden
   * nicht reichen: Das Spielfeld haengt an `pointerdown`.
   */
  async function click(selector) {
    const box = await rect(selector);
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: 1 });
    }
  }

  /**
   * Tastendruck auf die Seite - fuer die Kuerzel (Leertaste, Esc, N) und zum
   * Tippen in ein Eingabefeld.
   *
   * `text` darf nur bei druckbaren Zeichen mitgeschickt werden: Chrome weist
   * einen Tastendruck mit `text: 'Escape'` als ungueltig zurueck.
   */
  const NAMED_KEYS = { Escape: 27, Enter: 13, Tab: 9, Backspace: 8 };

  async function press(key) {
    const common = NAMED_KEYS[key] !== undefined
      ? { key, code: key, windowsVirtualKeyCode: NAMED_KEYS[key] }
      : {
          key,
          code: key === ' ' ? 'Space' : /^[0-9]$/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`,
          text: key,
          windowsVirtualKeyCode: key === ' ' ? 32 : key.toUpperCase().charCodeAt(0),
        };
    await call('Input.dispatchKeyEvent', { type: 'keyDown', ...common });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
  }

  /**
   * Text in ein Eingabefeld tippen - als echte Tastendruecke, nicht per
   * `value =`. Nur so laeuft der Text durch dieselben Tastatur-Kuerzel wie beim
   * Spielen, und genau das soll geprueft werden.
   */
  async function typeInto(selector, text) {
    await click(selector);
    for (const char of text) await press(char);
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function close() {
    socket.close();
    child.kill();
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  return { evaluate, rect, click, press, typeInto, wait, errors, close };
}
