# ♞ SchachArena

Online-Schach-Website mit Einladungscodes, Zufalls-Matchmaking, Bots, Profilen, Shop und 3D-Cinematic-Finishern.

## Starten

```bash
npm install
npm start
```

Danach im Browser **http://localhost:3000/chess/** öffnen (die Startseite **/** ist der PlayHub mit allen Spielen). Für ein Testspiel gegen dich selbst öffnest du einen zweiten Browser (oder ein Inkognito-Fenster), weil jedes Fenster ein eigenes Profil hat.

Optionale Umgebungsvariablen:

- `PORT` (Standard 3000)
- `MONGODB_URI`: Verbindungs-Adresse einer MongoDB, z. B. kostenlos von MongoDB Atlas. Damit bleiben Profile, Münzen und die Rangliste bei Updates und Neustarts erhalten. Ohne diese Variable speichert der Server in einer Datei, und die geht bei Render-Free bei jedem Update verloren.
- `MONGODB_DB`: Name der Datenbank (Standard `schacharena`)
- `DB_FILE`: Pfad der Datei, wenn keine MongoDB gesetzt ist (Standard `data/db.json`)

## Funktionen

| Bereich | Was es kann |
|---|---|
| **Einladungscode** | Erzeugt einen zufälligen 6-stelligen Zahlencode (Bedenkzeit 1/3/5/10/15 Min oder ∞). Dein Freund gibt ihn ein und das Spiel startet. |
| **Spielercode** | Jeder Spieler hat einen festen 8-stelligen Code, den er sich anzeigen lassen kann. Wer ihn eingibt, schickt dir eine Herausforderung, die du annehmen oder ablehnen kannst. |
| **Zufälliges Match** | Warteschlange, die Gegner mit derselben Bedenkzeit (1/3/5/10/15 Min) und möglichst ähnlicher Wertung zusammenbringt. Elo-gewertet. Auch Herausforderungen per Spielercode oder aus dem Chat haben eine wählbare Bedenkzeit. |
| **2 vs 2** | Auf dem großen 4er-Brett: Rot & Gelb gegen Blau & Grün. Partner können sich nicht schlagen und nicht Schach geben; ist einer matt (oder gibt auf), verliert sein Team. Lobby mit Teamwahl, leere Plätze werden Bots. |
| **Replays** | Eigener Tab mit allen eigenen Partien (online, 2 vs 2, 4er, Bots) zum Nachspielen – auch direkt aus dem Ergebnis-Fenster und dem Profil-Verlauf. |
| **Gruppen** | Im Freunde-Tab: Gruppen mit bis zu 12 Freunden, Gruppenchat, Mitglieder hinzufügen, umbenennen, verlassen und „Spielen“ – öffnet eine 2-vs-2- oder 4er-Lobby und lädt alle mit Beitreten-Knopf ein. |
| **Brett-Abstimmung** | Haben beide Spieler dasselbe Brett ausgerüstet, gibt es keine Abstimmung. Sonst sehen beide die Bretter mit Vorschau und dem Namen und Avatar des Besitzers und stimmen ab. Wählen beide verschieden, entscheidet der Zufall. |
| **Skins** | Jeder sieht seine eigenen Figuren immer in seinem eigenen Skin (und seiner Form) – auch im 4er-Schach und im 2 vs 2 (dort auch die Figuren des Partners). |
| **Formen** | Shop-Tab mit anderen Figuren-Silhouetten (Spielsteine, Modern, Kawaii, Pixel), frei kombinierbar mit jedem Skin. |
| **3D-Brett** | Brett für 3.000 Münzen: schräg im Raum mit dicker Holzplatte, die Figuren stehen aufrecht. Gespielt wird durch Antippen. |
| **3D-Finisher** | Bei jedem Schachmatt sehen **beide** Spieler den Finisher des Siegers als 3D-Cinematic (Three.js mit Bloom): Königssturz, Feuerwerk, Donnerschlag, Meteoriteneinschlag, Eissplitter oder Schwarzes Loch. Im Shop gibt es eine Vorschau für jeden Finisher. |
| **Shop** | Pakete, Bretter (inkl. 3D-Brett), Figuren-Skins, Formen und Finisher. Zum Start ist jeweils ein klassisches Teil gratis. |
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
