// Spielbares 3D-Brett (für die 3D-Figuren): echte 3D-Figuren auf einem 3D-Brett.
// Die Spiellogik bleibt im normalen Board – dieses Modul zeichnet nur und erkennt per Strahl, welches Feld angetippt wurde.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makePiece, skinMaterial, squareTexture, BOARD3D } from './finisher.js';
import { BOARDS, splitLook } from './catalog.js';
import { boardTexturesSync } from './textures.js';

const SQ_Y = 0.1;    // Oberkante der Felder (wie im Finisher)
const SCALE = 0.84;  // Figurengröße relativ zum Feld
const sqPos = (sq) => new THREE.Vector3(sq.charCodeAt(0) - 97 - 3.5, SQ_Y, 3.5 - (+sq[1] - 1));
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function pieceMaterial(look, color) {
  const skin = splitLook(look).skin; // Look = Skin (+ Form)
  if (skin === 'figuren3d') {
    return color === 'w'
      ? new THREE.MeshPhysicalMaterial({ color: '#e3cfa8', roughness: 0.42, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.15, envMapIntensity: 0.55 })
      : new THREE.MeshPhysicalMaterial({ color: '#17171c', roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 });
  }
  return skinMaterial(skin, color);
}

export class Board3D {
  constructor(board) {
    this.board = board;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'webgl3d';
    board.el.appendChild(this.canvas);
    board.el.classList.add('mode3d');
    const small = Math.min(innerWidth, innerHeight) < 820;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true }));
    this.pixelRatio = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75);
    r.setPixelRatio(this.pixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    const scene = (this.scene = new THREE.Scene());
    const bg = new THREE.Color('#07080d');
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 16, 40);
    const pmrem = new THREE.PMREMGenerator(r);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.env;
    // Licht wie im Finisher: kühles Umgebungslicht, warmes Hauptlicht, lila Gegenlicht, Spot von oben
    scene.add(new THREE.HemisphereLight('#cfd8ff', '#20140a', 0.55));
    const key = new THREE.DirectionalLight('#fff3e0', 1.25);
    key.position.set(5, 11, 6); key.castShadow = true;
    key.shadow.mapSize.set(small ? 1024 : 1536, small ? 1024 : 1536); key.shadow.radius = 4; key.shadow.bias = -0.0005;
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    scene.add(key);
    const rim = new THREE.DirectionalLight('#7c5cff', 1.4); rim.position.set(-6, 5, -7); scene.add(rim);
    const spot = new THREE.SpotLight('#ffe9c7', 9, 26, 0.62, 0.75, 1.3);
    spot.position.set(1.5, 10, 3); spot.target.position.set(0, 0, 0);
    spot.castShadow = !small; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004;
    scene.add(spot, spot.target);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: '#040508', roughness: 0.35, metalness: 0.4, envMapIntensity: 0.08 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.22; floor.receiveShadow = true; scene.add(floor);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    // Nachbearbeitung wie im Finisher (leichtes Leuchten heller Stellen)
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.4, 2.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.boardGroup = new THREE.Group(); scene.add(this.boardGroup);
    this.pieceGroup = new THREE.Group(); scene.add(this.pieceGroup);
    this.markGroup = new THREE.Group(); scene.add(this.markGroup);
    this.pieces = new Map(); // Feld -> { g, type, color }
    this.mats = {};
    this.anims = [];
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SQ_Y);
    this.dotGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 32);
    this.ringGeo = new THREE.TorusGeometry(0.42, 0.045, 10, 48);
    this.tileGeo = new THREE.PlaneGeometry(1, 1);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(board.el);
    this.refresh();
  }

  // Alles neu aufbauen (Thema, Figuren, Blickrichtung)
  refresh() {
    this.setTheme(this.board.el.dataset.theme);
    this.setSkins();
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || this.board.el.clientWidth, h = this.canvas.clientHeight || this.board.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio?.(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camPose();
  }

  // Kamera schräg hinter dem eigenen Spieler; Abstand so gewählt, dass das ganze Brett ins Bild passt
  camPose() {
    const o = this.board.orientation === 'w' ? 1 : -1;
    const cam = this.camera;
    const target = new THREE.Vector3(0, 0, 0.4 * o);
    const dir = new THREE.Vector3(0, 1.42, 1 * o).normalize();
    const pts = [];
    for (const x of [-4.55, 4.55]) for (const z of [-4.55, 4.55]) for (const y of [-0.2, 1.05]) pts.push(new THREE.Vector3(x, y, z));
    let lo = 4, hi = 60;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      cam.position.copy(target).addScaledVector(dir, mid); cam.lookAt(target);
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      const fits = pts.every((p) => { const v = p.clone().project(cam); return Math.abs(v.x) <= 0.99 && Math.abs(v.y) <= 0.97; });
      if (fits) hi = mid; else lo = mid;
    }
    cam.position.copy(target).addScaledVector(dir, hi); cam.lookAt(target);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    this.invalidate();
  }

  setTheme(id) {
    const t = BOARDS.find((b) => b.id === id) || BOARDS[0];
    if (this.themeId === t.id && this.boardGroup.children.length) return;
    this.themeId = t.id;
    for (const c of [...this.boardGroup.children]) { this.boardGroup.remove(c); c.geometry?.dispose(); }
    const [lc, dc] = BOARD3D[t.id] || [t.light, t.dark];
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    const physical = (extra) => new THREE.MeshPhysicalMaterial({ roughness: 0.4, metalness: 0.02, clearcoat: 0.55, clearcoatRoughness: 0.18, envMapIntensity: 0.35, ...extra });
    const tex = boardTexturesSync(t.id);
    const base = tex ? { light: new THREE.CanvasTexture(tex.light), dark: new THREE.CanvasTexture(tex.dark) } : null;
    if (base) for (const x of Object.values(base)) { x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = aniso; }
    const plainMat = (col, seed) => {
      const map = squareTexture('plain', new THREE.Color().setStyle(col).getStyle(), seed); map.anisotropy = aniso;
      const m = physical({ map });
      if (t.id === 'neon') m.emissive = new THREE.Color(seed > 3 ? '#14104a' : '#0a0830');
      return m;
    };
    const lightMats = base ? null : [1, 2, 3].map((i) => plainMat(lc, i)), darkMats = base ? null : [4, 5, 6].map((i) => plainMat(dc, i));
    const sqGeo = new THREE.BoxGeometry(1, 0.2, 1);
    for (let f = 0; f < 8; f++) for (let rk = 0; rk < 8; rk++) {
      const isLight = (f + rk) % 2 === 1;
      let mat;
      if (base) {
        const tx = (isLight ? base.light : base.dark).clone();
        tx.repeat.set(1 / 8, 1 / 8); tx.offset.set(f / 8, rk / 8); tx.needsUpdate = true;
        mat = physical({ map: tx });
      } else mat = (isLight ? lightMats : darkMats)[(f * 7 + rk * 3) % 3];
      const m = new THREE.Mesh(sqGeo, mat);
      m.position.set(f - 3.5, 0, 3.5 - rk); m.receiveShadow = true;
      this.boardGroup.add(m);
    }
    if (t.frost && tex?.frost) {
      const ft = new THREE.CanvasTexture(tex.frost); ft.colorSpace = THREE.SRGBColorSpace;
      const frost = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: ft, transparent: true, opacity: 0.35, depthWrite: false }));
      frost.rotation.x = -Math.PI / 2; frost.position.y = 0.102; this.boardGroup.add(frost);
    }
    // dicker Rahmen mit Goldeinlage – wie im Finisher
    const frameMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setStyle(t.frame), roughness: 0.35, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    for (const [w, d, x, z] of [[9.1, 0.55, 0, -4.275], [9.1, 0.55, 0, 4.275], [0.55, 8, 4.275, 0], [0.55, 8, -4.275, 0]]) {
      const fp = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), frameMat);
      fp.position.set(x, -0.06, z); fp.receiveShadow = true; fp.castShadow = true; this.boardGroup.add(fp);
    }
    const goldMat = new THREE.MeshStandardMaterial({ color: '#d4a84a', metalness: 1, roughness: 0.28, envMapIntensity: 1.2 });
    for (const [w, d, x, z] of [[8.24, 0.06, 0, 4.12], [8.24, 0.06, 0, -4.12], [0.06, 8.24, 4.12, 0], [0.06, 8.24, -4.12, 0]]) {
      const inlay = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), goldMat);
      inlay.position.set(x, 0.105, z); this.boardGroup.add(inlay);
    }
    this.invalidate();
  }

  setSkins() {
    for (const m of Object.values(this.mats)) m.dispose();
    const s = this.board.skins;
    this.mats = { w: pieceMaterial(s.w, 'w'), b: pieceMaterial(s.b, 'b') };
    for (const p of this.pieces.values()) this.pieceGroup.remove(p.g);
    this.pieces = new Map();
    this.sync(false);
  }

  _makePiece(type, color) {
    const g = makePiece(type, this.mats[color]);
    g.scale.setScalar(SCALE);
    if (type === 'n') g.rotation.y = color === 'w' ? Math.PI - 0.8 : 0.8; // Pferdekopf schräg zum Gegner – so sieht man das Profil
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } }); // keine Schattenränder auf den Figuren
    this.pieceGroup.add(g);
    return g;
  }

  // Figuren an die Stellung des Boards anpassen (mit Gleit-Animation)
  sync(animate = true) {
    const next = new Map();
    for (const row of this.board.chess.board()) for (const p of row) if (p) next.set(p.square, p);
    const keep = new Map(), orphan = [];
    for (const [sq, p] of this.pieces) {
      const n = next.get(sq);
      if (n && n.type === p.type && n.color === p.color) { keep.set(sq, p); if (!animate) p.g.position.copy(sqPos(sq)); }
      else orphan.push([sq, p]);
    }
    const last = this.board.lastMove;
    for (const [sq, n] of next) {
      if (keep.has(sq)) continue;
      let bestI = -1, bestD = 99;
      orphan.forEach(([osq, p], i) => {
        if (p.type !== n.type || p.color !== n.color) return;
        const d = osq === last?.from ? -1 : Math.abs(osq.charCodeAt(0) - sq.charCodeAt(0)) + Math.abs(+osq[1] - +sq[1]);
        if (d < bestD) { bestD = d; bestI = i; }
      });
      if (bestI >= 0) {
        const [osq, p] = orphan.splice(bestI, 1)[0];
        keep.set(sq, p);
        if (animate) this._slide(p, sqPos(osq), sqPos(sq), p.type === 'n');
        else p.g.position.copy(sqPos(sq));
      } else {
        const g = this._makePiece(n.type, n.color);
        g.position.copy(sqPos(sq));
        const p = { g, type: n.type, color: n.color };
        keep.set(sq, p);
        if (animate) this._grow(p);
      }
    }
    for (const [, p] of orphan) {
      if (animate) this._sink(p);
      else this.pieceGroup.remove(p.g);
    }
    this.pieces = keep;
    for (const p of keep.values()) { p.g.rotation.x = 0; p.g.rotation.z = 0; }
    this.marks();
  }

  _slide(p, from, to, jump) {
    const dur = 300 + from.distanceTo(to) * 25, h = jump ? 0.9 : 0.18 + from.distanceTo(to) * 0.03;
    this._anim(dur, (k) => {
      const e = easeInOut(k);
      p.g.position.lerpVectors(from, to, e);
      p.g.position.y = SQ_Y + Math.sin(k * Math.PI) * h;
    }, () => { p.g.position.copy(to); this._bounce(p); });
  }
  _bounce(p) { this._anim(180, (k) => { const s = 1 - Math.sin(k * Math.PI) * 0.06; p.g.scale.set(SCALE / Math.sqrt(s), SCALE * s, SCALE / Math.sqrt(s)); }, () => p.g.scale.setScalar(SCALE)); }
  _grow(p) { this._anim(260, (k) => p.g.scale.setScalar(SCALE * easeOut(k)), () => p.g.scale.setScalar(SCALE)); }
  _sink(p) {
    const y0 = p.g.position.y, rz = (Math.random() - 0.5) * 2.4;
    this._anim(420, (k) => { p.g.position.y = y0 - k * 0.6; p.g.rotation.z = rz * k; p.g.scale.setScalar(SCALE * (1 - k * 0.7)); }, () => this.pieceGroup.remove(p.g));
  }

  // Markierungen: letzter Zug, Auswahl, Schach, mögliche Züge
  marks() {
    for (const c of [...this.markGroup.children]) { this.markGroup.remove(c); if (c.material) c.material.dispose(); }
    const tile = (sq, color, op, y = SQ_Y + 0.004) => {
      const m = new THREE.Mesh(this.tileGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.copy(sqPos(sq)); m.position.y = y; m.renderOrder = 2; this.markGroup.add(m);
    };
    const b = this.board, last = b.lastMove;
    if (last) { tile(last.from, '#ffd84d', 0.32); tile(last.to, '#ffd84d', 0.38); }
    if (b.coachHint) { tile(b.coachHint.from, '#34d399', 0.45); tile(b.coachHint.to, '#34d399', 0.55); }
    if (b.selected) tile(b.selected, '#7c5cff', 0.5);
    if (b.chess.inCheck()) { const k = b.kingSquare(b.chess.turn()); if (k) tile(k, '#ff2d55', 0.6); }
    if (b.selected) {
      for (const mv of b.chess.moves({ square: b.selected, verbose: true })) {
        if (mv.promotion && mv.promotion !== 'q') continue;
        const mat = new THREE.MeshBasicMaterial({ color: '#141420', transparent: true, opacity: 0.45, depthWrite: false });
        const m = new THREE.Mesh(mv.captured ? this.ringGeo : this.dotGeo, mat);
        if (mv.captured) m.rotation.x = Math.PI / 2;
        m.position.copy(sqPos(mv.to)); m.position.y = SQ_Y + 0.02; m.renderOrder = 3;
        this.markGroup.add(m);
      }
    }
    // ausgewählte Figur leicht anheben
    for (const [sq, p] of this.pieces) {
      const lift = sq === b.selected ? 0.22 : 0;
      if (!this.anims.some((a) => a.p === p)) p.g.position.y = SQ_Y + lift;
    }
    this.invalidate();
  }

  // Welches Feld wurde angetippt?
  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null;
    const f = Math.floor(hit.x + 4), rk = Math.floor(4 - hit.z);
    if (f < 0 || f > 7 || rk < 0 || rk > 7) return null;
    return 'abcdefgh'[f] + (rk + 1);
  }

  // Bildschirm-Position eines Feldes (für Effekte und Tests)
  screenPos(sq) {
    const v = sqPos(sq).project(this.camera), r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  // Effekte
  mate(sq) {
    const p = this.pieces.get(sq); if (!p) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    this._anim(900, (k) => { const e = easeOut(k); p.g.rotation.z = dir * e * 1.45; p.g.position.y = SQ_Y + Math.sin(e * Math.PI) * 0.15; });
  }
  toss() {
    return new Promise((resolve) => {
      const items = [...this.pieces.values()].map((p) => ({ p, v: new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 5, (Math.random() - 0.5) * 6), w: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) }));
      const t0 = { y: this.boardGroup.rotation.x };
      this._anim(1300, (k, dt) => {
        this.boardGroup.rotation.x = t0.y - Math.sin(Math.min(1, k * 3) * Math.PI) * 0.12;
        for (const it of items) { it.v.y -= 14 * dt; it.p.g.position.addScaledVector(it.v, dt); it.p.g.rotation.x += it.w.x * dt; it.p.g.rotation.z += it.w.z * dt; }
      }, () => { this.boardGroup.rotation.x = 0; resolve(); });
    });
  }

  _anim(ms, step, done) {
    const a = { t0: performance.now(), ms, step, done, last: performance.now() };
    this.anims.push(a);
    this.invalidate();
    return a;
  }
  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((now) => this._frame(now));
  }
  _frame(now) {
    this.raf = 0;
    for (const a of [...this.anims]) {
      const k = Math.min(1, (now - a.t0) / a.ms), dt = Math.min(0.05, (now - a.last) / 1000);
      a.last = now;
      a.step(k, dt);
      if (k >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.done?.(); }
    }
    this.composer.render();
    if (this.anims.length) this.invalidate();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.env.dispose();
    this.canvas.remove();
    this.board.el.classList.remove('mode3d');
  }
}
