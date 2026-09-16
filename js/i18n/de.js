/**
 * Deutsches Sprachpaket – die Sprache, in der das Spiel entstanden ist. Die
 * Formulierungen hier sind die ursprünglichen; sie sind der Maßstab dafür, ob
 * eine Übersetzung denselben Ton trifft.
 *
 * Die gemeinsamen Regeln aller Pakete stehen in `js/i18n/en.js`: gleiche
 * Schlüsselmenge, Werte sind Strings oder Funktionen eines Parameter-Objekts,
 * Plural und Datum gehören ins Paket, Emoji bleiben unübersetzt.
 */

// Deutscher Plural: nur die 1 ist Singular.
const dePlural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const deDate = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

export const I18N_DE = {
  // ---------- Meta ----------
  'lang.htmlLang': 'de',
  'meta.description':
    'Merke dir die Zahlen im Raster und tippe sie danach verdeckt in aufsteigender Reihenfolge an.',

  // ---------- Kopfleiste ----------
  'hud.level': ({ n }) => `Runde ${n}`,
  'hud.sound.title': 'Ton an/aus',
  'hud.restart.title': 'Neues Spiel (N)',
  'hud.restart.label': 'Neues Spiel',
  'hud.quit.title': 'Spiel beenden (Esc)',
  'hud.quit.label': 'Spiel beenden',
  'hud.bonus': ({ seconds }) => `+${seconds}\u00a0s`,
  'board.label': 'Spielfeld',
  'board.cell': ({ n }) => `Feld ${n}`,
  'board.cell.value': ({ n, value }) => `Feld ${n}: ${value}`,

  // ---------- der eine Knopf unter dem Raster ----------
  'action.hide': 'Verdecken',

  // ---------- Startkarte ----------
  'intro.lead':
    'Präge dir ein, wo die Zahlen liegen. Danach werden sie verdeckt – tippe sie in aufsteigender Reihenfolge an, beginnend bei\u00a01.',
  'intro.rule.time': '<b>30&nbsp;Sekunden</b> Startzeit',
  'intro.rule.bonus': 'Jede geschaffte Runde bringt bis zu <b>4&nbsp;Sekunden</b> dazu',
  'intro.rule.penalty': 'Ein Fehltipp <b>je Zahl</b> ist frei &ndash; wer r&auml;t, verliert den Bonus',
  'intro.rule.grow': 'Jede zweite Runde kommt <b>eine Zahl dazu</b>',
  'intro.rule.clock': 'Die Uhr geht nie r&uuml;ckw&auml;rts &ndash; also: ruhig bleiben',
  'intro.start': 'Spiel starten',

  // ---------- Chips ----------
  'chip.sound.on': 'Ton an',
  'chip.sound.off': 'Ton aus',
  'chip.scores': 'Bestenliste',
  'chip.language': 'Sprache',
  'chip.language.auto': 'Automatisch',

  // ---------- Rekordzeile ----------
  'best.line': ({ levels, found }) =>
    `Rekord: <b>${dePlural(levels, 'Runde', 'Runden')}</b> &middot; <b>${dePlural(found, 'Zahl', 'Zahlen')}</b>`,
  'best.none': 'Noch kein Rekord &ndash; auf geht&rsquo;s.',

  // ---------- Endkarte ----------
  'over.eyebrow': 'Zeit abgelaufen',
  'over.record': 'Neuer Rekord!',
  'over.done': ({ levels }) => `${dePlural(levels, 'Runde', 'Runden')} geschafft`,
  'over.none': 'Keine Runde geschafft',
  'over.stat.levels': 'Runden',
  'over.stat.found': 'Zahlen',
  'over.stat.mistakes': 'Fehler',
  'over.again': 'Nochmal spielen',

  // ---------- Eintragen ----------
  'entry.name.placeholder': 'Dein Name',
  'entry.name.label': 'Dein Name für die Bestenliste',
  'entry.submit': 'Eintragen',
  'entry.retry': 'Erneut versuchen',
  'entry.rank': ({ rank, total }) => `Platz ${rank} von ${total} auf diesem Gerät.`,
  'entry.rank.miss': ({ max }) => `Reicht diesmal nicht in die besten ${max} auf diesem Gerät.`,
  'entry.status.practice': 'Übungslauf (?zeit / ?runde) – zählt nicht für die Bestenliste.',
  'entry.status.localOnly': 'Auf diesem Gerät gespeichert.',
  'entry.status.sending': 'Wird gesendet …',
  'entry.status.retrying': ({ attempt, total }) => `Kein Durchkommen – Versuch ${attempt} von ${total} …`,
  'entry.status.done': ({ rank, total }) => `Eingetragen: Platz ${rank} von ${total}.`,
  'entry.status.offline': 'Server nicht erreichbar. Auf diesem Gerät ist der Lauf gespeichert.',
  'entry.status.rejected': ({ text }) => `${text} Auf diesem Gerät ist der Lauf gespeichert.`,

  // ---------- Was der Server abgelehnt hat ----------
  'reject.rateLimited': 'Gerade zu viele Einträge. In einer Minute klappt es wieder.',
  'reject.badCounters': 'Der Server hält diese Werte für unmöglich.',
  'reject.badMode': 'Diese Wertung kennt der Server nicht.',
  'reject.missingId': 'Dem Eintrag fehlt seine Kennung.',
  'reject.other': ({ reason }) => `Der Server hat abgelehnt: „${reason}“.`,
  'reject.generic': 'Der Server hat den Eintrag abgelehnt.',

  // ---------- Bestenliste ----------
  'scores.title': 'Bestenliste',
  'scores.tablist': 'Bestenliste wählen',
  // "Auf dem Gerät" stand 19 px über die Reiterbreite hinaus und wurde auf
  // 320 px als "Auf dem Gerä…" abgeschnitten - die Reiterzeile ist die engste
  // Zeile der App. "Dieses Gerät" sagt dasselbe und passt.
  'scores.tab.local': 'Dieses Gerät',
  'scores.tab.global': 'Global 🌐',
  'scores.close': 'Zurück',
  'scores.empty': 'Noch nichts eingetragen.',
  'scores.loading': 'Wird geladen …',
  'scores.offline': 'Die globale Liste ist gerade nicht erreichbar. Auf dem Gerät ist alles gespeichert.',
  'scores.anon': 'Ohne Namen',
  /** "R." statt "Runden": Die Zeile muss samt 20-Zeichen-Namen auf 320 px passen. */
  'scores.row.value': ({ found, levels }) =>
    `\u00a0${found === 1 ? 'Zahl' : 'Zahlen'} · ${levels}\u00a0R.`,
  'scores.row.title': ({ levels, found, mistakes, date }) =>
    [
      dePlural(levels, 'Runde', 'Runden'),
      dePlural(found, 'Zahl', 'Zahlen'),
      dePlural(mistakes, 'Fehler', 'Fehler'),
      date,
    ].filter(Boolean).join(' · '),
  'scores.date': ({ at }) => deDate.format(new Date(at)),

  // ---------- Pause ----------
  'pause.title': 'Pause',
  'pause.lead': 'Die Uhr steht still.',
  'pause.resume': 'Weiter',
};
