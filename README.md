# ♞ SchachArena

Online-Schach-Website mit Einladungscodes, Zufalls-Matchmaking, Bots, Profilen, Shop und 3D-Cinematic-Finishern.

## Starten

```bash
npm install
npm start
```

Danach im Browser **http://localhost:3000** öffnen. Für ein Testspiel gegen dich selbst öffnest du einen zweiten Browser (oder ein Inkognito-Fenster), weil jedes Fenster ein eigenes Profil hat.

Optionale Umgebungsvariablen: `PORT` (Standard 3000) und `DB_FILE` (Standard `data/db.json`).

## Funktionen

| Bereich | Was es kann |
|---|---|
| **Einladungscode** | Erzeugt einen zufälligen 6-stelligen Zahlencode (Bedenkzeit 1/3/5/10/15 Min oder ∞). Dein Freund gibt ihn ein und das Spiel startet. |
| **Spielercode** | Jeder Spieler hat einen festen 8-stelligen Code, den er sich anzeigen lassen kann. Wer ihn eingibt, schickt dir eine Herausforderung, die du annehmen oder ablehnen kannst. |
| **Zufälliges Match** | Warteschlange, die Gegner mit möglichst ähnlicher Wertung zusammenbringt. 10 Minuten pro Spieler, Elo-gewertet. |
| **Brett-Abstimmung** | Haben beide Spieler dasselbe Brett ausgerüstet, gibt es keine Abstimmung. Sonst sehen beide die Bretter mit Vorschau und dem Namen und Avatar des Besitzers und stimmen ab. Wählen beide verschieden, entscheidet der Zufall. |
| **Skins** | Jeder Spieler spielt mit seinem eigenen Figuren-Skin: Weiß in den Farben des weißen Spielers, Schwarz in denen des schwarzen. |
| **3D-Finisher** | Bei jedem Schachmatt sehen **beide** Spieler den Finisher des Siegers als 3D-Cinematic (Three.js mit Bloom): Königssturz, Feuerwerk, Donnerschlag, Meteoriteneinschlag, Eissplitter oder Schwarzes Loch. Im Shop gibt es eine Vorschau für jeden Finisher. |
| **Shop** | 9 Bretter, 6 Figuren-Skins, 6 Finisher. Zum Start ist jeweils ein klassisches Teil gratis. |
| **Bots** | 6 Stufen: Noobi (Noob) → Bauer Bernd → Springer Sam → Läufer Lena → Turm Theo → Dame Diana (schlau). Die eigene Engine nutzt Alpha-Beta-Suche und läuft im Web Worker. Bots haben ebenfalls Finisher. |
| **Münzen** | Online: Sieg +100, Remis +45, Niederlage +25 Trostgeld. Bots: 15 bis 400 Münzen pro Sieg, ⅓ davon bei Remis, +5 Trostgeld bei einer Niederlage. |
| **Profil** | Name, Emoji-Avatar mit Farbe oder eigenes hochgeladenes Bild, Statistiken, Partieverlauf, Spielercode |
| **Extras** | Rangliste, Schachuhren, Remisangebote, Aufgeben, Emotes, Reconnect (45 s), Sounds, Mobil-Layout |

## Technik

- **Server:** Node.js, Express, Socket.io. Züge, Uhren, Münzen und Käufe werden auf dem Server geprüft (chess.js). Bot-Partien spielt der Server nach, bevor er die Belohnung auszahlt.
- **Client:** Vanilla-JS-Module ohne Build-Schritt, eigene SVG-Figuren und Three.js für die Finisher.
- **Daten:** Einfache JSON-Datei in `data/db.json`. Die Anmeldung läuft ohne Passwort über einen Token im `localStorage` des Browsers.

```
server.js               Server, Matchmaking, Spiele, Shop, Belohnungen
public/index.html       App-Gerüst
public/css/style.css    Design
public/js/app.js        UI-Logik (Lobby, Spiel, Bots, Shop, Profil, Rangliste)
public/js/board.js      Interaktives Brett (Drag & Drop, Animationen, Umwandlung)
public/js/pieces.js     SVG-Figuren und Skins
public/js/catalog.js    Shop-Katalog, Bots und Belohnungen (für Server und Client)
public/js/engine.js     Schach-Engine der Bots
public/js/finisher.js   3D-Cinematic-Finisher
public/js/sound.js      Synthetische Sounds (WebAudio)
```
