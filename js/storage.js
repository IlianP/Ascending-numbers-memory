const KEY = 'ascending-numbers/v1';

/* `name` ist der zuletzt benutzte Name fuer die Bestenliste. Die Bestenliste
   selbst liegt in ihrem eigenen Schluessel (js/scores.js) - hier stehen nur
   Einstellungen, kein Spielstand.

   `language` ist '', solange niemand ausdruecklich gewaehlt hat: Dann
   entscheidet der Browser (siehe `resolveLanguage` in js/i18n.js). Das ist
   nicht dasselbe wie 'en' - wer einmal automatisch auf Englisch landet, soll
   nicht fuer immer darauf festgenagelt sein, bloss weil die Seite einmal
   geladen wurde. */
const EMPTY = { bestLevels: 0, bestFound: 0, sound: true, name: '', language: '' };

/** localStorage kann im Privatmodus werfen – der Fehler darf das Spiel nicht killen. */
export function load() {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...EMPTY };
  }
}

export function save(patch) {
  const next = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* egal – dann gibt es diesmal eben keinen Rekord */
  }
  return next;
}
