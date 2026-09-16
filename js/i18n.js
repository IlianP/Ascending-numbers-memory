/**
 * Die Übersetzungsschicht: Schlüssel → Text, plus die Regel, welche Sprache
 * überhaupt gilt.
 *
 * Reine Logik – kein DOM, keine Browser-Globals beim Import. `node --test`
 * kann die Datei deshalb direkt laden und die Pakete vergleichen (siehe
 * `test/i18n.test.mjs`); die Sprache auf die Seite zu bringen ist Sache von
 * `js/main.js`, der einzigen Datei mit DOM-Zugriff.
 *
 * Ein Wert im Sprachpaket ist entweder ein String oder eine Funktion, die ein
 * Parameter-Objekt bekommt:
 *
 *   t('scores.title')                    -> "Bestenliste"
 *   t('hud.level', { n: 3 })             -> "Runde 3"
 *
 * Zusammengesetzte Sätze sind **Funktionen je Sprache**, keine "%s"-Vorlagen.
 * Wortstellung, Plural und Kongruenz unterscheiden sich; jedes Paket schreibt
 * deshalb seinen eigenen Satz, statt Lücken in einer fremden Vorlage zu füllen.
 * Aus demselben Grund gibt es hier keine gemeinsame Plural-Maschine: Die paar
 * Zeilen stehen in dem Paket, das sie braucht.
 */

import { I18N_EN } from './i18n/en.js';
import { I18N_DE } from './i18n/de.js';
import { I18N_FR } from './i18n/fr.js';
import { I18N_ES } from './i18n/es.js';

/**
 * Das Paket, an dem alle anderen gemessen werden: Es ist die Notlösung für
 * einen fehlenden Schlüssel und der Text, den `index.html` roh ausliefert.
 *
 * Bewusst Englisch und nicht Deutsch, obwohl das Spiel auf Deutsch entstanden
 * ist: Wer eine Sprache mitbringt, für die es kein Paket gibt, bekommt so die
 * mit der größten Reichweite.
 */
export const I18N_FALLBACK = 'en';

export const I18N_PACKS = {
  en: I18N_EN,
  de: I18N_DE,
  fr: I18N_FR,
  es: I18N_ES,
};

/**
 * Was im Auswahlfeld steht, in dieser Reihenfolge. Die Namen sind Endonyme –
 * eine Sprache wird immer in sich selbst angeboten, nie übersetzt. Sonst müsste
 * jemand, der die aktuelle Sprache nicht versteht, raten, welcher Eintrag seine
 * eigene ist.
 */
export const I18N_LANGUAGES = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
];

export function i18nSupported(lang) {
  return Object.prototype.hasOwnProperty.call(I18N_PACKS, String(lang || ''));
}

/**
 * Welche Sprache gilt. Rein, damit sie sich ohne Browser prüfen lässt.
 *
 * @param {string} pref gespeicherte Wahl; '' oder undefined heißt "automatisch"
 * @param {string[]} browserLangs die geordnete Liste des Browsers
 * @returns {string} Kürzel eines vorhandenen Pakets
 *
 * Eine ausdrückliche Wahl gewinnt immer – auch gegen den Browser, denn sie ist
 * die jüngere und die bewusste Aussage. Danach zählt die erste Browsersprache,
 * für die es ein Paket gibt, und zuletzt `I18N_FALLBACK`.
 */
export function resolveLanguage(pref, browserLangs) {
  if (i18nSupported(pref)) return pref;
  for (const raw of browserLangs || []) {
    // "de-AT", "de_AT" und "DE" landen alle beim Paket "de".
    const base = String(raw || '').toLowerCase().replace('_', '-').split('-')[0];
    if (i18nSupported(base)) return base;
  }
  return I18N_FALLBACK;
}

/** Die Sprachliste des Browsers – oder [], wo es keinen gibt (node --test). */
export function browserLanguages() {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

let currentLang = I18N_FALLBACK;

export function setLanguage(lang) {
  currentLang = i18nSupported(lang) ? lang : I18N_FALLBACK;
  return currentLang;
}

export function getLanguage() {
  return currentLang;
}

/* Ein fehlender Schlüssel wird genau einmal gemeldet: Ein stilles "" ist, wie
   ein Sprachpaket unbemerkt verrottet, und eine Ausnahme würde die ganze Seite
   für ein einziges Wort umlegen. */
const warnedKeys = new Set();

function warnMissing(key) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  if (typeof console !== 'undefined' && console.warn) console.warn(`i18n: fehlender Schlüssel "${key}"`);
}

/**
 * Den Schlüssel in der aktiven Sprache übersetzen.
 * @param {string} key
 * @param {object} [params] wird an den Paketeintrag gereicht, wenn er eine Funktion ist
 * @returns {string} den Schlüssel selbst, wenn kein Paket ihn kennt – sichtbar statt still
 */
export function t(key, params) {
  const pack = I18N_PACKS[currentLang] || I18N_PACKS[I18N_FALLBACK];
  let value = pack[key];
  if (value === undefined) {
    value = I18N_PACKS[I18N_FALLBACK][key];
    if (value === undefined) {
      warnMissing(key);
      return key;
    }
  }
  return typeof value === 'function' ? value(params || {}) : value;
}
