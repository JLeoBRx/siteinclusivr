/* =========================================================
   InclusiVR — cena 3D do hero
   Logo extrudado, anéis orbitais e campo de partículas.
   ========================================================= */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLogo, radialTexture, glowBlend } from './logo3d.js';

const canvas = document.getElementById('hero-canvas');
const stage = document.querySelector('[data-hero-stage]');
const hint = document.querySelector('[data-hero-hint]');
const hero = canvas?.closest('.hero');

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) { return false; }
}

if (canvas && stage && hero && webglAvailable()) init().catch((err) => console.warn('[hero3d]', err));

async function init() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = window.matchMedia('(max-width: 900px)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.6 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  /* ---------- luzes ---------- */
  scene.add(new THREE.AmbientLight(0x8090ff, 0.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 4, 6);
  scene.add(key);
  const rimBlue = new THREE.PointLight(0x15b0ff, 30, 12);
  rimBlue.position.set(-3, 1.5, -1.5);
  scene.add(rimBlue);
  const rimPurple = new THREE.PointLight(0xac2fed, 26, 12);
  rimPurple.position.set(3, -2, -1);
  scene.add(rimPurple);

  /* ---------- grupo principal (posicionado sobre o "stage") ---------- */
  const rig = new THREE.Group();
  scene.add(rig);
  const spinner = new THREE.Group();
  rig.add(spinner);

  const logo = await createLogo({ word: false, depth: 0.12 });
  logo.root.scale.setScalar(2.3);
  spinner.add(logo.root);

  // halo atrás do logo
  const halo = new THREE.Sprite(glowBlend(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(70,120,255,0.55)'], [0.45, 'rgba(90,60,230,0.18)'], [1, 'rgba(0,0,0,0)']]), transparent: true
  })));
  halo.scale.set(5.2, 5.2, 1);
  halo.position.z = -1.2;
  rig.add(halo);

  /* ---------- anéis orbitais ---------- */
  const rings = new THREE.Group();
  rig.add(rings);
  const ringDefs = [
    { r: 1.75, color: 0x15b0ff, opacity: 0.55, rot: [1.2, 0.2, 0], speed: 0.18 },
    { r: 2.05, color: 0xac2fed, opacity: 0.4, rot: [1.45, -0.5, 0.3], speed: -0.12 },
    { r: 2.35, color: 0x7b5cff, opacity: 0.22, rot: [1.0, 0.6, -0.2], speed: 0.08 }
  ];
  ringDefs.forEach((d) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(d.r, 0.006, 8, 240),
      glowBlend(new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: d.opacity }))
    );
    ring.rotation.set(...d.rot);
    ring.userData.speed = d.speed;
    // satélite brilhante em cada anel
    const sat = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    );
    sat.position.x = d.r;
    const satGlow = new THREE.Sprite(glowBlend(new THREE.SpriteMaterial({
      map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.2, `rgba(${d.color >> 16},${(d.color >> 8) & 255},${d.color & 255},0.6)`], [1, 'rgba(0,0,0,0)']], 64), transparent: true
    })));
    satGlow.scale.set(0.45, 0.45, 1);
    sat.add(satGlow);
    ring.add(sat);
    rings.add(ring);
  });

  /* ---------- partículas ---------- */
  const COUNT = mobile ? 650 : 1400;
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  const colors = new Float32Array(COUNT * 3);
  const palette = [new THREE.Color(0x15b0ff), new THREE.Color(0x7b5cff), new THREE.Color(0xac2fed), new THREE.Color(0xdde6ff)];
  for (let i = 0; i < COUNT; i++) {
    const r = 2.2 + Math.pow(Math.random(), 0.7) * 9;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.6;
    positions[i * 3 + 1] = r * Math.cos(phi) * 0.9;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 3;
    seeds[i] = Math.random();
    const c = palette[(Math.random() * palette.length) | 0];
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const pMat = glowBlend(new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 }, uPixel: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */`
      attribute float seed;
      attribute vec3 color;
      uniform float uTime;
      uniform float uPixel;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y += sin(uTime * 0.25 + seed * 40.0) * 0.12;
        p.x += cos(uTime * 0.2 + seed * 30.0) * 0.08;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.55 + 0.45 * sin(uTime * (0.8 + seed * 1.6) + seed * 60.0);
        vAlpha = tw;
        vColor = color;
        gl_PointSize = (1.2 + seed * 2.6) * uPixel * (9.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, a * vAlpha * 0.9);
      }`
  }));
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  /* ---------- layout: projeta o "stage" do HTML no mundo 3D ---------- */
  let width = 1, height = 1, baseScale = 1;
  function layout() {
    const rect = hero.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const px2w = visH / height;
    const cx = s.left - rect.left + s.width / 2;
    const cy = s.top - rect.top + s.height / 2;
    rig.position.set((cx - width / 2) * px2w, -(cy - height / 2) * px2w, 0);
    const target = Math.min(s.height * 0.62, s.width * 1.05) * px2w;
    baseScale = target / (logo.height * 2.3);
    rig.scale.setScalar(baseScale);
    pMat.uniforms.uPixel.value = renderer.getPixelRatio();
  }
  layout();
  new ResizeObserver(layout).observe(hero);

  /* ---------- interação ---------- */
  const state = {
    yaw: 0, pitch: 0, vYaw: 0, vPitch: 0, user: 0, dragging: false,
    lastX: 0, lastY: 0, lastInteract: -10, hoverX: 0, hoverY: 0, tiltX: 0, tiltY: 0
  };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function hitsLogo(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    // área de captura generosa: esfera ao redor do logo
    const center = new THREE.Vector3();
    rig.getWorldPosition(center);
    const radius = logo.height * 2.3 * baseScale * 0.62;
    return raycaster.ray.distanceSqToPoint(center) < radius * radius;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!hitsLogo(e)) return;
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    if (hint) hint.classList.add('is-hidden');
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.hoverX = ((e.clientX - r.left) / r.width) * 2 - 1;
    state.hoverY = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (state.dragging) {
      const dx = e.clientX - state.lastX;
      const dy = e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.vYaw = dx * 0.008;
      state.vPitch = dy * 0.005;
      state.user += state.vYaw;
      state.pitch = THREE.MathUtils.clamp(state.pitch + state.vPitch, -0.7, 0.7);
      state.lastInteract = clock.elapsedTime;
    } else if (e.pointerType === 'mouse') {
      canvas.style.cursor = hitsLogo(e) ? 'grab' : '';
    }
  });
  const endDrag = (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    canvas.style.cursor = '';
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { state.hoverX = 0; state.hoverY = 0; });

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  let visible = true;
  let running = false;
  const intro = { t: 0 };
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 1.2s ease';
  requestAnimationFrame(() => { canvas.style.opacity = '1'; });

  const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // intro
    intro.t = Math.min(1, intro.t + dt / 2.2);
    const k = reduced ? 1 : easeOutExpo(intro.t);

    // inércia + retorno suave à pose idle
    if (!state.dragging) {
      state.user += state.vYaw;
      state.vYaw *= 0.94;
      state.vPitch *= 0.9;
      if (t - state.lastInteract > 2.5) {
        const nearest = Math.round(state.user / (Math.PI * 2)) * Math.PI * 2;
        state.user += (nearest - state.user) * 0.02;
        state.pitch += (0 - state.pitch) * 0.03;
      }
    }
    const idle = reduced ? 0 : Math.sin(t * 0.45) * 0.55;
    state.tiltX += (state.hoverY * 0.12 - state.tiltX) * 0.05;
    state.tiltY += (state.hoverX * 0.2 - state.tiltY) * 0.05;

    spinner.rotation.y = idle + state.user + state.tiltY + (1 - k) * -Math.PI * 1.5;
    spinner.rotation.x = state.pitch + state.tiltX;
    spinner.position.y = reduced ? 0 : Math.sin(t * 0.9) * 0.05;
    const sc = 0.55 + 0.45 * k;
    spinner.scale.setScalar(sc);

    rings.children.forEach((ring, i) => {
      ring.rotation.z += ring.userData.speed * dt * (reduced ? 0 : 1);
      const ringScale = 0.6 + 0.4 * easeOutExpo(Math.max(0, intro.t * 1.2 - i * 0.12));
      ring.scale.setScalar(ringScale);
    });
    rings.rotation.y = state.tiltY * 0.6;
    rings.rotation.x = state.tiltX * 0.6;

    halo.material.opacity = 0.75 + Math.sin(t * 1.3) * 0.15;
    particles.rotation.y = t * 0.015 + state.tiltY * 0.25;
    particles.rotation.x = state.tiltX * 0.2;
    pMat.uniforms.uTime.value = t;

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
  }, { threshold: 0 }).observe(hero);
  document.addEventListener('visibilitychange', () => setRunning(visible && !document.hidden));
  setRunning(true);
}
