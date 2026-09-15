# Ascending Numbers Memory

Merk-dir-die-Zahlen-Spiel als Web-App, nachgebaut nach dem Bildschirmvideo:
Zahlen im Raster einprägen → verdecken → in aufsteigender Reihenfolge antippen.

Kein Build, keine Abhängigkeiten – reines HTML/CSS/ES-Module. `index.html` öffnen genügt
(über einen kleinen Server, weil ES-Module per `file://` blockiert werden).

```bash
npm start     # http://localhost:8000
npm test      # Spiellogik (node:test, 13 Tests)
```

## Spielablauf

1. **Vorschau** – das Raster zeigt die Zahlen. Die Uhr läuft dabei schon.
2. **Verdecken** – Knopf drücken, alle Felder klappen zu.
3. **Antippen** – 1, 2, 3 … der Reihe nach. Richtige Felder bleiben offen,
   falsche blitzen kurz auf und schließen wieder.
4. Runde komplett → sofort die nächste Vorschau, bis die Zeit um ist.

| Regel | Wert | wo einstellbar |
| --- | --- | --- |
| Gesamtzeit | 50 s für den ganzen Durchlauf | `js/config.js` → `totalMs` |
| Zahlen in Runde 1 | 3 | `baseCount` |
| Steigerung | jede 2. Runde eine Zahl mehr | `growEvery` |
| Raster | 3×3, ab 10 Zahlen 4×4, ab 17 dann 5×5 | `js/level.js` → `levelSpec` |
| Fehler | kosten nur die Zeit, die sie brauchen | `wrongPenaltyMs` |
| Rundenbonus | keiner | `levelBonusMs` |

Zeitstrafe und Rundenbonus sind bereits eingebaut, stehen aber auf `0` – so verhält
sich der Prototyp wie das Original.

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
- Tastatur: Ziffernblock-Layout auf das 3×3-Raster, `Leertaste` verdeckt, `Esc` bricht ab.
- `prefers-reduced-motion` schaltet die Animationen ab.

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
test/game.test.mjs    Tests für Rundenplan, Regeln, Uhr, Pause
```

Die Spiellogik kennt weder DOM noch `Date.now()` – die Zeit wird ihr von außen
gereicht. Deshalb laufen die Tests ohne Browser und ohne Warten.

## Zum Ausprobieren

`?runde=15` startet direkt im 4×4-Raster, `?zeit=10` kürzt den Durchlauf auf
10 Sekunden. Beides lässt sich kombinieren: `index.html?runde=15&zeit=10`.

## Noch offen

- Service Worker, damit die App offline läuft (das Manifest liegt schon bereit).
- Deployment auf GitHub Pages.
- Feinschliff am Schwierigkeitsgrad: Tempo der Steigerung, Zeitbonus pro Runde.
