/**
 * Ton und Vibration. Beides ist Beiwerk: schlägt etwas fehl,
 * läuft das Spiel unverändert weiter.
 */
const TONES = {
  correct: [660, 0.06],
  level:   [880, 0.16],
  wrong:   [150, 0.18],
  over:    [220, 0.5],
};

let ctx = null;
let enabled = true;

export function setEnabled(on) {
  enabled = on;
}

/** Muss aus einer Nutzergeste heraus laufen, sonst bleibt der Context suspended. */
export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
}

export function play(name) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const tone = TONES[name];
  if (!tone) return;

  const [freq, dur] = tone;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = name === 'wrong' ? 'sawtooth' : 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (name === 'level') osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t0 + dur);
  if (name === 'over') osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t0 + dur);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(name === 'wrong' ? 0.12 : 0.2, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const PATTERNS = {
  correct: 8,
  level: [0, 18, 40, 24],
  wrong: 45,
  over: [0, 60, 60, 60],
};

export function buzz(name) {
  if (!enabled || !navigator.vibrate) return;
  const pattern = PATTERNS[name];
  if (pattern === undefined) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* manche Browser mögen das nur nach Interaktion */
  }
}

/** Ton + Vibration in einem Rutsch. */
export function cue(name) {
  play(name);
  buzz(name);
}
