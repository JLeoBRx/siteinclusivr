/* =========================================================
   InclusiVR — Estúdio 3D interativo
   OrbitControls + troca de modelos, acabamentos e cores.
   ========================================================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  createLogo, loadLogoAssets, extrude, shapesFrom, loadTexture, radialTexture, countTriangles, glowBlend
} from './logo3d.js';

const studio = document.querySelector('[data-studio]');
const canvas = document.getElementById('studio-canvas');

if (studio && canvas) {
  const start = () => init().catch((err) => {
    console.warn('[studio3d]', err);
    const loader = studio.querySelector('[data-studio-loader]');
    if (loader) loader.textContent = 'Seu navegador não suporta WebGL 2 — o estúdio 3D não pôde ser carregado.';
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: '400px 0px' });
    io.observe(studio);
  } else {
    start();
  }
}

const MODEL_INFO = {
  logo: { name: 'Logo InclusiVR', cam: [0.9, 0.35, 4.3], target: [0, 0.05, 0] },
  rune: { name: 'Runa LIBRAS', cam: [1.2, 0.45, 3.7], target: [0, 0.05, 0] },
  card: { name: 'Cartão AR', cam: [0, 2.05, 2.75], target: [0, -0.15, 0] }
};

async function init() {
  const viewport = studio.querySelector('.studio__viewport');
  const loader = studio.querySelector('[data-studio-loader]');
  const nameEl = studio.querySelector('[data-studio-name]');
  const statsEl = studio.querySelector('[data-studio-stats]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 indisponível');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environment = envMap;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  camera.position.set(...MODEL_INFO.logo.cam);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.6;
  controls.maxDistance = 7;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 1.4;
  controls.screenSpacePanning = true;
  controls.target.set(...MODEL_INFO.logo.target);

  /* ---------- luzes ---------- */
  const ambient = new THREE.AmbientLight(0xaab4ff, 0.3);
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(3, 5, 4);
  const fill = new THREE.DirectionalLight(0x9fb4ff, 0.6);
  fill.position.set(-4, 2, 3);
  const rimA = new THREE.PointLight(0x15b0ff, 14, 10);
  rimA.position.set(-2.5, 1.5, -2.5);
  const rimB = new THREE.PointLight(0xac2fed, 12, 10);
  rimB.position.set(2.5, -0.5, -2.5);
  scene.add(ambient, key, fill, rimA, rimB);

  /* ---------- plataforma ---------- */
  const FLOOR_Y = -1.0;
  const platform = new THREE.Group();
  platform.position.y = FLOOR_Y;
  scene.add(platform);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 96),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(60,110,255,0.35)'], [0.55, 'rgba(60,60,200,0.12)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, depthWrite: false
    })
  );
  disc.rotation.x = -Math.PI / 2;
  platform.add(disc);
  const ringMat = glowBlend(new THREE.MeshBasicMaterial({ color: 0x15b0ff, transparent: true, opacity: 0.7 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.006, 8, 200), ringMat);
  ring.rotation.x = -Math.PI / 2;
  platform.add(ring);
  const ticks = new THREE.Group();
  for (let i = 0; i < 72; i++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.008, i % 6 === 0 ? 0.09 : 0.04), ringMat);
    const a = (i / 72) * Math.PI * 2;
    tick.position.set(Math.cos(a) * 1.68, 0.001, Math.sin(a) * 1.68);
    tick.rotation.set(-Math.PI / 2, 0, -a + Math.PI / 2);
    ticks.add(tick);
  }
  platform.add(ticks);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 48),
    new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(0,0,0,0.75)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  platform.add(shadow);

  /* ---------- modelos ---------- */
  const assets = await loadLogoAssets();
  const models = {};
  models.logo = await buildLogoModel();
  models.rune = await buildRuneModel(assets);
  models.card = await buildCardModel();

  const holder = new THREE.Group();
  scene.add(holder);

  /* ---------- acabamentos ---------- */
  const settings = { model: 'logo', finish: 'original', accent: new THREE.Color(0x15b0ff), explode: 0, explodeTarget: 0, studioLight: true };

  function finishMaterial(role, original) {
    const accent = settings.accent;
    switch (settings.finish) {
      case 'metal':
        if (role === 'glow') return original;
        if (role === 'side' || role === 'emblem') {
          return new THREE.MeshPhysicalMaterial({ color: accent, metalness: 1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 });
        }
        return new THREE.MeshPhysicalMaterial({ color: 0xe6eaf6, metalness: 1, roughness: 0.14, clearcoat: 0.6 });
      case 'holo':
        if (role === 'glow') return original;
        return new THREE.MeshPhysicalMaterial({
          color: role === 'side' || role === 'emblem' ? accent : 0xffffff,
          map: original.map || null,
          metalness: 0.4, roughness: 0.12,
          iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [180, 980],
          clearcoat: 1, clearcoatRoughness: 0.05,
          emissive: accent, emissiveIntensity: 0.22,
          transparent: true, opacity: role === 'side' ? 0.78 : 0.9
        });
      case 'wire':
        if (role === 'glow') return null;
        return new THREE.MeshBasicMaterial({
          color: role === 'side' || role === 'emblem' ? accent : accent.clone().lerp(new THREE.Color(0xffffff), 0.55),
          wireframe: true, transparent: true, opacity: 0.9
        });
      default:
        return original;
    }
  }

  let generated = [];
  function applyFinish() {
    generated.forEach((m) => m.dispose());
    generated = [];
    Object.values(models).forEach((model) => {
      model.originals.side?.color.copy(settings.accent);
      if (model.originals.emblem) model.originals.emblem.emissive.copy(settings.accent);
      model.originals.glow?.color.copy(settings.accent);
      model.object.traverse((o) => {
        if (!o.isMesh || !o.userData.roles) return;
        const mats = o.userData.roles.map((role) => {
          const original = model.originals[role];
          const mat = finishMaterial(role, original);
          if (mat && mat !== original) generated.push(mat);
          return mat;
        });
        o.visible = mats.every(Boolean);
        if (o.visible) o.material = mats.length === 1 ? mats[0] : mats;
      });
    });
    ringMat.color.copy(settings.accent);
    rimA.color.copy(settings.accent);
  }

  /* ---------- troca de modelo ---------- */
  let current = null;
  let transition = { phase: 'idle', t: 0, next: null };
  const camAnim = { active: false, t: 0, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3() };

  function flyCamera(info) {
    camAnim.active = true;
    camAnim.t = 0;
    camAnim.fromPos.copy(camera.position);
    camAnim.toPos.set(...info.cam);
    camAnim.fromTarget.copy(controls.target);
    camAnim.toTarget.set(...info.target);
  }

  function mountModel(id) {
    if (current) holder.remove(current.object);
    current = models[id];
    holder.add(current.object);
    current.object.scale.setScalar(0.001);
    nameEl.textContent = MODEL_INFO[id].name;
    statsEl.textContent = `${(countTriangles(current.object) / 1000).toFixed(1)}k triângulos · WebGL 2`;
    shadow.scale.setScalar(current.shadow || 1);
  }

  function selectModel(id) {
    if (!models[id] || (current === models[id] && transition.phase === 'idle')) return;
    settings.model = id;
    transition = { phase: 'out', t: 0, next: id };
    flyCamera(MODEL_INFO[id]);
  }

  applyFinish();
  mountModel('logo');
  transition = { phase: 'in', t: 0, next: null };

  /* ---------- UI ---------- */
  studio.querySelectorAll('input[name="studio-model"]').forEach((input) => {
    input.addEventListener('change', () => input.checked && selectModel(input.value));
  });
  studio.querySelectorAll('input[name="studio-finish"]').forEach((input) => {
    input.addEventListener('change', () => { if (input.checked) { settings.finish = input.value; applyFinish(); } });
  });
  studio.querySelectorAll('input[name="studio-color"]').forEach((input) => {
    input.addEventListener('change', () => { if (input.checked) { settings.accent.set(input.value); applyFinish(); } });
  });
  studio.querySelector('[data-studio-toggle="explode"]')?.addEventListener('change', (e) => {
    settings.explodeTarget = e.target.checked ? 1 : 0;
  });
  studio.querySelector('[data-studio-toggle="spotlight"]')?.addEventListener('change', (e) => {
    settings.studioLight = e.target.checked;
    scene.environment = settings.studioLight ? envMap : null;
    key.intensity = settings.studioLight ? 2.0 : 0.25;
    fill.intensity = settings.studioLight ? 0.6 : 0;
    ambient.intensity = settings.studioLight ? 0.3 : 0.08;
    rimA.intensity = settings.studioLight ? 14 : 40;
    rimB.intensity = settings.studioLight ? 12 : 36;
  });

  const autoBtn = studio.querySelector('[data-studio-action="autorotate"]');
  autoBtn.classList.toggle('is-active', controls.autoRotate);
  autoBtn.setAttribute('aria-pressed', String(controls.autoRotate));
  autoBtn.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    autoBtn.classList.toggle('is-active', controls.autoRotate);
    autoBtn.setAttribute('aria-pressed', String(controls.autoRotate));
  });
  studio.querySelector('[data-studio-action="reset"]').addEventListener('click', () => flyCamera(MODEL_INFO[settings.model]));

  const fsBtn = studio.querySelector('[data-studio-action="fullscreen"]');
  if (!document.fullscreenEnabled) {
    fsBtn.hidden = true;
  } else {
    fsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else viewport.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => fsBtn.classList.toggle('is-active', document.fullscreenElement === viewport));
  }

  // interação do usuário pausa a rotação automática por alguns segundos
  let resumeTimer = null;
  controls.addEventListener('start', () => {
    camAnim.active = false;
    if (!controls.autoRotate) return;
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { controls.autoRotate = autoBtn.classList.contains('is-active'); }, 4000);
  });

  /* ---------- resize ---------- */
  function resize() {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? 42 : 35;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(viewport);

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  const easeOutBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  let running = false;
  let visible = false;

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (transition.phase === 'out') {
      transition.t += dt / 0.22;
      current.object.scale.setScalar(Math.max(0.001, 1 - easeInOut(Math.min(1, transition.t))));
      if (transition.t >= 1) { mountModel(transition.next); transition = { phase: 'in', t: 0, next: null }; }
    } else if (transition.phase === 'in') {
      transition.t += dt / 0.6;
      current.object.scale.setScalar(Math.max(0.001, easeOutBack(Math.min(1, transition.t))));
      if (transition.t >= 1) { current.object.scale.setScalar(1); transition.phase = 'idle'; }
    }

    if (camAnim.active) {
      camAnim.t = Math.min(1, camAnim.t + dt / 0.9);
      const k = easeInOut(camAnim.t);
      camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, k);
      controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, k);
      if (camAnim.t >= 1) camAnim.active = false;
    }

    settings.explode += (settings.explodeTarget - settings.explode) * Math.min(1, dt * 6);
    Object.values(models).forEach((m) => m.update(t, settings.explode, reduced));
    ticks.rotation.y = t * 0.05;

    controls.update();
    renderer.render(scene, camera);
  }

  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) { clock.getDelta(); requestAnimationFrame(frame); }
  }
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    setRunning(visible && !document.hidden);
  }).observe(viewport);
  document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));

  loader.classList.add('is-hidden');
}

/* =========================================================
   Modelos
   ========================================================= */
async function buildLogoModel() {
  const logo = await createLogo({ word: true, depth: 0.13 });
  const object = new THREE.Group();
  const scale = 1.75 / logo.height;
  logo.root.scale.setScalar(scale);
  object.add(logo.root);
  logo.parts.glow.userData.roles = ['glow'];
  logo.parts.word.userData.roles = ['wordCap', 'side'];

  const base = {
    icon: logo.parts.icon.position.clone(),
    glow: logo.parts.glow.position.clone(),
    word: logo.parts.word.position.clone()
  };
  return {
    object,
    shadow: 1,
    originals: { cap: logo.materials.cap, side: logo.materials.side, glow: logo.materials.glow, wordCap: logo.materials.wordCap },
    update(t, explode, reduced) {
      object.position.y = reduced ? 0 : Math.sin(t * 1.1) * 0.04;
      logo.parts.glow.position.z = base.glow.z - explode * 0.45;
      logo.parts.word.position.z = base.word.z + explode * 0.35;
      logo.parts.word.position.y = base.word.y - explode * 0.12;
      logo.parts.icon.position.z = base.icon.z + explode * 0.08;
    }
  };
}

function stoneTextures() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#56653a';
  g.fillRect(0, 0, size, size);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 2600; i++) {
    const r = 2 + rnd() * 24;
    const l = 18 + rnd() * 22;
    g.fillStyle = `hsla(${75 + rnd() * 30}, ${14 + rnd() * 20}%, ${l}%, ${0.06 + rnd() * 0.18})`;
    g.beginPath();
    g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(${rnd() > 0.5 ? '230,240,200' : '20,26,12'},${0.08 + rnd() * 0.2})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    let x = rnd() * size;
    let y = rnd() * size;
    g.strokeStyle = `rgba(15,20,8,${0.35 + rnd() * 0.3})`;
    g.lineWidth = 0.8 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rnd() - 0.5) * 70;
      y += (rnd() - 0.5) * 70;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(c);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

async function buildRuneModel(assets) {
  const { map, bump } = stoneTextures();
  const stoneMat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 3, roughness: 0.88, metalness: 0.02, color: 0xc9d4b0 });
  const emblemMat = new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: 0x15b0ff, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 });
  const object = new THREE.Group();

  const W = 1.05, H = 1.35, D = 0.22;
  const stone = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 6, 0.09), stoneMat);
  stone.userData.roles = ['stone'];
  object.add(stone);

  // moldura interna em relevo
  const frameShape = new THREE.Shape();
  const fw = W * 0.78, fh = H * 0.8, r = 0.08;
  frameShape.moveTo(-fw / 2 + r, -fh / 2);
  frameShape.lineTo(fw / 2 - r, -fh / 2); frameShape.quadraticCurveTo(fw / 2, -fh / 2, fw / 2, -fh / 2 + r);
  frameShape.lineTo(fw / 2, fh / 2 - r); frameShape.quadraticCurveTo(fw / 2, fh / 2, fw / 2 - r, fh / 2);
  frameShape.lineTo(-fw / 2 + r, fh / 2); frameShape.quadraticCurveTo(-fw / 2, fh / 2, -fw / 2, fh / 2 - r);
  frameShape.lineTo(-fw / 2, -fh / 2 + r); frameShape.quadraticCurveTo(-fw / 2, -fh / 2, -fw / 2 + r, -fh / 2);
  const hole = new THREE.Path();
  const iw = fw - 0.06, ih = fh - 0.06, ir = 0.06;
  hole.moveTo(-iw / 2 + ir, -ih / 2);
  hole.quadraticCurveTo(-iw / 2, -ih / 2, -iw / 2, -ih / 2 + ir); hole.lineTo(-iw / 2, ih / 2 - ir);
  hole.quadraticCurveTo(-iw / 2, ih / 2, -iw / 2 + ir, ih / 2); hole.lineTo(iw / 2 - ir, ih / 2);
  hole.quadraticCurveTo(iw / 2, ih / 2, iw / 2, ih / 2 - ir); hole.lineTo(iw / 2, -ih / 2 + ir);
  hole.quadraticCurveTo(iw / 2, -ih / 2, iw / 2 - ir, -ih / 2); hole.lineTo(-iw / 2 + ir, -ih / 2);
  frameShape.holes.push(hole);
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }), stoneMat);
  frame.position.z = D / 2 - 0.004;
  frame.userData.roles = ['stone'];
  object.add(frame);

  // mão (silhueta do logo) em relevo luminoso
  const icon = assets.shape.icon;
  const emblemGeo = extrude(shapesFrom(icon.shapes), { depth: 0.05, bevel: 0.008 });
  emblemGeo.computeBoundingBox();
  const bb = emblemGeo.boundingBox;
  const eh = bb.max.y - bb.min.y;
  const emblem = new THREE.Mesh(emblemGeo, emblemMat);
  const s = (H * 0.66) / eh;
  emblem.scale.setScalar(s);
  emblem.position.set(-((bb.min.x + bb.max.x) / 2) * s, -((bb.min.y + bb.max.y) / 2) * s, D / 2 + 0.02);
  emblem.userData.roles = ['emblem'];
  const emblemPivot = new THREE.Group();
  emblemPivot.add(emblem);
  object.add(emblemPivot);

  const glowLight = new THREE.PointLight(0x15b0ff, 1.6, 2.2);
  glowLight.position.set(0, 0, D / 2 + 0.5);
  object.add(glowLight);

  const halo = new THREE.Sprite(glowBlend(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(120,210,255,0.55)'], [1, 'rgba(0,0,0,0)']]), transparent: true
  })));
  halo.scale.set(1.5, 1.5, 1);
  halo.position.z = D / 2 + 0.05;
  object.add(halo);

  object.rotation.x = -0.08;
  return {
    object,
    shadow: 1.05,
    originals: { stone: stoneMat, emblem: emblemMat },
    update(t, explode, reduced) {
      object.position.y = reduced ? 0 : Math.sin(t * 1.1 + 1) * 0.04;
      emblemPivot.position.z = explode * 0.4;
      const pulse = reduced ? 1 : 0.85 + Math.sin(t * 2.2) * 0.25;
      emblemMat.emissiveIntensity = 0.55 * pulse;
      glowLight.color.copy(emblemMat.emissive);
      glowLight.intensity = 1.6 * pulse;
      halo.material.color.copy(emblemMat.emissive).lerp(new THREE.Color(0xffffff), 0.4);
      halo.material.opacity = 0.45 * pulse;
      halo.position.z = D / 2 + 0.05 + explode * 0.4;
    }
  };
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

async function buildCardModel() {
  const cardTex = await loadTexture(new URL('../img/ar-card.webp', import.meta.url).href);
  const W = 1.2, H = 1.5, D = 0.02;
  const object = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x15b0ff, metalness: 0.5, roughness: 0.35 });
  const faceMat = new THREE.MeshPhysicalMaterial({ map: cardTex, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x0b0f35, roughness: 0.6 });

  const cardRig = new THREE.Group();
  cardRig.rotation.x = -Math.PI / 2;
  object.add(cardRig);

  const shape = roundedRect(W, H, 0.05);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 8 }), [backMat, bodyMat]);
  body.position.z = -D / 2;
  body.userData.roles = ['back', 'side'];
  cardRig.add(body);

  const faceGeo = new THREE.ShapeGeometry(shape, 8);
  const pos = faceGeo.attributes.position;
  const uv = faceGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W + 0.5, pos.getY(i) / H + 0.5);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.z = D / 2 + 0.0045;
  face.userData.roles = ['face'];
  cardRig.add(face);

  // logo 3D "saltando" do cartão, como na experiência AR
  const logo = await createLogo({ word: false, depth: 0.12 });
  const logoScale = 0.85 / logo.height;
  logo.root.scale.setScalar(logoScale);
  logo.parts.glow.userData.roles = ['glow'];
  const logoPivot = new THREE.Group();
  logoPivot.add(logo.root);
  const printedY = H / 2 - (440 / 1250) * H; // centro do logo impresso no cartão
  logoPivot.position.set(0, 0.48, -printedY);
  object.add(logoPivot);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 0.5, 48, 1, true),
    glowBlend(new THREE.MeshBasicMaterial({
      color: 0x15b0ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide
    }))
  );
  beam.position.set(0, 0.25, -printedY);
  object.add(beam);

  object.position.y = -0.82;
  return {
    object,
    shadow: 1.45,
    originals: { face: faceMat, side: bodyMat, back: backMat, cap: logo.materials.cap, glow: logo.materials.glow },
    update(t, explode, reduced) {
      logoPivot.position.y = 0.5 + (reduced ? 0 : Math.sin(t * 1.4) * 0.04) + explode * 0.35;
      logoPivot.rotation.y = reduced ? 0 : Math.sin(t * 0.7) * 0.5;
      beam.material.opacity = 0.1 + (reduced ? 0 : Math.sin(t * 2) * 0.03);
      beam.scale.y = 1 + explode * 0.7;
      beam.position.y = 0.25 + explode * 0.17;
    }
  };
}
