# Ascending Numbers Memory

Merk-dir-die-Zahlen-Spiel als Web-App, nachgebaut nach dem Bildschirmvideo:
Zahlen im Raster einprägen → verdecken → in aufsteigender Reihenfolge antippen.

Kein Build, keine Abhängigkeiten – reines HTML/CSS/ES-Module. `index.html` öffnen genügt
(über einen kleinen Server, weil ES-Module per `file://` blockiert werden).

```bash
npm start     # http://localhost:8000
npm test      # Logik, Balance, Service Worker und Layout im Browser (node:test, 62 Tests)
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
| Fehler | kosten keine Uhrzeit | `wrongPenaltyMs` |
| Rundenbonus | bis zu +4 s pro geschaffter Runde | `levelBonusMs` |
| &nbsp;&nbsp;davon frei | 2 Fehler pro Runde | `bonusFreeMistakes` |
| &nbsp;&nbsp;danach | −2 s Bonus je weiterem Fehler, bis 0 | `bonusPenaltyMs` |

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
(`wrongPenaltyMs`) bleibt bei `0` – die Uhr geht nie rückwärts. Was Fehler kosten, ist
der *Bonus* der laufenden Runde, und auch der erst ab dem dritten: siehe unten.

## Was gegenüber der Vorlage anders ist

Im Video wirkt das Original träge, deshalb liegt der Schwerpunkt auf Reaktion:

- Eingaben laufen über `pointerdown` statt `click` – der Tipp sitzt beim Berühren,
  nicht erst beim Loslassen.
- Jeder Tipp bestätigt sich dreifach: Kachel-Animation, Farbpunkt oben rechts,
  kurzer Ton **und** Vibration (Android).
- Fortschrittspunkte unter dem Raster zeigen, welche Zahl als Nächstes dran ist.
- Ein Fehltipp blitzt auf, verrät aber nicht, welche Zahl dort lag (siehe unten).
- Uhr als Ziffern **und** als Balken, unter 10 Sekunden rot.
- Wechselt man den Tab, hält die Uhr an, statt den Lauf zu verschenken.
- Hell/Dunkel nach Systemeinstellung, Layout von 320 px bis Desktop – die schmalen
  Fälle sind als Test festgehalten (320/360/390 px).
- Rekord (Runden + Zahlen) bleibt im `localStorage`.
- Bestenliste: die besten 50 Läufe auf dem Gerät, dazu eine optionale globale
  Liste (siehe unten).
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

Dieselbe Datei hält den Kopfbereich im Bild: Bei 320 px ist die Zeile aus Runden-Pille,
Uhr und drei Knöpfen so voll, dass symmetrische Spalten (`1fr auto 1fr`) nicht mehr
passen – die linke Spalte wird dann so breit wie die Knopfleiste rechts und schiebt den
Beenden-Knopf aus dem Bild. Jede Seite nimmt jetzt nur, was sie braucht.

Und sie hält die Karten bedienbar. Auf einem 320×568-Display passt die Startkarte
nicht mehr ganz ins Bild – der „Spiel starten"-Knopf lag bei 626 px, also außerhalb,
und das Spiel ließ sich dort schlicht nicht starten. Ein zentrierter Inhalt, der
überläuft, lässt sich aber **nicht** herunterscrollen: Genau das ist die Falle bei
`place-items: center`. Die Lade ist deshalb eine Flex-Spalte mit `overflow-y: auto`
und die Karte hat `margin: auto` – zentriert, solange Platz ist, scrollbar, sobald
keiner mehr da ist. Der Test klickt den Knopf danach wirklich an, statt sich mit
„sichtbar" zufriedenzugeben.

## Abtippen darf sich nicht lohnen

Ein Merkspiel, das man auch durch schnelles Abtippen aller Felder gewinnt, ist
keines. Gemessen wird das nicht nach Gefühl: `tools/balance.mjs` lässt neben den
drei Menschenmodellen einen **Abtipper** gegen die echte Spiellogik spielen. Er
prägt sich nichts ein, drückt sofort „Verdecken" und klappert die Felder reihum
ab. Verglichen wird an `found` (gefundene Zahlen) – das ist es, was die
Bestenliste wertet.

Ohne Schutz gewann er, und zwar deutlich:

| | schnell | mittel | langsam | Abtipper 4/s | 8/s | 12/s |
| --- | --- | --- | --- | --- | --- | --- |
| ohne Schutz | 227,5 | 124,5 | 66,4 | 79,4 | **168,4** | **293,1** |
| heute | 226,6 | 123,1 | 64,9 | 24,4 | 49,4 | 73,7 |

Zwei Dinge machten das möglich, und beide sind behoben:

**Der Fehltipp zeigte die Zahl.** Die falsch getippte Kachel schrieb 380 ms lang
ihre eigene Zahl hinein. Einmal quer über das Brett getippt, und die ganze
Belegung war bekannt – das war kein Durchprobieren mehr, das war ein Blick in
die Karten. Jetzt blitzt die Kachel nur noch grau auf. Rückmeldung genug sind
Farbe, Punkt, Ton und Vibration; *welche* Zahl dran ist, sagen die
Fortschrittspunkte ohnehin. `test/controls.test.mjs` hält im echten Browser
fest, dass nach einem Fehltipp keine Zahl offen liegt.

**Der Rundenbonus finanzierte das Durchprobieren.** Eine Runde abzutippen kostete
weniger Zeit, als die +4 s einbrachten – der Lauf trug sich selbst und dauerte
statt 30 gut 150 Sekunden. Jetzt **schrumpft der Bonus mit den Fehlern der
Runde**: zwei sind frei, jeder weitere kostet 2 s davon, bei 0 ist Schluss. Wer
sich durch eine Runde tippt, verdient also keine Zeit mehr und verhungert an der
Startzeit.

Wichtig dabei: **Die Uhr geht nie rückwärts.** Ein Fehler zieht nichts ab, er
lässt nur weniger dazukommen – `wrongPenaltyMs` steht weiter auf `0`. Ein
Fehltipp soll den Lauf nicht auffressen, er soll ihn nur nicht verlängern.

Warum ausgerechnet „zwei frei, dann 2 s"? Weil die Strafhöhe den Abtipper kaum
interessiert: Er macht pro Runde so viele Fehler, dass der Bonus bei *jeder*
Strafe auf 0 fällt – seine Werte sind über alle Varianten hinweg dieselben
(24/49/74). Die Strafe trifft also fast nur die ehrlichen Spieler, und deshalb
ist die mildeste Variante, die den Abtipper noch aushungert, die richtige. Eine
härtere (ein Fehler frei, 1 s je weiterem) kostete den mittleren Spieler 4 Zahlen
mehr und den Abtipper nichts.

Was bleibt: Wer 30 Sekunden lang zwölf Mal pro Sekunde tippt, landet bei ~74
Zahlen – unter dem mittleren Spieler, aber über dem langsamen. Dafür steht dann
„rund 200 Fehler" in der Zeile. Ganz ausschließen lässt sich das nicht, ohne
ehrliches Spiel zu bestrafen; `test/balance.test.mjs` hält fest, dass der
Abtipper unter dem mittleren Spieler bleibt und sein Lauf keine 30 Sekunden
übersteht.

## Bestenliste

Zwei Listen, dieselbe Wertung: die besten 50 Läufe **auf dem Gerät**
(`localStorage`) und, wenn ein Server hinterlegt ist, eine **globale** Liste
dazu. Beide sind über die Trophäe auf der Start- und der Endkarte erreichbar –
nicht im Kopfbereich, denn der ist bei 320 px schon voll (siehe oben).

### Verglichen werden gefundene Zahlen, nicht geschaffte Runden

Das sieht nach der kleineren Zahl aus, ist aber die feinere *und* die
verträgliche: Wer mehr Runden schafft, hat zwangsläufig mehr Zahlen gefunden.
Eine Runde ist erst geschafft, wenn alle ihre Zahlen sitzen, und die
Rundengrößen wachsen monoton – wer L Runden schafft, hat also mindestens die
Summe der ersten L Runden gefunden, und wer nur L-1 Runden schafft, kommt selbst
mit einer fast fertigen Runde L nicht heran (`test/scores.test.mjs` rechnet das
gegen den echten Rundenplan nach). Die Zahlen ordnen damit genau wie die Runden,
unterscheiden aber zusätzlich die beiden, die bei „7 Runden" gleichauf wären:
einer stand mitten in Runde 8, der andere hatte gerade erst verdeckt.

Fehler zählen mit, kosten aber keinen Platz – weder als Abzug noch als
Stichentscheid. Ein Fehltipp ist auf dem Handy eine Daumenbreite weit weg und
kostet ohnehin die Zeit, die er braucht; ihn zusätzlich zu verrechnen würde die
Eingabe bestrafen statt das Gedächtnis. Gespeichert werden ohnehin die
Rohwerte (Runden, Zahlen, Fehler), nicht eine fertige Punktzahl: Eine spätere
Wertung ließe sich damit rückwirkend nachrechnen, ohne dass jemand etwas neu
spielen muss.

Fehler sind damit kein Ranking-Faktor – sie zu einem zu machen wäre auch der
falsche Hebel gegen wildes Durchprobieren gewesen: Der Abtipper hat ja *mehr*
Zahlen, ein Stichentscheid bei Gleichstand hätte ihn nie erwischt. Dieses Problem
gehört ins Spiel, nicht in die Bestenliste, und dort ist es gelöst (siehe oben).

Abgekürzte Läufe (`?zeit=`, `?runde=`) zählen nicht – genau wie beim Rekord. Die
Endkarte sagt das auch dort, wo sonst der Knopf wäre, statt es zu verschweigen.

### Gleichstand überholt nicht

Wer dieselbe Zahl noch einmal erreicht, steht **hinter** dem älteren Eintrag.
Diese Regel steht an vier Stellen und muss überall dieselbe sein, sonst markiert
die Oberfläche die falsche Zeile: beim Speichern (stabil sortiert, der neue
Eintrag wird hinten angehängt), in der Platzvorschau auf der Endkarte, in
`ascending_top_scores` (`found desc, created_at asc, id asc`) und beim Zählen des
Rangs in `ascending_submit_score`. Die eigene Zeile wird deshalb auch nicht über
den gemeldeten Rang gesucht, sondern über die Werte: unter wertgleichen Zeilen
die jüngste.

### Ohne Netz ist nichts kaputt

Das Spiel läuft offline, also muss es offline vollständig sein. Jeder Aufruf in
`js/leaderboard.js` geht sanft daneben: kein Netz, kein eingerichteter Server,
ein Filter dazwischen, Zeitüberschreitung – Lesen liefert `null`, und die
Oberfläche zeigt die Liste vom Gerät. Eingetragen wird **immer zuerst lokal**,
erst danach ins Netz; wer den Knopf gar nicht drückt, dessen Lauf landet
spätestens beim Verlassen der Endkarte in der Liste. Ein Ergebnis darf nicht
daran hängen, ob der Server gerade erreichbar war.

Ein Aussetzer beim Senden wird bis zu dreimal wiederholt, danach wird der Knopf
zum „Erneut versuchen" statt zur Sackgasse. Jeder Durchlauf trägt dabei eine
eigene Kennung, die der Server als Idempotenz-Schlüssel benutzt: Geht die
Antwort auf einem erfolgreichen Eintrag verloren, legt der Wiederholungsversuch
keine zweite Zeile an. Und ein *abgelehnter* Eintrag wird nicht als „nicht
erreichbar" gemeldet – das schickte nur auf die Suche nach einem Netzproblem,
das es nicht gibt.

### Einrichtung (einmalig, optional)

1. Kostenloses [Supabase](https://supabase.com)-Projekt anlegen – oder eines
   mitbenutzen, in dem schon eine andere Bestenliste liegt: Alle Namen tragen
   das Präfix `ascending_` und kommen sich nicht ins Gehege.
2. `docs/leaderboard-setup.sql` im SQL-Editor des Projekts ausführen. Die Datei
   ist wiederholbar – sie erneut auszuführen ist der normale Weg, Änderungen
   einzuspielen.
3. Projekt-URL und öffentlichen anon-/publishable-Key in `js/leaderboard.js`
   eintragen.

Beide Werte gehören in den Browser: Der publishable Key ist dafür gemacht,
ausgeliefert zu werden. Geschützt wird die Tabelle durch Row Level Security ohne
jede Policy plus zwei SECURITY-DEFINER-Funktionen, die nur unbedenkliche Spalten
herausgeben – nie die IP, nie den Rate-Limit-Schlüssel. Statt der IP wird nur ein
täglich gesalzener Hash gespeichert. Der `service_role`-Key hat dort nichts
verloren.

**Ehrlich bleiben:** Der Browser meldet sein Ergebnis selbst. Manipulationssicher
ist eine solche Liste nicht und kann es nicht sein. Die Prüfungen serverseitig
halten groben Unfug ab (unmögliche Werte, Sturzfluten) – deshalb sind sie
bewusst locker: Eine Prüfung, die echte Läufe abweist, kostet Funktionalität und
bringt keine Sicherheit.

Solange das SQL nicht eingespielt ist, antwortet der Server auf beide Funktionen
mit 404. Das Spiel fällt dann still auf die Liste im Gerät zurück; der Reiter
„Global" sagt, dass er gerade nicht erreichbar ist. Nichts bricht.

### Die Serverhälfte testen

`test/sql/rank-order.sql` prüft, was nur die Datenbank beantworten kann: dass der
gemeldete Rang exakt die Listenposition ist (auch bei Gleichstand), dass
dieselbe Kennung keine zweite Zeile anlegt und dass unmögliche Werte abgelehnt
werden. Es läuft **gegen eine Wegwerf-Datenbank, nie gegen das Live-Projekt** –
es leert die Tabelle am Anfang. Die nötigen Befehle stehen im Kopf der Datei.

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
js/scores.js          Wertung eines Laufs und die Bestenliste auf dem Gerät (reine Logik)
js/leaderboard.js     globale Bestenliste über Supabase – die einzige Datei mit Netzzugriff
js/main.js            verdrahtet alles und hält die Uhr am Laufen
sw.js                 Service Worker: App-Shell im Cache, damit es offline läuft
tools/balance.mjs     Simulation für die Balance (kein Teil der Web-App)
test/game.test.mjs    Tests für Rundenplan, Regeln, Uhr, Pause
test/balance.test.mjs hält die Balance fest – und dass Abtippen kein Merken schlägt
test/sw.test.mjs      prüft, dass der Cache wirklich alle Dateien kennt
test/layout.test.mjs  misst im Browser, dass das Spielfeld still steht und die Karten passen
test/controls.test.mjs Ton-Schalter, Neustart und der verschwiegene Fehltipp im Browser
test/scores.test.mjs  Wertung, Reihenfolge, Gleichstand, kaputte Daten
test/leaderboard.test.mjs  die Netzschicht gegen einen gefälschten `fetch`
test/leaderboard-ui.test.mjs  die Bestenliste im Browser, inklusive 320-px-Maßen
test/sql/rank-order.sql  die Serverhälfte gegen eine Wegwerf-Datenbank (siehe unten)
test/helpers/browser.mjs  Browser-Treiber über das DevTools-Protokoll
docs/leaderboard-setup.sql  einmalig im Supabase-Projekt auszuführen
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
Runden gehen nicht in die Auswertung ein, und weder Rekord noch Bestenliste
werden davon berührt. Die Endkarte sagt das auch dazu.

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
`js/` und `icons/`; Tests, Workflow und `docs/` bleiben draußen – das SQL gehört
ins Supabase-Projekt, nicht auf die Seite. Alle Pfade sind relativ,
deshalb stört das Unterverzeichnis der Projektseite weder Manifest noch Service
Worker.

> **Einmalig nötig:** in *Settings → Pages* als Quelle **GitHub Actions** wählen.
> Ohne das schlägt der Deploy-Schritt fehl, die Tests laufen trotzdem.

## Ideen für später

- Hinweis in der App, wenn ein neuer Stand im Hintergrund bereitliegt („Neu laden“).
- Rekord getrennt nach Rastergröße statt nur Runden und Zahlen.
- Zeitstrafe für Fehltipps als optionaler „harter“ Modus. Dafür ist die Wertung
  schon vorbereitet: Jede Zeile trägt ihre Wertungsklasse (`mode`), ein solcher
  Modus bekäme also seine eigene Liste, ohne dass Bestandsdaten angefasst werden.
- Alter der Einträge in der Liste („vor 3 Tagen“) – der Zeitpunkt steht schon in
  jeder Zeile und wartet nur darauf, angezeigt zu werden.
