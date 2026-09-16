/**
 * English language pack – and the yardstick every other pack is measured
 * against (`I18N_FALLBACK` in js/i18n.js). What `index.html` ships as plain
 * markup is this pack's text, so a browser that never runs the script still
 * shows a complete page.
 *
 * Conventions shared by all packs:
 *
 *   - identical key sets, checked by `test/i18n.test.mjs` – a missing or an
 *     extra key is a failing test, not a review item;
 *   - a value is a string, or a function of ONE params object. Which of the two
 *     is also checked: a template silently turned into a plain string would
 *     swallow its parameters;
 *   - plural rules, ordinals and date formats belong to the pack that needs
 *     them. There is no shared plural engine and there should not be one;
 *   - emoji are not translated (🌐 reads the same everywhere).
 */

// English plural: only 1 is singular.
const enPlural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Dates are locale data, not translation: `Intl` owns the month name, the field
// order and the separators. Built once – a DateTimeFormat is not cheap, and the
// leaderboard builds up to 50 rows at a time.
const enDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const I18N_EN = {
  // ---------- meta ----------
  'lang.htmlLang': 'en',
  'meta.description':
    'Memorise where the numbers sit, then tap them in ascending order once they are covered.',

  // ---------- HUD ----------
  'hud.level': ({ n }) => `Round ${n}`,
  'hud.sound.title': 'Sound on/off',
  'hud.restart.title': 'New game (N)',
  'hud.restart.label': 'New game',
  'hud.quit.title': 'Quit game (Esc)',
  'hud.quit.label': 'Quit game',
  // The seconds a finished round earned. Shown even when it is 0, so the rule
  // behind the shrinking bonus stays visible.
  'hud.bonus': ({ seconds }) => `+${seconds}s`,
  'board.label': 'Game board',
  // Per tile, for screen readers: the position, and once it is revealed the
  // number on it. Counted from 1 – "cell 0" would be developer talk.
  'board.cell': ({ n }) => `Cell ${n}`,
  'board.cell.value': ({ n, value }) => `Cell ${n}: ${value}`,

  // ---------- the one button under the board ----------
  'action.hide': 'Cover up',

  // ---------- start card ----------
  'intro.lead':
    'Take in where the numbers are. Then they get covered – tap them in ascending order, starting at\u00a01.',
  // The five rules carry inline <b>, so they go in as data-i18n-html. That is
  // for OUR OWN pack values only – player names and leaderboard rows are always
  // textContent, never innerHTML.
  'intro.rule.time': '<b>30&nbsp;seconds</b> on the clock to start',
  'intro.rule.bonus': 'Every round you finish adds up to <b>4&nbsp;seconds</b>',
  'intro.rule.penalty': 'One mistake <b>per number</b> is free &ndash; guessing costs the bonus',
  'intro.rule.grow': 'Every second round adds <b>one more number</b>',
  'intro.rule.clock': 'The clock never runs backwards &ndash; so take your time',
  'intro.start': 'Start game',

  // ---------- chips ----------
  'chip.sound.on': 'Sound on',
  'chip.sound.off': 'Sound off',
  'chip.scores': 'Leaderboard',
  'chip.language': 'Language',
  'chip.language.auto': 'Automatic',

  // ---------- record line ----------
  'best.line': ({ levels, found }) =>
    `Record: <b>${enPlural(levels, 'round', 'rounds')}</b> &middot; <b>${enPlural(found, 'number', 'numbers')}</b>`,
  'best.none': 'No record yet &ndash; off you go.',

  // ---------- end card ----------
  'over.eyebrow': 'Time is up',
  'over.record': 'New record!',
  'over.done': ({ levels }) => `${enPlural(levels, 'round', 'rounds')} done`,
  'over.none': 'Not a single round',
  'over.stat.levels': 'Rounds',
  'over.stat.found': 'Numbers',
  'over.stat.mistakes': 'Mistakes',
  'over.again': 'Play again',

  // ---------- entering a result ----------
  'entry.name.placeholder': 'Your name',
  'entry.name.label': 'Your name for the leaderboard',
  'entry.submit': 'Submit',
  'entry.retry': 'Try again',
  'entry.rank': ({ rank, total }) => `Place ${rank} of ${total} on this device.`,
  'entry.rank.miss': ({ max }) => `Not in this device's top ${max} this time.`,
  'entry.status.practice': 'Practice run (?zeit / ?runde) – does not count for the leaderboard.',
  'entry.status.localOnly': 'Saved on this device.',
  'entry.status.sending': 'Sending …',
  'entry.status.retrying': ({ attempt, total }) => `No luck – attempt ${attempt} of ${total} …`,
  'entry.status.done': ({ rank, total }) => `Submitted: place ${rank} of ${total}.`,
  'entry.status.offline': 'Server unreachable. The run is saved on this device.',
  // The server said no. Its reason comes first, the reassurance second – in
  // that order, because the first half is the news.
  'entry.status.rejected': ({ text }) => `${text} The run is saved on this device.`,

  // ---------- what the server refused ----------
  'reject.rateLimited': 'Too many entries right now. Try again in a minute.',
  'reject.badCounters': 'The server considers these numbers impossible.',
  'reject.badMode': 'The server does not know this scoring mode.',
  'reject.missingId': 'The entry is missing its identifier.',
  'reject.other': ({ reason }) => `The server refused: “${reason}”.`,
  'reject.generic': 'The server refused the entry.',

  // ---------- leaderboard ----------
  'scores.title': 'Leaderboard',
  'scores.tablist': 'Choose leaderboard',
  // Die Reiterzeile ist auf 320 px die engste Zeile der App: zwei Reiter
  // nebeneinander, beide `white-space: nowrap`. "On this device" wurde hier
  // abgeschnitten - deshalb der kurze Name.
  'scores.tab.local': 'This device',
  'scores.tab.global': 'Global 🌐',
  'scores.close': 'Back',
  'scores.empty': 'Nothing submitted yet.',
  'scores.loading': 'Loading …',
  'scores.offline': 'The global list is unreachable right now. Everything is saved on this device.',
  'scores.anon': 'No name',
  /**
   * Everything in a row AFTER the bold number of found numbers, which main.js
   * puts in front of it. Rounds are abbreviated: the row has to fit a 20
   * character name on a 320px screen. Starts with a non-breaking space so the
   * noun can never wrap away from its number.
   */
  'scores.row.value': ({ found, levels }) =>
    `\u00a0${found === 1 ? 'number' : 'numbers'} · ${levels}\u00a0rds`,
  /** The row's tooltip. `date` may be '' – the server need not send one. */
  'scores.row.title': ({ levels, found, mistakes, date }) =>
    [
      enPlural(levels, 'round', 'rounds'),
      enPlural(found, 'number', 'numbers'),
      enPlural(mistakes, 'mistake', 'mistakes'),
      date,
    ].filter(Boolean).join(' · '),
  'scores.date': ({ at }) => enDate.format(new Date(at)),

  // ---------- pause ----------
  'pause.title': 'Paused',
  'pause.lead': 'The clock is standing still.',
  'pause.resume': 'Continue',
};
