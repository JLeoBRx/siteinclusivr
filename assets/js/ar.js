/* =========================================================
   InclusiVR — Realidade Aumentada com MindAR
   Modo Cartão (image tracking) e Modo Selfie (face tracking),
   com manipulação por toque: girar, pinça e torção.
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLogo, radialTexture, glowBlend } from './logo3d.js';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

const ui = {
  intro: $('[data-screen="intro"]'),
  stage: $('[data-screen="stage"]'),
  container: $('#ar-container'),
  gestures: $('[data-gestures]'),
  status: $('[data-status]'),
  statusText: $('[data-status-text]'),
  scan: $('[data-scan]'),
  tip: $('[data-tip]'),
  loading: $('[data-loading]'),
  loadingText: $('[data-loading-text]'),
  switchBtn: $('[data-switch]'),
  standBtn: $('[data-tool="stand"]'),
  spinBtn: $('[data-tool="spin"]')
};

const CARD = { width: 1000, height: 1250, logoCenterY: 440 }; // px do cartão impresso
const WA_TEXT = 'Olá, InclusiVR! Acabei de ver o logo de vocês em realidade aumentada e gostaria de saber mais.';
$$('[data-wa]').forEach((a) => a.setAttribute('href', `https://wa.me/5516994002335?text=${encodeURIComponent(WA_TEXT)}`));

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let session = null;
let busy = false;

/* ---------- estado de manipulação ---------- */
const manip = {
  yaw: 0, pitch: 0, twist: 0, scale: 1,
  cur: { yaw: 0, pitch: 0, twist: 0, scale: 1 },
  spin: false, stand: false, standT: 0
};
function resetManip() {
  manip.yaw = 0; manip.pitch = 0; manip.twist = 0; manip.scale = 1;
}

/* ---------- inclinação do aparelho (define "em pé" automaticamente no Android) ---------- */
let deviceBeta = null;
if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
  window.addEventListener('deviceorientation', (e) => { if (e.beta !== null) deviceBeta = e.beta; }, { passive: true });
}

/* =========================================================
   Sessões
   ========================================================= */
async function start(mode) {
  if (busy) return;
  if (!window.isSecureContext) {
    showError('Conexão segura necessária', 'A câmera só pode ser usada em páginas HTTPS. Acesse o site pelo endereço seguro e tente novamente.');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Navegador não compatível', 'Seu navegador não permite acesso à câmera. Tente o Chrome, Safari ou Edge atualizados.');
    return;
  }
  busy = true;
  $$('[data-start]').forEach((b) => { b.disabled = true; });
  ui.intro.hidden = true;
  ui.stage.hidden = false;
  document.body.classList.add('is-ar-running');
  ui.loading.classList.remove('is-hidden');
  ui.loadingText.textContent = mode === 'image' ? 'Carregando o rastreador do Cartão AR…' : 'Carregando o rastreamento facial…';
  setStatus('Iniciando câmera…', false);
  ui.scan.hidden = true;
  ui.tip.hidden = true;
  resetManip();
  manip.stand = false;
  manip.standT = 0;
  syncTools(mode);

  try {
    session = mode === 'image' ? await startImage() : await startFace();
    ui.loading.classList.add('is-hidden');
    if (mode === 'image') {
      ui.scan.hidden = false;
      setStatus('Procurando o Cartão AR…', false);
    } else {
      setStatus('Procurando seu rosto…', false);
    }
  } catch (err) {
    console.warn('[ar]', err);
    stopSession();
    ui.stage.hidden = true;
    document.body.classList.remove('is-ar-running');
    ui.intro.hidden = false;
    const denied = await cameraDenied();
    if (denied) {
      showError('Permissão da câmera negada', 'Autorize o acesso à câmera nas configurações do navegador para este site e tente novamente.');
    } else if (mode === 'face') {
      showError('Não foi possível iniciar o Modo Selfie', 'Verifique se a câmera frontal está disponível e se há conexão com a internet (o modelo de rastreamento facial é baixado na primeira vez).');
    } else {
      showError('Não foi possível acessar a câmera', 'Verifique se nenhum outro aplicativo está usando a câmera e se o acesso foi autorizado no navegador.');
    }
  } finally {
    busy = false;
    $$('[data-start]').forEach((b) => { b.disabled = false; });
  }
}

async function cameraDenied() {
  try {
    const p = await navigator.permissions.query({ name: 'camera' });
    return p.state === 'denied';
  } catch (e) { return false; }
}

function setupRenderer(renderer, scene, maxDpr) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1050, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.5, 1, 1.5);
  scene.add(key);
}

/* Conteúdo 3D compartilhado entre os modos. */
async function buildContent({ height }) {
  const logo = await createLogo({ word: true, depth: 0.12 });
  const s = height / logo.height;
  logo.root.scale.setScalar(s);

  const content = new THREE.Group();
  const standPivot = new THREE.Group();
  const lift = new THREE.Group();
  const manipGroup = new THREE.Group();
  const intro = new THREE.Group();
  content.add(standPivot);
  standPivot.add(lift);
  lift.add(manipGroup);
  manipGroup.add(intro);
  intro.add(logo.root);

  return { logo, content, standPivot, lift, manipGroup, intro, height };
}

function applyManip(c, dt) {
  const k = 1 - Math.pow(0.0005, dt);
  if (manip.spin && !reduced) manip.yaw += dt * 0.9;
  manip.cur.yaw += (manip.yaw - manip.cur.yaw) * k;
  manip.cur.pitch += (manip.pitch - manip.cur.pitch) * k;
  manip.cur.twist += (manip.twist - manip.cur.twist) * k;
  manip.cur.scale += (manip.scale - manip.cur.scale) * k;
  c.manipGroup.rotation.set(manip.cur.pitch, manip.cur.yaw, manip.cur.twist, 'ZXY');
  c.manipGroup.scale.setScalar(manip.cur.scale);
}

const easeOutBack = (x) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);

/* ---------- Modo Cartão AR ---------- */
async function startImage() {
  const { MindARThree } = await import('../vendor/mindar/mindar-image-three.prod.js');
  const mindar = new MindARThree({
    container: ui.container,
    imageTargetSrc: 'assets/ar/inclusivr-ar-card.mind',
    uiLoading: 'no', uiScanning: 'no', uiError: 'no',
    filterMinCF: 0.0005, filterBeta: 100, maxTrack: 1
  });
  const { renderer, scene, camera } = mindar;
  setupRenderer(renderer, scene, 2);

  const anchor = mindar.addAnchor(0);
  const c = await buildContent({ height: 0.66 });
  const cardH = CARD.height / CARD.width;
  c.content.position.set(0, cardH / 2 - CARD.logoCenterY / CARD.width, 0);
  anchor.group.add(c.content);

  // emissor holográfico sobre o cartão
  const fx = new THREE.Group();
  c.content.add(fx);
  const disc = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    glowBlend(new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(90,170,255,0.75)'], [0.5, 'rgba(110,80,255,0.25)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true
    }))
  );
  disc.position.z = 0.002;
  fx.add(disc);
  const ringMat = glowBlend(new THREE.MeshBasicMaterial({ color: 0x15b0ff, transparent: true, opacity: 0.9 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.004, 8, 160), ringMat);
  ring.position.z = 0.004;
  fx.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.002, 8, 160), ringMat.clone());
  ring2.material.color.set(0xac2fed);
  ring2.position.z = 0.004;
  fx.add(ring2);
  const sparks = makeSparks(70, 0.3);
  fx.add(sparks.points);

  let found = false;
  let appear = 0;
  let firstFound = true;
  anchor.onTargetFound = () => {
    found = true;
    appear = 0;
    ui.scan.hidden = true;
    setStatus('Cartão detectado', true);
    if (firstFound) {
      firstFound = false;
      if (deviceBeta !== null && deviceBeta < 45) setStand(true);
      showTip();
    }
  };
  anchor.onTargetLost = () => {
    found = false;
    ui.scan.hidden = false;
    setStatus('Procurando o Cartão AR…', false);
  };

  await mindar.start();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (found) appear = Math.min(1, appear + dt / 0.9);
    const k = reduced ? 1 : easeOutBack(appear);

    manip.standT += ((manip.stand ? 1 : 0) - manip.standT) * Math.min(1, dt * 5);
    const st = manip.standT;
    c.standPivot.rotation.x = st * Math.PI / 2;
    // deitado: flutua à frente do cartão · em pé: apoia a base no cartão
    c.lift.position.set(0, st * (c.height / 2 + 0.03), (1 - st) * 0.2);
    c.intro.scale.setScalar(Math.max(0.001, k));
    c.intro.rotation.y = (1 - Math.min(1, appear * 1.2)) * Math.PI * 2;
    c.intro.position.y = reduced ? 0 : Math.sin(t * 1.6) * 0.012;
    applyManip(c, dt);

    ring.rotation.z = t * 0.6;
    ring2.rotation.z = -t * 0.4;
    const pulse = 1 + Math.sin(t * 2.2) * 0.03;
    ring.scale.setScalar(k * pulse);
    ring2.scale.setScalar(k * (2 - pulse));
    disc.material.opacity = 0.75 * Math.min(1, appear * 2);
    sparks.update(t, dt);

    renderer.render(scene, camera);
  });

  return { mode: 'image', mindar, renderer, scene, camera };
}

/* ---------- Modo Selfie (rastreamento facial) ---------- */
async function startFace() {
  const { MindARThree } = await import('../vendor/mindar/mindar-face-three.prod.js');
  const mindar = new MindARThree({
    container: ui.container,
    uiLoading: 'no', uiScanning: 'no', uiError: 'no',
    filterMinCF: 0.0005, filterBeta: 10
  });
  const { renderer, scene, camera } = mindar;
  setupRenderer(renderer, scene, 1.5);

  // ponto 10 = topo da testa; unidades ≈ largura do rosto
  const anchor = mindar.addAnchor(10);
  const LOGO_H = 0.78;
  const c = await buildContent({ height: LOGO_H });
  // posições candidatas: acima da cabeça, ao lado do rosto e sobre os ombros —
  // mantemos a atual enquanto couber na tela e trocamos só quando necessário
  const spots = [
    new THREE.Vector3(0, 0.85, -0.35),
    new THREE.Vector3(0.95, -0.15, -0.3), new THREE.Vector3(-0.95, -0.15, -0.3),
    new THREE.Vector3(0.85, -1.35, -0.3), new THREE.Vector3(-0.85, -1.35, -0.3)
  ];
  c.content.position.copy(spots[0]);
  anchor.group.add(c.content);
  const probe = new THREE.Vector3();
  const halfH = LOGO_H * 0.55;
  const halfW = LOGO_H * 0.42;
  function overflow(spot) {
    const canvasW = parseFloat(renderer.domElement.style.width) || ui.container.clientWidth;
    const canvasH = parseFloat(renderer.domElement.style.height) || ui.container.clientHeight;
    const visX = Math.min(1, ui.container.clientWidth / canvasW);
    const visY = Math.min(1, ui.container.clientHeight / canvasH);
    const top = visY - (90 * 2) / canvasH;
    const bottom = -visY + (130 * 2) / canvasH;
    const side = visX - (12 * 2) / canvasW;
    let worst = 0;
    for (const [dx, dy] of [[0, halfH], [0, -halfH], [halfW, 0], [-halfW, 0]]) {
      probe.set(spot.x + dx, spot.y + dy, spot.z);
      anchor.group.localToWorld(probe).project(camera);
      worst = Math.max(worst, probe.y - top, bottom - probe.y, Math.abs(probe.x) - side);
    }
    return worst;
  }
  let spot = spots[0];
  function chooseSpot(current) {
    const currentOverflow = overflow(current);
    if (currentOverflow <= 0) return current;
    let best = current;
    let bestScore = currentOverflow - 0.15; // histerese: evita alternar entre posições
    for (const candidate of spots) {
      if (candidate === current) continue;
      const o = overflow(candidate);
      if (o <= 0) return candidate;
      if (o < bestScore) { bestScore = o; best = candidate; }
    }
    return best;
  }

  const halo = new THREE.Sprite(glowBlend(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(90,150,255,0.6)'], [1, 'rgba(0,0,0,0)']]), transparent: true
  })));
  halo.scale.set(1.3, 1.3, 1);
  halo.position.z = -0.15;
  c.content.add(halo);
  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.005, 8, 180),
    glowBlend(new THREE.MeshBasicMaterial({ color: 0x15b0ff, transparent: true, opacity: 0.85 }))
  );
  orbit.rotation.x = Math.PI / 2.3;
  c.content.add(orbit);
  const sparks = makeSparks(50, 0.55, true);
  c.content.add(sparks.points);

  await mindar.start();

  // o MindAR dimensiona o canvas na resolução da câmera e o estica via CSS;
  // compensamos com o pixel ratio para o logo continuar nítido
  const sharpen = () => {
    const v = ui.container.querySelector('video');
    if (!v || !v.videoWidth) return;
    const cssW = parseFloat(renderer.domElement.style.width) || v.videoWidth;
    const ratio = Math.min(2.5, (cssW / v.videoWidth) * Math.min(window.devicePixelRatio || 1, 2));
    renderer.setPixelRatio(ratio);
    renderer.setSize(v.videoWidth, v.videoHeight, false);
  };
  const onResize = () => setTimeout(sharpen, 0);
  sharpen();
  window.addEventListener('resize', onResize);

  let seen = false;
  let appear = 0;
  let firstFound = true;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const visible = anchor.group.visible;
    if (visible !== seen) {
      seen = visible;
      if (visible) {
        appear = 0;
        setStatus('Rosto detectado', true);
        if (firstFound) { firstFound = false; showTip(); }
      } else {
        setStatus('Procurando seu rosto…', false);
      }
    }
    if (seen) {
      appear = Math.min(1, appear + dt / 0.9);
      const next = chooseSpot(spot);
      if (next !== spot && appear < 0.2) c.content.position.copy(next);
      spot = next;
      c.content.position.lerp(spot, Math.min(1, dt * 4));
    }
    const k = reduced ? 1 : easeOutBack(appear);
    c.intro.scale.setScalar(Math.max(0.001, k));
    c.intro.rotation.y = (1 - Math.min(1, appear * 1.2)) * Math.PI * 2;
    c.intro.position.y = reduced ? 0 : Math.sin(t * 1.5) * 0.04;
    applyManip(c, dt);
    orbit.rotation.z = t * 0.8;
    orbit.scale.setScalar(k);
    halo.material.opacity = 0.8 * Math.min(1, appear * 2);
    sparks.update(t, dt);
    renderer.render(scene, camera);
  });

  return { mode: 'face', mindar, renderer, scene, camera, cleanup: () => window.removeEventListener('resize', onResize) };
}

/* Partículas que sobem do emissor. */
function makeSparks(count, radius, sphere = false) {
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = glowBlend(new THREE.PointsMaterial({
    size: sphere ? 0.035 : 0.018,
    map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(120,200,255,0.8)'], [1, 'rgba(0,0,0,0)']], 64),
    transparent: true, color: 0x9fdcff
  }));
  const points = new THREE.Points(geo, mat);
  return {
    points,
    update(t) {
      for (let i = 0; i < count; i++) {
        const s = seeds[i];
        const life = (t * (0.25 + s * 0.35) + s) % 1;
        const a = s * Math.PI * 2 * 7 + t * 0.3;
        const r = radius * (0.35 + 0.65 * ((s * 13.7) % 1));
        if (sphere) {
          pos[i * 3] = Math.cos(a) * r;
          pos[i * 3 + 1] = (life - 0.5) * 1.2;
          pos[i * 3 + 2] = Math.sin(a) * r * 0.6;
        } else {
          pos[i * 3] = Math.cos(a) * r * (1 - life * 0.5);
          pos[i * 3 + 1] = Math.sin(a) * r * (1 - life * 0.5);
          pos[i * 3 + 2] = life * 0.55;
        }
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.9;
    }
  };
}

function stopSession() {
  if (!session) { ui.container.innerHTML = ''; return; }
  try { session.renderer.setAnimationLoop(null); } catch (e) { /* ignore */ }
  try { session.cleanup?.(); } catch (e) { /* ignore */ }
  try { session.mindar.stop(); } catch (e) { /* ignore */ }
  try { session.renderer.dispose(); } catch (e) { /* ignore */ }
  ui.container.innerHTML = '';
  session = null;
}

/* =========================================================
   Interface
   ========================================================= */
function setStatus(text, tracking) {
  ui.statusText.textContent = text;
  ui.status.classList.toggle('is-tracking', !!tracking);
}

let tipTimer = null;
function showTip() {
  ui.tip.hidden = false;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { ui.tip.hidden = true; }, 6000);
}

function syncTools(mode) {
  ui.standBtn.hidden = mode !== 'image';
  setStand(false);
  ui.spinBtn.setAttribute('aria-pressed', String(manip.spin));
  $('use', ui.switchBtn).setAttribute('href', mode === 'image' ? '#i-user' : '#i-layers');
  ui.switchBtn.setAttribute('aria-label', mode === 'image' ? 'Trocar para o Modo Selfie' : 'Trocar para o Modo Cartão AR');
  ui.switchBtn.title = ui.switchBtn.getAttribute('aria-label');
}

function setStand(on) {
  manip.stand = on;
  ui.standBtn.setAttribute('aria-pressed', String(on));
}

function showError(title, text) {
  $('[data-error-title]').textContent = title;
  $('[data-error-text]').textContent = text;
  openModal('error');
}

function openModal(name) {
  const m = $(`[data-modal="${name}"]`);
  m.hidden = false;
  const focusable = $('button, a', m);
  if (focusable) focusable.focus();
}
function closeModals() {
  $$('[data-modal]').forEach((m) => {
    if (m.hidden) return;
    m.hidden = true;
    if (m.dataset.modal === 'photo') {
      const img = $('[data-photo]', m);
      if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    }
  });
}

$$('[data-start]').forEach((btn) => btn.addEventListener('click', () => start(btn.dataset.start)));
$('[data-open-card]').addEventListener('click', () => openModal('card'));
$$('[data-close-modal]').forEach((b) => b.addEventListener('click', closeModals));
$$('[data-modal]').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

$('[data-exit]').addEventListener('click', () => {
  stopSession();
  ui.stage.hidden = true;
  document.body.classList.remove('is-ar-running');
  ui.intro.hidden = false;
});
ui.switchBtn.addEventListener('click', async () => {
  if (!session || busy) return;
  const next = session.mode === 'image' ? 'face' : 'image';
  stopSession();
  start(next);
});
ui.standBtn.addEventListener('click', () => setStand(!manip.stand));
ui.spinBtn.addEventListener('click', () => {
  manip.spin = !manip.spin;
  ui.spinBtn.setAttribute('aria-pressed', String(manip.spin));
});
$('[data-tool="reset"]').addEventListener('click', resetManip);
$('[data-tool="photo"]').addEventListener('click', takePhoto);

/* ---------- gestos ---------- */
const pointers = new Map();
let base = null;
let lastTap = { t: 0, x: 0, y: 0 };
let downInfo = null;

function snapshot() {
  const pts = Array.from(pointers.values());
  if (pts.length >= 2) {
    const [a, b] = pts;
    base = {
      type: 'multi',
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      scale: manip.scale,
      twist: manip.twist
    };
  } else if (pts.length === 1) {
    base = { type: 'single', x: pts[0].x, y: pts[0].y, yaw: manip.yaw, pitch: manip.pitch };
  } else {
    base = null;
  }
}

ui.gestures.addEventListener('pointerdown', (e) => {
  ui.gestures.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  downInfo = pointers.size === 1 ? { t: performance.now(), x: e.clientX, y: e.clientY } : null;
  snapshot();
});
ui.gestures.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!base) return;
  const pts = Array.from(pointers.values());
  if (base.type === 'single' && pts.length === 1) {
    const dx = pts[0].x - base.x;
    const dy = pts[0].y - base.y;
    manip.yaw = base.yaw + dx * 0.012;
    manip.pitch = THREE.MathUtils.clamp(base.pitch + dy * 0.008, -1.3, 1.3);
  } else if (base.type === 'multi' && pts.length >= 2) {
    const [a, b] = pts;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    manip.scale = THREE.MathUtils.clamp(base.scale * (dist / base.dist), 0.35, 3.2);
    manip.twist = base.twist - (angle - base.angle);
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (downInfo && pointers.size === 0) {
    const dt = performance.now() - downInfo.t;
    const moved = Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y);
    if (dt < 250 && moved < 12) {
      const now = performance.now();
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
        resetManip();
        lastTap.t = 0;
      } else {
        lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  }
  snapshot();
}
ui.gestures.addEventListener('pointerup', endPointer);
ui.gestures.addEventListener('pointercancel', endPointer);
ui.gestures.addEventListener('wheel', (e) => {
  e.preventDefault();
  manip.scale = THREE.MathUtils.clamp(manip.scale * Math.exp(-e.deltaY * 0.0015), 0.35, 3.2);
}, { passive: false });

/* ---------- foto ---------- */
const markImg = new Image();
markImg.src = 'assets/img/logo-mark.png';

async function takePhoto() {
  if (!session) return;
  const { renderer, scene, camera } = session;
  const video = ui.container.querySelector('video');
  const gl = renderer.domElement;
  const cr = ui.container.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const out = document.createElement('canvas');
  out.width = Math.round(cr.width * scale);
  out.height = Math.round(cr.height * scale);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out.width, out.height);

  const drawCovered = (el, source, mirrored) => {
    const r = el.getBoundingClientRect();
    const x = (r.left - cr.left) * scale;
    const y = (r.top - cr.top) * scale;
    const w = r.width * scale;
    const h = r.height * scale;
    ctx.save();
    if (mirrored) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(source, 0, 0, w, h); }
    else ctx.drawImage(source, x, y, w, h);
    ctx.restore();
  };

  if (video && video.readyState >= 2) {
    const mirrored = /matrix\(-1/.test(getComputedStyle(video).transform);
    drawCovered(video, video, mirrored);
  }
  renderer.render(scene, camera); // garante o buffer atualizado no mesmo frame
  drawCovered(gl, gl, false);

  // assinatura
  const pad = 18 * scale;
  const markH = 34 * scale;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8 * scale;
  if (markImg.complete && markImg.naturalWidth) {
    const markW = markH * (markImg.naturalWidth / markImg.naturalHeight);
    ctx.drawImage(markImg, pad, out.height - pad - markH, markW, markH);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${16 * scale}px Sora, Inter, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('InclusiVR', pad + markW + 8 * scale, out.height - pad - markH / 2 - 7 * scale);
    ctx.font = `500 ${11 * scale}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Realidade Aumentada', pad + markW + 8 * scale, out.height - pad - markH / 2 + 10 * scale);
  }
  ctx.restore();

  const flash = document.createElement('div');
  flash.className = 'ar-flash';
  ui.stage.appendChild(flash);
  setTimeout(() => flash.remove(), 500);

  const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const modal = $('[data-modal="photo"]');
  $('[data-photo]', modal).src = url;
  $('[data-photo-download]', modal).href = url;
  const shareBtn = $('[data-photo-share]', modal);
  const file = new File([blob], 'InclusiVR-AR.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    shareBtn.hidden = false;
    shareBtn.onclick = () => navigator.share({ files: [file], title: 'InclusiVR em Realidade Aumentada', text: 'Olha o logo da InclusiVR em AR!' }).catch(() => {});
  } else {
    shareBtn.hidden = true;
  }
  openModal('photo');
}

/* ---------- QR Code (desktop) ---------- */
window.addEventListener('load', () => {
  const el = $('[data-qr]');
  const panel = $('[data-qr-panel]');
  if (!el || typeof window.qrcode !== 'function') return;
  const url = new URL(el.dataset.qr, window.location.href);
  if (!/^https?:$/.test(url.protocol)) { panel.hidden = true; return; }
  const qr = window.qrcode(0, 'M');
  qr.addData(url.href);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
});

/* Encerra a câmera ao sair da página. */
window.addEventListener('pagehide', stopSession);
