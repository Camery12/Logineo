// Gemeinsamer Katalog für Server und Client: Bretter, Figuren, Finisher, Bundles, Bots, Belohnungen.

export const REWARDS = {
  start: 250,       // Startguthaben
  win: 200,         // Online-Sieg
  draw: 45,         // Online-Remis
  loss: 25,         // Trostgeld bei Niederlage
  botLoss: 5,       // Trostgeld gegen Bots (ab 10 Halbzügen)
};

// tex: prozedurale Texturen pro Feldfarbe (siehe textures.js)
//   kind: wood | marble | swirl | brushed | magma | caustic | noise | frost
export const BOARDS = [
  { id: 'klassisch', name: 'Klassisch Holz', price: 0, light: '#f0d9b5', dark: '#b58863', frame: '#5d3a1a', last: 'rgba(255, 213, 79, .55)', desc: 'Der zeitlose Turnier-Look.',
    tex: { light: { kind: 'wood', base: '#f0d9b5', accent: '#d9bd91' }, dark: { kind: 'wood', base: '#b58863', accent: '#8f6644' } } },
  { id: 'smaragd', name: 'Smaragd', price: 200, light: '#eeeed2', dark: '#769656', frame: '#3b4d2a', last: 'rgba(246, 246, 105, .6)', desc: 'Frisches Grün wie im Park.' },
  { id: 'ozean', name: 'Ozean', price: 250, light: '#dee9f3', dark: '#5b86b0', frame: '#1d3557', last: 'rgba(120, 220, 255, .55)', desc: 'Kühles Blau, ruhige Züge.' },
  { id: 'kupfer', name: 'Kupferwerk', price: 400, light: '#e9c9a6', dark: '#8f4f2c', frame: '#3a1c0c', last: 'rgba(255, 210, 120, .55)', desc: 'Gebürstetes Kupfer mit warmem Glanz.',
    tex: { light: { kind: 'brushed', base: '#e9c9a6', accent: '#f7e2c8' }, dark: { kind: 'brushed', base: '#8f4f2c', accent: '#b8693c' } } },
  { id: 'sakura', name: 'Kirschblüte', price: 500, light: '#fdeef3', dark: '#e58aa9', frame: '#5a2238', last: 'rgba(255, 255, 255, .55)', desc: 'Zarte Blüten auf rosa Marmor.',
    tex: { light: { kind: 'marble', base: '#fdeef3', accent: '#efc3d2' }, dark: { kind: 'swirl', base: '#e07b9e', accent: '#fff0f5', deep: '#b24a72' } } },
  { id: 'eis', name: 'Gletschereis', price: 600, light: '#eef4f6', dark: '#1f8090', frame: '#dfe8eb', last: 'rgba(120, 235, 255, .5)', desc: 'Weißer Marmor und türkisfarbenes Eis-Harz – richtig eisig.',
    tex: { light: { kind: 'marble', base: '#f1f5f7', accent: '#c4d0d6' }, dark: { kind: 'swirl', base: '#1d7d8c', accent: '#e8fbff', deep: '#0b4652' } }, frost: true },
  { id: 'marmor', name: 'Marmorpalast', price: 650, light: '#f2efea', dark: '#8d8a86', frame: '#2b2a28', last: 'rgba(212, 175, 55, .55)', desc: 'Edler Stein mit feinen Adern.',
    tex: { light: { kind: 'marble', base: '#f2efea', accent: '#bdb6ad' }, dark: { kind: 'marble', base: '#7f7c78', accent: '#c9c4bc' } } },
  { id: 'jade', name: 'Jadetempel', price: 750, light: '#eaf3ea', dark: '#2f7d5b', frame: '#1c3a2a', last: 'rgba(255, 236, 150, .55)', desc: 'Polierte Jade aus dem Kaiserpalast.',
    tex: { light: { kind: 'marble', base: '#eef5ec', accent: '#c6dcc6' }, dark: { kind: 'swirl', base: '#2f7d5b', accent: '#bfe8cf', deep: '#174a33' } } },
  { id: 'tiefsee', name: 'Tiefsee', price: 850, light: '#7fc4cf', dark: '#0f3d63', frame: '#061a2c', last: 'rgba(160, 255, 240, .5)', desc: 'Lichtspiele am Meeresgrund.',
    tex: { light: { kind: 'caustic', base: '#6fb8c6', accent: '#d8fbff' }, dark: { kind: 'caustic', base: '#0e3a5e', accent: '#3fa7c9' } } },
  { id: 'lava', name: 'Vulkan', price: 950, light: '#4a3b36', dark: '#1d1311', frame: '#120706', last: 'rgba(255, 170, 0, .5)', desc: 'Erkaltete Asche über glühendem Magma.',
    tex: { light: { kind: 'noise', base: '#55453f', accent: '#6d5a52' }, dark: { kind: 'magma', base: '#1d1311', accent: '#ff6a1a' } } },
  { id: 'mitternacht', name: 'Mitternacht', price: 1050, light: '#3e4a72', dark: '#151b36', frame: '#0a0e1f', last: 'rgba(255, 215, 120, .45)', desc: 'Nachtblau mit goldenem Sternenstaub.',
    tex: { light: { kind: 'noise', base: '#3e4a72', accent: '#56638f', stars: true }, dark: { kind: 'noise', base: '#151b36', accent: '#232b52', stars: true } } },
  { id: 'neon', name: 'Neon City', price: 1200, light: '#23214a', dark: '#11102a', frame: '#05040f', last: 'rgba(255, 61, 240, .45)', grid: '#39f0ff', overlay: 'linear-gradient(rgba(57,240,255,.08), rgba(255,61,240,.08))', desc: 'Cyberpunk mit leuchtendem Raster.' },
  { id: 'galaxie', name: 'Galaxie', price: 1450, light: 'rgba(255,255,255,.22)', dark: 'rgba(25,8,70,.55)', frame: '#0b0420', last: 'rgba(160, 120, 255, .6)', overlay: 'radial-gradient(circle at 20% 30%, #6a3fd1 0, transparent 35%), radial-gradient(circle at 80% 70%, #c2318f 0, transparent 40%), radial-gradient(circle at 60% 20%, #2b65d9 0, transparent 30%), #0d0626', stars: true, desc: 'Spiele zwischen den Sternen.' },
  { id: 'silber', name: 'Silber-Marmor', price: 550, light: '#d6d9dc', dark: '#2b2d31', frame: '#1b1c1f', last: 'rgba(220, 230, 255, .45)', desc: 'Schwarzer und weißer Marmor mit Silberrahmen – aus dem Starter-Pack.',
    tex: { light: { kind: 'marble', base: '#dcdfe2', accent: '#9aa1a8' }, dark: { kind: 'marble', base: '#2a2c30', accent: '#71777f' } } },
  { id: 'sandstein', name: 'Wüstensand', price: 450, light: '#ecd5a8', dark: '#b98a52', frame: '#5a3c1c', last: 'rgba(255, 240, 180, .55)', desc: 'Warmer Sandstein aus der Oase.',
    tex: { light: { kind: 'noise', base: '#ecd5a8', accent: '#f6e6c4' }, dark: { kind: 'wood', base: '#b98a52', accent: '#9a6f3e' } } },
  { id: 'carbon', name: 'Carbon', price: 850, light: '#4a4d55', dark: '#1a1c21', frame: '#0b0c0e', last: 'rgba(255, 70, 70, .45)', desc: 'Rennwagen-Carbon mit rotem Akzent.',
    tex: { light: { kind: 'brushed', base: '#4a4d55', accent: '#5e626b' }, dark: { kind: 'brushed', base: '#1a1c21', accent: '#2b2e35' } } },
  { id: 'nordlicht', name: 'Nordlicht', price: 1350, light: '#2c5c63', dark: '#120f2e', frame: '#06050f', last: 'rgba(120, 255, 200, .45)', desc: 'Polarlichter tanzen über das Brett.',
    tex: { light: { kind: 'swirl', base: '#2c6b6a', accent: '#8affc8', deep: '#173a45' }, dark: { kind: 'swirl', base: '#2a1a5c', accent: '#c48aff', deep: '#0d0a24' } } },
  { id: 'glasbruch', name: 'Zerbrochener Bildschirm', price: 1900, light: '#d6e1ec', dark: '#26324a', frame: '#0a0d14', last: 'rgba(160, 220, 255, .55)', desc: 'Gesprungenes Displayglas – als hätte jemand zu hart aufs Brett gehauen.',
    tex: { light: { kind: 'shards', base: '#e6eef6', accent: '#ffffff', deep: '#a9bbcd' }, dark: { kind: 'shards', base: '#2e3d5a', accent: '#a9dcff', deep: '#121929' } } },
  { id: 'riss', name: 'Realitätsriss', price: 2000, light: '#3e3168', dark: '#0b0716', frame: '#020104', last: 'rgba(255, 79, 216, .5)', desc: 'Die Leere zwischen den Dimensionen – durchzogen von leuchtenden Rissen.',
    tex: { light: { kind: 'rift', base: '#4d3d80', accent: '#7af7ff', accent2: '#ff4fd8', deep: '#1c1436' }, dark: { kind: 'rift', base: '#170d2c', accent: '#ff4fd8', accent2: '#7af7ff', deep: '#020104' } } },
  { id: 'royal', name: 'Königsgold', price: 2000, light: '#fff4d6', dark: '#c9a227', frame: '#3a2a00', last: 'rgba(255, 255, 255, .5)', desc: 'Nur für wahre Könige.',
    tex: { light: { kind: 'marble', base: '#fff4d6', accent: '#ecd9a8' }, dark: { kind: 'brushed', base: '#c9a227', accent: '#f2d675' } } },
  { id: 'gewitter', name: 'Gewitterfront', price: 1800, light: '#3a4568', dark: '#121830', frame: '#05070f', last: 'rgba(255, 226, 80, .55)', desc: 'Dunkle Sturmwolken, durchzogen von leuchtenden Blitzrissen – aus dem Blitz-Paket.',
    tex: { light: { kind: 'rift', base: '#3e4a70', accent: '#ffe45c', accent2: '#8fe3ff', deep: '#1b2340' }, dark: { kind: 'rift', base: '#141a33', accent: '#7ad7ff', accent2: '#ffe45c', deep: '#05070f' } } },
  // 3D-Brett: das Brett wird schräg im Raum gezeigt, die Figuren stehen aufrecht darauf
  { id: 'brett3d', name: '3D-Brett', price: 3000, view3d: true, light: '#ecd2a4', dark: '#8a5a32', frame: '#2a160a', last: 'rgba(255, 213, 79, .55)', desc: 'Das Brett steht schräg im Raum – mit dicker Holzplatte, Schatten und aufrecht stehenden Figuren. Echtes 3D-Gefühl beim Spielen.',
    tex: { light: { kind: 'wood', base: '#ecd2a4', accent: '#d6b47f' }, dark: { kind: 'wood', base: '#8a5a32', accent: '#6b4224' } } },
];

// Figuren-Skins: Füllverlauf, Kontur, Details, optional Marmor-Wirbel (swirl) + 3D-Materialwerte
export const PIECES = [
  { id: 'klassisch', name: 'Klassisch', price: 0, desc: 'Sauber und gut lesbar.',
    w: { fill: ['#ffffff', '#d9d9d9'], stroke: '#1f1f1f', detail: '#1f1f1f' },
    b: { fill: ['#575757', '#151515'], stroke: '#000000', detail: '#e6e6e6' },
    mat: { metal: 0.05, rough: 0.35 } },
  { id: 'holz', name: 'Handgeschnitzt', price: 400, desc: 'Warmes Holz aus der Werkstatt.',
    w: { fill: ['#f7dfb0', '#c8955a'], stroke: '#5a3517', detail: '#5a3517' },
    b: { fill: ['#7a4522', '#2e1608'], stroke: '#140700', detail: '#e2b47c' },
    mat: { metal: 0, rough: 0.7 } },
  { id: 'rubin', name: 'Saphir & Rubin', price: 700, desc: 'Funkelnde Edelsteine.',
    w: { fill: ['#8fd3ff', '#1458b0'], stroke: '#06244f', detail: '#e8f6ff' },
    b: { fill: ['#ff7b8b', '#8a0f22'], stroke: '#3a0410', detail: '#ffe0e5' },
    mat: { metal: 0.3, rough: 0.12 } },
  { id: 'sakura', name: 'Kirschblüte', price: 800, desc: 'Rosa Porzellan mit Blütenwirbeln.',
    w: { fill: ['#fff7fa', '#f6d3df'], stroke: '#a14466', detail: '#a14466', swirl: '#e9a3bc' },
    b: { fill: ['#d6336c', '#7a1238'], stroke: '#3d0718', detail: '#ffd6e5', swirl: '#ffc2d6' },
    mat: { metal: 0.05, rough: 0.2 } },
  { id: 'jade', name: 'Jade & Elfenbein', price: 1000, desc: 'Geschnitzt aus Elfenbein und Jade.',
    w: { fill: ['#fffaf0', '#e8dcc2'], stroke: '#6b5a3a', detail: '#6b5a3a', swirl: '#d9c9a4' },
    b: { fill: ['#5fb88a', '#1f6b4a'], stroke: '#0c2e1f', detail: '#e6fff1', swirl: '#c9f0da' },
    mat: { metal: 0.05, rough: 0.18 } },
  { id: 'gold', name: 'Gold & Obsidian', price: 1200, desc: 'Luxus pur – glänzt im Finisher.',
    w: { fill: ['#fff3b0', '#d4a017'], stroke: '#5e4300', detail: '#6b4e00' },
    b: { fill: ['#5b5b6b', '#111118'], stroke: '#d4a017', detail: '#f2cc4d' },
    mat: { metal: 0.9, rough: 0.25 } },
  { id: 'arktis', name: 'Arktis-Marmor', price: 1350, desc: 'Weißer Marmor gegen türkisfarbenes Eis-Harz.',
    w: { fill: ['#ffffff', '#e3eaee'], stroke: '#6f8590', detail: '#6f8590', swirl: '#7f97a3' },
    b: { fill: ['#35aebd', '#0d5662'], stroke: '#052e36', detail: '#eafcff', swirl: '#e9fbff' },
    mat: { metal: 0.05, rough: 0.1, opacity: 0.94 } },
  { id: 'kristall', name: 'Kristall', price: 1450, desc: 'Durchscheinend wie Eis.',
    w: { fill: ['rgba(235,248,255,.95)', 'rgba(140,200,255,.75)'], stroke: '#cfeeff', detail: '#2a6fa8' },
    b: { fill: ['rgba(170,120,255,.9)', 'rgba(60,20,130,.85)'], stroke: '#e6d6ff', detail: '#f1e8ff' },
    mat: { metal: 0.1, rough: 0.05, opacity: 0.82 } },
  { id: 'lava', name: 'Lava & Asche', price: 1650, desc: 'Graue Asche gegen glühendes Magmagestein.',
    w: { fill: ['#efeae4', '#b9b0a5'], stroke: '#4a4038', detail: '#4a4038', swirl: '#8f857a' },
    b: { fill: ['#2a1a16', '#0c0605'], stroke: '#ff6a1a', detail: '#ffb347', swirl: '#ff5a1a', glow: '#ff6a1a' },
    mat: { metal: 0.1, rough: 0.5, emissive: 0.5 } },
  { id: 'chrom', name: 'Silber-Chrom', price: 750, desc: 'Polierte Chromfiguren – aus dem Starter-Pack.',
    w: { fill: ['#f6f8fa', '#9ea6ae'], stroke: '#3a3f45', detail: '#3a3f45' },
    b: { fill: ['#8d939c', '#25282d'], stroke: '#0c0e10', detail: '#dfe3e8' },
    mat: { metal: 0.9, rough: 0.24 } },
  { id: 'bronze', name: 'Bronze & Kupfer', price: 900, desc: 'Gegossen in der Schmiede.',
    w: { fill: ['#f2c98a', '#b07a3a'], stroke: '#4a2c0c', detail: '#4a2c0c' },
    b: { fill: ['#b0603a', '#4a2010'], stroke: '#1e0a02', detail: '#f2c98a' },
    mat: { metal: 0.85, rough: 0.3 } },
  { id: 'toxic', name: 'Toxisch', price: 1550, desc: 'Giftgrün gegen Radioaktiv-Lila.',
    w: { fill: ['#c8ff6a', '#3f9a12'], stroke: '#0f2a02', detail: '#0f2a02', swirl: '#effff0' },
    b: { fill: ['#a35cff', '#3a0f75'], stroke: '#14042c', detail: '#f0e2ff', swirl: '#e4c8ff' },
    mat: { metal: 0.1, rough: 0.25, emissive: 0.35 } },
  { id: 'geist', name: 'Geisterhaft', price: 2000, desc: 'Halb durchsichtig und unheimlich leuchtend.',
    w: { fill: ['rgba(255,255,255,.85)', 'rgba(200,230,255,.55)'], stroke: '#e8f6ff', detail: '#5aa8ff', glow: '#bfe3ff' },
    b: { fill: ['rgba(60,20,90,.85)', 'rgba(10,0,25,.75)'], stroke: '#b98cff', detail: '#e7d6ff', glow: '#9a5cff' },
    mat: { metal: 0.05, rough: 0.1, opacity: 0.7, emissive: 0.5 } },
  { id: 'prisma', name: 'Prisma', price: 1900, desc: 'Geschliffenes Glas, das das Licht in Regenbogenfarben bricht.',
    w: { fill: ['rgba(255,255,255,.96)', 'rgba(175,215,255,.8)'], stroke: '#ffffff', detail: '#ff5ad1', swirl: '#b9f3ff', glow: '#9fd8ff' },
    b: { fill: ['rgba(52,62,90,.95)', 'rgba(12,14,26,.9)'], stroke: '#9fd8ff', detail: '#ffd36a', swirl: '#c08cff', glow: '#5ad1ff' },
    mat: { metal: 0.15, rough: 0.04, opacity: 0.88, emissive: 0.3 } },
  { id: 'antimaterie', name: 'Antimaterie', price: 2000, desc: 'Figuren aus einer anderen Dimension – sie glühen zwischen den Welten.',
    w: { fill: ['#ffffff', '#bff6ff'], stroke: '#00d5ee', detail: '#00a8c4', swirl: '#7af7ff', glow: '#7af7ff' },
    b: { fill: ['#1a0026', '#050008'], stroke: '#ff4fd8', detail: '#ff4fd8', swirl: '#ff8ae8', glow: '#ff4fd8' },
    mat: { metal: 0.3, rough: 0.2, emissive: 0.7 } },
  // 3D-Figuren: werden im Browser mit echten 3D-Modellen gerendert (Elfenbein & Klavierlack); die Farben unten sind nur der Platzhalter
  { id: 'figuren3d', name: '3D-Figuren', price: 3500, render3d: true, desc: 'Echte 3D-Modelle aus Elfenbein und schwarzem Klavierlack – mit Licht, Spiegelungen und Glanz.',
    w: { fill: ['#fbf6ec', '#d9cdb6'], stroke: '#5a4a32', detail: '#5a4a32' },
    b: { fill: ['#3a3a42', '#121216'], stroke: '#000000', detail: '#c9c9d4' },
    mat: { metal: 0.12, rough: 0.22 } },
  // Blitz: echte, animierte Blitz-Aura um jede Figur (aura: 'lightning')
  { id: 'blitz', name: 'Blitz', price: 2200, aura: 'lightning', desc: 'Geladene Figuren mit echter Blitz-Aura: Um jede Figur zucken knisternde Blitze – golden bei Weiß, eisblau bei Schwarz.',
    w: { fill: ['#fffdf0', '#ffd23f'], stroke: '#6b4700', detail: '#4a3000', glow: '#ffe45c' },
    b: { fill: ['#2c3566', '#0a0d24'], stroke: '#7ad7ff', detail: '#bdf0ff', glow: '#4cc9ff' },
    mat: { metal: 0.35, rough: 0.2, emissive: 0.75 } },
  { id: 'neon', name: 'Neon', price: 1800, desc: 'Leuchtet im Dunkeln.',
    w: { fill: ['#0f2a3d', '#071320'], stroke: '#39f0ff', detail: '#39f0ff', glow: '#39f0ff' },
    b: { fill: ['#3a0f3d', '#170620'], stroke: '#ff3df0', detail: '#ff3df0', glow: '#ff3df0' },
    mat: { metal: 0.2, rough: 0.3, emissive: 0.9 } },
];

// Figuren-Formen: andere Silhouetten, die Farben kommen weiter vom Figuren-Skin
export const SHAPES = [
  { id: 'klassisch', name: 'Klassisch', price: 0, icon: '♞', desc: 'Die bekannten Staunton-Figuren.' },
  { id: 'abzeichen', name: 'Spielsteine', price: 500, icon: '🪙', desc: 'Runde Spielsteine mit Buchstaben (K, D, T, L, S, B) – super übersichtlich.' },
  { id: 'modern', name: 'Modern', price: 800, icon: '🔷', desc: 'Klare geometrische Formen: Kreise, Dreiecke und Sterne.' },
  { id: 'kawaii', name: 'Kawaii', price: 1200, icon: '🥰', desc: 'Süße Figuren mit Kulleraugen und roten Bäckchen.' },
  { id: 'pixel', name: 'Pixel', price: 1500, icon: '👾', desc: 'Figuren im 8-Bit-Retro-Look wie im alten Videospiel.' },
];

export const FINISHERS = [
  { id: 'klassisch', name: 'Königssturz', price: 0, icon: '♚', desc: 'Der König kippt in Zeitlupe um.' },
  { id: 'viertewand', name: 'Vierte Wand', price: 2500, icon: '🪟', ultra: true, desc: 'Der König kracht durch deinen Bildschirm – das Glas zerspringt und die ganze Website stürzt ein.' },
  { id: 'riss', name: 'Realitätsriss', price: 2500, icon: '🌀', ultra: true, desc: 'Ein Riss in der Realität verschluckt den König, reißt den Bildschirm auf und saugt die ganze Website hinein.' },
  { id: 'feuerwerk', name: 'Feuerwerk', price: 600, icon: '🎆', desc: 'Der König startet als Rakete und explodiert bunt.' },
  { id: 'blitz', name: 'Donnerschlag', price: 900, icon: '⚡', desc: 'Drei Blitze schlagen ein – der König zerfällt.' },
  { id: 'glitch', name: 'Datenzerfall', price: 900, icon: '👾', desc: 'Der König glitcht, zerfällt in Pixel und wird gelöscht.' },
  { id: 'meteor', name: 'Meteoriteneinschlag', price: 1000, icon: '☄️', desc: 'Ein glühender Meteor zerschmettert den König.' },
  { id: 'kanone', name: 'Kanonenschuss', price: 1100, icon: '💣', desc: 'Eine Kanone feuert – der König fliegt in hohem Bogen vom Brett.' },
  { id: 'tornado', name: 'Wirbelsturm', price: 1250, icon: '🌪️', desc: 'Ein Tornado reißt den König und seine Leibwache in die Luft.' },
  { id: 'kristall', name: 'Eissplitter', price: 1400, icon: '❄️', desc: 'Der König gefriert und zerspringt in tausend Splitter.' },
  { id: 'samurai', name: 'Samurai-Schnitt', price: 1500, icon: '⚔️', desc: 'Ein Schwerthieb in Zeitlupe – der König wird zweigeteilt.' },
  { id: 'erdbeben', name: 'Erdbeben', price: 1600, icon: '🌋', desc: 'Das Brett reißt auf, Magma glüht – der König stürzt in die Tiefe.' },
  { id: 'loch', name: 'Schwarzes Loch', price: 1900, icon: '🌀', desc: 'Ein schwarzes Loch saugt den König ins Nichts.' },
  { id: 'hammer', name: 'Donnerhammer', price: 2100, icon: '🔨', desc: 'Ein riesiger Blitzhammer kracht vom Himmel und macht den König platt.' },
  { id: 'midas', name: 'Midas-Touch', price: 750, icon: '✨', desc: 'Die Figur, die Matt setzt, berührt den König – er erstarrt zu purem Gold.' },
  { id: 'ak', name: 'Kugelhagel', price: 1750, icon: '🔫', desc: 'Die Matt-Figur zieht ein Sturmgewehr und ballert den König vom Brett.' },
  { id: 'feuersturm', name: 'Feuersturm', price: 1400, icon: '🔥', desc: 'Ein Flammensturm vom Himmel – der König schmilzt zu einer glühenden Pfütze.' },
  { id: 'rakete', name: 'Raketenschlag', price: 1900, icon: '🚀', desc: 'Eine Rakete schlägt ein – Feuerball, Druckwelle, alles fliegt.' },
  { id: 'ufo', name: 'Entführung', price: 1600, icon: '🛸', desc: 'Ein UFO beamt den König hoch und verschwindet mit ihm.' },
  { id: 'supernova', name: 'Supernova', price: 2500, icon: '🌟', desc: 'Der König glüht auf, implodiert – und explodiert wie ein Stern.' },
  { id: 'portal', name: 'Portal-Schleife', price: 1500, icon: '🌀', desc: 'Der König fällt durch ein Portal, kommt oben wieder raus und schlägt ein.' },
  { id: 'krake', name: 'Tiefseekrake', price: 1750, icon: '🐙', desc: 'Tentakel brechen durchs Brett und ziehen den König in die Tiefe.' },
  { id: 'bowling', name: 'Strike!', price: 1100, icon: '🎳', desc: 'Eine riesige Bowlingkugel räumt den König und alles in ihrer Bahn ab.' },
  { id: 'schwerkraft', name: 'Schwerkraftbruch', price: 2000, icon: '🪐', desc: 'Alles schwebt – dann kehrt die Schwerkraft zehnfach zurück.' },
  { id: 'shuriken', name: 'Klingensturm', price: 1400, icon: '✴️', desc: 'Ein Hagel aus Wurfsternen zerlegt den König.' },
  { id: 'lawine', name: 'Lawine', price: 1250, icon: '🏔️', desc: 'Eine Schneelawine rollt heran und begräbt den König.' },
  { id: 'laser', name: 'Orbital-Laser', price: 2250, icon: '🛰️', desc: 'Zielerfassung aus dem All – ein gigantischer Laserstrahl verdampft den König.' },
];

// Bundles: Brett + Figuren + Finisher günstiger. Bereits Gekauftes wird nicht nochmal berechnet.
export const BUNDLES = [
  { id: 'starter', name: 'Starter-Pack', icon: '🎁', discount: 1, items: [['board', 'silber'], ['pieces', 'chrom'], ['finisher', 'midas']], desc: 'Kostenlos für alle: Silber-Marmor-Brett, Silber-Chrom-Figuren und der Midas-Touch.' },
  { id: 'blitz', name: 'Blitz-Paket', icon: '⚡', discount: 0.25, isNew: true, priceAdd: 1000, items: [['board', 'gewitter'], ['pieces', 'blitz'], ['finisher', 'blitz']], desc: 'NEU: Figuren mit echter Blitz-Aura, das Gewitterfront-Brett und der Donnerschlag-Finisher.' },
  { id: 'viertewand', name: 'Vierte-Wand-Paket', icon: '🪟', discount: 0.25, isNew: true, items: [['board', 'glasbruch'], ['pieces', 'prisma'], ['finisher', 'viertewand']], desc: 'NEU: Zerbrochener Bildschirm, Prisma-Glasfiguren und der Finisher, der aus dem Bildschirm bricht.' },
  { id: 'realitaet', name: 'Realitätsriss-Paket', icon: '🌀', discount: 0.25, isNew: true, items: [['board', 'riss'], ['pieces', 'antimaterie'], ['finisher', 'riss']], desc: 'NEU: Die Leere zwischen den Dimensionen, Antimaterie-Figuren und der Riss, der die ganze Website verschluckt.' },
  { id: 'eiszeit', name: 'Eiszeit-Paket', icon: '🧊', discount: 0.2, items: [['board', 'eis'], ['pieces', 'arktis'], ['finisher', 'kristall']], desc: 'Gletschereis-Brett, Arktis-Marmor-Figuren und der Eissplitter-Finisher.' },
  { id: 'sakura', name: 'Kirschblüten-Paket', icon: '🌸', discount: 0.2, items: [['board', 'sakura'], ['pieces', 'sakura'], ['finisher', 'samurai']], desc: 'Kirschblüten-Brett und -Figuren plus Samurai-Schnitt.' },
  { id: 'vulkan', name: 'Vulkan-Paket', icon: '🌋', discount: 0.2, items: [['board', 'lava'], ['pieces', 'lava'], ['finisher', 'erdbeben']], desc: 'Vulkan-Brett, Lava-Figuren und das Erdbeben.' },
  { id: 'natur', name: 'Natur-Paket', icon: '🍃', discount: 0.15, items: [['board', 'jade'], ['pieces', 'jade'], ['finisher', 'tornado']], desc: 'Jadetempel, Jade-Figuren und der Wirbelsturm.' },
  { id: 'cyber', name: 'Cyber-Paket', icon: '🌆', discount: 0.2, items: [['board', 'neon'], ['pieces', 'neon'], ['finisher', 'glitch']], desc: 'Neon City, Neon-Figuren und Datenzerfall.' },
  { id: 'koenig', name: 'Königs-Paket', icon: '👑', discount: 0.25, items: [['board', 'royal'], ['pieces', 'gold'], ['finisher', 'laser']], desc: 'Das Luxuriöseste: Königsgold, Gold & Obsidian und der Orbital-Laser.' },
];

// Bots – Spielstärke passend zum Elo:
// random: Wahrscheinlichkeit für einen völlig zufälligen Zug (wie jemand, der die Figuren gerade erst kennt)
// blunder/margin: Fehlzug aus Zügen, die höchstens `margin` Centipawns schlechter sind · noise: Unschärfe der Bewertung
// maxDepth/timeMs: wie weit voraus gerechnet wird
export const BOTS = [
  { id: 1, name: 'Noobi', level: 'Totaler Neuling', elo: 0, avatar: '🐣', color: '#7ee787', reward: 15, finisher: 'klassisch', cfg: { random: 0.55, maxDepth: 1, timeMs: 60, noise: 350, blunder: 0.3, margin: 900 }, quote: 'Hab gestern erst angefangen … wie zieht nochmal das Pferd?' },
  { id: 2, name: 'Bauer Bernd', level: 'Anfänger', elo: 400, avatar: '👨‍🌾', color: '#a5d6ff', reward: 30, finisher: 'klassisch', cfg: { random: 0.15, maxDepth: 1, timeMs: 120, noise: 200, blunder: 0.3, margin: 450 }, quote: 'Ich kenne schon alle Regeln – fast.' },
  { id: 3, name: 'Springer Sam', level: 'Fortgeschritten', elo: 800, avatar: '🐴', color: '#d2a8ff', reward: 60, finisher: 'feuerwerk', cfg: { random: 0.03, maxDepth: 2, timeMs: 300, noise: 90, blunder: 0.17, margin: 250 }, quote: 'Hüpf, hüpf – Gabel!' },
  { id: 4, name: 'Läufer Lena', level: 'Experte', elo: 1200, avatar: '🦊', color: '#ffa657', reward: 110, finisher: 'blitz', cfg: { maxDepth: 3, timeMs: 600, noise: 45, blunder: 0.08, margin: 130 }, quote: 'Diagonalen sind mein Revier.' },
  { id: 5, name: 'Turm Theo', level: 'Meister', elo: 1600, avatar: '🏰', color: '#ff7b72', reward: 200, finisher: 'meteor', cfg: { maxDepth: 4, timeMs: 1000, noise: 18, blunder: 0.03, margin: 70 }, quote: 'Mauern brechen? Viel Glück.' },
  { id: 6, name: 'Dame Diana', level: 'Schlau', elo: 2200, avatar: '👑', color: '#f2cc60', reward: 400, finisher: 'loch', cfg: { maxDepth: 30, timeMs: 2500, noise: 0, blunder: 0 }, quote: 'Ich habe deinen Zug schon gesehen.' },
  // Hugo: volle Rechenzeit, keine Fehler, kein vorzeitiges Abbrechen – das Stärkste, was die Engine kann
  { id: 7, name: 'Hugo', level: 'Legende', elo: Infinity, legend: true, avatar: '🧠', color: '#c084fc', reward: 2500, finisher: 'supernova', cfg: { maxDepth: 40, timeMs: 7000, noise: 0, blunder: 0, full: true }, quote: 'Ich habe jede Partie schon gespielt – auch deine.' },
];
export const eloText = (b) => (b.elo === Infinity ? '∞' : String(b.elo));

export const CATALOG = { board: BOARDS, pieces: PIECES, finisher: FINISHERS, shape: SHAPES };
// Aussehen der Figuren eines Spielers: Skin + Form (z. B. "gold@pixel"), klassische Form ohne Zusatz
export const pieceLook = (eq) => (eq?.shape && eq.shape !== 'klassisch' ? `${eq.pieces || 'klassisch'}@${eq.shape}` : eq?.pieces || 'klassisch');
export const splitLook = (look) => { const [skin, shape] = String(look || 'klassisch').split('@'); return { skin: skin || 'klassisch', shape: shape || 'klassisch' }; };
export const findItem = (kind, id) => (CATALOG[kind] || []).find((x) => x.id === id);

// Bundle-Preis: Summe der noch nicht gekauften Teile minus Rabatt (auf 10 gerundet)
export function bundlePrice(bundle, owned) {
  const missing = bundle.items.filter(([k, id]) => !owned?.[k]?.includes(id));
  const full = missing.reduce((s, [k, id]) => s + (findItem(k, id)?.price || 0), 0);
  return { price: Math.min(2000, Math.round((full * (1 - bundle.discount)) / 10) * 10) + (missing.length ? bundle.priceAdd || 0 : 0), full, missing }; // höchstens 2.000 (+ priceAdd)
}

export const AVATAR_EMOJIS = ['♞', '♛', '♜', '♝', '🦁', '🐺', '🦊', '🐉', '🦅', '🐼', '🐯', '🦄', '🐙', '🐧', '🤖', '👾', '🧙', '🥷', '🦸', '🔥', '⚡', '🌙', '⭐', '💎'];
export const AVATAR_COLORS = ['#7c5cff', '#22d3ee', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#64748b', '#eab308'];

// ---------------------------------------------------------------- Profil-Studio (alles kostenlos anpassbar)
export const PROFILE_OPTIONS = {
  banner: [
    ['standard', 'Standard'], ['aurora', 'Polarlicht'], ['feuer', 'Inferno'], ['galaxie', 'Galaxie'], ['matrix', 'Matrix'],
    ['gold', 'Goldrausch'], ['ozean', 'Tiefsee'], ['neon', 'Neon-Grid'], ['sakura', 'Kirschblüte'], ['sunset', 'Sonnenuntergang'],
    ['gewitter', 'Gewitter'], ['bild', 'Eigenes Bild'],
  ],
  frame: [['keiner', 'Kein Rahmen'], ['gold', 'Gold'], ['silber', 'Silber'], ['neon', 'Neon'], ['feuer', 'Feuer'], ['eis', 'Eis'], ['regenbogen', 'Regenbogen'], ['diamant', 'Diamant']],
  nameFx: [['keiner', 'Normal'], ['glanz', 'Glanz'], ['gold', 'Gold'], ['regenbogen', 'Regenbogen'], ['feuer', 'Feuer'], ['eis', 'Eis'], ['glitch', 'Glitch'], ['admin', 'Admin-Glanz']], // admin: nur für Admins
  particles: [['keine', 'Keine'], ['sterne', 'Sterne'], ['funken', 'Funken'], ['schnee', 'Schnee'], ['blueten', 'Blüten'], ['blasen', 'Blasen'], ['konfetti', 'Konfetti']],
  accent: ['#7c5cff', '#22d3ee', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#eab308', '#ffffff', '#a3e635'],
};
export const DEFAULT_CUSTOM = { banner: 'standard', frame: 'keiner', nameFx: 'keiner', particles: 'keine', accent: '#7c5cff', bio: '', showInventory: true, showcase: null, bannerImg: null };
export const MUSIC_MAX_BYTES = 3_000_000;   // 3 MB (≈ 2–3 Min. MP3)
export const MUSIC_MAX_VOLUME = 0.35;       // Lautstärke-Limit für Profilsongs

// ---------------------------------------------------------------- Abzeichen (Badges): 25 Stück in 5 Seltenheitsstufen
export const RARITIES = {
  common: { name: 'Gewöhnlich', rank: 1 },
  rare: { name: 'Selten', rank: 2 },
  epic: { name: 'Episch', rank: 3 },
  legendary: { name: 'Legendär', rank: 4 },
  mythic: { name: 'Mythisch', rank: 5 },
};
// test(u, ctx): ctx = { rank } (Platz in der Rangliste, 0 = nicht drin)
const botWon = (u, id) => (u.botsBeaten || []).includes(id) || (u.vsBot?.[BOTS.find((b) => b.id === id)?.name]?.w || 0) > 0;
const bestStreak = (u) => { let best = 0, cur = 0; for (const h of [...(u.history || [])].reverse()) { if (h.type !== 'online' || h.unrated) continue; cur = h.outcome === 'win' ? cur + 1 : 0; best = Math.max(best, cur); } return Math.max(best, u.bestStreak || 0); };
const ownedCount = (u) => ['board', 'pieces', 'finisher', 'shape'].reduce((s, k) => s + (u.owned?.[k]?.length || 0), 0);
export const BADGES = [
  // Rangliste
  { id: 'rank1', icon: '👑', name: 'Nummer 1', rarity: 'mythic', desc: 'Platz 1 der Rangliste.', test: (u, c) => c.rank === 1 },
  { id: 'top3', icon: '🥇', name: 'Top 3', rarity: 'legendary', desc: 'Unter den besten 3 der Rangliste.', test: (u, c) => c.rank >= 1 && c.rank <= 3 },
  { id: 'top10', icon: '🏅', name: 'Top 10', rarity: 'epic', desc: 'Unter den besten 10 der Rangliste.', test: (u, c) => c.rank >= 1 && c.rank <= 10 },
  // Elo
  { id: 'elo500', icon: '📈', name: 'Aufsteiger', rarity: 'common', desc: '500 Elo erreicht.', test: (u) => u.rating >= 500 },
  { id: 'elo1000', icon: '⚔️', name: 'Kämpfer', rarity: 'rare', desc: '1.000 Elo erreicht.', test: (u) => u.rating >= 1000 },
  { id: 'elo1500', icon: '🛡️', name: 'Meister', rarity: 'epic', desc: '1.500 Elo erreicht.', test: (u) => u.rating >= 1500 },
  { id: 'elo2000', icon: '🌟', name: 'Großmeister', rarity: 'legendary', desc: '2.000 Elo erreicht.', test: (u) => u.rating >= 2000 },
  // Bots
  { id: 'bot2', icon: '👨‍🌾', name: 'Bauernschreck', rarity: 'common', desc: 'Bauer Bernd besiegt.', test: (u) => botWon(u, 2) },
  { id: 'bot3', icon: '🐴', name: 'Springer-Jäger', rarity: 'rare', desc: 'Springer Sam besiegt.', test: (u) => botWon(u, 3) },
  { id: 'bot4', icon: '🦊', name: 'Fuchsfänger', rarity: 'rare', desc: 'Läufer Lena besiegt.', test: (u) => botWon(u, 4) },
  { id: 'bot5', icon: '🏰', name: 'Turmstürmer', rarity: 'epic', desc: 'Turm Theo besiegt.', test: (u) => botWon(u, 5) },
  { id: 'bot6', icon: '👸', name: 'Damenbezwinger', rarity: 'legendary', desc: 'Dame Diana besiegt.', test: (u) => botWon(u, 6) },
  { id: 'bot7', icon: '🧠', name: 'Hugos Albtraum', rarity: 'mythic', desc: 'Hugo, die Legende, besiegt.', test: (u) => botWon(u, 7) },
  // Online
  { id: 'firstwin', icon: '🎯', name: 'Erster Sieg', rarity: 'common', desc: 'Erste gewonnene Online-Partie.', test: (u) => u.stats.wins >= 1 },
  { id: 'games50', icon: '♟️', name: 'Stammspieler', rarity: 'rare', desc: '50 Online-Partien gespielt.', test: (u) => u.stats.games >= 50 },
  { id: 'wins100', icon: '💯', name: 'Hundert Siege', rarity: 'epic', desc: '100 Online-Partien gewonnen.', test: (u) => u.stats.wins >= 100 },
  { id: 'streak5', icon: '🔥', name: 'Siegesserie', rarity: 'epic', desc: '5 Online-Siege hintereinander.', test: (u) => bestStreak(u) >= 5 },
  { id: 'mates25', icon: '☠️', name: 'Mattsetzer', rarity: 'rare', desc: '25 Mal schachmatt gesetzt.', test: (u) => u.stats.mates >= 25 },
  { id: 'teams10', icon: '🤝', name: 'Teamplayer', rarity: 'epic', desc: '10 Siege im 2 vs 2.', test: (u) => (u.stats.teams?.wins || 0) >= 10 },
  { id: 'four5', icon: '👥', name: 'König der Vier', rarity: 'epic', desc: '5 Mal 4er-Schach gewonnen.', test: (u) => (u.stats.four?.wins || 0) >= 5 },
  // Sammeln & Gemeinschaft
  { id: 'rich', icon: '💰', name: 'Schatzmeister', rarity: 'rare', desc: '10.000 Münzen auf einmal besessen.', test: (u) => u.coins >= 10000 || (u.maxCoins || 0) >= 10000 },
  { id: 'collector', icon: '🎨', name: 'Sammler', rarity: 'epic', desc: '25 Shop-Teile im Inventar.', test: (u) => ownedCount(u) >= 25 },
  { id: 'friends10', icon: '👋', name: 'Beliebt', rarity: 'rare', desc: '10 Freunde.', test: (u) => (u.friends?.length || 0) >= 10 },
  { id: 'play24', icon: '⏱️', name: 'Dauerbrenner', rarity: 'epic', desc: '24 Stunden auf SchachArena verbracht.', test: (u) => (u.playMs || 0) >= 24 * 3600_000 },
  { id: 'veteran', icon: '🎂', name: 'Veteran', rarity: 'rare', desc: 'Seit 30 Tagen dabei.', test: (u) => Date.now() - (u.createdAt || Date.now()) >= 30 * 86_400_000 },
];
// Alle verdienten Abzeichen, seltenste zuerst (die ersten 3 werden am Profil gezeigt)
export function computeBadges(u, ctx = {}) {
  if (!u?.stats) return [];
  return BADGES.filter((b) => { try { return b.test(u, ctx); } catch { return false; } })
    .sort((a, b) => RARITIES[b.rarity].rank - RARITIES[a.rarity].rank || BADGES.indexOf(a) - BADGES.indexOf(b)).map((b) => b.id);
}
export const findBadge = (id) => BADGES.find((b) => b.id === id);

// ---------------------------------------------------------------- Rätsel des Tages: Matt in 1 (jeweils genau eine Lösung)
export const PUZZLES = [
  ["r2qk2r/2p1ppbp/6p1/Pp4B1/2pn2b1/6P1/P1Q1PP1P/RN2KB1R b KQkq - 1 13", "Nxc2#"],
  ["3Qbkr1/2p5/4p2p/4B3/p3N2P/4K2R/PPP3P1/1R1N4 w - - 1 41", "Rf3#"],
  ["3r4/r2qkp1p/1Rn2bpB/2p1p3/2b1P3/p3K1P1/5P1P/4Q1NR b - - 1 31", "Qd3#"],
  ["3Q1bk1/P5p1/8/p7/3P2p1/4B1P1/5K2/5b1R w - - 1 46", "Qd5#"],
  ["r4br1/pbp1pkpp/1pqp4/5p2/P1PP4/3nP3/RPN3PP/2B2KNR b - - 3 15", "Qxg2#"],
  ["8/3k2p1/4p3/pRp2rPp/p4b1P/8/2P1q3/6KR b - - 4 38", "Be3#"],
  ["1r1k4/5p2/1p6/p1pnq3/P5b1/1P4P1/4B3/RNBK3Q b - - 3 39", "Qxe2#"],
  ["r1b5/pp1p3Q/n2pk3/8/1PP1Pq2/P1B2p2/5PPP/RN2KB1R b KQ - 2 21", "Qc1#"],
  ["1R6/1p1kp3/1p6/5pP1/1P1n1P1K/4r1P1/8/5r2 b - - 1 48", "Rh1#"],
  ["2kr4/1ppnb1pr/4p1q1/Q4p1p/4PB2/1PP3NR/P4P1P/3RK3 w - - 0 24", "Qxc7#"],
  ["3r4/1b1k2p1/6p1/2Q4n/p4P2/P2P1p1P/5K2/4R3 w - - 5 38", "Re7#"],
  ["r1b1r1k1/1pnp3p/p2b3B/3P4/3p3P/P5PK/RPP3BR/1N2q1N1 b - - 0 26", "Qxg3#"],
  ["4r3/3kbppp/7n/4pb1q/1pp5/4P2B/1R1PnP1K/1N3R2 b - - 7 31", "Qxh3#"],
  ["Rqk5/4pp2/2P4B/2P5/1p2np2/3QP2P/1r4P1/4K1R1 w - - 7 35", "Qd7#"],
  ["4k1r1/7Q/3r2n1/4p3/8/Rq5P/3PNPP1/5K1R b - - 1 27", "Qd1#"],
  ["r1b3R1/1p2Pk2/p1p2p2/P4n1p/1P2N3/2P3P1/1B1KP2p/5BR1 w - - 2 37", "e8=Q#"],
  ["8/7k/2r3p1/1N1b3p/P6P/4p3/1P6/K5N1 b - - 1 38", "Rc1#"],
  ["B1b1kr2/6R1/2P1p3/2n4p/3P4/2pn4/R1P1K3/3Q2Nq b - - 2 29", "Qe4#"],
  ["r2qk3/5b1r/1pP5/p4R2/3p1b1p/P6P/4P1P1/1N1KQB1R b q - 0 29", "Bb3#"],
  ["8/8/5p1p/2p2kPP/p7/R1K3P1/3r4/4q3 b - - 4 51", "Qc1#"],
  ["r4k2/pb1p1p2/8/qppN2Bp/P4NrP/1B2P2R/PQPPKP2/R7 w - - 2 24", "Qh8#"],
  ["8/pb3p1p/8/5kP1/q4P2/3P3P/2r2R2/4K3 b - - 4 41", "Qa1#"],
  ["2Q2br1/8/1k5p/1ppbPQp1/4P2R/R1P1K3/2P4P/2B5 w - - 3 39", "Ra6#"],
  ["3B3k/1b3Qb1/pp5p/3BpP2/8/6P1/5N1P/6K1 w - - 1 43", "Qg8#"],
  ["1rb1r1k1/1p5p/4P1p1/p4p2/P4P2/8/2P1PbNP/2RK1BR1 b - - 0 30", "Rd8#"],
  ["r3k3/1pp4p/6p1/p1b1Pb2/P7/2K1P3/1PN3qP/4R2R b - - 1 27", "Qxc2#"],
  ["5r2/2p3pp/p1k3n1/p1b2pPK/7P/1P6/8/R7 b - - 1 42", "Nf4#"],
  ["5r2/kq1Q2p1/8/4P3/pR1p4/P2P3B/2P4P/6K1 w - - 6 48", "Qxb7#"],
  ["1n2k3/1rp2pb1/1p1p2p1/pP1P3p/4q3/PK5P/B7/1N1QR3 b - - 11 39", "a4#"],
  ["5kr1/p3Rp1p/2p5/8/p5q1/8/PP4PK/8 b - - 2 40", "Qxg2#"],
  ["2b4r/r1pp4/pp6/4knB1/B2NP1Pp/PQ1P1P1P/1P6/R4RK1 w - - 1 28", "Qd5#"],
  ["8/2kb1pp1/2q5/6PQ/1b2rP1p/3K4/PPN3RP/R4B2 b - - 3 39", "Qc4#"],
  ["2kr4/1b1p1p1p/2pB4/Q5p1/p2nP1PP/3P1P2/PPP4q/2R1KB2 w - - 1 27", "Qc7#"],
  ["3r2k1/1r4p1/2p1p1P1/1p2Pp1P/4pP2/1b2B3/2qQ4/6KR w - - 0 49", "Qxd8#"],
  ["r1b1k2r/1p3ppp/1pp1p3/q7/3pK2P/5P1N/PPP1Pb2/1RBQ1n2 b kq - 1 15", "Qf5#"],
  ["r6r/1pp1k1b1/p2p1qpp/P1n5/8/RP1P1PPb/2PN3P/3Q2KR b - - 0 25", "Qd4#"],
  ["2bk4/1rp1bp1p/2np3p/p7/3r2P1/4Q2P/2PNP3/3KRBNR b - - 1 24", "Rb1#"],
  ["1r2k3/R3n3/4rp2/1P5P/2N2p2/6q1/8/3N3K b - - 7 59", "Re1#"],
  ["8/1p6/1kP4P/2b1P3/2p1P3/5qP1/P7/4K3 b - - 2 50", "Bb4#"],
  ["2b5/1ppk4/5n2/4rp1p/r4b1P/1pPP1KpR/6P1/3R1B2 b - - 1 35", "Re3#"],
  ["r1bqkb1r/p1ppp2p/1pn1P3/5pp1/8/5Q2/PPPN1PPP/R1B1KBNR w KQkq - 0 10", "Qh5#"],
  ["2b4r/8/3N2kp/6p1/5P2/1Q4PP/2PK4/8 w - - 1 48", "Qf7#"],
  ["5br1/k7/1p6/r1Bp2P1/pK2p1P1/P1P5/PR6/8 b - - 1 47", "Bxc5#"],
  ["1r4r1/1p1b1pk1/3Bp1p1/4P1P1/p7/3pPNP1/Pbq2P2/R3K1R1 b - - 6 29", "Qe2#"],
  ["r1b1k2r/2ppbppp/ppn5/4p1P1/3NPqn1/1BN5/PPPP1P1P/R1BQ2RK b kq - 4 12", "Qxh2#"],
  ["rnR5/2p4Q/p2b4/1pPp4/6kP/2N1B3/P1P1Pp2/R2K1B2 w - - 3 34", "Rg8#"],
  ["1n6/3p2Q1/4kP2/1p1p1q2/1P5p/2P5/8/K1B4n w - - 2 39", "Qe7#"],
  ["r3kb1r/2pp3p/b1P2pp1/5n2/q4BP1/2P1p2P/1P2PP2/1R1QKBNR w K - 0 21", "Qxd7#"],
  ["2kr4/1pp2rpp/4b3/p7/P1qP1p1P/5p2/1P3P2/R1B1K2R b - - 1 28", "Qe2#"],
  ["1nrk3r/pp4p1/7p/3Npp1P/1Qn1P3/5P1R/PP3BP1/R2K4 w - - 0 25", "Qe7#"],
  ["2b5/3p1pp1/1p1k3q/p2p3P/Pn6/2K2P2/1P4P1/1R4R1 b - - 2 31", "Qe3#"],
  ["rn2kbn1/p5p1/b2p3B/2p2N2/3pP3/1Pp2R1P/q4PP1/2KQ1BR1 b - - 2 25", "Qb2#"],
  ["4k1r1/4pp1p/1pp3p1/5n2/1P1bpP2/B5P1/2q4P/5KR1 b - - 5 29", "Qf2#"],
  ["r3k3/1p1R4/3Q2pp/8/pP3KB1/6B1/6PP/8 w - - 3 42", "Qe7#"],
  ["r1qk3r/6Rp/1n2p1p1/1B1b4/3Q1P2/8/1P1N1KP1/2B4R w - - 1 25", "Qf6#"],
  ["1k4n1/pr3p2/K3p1p1/1p2P2p/3p1P1P/P1b3P1/2P2NB1/1N5R b - - 0 32", "Rb6#"],
  ["r1k5/2p3r1/1p4p1/4q2p/P1P4P/5K2/6P1/8 b - - 3 52", "Rf7#"],
  ["2Q5/B2Bk1P1/p7/1p2p3/1P4R1/2P2P1P/P7/3RK3 w - - 1 41", "Qf8#"],
  ["r3k3/1pp1b3/1n2Q3/p5B1/1P1N4/P2P3P/2K1B1P1/1R4R1 w - - 0 34", "Qxe7#"],
  ["2b5/1rq2p2/p3p3/r5Pk/7P/P2Q3K/2P4R/8 w - - 1 48", "Qh7#"],
];
export const PUZZLE_REWARD = 50;
