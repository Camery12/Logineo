// Gemeinsamer Katalog für Server und Client: Bretter, Figuren, Finisher, Bundles, Bots, Belohnungen.

export const REWARDS = {
  start: 250,       // Startguthaben
  win: 100,         // Online-Sieg
  draw: 45,         // Online-Remis
  loss: 25,         // Trostgeld bei Niederlage
  botLoss: 5,       // Trostgeld gegen Bots (ab 10 Halbzügen)
};

// tex: prozedurale Texturen pro Feldfarbe (siehe textures.js)
//   kind: wood | marble | swirl | brushed | magma | caustic | noise | frost
export const BOARDS = [
  { id: 'klassisch', name: 'Klassisch Holz', price: 0, light: '#f0d9b5', dark: '#b58863', frame: '#5d3a1a', last: 'rgba(255, 213, 79, .55)', desc: 'Der zeitlose Turnier-Look.',
    tex: { light: { kind: 'wood', base: '#f0d9b5', accent: '#d9bd91' }, dark: { kind: 'wood', base: '#b58863', accent: '#8f6644' } } },
  { id: 'smaragd', name: 'Smaragd', price: 300, light: '#eeeed2', dark: '#769656', frame: '#3b4d2a', last: 'rgba(246, 246, 105, .6)', desc: 'Frisches Grün wie im Park.' },
  { id: 'ozean', name: 'Ozean', price: 400, light: '#dee9f3', dark: '#5b86b0', frame: '#1d3557', last: 'rgba(120, 220, 255, .55)', desc: 'Kühles Blau, ruhige Züge.' },
  { id: 'kupfer', name: 'Kupferwerk', price: 600, light: '#e9c9a6', dark: '#8f4f2c', frame: '#3a1c0c', last: 'rgba(255, 210, 120, .55)', desc: 'Gebürstetes Kupfer mit warmem Glanz.',
    tex: { light: { kind: 'brushed', base: '#e9c9a6', accent: '#f7e2c8' }, dark: { kind: 'brushed', base: '#8f4f2c', accent: '#b8693c' } } },
  { id: 'sakura', name: 'Kirschblüte', price: 750, light: '#fdeef3', dark: '#e58aa9', frame: '#5a2238', last: 'rgba(255, 255, 255, .55)', desc: 'Zarte Blüten auf rosa Marmor.',
    tex: { light: { kind: 'marble', base: '#fdeef3', accent: '#efc3d2' }, dark: { kind: 'swirl', base: '#e07b9e', accent: '#fff0f5', deep: '#b24a72' } } },
  { id: 'eis', name: 'Gletschereis', price: 900, light: '#eef4f6', dark: '#1f8090', frame: '#dfe8eb', last: 'rgba(120, 235, 255, .5)', desc: 'Weißer Marmor und türkisfarbenes Eis-Harz – richtig eisig.',
    tex: { light: { kind: 'marble', base: '#f1f5f7', accent: '#c4d0d6' }, dark: { kind: 'swirl', base: '#1d7d8c', accent: '#e8fbff', deep: '#0b4652' } }, frost: true },
  { id: 'marmor', name: 'Marmorpalast', price: 1000, light: '#f2efea', dark: '#8d8a86', frame: '#2b2a28', last: 'rgba(212, 175, 55, .55)', desc: 'Edler Stein mit feinen Adern.',
    tex: { light: { kind: 'marble', base: '#f2efea', accent: '#bdb6ad' }, dark: { kind: 'marble', base: '#7f7c78', accent: '#c9c4bc' } } },
  { id: 'jade', name: 'Jadetempel', price: 1100, light: '#eaf3ea', dark: '#2f7d5b', frame: '#1c3a2a', last: 'rgba(255, 236, 150, .55)', desc: 'Polierte Jade aus dem Kaiserpalast.',
    tex: { light: { kind: 'marble', base: '#eef5ec', accent: '#c6dcc6' }, dark: { kind: 'swirl', base: '#2f7d5b', accent: '#bfe8cf', deep: '#174a33' } } },
  { id: 'tiefsee', name: 'Tiefsee', price: 1250, light: '#7fc4cf', dark: '#0f3d63', frame: '#061a2c', last: 'rgba(160, 255, 240, .5)', desc: 'Lichtspiele am Meeresgrund.',
    tex: { light: { kind: 'caustic', base: '#6fb8c6', accent: '#d8fbff' }, dark: { kind: 'caustic', base: '#0e3a5e', accent: '#3fa7c9' } } },
  { id: 'lava', name: 'Vulkan', price: 1400, light: '#4a3b36', dark: '#1d1311', frame: '#120706', last: 'rgba(255, 170, 0, .5)', desc: 'Erkaltete Asche über glühendem Magma.',
    tex: { light: { kind: 'noise', base: '#55453f', accent: '#6d5a52' }, dark: { kind: 'magma', base: '#1d1311', accent: '#ff6a1a' } } },
  { id: 'mitternacht', name: 'Mitternacht', price: 1600, light: '#3e4a72', dark: '#151b36', frame: '#0a0e1f', last: 'rgba(255, 215, 120, .45)', desc: 'Nachtblau mit goldenem Sternenstaub.',
    tex: { light: { kind: 'noise', base: '#3e4a72', accent: '#56638f', stars: true }, dark: { kind: 'noise', base: '#151b36', accent: '#232b52', stars: true } } },
  { id: 'neon', name: 'Neon City', price: 1800, light: '#23214a', dark: '#11102a', frame: '#05040f', last: 'rgba(255, 61, 240, .45)', grid: '#39f0ff', overlay: 'linear-gradient(rgba(57,240,255,.08), rgba(255,61,240,.08))', desc: 'Cyberpunk mit leuchtendem Raster.' },
  { id: 'galaxie', name: 'Galaxie', price: 2200, light: 'rgba(255,255,255,.22)', dark: 'rgba(25,8,70,.55)', frame: '#0b0420', last: 'rgba(160, 120, 255, .6)', overlay: 'radial-gradient(circle at 20% 30%, #6a3fd1 0, transparent 35%), radial-gradient(circle at 80% 70%, #c2318f 0, transparent 40%), radial-gradient(circle at 60% 20%, #2b65d9 0, transparent 30%), #0d0626', stars: true, desc: 'Spiele zwischen den Sternen.' },
  { id: 'royal', name: 'Königsgold', price: 3000, light: '#fff4d6', dark: '#c9a227', frame: '#3a2a00', last: 'rgba(255, 255, 255, .5)', desc: 'Nur für wahre Könige.',
    tex: { light: { kind: 'marble', base: '#fff4d6', accent: '#ecd9a8' }, dark: { kind: 'brushed', base: '#c9a227', accent: '#f2d675' } } },
];

// Figuren-Skins: Füllverlauf, Kontur, Details, optional Marmor-Wirbel (swirl) + 3D-Materialwerte
export const PIECES = [
  { id: 'klassisch', name: 'Klassisch', price: 0, desc: 'Sauber und gut lesbar.',
    w: { fill: ['#ffffff', '#d9d9d9'], stroke: '#1f1f1f', detail: '#1f1f1f' },
    b: { fill: ['#575757', '#151515'], stroke: '#000000', detail: '#e6e6e6' },
    mat: { metal: 0.05, rough: 0.35 } },
  { id: 'holz', name: 'Handgeschnitzt', price: 450, desc: 'Warmes Holz aus der Werkstatt.',
    w: { fill: ['#f7dfb0', '#c8955a'], stroke: '#5a3517', detail: '#5a3517' },
    b: { fill: ['#7a4522', '#2e1608'], stroke: '#140700', detail: '#e2b47c' },
    mat: { metal: 0, rough: 0.7 } },
  { id: 'rubin', name: 'Saphir & Rubin', price: 750, desc: 'Funkelnde Edelsteine.',
    w: { fill: ['#8fd3ff', '#1458b0'], stroke: '#06244f', detail: '#e8f6ff' },
    b: { fill: ['#ff7b8b', '#8a0f22'], stroke: '#3a0410', detail: '#ffe0e5' },
    mat: { metal: 0.3, rough: 0.12 } },
  { id: 'sakura', name: 'Kirschblüte', price: 900, desc: 'Rosa Porzellan mit Blütenwirbeln.',
    w: { fill: ['#fff7fa', '#f6d3df'], stroke: '#a14466', detail: '#a14466', swirl: '#e9a3bc' },
    b: { fill: ['#d6336c', '#7a1238'], stroke: '#3d0718', detail: '#ffd6e5', swirl: '#ffc2d6' },
    mat: { metal: 0.05, rough: 0.2 } },
  { id: 'jade', name: 'Jade & Elfenbein', price: 1100, desc: 'Geschnitzt aus Elfenbein und Jade.',
    w: { fill: ['#fffaf0', '#e8dcc2'], stroke: '#6b5a3a', detail: '#6b5a3a', swirl: '#d9c9a4' },
    b: { fill: ['#5fb88a', '#1f6b4a'], stroke: '#0c2e1f', detail: '#e6fff1', swirl: '#c9f0da' },
    mat: { metal: 0.05, rough: 0.18 } },
  { id: 'gold', name: 'Gold & Obsidian', price: 1300, desc: 'Luxus pur – glänzt im Finisher.',
    w: { fill: ['#fff3b0', '#d4a017'], stroke: '#5e4300', detail: '#6b4e00' },
    b: { fill: ['#5b5b6b', '#111118'], stroke: '#d4a017', detail: '#f2cc4d' },
    mat: { metal: 0.9, rough: 0.25 } },
  { id: 'arktis', name: 'Arktis-Marmor', price: 1500, desc: 'Weißer Marmor gegen türkisfarbenes Eis-Harz.',
    w: { fill: ['#ffffff', '#e3eaee'], stroke: '#6f8590', detail: '#6f8590', swirl: '#7f97a3' },
    b: { fill: ['#35aebd', '#0d5662'], stroke: '#052e36', detail: '#eafcff', swirl: '#e9fbff' },
    mat: { metal: 0.05, rough: 0.1, opacity: 0.94 } },
  { id: 'kristall', name: 'Kristall', price: 1600, desc: 'Durchscheinend wie Eis.',
    w: { fill: ['rgba(235,248,255,.95)', 'rgba(140,200,255,.75)'], stroke: '#cfeeff', detail: '#2a6fa8' },
    b: { fill: ['rgba(170,120,255,.9)', 'rgba(60,20,130,.85)'], stroke: '#e6d6ff', detail: '#f1e8ff' },
    mat: { metal: 0.1, rough: 0.05, opacity: 0.82 } },
  { id: 'lava', name: 'Lava & Asche', price: 1800, desc: 'Graue Asche gegen glühendes Magmagestein.',
    w: { fill: ['#efeae4', '#b9b0a5'], stroke: '#4a4038', detail: '#4a4038', swirl: '#8f857a' },
    b: { fill: ['#2a1a16', '#0c0605'], stroke: '#ff6a1a', detail: '#ffb347', swirl: '#ff5a1a', glow: '#ff6a1a' },
    mat: { metal: 0.1, rough: 0.5, emissive: 0.5 } },
  { id: 'neon', name: 'Neon', price: 2000, desc: 'Leuchtet im Dunkeln.',
    w: { fill: ['#0f2a3d', '#071320'], stroke: '#39f0ff', detail: '#39f0ff', glow: '#39f0ff' },
    b: { fill: ['#3a0f3d', '#170620'], stroke: '#ff3df0', detail: '#ff3df0', glow: '#ff3df0' },
    mat: { metal: 0.2, rough: 0.3, emissive: 0.9 } },
];

export const FINISHERS = [
  { id: 'klassisch', name: 'Königssturz', price: 0, icon: '♚', desc: 'Der König kippt in Zeitlupe um.' },
  { id: 'feuerwerk', name: 'Feuerwerk', price: 900, icon: '🎆', desc: 'Der König startet als Rakete und explodiert bunt.' },
  { id: 'blitz', name: 'Donnerschlag', price: 1300, icon: '⚡', desc: 'Drei Blitze schlagen ein – der König zerfällt.' },
  { id: 'glitch', name: 'Datenzerfall', price: 1400, icon: '👾', desc: 'Der König glitcht, zerfällt in Pixel und wird gelöscht.' },
  { id: 'meteor', name: 'Meteoriteneinschlag', price: 1600, icon: '☄️', desc: 'Ein glühender Meteor zerschmettert den König.' },
  { id: 'kanone', name: 'Kanonenschuss', price: 1700, icon: '💣', desc: 'Eine Kanone feuert – der König fliegt in hohem Bogen vom Brett.' },
  { id: 'tornado', name: 'Wirbelsturm', price: 1900, icon: '🌪️', desc: 'Ein Tornado reißt den König und seine Leibwache in die Luft.' },
  { id: 'kristall', name: 'Eissplitter', price: 2000, icon: '❄️', desc: 'Der König gefriert und zerspringt in tausend Splitter.' },
  { id: 'samurai', name: 'Samurai-Schnitt', price: 2300, icon: '⚔️', desc: 'Ein Schwerthieb in Zeitlupe – der König wird zweigeteilt.' },
  { id: 'erdbeben', name: 'Erdbeben', price: 2500, icon: '🌋', desc: 'Das Brett reißt auf, Magma glüht – der König stürzt in die Tiefe.' },
  { id: 'loch', name: 'Schwarzes Loch', price: 2800, icon: '🌀', desc: 'Ein schwarzes Loch saugt den König ins Nichts.' },
  { id: 'hammer', name: 'Donnerhammer', price: 3200, icon: '🔨', desc: 'Ein riesiger Blitzhammer kracht vom Himmel und macht den König platt.' },
  { id: 'laser', name: 'Orbital-Laser', price: 3500, icon: '🛰️', desc: 'Zielerfassung aus dem All – ein gigantischer Laserstrahl verdampft den König.' },
];

// Bundles: Brett + Figuren + Finisher günstiger. Bereits Gekauftes wird nicht nochmal berechnet.
export const BUNDLES = [
  { id: 'eiszeit', name: 'Eiszeit-Paket', icon: '🧊', discount: 0.2, items: [['board', 'eis'], ['pieces', 'arktis'], ['finisher', 'kristall']], desc: 'Gletschereis-Brett, Arktis-Marmor-Figuren und der Eissplitter-Finisher.' },
  { id: 'sakura', name: 'Kirschblüten-Paket', icon: '🌸', discount: 0.2, items: [['board', 'sakura'], ['pieces', 'sakura'], ['finisher', 'samurai']], desc: 'Kirschblüten-Brett und -Figuren plus Samurai-Schnitt.' },
  { id: 'vulkan', name: 'Vulkan-Paket', icon: '🌋', discount: 0.2, items: [['board', 'lava'], ['pieces', 'lava'], ['finisher', 'erdbeben']], desc: 'Vulkan-Brett, Lava-Figuren und das Erdbeben.' },
  { id: 'natur', name: 'Natur-Paket', icon: '🍃', discount: 0.15, items: [['board', 'jade'], ['pieces', 'jade'], ['finisher', 'tornado']], desc: 'Jadetempel, Jade-Figuren und der Wirbelsturm.' },
  { id: 'cyber', name: 'Cyber-Paket', icon: '🌆', discount: 0.2, items: [['board', 'neon'], ['pieces', 'neon'], ['finisher', 'glitch']], desc: 'Neon City, Neon-Figuren und Datenzerfall.' },
  { id: 'koenig', name: 'Königs-Paket', icon: '👑', discount: 0.25, items: [['board', 'royal'], ['pieces', 'gold'], ['finisher', 'laser']], desc: 'Das Luxuriöseste: Königsgold, Gold & Obsidian und der Orbital-Laser.' },
];

// Bots: niedrige Stufen spielen schwach, nehmen aber freie Figuren meistens mit.
// margin: Fehlzüge nur aus Zügen, die höchstens so viel schlechter sind (Centipawns).
export const BOTS = [
  { id: 1, name: 'Noobi', level: 'Noob', elo: 250, avatar: '🐣', color: '#7ee787', reward: 15, finisher: 'klassisch', cfg: { maxDepth: 1, timeMs: 150, noise: 160, blunder: 0.25, margin: 320 }, quote: 'Ich klicke einfach irgendwas!' },
  { id: 2, name: 'Bauer Bernd', level: 'Anfänger', elo: 600, avatar: '👨‍🌾', color: '#a5d6ff', reward: 30, finisher: 'klassisch', cfg: { maxDepth: 2, timeMs: 300, noise: 70, blunder: 0.12, margin: 160 }, quote: 'Ich kenne schon alle Regeln.' },
  { id: 3, name: 'Springer Sam', level: 'Fortgeschritten', elo: 1000, avatar: '🐴', color: '#d2a8ff', reward: 60, finisher: 'feuerwerk', cfg: { maxDepth: 3, timeMs: 500, noise: 35, blunder: 0.05, margin: 90 }, quote: 'Hüpf, hüpf – Gabel!' },
  { id: 4, name: 'Läufer Lena', level: 'Experte', elo: 1400, avatar: '🦊', color: '#ffa657', reward: 110, finisher: 'blitz', cfg: { maxDepth: 4, timeMs: 900, noise: 15, blunder: 0.02, margin: 50 }, quote: 'Diagonalen sind mein Revier.' },
  { id: 5, name: 'Turm Theo', level: 'Meister', elo: 1800, avatar: '🏰', color: '#ff7b72', reward: 200, finisher: 'meteor', cfg: { maxDepth: 8, timeMs: 1500, noise: 5, blunder: 0 }, quote: 'Mauern brechen? Viel Glück.' },
  { id: 6, name: 'Dame Diana', level: 'Schlau', elo: 2300, avatar: '👑', color: '#f2cc60', reward: 400, finisher: 'loch', cfg: { maxDepth: 30, timeMs: 3000, noise: 0, blunder: 0 }, quote: 'Ich habe deinen Zug schon gesehen.' },
];

export const CATALOG = { board: BOARDS, pieces: PIECES, finisher: FINISHERS };
export const findItem = (kind, id) => (CATALOG[kind] || []).find((x) => x.id === id);

// Bundle-Preis: Summe der noch nicht gekauften Teile minus Rabatt (auf 10 gerundet)
export function bundlePrice(bundle, owned) {
  const missing = bundle.items.filter(([k, id]) => !owned?.[k]?.includes(id));
  const full = missing.reduce((s, [k, id]) => s + (findItem(k, id)?.price || 0), 0);
  return { price: Math.round((full * (1 - bundle.discount)) / 10) * 10, full, missing };
}

export const AVATAR_EMOJIS = ['♞', '♛', '♜', '♝', '🦁', '🐺', '🦊', '🐉', '🦅', '🐼', '🐯', '🦄', '🐙', '🐧', '🤖', '👾', '🧙', '🥷', '🦸', '🔥', '⚡', '🌙', '⭐', '💎'];
export const AVATAR_COLORS = ['#7c5cff', '#22d3ee', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#64748b', '#eab308'];
