# Logineo – PlayHub & SchachArena

Live: **https://logineo.club** (PlayHub-Startseite) und **https://logineo.club/chess/** (SchachArena).
Deploy: Render (`render.yaml`) baut automatisch bei jedem Push auf `main`. Datenbank: MongoDB über `MONGODB_URI` (ohne: JSON-Datei `data/db.json`).
Der Besitzer schreibt Deutsch (oft kurz/umgangssprachlich, Tippfehler) – **immer auf Deutsch antworten**, einfache Sprache, keine Fachbegriffe ohne Erklärung. Nutzer der Seite sind Schüler.

## Arbeitsweise (bitte so beibehalten)
- Direkt auf `main` committen und pushen (so läuft das Deployment). Vorher `git pull --rebase origin main` – es arbeiten manchmal mehrere Sitzungen parallel.
- **Bei jeder Änderung** `public/js/version.js` hochzählen (`VERSION`, `VERSION_DATE`) und oben in `CHANGELOG` eine deutsche Zeile ergänzen. Clients laden nach einem Update automatisch neu (nie mitten im Spiel).
- Commit-Nachrichten auf Deutsch: `vX.Y.Z: Kurzbeschreibung` + Stichpunkte.
- Vor dem Push testen: `node --check` für geänderte Dateien, dann echter Browser-Test mit Playwright (Chromium ist vorinstalliert; Firefox liegt nach `PLAYWRIGHT_BROWSERS_PATH=… playwright install firefox`, die Cloud-Umgebung „Logineo“ erlaubt den Download).
- Testserver: `PORT=3456 DB_FILE=<scratch>/db.json node server.js` (eigene Test-DB, nie die echte). Admin im Test: `ADMIN_CODES=<8-stelliger Spielercode>`. Kürzere Abbruchzeit im Test: `RECONNECT_MS=3000`.
- Keine Build-Schritte: Vanilla-JS-Module, direkt aus `public/` ausgeliefert.

## Struktur
```
server.js            Express + Socket.io: Profile, Shop, Matchmaking, 1v1-Partien, 4er/2v2, Freunde, Gruppen, Rätsel, Routen
server-admin.js      Anti-Cheat (nur eindeutiges Farming, Fälle ab 50 Punkten) + erweitertes Admin-Panel (Statistik, Events, Moderation, Protokoll, System)
server-casino.js     Casino: Blackjack, Mines (20 Felder, 1–10 Bomben), Roulette Rot/Schwarz/Grün – Zufall nur serverseitig
server-trade.js      Handel unter Freunden (Angebot -> annehmen/ablehnen, atomarer Tausch)
public/hub.html      PlayHub-Startseite (/) – Kacheln für Spiele, neue Spiele hier eintragen
public/index.html    SchachArena-Gerüst (unter /chess/), Tabs: Spielen, Bots, Shop, Inventar, Casino, Rangliste, Freunde, Replays, Profil
public/js/app.js     gesamte Schach-UI (Lobby, Spiel, Bots, Shop, Profil, Freunde/Gruppen, Replays, Admin-Grundlagen, Rätsel des Tages)
public/js/admin-extra.js  Admin-Panel-Tabs (Anti-Cheat, Statistik, Events & Shop, Moderation, Protokoll, System)
public/js/casino.js / trade.js   Casino-Tab / Handels-UI
public/js/catalog.js Bretter, Figuren-Skins, Formen, Finisher, Pakete, Bots, Abzeichen (25), Rätsel (60 Matt-in-1), Preise – gemeinsam für Server & Client
public/js/pieces.js  Figuren-SVGs, Formen, Blitz-Aura; Figuren werden im Browser einmal zu PNG gerastert (Leistung)
public/js/board.js   2D-Brett · board3d.js  spielbares 3D-Brett (Three.js) · finisher.js  3D-Finisher · four.js/fourboard.js  4er/2v2-Regeln & Brett
public/js/engine.js  Bot-Engine (Alpha-Beta, Web Worker); cfg: random/blunder/margin/noise/maxDepth/timeMs
public/css/style.css alles CSS (hinten angehängte Abschnitte überschreiben frühere)
```

## Wichtige Regeln & Werte
- Routen: `/` = PlayHub, `/chess/` = Schach. Alte Links (`/?join=…`, `/#casino`) leiten weiter. `/socket.io` und alte Asset-Pfade bleiben für offene Tabs.
- Partien (1v1 **und** 4er/2v2) werden nach jedem Zug gespeichert und nach einem Update vom neuen Server übernommen.
- Verbindungsabbruch: Partie gilt nach **1 Minute** als aufgegeben. **3× an einem Tag** durch Disconnect verlassen → 12 Std. Sperre. **4× hintereinander aufgegeben** → 30 Min. Sperre. Abbrüche durch Updates zählen nicht.
- Matchmaking 2v2/4er: eine Warteschlange pro Modus (Zeit = häufigste), Bots füllen nach 25 s auf, freie Spieler bekommen Einladungen.
- Anti-Cheat bewusst zurückhaltend: Spieler im selben WLAN (Schule!), Anfänger, Freunde mit echten Partien dürfen **nicht** markiert werden. Echte, ausgespielte Partien werden immer gewertet; bei vielen Siegen gegen denselben Gegner am Tag wird nur Elo reduziert.
- Bots: Noobi 0 Elo (55 % Zufallszüge) … Turm Theo 1600, Dame Diana 2200, Hugo ∞.
- Shop: Blitz-Paket 3.000 (Bundle `priceAdd: 1000`), sonst Bundle-Preis max. 2.000. 3D-Brett 3.000, 3D-Figuren 3.500.
- Profilsong bis 5 MB, Format wird am Dateiinhalt erkannt (OGG, MP3, M4A, WAV, AAC, FLAC, WebM).
- Browser-Tab heißt bewusst „Meine Kurse“ mit orangem „m“-Symbol (Wunsch des Besitzers) – im Seiteninhalt heißt das Spiel „SchachArena“.
- Leistung auf iPad/Handy beachten: keine `backdrop-filter`, nur `opacity`/`transform` animieren, Three.js nicht beim Start auf Touch-Geräten laden.
- Admins: per Spielercode in `ADMIN_CODES` (Render-Umgebungsvariable).
