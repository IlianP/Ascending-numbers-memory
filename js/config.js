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
  /**
   * So viele Fehler sind pro Runde frei – JE ZAHL der Runde, nicht pauschal.
   * Eine Runde mit zehn Zahlen laedt zu mehr Vertippern ein als eine mit drei;
   * eine feste Grenze traf deshalb genau die spaeten, schweren Runden.
   */
  bonusFreeMistakesPerNumber: 1,
  /**
   * Jeder Fehler darueber hinaus nimmt so viel vom Rundenbonus weg, bis auf 0
   * herunter. Das ist der Schutz gegen wildes Durchprobieren: Wer sich durch
   * eine Runde tippt, statt sie sich zu merken, verdient keine Zeit mehr, und
   * ohne neue Zeit ist nach der Startzeit Schluss. Die Uhr geht dabei nie
   * rueckwaerts – sie waechst nur langsamer.
   *
   * Warum so grosszuegig? Weil Grosszuegigkeit hier NICHTS kostet. Der Abtipper
   * in `tools/balance.mjs` macht pro Zahl ein halbes Brett an Fehlversuchen,
   * liegt also bei jeder denkbaren Grenze darueber – seine Werte sind ueber die
   * ganze Spanne dieselben. Die Grenze trifft praktisch nur ehrliche Spieler.
   * Gemessen (gefundene Zahlen, 300 Laeufe, Spielerprofil an einem echten Lauf
   * geeicht: 17 Runden / 123 Zahlen / 60 Fehler):
   *
   *   Freigrenze          Mensch  Abtipper 12/s
   *   keine Regel          341,7          293,2
   *   2 pauschal           132,6           73,8
   *   4 pauschal           188,1           75,5
   *   halbe Rundengroesse  209,6           74,0
   *   eine je Zahl         321,3           76,8   <- hier
   *   anderthalb je Zahl       –           88,2   (ab hier faengt es an zu lecken)
   */
  bonusPenaltyMs: 2000,
  /** Pause zwischen geschaffter Runde und nächster Vorschau. */
  levelBreakMs: 420,
};
