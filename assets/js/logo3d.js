/* =========================================================
   InclusiVR — construtor do logo 3D (compartilhado por
   hero, estúdio 3D e experiência AR)
   ========================================================= */
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = new URL('../3d/', import.meta.url);
const textureLoader = new THREE.TextureLoader();
const cache = new Map();

function once(key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

export function loadTexture(url, { srgb = true } = {}) {
  return once(`tex:${url}`, () => new Promise((resolve, reject) => {
    textureLoader.load(url, (tex) => {
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      resolve(tex);
    }, undefined, reject);
  }));
}

export function loadLogoAssets() {
  return once('logo-assets', async () => {
    const [shape, front, glow, word] = await Promise.all([
      fetch(new URL('logo-shape.json', BASE)).then((r) => r.json()),
      loadTexture(new URL('logo-icon-front.jpg', BASE).href),
      loadTexture(new URL('logo-icon-glow.png', BASE).href),
      loadTexture(new URL('logo-word-front.jpg', BASE).href)
    ]);
    return { shape, front, glow, word };
  });
}

/* Projeção planar: as tampas (frente/verso) recebem a arte do logo
   exatamente alinhada ao contorno extraído da imagem original. */
export function planarUV(width, height, ox = 0, oy = 0) {
  const uv = (v, i) => new THREE.Vector2((v[i * 3] - ox) / width, (v[i * 3 + 1] - oy) / height);
  return {
    generateTopUV: (g, v, a, b, c) => [uv(v, a), uv(v, b), uv(v, c)],
    generateSideWallUV: (g, v, a, b, c, d) => [uv(v, a), uv(v, b), uv(v, c), uv(v, d)]
  };
}

export function shapesFrom(list, scale = 1, ox = 0, oy = 0) {
  return list.map((s) => {
    const shape = new THREE.Shape(s.outer.map(([x, y]) => new THREE.Vector2(x * scale + ox, y * scale + oy)));
    shape.holes = s.holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x * scale + ox, y * scale + oy))));
    return shape;
  });
}

/* Extrusão com bisel e normais suavizadas (mantendo arestas vivas). */
export function extrude(shapes, { depth, bevel, curveSegments = 6, uv, crease = 0.6 }) {
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth,
    curveSegments,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.7,
    bevelSegments: 4,
    UVGenerator: uv
  });
  geo.translate(0, 0, -depth / 2);
  // toCreasedNormals usa um hash com precisão de 0,01 — escalamos para preservar detalhes
  geo.scale(100, 100, 100);
  const smooth = toCreasedNormals(geo, crease);
  smooth.scale(0.01, 0.01, 0.01);
  if (smooth !== geo) geo.dispose();
  smooth.computeBoundingBox();
  return smooth;
}

/**
 * Cria o logo 3D.
 * @returns {Promise<{root: THREE.Group, inner: THREE.Group, parts: object, materials: object, height: number}>}
 */
export async function createLogo({
  word = false,
  depth = 0.11,
  bevel = 0.014,
  accent = 0x15b0ff,
  glow = true
} = {}) {
  const assets = await loadLogoAssets();
  const { shape } = assets;
  const icon = shape.icon;
  const layout = shape.layout;

  const materials = {
    cap: new THREE.MeshPhysicalMaterial({
      map: assets.front, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.18
    }),
    side: new THREE.MeshPhysicalMaterial({
      color: accent, metalness: 0.65, roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.2
    }),
    glow: glowBlend(new THREE.MeshBasicMaterial({
      map: assets.glow, color: accent, opacity: 0.6, side: THREE.DoubleSide, toneMapped: false
    }))
  };

  const root = new THREE.Group();
  root.name = 'InclusiVR-logo';
  const inner = new THREE.Group();
  root.add(inner);

  const iconGeo = extrude(shapesFrom(icon.shapes), { depth, bevel, uv: planarUV(icon.aspect, 1) });
  const iconMesh = new THREE.Mesh(iconGeo, [materials.cap, materials.side]);
  iconMesh.name = 'icon';
  iconMesh.userData.roles = ['cap', 'side'];
  inner.add(iconMesh);

  const parts = { icon: iconMesh, glow: null, word: null };

  if (glow) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(icon.aspect, 1), materials.glow);
    plane.position.set(icon.aspect / 2, 0.5, -depth / 2 - bevel - 0.006);
    plane.name = 'glow';
    plane.renderOrder = -1;
    inner.add(plane);
    parts.glow = plane;
  }

  const bbox = iconGeo.boundingBox.clone();

  if (word) {
    const H = layout.iconHeightPx;
    const s = layout.wordHeightPx / H;
    const wAspect = shape.word.aspect;
    const ox = icon.aspect / 2 + (layout.wordCenterXPx - layout.iconCenterXPx) / H - (wAspect * s) / 2;
    const oy = -layout.wordOffsetPx / H - s;
    materials.wordCap = new THREE.MeshPhysicalMaterial({
      map: assets.word, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.2
    });
    materials.wordSide = materials.side;
    const wordGeo = extrude(shapesFrom(shape.word.shapes, s, ox, oy), {
      depth: depth * 0.8, bevel: bevel * 0.6, uv: planarUV(wAspect * s, s, ox, oy)
    });
    const wordMesh = new THREE.Mesh(wordGeo, [materials.wordCap, materials.wordSide]);
    wordMesh.name = 'word';
    wordMesh.userData.roles = ['wordCap', 'side'];
    inner.add(wordMesh);
    parts.word = wordMesh;
    bbox.union(wordGeo.boundingBox);
  }

  const center = bbox.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -center.y, 0);
  const size = bbox.getSize(new THREE.Vector3());

  return {
    root, inner, parts, materials,
    height: size.y, width: size.x,
    iconCenterY: (iconGeo.boundingBox.min.y + iconGeo.boundingBox.max.y) / 2 - center.y
  };
}

/* Textura de brilho radial reutilizável (sprites e halos). */
export function radialTexture(stops = [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']], size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Soma de cor sem escrever alfa: em canvas transparentes (sobre vídeo ou CSS)
   o AdditiveBlending padrão escurece o fundo; este modo mantém o brilho aditivo. */
export function glowBlend(material) {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  material.transparent = true;
  material.depthWrite = false;
  return material;
}

export function countTriangles(object) {
  let tris = 0;
  object.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  return Math.round(tris);
}
