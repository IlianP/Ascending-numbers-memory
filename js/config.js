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
  /** So lange bleibt eine falsch getippte Kachel markiert. */
  wrongRevealMs: 380,
  /** So viele Fehler pro Runde kosten nichts. */
  bonusFreeMistakes: 2,
  /**
   * Jeder weitere Fehler dieser Runde nimmt so viel vom Rundenbonus weg, bis
   * auf 0 herunter. Das ist der Schutz gegen wildes Durchprobieren: Wer sich
   * durch eine Runde tippt, statt sie sich zu merken, verdient keine Zeit mehr,
   * und ohne neue Zeit ist nach der Startzeit Schluss. Die Uhr geht dabei nie
   * rueckwaerts – sie waechst nur langsamer.
   *
   * Warum so grosszuegig (zwei Fehler frei, dann gleich 2 s)? Weil der
   * Abtipper in `tools/balance.mjs` ueber alle Strafhoehen hinweg dieselben
   * Werte liefert: Er macht pro Runde so viele Fehler, dass der Bonus bei
   * JEDER Strafe auf 0 faellt. Haertere Werte treffen also nur noch die
   * ehrlichen Spieler. Gemessen (Zahlen, Mittel aus 200 Laeufen):
   *
   *            schnell  mittel  langsam | Abtipper 4/s  8/s  12/s
   *   ohne       227.5   124.5     66.4 |    79.4  168.4  293.1
   *   frei 1/-1s 222.1   119.2     62.5 |    24.5   49.5   73.9
   *   frei 2/-2s 226.6   123.1     64.9 |    24.4   49.4   73.7   <- hier
   */
  bonusPenaltyMs: 2000,
  /** Pause zwischen geschaffter Runde und nächster Vorschau. */
  levelBreakMs: 420,
};
