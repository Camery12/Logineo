// Gemeinsamer Katalog für Server und Client: Bretter, Figuren, Finisher, Bots, Belohnungen.

export const REWARDS = {
  start: 250,       // Startguthaben
  win: 100,         // Online-Sieg
  draw: 45,         // Online-Remis
  loss: 25,         // Trostgeld bei Niederlage
  botLoss: 5,       // Trostgeld gegen Bots (ab 10 Halbzügen)
};

export const BOARDS = [
  { id: 'klassisch', name: 'Klassisch Holz', price: 0, light: '#f0d9b5', dark: '#b58863', frame: '#5d3a1a', last: 'rgba(255, 213, 79, .55)', desc: 'Der zeitlose Turnier-Look.' },
  { id: 'smaragd', name: 'Smaragd', price: 120, light: '#eeeed2', dark: '#769656', frame: '#3b4d2a', last: 'rgba(246, 246, 105, .6)', desc: 'Frisches Grün wie im Park.' },
  { id: 'ozean', name: 'Ozean', price: 180, light: '#dee9f3', dark: '#5b86b0', frame: '#1d3557', last: 'rgba(120, 220, 255, .55)', desc: 'Kühles Blau, ruhige Züge.' },
  { id: 'eis', name: 'Gletschereis', price: 280, light: '#f4fbff', dark: '#8fbfdc', frame: '#46708c', last: 'rgba(170, 240, 255, .7)', overlay: 'linear-gradient(135deg, rgba(255,255,255,.35), rgba(255,255,255,0) 40%, rgba(255,255,255,.25) 60%, rgba(255,255,255,0))', desc: 'Frostig glänzende Kristallfelder.' },
  { id: 'marmor', name: 'Marmorpalast', price: 380, light: '#f2efea', dark: '#8d8a86', frame: '#2b2a28', last: 'rgba(212, 175, 55, .55)', overlay: 'repeating-linear-gradient(115deg, rgba(0,0,0,.05) 0 2px, transparent 2px 14px), repeating-linear-gradient(35deg, rgba(255,255,255,.08) 0 1px, transparent 1px 22px)', desc: 'Edler Stein mit feinen Adern.' },
  { id: 'lava', name: 'Vulkan', price: 480, light: '#f6c08a', dark: '#a8321a', frame: '#2a0a04', last: 'rgba(255, 230, 0, .55)', overlay: 'radial-gradient(circle at 30% 70%, rgba(255,120,0,.35), transparent 45%), radial-gradient(circle at 75% 25%, rgba(255,60,0,.3), transparent 40%)', desc: 'Glühendes Magma unter jedem Feld.' },
  { id: 'neon', name: 'Neon City', price: 650, light: '#23214a', dark: '#11102a', frame: '#05040f', last: 'rgba(255, 61, 240, .45)', grid: '#39f0ff', overlay: 'linear-gradient(rgba(57,240,255,.08), rgba(255,61,240,.08))', desc: 'Cyberpunk mit leuchtendem Raster.' },
  { id: 'galaxie', name: 'Galaxie', price: 850, light: 'rgba(255,255,255,.22)', dark: 'rgba(25,8,70,.55)', frame: '#0b0420', last: 'rgba(160, 120, 255, .6)', overlay: 'radial-gradient(circle at 20% 30%, #6a3fd1 0, transparent 35%), radial-gradient(circle at 80% 70%, #c2318f 0, transparent 40%), radial-gradient(circle at 60% 20%, #2b65d9 0, transparent 30%), #0d0626', stars: true, desc: 'Spiele zwischen den Sternen.' },
  { id: 'royal', name: 'Königsgold', price: 1200, light: '#fff4d6', dark: '#c9a227', frame: '#3a2a00', last: 'rgba(255, 255, 255, .5)', overlay: 'linear-gradient(135deg, rgba(255,255,255,.25), transparent 50%, rgba(255,255,255,.15))', desc: 'Nur für wahre Könige.' },
];

// Figuren-Skins: Füllverlauf, Kontur, Details + 3D-Materialwerte für den Finisher
export const PIECES = [
  { id: 'klassisch', name: 'Klassisch', price: 0, desc: 'Sauber und gut lesbar.',
    w: { fill: ['#ffffff', '#d9d9d9'], stroke: '#1f1f1f', detail: '#1f1f1f' },
    b: { fill: ['#575757', '#151515'], stroke: '#000000', detail: '#e6e6e6' },
    mat: { metal: 0.05, rough: 0.35 } },
  { id: 'holz', name: 'Handgeschnitzt', price: 200, desc: 'Warmes Holz aus der Werkstatt.',
    w: { fill: ['#f7dfb0', '#c8955a'], stroke: '#5a3517', detail: '#5a3517' },
    b: { fill: ['#7a4522', '#2e1608'], stroke: '#140700', detail: '#e2b47c' },
    mat: { metal: 0, rough: 0.7 } },
  { id: 'rubin', name: 'Saphir & Rubin', price: 350, desc: 'Funkelnde Edelsteine.',
    w: { fill: ['#8fd3ff', '#1458b0'], stroke: '#06244f', detail: '#e8f6ff' },
    b: { fill: ['#ff7b8b', '#8a0f22'], stroke: '#3a0410', detail: '#ffe0e5' },
    mat: { metal: 0.3, rough: 0.12 } },
  { id: 'gold', name: 'Gold & Obsidian', price: 550, desc: 'Luxus pur – glänzt im Finisher.',
    w: { fill: ['#fff3b0', '#d4a017'], stroke: '#5e4300', detail: '#6b4e00' },
    b: { fill: ['#5b5b6b', '#111118'], stroke: '#d4a017', detail: '#f2cc4d' },
    mat: { metal: 0.9, rough: 0.25 } },
  { id: 'kristall', name: 'Kristall', price: 700, desc: 'Durchscheinend wie Eis.',
    w: { fill: ['rgba(235,248,255,.95)', 'rgba(140,200,255,.75)'], stroke: '#cfeeff', detail: '#2a6fa8' },
    b: { fill: ['rgba(170,120,255,.9)', 'rgba(60,20,130,.85)'], stroke: '#e6d6ff', detail: '#f1e8ff' },
    mat: { metal: 0.1, rough: 0.05, opacity: 0.82 } },
  { id: 'neon', name: 'Neon', price: 800, desc: 'Leuchtet im Dunkeln.',
    w: { fill: ['#0f2a3d', '#071320'], stroke: '#39f0ff', detail: '#39f0ff', glow: '#39f0ff' },
    b: { fill: ['#3a0f3d', '#170620'], stroke: '#ff3df0', detail: '#ff3df0', glow: '#ff3df0' },
    mat: { metal: 0.2, rough: 0.3, emissive: 0.9 } },
];

export const FINISHERS = [
  { id: 'klassisch', name: 'Königssturz', price: 0, icon: '♚', desc: 'Der König kippt in Zeitlupe um.' },
  { id: 'feuerwerk', name: 'Feuerwerk', price: 400, icon: '🎆', desc: 'Der König startet als Rakete und explodiert bunt.' },
  { id: 'blitz', name: 'Donnerschlag', price: 600, icon: '⚡', desc: 'Drei Blitze schlagen ein – der König zerfällt.' },
  { id: 'meteor', name: 'Meteoriteneinschlag', price: 750, icon: '☄️', desc: 'Ein glühender Meteor zerschmettert den König.' },
  { id: 'kristall', name: 'Eissplitter', price: 900, icon: '❄️', desc: 'Der König gefriert und zerspringt in tausend Splitter.' },
  { id: 'loch', name: 'Schwarzes Loch', price: 1200, icon: '🌀', desc: 'Ein schwarzes Loch saugt den König ins Nichts.' },
];

export const BOTS = [
  { id: 1, name: 'Noobi', level: 'Noob', elo: 250, avatar: '🐣', color: '#7ee787', reward: 15, finisher: 'klassisch', cfg: { maxDepth: 0 }, quote: 'Ich klicke einfach irgendwas!' },
  { id: 2, name: 'Bauer Bernd', level: 'Anfänger', elo: 600, avatar: '👨‍🌾', color: '#a5d6ff', reward: 30, finisher: 'klassisch', cfg: { maxDepth: 1, timeMs: 300, noise: 120, blunder: 0.3 }, quote: 'Ich kenne schon alle Regeln.' },
  { id: 3, name: 'Springer Sam', level: 'Fortgeschritten', elo: 1000, avatar: '🐴', color: '#d2a8ff', reward: 60, finisher: 'feuerwerk', cfg: { maxDepth: 2, timeMs: 500, noise: 45, blunder: 0.08 }, quote: 'Hüpf, hüpf – Gabel!' },
  { id: 4, name: 'Läufer Lena', level: 'Experte', elo: 1400, avatar: '🦊', color: '#ffa657', reward: 110, finisher: 'blitz', cfg: { maxDepth: 3, timeMs: 900, noise: 18, blunder: 0.02 }, quote: 'Diagonalen sind mein Revier.' },
  { id: 5, name: 'Turm Theo', level: 'Meister', elo: 1800, avatar: '🏰', color: '#ff7b72', reward: 200, finisher: 'meteor', cfg: { maxDepth: 6, timeMs: 1500, noise: 6, blunder: 0 }, quote: 'Mauern brechen? Viel Glück.' },
  { id: 6, name: 'Dame Diana', level: 'Schlau', elo: 2300, avatar: '👑', color: '#f2cc60', reward: 400, finisher: 'loch', cfg: { maxDepth: 30, timeMs: 3000, noise: 0, blunder: 0 }, quote: 'Ich habe deinen Zug schon gesehen.' },
];

export const CATALOG = { board: BOARDS, pieces: PIECES, finisher: FINISHERS };
export const findItem = (kind, id) => (CATALOG[kind] || []).find((x) => x.id === id);

export const AVATAR_EMOJIS = ['♞', '♛', '♜', '♝', '🦁', '🐺', '🦊', '🐉', '🦅', '🐼', '🐯', '🦄', '🐙', '🐧', '🤖', '👾', '🧙', '🥷', '🦸', '🔥', '⚡', '🌙', '⭐', '💎'];
export const AVATAR_COLORS = ['#7c5cff', '#22d3ee', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#64748b', '#eab308'];
