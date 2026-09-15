/**
 * Zentrale Stellschrauben des Spiels.
 * Alle Zeiten in Millisekunden.
 */
export const CONFIG = {
  /** Gesamtzeit für einen Durchlauf. */
  totalMs: 50_000,
  /** Anzahl Zahlen in Runde 1. */
  baseCount: 3,
  /** Nach so vielen Runden kommt eine Zahl dazu. */
  growEvery: 2,
  /** Zeitstrafe pro Fehltipp (0 = wie im Original). */
  wrongPenaltyMs: 0,
  /** Zeitbonus pro abgeschlossener Runde (0 = wie im Original). */
  levelBonusMs: 0,
  /** So lange bleibt eine falsch getippte Kachel sichtbar. */
  wrongRevealMs: 380,
  /** Pause zwischen geschaffter Runde und nächster Vorschau. */
  levelBreakMs: 420,
};
