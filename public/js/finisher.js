// 3D-Cinematic-Finisher beim Schachmatt (Three.js + Bloom)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Kino-Filter: chromatische Aberration, Filmkorn, Vignette, Glitch, Impact-Frames (Invertierung)
const FXShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAberr: { value: 0 }, uGrain: { value: 0.028 }, uInvert: { value: 0 }, uGlitch: { value: 0 }, uVignette: { value: 0.45 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uAberr, uGrain, uInvert, uGlitch, uVignette; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uGlitch > 0.001) {
        float band = floor(uv.y * 22.0 + floor(uTime * 16.0) * 5.0);
        float r = hash(vec2(band, floor(uTime * 24.0)));
        if (r < uGlitch * 0.55) uv.x += (hash(vec2(band, 3.7)) - 0.5) * 0.06 * uGlitch;
      }
      vec2 dir = uv - 0.5;
      float a = uAberr * 0.014 + uGlitch * 0.012;
      vec3 c = vec3(texture2D(tDiffuse, uv + dir * a).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir * a).b);
      c += (hash(uv * vec2(1187.0, 931.0) + fract(uTime)) - 0.5) * uGrain;
      if (uGlitch > 0.001) c *= 1.0 - 0.18 * uGlitch * step(0.5, fract(uv.y * 220.0));
      c *= mix(1.0, smoothstep(0.95, 0.25, length(dir)), uVignette);
      c = mix(c, vec3(1.0) - clamp(c, 0.0, 1.0), uInvert);
      gl_FragColor = vec4(c, 1.0);
    }`,
};
import { BOARDS, PIECES, FINISHERS } from './catalog.js';
import { boardTexturesSync } from './textures.js';
import { sound } from './sound.js';

const BOARD3D = { galaxie: ['#5b4aa8', '#1a0c40'], neon: ['#2a2860', '#0e0d26'] };
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const rand = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------ Figuren-Geometrie
const LATHE = {
  p: [[0, 0], [0.36, 0], [0.36, 0.07], [0.3, 0.11], [0.2, 0.16], [0.13, 0.38], [0.21, 0.41], [0.21, 0.44], [0.11, 0.47], [0, 0.47]],
  r: [[0, 0], [0.38, 0], [0.38, 0.07], [0.31, 0.12], [0.25, 0.18], [0.22, 0.56], [0.3, 0.6], [0.3, 0.8], [0.22, 0.8], [0.22, 0.74], [0, 0.74]],
  b: [[0, 0], [0.36, 0], [0.36, 0.07], [0.29, 0.12], [0.2, 0.17], [0.13, 0.5], [0.21, 0.54], [0.21, 0.58], [0.12, 0.6], [0.17, 0.68], [0.19, 0.78], [0.14, 0.9], [0.06, 0.97], [0, 0.98]],
  q: [[0, 0], [0.4, 0], [0.4, 0.07], [0.32, 0.12], [0.22, 0.18], [0.14, 0.64], [0.24, 0.69], [0.22, 0.73], [0.15, 0.75], [0.27, 0.97], [0.18, 0.95], [0, 0.95]],
  k: [[0, 0], [0.4, 0], [0.4, 0.07], [0.32, 0.12], [0.22, 0.18], [0.15, 0.68], [0.25, 0.73], [0.23, 0.77], [0.16, 0.79], [0.25, 1.0], [0.19, 1.04], [0, 1.04]],
  n: [[0, 0], [0.38, 0], [0.38, 0.07], [0.3, 0.12], [0.27, 0.2], [0, 0.2]],
};
const geoCache = {};
// Weiche, gedrechselte Profile: Kontrollpunkte per Catmull-Rom glätten
function lathe(type) {
  if (geoCache[type]) return geoCache[type];
  const pts = LATHE[type].map(([x, y]) => new THREE.Vector3(Math.max(x, 0.003), y, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const smooth = curve.getPoints(pts.length * 8).map((p) => new THREE.Vector2(Math.max(p.x, 0.003), Math.max(0, p.y)));
  const g = new THREE.LatheGeometry(smooth, 72);
  g.computeVertexNormals();
  return (geoCache[type] = g);
}
function knightHead() {
  if (geoCache.nh) return geoCache.nh;
  const pts = [[13, 36], [13.2, 30], [16, 26], [19, 23], [19.5, 20.5], [17, 19.5], [12, 22.6], [8.6, 21.2], [9.5, 17], [13, 12.5], [17, 9.5], [17.5, 6], [20.2, 8.6], [26, 9.2], [31, 13], [34.2, 20], [35, 27], [33.5, 36]];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2((x - 22.5) / 40, (36 - y) / 40)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 });
  g.translate(0, 0, -0.1);
  return (geoCache.nh = g);
}

function makePiece(type, material) {
  const g = new THREE.Group();
  const add = (geo, y = 0, x = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(lathe(type));
  if (type === 'p') add(new THREE.SphereGeometry(0.16, 40, 28), 0.6);
  if (type === 'b') add(new THREE.SphereGeometry(0.05, 12, 8), 1.02);
  if (type === 'q') { add(new THREE.SphereGeometry(0.07, 16, 10), 1.0); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.SphereGeometry(0.045, 10, 8), 0.98, Math.cos(a) * 0.25, Math.sin(a) * 0.25); } }
  if (type === 'k') { add(new THREE.BoxGeometry(0.07, 0.28, 0.07), 1.17); add(new THREE.BoxGeometry(0.22, 0.07, 0.07), 1.2); }
  if (type === 'r') for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const m = add(new THREE.BoxGeometry(0.1, 0.1, 0.09), 0.84, Math.cos(a) * 0.25, Math.sin(a) * 0.25); m.rotation.y = -a; }
  if (type === 'n') { const h = add(knightHead(), 0.18); h.rotation.y = Math.PI / 2; }
  return g;
}

function skinMaterial(skinId, color) {
  skinId = String(skinId || '').split('@')[0]; // Form ist für 3D egal
  const s = PIECES.find((p) => p.id === skinId) || PIECES[0];
  const c = new THREE.Color().setStyle(s[color].fill[0]).lerp(new THREE.Color().setStyle(s[color].fill[1]), color === 'b' ? 0.8 : 0.5);
  // Lackiert: Klarlack-Schicht spiegelt die Umgebung, wirkt wie echte Turnierfiguren
  const m = new THREE.MeshPhysicalMaterial({
    color: c, metalness: s.mat.metal, roughness: Math.max(0.22, s.mat.rough), envMapIntensity: s.mat.metal > 0.5 ? 0.9 : 0.3,
    clearcoat: s.mat.metal > 0.5 ? 0.3 : 0.7, clearcoatRoughness: 0.1,
  });
  if (s.mat.opacity) { m.transparent = true; m.opacity = s.mat.opacity; }
  if (s.mat.emissive) { m.emissive = new THREE.Color().setStyle(s[color].stroke); m.emissiveIntensity = s.mat.emissive * 0.6; }
  return m;
}

// Prozedurale Feld-Texturen: Holzmaserung, Marmoradern oder feines Rauschen
function squareTexture(themeId, baseColor, seed) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = baseColor; g.fillRect(0, 0, S, S);
  const wood = ['klassisch', 'smaragd', 'royal', 'lava'].includes(themeId);
  const marble = ['marmor', 'eis'].includes(themeId);
  if (wood) {
    const ang = rnd() < 0.5 ? 0 : Math.PI / 2;
    g.save(); g.translate(S / 2, S / 2); g.rotate(ang); g.translate(-S / 2, -S / 2);
    for (let i = 0; i < 70; i++) {
      const y = rnd() * S, amp = 2 + rnd() * 6, freq = 0.01 + rnd() * 0.02, ph = rnd() * 6;
      g.strokeStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.03 + rnd() * 0.07})` : `rgba(255,255,255,${0.02 + rnd() * 0.05})`;
      g.lineWidth = 0.6 + rnd() * 2.2;
      g.beginPath();
      for (let x = -10; x <= S + 10; x += 8) g.lineTo(x, y + Math.sin(x * freq + ph) * amp);
      g.stroke();
    }
    g.restore();
  } else if (marble) {
    for (let v = 0; v < 6; v++) {
      let x = rnd() * S, y = 0;
      g.strokeStyle = `rgba(${themeId === 'eis' ? '255,255,255' : '60,60,70'},${0.12 + rnd() * 0.2})`;
      g.lineWidth = 0.6 + rnd() * 1.8;
      g.beginPath(); g.moveTo(x, y);
      while (y < S) { x += (rnd() - 0.5) * 26; y += 8 + rnd() * 14; g.lineTo(x, y); }
      g.stroke();
    }
  }
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * (wood ? 10 : 7); d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function spriteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------ Partikel
class Particles {
  constructor(scene, max, tex, size, blending = THREE.AdditiveBlending) {
    this.max = max; this.n = 0;
    this.d = new Float32Array(max * 12); // px py pz vx vy vz life max r g b grav
    this.drag = new Float32Array(max);
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, blending, depthWrite: false, transparent: true });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(p, v, color, life, grav = 0, drag = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, o = i * 12;
    this.d.set([p.x, p.y, p.z, v.x, v.y, v.z, life, life, color.r, color.g, color.b, grav], o);
    this.drag[i] = drag;
  }
  update(dt) {
    const d = this.d;
    for (let i = 0; i < this.n; i++) {
      const o = i * 12;
      d[o + 6] -= dt;
      if (d[o + 6] <= 0) { // tauschen mit letztem
        this.n--; const last = this.n * 12;
        for (let k = 0; k < 12; k++) d[o + k] = d[last + k];
        this.drag[i] = this.drag[this.n];
        i--; continue;
      }
      const dr = 1 - this.drag[i] * dt;
      d[o + 3] *= dr; d[o + 4] = d[o + 4] * dr - d[o + 11] * dt; d[o + 5] *= dr;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      if (d[o + 1] < 0.12 && d[o + 11] > 0) { d[o + 1] = 0.12; d[o + 4] *= -0.3; d[o + 3] *= 0.7; d[o + 5] *= 0.7; }
      const f = Math.min(1, (d[o + 6] / d[o + 7]) * 1.6);
      this.pos[i * 3] = d[o]; this.pos[i * 3 + 1] = d[o + 1]; this.pos[i * 3 + 2] = d[o + 2];
      this.col[i * 3] = d[o + 8] * f; this.col[i * 3 + 1] = d[o + 9] * f; this.col[i * 3 + 2] = d[o + 10] * f;
    }
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

class Debris {
  constructor(scene) { this.scene = scene; this.items = []; }
  burst(center, material, count, { speed = 4, up = 4, size = [0.06, 0.16], geo = 'box', spread = 0.3 } = {}) {
    for (let i = 0; i < count; i++) {
      const s = rand(size[0], size[1]);
      const g = geo === 'tetra' ? new THREE.TetrahedronGeometry(s) : new THREE.BoxGeometry(s, s * rand(0.6, 1.4), s * rand(0.6, 1.2));
      const m = new THREE.Mesh(g, material); m.castShadow = true;
      m.position.set(center.x + rand(-spread, spread), center.y + rand(0, 1.1), center.z + rand(-spread, spread));
      const a = Math.random() * Math.PI * 2, sp = rand(0.3, 1) * speed;
      this.items.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, rand(0.4, 1) * up, Math.sin(a) * sp), w: new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), r: s / 2 });
      this.scene.add(m);
    }
  }
  update(dt) {
    for (const it of this.items) {
      it.v.y -= 9.8 * dt;
      it.m.position.addScaledVector(it.v, dt);
      it.m.rotation.x += it.w.x * dt; it.m.rotation.y += it.w.y * dt; it.m.rotation.z += it.w.z * dt;
      if (it.m.position.y < 0.1 + it.r) {
        it.m.position.y = 0.1 + it.r; it.v.y *= -0.35; it.v.x *= 0.7; it.v.z *= 0.7; it.w.multiplyScalar(0.6);
      }
    }
  }
}

// ------------------------------------------------------------ Hauptfunktion
export function playFinisher(opts) {
  return new Promise((resolve) => {
    try { run(opts, resolve); } catch (e) { console.error(e); resolve(); }
  });
}

// Ein gemeinsamer WebGL-Renderer für alle Finisher: Shader und Umgebungslicht werden nur einmal
// gebaut – dadurch startet jeder weitere Finisher sofort.
let shared = null;

function getShared() {
  if (shared && !shared.renderer.getContext().isContextLost()) return shared;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  shared = { canvas, renderer, env };
  return shared;
}

// Im Hintergrund vorbereiten (unsichtbar): Renderer, Umgebungslicht und die wichtigsten Shader
let warmed = false;
export function warmupFinisher(opts = {}) {
  if (warmed) return Promise.resolve();
  warmed = true;
  return new Promise((resolve) => {
    try { run({ fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4', ...opts, warm: true }, resolve); } catch (e) { console.warn(e); resolve(); }
  });
}

function run({ finisher = 'klassisch', fen, boardTheme = 'klassisch', skins = { w: 'klassisch', b: 'klassisch' }, loserColor = 'b', winnerName = '', subtitle, attackerSq = null, warm = false }, done) {
  const info = FINISHERS.find((f) => f.id === finisher) || FINISHERS[0];
  const overlay = document.createElement('div');
  overlay.className = 'finisher';
  overlay.innerHTML = `<canvas></canvas><div class="fx-vignette"></div><div class="fx-bar top"></div><div class="fx-bar bottom"></div>
    <div class="fx-title"><div class="fx-main">${'SCHACHMATT'.split('').map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('')}</div><div class="fx-sub"></div></div>
    <div class="fx-lines"></div>
    <div class="fx-flash"></div><div class="fx-tag"><span>${info.icon}</span> Finisher: ${info.name}</div><button class="fx-skip">Überspringen ›</button>`;
  if (warm) overlay.style.cssText = 'visibility:hidden;pointer-events:none';
  document.body.appendChild(overlay);
  const flashEl = overlay.querySelector('.fx-flash');
  if (!warm) requestAnimationFrame(() => overlay.classList.add('on'));

  let renderer, sh;
  try { sh = getShared(); renderer = sh.renderer; overlay.querySelector('canvas').replaceWith(sh.canvas); }
  catch {
    if (warm) { overlay.remove(); done(); return; }
    overlay.classList.add('title-on');
    setTimeout(() => { overlay.remove(); done(); }, 2500);
    return;
  }
  const small = Math.min(innerWidth, innerHeight) < 820;
  let pixelRatio = Math.min(devicePixelRatio, small ? 1.5 : 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  const bg = new THREE.Color('#07080d');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, 14, 34);
  scene.environment = sh.env;
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 100);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.4, 2.8);
  if (window.__noBloom) bloom.enabled = false;
  composer.addPass(bloom);
  const fxPass = new ShaderPass(FXShader);
  composer.addPass(fxPass);
  composer.addPass(new OutputPass());

  // Licht
  const hemi = new THREE.HemisphereLight('#cfd8ff', '#20140a', 0.55); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff3e0', 1.25);
  key.position.set(5, 11, 6); key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 1536, small ? 1024 : 1536);
  key.shadow.radius = 4;
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#7c5cff', 1.4); rim.position.set(-6, 5, -7); scene.add(rim);
  const fxLight = new THREE.PointLight('#ffffff', 0, 12, 1.6); scene.add(fxLight);

  // Brett
  const theme = BOARDS.find((b) => b.id === boardTheme) || BOARDS[0];
  const [lc, dc] = BOARD3D[theme.id] || [theme.light, theme.dark];
  // Felder: dieselben Texturen wie das 2D-Brett (eine Textur über das ganze Brett, jedes Feld zeigt seinen Ausschnitt)
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const themeTex = boardTexturesSync(theme.id);
  const baseTex = themeTex ? { light: new THREE.CanvasTexture(themeTex.light), dark: new THREE.CanvasTexture(themeTex.dark) } : null;
  if (baseTex) for (const t of Object.values(baseTex)) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; }
  const physical = (extra) => new THREE.MeshPhysicalMaterial({ roughness: 0.4, metalness: 0.02, clearcoat: 0.55, clearcoatRoughness: 0.18, envMapIntensity: 0.35, ...extra });
  const plainMat = (col, seed) => {
    const map = squareTexture('plain', new THREE.Color().setStyle(col).getStyle(), seed); map.anisotropy = aniso;
    const m = physical({ map });
    if (theme.id === 'neon') m.emissive = new THREE.Color(seed > 3 ? '#14104a' : '#0a0830');
    return m;
  };
  const lightMats = baseTex ? null : [1, 2, 3].map((i) => plainMat(lc, i)), darkMats = baseTex ? null : [4, 5, 6].map((i) => plainMat(dc, i));
  const sqGeo = new THREE.BoxGeometry(1, 0.2, 1);
  const squares = [];
  const sqPos = (sq) => new THREE.Vector3(sq.charCodeAt(0) - 97 - 3.5, 0, 3.5 - (+sq[1] - 1));
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const isLight = (f + r) % 2;
    let mat;
    if (baseTex) {
      const t = (isLight ? baseTex.light : baseTex.dark).clone();
      t.repeat.set(1 / 8, 1 / 8); t.offset.set(f / 8, r / 8); t.needsUpdate = true;
      mat = physical({ map: t });
    } else mat = (isLight ? lightMats : darkMats)[(f * 7 + r * 3) % 3];
    const m = new THREE.Mesh(sqGeo, mat);
    m.position.set(f - 3.5, 0, 3.5 - r); m.receiveShadow = true;
    scene.add(m); squares.push(m);
  }
  if (theme.frost) {
    // Gletschereis: Frostschicht und kühles Licht
    const ft = new THREE.CanvasTexture(themeTex.frost); ft.colorSpace = THREE.SRGBColorSpace;
    const frost = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: ft, transparent: true, opacity: 0.35, depthWrite: false }));
    frost.rotation.x = -Math.PI / 2; frost.position.y = 0.102; scene.add(frost);
    hemi.color.set('#d8f6ff');
  }
  // Rahmen mit Goldeinlage
  const frameMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setStyle(theme.frame), roughness: 0.35, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  // Rahmen aus 4 Randstücken (darunter ist nichts – so kann das Brett z. B. beim Erdbeben aufreißen)
  const frameParts = {};
  for (const [key, w, d, x, z] of [['n', 9.1, 0.55, 0, -4.275], ['s', 9.1, 0.55, 0, 4.275], ['e', 0.55, 8, 4.275, 0], ['w', 0.55, 8, -4.275, 0]]) {
    const fp = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), frameMat);
    fp.position.set(x, -0.06, z); fp.receiveShadow = true; fp.castShadow = true; scene.add(fp);
    frameParts[key] = fp;
  }
  const goldMat = new THREE.MeshStandardMaterial({ color: '#d4a84a', metalness: 1, roughness: 0.28, envMapIntensity: 1.2 });
  for (const [key, w, d, x, z] of [['s', 8.24, 0.06, 0, 4.12], ['n', 8.24, 0.06, 0, -4.12], ['e', 0.06, 8.24, 4.12, 0], ['w', 0.06, 8.24, -4.12, 0]]) {
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), goldMat);
    inlay.position.set(x, 0.105, z); scene.add(inlay);
    frameParts[key + 'Gold'] = inlay;
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: '#0a0b11', roughness: 0.55, metalness: 0.2, envMapIntensity: 0.15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.22; floor.receiveShadow = true; scene.add(floor);

  // Figuren aus FEN
  const mats = { w: skinMaterial(skins.w, 'w'), b: skinMaterial(skins.b, 'b') };
  const pieces = new Map();
  let kingSq = null;
  fen.split(' ')[0].split('/').forEach((row, y) => {
    let x = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { x += +ch; continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b', type = ch.toLowerCase();
      const sq = 'abcdefgh'[x] + (8 - y);
      // Eigenes Material pro Figur, damit verdeckende Figuren einzeln ausgeblendet werden können
      const mat = mats[color].clone();
      const baseOpacity = mat.opacity;
      mat.transparent = true;
      const g = makePiece(type, mat);
      g.position.copy(sqPos(sq)).setY(0.1);
      if (type === 'n') g.rotation.y = color === 'w' ? 0 : Math.PI;
      scene.add(g); pieces.set(sq, { g, type, color, mat, baseOpacity, op: 1 });
      if (type === 'k' && color === loserColor) kingSq = sq;
      x++;
    }
  });
  if (!kingSq) kingSq = 'e8';
  const king = pieces.get(kingSq)?.g || new THREE.Group();
  const kingMat = mats[loserColor].clone();
  king.traverse((o) => { if (o.isMesh) o.material = kingMat; });
  const kingPos = sqPos(kingSq).setY(0.1);
  // Die Figur, die Matt gesetzt hat (Fallback: nächste Figur des Siegers)
  let attacker = attackerSq ? pieces.get(attackerSq) : null;
  if (!attacker || attacker.color === loserColor) {
    let best = 99;
    for (const pc of pieces.values()) { if (pc.color === loserColor) continue; const d = pc.g.position.distanceTo(kingPos); if (d < best) { best = d; attacker = pc; } }
  }
  // Dramatisches Spotlicht auf den König
  const spot = new THREE.SpotLight('#ffe9c7', 11, 18, 0.42, 0.75, 1.4);
  spot.position.set(kingPos.x + 1.5, 8, kingPos.z + 2);
  spot.target.position.copy(kingPos);
  spot.castShadow = !small; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004;
  scene.add(spot, spot.target);

  const tex = spriteTexture();
  const parts = new Particles(scene, 6000, tex, 0.16);
  const bigParts = new Particles(scene, 800, tex, 0.6);
  const debris = new Debris(scene);

  // Kamera-Steuerung
  const winnerSide = loserColor === 'w' ? 'b' : 'w';
  const baseAngle = (winnerSide === 'w' ? 0 : Math.PI) + 0.55;
  const cam = { look: kingPos.clone().setY(0.7), lookY: 0, shake: 0, distEnd: 3.8, heightEnd: 2.1, orbit: 0.06 };
  // Sanftes, filmisches Wackeln (überlagerte Sinuswellen statt Zufallszittern)
  let shakeT = 0, shakeDur = 1, shakeAmp = 0;
  const shake = (amp, dur) => {
    const cur = shakeAmp * (Math.max(0, shakeT) / shakeDur) ** 2;
    if (amp * 0.6 >= cur) { shakeAmp = amp * 0.6; shakeT = dur; shakeDur = dur; }
  };
  // Blitze gedämpft: nie mehr als halbe Deckkraft, weich ausblenden
  const flash = (alpha = 0.5, color = '#fff') => {
    flashEl.style.transition = 'none'; flashEl.style.background = color; flashEl.style.opacity = Math.min(0.3, alpha * 0.45);
    requestAnimationFrame(() => { flashEl.style.transition = 'opacity .9s ease-out'; flashEl.style.opacity = 0; });
  };
  const hide = (o) => { o.visible = false; };

  // Impact-System: Aberration, Zeitlupe, Impact-Frame, FOV-Punch, Titel-Wackeln, Speedlines
  const fx = { aberr: 0, invertT: 0, slowRecover: 0, fovKick: 0 };
  const extras = { anims: [], cleanups: [] }; // DOM-Animationen/Ebenen der Durchbruch-Finisher
  const base = { aberr: 0, glitch: 0 };
  const impact = (str = 1, { invert = false, slow = str >= 0.8 } = {}) => {
    fx.aberr = Math.max(fx.aberr, 0.8 * str);
    fx.fovKick = Math.min(fx.fovKick, -4 * str);
    shake(0.1 * str + 0.03, 0.6 + 0.4 * str);
    flash(0.12 + 0.2 * str);
    if (invert) fx.invertT = 0.06;
    if (slow) { ctx.timeScale = 0.22; fx.slowRecover = 1; }
    overlay.classList.remove('hit'); void overlay.offsetWidth; overlay.classList.add('hit');
  };
  // Aufräumen: alles außer Renderer, Umgebungslicht und Shadern (die bleiben für den nächsten Finisher)
  function teardown() {
    const geos = new Set(Object.values(geoCache));
    scene.traverse((o) => {
      if (o.geometry && !geos.has(o.geometry)) o.geometry.dispose?.();
      if (o.isLight) o.dispose?.();
      for (const m of [].concat(o.material || [])) for (const v of Object.values(m)) if (v?.isTexture && v !== sh.env) v.dispose();
    });
    for (const ps of composer.passes) ps.dispose?.();
    composer.dispose?.();
    renderer.setRenderTarget(null);
    for (const a of extras.anims) { try { a.cancel(); } catch { /* egal */ } }
    for (const f of extras.cleanups) { try { f(); } catch { /* egal */ } }
    overlay.remove();
  }
  if (warm) {
    // Nur Shader kompilieren und ein Bild rendern – unsichtbar
    // Shader möglichst parallel/asynchron übersetzen, damit die Seite dabei nicht hängt
    camera.position.set(0, 7, 8); camera.lookAt(0, 0, 0);
    const finishWarm = () => { try { composer.render(); } catch { /* egal */ } requestAnimationFrame(() => { teardown(); done(); }); };
    try {
      if (renderer.compileAsync) renderer.compileAsync(scene, camera).then(finishWarm, finishWarm);
      else { renderer.compile(scene, camera); finishWarm(); }
    } catch { finishWarm(); }
    return;
  }

  const ctx = { scene, king, kingPos, kingMat, parts, bigParts, debris, shake, flash, fxLight, hemi, key, rim, bg, cam, pieces, squares, loserColor, bloom, timeScale: 1, impact, base, renderer, camera, frameParts, kingSq, sqPos, mats, attacker,
    overlay, anims: extras.anims, cleanups: extras.cleanups, onFrame: null, noRender: false };
  const effect = (EFFECTS[finisher] || EFFECTS.klassisch)(ctx);
  const TOTAL = effect.total || 7.6;

  let t = 0, last = performance.now(), raf = 0, ended = false, subShown = false;
  const sub = overlay.querySelector('.fx-sub');
  sub.textContent = subtitle || (winnerName ? `${winnerName} gewinnt!` : 'Partie beendet');

  function finish() {
    if (ended) return; ended = true;
    overlay.classList.add('out');
    setTimeout(() => {
      cancelAnimationFrame(raf);
      teardown();
      removeEventListener('resize', onResize); removeEventListener('keydown', onKey);
      done();
    }, 600);
  }
  overlay.querySelector('.fx-skip').onclick = finish;
  const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ') finish(); };
  addEventListener('keydown', onKey);
  const onResize = () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', onResize);

  const tmp = new THREE.Vector3();
  const perf = { n: 0, sum: 0, done: false };
  const occDir = new THREE.Vector3(), occP = new THREE.Vector3(), occV = new THREE.Vector3();
  function frameLoop(now) {
    raf = requestAnimationFrame(frameLoop);
    const realDt = Math.min(0.1, (now - last) / 1000); last = now;
    const dt = realDt * ctx.timeScale;
    t += dt;
    if (t > 0.35) overlay.classList.add('title-on');
    if (!subShown && t > TOTAL - 2.2) { subShown = true; overlay.classList.add('sub-on'); }
    if (t > TOTAL) finish();

    effect.update(t, dt, realDt);
    // Filter & Zeitlupe
    fx.aberr *= Math.exp(-realDt * 2.5);
    fx.fovKick *= Math.exp(-realDt * 2.5);
    // Automatische Qualität: bei Ruckeln die Auflösung senken
    if (t > 0.6 && !perf.done) {
      perf.n++; perf.sum += realDt;
      if (perf.n === 40) {
        perf.done = true;
        const fps = perf.n / perf.sum;
        if (fps < 42 && pixelRatio > 1) { pixelRatio = 1; renderer.setPixelRatio(1); composer.setPixelRatio?.(1); onResize(); }
        if (fps < 28) { bloom.resolution?.set(innerWidth / 2, innerHeight / 2); spot.castShadow = false; }
      }
    }
    if (fx.invertT > 0) fx.invertT -= realDt;
    if (fx.slowRecover && ctx.timeScale < 1) ctx.timeScale = Math.min(1, ctx.timeScale + realDt * 0.9);
    fxPass.uniforms.uTime.value = now / 1000;
    fxPass.uniforms.uAberr.value = fx.aberr + base.aberr * 0.6 + 0.05;
    fxPass.uniforms.uGlitch.value = base.glitch;
    fxPass.uniforms.uInvert.value = fx.invertT > 0 ? 1 : 0;
    parts.update(dt); bigParts.update(dt); debris.update(dt);

    // Kamera: Anflug, dann langsames Kreisen
    const p = ease.inOut(seg(t, 0, 2.0));
    const ang = baseAngle + 1.3 * (1 - p) + cam.orbit * Math.max(0, t - 2);
    const dist = THREE.MathUtils.lerp(15, cam.distEnd, p);
    const h = THREE.MathUtils.lerp(10, cam.heightEnd, p) + cam.lookY * 0.5;
    camera.fov = THREE.MathUtils.lerp(60, 40, ease.inOut(seg(t, 0, 2.3))) + fx.fovKick;
    camera.updateProjectionMatrix();
    camera.position.set(kingPos.x + Math.sin(ang) * dist, h, kingPos.z + Math.cos(ang) * dist);
    tmp.set(0, 0, 0).lerp(cam.look, p); tmp.y += cam.lookY;
    if (shakeT > 0) {
      shakeT -= realDt;
      const a = shakeAmp * (Math.max(0, shakeT) / shakeDur) ** 2, s = now / 1000;
      camera.position.x += a * (Math.sin(s * 21) * 0.6 + Math.sin(s * 34 + 1.3) * 0.4);
      camera.position.y += a * (Math.sin(s * 25 + 2.1) * 0.6 + Math.sin(s * 39 + 0.4) * 0.4);
    }
    camera.lookAt(tmp);
    // Figuren, die zwischen Kamera und König stehen (oder direkt vor der Linse), weich ausblenden
    if (p > 0.5) {
      occDir.subVectors(tmp, camera.position);
      const len2 = occDir.lengthSq();
      for (const pc of pieces.values()) {
        if (pc.g === king || pc === attacker || !pc.mat) continue;
        occP.copy(pc.g.position); occP.y += 0.5;
        occV.subVectors(occP, camera.position);
        const tt = Math.max(0, Math.min(1, occV.dot(occDir) / len2));
        const d = occV.addScaledVector(occDir, -tt).length();
        const occluding = (tt > 0.03 && tt < 0.9 && d < 0.55) || occP.distanceTo(camera.position) < 1.25;
        pc.op += ((occluding ? 0.12 : 1) - pc.op) * (1 - Math.exp(-realDt * 10));
        pc.mat.opacity = pc.op * pc.baseOpacity;
        pc.mat.depthWrite = pc.op > 0.6;
        pc.g.traverse((o) => { if (o.isMesh) o.castShadow = pc.op > 0.6; });
      }
    }
    if (!ctx.noRender) composer.render();
    if (ctx.onFrame) { const f = ctx.onFrame; ctx.onFrame = null; try { f(renderer.domElement); } catch (e) { console.error(e); } }
  }
  raf = requestAnimationFrame(frameLoop);
  ctx.hide = hide;
}

// ------------------------------------------------------------ Effekte
const C = (s) => new THREE.Color(s);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------ Durchbruch: Effekte, die aus dem 3D-Fenster in die Website brechen
const BREAK = {
  layer(extras) {
    const l = document.createElement('div'); l.className = 'bx-layer';
    document.body.appendChild(l);
    extras.cleanups.push(() => l.remove());
    return l;
  },
  canvas(overlay) {
    const c = document.createElement('canvas'); c.className = 'bx-crack';
    c.width = innerWidth; c.height = innerHeight;
    overlay.appendChild(c);
    return c;
  },
  // Bild der 3D-Szene (+ Risse) – genau in dem Frame, in dem gerendert wurde
  snapshot(gl, extra) {
    const W = innerWidth, H = innerHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#07080d'; g.fillRect(0, 0, W, H);
    g.drawImage(gl, 0, 0, W, H);
    if (extra) g.drawImage(extra, 0, 0, W, H);
    return c.toDataURL('image/jpeg', 0.82);
  },
  // Bausteine der Website, die herumfliegen dürfen (große Container werden in ihre Kinder zerlegt)
  pieces() {
    const W = innerWidth, H = innerHeight, area = W * H, out = [];
    const visit = (el, depth) => {
      if (!el || el.closest('.finisher, .bx-layer, #overlay-root, #toasts')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 14 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) return;
      const isBoard = el.matches('.board, .board *, .hero-board, .hero-board *');
      if (!isBoard && r.width * r.height > area * 0.28 && depth < 4 && el.children.length) { for (const ch of el.children) visit(ch, depth + 1); return; }
      out.push({ el, r });
    };
    for (const sel of ['.topbar', '.view.active', '.nav', '#site-foot']) visit(document.querySelector(sel), 0);
    return out.slice(0, 70);
  },
  // Radiales Bruchmuster um den Einschlag
  pattern(ix, iy) {
    const n = 8, angs = [];
    const off = Math.random() * Math.PI;
    for (let i = 0; i < n; i++) angs.push(off + ((i + rand(-0.28, 0.28)) / n) * Math.PI * 2);
    return { ix, iy, angs, rings: [0, rand(80, 130), rand(240, 340), Math.hypot(innerWidth, innerHeight) * 1.3] };
  },
  drawCracks(c, pat, level) {
    const g = c.getContext('2d'), { ix, iy, angs, rings } = pat;
    g.clearRect(0, 0, c.width, c.height);
    const P = (a, r) => [ix + Math.cos(a) * r, iy + Math.sin(a) * r];
    const reach = level >= 2 ? rings[3] : rings[2] * 0.75;
    const stroke = (w, col, blur) => {
      g.lineWidth = w; g.strokeStyle = col; g.shadowColor = '#bfe9ff'; g.shadowBlur = blur; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (const a of angs) {
        g.moveTo(ix, iy);
        const steps = 12;
        for (let s = 1; s <= steps; s++) { const r = (reach * s) / steps; const [x, y] = P(a + Math.sin(s * 7.3 + a * 3) * 0.035, r); g.lineTo(x, y); }
      }
      for (let k = 1; k <= Math.min(level, 2); k++) {
        for (let i = 0; i < angs.length; i++) {
          const [x1, y1] = P(angs[i], rings[k]), [x2, y2] = P(angs[(i + 1) % angs.length], rings[k]);
          g.moveTo(x1, y1); g.lineTo((x1 + x2) / 2 + rand(-8, 8), (y1 + y2) / 2 + rand(-8, 8)); g.lineTo(x2, y2);
        }
      }
      g.stroke();
    };
    stroke(5, 'rgba(190,230,255,.35)', 18);
    stroke(1.6, 'rgba(255,255,255,.95)', 6);
    // Einschlag: weißer Stern
    const grd = g.createRadialGradient(ix, iy, 0, ix, iy, 60);
    grd.addColorStop(0, 'rgba(255,255,255,.95)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(ix, iy, 60, 0, Math.PI * 2); g.fill();
  },
  // Bildschirm zerspringt in Scherben, die über die Website fallen
  shatter(layer, img, pat) {
    const { ix, iy, angs, rings } = pat, n = angs.length, anims = [];
    const P = (a, r) => [ix + Math.cos(a) * r, iy + Math.sin(a) * r];
    for (let i = 0; i < n; i++) {
      const a1 = angs[i], a2 = angs[(i + 1) % n] + (i === n - 1 ? Math.PI * 2 : 0);
      for (let k = 0; k < 3; k++) {
        const pts = k === 0 ? [[ix, iy], P(a1, rings[1]), P(a2, rings[1])] : [P(a1, rings[k]), P(a1, rings[k + 1]), P(a2, rings[k + 1]), P(a2, rings[k])];
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const d = document.createElement('div'); d.className = 'bx-shard';
        d.style.backgroundImage = `url(${img})`;
        d.style.clipPath = `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
        d.style.transformOrigin = `${cx.toFixed(1)}px ${cy.toFixed(1)}px`;
        layer.appendChild(d);
        const dx = cx - ix, dy = cy - iy, len = Math.hypot(dx, dy) || 1;
        const sp = rand(160, 460) * (k === 0 ? 1.5 : 1);
        const vx = (dx / len) * sp + rand(-60, 60), vy = (dy / len) * sp - rand(80, 320), rot = rand(-300, 300), T = rand(1.4, 1.9);
        const frames = [];
        for (let s = 0; s <= 12; s++) {
          const t = (s / 12) * T;
          frames.push({ transform: `translate(${(vx * t).toFixed(1)}px, ${(vy * t + 1100 * t * t).toFixed(1)}px) rotate(${(rot * t).toFixed(1)}deg) scale(${(1 + 0.12 * t).toFixed(3)})`, opacity: s > 8 ? 1 - (s - 8) / 4 : 1 });
        }
        anims.push(d.animate(frames, { duration: T * 1000, delay: k * 50 + rand(0, 90), easing: 'linear', fill: 'forwards' }));
      }
    }
    return anims;
  },
  // Website stürzt ein: alles fällt aus dem Bild – und springt dann wieder an seinen Platz
  fall(items) {
    const H = innerHeight;
    return items.map(({ el, r }) => {
      const dx = rand(-140, 140), rot = rand(-40, 40), drop = H - r.top + rand(80, 320);
      return el.animate([
        { translate: '0px 0px', rotate: '0deg' },
        { translate: `${(dx * 0.1).toFixed(1)}px -18px`, rotate: `${(rot * 0.12).toFixed(1)}deg`, offset: 0.07, easing: 'cubic-bezier(.55,0,1,.45)' },
        { translate: `${dx.toFixed(1)}px ${drop.toFixed(1)}px`, rotate: `${rot.toFixed(1)}deg`, offset: 0.42 },
        { translate: `${dx.toFixed(1)}px ${drop.toFixed(1)}px`, rotate: `${rot.toFixed(1)}deg`, offset: 0.62, easing: 'cubic-bezier(.2,1.35,.4,1)' },
        { translate: '0px 0px', rotate: '0deg' },
      ], { duration: 3400, delay: ((r.top + r.height) / H) * -0 + rand(0, 260) + (1 - r.top / H) * 180, fill: 'none' });
    });
  },
  // Website wird in einen Punkt gesaugt – und nach dem Urknall wieder ausgespuckt
  vortex(items, cx, cy) {
    return items.map(({ el, r }, i) => {
      const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
      const spin = (i % 2 ? 1 : -1) * rand(380, 760), dist = Math.hypot(dx, dy);
      return el.animate([
        { translate: '0px 0px', rotate: '0deg', scale: '1', easing: 'cubic-bezier(.55,0,.95,.35)' },
        { translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px`, rotate: `${spin.toFixed(0)}deg`, scale: '0.02', offset: 0.4 },
        { translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px`, rotate: `${spin.toFixed(0)}deg`, scale: '0.02', offset: 0.56, easing: 'cubic-bezier(.12,1.45,.3,1)' },
        { translate: '0px 0px', rotate: '0deg', scale: '1' },
      ], { duration: 3600, delay: Math.max(0, 260 - dist * 0.25) + rand(0, 120), fill: 'none' });
    });
  },
  // Gezackter Riss quer über den Bildschirm
  tearPath(cx) {
    const H = innerHeight, pts = [];
    for (let i = 0; i <= 16; i++) pts.push([cx + (i === 0 || i === 16 ? rand(-20, 20) : rand(-50, 50)), -20 + ((H + 40) * i) / 16]);
    return pts;
  },
  drawTear(c, pts, prog) {
    const g = c.getContext('2d'), H = innerHeight, mid = H / 2, lo = mid - (prog * (H + 40)) / 2, hi = mid + (prog * (H + 40)) / 2;
    g.clearRect(0, 0, c.width, c.height);
    const path = () => {
      g.beginPath(); let started = false;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        if (y2 < lo || y1 > hi) continue;
        const ty1 = Math.max(y1, lo), ty2 = Math.min(y2, hi);
        const fx1 = x1 + ((x2 - x1) * (ty1 - y1)) / (y2 - y1), fx2 = x1 + ((x2 - x1) * (ty2 - y1)) / (y2 - y1);
        if (!started) { g.moveTo(fx1, ty1); started = true; }
        g.lineTo(fx2, ty2);
      }
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [w, col, blur] of [[26, 'rgba(255,79,216,.35)', 40], [10, 'rgba(122,247,255,.8)', 20], [3, '#ffffff', 8]]) {
      g.lineWidth = w; g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = blur; path(); g.stroke();
    }
  },
  // Bildschirm reißt in zwei Hälften, die auseinanderfliegen
  split(layer, img, pts) {
    const W = innerWidth, H = innerHeight;
    const poly = (side) => (side < 0 ? [[-20, -20], ...pts, [-20, H + 20]] : [[W + 20, -20], ...pts, [W + 20, H + 20]]);
    return [-1, 1].map((side) => {
      const d = document.createElement('div'); d.className = 'bx-shard';
      d.style.backgroundImage = `url(${img})`;
      d.style.clipPath = `polygon(${poly(side).map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
      d.style.transformOrigin = `${side < 0 ? 0 : W}px ${H / 2}px`;
      layer.appendChild(d);
      return d.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${side * 30}px, 0) rotate(${side * 2}deg)`, opacity: 1, offset: 0.15, easing: 'cubic-bezier(.5,0,.9,.5)' },
        { transform: `translate(${side * W * 0.8}px, ${rand(40, 120)}px) rotate(${side * 14}deg)`, opacity: 0.4 },
      ], { duration: 1500, easing: 'linear', fill: 'forwards' });
    });
  },
  bodyShake(extras, ms = 450) {
    const a = document.body.animate([
      { translate: '0 0' }, { translate: '-14px 8px' }, { translate: '12px -10px' }, { translate: '-9px -6px' }, { translate: '7px 9px' }, { translate: '-4px 3px' }, { translate: '0 0' },
    ], { duration: ms, easing: 'ease-out' });
    extras.anims.push(a);
  },
};

const EFFECTS = {
  // 🪟 Vierte Wand: Der König fliegt gegen deinen Bildschirm, das Glas zerspringt, die Website stürzt ein
  viertewand(ctx) {
    const { king, kingPos, parts, bigParts, attacker, cam, camera, overlay } = ctx;
    const extras = { anims: ctx.anims, cleanups: ctx.cleanups };
    const A = attacker?.g; const a0 = A ? A.position.clone() : kingPos.clone().add(V(1.5, 0, 1.5));
    const dir = towards(a0, kingPos);
    const crack = BREAK.canvas(overlay), layer = BREAK.layer(extras);
    const kStart = kingPos.clone(), fwd = V(0, 0, 0), target = V(0, 0, 0);
    let phase = 0, pat = null;
    return {
      total: 9.4,
      update(t, dt) {
        cam.distEnd = 5.2; cam.heightEnd = 2.3; cam.orbit = 0.025;
        // Anlauf der Matt-Figur
        if (A && t > 1.8 && phase === 0) {
          const k = ease.in(seg(t, 1.9, 2.55));
          A.position.lerpVectors(a0, kingPos.clone().addScaledVector(dir, -0.45), k);
          A.position.y = a0.y + Math.sin(k * Math.PI) * 0.25;
          parts.spawn(A.position.clone().setY(0.25), V(rand(-0.6, 0.6), rand(0.2, 0.9), rand(-0.6, 0.6)), C('#9fd8ff').multiplyScalar(1.5), 0.45);
        }
        if (phase === 0 && t >= 2.55) {
          phase = 1; sound.thud(); sound.whoosh(); ctx.impact(0.6, { slow: false });
          for (let i = 0; i < 140; i++) parts.spawn(kingPos.clone().setY(0.6), V(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 6)), C(i % 2 ? '#ffffff' : '#9fd8ff').multiplyScalar(1.4), rand(0.3, 0.8), 4);
        }
        // König fliegt direkt in die Kamera – und bleibt an der Scheibe kleben
        if (phase >= 1 && phase < 3) {
          camera.getWorldDirection(fwd);
          target.copy(camera.position).addScaledVector(fwd, 1.05); target.y -= 0.5;
          const k = ease.in(seg(t, 2.55, 3.2));
          king.position.lerpVectors(kStart, target, k);
          if (phase === 1) { king.rotation.y += dt * 16; king.rotation.z = Math.sin(t * 11) * 0.5 * (1 - k); }
          else { king.rotation.z *= 0.9; }
          if (phase === 1) bigParts.spawn(king.position.clone().add(V(0, 0.5, 0)), V(0, 0, 0), C('#bfe9ff').multiplyScalar(1.1), 0.25);
        }
        if (phase === 1 && t >= 3.2) {
          phase = 2;
          const p = king.position.clone().add(V(0, 0.55, 0)).project(camera);
          const ix = Math.min(innerWidth * 0.72, Math.max(innerWidth * 0.28, (p.x * 0.5 + 0.5) * innerWidth));
          const iy = Math.min(innerHeight * 0.7, Math.max(innerHeight * 0.3, (-p.y * 0.5 + 0.5) * innerHeight));
          pat = BREAK.pattern(ix, iy);
          BREAK.drawCracks(crack, pat, 1);
          sound.glass(); sound.boom(); ctx.impact(1.3, { slow: true }); ctx.flash(0.35);
          BREAK.bodyShake(extras, 500);
        }
        if (phase === 2 && !pat.l2 && t >= 4.0) { pat.l2 = true; BREAK.drawCracks(crack, pat, 2); sound.glass(); ctx.shake(0.05, 0.3); BREAK.bodyShake(extras, 380); }
        if (phase === 2 && t >= 4.75) {
          phase = 3;
          ctx.onFrame = (gl) => {
            const img = BREAK.snapshot(gl, crack);
            crack.remove(); ctx.noRender = true; overlay.classList.add('bx-open');
            ctx.anims.push(...BREAK.shatter(layer, img, pat));
            sound.glass(); sound.bang();
            const items = BREAK.pieces();
            const tm = setTimeout(() => { ctx.anims.push(...BREAK.fall(items)); sound.whoosh(); }, 280);
            ctx.cleanups.push(() => clearTimeout(tm));
          };
        }
      },
    };
  },

  // 🌀 Realitätsriss: ein Riss verschluckt den König, reißt den Bildschirm auf und saugt die Website hinein
  riss(ctx) {
    const { scene, king, kingPos, kingMat, parts, bigParts, attacker, cam, camera, overlay, pieces } = ctx;
    const extras = { anims: ctx.anims, cleanups: ctx.cleanups };
    const A = attacker?.g; const a0 = A ? A.position.clone() : kingPos.clone().add(V(1.5, 0, 1.5));
    const dir = towards(a0, kingPos);
    const riftPos = kingPos.clone().addScaledVector(dir, 1.25).setY(1.25);
    const riftMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uOpen: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform float uT, uOpen;
        float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
        float n(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
        void main(){
          float y = vUv.y;
          float jag = (n(y * 9.0 + uT * 0.7) - 0.5) * 0.16 + (n(y * 31.0 - uT * 2.0) - 0.5) * 0.05;
          float edge = smoothstep(0.0, 0.12, y) * smoothstep(1.0, 0.88, y);
          float w = uOpen * 0.09 * edge;
          float d = abs(vUv.x - 0.5 - jag);
          float core = smoothstep(w + 0.004, w * 0.3, d);
          float glow = exp(-d / (0.018 + w * 0.9)) * edge * min(uOpen, 1.5);
          vec3 col = mix(vec3(1.0, 0.31, 0.85), vec3(0.48, 0.97, 1.0), n(y * 4.0 + uT * 1.3));
          vec3 c = col * glow * 3.2 + mix(vec3(1.0), col, 0.35) * core * 3.5 / (1.0 + uOpen * 0.8);
          gl_FragColor = vec4(c, clamp(glow + core, 0.0, 1.0));
        }`,
    });
    const rift = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), riftMat);
    rift.position.copy(riftPos); scene.add(rift);
    const near = [...pieces.values()].filter((p) => p.g !== king && p.g.position.distanceTo(kingPos) < 2.6).map((p) => ({ g: p.g, p0: p.g.position.clone() }));
    const k0 = kingPos.clone();
    const tear = BREAK.canvas(overlay), layer = BREAK.layer(extras);
    const tearX = innerWidth / 2 + rand(-40, 40), pts = BREAK.tearPath(tearX);
    let phase = 0, gone = false;
    return {
      total: 9.8,
      update(t, dt) {
        cam.distEnd = 5.6; cam.heightEnd = 2.2; cam.orbit = 0.02;
        cam.look.lerp(k0.clone().lerp(riftPos, 0.5).setY(0.9), 1 - Math.exp(-dt * 2));
        riftMat.uniforms.uT.value = t;
        rift.quaternion.copy(camera.quaternion);
        const open = ease.out(seg(t, 1.7, 2.5)) + (gone ? ease.in(seg(t, 3.9, 4.6)) * 2.2 : 0);
        riftMat.uniforms.uOpen.value = open;
        rift.scale.set(1 + (gone ? ease.in(seg(t, 3.9, 4.6)) * 2.5 : 0), 1, 1);
        if (phase === 0 && t >= 1.75) { phase = 1; sound.rift(); }
        // Sog: Funken und Figuren werden zum Riss gezogen
        if (t > 1.8 && t < 4.6) {
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2, r = rand(1.4, 3.2);
            const p = riftPos.clone().add(V(Math.cos(a) * r, rand(-1.2, 1.2), Math.sin(a) * r));
            parts.spawn(p, riftPos.clone().sub(p).multiplyScalar(rand(1.2, 2.2)), C(i % 2 ? '#ff4fd8' : '#7af7ff').multiplyScalar(1.6), 0.55);
          }
          const pull = ease.inOut(seg(t, 2.2, 3.9)) * 0.35;
          for (const it of near) {
            it.g.position.lerpVectors(it.p0, riftPos.clone().setY(it.p0.y), pull * (1 - it.p0.distanceTo(k0) / 3));
            it.g.rotation.z = Math.sin(t * 20 + it.p0.x) * 0.06 * pull * 3;
          }
        }
        // König wird gestreckt und verschluckt
        if (!gone && t > 2.4) {
          const k = ease.in(seg(t, 2.5, 3.9));
          king.position.lerpVectors(k0, riftPos.clone().setY(riftPos.y - 0.6), k);
          king.scale.set(1 - k * 0.8, 1 + k * 1.6, 1 - k * 0.8);
          king.rotation.y += dt * (3 + k * 20);
          if (kingMat.emissive) { kingMat.emissive.set('#ff4fd8'); kingMat.emissiveIntensity = k * 1.2; }
          bigParts.spawn(king.position.clone().add(V(0, 0.5, 0)), V(0, 0, 0), C('#ff8ae8').multiplyScalar(1.2), 0.3);
          if (t >= 3.9) {
            gone = true; king.visible = false; sound.boom(); ctx.impact(1.2, { slow: false }); ctx.flash(0.6, '#ffd6f6');
            for (let i = 0; i < 260; i++) parts.spawn(riftPos.clone(), V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 7)), C(i % 2 ? '#ff4fd8' : '#7af7ff').multiplyScalar(1.6), rand(0.4, 1.1), 0, 1);
          }
        }
        // Der Riss bricht aus dem Bildschirm aus
        if (gone && phase < 3) BREAK.drawTear(tear, pts, ease.out(seg(t, 4.0, 4.55)));
        if (gone && phase === 1 && t >= 4.0) { phase = 2; sound.rift(); BREAK.bodyShake(extras, 600); }
        if (phase === 2 && t >= 4.6) {
          phase = 3;
          ctx.onFrame = (gl) => {
            const img = BREAK.snapshot(gl, tear);
            tear.remove(); ctx.noRender = true; overlay.classList.add('bx-open');
            const glow = document.createElement('div'); glow.className = 'bx-rift'; glow.style.left = `${tearX}px`; layer.appendChild(glow);
            ctx.anims.push(glow.animate([{ scale: '1 0' }, { scale: '1 1', offset: 0.1 }, { scale: '3 1', offset: 0.55 }, { scale: '12 1.2', opacity: 1, offset: 0.62 }, { scale: '0 1', opacity: 0 }], { duration: 4200, fill: 'forwards', easing: 'ease-in-out' }));
            ctx.anims.push(...BREAK.split(layer, img, pts));
            sound.bang();
            const items = BREAK.pieces();
            const t1 = setTimeout(() => { ctx.anims.push(...BREAK.vortex(items, tearX, innerHeight / 2)); sound.rift(); }, 300);
            const t2 = setTimeout(() => {
              const bang = document.createElement('div'); bang.className = 'bx-bang'; bang.style.setProperty('--x', `${tearX}px`); layer.appendChild(bang);
              ctx.anims.push(bang.animate([{ opacity: 0, scale: '0.2' }, { opacity: 1, scale: '1', offset: 0.15 }, { opacity: 0, scale: '1.6' }], { duration: 1100, fill: 'forwards' }));
              sound.bang(); BREAK.bodyShake(extras, 700);
            }, 300 + 3600 * 0.56 - 80);
            ctx.cleanups.push(() => { clearTimeout(t1); clearTimeout(t2); });
          };
        }
      },
    };
  },

  klassisch(ctx) {
    const { king, kingPos, parts } = ctx;
    let thud = false;
    const gold = [C('#ffd166'), C('#fff1b8'), C('#f4a261')];
    return {
      update(t) {
        if (t > 1.8 && t < 2.7) king.rotation.z = Math.sin((t - 1.8) * 22) * 0.04 * (t - 1.8);
        if (t >= 2.7) {
          const p = seg(t, 2.7, 3.45);
          let a = ease.in(p) * (Math.PI / 2 - 0.08);
          if (t > 3.45) a = Math.PI / 2 - 0.08 - Math.abs(Math.sin((t - 3.45) * 9)) * 0.12 * Math.exp(-(t - 3.45) * 4);
          king.rotation.z = -a;
          king.position.x = kingPos.x + Math.sin(a) * 0.12;
          king.position.y = kingPos.y + Math.sin(a) * 0.32 * (a > 1 ? 1 : a);
          if (t > 3.45 && !thud) {
            thud = true; sound.thud(); ctx.impact(0.55, { invert: false, slow: true });
            for (let i = 0; i < 260; i++) { const an = Math.random() * 6.28; parts.spawn(V(kingPos.x + 0.6, 0.2, kingPos.z), V(Math.cos(an) * rand(0.5, 2), rand(0.2, 1.2), Math.sin(an) * rand(0.5, 2)), C('#9a8f80').multiplyScalar(0.5), rand(0.6, 1.4), 0.6, 1.5); }
          }
        }
        if (t > 3.6 && t < 6.5 && Math.random() < 0.5) parts.spawn(V(kingPos.x + rand(-1.6, 1.6), 0.15, kingPos.z + rand(-1.6, 1.6)), V(0, rand(0.5, 1.2), 0), gold[(Math.random() * 3) | 0].clone().multiplyScalar(0.8), rand(1, 1.8));
      },
    };
  },

  feuerwerk(ctx) {
    const { king, kingPos, parts, bigParts, cam } = ctx;
    let launched = false, boomN = 0;
    const palettes = [['#ff3d6e', '#ffd166', '#ffffff'], ['#39f0ff', '#7c5cff', '#ffffff'], ['#7ee787', '#f2cc60', '#ff7b72'], ['#ff3df0', '#ffffff', '#ffa657']];
    const burst = (pos, pal, n = 800) => {
      sound.boom(); ctx.flash(0.35, pal[0]); ctx.impact(0.35, { invert: false, slow: false });
      ctx.fxLight.position.copy(pos); ctx.fxLight.color.set(pal[0]); ctx.fxLight.intensity = 60;
      for (let i = 0; i < n; i++) {
        const v = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 5.5));
        parts.spawn(pos, v, C(pal[i % pal.length]).multiplyScalar(1.6), rand(1.2, 2.2), 1.6, 1.2);
      }
      for (let i = 0; i < 30; i++) bigParts.spawn(pos, V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(2), C(pal[0]).multiplyScalar(0.5), 0.6);
    };
    let ry = 0;
    return {
      total: 8,
      update(t, dt) {
        ctx.fxLight.intensity *= 0.9;
        if (t > 1.8 && t < 2.6) {
          king.position.x = kingPos.x + rand(-0.03, 0.03); king.position.z = kingPos.z + rand(-0.03, 0.03);
          for (let i = 0; i < 6; i++) parts.spawn(V(kingPos.x, 0.15, kingPos.z), V(rand(-1.5, 1.5), rand(1, 3), rand(-1.5, 1.5)), C('#ffb347'), rand(0.3, 0.7), 4);
        }
        if (t >= 2.6 && t < 3.7) {
          if (!launched) { launched = true; sound.whoosh(); }
          const tt = t - 2.6;
          king.position.set(kingPos.x, kingPos.y + 0.5 * 11 * tt * tt, kingPos.z);
          ry += dt * 14; king.rotation.y = ry;
          for (let i = 0; i < 14; i++) parts.spawn(V(kingPos.x + rand(-0.1, 0.1), king.position.y, kingPos.z + rand(-0.1, 0.1)), V(rand(-0.6, 0.6), rand(-4, -1), rand(-0.6, 0.6)), C(i % 3 ? '#ffb347' : '#ffffff'), rand(0.3, 0.8), 0, 1);
          cam.lookY = Math.min(4, king.position.y * 0.6);
          cam.distEnd = 3.8 + tt * 4;
        }
        if (t >= 3.7 && boomN === 0) { boomN = 1; king.visible = false; burst(V(kingPos.x, 6.6, kingPos.z), palettes[0], 700); }
        if (t >= 4.3 && boomN === 1) { boomN = 2; burst(V(kingPos.x + 2.2, 5.6, kingPos.z - 1.5), palettes[1]); }
        if (t >= 4.8 && boomN === 2) { boomN = 3; burst(V(kingPos.x - 2.4, 6.2, kingPos.z - 1), palettes[2]); }
        if (t >= 5.4 && boomN === 3) { boomN = 4; burst(V(kingPos.x + 0.5, 7.4, kingPos.z - 2.5), palettes[3], 600); }
      },
    };
  },

  blitz(ctx) {
    const { scene, king, kingPos, kingMat, parts, debris } = ctx;
    const strikes = [2.3, 2.85, 3.35];
    let si = 0, bolt = null, boltT = 0, charred = false, crumbled = false;
    const boltMat = new THREE.MeshBasicMaterial({ color: C('#cfe9ff').multiplyScalar(3) });
    const makeBolt = () => {
      const g = new THREE.Group();
      const branch = (from, to, segs, w) => {
        let prev = from.clone();
        for (let i = 1; i <= segs; i++) {
          const p = from.clone().lerp(to, i / segs);
          if (i < segs) { p.x += rand(-0.5, 0.5); p.z += rand(-0.5, 0.5); }
          const len = prev.distanceTo(p);
          const cyl = new THREE.Mesh(new THREE.CylinderGeometry(w, w, len, 5), boltMat);
          cyl.position.copy(prev).lerp(p, 0.5);
          cyl.quaternion.setFromUnitVectors(V(0, 1, 0), p.clone().sub(prev).normalize());
          g.add(cyl);
          if (Math.random() < 0.18 && w > 0.02) branch(p, p.clone().add(V(rand(-2, 2), rand(-3, -1.5), rand(-2, 2))), 5, w * 0.5);
          prev = p;
        }
      };
      branch(V(kingPos.x + rand(-2, 2), 16, kingPos.z + rand(-2, 2)), V(kingPos.x, 1.35, kingPos.z), 16, 0.05);
      scene.add(g);
      return g;
    };
    const dark = C('#020308');
    return {
      update(t, dt) {
        const d = seg(t, 1.8, 2.2);
        ctx.hemi.intensity = 0.9 - d * 0.75; ctx.key.intensity = 2.4 - d * 2.1;
        ctx.bg.copy(C('#07080d').lerp(dark, d));
        if (t > 1.8) for (let i = 0; i < 10; i++) parts.spawn(V(kingPos.x + rand(-7, 7), 9, kingPos.z + rand(-7, 7)), V(-0.5, -14, 0), C('#4a6a99').multiplyScalar(0.5), 0.7);
        if (si < 3 && t >= strikes[si]) {
          si++; bolt && scene.remove(bolt); bolt = makeBolt(); boltT = 0.16;
          sound.zap(); ctx.flash(0.75, '#dff1ff'); ctx.impact(si === 3 ? 1 : 0.55, { invert: true, slow: si === 3 });
          ctx.fxLight.position.set(kingPos.x, 2.5, kingPos.z); ctx.fxLight.color.set('#9fd4ff'); ctx.fxLight.intensity = 140;
          for (let i = 0; i < 160; i++) parts.spawn(V(kingPos.x, 1.3, kingPos.z), V(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 6)), C('#bfe6ff').multiplyScalar(1.5), rand(0.3, 0.9), 6, 1);
          if (si === 3) charred = true;
        }
        if (bolt) { boltT -= dt; bolt.visible = Math.random() > 0.25; if (boltT <= 0) { scene.remove(bolt); bolt = null; } }
        ctx.fxLight.intensity *= 0.86;
        if (charred && !crumbled) {
          kingMat.color.lerp(C('#111111'), 0.1); kingMat.emissive = kingMat.emissive || C('#000');
          kingMat.emissive.set('#ff4a00'); kingMat.emissiveIntensity = 0.4 + Math.sin(t * 30) * 0.3;
          kingMat.metalness = 0; kingMat.roughness = 1;
          king.position.x = kingPos.x + rand(-0.02, 0.02);
          for (let i = 0; i < 3; i++) parts.spawn(V(kingPos.x + rand(-0.2, 0.2), rand(0.3, 1.2), kingPos.z + rand(-0.2, 0.2)), V(rand(-0.2, 0.2), rand(0.4, 1.2), rand(-0.2, 0.2)), C('#ff6a00'), rand(0.5, 1.2));
        }
        if (t > 4.1 && !crumbled) {
          crumbled = true; king.visible = false; sound.boom();
          debris.burst(kingPos, kingMat, 45, { speed: 1.4, up: 2, size: [0.05, 0.14], spread: 0.15 });
          for (let i = 0; i < 200; i++) parts.spawn(V(kingPos.x, rand(0.2, 1), kingPos.z), V(rand(-2, 2), rand(0, 2), rand(-2, 2)), C('#ff7a1a'), rand(0.5, 1.6), 2, 1);
        }
      },
    };
  },

  meteor(ctx) {
    const { scene, king, kingPos, kingMat, parts, bigParts, debris, pieces } = ctx;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: '#3a1d0e', emissive: C('#ff5a00'), emissiveIntensity: 2.2, flatShading: true, roughness: 0.9 }));
    const start = V(kingPos.x - 7, 15, kingPos.z - 9);
    const end = V(kingPos.x, 0.9, kingPos.z);
    rock.position.copy(start); rock.visible = false; scene.add(rock);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: C('#ffae42').multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(kingPos.x, 0.13, kingPos.z); ring.visible = false; scene.add(ring);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0 }));
    crater.rotation.x = -Math.PI / 2; crater.position.set(kingPos.x, 0.105, kingPos.z); scene.add(crater);
    let impact = false, impactT = 0, whoosh = false;
    const fire = [C('#ffd27a'), C('#ff7a1a'), C('#ff3b1a')];
    return {
      update(t, dt) {
        const red = seg(t, 1.6, 2.4);
        ctx.bg.copy(C('#07080d').lerp(C('#2a0a05'), red * 0.8));
        if (t > 1.8 && !impact) {
          if (!whoosh) { whoosh = true; sound.whoosh(); }
          rock.visible = true;
          const p = ease.in(seg(t, 1.8, 3.05));
          rock.position.lerpVectors(start, end, p);
          rock.rotation.x += dt * 6; rock.rotation.y += dt * 4;
          ctx.fxLight.position.copy(rock.position); ctx.fxLight.color.set('#ff7a1a'); ctx.fxLight.intensity = 40;
          for (let i = 0; i < 26; i++) parts.spawn(rock.position.clone().add(V(rand(-0.25, 0.25), rand(-0.25, 0.25), rand(-0.25, 0.25))), V(rand(-0.4, 0.4), rand(-0.2, 0.6), rand(-0.4, 0.4)), fire[i % 3].clone().multiplyScalar(1.4), rand(0.25, 0.8));
          bigParts.spawn(rock.position, V(0, 0, 0), C('#ff5a00').multiplyScalar(0.6), 0.25);
          if (p >= 1) {
            impact = true; impactT = t; rock.visible = false; king.visible = false;
            sound.boom(); ctx.flash(1, '#ffe2b0'); ctx.impact(1.3);
            ctx.fxLight.position.set(kingPos.x, 1, kingPos.z); ctx.fxLight.intensity = 260;
            debris.burst(kingPos, kingMat, 40, { speed: 5, up: 6 });
            debris.burst(kingPos, rock.material, 16, { speed: 4, up: 5, size: [0.08, 0.2] });
            for (let i = 0; i < 1300; i++) { const v = V(rand(-1, 1), rand(0.1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 11)); parts.spawn(V(kingPos.x, 0.4, kingPos.z), v, fire[i % 3].clone().multiplyScalar(1.5), rand(0.6, 2), 5, 1.2); }
            for (let i = 0; i < 60; i++) bigParts.spawn(V(kingPos.x, 0.5, kingPos.z), V(rand(-3, 3), rand(0.5, 3), rand(-3, 3)), C('#ff7a1a').multiplyScalar(0.7), rand(0.4, 1));
            ring.visible = true;
            for (const [sq, pc] of pieces) {
              if (pc.g === king) continue;
              const d = pc.g.position.distanceTo(kingPos);
              if (d < 2.2) { pc.push = pc.g.position.clone().sub(kingPos).setY(0).normalize().multiplyScalar((2.2 - d) * 0.5); pc.tilt = (2.2 - d) * 0.5; }
            }
          }
        }
        if (impact) {
          const k = t - impactT;
          ring.scale.setScalar(1 + k * 9); ring.material.opacity = Math.max(0, 1 - k * 1.3);
          crater.material.opacity = Math.min(0.75, k * 3);
          ctx.fxLight.intensity *= 0.93;
          for (const pc of pieces.values()) if (pc.push && k < 0.5) { pc.g.position.addScaledVector(pc.push, dt * 2); pc.g.rotation.x += pc.tilt * dt * 1.5 * Math.sign(pc.push.z || 1); pc.g.rotation.z -= pc.tilt * dt * 1.5 * Math.sign(pc.push.x || 1); }
          if (k > 0.3) for (let i = 0; i < 2; i++) parts.spawn(V(kingPos.x + rand(-0.8, 0.8), 0.2, kingPos.z + rand(-0.8, 0.8)), V(rand(-0.1, 0.1), rand(0.5, 1.4), rand(-0.1, 0.1)), C('#ff6a1a').multiplyScalar(0.8), rand(0.8, 1.8));
        }
      },
    };
  },

  kristall(ctx) {
    const { scene, king, kingPos, kingMat, parts, debris } = ctx;
    const iceMat = new THREE.MeshStandardMaterial({ color: '#d6f3ff', emissive: C('#4cc3ff'), emissiveIntensity: 0.6, metalness: 0.1, roughness: 0.18, transparent: true, opacity: 0.85 });
    const frost = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: C('#bfefff'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    frost.rotation.x = -Math.PI / 2; frost.position.set(kingPos.x, 0.106, kingPos.z); scene.add(frost);
    const c0 = kingMat.color.clone();
    let shattered = false, crack = false;
    return {
      update(t, dt, realDt) {
        if (t > 1.8 && !shattered) {
          const p = seg(t, 1.8, 3.0);
          kingMat.color.copy(c0).lerp(C('#cdefff'), p);
          kingMat.emissive = kingMat.emissive || C('#000'); kingMat.emissive.set('#4cc3ff'); kingMat.emissiveIntensity = p * 0.8;
          kingMat.metalness = THREE.MathUtils.lerp(kingMat.metalness, 0.1, p); kingMat.roughness = THREE.MathUtils.lerp(kingMat.roughness, 0.18, p);
          frost.scale.setScalar(0.3 + p * 2.2); frost.material.opacity = p * 0.35;
          for (let i = 0; i < 8; i++) { const a = t * 3 + i * 0.8, r = 0.9 - p * 0.4; parts.spawn(V(kingPos.x + Math.cos(a) * r, 0.2 + ((t * 2 + i * 0.15) % 1.4), kingPos.z + Math.sin(a) * r), V(-Math.sin(a) * 1.2, 0.5, Math.cos(a) * 1.2), C('#d8f6ff').multiplyScalar(1.2), 0.5); }
          if (t > 3.0) { king.position.x = kingPos.x + rand(-0.025, 0.025); if (!crack) { crack = true; sound.shatter(); } }
        }
        if (t > 3.3 && !shattered) {
          shattered = true; king.visible = false; sound.shatter(); ctx.flash(0.6, '#e6f7ff'); ctx.impact(1.1);
          ctx.fxLight.position.set(kingPos.x, 1, kingPos.z); ctx.fxLight.color.set('#8fe3ff'); ctx.fxLight.intensity = 120;
          debris.burst(kingPos, iceMat, 90, { speed: 5, up: 5, size: [0.05, 0.16], geo: 'tetra', spread: 0.2 });
          for (let i = 0; i < 300; i++) parts.spawn(V(kingPos.x, rand(0.2, 1.2), kingPos.z), V(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1, 6)), C('#e6f9ff').multiplyScalar(0.8), rand(0.6, 2.2), 1.5, 1);
          ctx.timeScale = 0.18;
        }
        if (shattered) {
          ctx.timeScale = Math.min(1, ctx.timeScale + realDt * 0.55);
          ctx.fxLight.intensity *= 0.95;
        }
      },
    };
  },

  loch(ctx) {
    const { scene, king, kingPos, parts, squares, pieces } = ctx;
    const hole = V(kingPos.x, 3.4, kingPos.z);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 48, 32), new THREE.MeshBasicMaterial({ color: '#000' }));
    core.position.copy(hole); core.scale.setScalar(0.001); scene.add(core);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.035, 12, 96), new THREE.MeshBasicMaterial({ color: C('#ffd2a0').multiplyScalar(3) }));
    halo.position.copy(hole); halo.scale.setScalar(0.001); scene.add(halo);
    // Akkretionsscheibe
    const N = 2500;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const ang = new Float32Array(N), rad = new Float32Array(N), hgt = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      ang[i] = Math.random() * 6.28; rad[i] = rand(0.95, 2.6); hgt[i] = rand(-0.04, 0.04) * rad[i];
      const c = C('#ffb25a').lerp(C('#8a3dff'), (rad[i] - 0.95) / 1.65).multiplyScalar(1.6);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const disk = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.07, map: parts.mat.map, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    disk.position.copy(hole); disk.rotation.x = 0.42; disk.scale.setScalar(0.001); scene.add(disk);
    const near = squares.map((m) => ({ m, d: m.position.distanceTo(V(kingPos.x, 0, kingPos.z)), o: m.position.clone(), s: rand(0.6, 1.4) })).filter((x) => x.d > 0.1 && x.d < 2.3);
    const kingSqMesh = squares.find((m) => Math.abs(m.position.x - kingPos.x) < 0.01 && Math.abs(m.position.z - kingPos.z) < 0.01);
    if (kingSqMesh) near.push({ m: kingSqMesh, d: 0.5, o: kingSqMesh.position.clone(), s: 1.6 });
    const others = [...pieces.values()].filter((p) => p.g !== king && p.g.position.distanceTo(kingPos) < 2.6);
    let started = false, collapsed = false;
    const size = { v: 0 };
    return {
      total: 8,
      update(t, dt) {
        ctx.cam.lookY = Math.min(1.4, seg(t, 1.8, 3) * 1.4);
        ctx.cam.distEnd = 5.2; ctx.cam.heightEnd = 2.6;
        if (t > 1.8 && !collapsed) {
          if (!started) { started = true; sound.whoosh(); }
          size.v = ease.out(seg(t, 1.8, 2.8));
          ctx.base.aberr = size.v * 0.9;
          core.scale.setScalar(size.v); halo.scale.setScalar(size.v); disk.scale.setScalar(size.v);
          halo.lookAt(ctx.cam.look.clone().add(V(0, 10, 10)));
          ctx.hemi.intensity = 0.9 - size.v * 0.6; ctx.key.intensity = 2.4 - size.v * 1.6;
          ctx.fxLight.position.copy(hole); ctx.fxLight.color.set('#a06bff'); ctx.fxLight.intensity = 30 * size.v;
          ctx.bg.copy(C('#07080d').lerp(C('#0d0420'), size.v));
          // König wird eingesaugt
          const p = seg(t, 2.5, 4.6), e = ease.in(p);
          king.position.lerpVectors(kingPos, hole, e);
          king.rotation.y += dt * (3 + p * 30);
          king.rotation.z = Math.sin(t * 6) * 0.3 * p;
          king.scale.set(1 - e * 0.95, 1 + e * 1.6 - e * e * 2.5, 1 - e * 0.95);
          if (p >= 1) king.visible = false;
          for (const n of near) {
            const q = ease.in(seg(t, 2.6 + n.d * 0.35, 5.0 + n.d * 0.2)) * (n.s > 1.5 ? 1 : 0.55);
            n.m.position.lerpVectors(n.o, hole, q);
            n.m.rotation.x += dt * n.s * q * 4; n.m.rotation.z += dt * n.s * q * 3;
            n.m.scale.setScalar(Math.max(0.01, 1 - q * 0.9));
          }
          for (const o of others) { const dir = hole.clone().sub(o.g.position).normalize(); o.g.rotation.x = dir.z * 0.25 * size.v * (1 + Math.sin(t * 9) * 0.2); o.g.rotation.z = -dir.x * 0.25 * size.v; }
          for (let i = 0; i < 12; i++) { const a = Math.random() * 6.28, r = rand(2.4, 4); const p0 = V(hole.x + Math.cos(a) * r, hole.y + rand(-1.5, 1), hole.z + Math.sin(a) * r); parts.spawn(p0, hole.clone().sub(p0).multiplyScalar(0.9).add(V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(1.5)), C('#c79bff').multiplyScalar(1.2), 1.0); }
        }
        // Scheibe rotieren
        for (let i = 0; i < N; i++) {
          ang[i] += dt * 2.6 / (rad[i] ** 1.5);
          pos[i * 3] = Math.cos(ang[i]) * rad[i]; pos[i * 3 + 1] = hgt[i]; pos[i * 3 + 2] = Math.sin(ang[i]) * rad[i];
        }
        dg.attributes.position.needsUpdate = true;
        core.scale.setScalar(size.v * (1 + Math.sin(t * 7) * 0.03));
        if (t > 5.2 && !collapsed) {
          collapsed = true; sound.boom(); ctx.flash(0.9, '#e2ccff'); ctx.impact(1.3);
          for (let i = 0; i < 600; i++) { const a = Math.random() * 6.28; parts.spawn(hole, V(Math.cos(a), rand(-0.15, 0.15), Math.sin(a)).multiplyScalar(rand(3, 9)), C(i % 2 ? '#c79bff' : '#ffd2a0').multiplyScalar(1.5), rand(0.6, 1.6), 0, 1.4); }
          ctx.fxLight.intensity = 200;
        }
        if (collapsed) {
          size.v = Math.max(0, size.v - dt * 4);
          ctx.base.aberr = 0;
          core.scale.setScalar(size.v + 0.001); halo.scale.setScalar(size.v + 0.001); disk.scale.setScalar(size.v + 0.001);
          ctx.fxLight.intensity *= 0.92;
          ctx.hemi.intensity = Math.min(0.9, ctx.hemi.intensity + dt * 0.5);
          for (const o of others) { o.g.rotation.x *= 0.9; o.g.rotation.z *= 0.9; }
        }
      },
    };
  },
};

// ------------------------------------------------------------ Neue Finisher (v1.2)
const radiusAt = (profile, y) => {
  for (let i = 1; i < profile.length - 1; i++) {
    const [x0, y0] = profile[i], [x1, y1] = profile[i + 1];
    if (y1 > y0 && y >= y0 && y <= y1) return x0 + (x1 - x0) * ((y - y0) / (y1 - y0));
  }
  return 0;
};

Object.assign(EFFECTS, {
  // 🛰️ Orbital-Laser
  laser(ctx) {
    const { scene, king, kingPos, kingMat, parts, bigParts, debris, squares, cam } = ctx;
    const add = (m) => { scene.add(m); return m; };
    const basic = (c, k = 1, extra = {}) => new THREE.MeshBasicMaterial({ color: C(c).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, ...extra });
    const reticle = new THREE.Group();
    reticle.add(new THREE.Mesh(new THREE.RingGeometry(1, 1.07, 72), basic('#ff2d55', 3)));
    reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.5, 0.54, 48), basic('#ff2d55', 3)));
    for (let i = 0; i < 4; i++) { const tk = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.42), basic('#ff2d55', 3)); const a = i * Math.PI / 2; tk.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0); tk.rotation.z = a + Math.PI / 2; reticle.add(tk); }
    reticle.rotation.x = -Math.PI / 2; reticle.position.set(kingPos.x, 0.125, kingPos.z); reticle.visible = false; add(reticle);
    const core = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 40, 32, 1, true), new THREE.MeshBasicMaterial({ color: C('#eafcff').multiplyScalar(3.2) })));
    const glow = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 40, 32, 1, true), basic('#38d9ff', 0.9, { opacity: 0.28 })));
    for (const b of [core, glow]) { b.position.set(kingPos.x, 20.1, kingPos.z); b.scale.set(0.001, 1, 0.001); b.visible = false; }
    const scorch = add(new THREE.Mesh(new THREE.CircleGeometry(1.3, 48), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0 })));
    scorch.rotation.x = -Math.PI / 2; scorch.position.set(kingPos.x, 0.104, kingPos.z);
    const heat = add(new THREE.Mesh(new THREE.RingGeometry(0.9, 1.7, 64), basic('#ff7a1a', 2, { opacity: 0 })));
    heat.rotation.x = -Math.PI / 2; heat.position.set(kingPos.x, 0.107, kingPos.z);
    const wave = add(new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 72), basic('#9ff0ff', 3, { opacity: 0 })));
    wave.rotation.x = -Math.PI / 2; wave.position.set(kingPos.x, 0.13, kingPos.z);
    const hot = squares.filter((m) => Math.hypot(m.position.x - kingPos.x, m.position.z - kingPos.z) < 1.7).map((m) => { m.material = m.material.clone(); m.material.emissive = C('#ff5a00'); m.material.emissiveIntensity = 0; return m; });
    const beeps = [1.9, 2.25, 2.55, 2.75, 2.9]; let bi = 0;
    let fired = false, vapor = false, endWave = false;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 8.5; cam.heightEnd = 3.2; cam.orbit = 0.1;
        cam.lookY = THREE.MathUtils.lerp(0, 1.6, ease.inOut(seg(t, 2.8, 3.6))) * (1 - seg(t, 5.2, 6.2) * 0.6);
        if (t > 1.8 && t < 3.2) {
          reticle.visible = true;
          const p = ease.out(seg(t, 1.8, 2.9));
          reticle.scale.setScalar(2.6 - 1.6 * p);
          reticle.rotation.z += dt * (4 - p * 3);
          reticle.children.forEach((c) => { c.material.opacity = 0.55 + 0.45 * Math.sin(t * 30); });
          ctx.bg.copy(C('#07080d').lerp(C('#020308'), seg(t, 2.2, 3)));
          ctx.hemi.intensity = 0.9 - seg(t, 2.2, 3) * 0.6;
          if (bi < beeps.length && t >= beeps[bi]) { bi++; sound.lock(); }
        }
        if (t > 2.85 && t < 3.08) { core.visible = true; core.scale.set(0.06, 1, 0.06); core.visible = Math.random() > 0.3; }
        if (t >= 3.08 && !fired) {
          fired = true; reticle.visible = false; core.visible = glow.visible = true;
          ctx.impact(1.5); sound.laser(); sound.boom();
          ctx.fxLight.position.set(kingPos.x, 1.5, kingPos.z); ctx.fxLight.color.set('#7fe8ff');
        }
        if (fired && t < 4.6) {
          const g = ease.out(seg(t, 3.08, 3.25)) * (1 + Math.sin(t * 50) * 0.06);
          core.scale.set(g, 1, g); glow.scale.set(g * (1.2 + Math.sin(t * 23) * 0.15), 1, g * (1.2 + Math.sin(t * 23) * 0.15));
          ctx.fxLight.intensity = 110; ctx.base.aberr = 0.5;
          ctx.shake(0.035, 0.2);
          for (let i = 0; i < 18; i++) parts.spawn(V(kingPos.x + rand(-0.3, 0.3), rand(0.2, 3), kingPos.z + rand(-0.3, 0.3)), V(rand(-0.5, 0.5), rand(4, 12), rand(-0.5, 0.5)), C('#bff6ff').multiplyScalar(1.6), rand(0.3, 0.8));
          for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28; parts.spawn(V(kingPos.x + Math.cos(a) * 0.5, 0.15, kingPos.z + Math.sin(a) * 0.5), V(Math.cos(a) * rand(3, 9), rand(0.5, 3), Math.sin(a) * rand(3, 9)), C(i % 2 ? '#ffb347' : '#fff1c1').multiplyScalar(1.5), rand(0.3, 0.9), 6, 1); }
          kingMat.emissive = kingMat.emissive || C('#000'); kingMat.emissive.set('#e8fbff'); kingMat.emissiveIntensity = seg(t, 3.08, 3.4) * 4;
          for (const m of hot) m.material.emissiveIntensity = seg(t, 3.1, 4.2) * 1.6 * Math.max(0.2, 1 - Math.hypot(m.position.x - kingPos.x, m.position.z - kingPos.z) / 1.7);
          heat.material.opacity = seg(t, 3.2, 4) * 0.8;
        }
        if (t > 3.45 && !vapor) {
          vapor = true; king.visible = false; ctx.impact(0.8, { slow: false });
          for (let i = 0; i < 700; i++) parts.spawn(V(kingPos.x + rand(-0.3, 0.3), rand(0.1, 1.2), kingPos.z + rand(-0.3, 0.3)), V(rand(-1.5, 1.5), rand(3, 14), rand(-1.5, 1.5)), C(i % 3 ? '#9ff0ff' : '#ffffff').multiplyScalar(1.8), rand(0.5, 1.6), 0, 0.6);
          debris.burst(kingPos, new THREE.MeshBasicMaterial({ color: C('#ffd27a').multiplyScalar(3) }), 30, { speed: 6, up: 7, size: [0.03, 0.08] });
        }
        if (t >= 4.6) {
          const s2 = 1 - ease.in(seg(t, 4.6, 5.0));
          core.scale.set(s2, 1, s2); glow.scale.set(s2 * 1.2, 1, s2 * 1.2);
          if (s2 <= 0.001) core.visible = glow.visible = false;
          ctx.fxLight.intensity *= 0.9; ctx.base.aberr = 0;
          scorch.material.opacity = Math.min(0.8, scorch.material.opacity + dt * 2);
          heat.material.opacity = Math.max(0, 0.8 - seg(t, 5, 7.5) * 0.8);
          for (const m of hot) m.material.emissiveIntensity *= 0.985;
          if (!endWave) { endWave = true; ctx.impact(0.6, { invert: false, slow: false }); sound.boom(); wave.material.opacity = 1; }
          const k = t - 4.6; wave.scale.setScalar(1 + k * 10); wave.material.opacity = Math.max(0, 1 - k * 1.2);
          if (Math.random() < 0.6) bigParts.spawn(V(kingPos.x + rand(-0.6, 0.6), 0.2, kingPos.z + rand(-0.6, 0.6)), V(0, rand(0.4, 1), 0), C('#ff6a1a').multiplyScalar(0.35), rand(1, 2));
        }
      },
    };
  },

  // 🌪️ Wirbelsturm
  tornado(ctx) {
    const { scene, king, kingPos, parts, pieces, debris, cam } = ctx;
    const N = 2600;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ang = new Float32Array(N), hh = new Float32Array(N), sp = new Float32Array(N), off = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      ang[i] = Math.random() * 6.28; hh[i] = Math.random() * 7.5; sp[i] = rand(2.5, 5); off[i] = rand(-0.18, 0.18);
      const c = C('#cbb89a').lerp(C('#f2f4ff'), Math.random()).multiplyScalar(rand(0.35, 0.85));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const funnel = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.1, map: parts.mat.map, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    funnel.position.set(kingPos.x, 0.1, kingPos.z); funnel.scale.setScalar(0.001); funnel.frustumCulled = false; scene.add(funnel);
    const R = (h) => 0.22 + h * 0.3;
    const lifted = [...pieces.values()].filter((p) => p.g !== king && p.g.position.distanceTo(kingPos) < 2.7).map((p) => {
      const d = Math.hypot(p.g.position.x - kingPos.x, p.g.position.z - kingPos.z);
      return { g: p.g, o: p.g.position.clone(), d, a0: Math.atan2(p.g.position.z - kingPos.z, p.g.position.x - kingPos.x), delay: 0.2 + d * 0.3 };
    });
    let wind = false, flung = false;
    return {
      total: 8.2,
      update(t, dt) {
        cam.distEnd = 7; cam.heightEnd = 3; cam.orbit = 0.32;
        cam.lookY = Math.min(2.2, ease.inOut(seg(t, 2.2, 4.4)) * 2.2) * (1 - seg(t, 5.2, 6.5) * 0.7);
        const grow = ease.out(seg(t, 1.8, 2.7)) * (1 - ease.in(seg(t, 4.9, 6)));
        funnel.scale.set(Math.max(0.001, grow), Math.max(0.001, grow * (1 + seg(t, 4.9, 6))), Math.max(0.001, grow));
        if (t > 1.8 && !wind) { wind = true; sound.wind(); sound.whoosh(); }
        for (let i = 0; i < N; i++) {
          const r = R(hh[i]) + off[i];
          ang[i] += dt * sp[i] * (1.7 / (r + 0.25));
          hh[i] += dt * (1.4 + hh[i] * 0.2); if (hh[i] > 7.5) hh[i] -= 7.5;
          const wob = Math.sin(hh[i] * 0.7 + t * 2) * 0.05 * hh[i];
          pos[i * 3] = Math.cos(ang[i]) * r + wob; pos[i * 3 + 1] = hh[i]; pos[i * 3 + 2] = Math.sin(ang[i]) * r;
        }
        g.attributes.position.needsUpdate = true;
        if (t > 1.8 && t < 4.9) {
          ctx.shake(0.02 * grow, 0.2);
          for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, r = rand(0.8, 2.6); parts.spawn(V(kingPos.x + Math.cos(a) * r, 0.15, kingPos.z + Math.sin(a) * r), V(-Math.sin(a) * 4 - Math.cos(a) * 2, rand(0.5, 2.5), Math.cos(a) * 4 - Math.sin(a) * 2), C('#bfae92').multiplyScalar(0.5), rand(0.5, 1.1)); }
        }
        if (!flung) {
          const p = seg(t, 2.4, 4.8), h = ease.in(p) * 5.8, a = t * 8, r = R(h) * 0.7;
          if (p > 0) {
            king.position.set(kingPos.x + Math.cos(a) * r, kingPos.y + h, kingPos.z + Math.sin(a) * r);
            king.rotation.y += dt * (6 + p * 20); king.rotation.x = Math.sin(t * 5) * 0.8 * p; king.rotation.z = Math.cos(t * 4) * 0.6 * p;
          }
          for (const q of lifted) {
            const k = seg(t, 2.4 + q.delay, 4.8);
            if (k <= 0) { if (t > 1.9) { q.g.rotation.z = Math.sin(t * 25 + q.d) * 0.06; } continue; }
            const hk = ease.in(k) * (1.5 + q.d * 1.2), ak = q.a0 + (t - 2.4) * 5 * k, rk = THREE.MathUtils.lerp(q.d, R(hk), ease.out(k));
            q.g.position.set(kingPos.x + Math.cos(ak) * rk, q.o.y + hk, kingPos.z + Math.sin(ak) * rk);
            q.g.rotation.x += dt * 4 * k; q.g.rotation.y += dt * 9 * k;
          }
        }
        if (t >= 4.8 && !flung) {
          flung = true; ctx.impact(1.1); sound.boom();
          const fling = (o, upv, sp2) => { const dx = o.position.x - kingPos.x, dz = o.position.z - kingPos.z, d = Math.hypot(dx, dz) || 1; debris.items.push({ m: o, v: V(dx / d * sp2 - dz / d * sp2 * 0.6, upv, dz / d * sp2 + dx / d * sp2 * 0.6), w: V(rand(-8, 8), rand(-8, 8), rand(-8, 8)), r: 0.02 }); };
          for (const q of lifted) if (q.g.position.y > q.o.y + 0.05) fling(q.g, rand(2, 5), rand(4, 8));
          fling(king, 12, 6);
          for (let i = 0; i < 500; i++) { const a = Math.random() * 6.28; parts.spawn(V(kingPos.x, rand(0.5, 5), kingPos.z), V(Math.cos(a) * rand(4, 11), rand(-1, 3), Math.sin(a) * rand(4, 11)), C('#e9dfcc').multiplyScalar(0.8), rand(0.6, 1.6), 1, 1.2); }
        }
      },
    };
  },

  // ⚔️ Samurai-Schnitt
  samurai(ctx) {
    const { scene, king, kingPos, kingMat, parts, bigParts, debris, cam } = ctx;
    const n = V(0.62, 1, 0.3).normalize();
    const p0 = kingPos.clone().add(V(0, 0.62, 0));
    const planeU0 = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0);
    const planeL0 = planeU0.clone().negate();
    const slideDir = V(0, -1, 0).projectOnPlane(n).normalize();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.03, 8, 80, Math.PI * 1.1), new THREE.MeshBasicMaterial({ color: C('#ffffff').multiplyScalar(7), transparent: true, opacity: 0 }));
    arc.position.copy(p0); arc.quaternion.setFromUnitVectors(V(0, 0, 1), n); scene.add(arc);
    const petal = [C('#ffb7d5'), C('#ff8fb8'), C('#ffe3ef')];
    let halves = null, cut = false, fall = false, topple = false, clink = false;
    const mkHalf = (plane0) => {
      const h = king.clone(true); h.visible = true;
      const mat = kingMat.clone(); mat.side = THREE.DoubleSide; mat.clipShadows = true;
      const plane = plane0.clone(); mat.clippingPlanes = [plane];
      h.traverse((o) => { if (o.isMesh) o.material = mat; });
      scene.add(h); h.updateMatrixWorld(true);
      return { h, mat, plane0, plane, inv: h.matrixWorld.clone().invert(), base: h.position.clone() };
    };
    const syncPlane = (hf) => { hf.h.updateMatrixWorld(true); const m = hf.h.matrixWorld.clone().multiply(hf.inv); hf.plane.copy(hf.plane0).applyMatrix4(m); };
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 3.4; cam.heightEnd = 1.45; cam.orbit = 0.035;
        if (t > 1.8) {
          const d = seg(t, 1.8, 2.3);
          ctx.hemi.intensity = 0.9 - d * 0.7; ctx.key.intensity = 2 - d * 1.5; ctx.rim.color.set('#ff2d55'); ctx.rim.intensity = 1.4 + d * 2.5;
          ctx.bg.copy(C('#07080d').lerp(C('#14040a'), d));
          if (Math.random() < 0.7) parts.spawn(V(kingPos.x + rand(-4, 4), rand(3, 5), kingPos.z + rand(-4, 4)), V(rand(-0.6, 0.6), rand(-0.9, -0.4), rand(-0.6, 0.6)), petal[(Math.random() * 3) | 0].clone().multiplyScalar(0.7), rand(3, 5));
        }
        if (t > 2.25 && t < 2.5) {
          const k = seg(t, 2.25, 2.42);
          arc.material.opacity = 1; arc.rotateOnAxis(V(0, 0, 1), dt * 22); arc.scale.setScalar(0.8 + k * 0.4);
        }
        if (t >= 2.42 && !cut) {
          cut = true; sound.slash(); ctx.impact(1.3);
          king.visible = false;
          halves = { u: mkHalf(planeU0), l: mkHalf(planeL0) };
          for (let i = 0; i < 350; i++) { const a = Math.random() * 6.28; parts.spawn(p0, V(Math.cos(a) * rand(1, 4), rand(-0.5, 3), Math.sin(a) * rand(1, 4)), petal[i % 3].clone().multiplyScalar(0.9), rand(1.5, 3), 0.6, 0.8); }
        }
        if (cut) arc.material.opacity = Math.max(0, arc.material.opacity - dt * 4);
        if (halves) {
          const { u, l } = halves;
          if (!fall) {
            const k = ease.inOut(seg(t, 2.5, 3.3));
            u.h.position.copy(u.base).addScaledVector(slideDir, k * 0.16);
            syncPlane(u);
            if (t < 3.4) for (let i = 0; i < 5; i++) { const q = p0.clone().add(V(rand(-0.2, 0.2), 0, rand(-0.2, 0.2)).projectOnPlane(n)); parts.spawn(q, slideDir.clone().multiplyScalar(-rand(0.5, 2)).add(V(rand(-0.4, 0.4), rand(0, 1), rand(-0.4, 0.4))), C(i % 2 ? '#ffb347' : '#fff4d6').multiplyScalar(1.6), rand(0.2, 0.6), 4); }
            u.mat.emissive = C('#ff5a1a'); u.mat.emissiveIntensity = 0.6 * (1 - seg(t, 2.5, 4)); l.mat.emissive = C('#ff5a1a'); l.mat.emissiveIntensity = u.mat.emissiveIntensity;
          }
          if (t >= 3.35 && !fall) {
            fall = true;
            debris.items.push({ m: u.h, v: slideDir.clone().multiplyScalar(2.2).add(V(0, 0.4, 0)), w: V(rand(-3, 3), rand(-2, 2), rand(-5, -3)), r: 0.05 });
          }
          if (fall) { syncPlane(u); if (u.h.position.y < kingPos.y + 0.2 && !u.thud) { u.thud = true; sound.thud(); ctx.impact(0.5, { invert: false, slow: false }); for (let i = 0; i < 120; i++) bigParts.spawn(u.h.position, V(rand(-2, 2), rand(0.2, 1.5), rand(-2, 2)), C('#ff8fb8').multiplyScalar(0.35), rand(0.5, 1.2)); } }
          if (t >= 4.3 && !topple) { topple = true; debris.items.push({ m: l.h, v: V(-slideDir.x * 0.6, 0.6, -slideDir.z * 0.6), w: V(rand(2, 4), 0, rand(-2, 2)), r: 0.05 }); }
          if (topple) syncPlane(l);
        }
        if (t > 5 && !clink) { clink = true; sound.clink(); }
      },
    };
  },

  // 👾 Datenzerfall
  glitch(ctx) {
    const { scene, king, kingPos, kingMat, parts, cam } = ctx;
    const step = 0.075, cubes = [];
    for (let y = 0.04; y < 1.06; y += step) {
      const r = radiusAt(LATHE.k, y);
      for (let x = -r; x <= r; x += step) for (let z = -r; z <= r; z += step) if (x * x + z * z <= r * r && (x * x + z * z > (r - step * 1.4) ** 2 || Math.random() < 0.15)) cubes.push(V(x, y, z));
    }
    for (let y = 1.06; y < 1.32; y += step) { cubes.push(V(0, y, 0)); if (Math.abs(y - 1.2) < step / 2) { cubes.push(V(-step, y, 0)); cubes.push(V(step, y, 0)); } }
    const mat = new THREE.MeshStandardMaterial({ color: '#0b2', emissive: C('#39ff7a'), emissiveIntensity: 1.6, roughness: 0.4 });
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(step * 0.9, step * 0.9, step * 0.9), mat, cubes.length);
    inst.visible = false; inst.frustumCulled = false; scene.add(inst);
    const vox = cubes.map((p) => ({ p: p.clone().add(kingPos), delay: p.y * 1.1 + rand(0, 0.25), vy: rand(1.5, 3.5), vx: rand(-0.6, 0.6), vz: rand(-0.6, 0.6), spin: rand(-8, 8), done: false }));
    const dummy = new THREE.Object3D();
    const green = C('#39ff7a');
    let s1 = false, s2 = false, broke = false, burst2 = false;
    const baseColor = kingMat.color.clone();
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 4.2; cam.heightEnd = 2; cam.orbit = 0.08;
        cam.lookY = seg(t, 3.2, 5) * 1.2;
        if (t > 1.8) for (let i = 0; i < 9; i++) parts.spawn(V(kingPos.x + Math.round(rand(-4, 4) / 0.3) * 0.3, rand(5, 8), kingPos.z + Math.round(rand(-4, 4) / 0.3) * 0.3), V(0, -rand(5, 9), 0), green.clone().multiplyScalar(rand(0.4, 1.2)), rand(0.8, 1.4));
        if (t > 1.9 && !s1) { s1 = true; sound.glitch(); }
        if (t > 2.6 && !s2) { s2 = true; sound.glitch(); }
        if (t > 1.8 && t < 3.05) {
          // Glitch-Zustände wechseln nur alle ~0,15 s statt jedes Bild (weniger Flackern)
          const slot = Math.floor(t / 0.15);
          if (slot !== this.slot) { this.slot = slot; this.spike = Math.random() < 0.3; this.wire = Math.random() < 0.3; this.off = rand(-0.06, 0.06); }
          const spike = this.spike;
          ctx.base.glitch = 0.05 + (spike ? 0.15 : 0) + seg(t, 2.4, 3.05) * 0.12;
          kingMat.emissive = kingMat.emissive || C('#000'); kingMat.emissive.copy(green); kingMat.emissiveIntensity = spike ? 1.2 : 0.35;
          kingMat.wireframe = this.wire;
          kingMat.color.copy(spike ? green : baseColor);
          king.position.set(kingPos.x + (spike ? this.off : 0), kingPos.y, kingPos.z);
        }
        if (t >= 3.05 && !broke) {
          broke = true; king.visible = false; inst.visible = true; ctx.impact(1.1); sound.glitch(); sound.boom();
        }
        if (broke) {
          ctx.base.glitch = Math.max(0, 0.4 * (1 - seg(t, 3.05, 5.0)));
          if (t > 4.3 && !burst2) { burst2 = true; ctx.impact(0.7, { slow: false }); sound.glitch(); }
          const k0 = t - 3.05;
          vox.forEach((v, i) => {
            const q = k0 - v.delay * 0.6;
            let sc = 1, px = v.p.x, py = v.p.y, pz = v.p.z, rot = 0;
            if (q > 0) {
              px += v.vx * q + (Math.random() < 0.05 ? rand(-0.05, 0.05) : 0); py += v.vy * q * q * 0.8 + q * 0.4; pz += v.vz * q;
              sc = Math.max(0, 1 - q * 0.75); rot = v.spin * q;
              if (sc === 0 && !v.done) { v.done = true; parts.spawn(V(px, py, pz), V(0, 1, 0), green.clone().multiplyScalar(1.6), 0.35); }
            }
            dummy.position.set(px, py, pz); dummy.rotation.set(rot, rot * 0.7, 0); dummy.scale.setScalar(Math.max(0.0001, sc));
            dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
          });
          inst.instanceMatrix.needsUpdate = true;
          mat.emissiveIntensity = 1.6 + Math.sin(t * 40) * 0.6;
        }
      },
    };
  },
});

// ------------------------------------------------------------ Neue Finisher (v1.5)
// Blitz aus kleinen Zylindern (leuchtet durch Bloom)
function makeBoltMesh(scene, from, to, mat, segs = 12, w = 0.04) {
  const g = new THREE.Group();
  let prev = from.clone();
  for (let i = 1; i <= segs; i++) {
    const p = from.clone().lerp(to, i / segs);
    if (i < segs) { p.x += rand(-0.35, 0.35); p.z += rand(-0.35, 0.35); p.y += rand(-0.15, 0.15); }
    const len = prev.distanceTo(p);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(w, w, len, 5), mat);
    c.position.copy(prev).lerp(p, 0.5);
    c.quaternion.setFromUnitVectors(V(0, 1, 0), p.clone().sub(prev).normalize());
    g.add(c); prev = p;
  }
  scene.add(g);
  return g;
}

Object.assign(EFFECTS, {
  // 💣 Kanonenschuss: Kanone rollt heran, feuert, der König fliegt in hohem Bogen vom Brett
  kanone(ctx) {
    const { scene, king, kingPos, parts, bigParts, debris, cam } = ctx;
    const side = kingPos.x > 0 ? -1 : 1;
    const base = V(kingPos.x + side * 6.2, 0.1, kingPos.z + 1.2);
    const aim = kingPos.clone().sub(base).setY(0).normalize();
    const metal = new THREE.MeshStandardMaterial({ color: '#2b2d33', metalness: 0.85, roughness: 0.35 });
    const wood = new THREE.MeshStandardMaterial({ color: '#5a3517', roughness: 0.8 });
    const cannon = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.5, 24), metal);
    barrel.rotation.z = -Math.PI / 2 + 0.28; barrel.position.set(0.2, 0.62, 0); barrel.castShadow = true;
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 0.6), wood); carriage.position.y = 0.32; carriage.castShadow = true;
    cannon.add(barrel, carriage);
    for (const z of [-0.36, 0.36]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 10, 24), wood); wh.position.set(-0.1, 0.27, z); cannon.add(wh); }
    cannon.position.copy(base).addScaledVector(aim, -4);
    cannon.rotation.y = Math.atan2(-aim.z, aim.x);
    scene.add(cannon);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), metal); ball.castShadow = true; ball.visible = false; scene.add(ball);
    const muzzle = () => cannon.localToWorld(V(0.95, 0.85, 0));
    let fired = false, hit = false, roll = false;
    const smoke = (pos, n, sp) => { for (let i = 0; i < n; i++) bigParts.spawn(pos, V(rand(-sp, sp), rand(0.2, sp), rand(-sp, sp)), C('#8c8c8c').multiplyScalar(0.25), rand(0.8, 1.6), -0.3, 1.2); };
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 6.2; cam.heightEnd = 2.6; cam.orbit = 0.05;
        // Heranrollen
        const r = ease.out(seg(t, 1.7, 2.5));
        cannon.position.copy(base).addScaledVector(aim, -4 * (1 - r));
        cannon.children.slice(2).forEach((w) => { w.rotation.z -= dt * 6 * (1 - r); });
        if (t > 2.5 && !roll) { roll = true; sound.thud(); }
        if (t >= 2.7 && !fired) {
          fired = true; sound.boom(); ctx.impact(0.5, { slow: false });
          const m = muzzle();
          ctx.fxLight.position.copy(m); ctx.fxLight.color.set('#ffb347'); ctx.fxLight.intensity = 90;
          for (let i = 0; i < 120; i++) parts.spawn(m, aim.clone().multiplyScalar(rand(2, 7)).add(V(rand(-1, 1), rand(-0.3, 1.2), rand(-1, 1))), C(i % 3 ? '#ffb347' : '#fff2c4').multiplyScalar(1.5), rand(0.2, 0.6), 2, 2);
          smoke(m, 40, 1.2);
          ball.visible = true;
        }
        if (fired) {
          // Rückstoß
          const k = seg(t, 2.7, 3.2);
          cannon.position.copy(base).addScaledVector(aim, -0.5 * Math.sin(Math.min(1, k * 2) * Math.PI) * (1 - k));
          ctx.fxLight.intensity *= 0.88;
        }
        if (fired && !hit) {
          const k = seg(t, 2.7, 3.15);
          const from = muzzle(), to = kingPos.clone().setY(0.75);
          ball.position.lerpVectors(from, to, k); ball.position.y += Math.sin(k * Math.PI) * 0.9;
          for (let i = 0; i < 3; i++) bigParts.spawn(ball.position, V(rand(-0.2, 0.2), rand(0, 0.4), rand(-0.2, 0.2)), C('#9a9a9a').multiplyScalar(0.2), rand(0.5, 1));
          if (k >= 1) {
            hit = true; sound.boom(); sound.thud(); ctx.impact(1.3);
            debris.items.push({ m: king, v: aim.clone().multiplyScalar(7.5).add(V(0, 6.5, 0)), w: V(rand(-6, 6), rand(-4, 4), rand(-12, -8)), r: 0.05 });
            debris.items.push({ m: ball, v: aim.clone().multiplyScalar(2.5).add(V(0, 1.5, 0)), w: V(0, 0, -5), r: 0.15 });
            debris.burst(kingPos, new THREE.MeshStandardMaterial({ color: '#c99a5b', roughness: 0.9 }), 26, { speed: 4, up: 4, size: [0.03, 0.1] });
            for (let i = 0; i < 260; i++) parts.spawn(V(kingPos.x, 0.7, kingPos.z), V(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 7)).addScaledVector(aim, 2), C(i % 2 ? '#ffb347' : '#ffffff').multiplyScalar(1.4), rand(0.3, 1), 5, 1);
            smoke(V(kingPos.x, 0.6, kingPos.z), 50, 1.5);
          }
        }
        // Kamera folgt dem fliegenden König
        if (hit) cam.look.lerp(V(king.position.x, Math.max(0.6, king.position.y), king.position.z), 1 - Math.exp(-dt * 3));
        if (hit && king.position.y > 0.4) bigParts.spawn(king.position, V(0, 0.2, 0), C('#9a9a9a').multiplyScalar(0.18), 0.8);
      },
    };
  },

  // 🌋 Erdbeben: das Brett reißt entlang der Königsreihe auf, Magma glüht, der König stürzt hinein
  erdbeben(ctx) {
    const { scene, king, kingPos, parts, bigParts, squares, pieces, frameParts, cam } = ctx;
    const kz = kingPos.z;
    const lavaMat = new THREE.MeshBasicMaterial({ color: C('#ff5a1a').multiplyScalar(1.6), transparent: true, opacity: 0 });
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), lavaMat);
    lava.rotation.x = -Math.PI / 2; lava.position.set(0, -0.2, kz); scene.add(lava);
    const glow = new THREE.PointLight('#ff5a1a', 0, 9, 1.5); glow.position.set(kingPos.x, -0.1, kz); scene.add(glow);
    const groupOf = (z) => (Math.abs(z - kz) < 0.1 ? 'row' : z < kz ? 'n' : 's');
    const sq = squares.map((m) => ({ m, g: groupOf(m.position.z), o: m.position.clone(), rx: rand(-1, 1), rz: rand(-1, 1), delay: rand(0, 0.5) }));
    const pcs = [...pieces.values()].map((p) => ({ p, g: groupOf(p.g.position.z), o: p.g.position.clone(), delay: rand(0.1, 0.6) }));
    const fparts = Object.entries(frameParts).map(([k, m]) => ({ m, g: k.startsWith('n') ? 'n' : k.startsWith('s') ? 's' : null, o: m.position.clone() }));
    let cracked = false, erupt = false, rum = 0;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 6; cam.heightEnd = 3.4; cam.orbit = 0.05;
        // Grollen
        if (t > 1.8 && t < 5.4) {
          ctx.shake(0.05 + seg(t, 1.8, 2.7) * 0.06, 0.25);
          if (t - rum > 0.45) { rum = t; sound.thud(); }
          if (Math.random() < 0.5) bigParts.spawn(V(rand(-4, 4), 0.15, rand(-4, 4)), V(0, rand(0.2, 0.6), 0), C('#a08a70').multiplyScalar(0.2), rand(0.8, 1.4));
        }
        if (t > 1.8 && t < 2.7) for (const s of sq) s.m.position.y = s.o.y + Math.sin(t * 40 + s.o.x * 3 + s.o.z * 2) * 0.012;
        if (t >= 2.7 && !cracked) { cracked = true; ctx.impact(1.1); sound.boom(); }
        if (cracked) {
          const gap = ease.out(seg(t, 2.7, 3.5)) * 1.05;
          lavaMat.opacity = Math.min(1, lavaMat.opacity + dt * 2);
          glow.intensity = 25 + Math.sin(t * 9) * 6;
          for (const s of sq) {
            if (s.g === 'n') s.m.position.set(s.o.x, s.o.y, s.o.z - gap);
            else if (s.g === 's') s.m.position.set(s.o.x, s.o.y, s.o.z + gap);
            else {
              const k = Math.max(0, t - 2.85 - s.delay);
              s.m.position.set(s.o.x, s.o.y - 4.9 * k * k, s.o.z);
              s.m.rotation.x = s.rx * k * 2; s.m.rotation.z = s.rz * k * 2;
            }
          }
          for (const f of fparts) { if (f.g === 'n') f.m.position.z = f.o.z - gap; if (f.g === 's') f.m.position.z = f.o.z + gap; }
          for (const q of pcs) {
            if (q.p.g === king) continue;
            if (q.g === 'n') q.p.g.position.z = q.o.z - gap;
            else if (q.g === 's') q.p.g.position.z = q.o.z + gap;
            else { const k = Math.max(0, t - 3 - q.delay); q.p.g.position.y = q.o.y - 4.9 * k * k; q.p.g.rotation.z += dt * 2 * Math.min(1, k * 3); }
          }
          // König kippt und stürzt in die Spalte
          const k = Math.max(0, t - 3.15);
          king.rotation.x = Math.min(1.4, k * 2.2); king.rotation.z = Math.sin(k * 4) * 0.4 * Math.min(1, k);
          king.position.y = kingPos.y - 4.9 * k * k * 0.8;
          if (Math.random() < 0.9) for (let i = 0; i < 4; i++) parts.spawn(V(rand(-4.3, 4.3), -0.15, kz + rand(-0.4, 0.4)), V(rand(-0.3, 0.3), rand(1, 3.5), rand(-0.3, 0.3)), C(i % 2 ? '#ff7a1a' : '#ffd27a').multiplyScalar(1.4), rand(0.5, 1.4), 1);
        }
        if (t >= 4.3 && !erupt) {
          erupt = true; ctx.impact(0.8, { slow: false }); sound.boom();
          for (let i = 0; i < 500; i++) parts.spawn(V(kingPos.x + rand(-0.4, 0.4), -0.1, kz), V(rand(-1.5, 1.5), rand(4, 10), rand(-1.5, 1.5)), C(i % 3 ? '#ff5a1a' : '#ffe08a').multiplyScalar(1.6), rand(1, 2.2), 6);
          for (let i = 0; i < 40; i++) bigParts.spawn(V(kingPos.x, 0.2, kz), V(rand(-1, 1), rand(2, 5), rand(-1, 1)), C('#ff5a1a').multiplyScalar(0.5), rand(0.6, 1.2), 3);
        }
        if (erupt) cam.lookY = Math.min(1.4, cam.lookY + dt * 1.2);
      },
    };
  },

  // 🔨 Donnerhammer: Blitzhammer kracht vom Himmel und macht den König platt, Schockwelle durchs Brett
  hammer(ctx) {
    const { scene, king, kingPos, parts, bigParts, squares, pieces, cam } = ctx;
    const steel = new THREE.MeshStandardMaterial({ color: '#b9c2cc', metalness: 1, roughness: 0.22, emissive: C('#3ab4ff'), emissiveIntensity: 0.15 });
    const leather = new THREE.MeshStandardMaterial({ color: '#4a2a14', roughness: 0.85 });
    const hammer = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.85), steel); head.castShadow = true;
    const rune = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.12, 0.87), new THREE.MeshBasicMaterial({ color: C('#7fd4ff').multiplyScalar(3) }));
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.9, 16), leather); handle.position.y = 1.35; handle.castShadow = true;
    hammer.add(head, rune, handle);
    hammer.position.set(kingPos.x, 13, kingPos.z); hammer.rotation.z = 0.6; scene.add(hammer);
    const boltMat = new THREE.MeshBasicMaterial({ color: C('#cfeeff').multiplyScalar(2.2) });
    let arcs = [], slammed = false, bolts = null, boltT = 0, t0 = 0;
    const sq = squares.map((m) => ({ m, o: m.position.clone(), d: Math.hypot(m.position.x - kingPos.x, m.position.z - kingPos.z) }));
    const near = [...pieces.values()].filter((p) => p.g !== king).map((p) => ({ p, o: p.g.position.clone(), d: Math.hypot(p.g.position.x - kingPos.x, p.g.position.z - kingPos.z), tilt: rand(-0.5, 0.5) }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 72), new THREE.MeshBasicMaterial({ color: C('#9fe3ff').multiplyScalar(3), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(kingPos.x, 0.14, kingPos.z); scene.add(ring);
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 6; cam.heightEnd = 2.8; cam.orbit = 0.05;
        const d = seg(t, 1.8, 2.4);
        ctx.hemi.intensity = 0.55 - d * 0.35; ctx.bg.copy(C('#07080d').lerp(C('#03040a'), d));
        // Abstieg mit knisternden Blitzen
        if (!slammed) {
          const slow = ease.inOut(seg(t, 1.8, 2.9)), fast = ease.in(seg(t, 2.9, 3.05));
          const yTop = 13 - slow * 8.5;
          hammer.position.y = THREE.MathUtils.lerp(yTop, kingPos.y + 1.0 + 0.42, fast);
          hammer.rotation.z = 0.6 * (1 - slow) + Math.sin(t * 3) * 0.05 * (1 - fast);
          cam.lookY = Math.max(0, (hammer.position.y - 2) * 0.25);
          arcs.forEach((a) => scene.remove(a)); arcs = [];
          if (t > 1.9 && Math.random() < 0.6) arcs.push(makeBoltMesh(scene, hammer.position.clone().add(V(rand(-0.7, 0.7), rand(-0.4, 0.4), rand(-0.4, 0.4))), hammer.position.clone().add(V(rand(-1.4, 1.4), rand(-1.2, 1.2), rand(-1.2, 1.2))), boltMat, 5, 0.018));
          if (t > 2.9 && fast >= 1) {
            slammed = true; t0 = t; sound.zap(); sound.boom(); sound.thud(); ctx.impact(1.6);
            arcs.forEach((a) => scene.remove(a)); arcs = [];
            king.scale.set(1.7, 0.09, 1.7);
            bolts = [0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return makeBoltMesh(scene, V(kingPos.x, 1.4, kingPos.z), V(kingPos.x + Math.cos(a) * 3.5, 0.15, kingPos.z + Math.sin(a) * 3.5), boltMat, 10, 0.04); });
            boltT = 0.35;
            ctx.fxLight.position.set(kingPos.x, 1.5, kingPos.z); ctx.fxLight.color.set('#9fd4ff'); ctx.fxLight.intensity = 70;
            for (let i = 0; i < 500; i++) { const a = Math.random() * 6.28; parts.spawn(V(kingPos.x, 0.2, kingPos.z), V(Math.cos(a) * rand(3, 10), rand(0.5, 4), Math.sin(a) * rand(3, 10)), C(i % 2 ? '#bfe6ff' : '#ffffff').multiplyScalar(1.5), rand(0.3, 1), 5, 1); }
            for (let i = 0; i < 50; i++) bigParts.spawn(V(kingPos.x, 0.3, kingPos.z), V(rand(-3, 3), rand(0.2, 1.5), rand(-3, 3)), C('#9a9a9a').multiplyScalar(0.25), rand(0.8, 1.6));
            ring.material.opacity = 1;
          }
        } else {
          const k = t - t0;
          // Schockwelle läuft durchs Brett
          for (const s of sq) { const w = k * 9 - s.d; s.m.position.y = s.o.y + (w > 0 && w < 3.2 ? Math.sin(w * 2) * 0.22 * Math.exp(-k * 1.4) : 0); }
          for (const n of near) { const w = k * 9 - n.d; const lift = w > 0 && w < 3.2 ? Math.sin(w * 2) * 0.35 * Math.exp(-k * 1.4) : 0; n.p.g.position.y = n.o.y + Math.max(0, lift); n.p.g.rotation.z = n.tilt * Math.max(0, lift); }
          ring.scale.setScalar(1 + k * 9); ring.material.opacity = Math.max(0, 1 - k * 1.1);
          if (bolts) { boltT -= dt; bolts.forEach((b) => { b.visible = Math.random() > 0.3; }); if (boltT <= 0) { bolts.forEach((b) => scene.remove(b)); bolts = null; } }
          ctx.fxLight.intensity *= 0.92;
          king.scale.y = 0.09 + Math.max(0, Math.sin(k * 14) * 0.03 * Math.exp(-k * 5));
          // Hammer hebt wieder ab und fliegt davon
          const up = ease.in(seg(t, t0 + 0.9, t0 + 2.2));
          hammer.position.y = kingPos.y + 1.42 + up * 16; hammer.rotation.y += dt * 8 * up;
          if (Math.random() < 0.5) parts.spawn(V(kingPos.x + rand(-0.6, 0.6), 0.15, kingPos.z + rand(-0.6, 0.6)), V(0, rand(0.5, 1.5), 0), C('#9fe3ff').multiplyScalar(1.3), rand(0.3, 0.7));
        }
      },
    };
  },
});

// ------------------------------------------------------------ 12 neue Finisher (v1.6)
const towards = (from, to) => { const d = to.clone().sub(from).setY(0); return d.lengthSq() ? d.normalize() : V(0, 0, -1); };
const yawTo = (dir) => Math.atan2(dir.x, dir.z);

Object.assign(EFFECTS, {
  // 🔫 Kugelhagel: Matt-Figur zieht ein Sturmgewehr und ballert den König weg
  ak(ctx) {
    const { scene, king, kingPos, kingMat, parts, bigParts, debris, attacker, cam } = ctx;
    const A = attacker?.g; const a0 = A ? A.position.clone() : kingPos.clone().add(V(2, 0, 2));
    const dir = towards(a0, kingPos), side = V(dir.z, 0, -dir.x);
    const gunMetal = new THREE.MeshStandardMaterial({ color: '#1d1f22', metalness: 0.8, roughness: 0.35 });
    const woodM = new THREE.MeshStandardMaterial({ color: '#7a4a22', roughness: 0.7 });
    const gun = new THREE.Group();
    const part = (geo, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; gun.add(m); return m; };
    part(new THREE.BoxGeometry(0.55, 0.11, 0.08), gunMetal, 0, 0, 0);
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 10), gunMetal, 0.46, 0.02, 0, Math.PI / 2);
    part(new THREE.BoxGeometry(0.08, 0.22, 0.06), gunMetal, 0.08, -0.14, 0, -0.25);
    part(new THREE.BoxGeometry(0.26, 0.1, 0.065), woodM, -0.36, -0.03, 0, 0.12);
    part(new THREE.BoxGeometry(0.2, 0.06, 0.07), woodM, 0.3, -0.05, 0);
    gun.scale.setScalar(0.001); scene.add(gun);
    const muzzleLocal = V(0.68, 0.02, 0);
    let nextShot = 2.55, shots = 0, dead = false;
    const tracerMat = new THREE.MeshBasicMaterial({ color: C('#ffd27a').multiplyScalar(4) });
    const tracers = [];
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 4.6; cam.heightEnd = 2; cam.orbit = 0.04;
        cam.look.lerp(a0.clone().lerp(kingPos, 0.5).setY(0.7), 1 - Math.exp(-dt * 2));
        if (A) {
          const hop = seg(t, 1.8, 2.3);
          A.position.y = a0.y + Math.sin(hop * Math.PI) * 0.5;
          A.rotation.y = yawTo(dir) * Math.min(1, hop * 2);
        }
        const gs = ease.out(seg(t, 2.1, 2.45));
        const recoil = t > 2.55 && !dead ? Math.sin(t * 90) * 0.03 : 0;
        gun.scale.setScalar(Math.max(0.001, gs));
        gun.position.copy(a0).addScaledVector(side, 0.28).addScaledVector(dir, 0.1 - recoil).setY(a0.y + 0.72 + (A ? A.position.y - a0.y : 0));
        gun.rotation.set(0, Math.atan2(-dir.z, dir.x), 0);
        if (t > 2.5 && t < 2.6) sound.clink();
        // Dauerfeuer
        while (!dead && t >= nextShot && t < 4.4) {
          nextShot += 0.075; shots++;
          gun.updateMatrixWorld(true);
          const m = gun.localToWorld(muzzleLocal.clone());
          const hit = kingPos.clone().add(V(rand(-0.15, 0.15), rand(0.3, 1.1), rand(-0.15, 0.15)));
          const len = m.distanceTo(hit);
          const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 4), tracerMat);
          tr.position.copy(m).lerp(hit, 0.5); tr.quaternion.setFromUnitVectors(V(0, 1, 0), hit.clone().sub(m).normalize());
          scene.add(tr); tracers.push({ m: tr, life: 0.05 });
          bigParts.spawn(m, V(0, 0, 0), C('#ffcf5a').multiplyScalar(1.4), 0.06);
          for (let i = 0; i < 8; i++) parts.spawn(hit, V(rand(-1, 1), rand(0, 1.5), rand(-1, 1)).addScaledVector(dir, 2).multiplyScalar(rand(1, 3)), C(i % 2 ? '#ffd27a' : '#ffffff').multiplyScalar(1.5), rand(0.15, 0.4), 6);
          parts.spawn(gun.localToWorld(V(0.05, 0.05, 0)), side.clone().multiplyScalar(rand(1, 2)).add(V(0, rand(1.5, 2.5), 0)), C('#d4a84a').multiplyScalar(0.9), 0.8, 9);
          ctx.fxLight.position.copy(m); ctx.fxLight.color.set('#ffb347'); ctx.fxLight.intensity = 25;
          if (shots % 2) sound.shot();
          king.position.set(kingPos.x + dir.x * 0.04 * Math.random(), kingPos.y, kingPos.z + dir.z * 0.04 * Math.random());
          king.rotation.x = Math.sin(t * 60) * 0.05;
          kingMat.emissive = kingMat.emissive || C('#000'); kingMat.emissive.set('#ff8a3a'); kingMat.emissiveIntensity = 0.2 + seg(t, 2.6, 4.3) * 0.6;
          ctx.shake(0.03, 0.12);
        }
        ctx.fxLight.intensity *= 0.7;
        for (const tr of tracers) { tr.life -= dt; if (tr.life <= 0 && tr.m.parent) scene.remove(tr.m); }
        if (t >= 4.4 && !dead) {
          dead = true; king.visible = false; sound.boom(); ctx.impact(1.3);
          debris.burst(kingPos, kingMat, 55, { speed: 3, up: 4, size: [0.05, 0.15] });
          for (const it of debris.items.slice(-55)) it.v.addScaledVector(dir, 7);
          for (let i = 0; i < 300; i++) parts.spawn(V(kingPos.x, 0.6, kingPos.z), V(rand(-1, 1), rand(0, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(2, 7)).addScaledVector(dir, 4), C(i % 3 ? '#ffb347' : '#ffffff').multiplyScalar(1.4), rand(0.4, 1.2), 5, 1);
        }
        if (dead) gun.rotation.x += dt * 10 * Math.max(0, 1 - (t - 4.4)); // Waffe lässig drehen
      },
    };
  },

  // ✨ Midas-Touch: Matt-Figur berührt den König, er wird zu Gold
  midas(ctx) {
    const { scene, king, kingPos, kingMat, parts, debris, attacker, cam } = ctx;
    const A = attacker?.g; const a0 = A ? A.position.clone() : kingPos.clone().add(V(1.5, 0, 1.5));
    const dir = towards(a0, kingPos);
    const target = kingPos.clone().addScaledVector(dir, -0.72).setY(a0.y);
    const gold = C('#ffc53d'), c0 = kingMat.color.clone();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 10, 48), new THREE.MeshBasicMaterial({ color: C('#ffe08a').multiplyScalar(3), transparent: true, opacity: 0 }));
    ring.rotation.x = Math.PI / 2; ring.position.copy(kingPos); scene.add(ring);
    const coinMat = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 1, roughness: 0.25, emissive: C('#7a5200'), emissiveIntensity: 0.3 });
    let touched = false, shine = false, rain = false;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 3.6; cam.heightEnd = 1.7; cam.orbit = 0.12;
        if (A) {
          const k = ease.inOut(seg(t, 1.8, 2.6));
          A.position.lerpVectors(a0, target, k); A.position.y = a0.y + Math.sin(k * Math.PI) * 0.35;
          A.rotation.y = yawTo(dir) * k;
          A.rotation.x = t > 2.6 && t < 3 ? Math.sin(seg(t, 2.6, 3) * Math.PI) * 0.35 : 0; // „Antippen“
        }
        if (t >= 2.75 && !touched) { touched = true; sound.clink(); ctx.impact(0.5, { slow: false }); }
        if (touched) {
          const p = ease.inOut(seg(t, 2.8, 4.1));
          kingMat.color.copy(c0).lerp(gold, p);
          kingMat.metalness = THREE.MathUtils.lerp(0.1, 1, p); kingMat.roughness = THREE.MathUtils.lerp(0.4, 0.18, p);
          kingMat.emissive = kingMat.emissive || C('#000'); kingMat.emissive.set('#8a5a00'); kingMat.emissiveIntensity = p * 0.35;
          ring.position.y = kingPos.y + 0.05 + p * 1.25; ring.material.opacity = p < 1 ? 1 : Math.max(0, ring.material.opacity - dt * 2);
          ring.scale.setScalar(1 - p * 0.45);
          if (p < 1) for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28; parts.spawn(V(kingPos.x + Math.cos(a) * 0.3, ring.position.y, kingPos.z + Math.sin(a) * 0.3), V(Math.cos(a) * 0.6, rand(0.2, 0.8), Math.sin(a) * 0.6), C('#ffe08a').multiplyScalar(1.6), rand(0.4, 0.8)); }
        }
        if (t >= 4.15 && !shine) {
          shine = true; sound.win(); ctx.flash(0.5, '#ffe9a8');
          ctx.fxLight.position.set(kingPos.x, 1.5, kingPos.z); ctx.fxLight.color.set('#ffd27a'); ctx.fxLight.intensity = 50;
          for (let i = 0; i < 200; i++) parts.spawn(V(kingPos.x, rand(0.2, 1.3), kingPos.z), V(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1, 3)), C('#fff1b8').multiplyScalar(1.8), rand(0.5, 1.4), 0.5, 1);
        }
        if (t >= 4.5 && !rain) {
          rain = true;
          for (let i = 0; i < 45; i++) {
            const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 20), coinMat); c.castShadow = true;
            c.position.set(kingPos.x + rand(-1.5, 1.5), rand(3, 7), kingPos.z + rand(-1.5, 1.5)); scene.add(c);
            debris.items.push({ m: c, v: V(0, rand(-1, 0), 0), w: V(rand(-8, 8), rand(-8, 8), rand(-8, 8)), r: 0.01 });
          }
        }
        ctx.fxLight.intensity *= 0.97;
        if (t > 4.2) king.rotation.y += dt * 0.6;
      },
    };
  },

  // 🔥 Feuersturm: Flammen vom Himmel, König schmilzt
  feuersturm(ctx) {
    const { scene, king, kingPos, kingMat, parts, bigParts, cam } = ctx;
    const src = kingPos.clone().add(V(-4.5, 6, -3.5));
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.6, 40), new THREE.MeshBasicMaterial({ color: C('#ff5a1a').multiplyScalar(1.5), transparent: true, opacity: 0 }));
    puddle.rotation.x = -Math.PI / 2; puddle.position.set(kingPos.x, 0.106, kingPos.z); scene.add(puddle);
    let roar = false, melt = false;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 4.4; cam.heightEnd = 2.1;
        const d = seg(t, 1.8, 2.3); ctx.bg.copy(C('#07080d').lerp(C('#2a0802'), d));
        if (t > 2.2 && !roar) { roar = true; sound.whoosh(); sound.wind(); ctx.impact(0.5, { slow: false }); }
        if (t > 2.2 && t < 4.3) {
          const toK = kingPos.clone().setY(0.6).sub(src).normalize();
          for (let i = 0; i < 34; i++) parts.spawn(src.clone().add(V(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3))), toK.clone().multiplyScalar(rand(7, 10)).add(V(rand(-1, 1), rand(-1, 1), rand(-1, 1))), C(['#fff1b8', '#ffb347', '#ff5a1a', '#c2240c'][i % 4]).multiplyScalar(1.6), rand(0.6, 1.1), -1, 0.4);
          for (let i = 0; i < 3; i++) bigParts.spawn(src.clone().lerp(kingPos, rand(0.3, 1)), V(rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5)), C('#ff6a1a').multiplyScalar(0.35), rand(0.4, 0.8));
          kingMat.emissive = kingMat.emissive || C('#000'); kingMat.emissive.set('#ff4a00'); kingMat.emissiveIntensity = seg(t, 2.3, 3.4) * 1.2;
          ctx.fxLight.position.set(kingPos.x, 1, kingPos.z); ctx.fxLight.color.set('#ff7a1a'); ctx.fxLight.intensity = 40 + Math.sin(t * 30) * 10;
          ctx.shake(0.025, 0.15);
        }
        if (t > 3.4) {
          if (!melt) { melt = true; sound.boom(); }
          const m = ease.in(seg(t, 3.4, 4.8));
          king.scale.set(1 + m * 0.8, Math.max(0.04, 1 - m), 1 + m * 0.8);
          kingMat.color.lerp(C('#1a0a04'), dt * 0.8);
          puddle.material.opacity = m; puddle.scale.setScalar(0.4 + m * 1.4);
          if (Math.random() < 0.8) parts.spawn(V(kingPos.x + rand(-0.6, 0.6), 0.15, kingPos.z + rand(-0.6, 0.6)), V(0, rand(0.5, 2), 0), C('#ff7a1a').multiplyScalar(1.2), rand(0.6, 1.4));
        }
        ctx.fxLight.intensity *= 0.98;
      },
    };
  },

  // 🚀 Raketenschlag: Rakete, Feuerball, Druckwelle wirft alles um
  rakete(ctx) {
    const { scene, king, kingPos, kingMat, parts, bigParts, debris, pieces, cam } = ctx;
    const rocket = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 16), new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 0.6, roughness: 0.3 }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.35, 16), new THREE.MeshStandardMaterial({ color: '#c0262d', roughness: 0.4 })); tip.position.y = 0.72;
    rocket.add(body, tip);
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.22), tip.material); f.position.y = -0.45; f.rotation.y = (i * Math.PI) / 2; f.position.x = Math.cos(i * Math.PI / 2) * 0.12; f.position.z = Math.sin(i * Math.PI / 2) * 0.12; rocket.add(f); }
    scene.add(rocket);
    const start = kingPos.clone().add(V(-11, 9, -9)), end = kingPos.clone().setY(0.5);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: C('#ffb347').multiplyScalar(2.5), transparent: true }));
    ball.position.copy(end); ball.scale.setScalar(0.001); scene.add(ball);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 72), new THREE.MeshBasicMaterial({ color: C('#ffd27a').multiplyScalar(2), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(kingPos.x, 0.15, kingPos.z); ring.visible = false; scene.add(ring);
    let launched = false, boom = false, tb = 0;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = boom ? 9 : 6; cam.heightEnd = boom ? 4 : 2.6; cam.orbit = 0.04;
        if (t > 1.8 && !launched) { launched = true; sound.whoosh(); }
        if (!boom) {
          const k = ease.in(seg(t, 1.8, 3.0));
          const pos = start.clone().lerp(end, k); pos.y += Math.sin(k * Math.PI) * 2;
          const next = start.clone().lerp(end, Math.min(1, k + 0.02)); next.y += Math.sin(Math.min(1, k + 0.02) * Math.PI) * 2;
          rocket.position.copy(pos); rocket.quaternion.setFromUnitVectors(V(0, 1, 0), next.clone().sub(pos).normalize());
          for (let i = 0; i < 6; i++) parts.spawn(pos, V(rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4)), C(i % 2 ? '#ffb347' : '#fff1c4').multiplyScalar(1.4), rand(0.15, 0.35));
          bigParts.spawn(pos, V(rand(-0.2, 0.2), rand(0, 0.3), rand(-0.2, 0.2)), C('#8a8a8a').multiplyScalar(0.22), rand(1, 1.8));
          if (k >= 1) {
            boom = true; tb = t; rocket.visible = false; king.visible = false; ring.visible = true;
            sound.boom(); sound.boom(); ctx.impact(1.7);
            ctx.fxLight.position.set(kingPos.x, 1.5, kingPos.z); ctx.fxLight.color.set('#ff9a3a'); ctx.fxLight.intensity = 120;
            debris.burst(kingPos, kingMat, 40, { speed: 7, up: 8 });
            for (const pc of pieces.values()) {
              if (pc.g === king) continue;
              const off = pc.g.position.clone().sub(kingPos).setY(0); const dd = off.length();
              if (dd < 3.2) debris.items.push({ m: pc.g, v: off.normalize().multiplyScalar((3.4 - dd) * 3).add(V(0, (3.4 - dd) * 2.4, 0)), w: V(rand(-6, 6), rand(-6, 6), rand(-6, 6)), r: 0.02 });
            }
            for (let i = 0; i < 1200; i++) parts.spawn(end, V(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 12)), C(['#ffffff', '#ffd27a', '#ff8a2a', '#c2240c'][i % 4]).multiplyScalar(1.5), rand(0.5, 1.8), 4, 1.2);
          }
        } else {
          const k = t - tb;
          ball.scale.setScalar(Math.min(2.4, 0.3 + k * 6)); ball.material.opacity = Math.max(0, 1 - k * 1.2);
          ring.scale.setScalar(1 + k * 12); ring.material.opacity = Math.max(0, 1 - k * 0.9);
          if (k < 2.5) for (let i = 0; i < 4; i++) bigParts.spawn(V(kingPos.x + rand(-0.4, 0.4), 0.4 + k * 2.2, kingPos.z + rand(-0.4, 0.4)), V(rand(-0.6, 0.6), rand(1, 2), rand(-0.6, 0.6)), C(k < 0.8 ? '#ff7a1a' : '#6a6a6a').multiplyScalar(k < 0.8 ? 0.6 : 0.2), rand(1, 2)); // Rauchpilz
          ctx.fxLight.intensity *= 0.94;
          cam.lookY = Math.min(1.8, k * 1.2);
        }
      },
    };
  },

  // 🛸 Entführung: UFO beamt den König hoch
  ufo(ctx) {
    const { scene, king, kingPos, parts, cam } = ctx;
    const ufo = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16), new THREE.MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.9, roughness: 0.25 })); hull.scale.set(1.3, 0.28, 1.3);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8fe8ff', transparent: true, opacity: 0.55, emissive: C('#3ab4ff'), emissiveIntensity: 0.4 })); dome.position.y = 0.15;
    ufo.add(hull, dome);
    const lights = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: C('#7fff9a').multiplyScalar(3) })); l.position.set(Math.cos(a) * 1.15, -0.05, Math.sin(a) * 1.15); ufo.add(l); lights.push(l); }
    ufo.position.set(kingPos.x + 14, 9, kingPos.z - 10); scene.add(ufo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.1, 4, 40, 1, true), new THREE.MeshBasicMaterial({ color: C('#8affb0').multiplyScalar(1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(kingPos.x, 2.1, kingPos.z); scene.add(beam);
    const hover = V(kingPos.x, 4.2, kingPos.z);
    let hum = false, gone = false;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 6.5; cam.heightEnd = 2.4; cam.lookY = Math.min(1.8, seg(t, 2.4, 4) * 1.8);
        ctx.bg.copy(C('#07080d').lerp(C('#020611'), seg(t, 1.8, 2.4)));
        lights.forEach((l, i) => { l.material.color.setHSL(((t * 0.6 + i / 10) % 1), 1, 0.6).multiplyScalar(2.5); });
        if (t < 4.6) {
          const k = ease.out(seg(t, 1.8, 2.7));
          ufo.position.lerpVectors(V(kingPos.x + 14, 9, kingPos.z - 10), hover, k);
          ufo.position.y += Math.sin(t * 3) * 0.08; ufo.rotation.y += dt * 2;
        }
        if (t > 2.7 && t < 4.5) {
          if (!hum) { hum = true; sound.wind(); }
          beam.material.opacity = Math.min(0.45, beam.material.opacity + dt) * (0.85 + Math.random() * 0.15);
          const k = ease.inOut(seg(t, 2.9, 4.4));
          king.position.set(kingPos.x, kingPos.y + k * 3.7, kingPos.z); king.rotation.y += dt * (2 + k * 8); king.rotation.z = Math.sin(t * 2) * 0.3 * k;
          king.scale.setScalar(1 - k * 0.6);
          for (let i = 0; i < 6; i++) parts.spawn(V(kingPos.x + rand(-0.8, 0.8), 0.2, kingPos.z + rand(-0.8, 0.8)), V(0, rand(1.5, 3), 0), C('#9affc0').multiplyScalar(1.2), rand(0.6, 1.2));
          if (k >= 1) king.visible = false;
        } else if (t >= 4.5) beam.material.opacity = Math.max(0, beam.material.opacity - dt * 3);
        if (t >= 4.7) {
          if (!gone) { gone = true; sound.whoosh(); ctx.flash(0.4, '#c8ffd8'); }
          const k = ease.in(seg(t, 4.7, 5.3));
          ufo.position.lerpVectors(hover, V(kingPos.x - 25, 14, kingPos.z - 20), k);
          if (k < 1) parts.spawn(ufo.position, V(0, 0, 0), C('#9affc0').multiplyScalar(1.5), 0.4);
        }
      },
    };
  },

  // 🌟 Supernova: König glüht, implodiert, explodiert – alle Figuren fliegen
  supernova(ctx) {
    const { scene, king, kingPos, kingMat, parts, debris, pieces, cam } = ctx;
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: C('#ffffff').multiplyScalar(4), transparent: true }));
    core.position.copy(kingPos).setY(0.7); core.scale.setScalar(0.001); scene.add(core);
    const rings = [0, 1].map((i) => { const r = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 80), new THREE.MeshBasicMaterial({ color: C(i ? '#9a7cff' : '#7fd4ff').multiplyScalar(2.5), transparent: true, side: THREE.DoubleSide, depthWrite: false })); r.position.copy(core.position); r.rotation.x = i ? 1.1 : -Math.PI / 2; r.visible = false; scene.add(r); return r; });
    let imploded = false, exploded = false, te = 0;
    return {
      total: 8.4,
      update(t, dt, realDt) {
        cam.distEnd = exploded ? 9 : 5; cam.heightEnd = exploded ? 4 : 2.2;
        const g = seg(t, 1.8, 3.3);
        ctx.bg.copy(C('#07080d').lerp(C('#010104'), g)); ctx.hemi.intensity = 0.55 * (1 - g * 0.8); ctx.key.intensity = 1.5 * (1 - g * 0.8);
        if (!exploded) {
          kingMat.emissive = kingMat.emissive || C('#000'); kingMat.emissive.set('#cfe8ff'); kingMat.emissiveIntensity = g * 5;
          king.rotation.y += dt * g * 6; king.position.x = kingPos.x + rand(-0.02, 0.02) * g;
          ctx.fxLight.position.copy(core.position); ctx.fxLight.color.set('#bfe0ff'); ctx.fxLight.intensity = g * 60 * (1 + Math.sin(t * 25) * 0.2);
          for (let i = 0; i < 10 * g; i++) { const dir = V(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize(); const p0 = core.position.clone().addScaledVector(dir, 3.5); parts.spawn(p0, dir.multiplyScalar(-4.5), C('#cfe8ff').multiplyScalar(1.4), 0.75); }
          ctx.base.aberr = g * 0.8;
        }
        if (t >= 3.3 && !imploded) { imploded = true; sound.whoosh(); ctx.timeScale = 0.35; }
        if (imploded && !exploded) king.scale.setScalar(Math.max(0.05, 1 - ease.in(seg(t, 3.3, 3.6))));
        if (t >= 3.6 && !exploded) {
          exploded = true; te = t; king.visible = false; ctx.base.aberr = 0;
          sound.boom(); sound.boom(); ctx.impact(2); ctx.flash(0.6, '#e6f2ff');
          rings.forEach((r) => { r.visible = true; });
          for (const pc of pieces.values()) {
            if (pc.g === king) continue;
            const off = pc.g.position.clone().sub(kingPos).setY(0); const dd = Math.max(0.5, off.length());
            debris.items.push({ m: pc.g, v: off.normalize().multiplyScalar(14 / dd + 2).add(V(0, 9 / dd + 1, 0)), w: V(rand(-10, 10), rand(-10, 10), rand(-10, 10)), r: 0.02 });
          }
          for (let i = 0; i < 1600; i++) parts.spawn(core.position, V(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 16)), C(['#ffffff', '#bfe0ff', '#9a7cff', '#ffd27a'][i % 4]).multiplyScalar(1.6), rand(0.8, 2.4), 0, 0.8);
          ctx.fxLight.intensity = 300;
        }
        if (exploded) {
          const k = t - te;
          core.scale.setScalar(Math.min(7, 0.2 + k * 14)); core.material.opacity = Math.max(0, 1 - k * 1.4);
          rings.forEach((r, i) => { r.scale.setScalar(1 + k * (16 + i * 6)); r.material.opacity = Math.max(0, 1 - k * 0.7); });
          ctx.fxLight.intensity *= 0.93;
          ctx.hemi.intensity = Math.min(0.55, ctx.hemi.intensity + realDt * 0.3);
        }
      },
    };
  },

  // 🌀 Portal-Schleife: König fällt durch ein Portal und schlägt von oben wieder ein
  portal(ctx) {
    const { scene, king, kingPos, kingMat, parts, debris, cam } = ctx;
    const mkPortal = (color) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.06, 16, 64), new THREE.MeshBasicMaterial({ color: C(color).multiplyScalar(3) })));
      g.add(new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ color: '#05020c' })));
      g.rotation.x = -Math.PI / 2; g.scale.setScalar(0.001); scene.add(g); return g;
    };
    const p1 = mkPortal('#ff8a1a'), p2 = mkPortal('#2ab4ff');
    p1.position.set(kingPos.x, 0.115, kingPos.z); p2.position.set(kingPos.x, 6, kingPos.z); p2.rotation.x = Math.PI / 2;
    let fell = false, crashed = false;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 6; cam.heightEnd = 2.6; cam.lookY = t > 3.4 && !crashed ? 1.6 : Math.max(0, cam.lookY - dt);
        p1.scale.setScalar(Math.max(0.001, ease.out(seg(t, 1.9, 2.4)) * (1 - ease.in(seg(t, 3.5, 3.8))) * 1.4));
        p1.rotation.z += dt * 4;
        if (t > 2.4 && t < 3.5) {
          const k = ease.in(seg(t, 2.5, 3.4));
          king.position.y = kingPos.y - k * 1.6; king.rotation.y += dt * 10;
          if (!fell && k > 0.05) { fell = true; sound.whoosh(); }
          for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; parts.spawn(V(kingPos.x + Math.cos(a) * 0.8, 0.15, kingPos.z + Math.sin(a) * 0.8), V(-Math.sin(a) * 2 - Math.cos(a), 0.3, Math.cos(a) * 2 - Math.sin(a)), C('#ffb347').multiplyScalar(1.3), 0.4); }
        }
        p2.scale.setScalar(Math.max(0.001, ease.out(seg(t, 3.6, 3.9)) * (1 - ease.in(seg(t, 4.5, 4.8))) * 1.4));
        p2.rotation.z -= dt * 4;
        if (t >= 3.9 && !crashed) {
          const k = t - 3.9;
          king.position.y = 5.8 - 0.5 * 30 * k * k; king.rotation.x += dt * 9;
          for (let i = 0; i < 3; i++) parts.spawn(king.position, V(rand(-0.3, 0.3), 1, rand(-0.3, 0.3)), C('#7fd4ff').multiplyScalar(1.3), 0.4);
          if (king.position.y <= kingPos.y + 0.2) {
            crashed = true; king.visible = false; sound.boom(); ctx.impact(1.4);
            debris.burst(kingPos, kingMat, 60, { speed: 5, up: 5 });
            for (let i = 0; i < 500; i++) parts.spawn(V(kingPos.x, 0.3, kingPos.z), V(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 8)), C(i % 2 ? '#7fd4ff' : '#ffb347').multiplyScalar(1.5), rand(0.4, 1.2), 5, 1);
          }
        }
      },
    };
  },

  // 🐙 Tiefseekrake: Tentakel ziehen den König ins Brett
  krake(ctx) {
    const { scene, king, kingPos, parts, bigParts, cam } = ctx;
    const mat = new THREE.MeshStandardMaterial({ color: '#7a2a8f', roughness: 0.45, metalness: 0.1, emissive: C('#2a0636'), emissiveIntensity: 0.5 });
    const N = 16;
    const tentacles = [0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const base = V(kingPos.x + Math.cos(a) * 0.95, 0.05, kingPos.z + Math.sin(a) * 0.95);
      const segs = Array.from({ length: N }, (_, j) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.15 * (1 - j / N) + 0.035, 14, 10), mat); m.castShadow = true; scene.add(m); m.visible = false; return m; });
      return { base, segs, ph: rand(0, 6) };
    });
    let rise = false, grab = false, gone = false;
    return {
      total: 8.2,
      update(t, dt) {
        cam.distEnd = 4.8; cam.heightEnd = 2.4;
        const up = ease.out(seg(t, 2.0, 2.8)), down = ease.in(seg(t, 3.6, 4.8));
        const h = 2.1 * up * (1 - down);
        if (t > 2 && !rise) { rise = true; sound.boom(); ctx.impact(0.8, { slow: false }); for (let i = 0; i < 160; i++) bigParts.spawn(V(kingPos.x + rand(-1.2, 1.2), 0.2, kingPos.z + rand(-1.2, 1.2)), V(rand(-1, 1), rand(1, 3), rand(-1, 1)), C('#5a2a8a').multiplyScalar(0.5), rand(0.6, 1.2), 3); }
        const curl = ease.inOut(seg(t, 2.6, 3.2));
        for (const tc of tentacles) tc.segs.forEach((m, j) => {
          const s = j / (N - 1);
          m.visible = h > 0.05;
          const wig = Math.sin(t * 4 + j * 0.6 + tc.ph) * 0.25 * s;
          const p = tc.base.clone();
          p.y = 0.05 + s * h;
          const toK = kingPos.clone().sub(tc.base).setY(0);
          p.addScaledVector(toK, curl * s * s * 0.95).add(V(wig, 0, Math.cos(t * 3.4 + j * 0.5 + tc.ph) * 0.2 * s));
          m.position.copy(p);
        });
        if (t > 3.1 && !grab) { grab = true; sound.thud(); ctx.impact(0.6, { slow: false }); }
        if (grab && !gone) {
          king.rotation.z = Math.sin(t * 20) * 0.15 * (1 - down);
          king.position.y = kingPos.y - down * 1.8;
          if (down > 0.25) for (let i = 0; i < 3; i++) parts.spawn(V(kingPos.x + rand(-0.5, 0.5), 0.15, kingPos.z + rand(-0.5, 0.5)), V(rand(-1, 1), rand(1, 3), rand(-1, 1)), C('#b46cff').multiplyScalar(1.1), rand(0.4, 0.9), 4);
          if (down >= 1) { gone = true; king.visible = false; sound.boom(); ctx.impact(0.9); }
        }
      },
    };
  },

  // 🎳 Strike: Bowlingkugel räumt alles ab
  bowling(ctx) {
    const { scene, king, kingPos, pieces, debris, parts, cam } = ctx;
    const ballM = new THREE.MeshPhysicalMaterial({ color: '#3a1c8a', metalness: 0.2, roughness: 0.15, clearcoat: 1 });
    const ball = new THREE.Group();
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.62, 40, 28), ballM); sph.castShadow = true; ball.add(sph);
    for (const [x, y] of [[0.18, 0.5], [-0.05, 0.56], [0.08, 0.42]]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: '#0a0510' })); h.position.set(x, y, 0.28); ball.add(h); }
    const startX = kingPos.x < 0 ? 7 : -7, dirX = -Math.sign(startX);
    ball.position.set(startX, 0.72, kingPos.z); scene.add(ball);
    const hitSet = new Set();
    let rolling = false, kingHit = false;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 6.5; cam.heightEnd = 2.6;
        if (t < 1.9) return;
        if (!rolling) { rolling = true; sound.wind(); }
        const speed = 8.5;
        ball.position.x += dirX * speed * dt; ball.rotation.z -= dirX * (speed / 0.62) * dt;
        if (Math.random() < 0.6) parts.spawn(V(ball.position.x, 0.12, ball.position.z + rand(-0.4, 0.4)), V(-dirX * 1, 0.5, rand(-0.5, 0.5)), C('#ffffff').multiplyScalar(0.6), 0.3);
        for (const pc of pieces.values()) {
          if (hitSet.has(pc)) continue;
          const dx = pc.g.position.x - ball.position.x, dz = pc.g.position.z - ball.position.z;
          if (Math.abs(dz) < 1.15 && Math.abs(dx) < 0.7) {
            hitSet.add(pc);
            const isK = pc.g === king;
            debris.items.push({ m: pc.g, v: V(dirX * rand(5, 9) * (isK ? 1.6 : 1), rand(3, 6) * (isK ? 1.7 : 1), Math.sign(dz || 1) * rand(1, 4)), w: V(rand(-10, 10), rand(-10, 10), rand(-14, 14)), r: 0.02 });
            sound.thud();
            for (let i = 0; i < 30; i++) parts.spawn(pc.g.position.clone().setY(0.6), V(rand(-1, 1), rand(0, 1.4), rand(-1, 1)).multiplyScalar(4), C('#ffd27a').multiplyScalar(1.4), rand(0.2, 0.6), 5);
            if (isK && !kingHit) { kingHit = true; ctx.impact(1.3); sound.boom(); }
          }
        }
        if (kingHit) cam.look.lerp(V(king.position.x, Math.max(0.6, king.position.y * 0.6), king.position.z), 1 - Math.exp(-dt * 2));
      },
    };
  },

  // 🪐 Schwerkraftbruch: alles schwebt, dann schlägt die Schwerkraft zehnfach zu
  schwerkraft(ctx) {
    const { king, kingPos, kingMat, pieces, squares, debris, parts, cam } = ctx;
    const floaters = [...pieces.values()].map((p) => ({ g: p.g, o: p.g.position.clone(), h: rand(1.2, 3.2) * (p.g === king ? 1.2 : 1), ph: rand(0, 6), rx: rand(-1, 1), rz: rand(-1, 1) }));
    const sq = squares.map((m) => ({ m, o: m.position.clone(), h: rand(0.2, 0.9), ph: rand(0, 6) }));
    let slammed = false, ts = 0, boomed = false;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 8; cam.heightEnd = 3.6; cam.orbit = 0.1;
        if (!slammed) {
          const k = ease.inOut(seg(t, 1.8, 3.2));
          for (const f of floaters) { f.g.position.y = f.o.y + k * f.h + Math.sin(t * 2 + f.ph) * 0.08 * k; f.g.rotation.x = f.rx * k * 0.8; f.g.rotation.z = f.rz * k * 0.8; }
          for (const s of sq) s.m.position.y = s.o.y + k * s.h * 0.3 + Math.sin(t * 2 + s.ph) * 0.03 * k;
          cam.lookY = k * 1.2;
          if (t > 1.85 && t < 1.95) sound.whoosh();
          if (t >= 3.6) {
            slammed = true; ts = t; sound.zap();
            for (const f of floaters) debris.items.push({ m: f.g, v: V(0, -18, 0), w: V(f.rx * 4, 0, f.rz * 4), r: 0.02 });
          }
        } else {
          const k = seg(t, ts, ts + 0.25);
          for (const s of sq) s.m.position.y = THREE.MathUtils.lerp(s.o.y + s.h * 0.3, s.o.y, k);
          cam.lookY = Math.max(0, cam.lookY - dt * 3);
          if (!boomed && king.position.y <= kingPos.y + 0.2) {
            boomed = true; king.visible = false; sound.boom(); sound.thud(); ctx.impact(1.8);
            debris.burst(kingPos, kingMat, 60, { speed: 6, up: 3 });
            for (let i = 0; i < 900; i++) parts.spawn(V(rand(-4, 4), 0.15, rand(-4, 4)), V(rand(-1, 1), rand(1, 4), rand(-1, 1)), C(i % 2 ? '#cfe8ff' : '#ffffff').multiplyScalar(0.9), rand(0.3, 0.9), 6);
          }
        }
      },
    };
  },

  // ✴️ Klingensturm: Wurfsterne zerlegen den König
  shuriken(ctx) {
    const { scene, king, kingPos, kingMat, debris, parts, cam } = ctx;
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 0.07 : 0.28; i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
    const steel = new THREE.MeshStandardMaterial({ color: '#d7dde4', metalness: 1, roughness: 0.15 });
    const stars = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2);
      const from = kingPos.clone().add(V(Math.cos(a) * 7, rand(0.8, 2.2), Math.sin(a) * 7));
      const hit = kingPos.clone().add(V(rand(-0.1, 0.1), rand(0.35, 1.1), rand(-0.1, 0.1)));
      const m = new THREE.Mesh(geo, steel); m.castShadow = true; m.visible = false; scene.add(m);
      return { m, from, hit, t0: 2.0 + i * 0.16, out: hit.clone().add(hit.clone().sub(from).setY(0).normalize().multiplyScalar(3)).setY(0.14), done: false };
    });
    let cut = false;
    return {
      total: 8,
      update(t, dt) {
        cam.distEnd = 4.6; cam.heightEnd = 2;
        for (const s of stars) {
          if (t < s.t0) continue;
          s.m.visible = true; s.m.rotation.x = Math.PI / 2; s.m.rotation.z += dt * 30;
          const k = (t - s.t0) / 0.28;
          if (k < 1) s.m.position.lerpVectors(s.from, s.hit, k);
          else { const k2 = Math.min(1, (k - 1) * 1.5); s.m.position.lerpVectors(s.hit, s.out, k2); if (k2 >= 1) s.m.rotation.z -= dt * 30; }
          if (k >= 1 && !s.done) {
            s.done = true; sound.slash();
            for (let i = 0; i < 20; i++) parts.spawn(s.hit, V(rand(-1, 1), rand(0, 1), rand(-1, 1)).multiplyScalar(rand(2, 4)), C(i % 2 ? '#ffffff' : '#bfe6ff').multiplyScalar(1.5), rand(0.2, 0.5), 5);
            king.position.x = kingPos.x + rand(-0.05, 0.05); king.rotation.z = rand(-0.1, 0.1);
            ctx.shake(0.04, 0.15);
          }
        }
        if (t >= 4.0 && !cut) {
          cut = true; king.visible = false; sound.shatter(); ctx.impact(1.2);
          debris.burst(kingPos, kingMat, 26, { speed: 2.5, up: 2.5, size: [0.12, 0.26], geo: 'tetra', spread: 0.1 });
        }
      },
    };
  },

  // 🏔️ Lawine: Schneebrocken rollen heran und begraben den König
  lawine(ctx) {
    const { scene, king, kingPos, parts, bigParts, debris, cam } = ctx;
    const snow = new THREE.MeshStandardMaterial({ color: '#f4f8ff', roughness: 0.9, emissive: C('#8fb7d8'), emissiveIntensity: 0.08 });
    const srcSide = kingPos.x < 0 ? 1 : -1;
    let spawned = 0, rumble = 0, buried = false;
    return {
      total: 8.2,
      update(t, dt) {
        cam.distEnd = 6.5; cam.heightEnd = 3;
        if (t > 1.8) for (let i = 0; i < 6; i++) parts.spawn(V(kingPos.x + rand(-6, 6), 7, kingPos.z + rand(-6, 6)), V(rand(-0.4, 0.4), -rand(1.2, 2), rand(-0.4, 0.4)), C('#ffffff').multiplyScalar(0.8), rand(3, 4));
        if (t > 2.0 && t < 4.2) {
          if (t - rumble > 0.4) { rumble = t; sound.thud(); }
          ctx.shake(0.03, 0.2);
          const want = Math.floor(seg(t, 2.0, 3.8) * 110);
          while (spawned < want) {
            spawned++;
            const s = rand(0.12, 0.34);
            const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), snow); m.castShadow = true;
            m.position.set(kingPos.x + srcSide * rand(4, 6), rand(2.5, 5), kingPos.z + rand(-1.4, 1.4)); scene.add(m);
            const toK = V(kingPos.x - m.position.x + rand(-0.5, 0.5), 0, kingPos.z - m.position.z + rand(-0.6, 0.6)).normalize();
            debris.items.push({ m, v: toK.multiplyScalar(rand(4, 7)).add(V(0, rand(-1, 1), 0)), w: V(rand(-5, 5), rand(-5, 5), rand(-5, 5)), r: s });
          }
          for (let i = 0; i < 3; i++) bigParts.spawn(V(kingPos.x + srcSide * rand(0, 4), 0.4, kingPos.z + rand(-1.5, 1.5)), V(-srcSide * rand(1, 3), rand(0.5, 1.5), rand(-0.5, 0.5)), C('#ffffff').multiplyScalar(0.35), rand(0.8, 1.6));
          king.rotation.z = -srcSide * ease.in(seg(t, 2.8, 3.8)) * 1.2;
          king.position.x = kingPos.x - srcSide * ease.in(seg(t, 2.8, 3.8)) * 0.4;
        }
        // Schnee bremst auf dem Boden stark ab und bleibt liegen
        for (const it of debris.items) if (it.m.material === snow && it.m.position.y < 0.12 + it.r + 0.02) { it.v.multiplyScalar(0.9); it.w.multiplyScalar(0.9); }
        if (t > 4.2 && !buried) { buried = true; king.visible = false; sound.boom(); ctx.impact(0.9); for (let i = 0; i < 300; i++) parts.spawn(V(kingPos.x, rand(0.2, 0.8), kingPos.z), V(rand(-1, 1), rand(0.5, 2), rand(-1, 1)).multiplyScalar(2), C('#ffffff'), rand(0.6, 1.4), 2, 1.2); }
      },
    };
  },
});

// ------------------------------------------------------------ 3D-Figuren als Bilder fürs normale Brett
// Rendert alle 12 Figuren einmal mit echten 3D-Modellen (Elfenbein & schwarzer Klavierlack) in PNG-Bilder.
export function renderPieceSprites({ size = 200 } = {}) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight('#ffffff', '#2a2420', 0.6));
  const key = new THREE.DirectionalLight('#fff4e2', 2.2); key.position.set(-2.5, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#9fc4ff', 2.4); rim.position.set(3, 2.5, -3); scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffffff', 0.5); fill.position.set(2, 1, 4); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(20.5, 1, 0.1, 50);
  camera.position.set(0, 1.55, 3.6); camera.lookAt(0, 0.6, 0);
  const mats = {
    w: new THREE.MeshPhysicalMaterial({ color: '#eadcc0', roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9, sheen: 0.4, sheenColor: new THREE.Color('#fff6e6') }),
    b: new THREE.MeshPhysicalMaterial({ color: '#17171c', roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 }),
  };
  const out = new Map();
  try {
    for (const color of ['w', 'b']) {
      for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
        const piece = makePiece(type, mats[color]);
        if (type === 'n') piece.rotation.y = -Math.PI / 2; // Pferdekopf im Profil zur Kamera
        else piece.rotation.y = 0.5; // leicht gedreht wirkt plastischer
        scene.add(piece);
        renderer.render(scene, camera);
        out.set(type + color, canvas.toDataURL('image/png'));
        scene.remove(piece);
      }
    }
  } finally {
    pmrem.dispose(); env.dispose(); for (const m of Object.values(mats)) m.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  }
  return out;
}

export { makePiece, skinMaterial }; // auch fürs spielbare 3D-Brett
