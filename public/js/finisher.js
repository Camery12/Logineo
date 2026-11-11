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
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAberr: { value: 0 }, uGrain: { value: 0.045 }, uInvert: { value: 0 }, uGlitch: { value: 0 }, uVignette: { value: 0.45 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uAberr, uGrain, uInvert, uGlitch, uVignette; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uGlitch > 0.001) {
        float band = floor(uv.y * 22.0 + floor(uTime * 16.0) * 5.0);
        float r = hash(vec2(band, floor(uTime * 24.0)));
        if (r < uGlitch * 0.55) uv.x += (hash(vec2(band, 3.7)) - 0.5) * 0.16 * uGlitch;
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
function lathe(type) {
  return (geoCache[type] ||= new THREE.LatheGeometry(LATHE[type].map(([x, y]) => new THREE.Vector2(Math.max(x, 0.003), y)), 40));
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
  if (type === 'p') add(new THREE.SphereGeometry(0.16, 24, 16), 0.6);
  if (type === 'b') add(new THREE.SphereGeometry(0.05, 12, 8), 1.02);
  if (type === 'q') { add(new THREE.SphereGeometry(0.07, 16, 10), 1.0); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(new THREE.SphereGeometry(0.045, 10, 8), 0.98, Math.cos(a) * 0.25, Math.sin(a) * 0.25); } }
  if (type === 'k') { add(new THREE.BoxGeometry(0.07, 0.28, 0.07), 1.17); add(new THREE.BoxGeometry(0.22, 0.07, 0.07), 1.2); }
  if (type === 'r') for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const m = add(new THREE.BoxGeometry(0.1, 0.1, 0.09), 0.84, Math.cos(a) * 0.25, Math.sin(a) * 0.25); m.rotation.y = -a; }
  if (type === 'n') { const h = add(knightHead(), 0.18); h.rotation.y = Math.PI / 2; }
  return g;
}

function skinMaterial(skinId, color) {
  const s = PIECES.find((p) => p.id === skinId) || PIECES[0];
  const c = new THREE.Color().setStyle(s[color].fill[0]).lerp(new THREE.Color().setStyle(s[color].fill[1]), 0.55);
  const m = new THREE.MeshStandardMaterial({ color: c, metalness: s.mat.metal, roughness: Math.max(0.18, s.mat.rough), envMapIntensity: 0.3 });
  if (s.mat.opacity) { m.transparent = true; m.opacity = s.mat.opacity; }
  if (s.mat.emissive) { m.emissive = new THREE.Color().setStyle(s[color].stroke); m.emissiveIntensity = s.mat.emissive * 0.6; }
  return m;
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

function run({ finisher = 'klassisch', fen, boardTheme = 'klassisch', skins = { w: 'klassisch', b: 'klassisch' }, loserColor = 'b', winnerName = '', subtitle }, done) {
  const info = FINISHERS.find((f) => f.id === finisher) || FINISHERS[0];
  const overlay = document.createElement('div');
  overlay.className = 'finisher';
  overlay.innerHTML = `<canvas></canvas><div class="fx-vignette"></div><div class="fx-bar top"></div><div class="fx-bar bottom"></div>
    <div class="fx-title"><div class="fx-main">${'SCHACHMATT'.split('').map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('')}</div><div class="fx-sub"></div></div>
    <div class="fx-lines"></div>
    <div class="fx-flash"></div><div class="fx-tag"><span>${info.icon}</span> Finisher: ${info.name}</div><button class="fx-skip">Überspringen ›</button>`;
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('canvas');
  const flashEl = overlay.querySelector('.fx-flash');
  requestAnimationFrame(() => overlay.classList.add('on'));

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch {
    overlay.classList.add('title-on');
    setTimeout(() => { overlay.remove(); done(); }, 2500);
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 100);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.4, 2.2);
  if (window.__noBloom) bloom.enabled = false;
  composer.addPass(bloom);
  const fxPass = new ShaderPass(FXShader);
  composer.addPass(fxPass);
  composer.addPass(new OutputPass());

  // Licht
  const hemi = new THREE.HemisphereLight('#cfd8ff', '#20140a', 0.9); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff3e0', 2.0);
  key.position.set(5, 11, 6); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#7c5cff', 1.4); rim.position.set(-6, 5, -7); scene.add(rim);
  const fxLight = new THREE.PointLight('#ffffff', 0, 12, 1.6); scene.add(fxLight);

  // Brett
  const theme = BOARDS.find((b) => b.id === boardTheme) || BOARDS[0];
  const [lc, dc] = BOARD3D[theme.id] || [theme.light, theme.dark];
  const lightMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setStyle(lc), roughness: 0.55, metalness: 0.05, envMapIntensity: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setStyle(dc), roughness: 0.55, metalness: 0.05, envMapIntensity: 0.2 });
  if (theme.id === 'neon') { darkMat.emissive = new THREE.Color('#0a0830'); lightMat.emissive = new THREE.Color('#14104a'); }
  const sqGeo = new THREE.BoxGeometry(1, 0.2, 1);
  const squares = [];
  const sqPos = (sq) => new THREE.Vector3(sq.charCodeAt(0) - 97 - 3.5, 0, 3.5 - (+sq[1] - 1));
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const m = new THREE.Mesh(sqGeo, (f + r) % 2 ? lightMat : darkMat);
    m.position.set(f - 3.5, 0, 3.5 - r); m.receiveShadow = true;
    scene.add(m); squares.push(m);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.3, 8.9), new THREE.MeshStandardMaterial({ color: new THREE.Color().setStyle(theme.frame), roughness: 0.4, metalness: 0.3 }));
  frame.position.y = -0.06; frame.receiveShadow = true; scene.add(frame);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: '#0b0c12', roughness: 1 }));
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
      const g = makePiece(type, mats[color]);
      g.position.copy(sqPos(sq)).setY(0.1);
      if (type === 'n') g.rotation.y = color === 'w' ? 0 : Math.PI;
      scene.add(g); pieces.set(sq, { g, type, color });
      if (type === 'k' && color === loserColor) kingSq = sq;
      x++;
    }
  });
  if (!kingSq) kingSq = 'e8';
  const king = pieces.get(kingSq)?.g || new THREE.Group();
  const kingMat = mats[loserColor].clone();
  king.traverse((o) => { if (o.isMesh) o.material = kingMat; });
  const kingPos = sqPos(kingSq).setY(0.1);

  const tex = spriteTexture();
  const parts = new Particles(scene, 6000, tex, 0.16);
  const bigParts = new Particles(scene, 800, tex, 0.6);
  const debris = new Debris(scene);

  // Kamera-Steuerung
  const winnerSide = loserColor === 'w' ? 'b' : 'w';
  const baseAngle = (winnerSide === 'w' ? 0 : Math.PI) + 0.55;
  const cam = { look: kingPos.clone().setY(0.7), lookY: 0, shake: 0, distEnd: 3.8, heightEnd: 2.1, orbit: 0.06 };
  let shakeT = 0, shakeAmp = 0;
  const shake = (amp, dur) => { shakeAmp = amp; shakeT = dur; };
  const flash = (alpha = 0.9, color = '#fff') => {
    flashEl.style.transition = 'none'; flashEl.style.background = color; flashEl.style.opacity = alpha;
    requestAnimationFrame(() => { flashEl.style.transition = 'opacity .6s ease-out'; flashEl.style.opacity = 0; });
  };
  const hide = (o) => { o.visible = false; };

  // Impact-System: Aberration, Zeitlupe, Impact-Frame, FOV-Punch, Titel-Wackeln, Speedlines
  const fx = { aberr: 0, invertT: 0, slowRecover: 0, fovKick: 0 };
  const base = { aberr: 0, glitch: 0 };
  const impact = (str = 1, { invert = str >= 0.8, slow = str >= 0.8 } = {}) => {
    fx.aberr = Math.max(fx.aberr, 1.8 * str);
    fx.fovKick = Math.min(fx.fovKick, -7 * str);
    shake(0.18 * str + 0.06, 0.45 + 0.4 * str);
    flash(Math.min(1, 0.45 + 0.45 * str));
    if (invert) fx.invertT = 0.085;
    if (slow) { ctx.timeScale = 0.22; fx.slowRecover = 1; }
    overlay.classList.remove('hit'); void overlay.offsetWidth; overlay.classList.add('hit');
  };
  const ctx = { scene, king, kingPos, kingMat, parts, bigParts, debris, shake, flash, fxLight, hemi, key, rim, bg, cam, pieces, squares, loserColor, bloom, timeScale: 1, impact, base, renderer, camera };
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
      scene.traverse((o) => { if (o.geometry && !Object.values(geoCache).includes(o.geometry)) o.geometry.dispose?.(); });
      pmrem.dispose(); composer.dispose?.(); renderer.dispose(); renderer.forceContextLoss();
      overlay.remove(); removeEventListener('resize', onResize); removeEventListener('keydown', onKey);
      done();
    }, 600);
  }
  overlay.querySelector('.fx-skip').onclick = finish;
  const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ') finish(); };
  addEventListener('keydown', onKey);
  const onResize = () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', onResize);

  const tmp = new THREE.Vector3();
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
    fx.aberr *= Math.exp(-realDt * 3.2);
    fx.fovKick *= Math.exp(-realDt * 3.5);
    if (fx.invertT > 0) fx.invertT -= realDt;
    if (fx.slowRecover && ctx.timeScale < 1) ctx.timeScale = Math.min(1, ctx.timeScale + realDt * 0.9);
    fxPass.uniforms.uTime.value = now / 1000;
    fxPass.uniforms.uAberr.value = fx.aberr + base.aberr + 0.12;
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
    if (shakeT > 0) { shakeT -= realDt; const a = shakeAmp * Math.max(0, shakeT); camera.position.x += rand(-a, a); camera.position.y += rand(-a, a); }
    camera.lookAt(tmp);
    composer.render();
  }
  raf = requestAnimationFrame(frameLoop);
  ctx.hide = hide;
}

// ------------------------------------------------------------ Effekte
const C = (s) => new THREE.Color(s);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const EFFECTS = {
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
            sound.boom(); ctx.flash(1, '#ffe2b0'); ctx.shake(0.45, 0.9); ctx.impact(1.5);
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
          ctx.shake(0.08, 0.15);
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
          ctx.shake(0.035 * grow, 0.12);
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
          const spike = Math.random() < 0.12;
          ctx.base.glitch = 0.12 + (spike ? 0.5 : 0) + seg(t, 2.4, 3.05) * 0.3;
          kingMat.emissive = kingMat.emissive || C('#000'); kingMat.emissive.copy(green); kingMat.emissiveIntensity = spike ? 1.5 : 0.3;
          kingMat.wireframe = Math.random() < 0.25;
          kingMat.color.copy(Math.random() < 0.2 ? green : baseColor);
          king.position.set(kingPos.x + (spike ? rand(-0.12, 0.12) : 0), kingPos.y, kingPos.z + (spike ? rand(-0.12, 0.12) : 0));
          king.scale.set(1 + (spike ? rand(-0.2, 0.3) : 0), 1, 1);
        }
        if (t >= 3.05 && !broke) {
          broke = true; king.visible = false; inst.visible = true; ctx.impact(1.1); sound.glitch(); sound.boom();
        }
        if (broke) {
          ctx.base.glitch = Math.max(0, 0.9 * (1 - seg(t, 3.05, 5.4)));
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
