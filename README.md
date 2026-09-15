# Ascending Numbers Memory

Merk-dir-die-Zahlen-Spiel als Web-App, nachgebaut nach dem Bildschirmvideo:
Zahlen im Raster einprägen → verdecken → in aufsteigender Reihenfolge antippen.

Kein Build, keine Abhängigkeiten – reines HTML/CSS/ES-Module. `index.html` öffnen genügt
(über einen kleinen Server, weil ES-Module per `file://` blockiert werden).

```bash
npm start     # http://localhost:8000
npm test      # Logik, Balance, Service Worker und Layout im Browser (node:test, 28 Tests)
```

## Spielablauf

1. **Vorschau** – das Raster zeigt die Zahlen. Die Uhr läuft dabei schon.
2. **Verdecken** – Knopf drücken, alle Felder klappen zu.
3. **Antippen** – 1, 2, 3 … der Reihe nach. Richtige Felder bleiben offen,
   falsche blitzen kurz auf und schließen wieder.
4. Runde komplett → sofort die nächste Vorschau, bis die Zeit um ist.

| Regel | Wert | wo einstellbar |
| --- | --- | --- |
| Startzeit | 30 s | `js/config.js` → `totalMs` |
| Zahlen in Runde 1 | 3 | `baseCount` |
| Steigerung | jede 2. Runde eine Zahl mehr | `growEvery` |
| Raster | 3×3, ab 10 Zahlen 4×4, ab 17 dann 5×5 | `js/level.js` → `levelSpec` |
| Fehler | kosten nur die Zeit, die sie brauchen | `wrongPenaltyMs` |
| Rundenbonus | +4 s pro geschaffter Runde | `levelBonusMs` |

### Schwierigkeitsgrad

Die Uhr startet knapp und wird verdient: Jede geschaffte Runde legt 4 Sekunden drauf,
kurz neben der Uhr als `+4 s` eingeblendet. Damit endet ein Durchlauf nicht nach einer
festen Zeit, sondern genau dann, wenn eine Runde mehr kostet, als sie einbringt – und
weil alle zwei Runden eine Zahl dazukommt, passiert das unvermeidlich.

Die Zahlen sind nicht geraten, sondern simuliert: `tools/balance.mjs` spielt Durchläufe
gegen die echte Spiellogik, mit einem groben Modell für Einprägen, Tippen und Vertippen.

```bash
node tools/balance.mjs
```

| Spieler | vorher (50 s, kein Bonus) | jetzt (30 s, +4 s) |
| --- | --- | --- |
| schnell | 13 Runden, 50 s, nur 3×3 | 25 Runden, 130 s, bis 4×4 |
| mittel | 11 Runden, 51 s, nur 3×3 | 17 Runden, 100 s, bis 4×4 |
| langsam | 8,8 Runden, 52 s, nur 3×3 | 11,7 Runden, 77 s, nur 3×3 |

Vorher war das größere Raster toter Code: Das 4×4 beginnt in Runde 15, die in 50 Sekunden
niemand erreicht. Jetzt ist es der Lohn fürs Gutspielen. Die Zeitstrafe pro Fehltipp
(`wrongPenaltyMs`) bleibt bei `0` – Fehler kosten die Zeit, die sie brauchen, das reicht.

## Was gegenüber der Vorlage anders ist

Im Video wirkt das Original träge, deshalb liegt der Schwerpunkt auf Reaktion:

- Eingaben laufen über `pointerdown` statt `click` – der Tipp sitzt beim Berühren,
  nicht erst beim Loslassen.
- Jeder Tipp bestätigt sich dreifach: Kachel-Animation, Farbpunkt oben rechts,
  kurzer Ton **und** Vibration (Android).
- Fortschrittspunkte unter dem Raster zeigen, welche Zahl als Nächstes dran ist.
- Uhr als Ziffern **und** als Balken, unter 10 Sekunden rot.
- Wechselt man den Tab, hält die Uhr an, statt den Lauf zu verschenken.
- Hell/Dunkel nach Systemeinstellung, Layout von 320 px bis Desktop.
- Rekord (Runden + Zahlen) bleibt im `localStorage`.
- Läuft offline: ein Service Worker legt den kompletten App-Shell in den Cache.
- Tastatur: Ziffernblock-Layout auf das 3×3-Raster, `Leertaste` verdeckt, `N` startet neu,
  `Esc` bricht ab.
- Ton lässt sich auf der Startkarte umschalten, nicht erst im laufenden Spiel.
- Neues Spiel jederzeit per Knopf im Kopfbereich – ohne das Ende der Uhr abzuwarten.
- Das Spielfeld bleibt beim Verdecken exakt stehen (siehe unten).
- `prefers-reduced-motion` schaltet die Animationen ab.

## Das Spielfeld darf nicht wackeln

Wer sich die Zahlen gemerkt hat, tippt blind. Bewegt sich das Raster in dem
Moment, in dem verdeckt wird, muss der Spieler seinen Finger neu ausrichten – und
verliert genau den Vorsprung, den er sich gerade erarbeitet hat.

Der „Verdecken“-Knopf verschwand früher per `hidden` aus dem Layout. Das Raster
der Bühne zentrierte daraufhin neu und das Spielfeld sprang **26 px nach unten**.
Jetzt wird der Knopf nur unsichtbar geschaltet (`visibility`), behält also seinen
Platz. `test/layout.test.mjs` misst das im echten Browser nach und schlägt an,
sobald sich ein Rechteck auch nur um Hundertstel verschiebt.

## Aufbau

```
index.html            Gerüst: HUD, Spielfeld, Karten für Start/Ende/Pause
css/style.css         Design-Tokens, Hell/Dunkel, Animationen
js/config.js          alle Stellschrauben an einem Ort
js/level.js           Rundenplan und Feldaufbau (reine Funktionen)
js/game.js            Regelwerk als Zustandsautomat, ohne DOM und ohne eigene Uhr
js/board-view.js      Raster im DOM, Eingaben, Animationen
js/feedback.js        Töne (Web Audio) und Vibration
js/storage.js         Rekord und Ton-Einstellung
js/main.js            verdrahtet alles und hält die Uhr am Laufen
sw.js                 Service Worker: App-Shell im Cache, damit es offline läuft
tools/balance.mjs     Simulation für die Balance (kein Teil der Web-App)
test/game.test.mjs    Tests für Rundenplan, Regeln, Uhr, Pause
test/balance.test.mjs hält die Balance grob an Ort und Stelle
test/sw.test.mjs      prüft, dass der Cache wirklich alle Dateien kennt
test/layout.test.mjs  misst im Browser, dass das Spielfeld still steht
test/controls.test.mjs Ton-Schalter und Neustart im Browser
test/helpers/browser.mjs  Browser-Treiber über das DevTools-Protokoll
```

### Tests im Browser, ohne Abhängigkeiten

Layout lässt sich nicht in Node prüfen – dafür braucht es eine echte
Rendering-Engine. Statt Playwright ins Projekt zu holen (und damit `npm install`),
steuert `test/helpers/browser.mjs` ein vorhandenes Chrome direkt über das
DevTools-Protokoll: Node 22 bringt `WebSocket` mit, Chrome bringt das Protokoll
mit, dazwischen liegen rund 200 Zeilen. Gesucht wird der Browser über
`CHROME_PATH` und die üblichen Pfade.

Ohne Browser überspringen sich diese Tests mit Hinweis. Damit das in CI nicht
unbemerkt passiert, sucht der Workflow Chrome in einem eigenen Schritt und
scheitert, wenn keiner da ist.

Die Spiellogik kennt weder DOM noch `Date.now()` – die Zeit wird ihr von außen
gereicht. Deshalb laufen die Tests ohne Browser und ohne Warten.

## Zum Ausprobieren

`?runde=15` startet direkt im 4×4-Raster, `?zeit=10` kürzt den Durchlauf auf
10 Sekunden. Beides lässt sich kombinieren: `index.html?runde=15&zeit=10`.

Solche Läufe zählen nur die Runden, die man wirklich gespielt hat – übersprungene
Runden gehen nicht in die Auswertung ein, und der Rekord bleibt unberührt.

## Offline

Beim ersten Besuch wandert der komplette App-Shell in einen versionierten Cache,
danach startet das Spiel auch ohne Netz (`sw.js`). Weil es keinen Build und damit
keine gehashten Dateinamen gibt, liegt immer nur *ein* Stand im Cache – eine neue
`main.js` kann also nie auf eine alte `game.js` treffen.

**Nach jeder Änderung an den ausgelieferten Dateien `VERSION` in `sw.js` hochzählen**
(`v1` → `v2`). Das ist das Release-Signal: Der Browser erkennt das geänderte Skript,
installiert den neuen Cache und wirft den alten weg. Ohne Bump bleiben Besucher auf
dem alten Stand. `npm test` prüft immerhin, dass keine Datei in der Liste fehlt.

## Deployment

`.github/workflows/pages.yml` erledigt beides: Bei jedem Push und bei jedem Pull
Request laufen die Tests, und was auf `main` landet, veröffentlicht GitHub Pages
anschließend automatisch – ohne Build, es wird nur kopiert:

<https://ilianp.github.io/Ascending-numbers-memory/>

Ausgeliefert werden nur `index.html`, `manifest.webmanifest`, `sw.js`, `css/`,
`js/` und `icons/`; Tests und Workflow bleiben draußen. Alle Pfade sind relativ,
deshalb stört das Unterverzeichnis der Projektseite weder Manifest noch Service
Worker.

> **Einmalig nötig:** in *Settings → Pages* als Quelle **GitHub Actions** wählen.
> Ohne das schlägt der Deploy-Schritt fehl, die Tests laufen trotzdem.

## Ideen für später

- Hinweis in der App, wenn ein neuer Stand im Hintergrund bereitliegt („Neu laden“).
- Rekord getrennt nach Rastergröße statt nur Runden und Zahlen.
- Zeitstrafe für Fehltipps als optionaler „harter“ Modus.
