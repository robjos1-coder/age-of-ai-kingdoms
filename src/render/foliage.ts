// Alpha-cut foliage cards for the realistic renderer.
// A painted leaf-cluster / needle-spray texture (generated once on a canvas, no downloads) is mapped onto
// crossed quads; the fragment shader discards the gaps and the vertex normals are bent away from the
// canopy centre, so a handful of quads light like a soft, leafy volume instead of a solid blob.

import * as THREE from 'three';
import type { MB, Col } from './mb';

// ---------------------------------------------------------------- texture

let TEX: THREE.DataTexture | null = null;

function rng(seed: number) {
  let v = seed + 1;
  return () => { v = (v * 16807) % 2147483647; return v / 2147483647; };
}

/** 1024×1024 RGBA. Top row: broadleaf cluster | conifer needle spray (v runs trunk → tip).
 *  Bottom row (painted in true colour): grass tuft | grass with wildflowers (v runs root → tip). */
export function foliageTexture(): THREE.DataTexture {
  if (TEX) return TEX;
  const W = 1024, H = 1024, S = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const rnd = rng(11);
  const shade = (v: number, warm: number) => {
    const c = Math.max(0, Math.min(1, v));
    return `rgb(${Math.round(255 * c * (0.86 + warm * 0.2))},${Math.round(255 * c)},${Math.round(255 * c * (0.72 - warm * 0.12))})`;
  };

  // --- broadleaf cluster: twigs, then ~900 leaves in a lobed disc, darkest first
  g.strokeStyle = '#4a3a2a'; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
    g.lineWidth = 5 - i * 0.4;
    g.beginPath(); g.moveTo(256, 470); g.quadraticCurveTo(256 + Math.cos(a) * 80, 330, 256 + Math.cos(a) * 170, 256 + Math.sin(a) * 150); g.stroke();
  }
  const leaves: { x: number; y: number; a: number; l: number; v: number; w: number }[] = [];
  for (let i = 0; i < 950; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd());
    const edge = 0.42 + 0.05 * Math.sin(a * 3 + 1) + 0.035 * Math.sin(a * 7 + 2) + 0.02 * Math.sin(a * 13);
    const r = rr * edge * S;
    const x = 256 + Math.cos(a) * r, y = 256 + Math.sin(a) * r * 0.9;
    // light from "above" (high v) and slightly from +u; outer leaves are less occluded
    const lit = ((x - 256) * 0.35 + (y - 256)) / (S * 0.45);
    const v = Math.min(0.84, 0.4 + 0.16 * lit + 0.2 * rr + (rnd() - 0.5) * 0.24);
    leaves.push({ x, y, a: rnd() * Math.PI, l: 10 + rnd() * 10, v, w: rnd() });
  }
  leaves.sort((p, q) => p.v - q.v);
  for (const f of leaves) {
    g.save(); g.translate(f.x, f.y); g.rotate(f.a);
    g.fillStyle = shade(f.v, f.w);
    g.beginPath(); g.ellipse(0, 0, f.l, f.l * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = shade(f.v * 0.75, f.w); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-f.l * 0.8, 0); g.lineTo(f.l * 0.8, 0); g.stroke();
    g.restore();
  }

  // --- conifer spray: central stem from v=0 (trunk) to v=1 (tip), side twigs covered in needles
  const ox = 768;
  g.strokeStyle = '#4d4a2c'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(ox, 4); g.lineTo(ox, 500); g.stroke();
  for (let y = 20; y < 490; y += 15) {
    const t = y / 500, half = 200 * (1 - t * 0.78) * (0.85 + rnd() * 0.3);
    for (const side of [-1, 1]) {
      const ang = side * (0.95 + rnd() * 0.25);
      const ex = ox + Math.sin(ang) * half, ey = y + Math.cos(ang) * half * 0.55;
      g.strokeStyle = '#3f4a26'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(ox, y); g.lineTo(ex, ey); g.stroke();
      const n = Math.round(half / 3.2);
      for (let k = 0; k < n; k++) {
        const u = k / n, px = ox + (ex - ox) * u, py = y + (ey - y) * u;
        for (const s2 of [-1, 1]) {
          const na = Math.atan2(ey - y, ex - ox) + s2 * (0.6 + rnd() * 0.35);
          const len = (13 + rnd() * 8) * (1 - u * 0.35);
          const v = Math.min(0.84, 0.38 + 0.24 * u + (rnd() - 0.5) * 0.24 + (s2 > 0 ? 0.06 : -0.04));
          g.strokeStyle = shade(v, rnd() * 0.4); g.lineWidth = 2.6;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(na) * len, py + Math.sin(na) * len); g.stroke();
        }
      }
    }
  }

  // --- grass tufts: tapered, curving blades in muted meadow colours; the second cell adds wildflowers
  const blades = (ox: number, n: number, flowers: boolean) => {
    for (let i = 0; i < n; i++) {
      const bx = ox + 256 + (rnd() - 0.5) * (rnd() < 0.6 ? 150 : 300), by = 516;
      const h = 150 + rnd() * 310, lean = (rnd() - 0.5) * 170 + (bx - ox - 256) * 0.6, w = 5 + rnd() * 5;
      const tx = bx + lean, ty = by + h;
      const dry = rnd() < 0.18;
      const v = 0.75 + rnd() * 0.5;
      const col = dry ? [150, 138, 88] : [88 + rnd() * 30, 108 + rnd() * 30, 50 + rnd() * 18];
      g.fillStyle = `rgb(${col.map((c) => Math.round(Math.min(255, c * v))).join(',')})`;
      g.beginPath();
      g.moveTo(bx - w, by);
      g.quadraticCurveTo(bx - w * 0.6 + lean * 0.3, by + h * 0.55, tx, ty);
      g.quadraticCurveTo(bx + w * 0.6 + lean * 0.3, by + h * 0.55, bx + w, by);
      g.closePath(); g.fill();
    }
    if (flowers) {
      const pal = ['#e8e2d0', '#e3c34a', '#9a6cb0', '#d07a8a', '#f0efe6'];
      for (let i = 0; i < 26; i++) {
        const fx = ox + 256 + (rnd() - 0.5) * 300, fy = 640 + rnd() * 300;
        g.strokeStyle = '#5b6d34'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(fx + (rnd() - 0.5) * 30, 516); g.lineTo(fx, fy); g.stroke();
        g.fillStyle = pal[i % pal.length];
        for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(fx + Math.cos(p * 1.26) * 6, fy + Math.sin(p * 1.26) * 6, 5.5, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#d9a72a'; g.beginPath(); g.arc(fx, fy, 3.5, 0, Math.PI * 2); g.fill();
      }
    }
  };
  blades(0, 150, false);
  blades(512, 100, true);

  // Unpremultiplied pixels; bleed the mean colour into transparent texels so mipmaps don't get dark fringes.
  const img = g.getImageData(0, 0, W, H).data;
  const out = new Uint8Array(img.length);
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < img.length; i += 4) if (img[i + 3] > 200) { r += img[i]; gg += img[i + 1]; b += img[i + 2]; n++; }
  r /= n; gg /= n; b /= n;
  for (let i = 0; i < img.length; i += 4) {
    const a = img[i + 3];
    const k = a / 255;
    out[i] = img[i] * k + r * (1 - k); out[i + 1] = img[i + 1] * k + gg * (1 - k); out[i + 2] = img[i + 2] * k + b * (1 - k);
    out[i + 3] = a;
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  TEX = tex;
  return tex;
}

/** Shadow-map material for tree batches: same alpha cut-out so trees cast dappled, leafy shadows. */
export function makeFoliageDepthMaterial(): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.foliageMap = { value: foliageTexture() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSurface;\nvarying float vFol;\nvarying vec2 vFolUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFol = aSurface;\nvFolUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D foliageMap;\nvarying float vFol;\nvarying vec2 vFolUv;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFol > 15.5 && texture2D(foliageMap, vFolUv).a < 0.45) discard;');
  };
  m.customProgramCacheKey = () => 'foliage-depth';
  return m;
}

// ---------------------------------------------------------------- cards

/** Double-sided quad with explicit uvs (both faces share the same uv, normals are rewritten by MB). */
function quad(p: number[][], uv: number[][]) {
  const g = new THREE.BufferGeometry();
  const [a, b, c, d] = [0, 1, 2, 3];
  const idx = [a, b, c, a, c, d, a, c, b, a, d, c];
  const pos: number[] = [], uvs: number[] = [];
  for (const i of idx) { pos.push(...p[i]); uvs.push(...uv[i]); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}
/** Broadleaf cluster card, centred, 1×1 in the XY plane. */
const LEAFCARD = quad([[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]], [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]]);
/** Needle spray card in the XZ plane, starting at the origin and reaching +X by 1. */
const SPRAY = quad([[0, 0, 0.5], [0, 0, -0.5], [1, 0, -0.5], [1, 0, 0.5]], [[0.5, 0], [1, 0], [1, 0.5], [0.5, 0.5]]);
/** Upright spray (tree tops), base at the origin, tip at +Y. */
const SPIRE = quad([[-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0]], [[0.5, 0], [1, 0], [1, 0.5], [0.5, 0.5]]);
/** Grass tuft cards, root at the origin, 1 wide and 1 tall (left: plain grass, right: with wildflowers). */
const TUFT = [0, 0.5].map((u0) => quad([[-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0]], [[u0, 0.5], [u0 + 0.5, 0.5], [u0 + 0.5, 1], [u0, 1]]));

const UP = new THREE.Vector3(0, 1, 0);
/** A clump of grass (or wildflowers): cards splayed outwards from the root like a real tussock, so the
 *  RTS camera looking down sees blades rather than thin crossed planes. Lit mostly from above like the ground. */
export function grassTuft(mb: MB, w: number, h: number, color: Col, flowers = false, ry = 0, cards = 4) {
  const prev = mb.normalFn;
  mb.normalFn = (_p, n) => { n.multiplyScalar(0.3).add(UP).normalize(); };
  for (let i = 0; i < cards; i++) {
    const a = ry + (i * Math.PI * 2) / cards;
    // each card leans away from the centre (rx about its own base) and is offset a little outwards
    mb.push(Math.sin(a) * w * 0.12, 0, Math.cos(a) * w * 0.12, 0.55 + (i % 2) * 0.25, a, 0);
    mb.add(TUFT[flowers ? 1 : 0], color, 0, 0, 0, { surface: 'foliage' }, w * (0.8 + (i % 3) * 0.15), h, 1);
    mb.pop();
  }
  mb.normalFn = prev;
}

/** Three crossed cards, randomly oriented, forming one leafy clump. */
export function leafClump(mb: MB, x: number, y: number, z: number, size: number, color: Col, rnd: () => number) {
  mb.push(x, y, z, (rnd() - 0.5) * 0.6, rnd() * Math.PI, (rnd() - 0.5) * 0.6, size);
  mb.add(LEAFCARD, color, 0, 0, 0, { surface: 'foliage' });
  mb.add(LEAFCARD, color, 0, 0, 0, { surface: 'foliage', ry: Math.PI / 2 });
  mb.add(LEAFCARD, color, 0, 0, 0, { surface: 'foliage', rx: -Math.PI / 2, rz: rnd() * 3 });
  mb.pop();
}

/** One drooping conifer branch spray from (x,y,z) heading out at angle a. */
export function spray(mb: MB, x: number, y: number, z: number, a: number, len: number, droop: number, color: Col) {
  mb.push(x, y, z, 0, -a, -droop, 1);
  mb.add(SPRAY, color, 0, 0, 0, { surface: 'foliage' }, len, 1, len * 1.05);
  mb.add(SPRAY, color, 0, 0.02, 0, { surface: 'foliage', rx: 0.9 }, len * 0.85, 1, len * 0.8);
  mb.pop();
}

export function spire(mb: MB, x: number, y: number, z: number, h: number, color: Col) {
  for (let i = 0; i < 2; i++) mb.add(SPIRE, color, x, y, z, { surface: 'foliage', ry: i * Math.PI / 2 }, h * 0.6, h, 1);
}
