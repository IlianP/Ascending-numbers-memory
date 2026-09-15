/**
 * Zentrale Stellschrauben des Spiels.
 * Alle Zeiten in Millisekunden.
 */
export const CONFIG = {
  /** Startzeit eines Durchlaufs – jede geschaffte Runde legt `levelBonusMs` drauf. */
  totalMs: 30_000,
  /** Anzahl Zahlen in Runde 1. */
  baseCount: 3,
  /** Nach so vielen Runden kommt eine Zahl dazu. */
  growEvery: 2,
  /** Zeitstrafe pro Fehltipp (0 = wie im Original). */
  wrongPenaltyMs: 0,
  /**
   * Zeitbonus pro abgeschlossener Runde. Er trägt den Schwierigkeitsgrad:
   * Solange eine Runde weniger als 4 s kostet, wächst die Uhr, danach verliert
   * man langsam gegen die größer werdenden Raster. Zahlen aus `tools/balance.mjs`.
   */
  levelBonusMs: 4000,
  /** So lange bleibt eine falsch getippte Kachel sichtbar. */
  wrongRevealMs: 380,
  /** Pause zwischen geschaffter Runde und nächster Vorschau. */
  levelBreakMs: 420,
};
