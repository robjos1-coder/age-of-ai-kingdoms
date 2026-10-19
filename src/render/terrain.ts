// Terrain mesh, water surface, fog-of-war texture and scattered decorations.

import * as THREE from 'three';
import { Grid, T_DIRT, T_FOREST, T_GRASS, T_SAND, T_SHALLOW, T_SNOW, T_WATER } from '../sim/grid';
import { applyFog, type FogUniforms } from './batches';
import { makeGroundMaterial, type ScanAtlas } from './realism';
import { RealisticWater } from './realism-water';

const TERRAIN_COLORS: Record<number, [string, string]> = {
  [T_GRASS]: ['#5f9c3e', '#79b04c'],
  [T_WATER]: ['#3c5a58', '#45625e'],
  [T_SHALLOW]: ['#b4a878', '#c2b684'],
  [T_SAND]: ['#d6c288', '#e2d29a'],
  [T_DIRT]: ['#9b8052', '#a98c5c'],
  [T_FOREST]: ['#466f2c', '#557d34'],
  [T_SNOW]: ['#e4ebee', '#f2f6f8'],
};

export const WATER_Y = -0.08;

/** hi: extra ground cover drawn only on high quality. */
export interface Deco { t: string; x: number; y: number; v: number; rot: number; s: number; hi?: boolean }

export class Terrain {
  mesh: THREE.Mesh;
  water: THREE.Mesh;
  under: THREE.Mesh;
  fogTex: THREE.DataTexture;
  fogData: Uint8Array;
  decos: Deco[] = [];
  waterNormal: THREE.CanvasTexture;
  private grid: Grid;
  private detail: THREE.Texture | null = null;
  private biomeMap: THREE.DataTexture | null = null;
  realisticWater: RealisticWater | null = null;

  /** arid: Arabia — dusty dirt with patches of dry grass, sparse dry tufts and scrub, more rocks. */
  constructor(scene: THREE.Scene, grid: Grid, fog: FogUniforms, desert: boolean, scans?: ScanAtlas, lush = false, arid = false) {
    this.grid = grid;
    const S = grid.size;
    // fog texture
    this.fogData = new Uint8Array(S * S * 4);
    this.fogTex = new THREE.DataTexture(this.fogData, S, S, THREE.RGBAFormat);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.wrapS = this.fogTex.wrapT = THREE.ClampToEdgeWrapping;
    this.fogTex.needsUpdate = true;
    fog.fogMap.value = this.fogTex;
    fog.fogSize.value = S;

    // ---- terrain geometry
    const subdivision = scans ? 2 : 1;
    const W = S * subdivision + 1;
    const pos = new Float32Array(W * W * 3);
    const col = new Float32Array(W * W * 3);
    const uv = new Float32Array(W * W * 2);
    const tileCol: THREE.Color[] = [];
    const ca = new THREE.Color(), cb = new THREE.Color();
    let seed = 1234;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    /** 0 = bare dirt … 1 = dry grass: large soft patches for arid maps. */
    const aridGrass = (x: number, y: number) => {
      const n = 0.5 + 0.5 * Math.sin(x * 0.17 + Math.cos(y * 0.13) * 2.3) * Math.cos(y * 0.15 + Math.sin(x * 0.11) * 1.9);
      const m = 0.5 + 0.5 * Math.sin(x * 0.41 + y * 0.29) * Math.cos(y * 0.37 - x * 0.23);
      return Math.max(0, Math.min(1, (n * 0.75 + m * 0.25 - 0.3) * 2.4));
    };
    const DRY = new THREE.Color('#a8915e'), DRY2 = new THREE.Color('#b9a06a'), DRYGRASS = new THREE.Color('#8f8c4e');
    for (let i = 0; i < S * S; i++) {
      let t = grid.terrain[i];
      if (desert && t === T_GRASS) t = T_SAND;
      const [a, b] = TERRAIN_COLORS[t] ?? TERRAIN_COLORS[T_GRASS];
      ca.set(a); cb.set(b);
      const x = i % S, y = (i / S) | 0;
      const n = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.cos(y * 0.23) * 2) * Math.cos(y * 0.27 + Math.sin(x * 0.19));
      if (arid && (t === T_GRASS || t === T_DIRT || t === T_FOREST)) {
        // classic look for arid maps: dust and dry grass instead of meadow
        const gr = t === T_DIRT ? 0 : t === T_FOREST ? 0.6 : aridGrass(x, y);
        tileCol.push(DRY.clone().lerp(DRY2, n * 0.7 + rnd() * 0.3).lerp(DRYGRASS, gr * 0.85));
        continue;
      }
      tileCol.push(ca.clone().lerp(cb, n * 0.8 + rnd() * 0.2));
    }
    const c = new THREE.Color();
    for (let vy = 0; vy < W; vy++) {
      for (let vx = 0; vx < W; vx++) {
        const x = vx / subdivision, y = vy / subdivision;
        const vi = vy * W + vx;
        const h = grid.h(x, y);
        pos[vi * 3] = x; pos[vi * 3 + 1] = h; pos[vi * 3 + 2] = y;
        uv[vi * 2] = x / 3; uv[vi * 2 + 1] = y / 3;
        c.setRGB(0, 0, 0);
        let n = 0;
        for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
          const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
          if (tx < 0 || ty < 0 || tx >= S || ty >= S) continue;
          c.add(tileCol[ty * S + tx]);
          n++;
        }
        c.multiplyScalar(1 / Math.max(1, n));
        // slope / height shading
        const hn = Math.max(0, Math.min(1, (h - 0.2) / 3));
        c.multiplyScalar(0.95 + hn * 0.12 + (rnd() - 0.5) * 0.06);
        if (h < 0) c.multiplyScalar(Math.max(0.45, 1 + h * 0.35));
        col[vi * 3] = c.r; col[vi * 3 + 1] = c.g; col[vi * 3 + 2] = c.b;
      }
    }
    const idx: number[] = [];
    for (let y = 0; y < W - 1; y++) for (let x = 0; x < W - 1; x++) {
      const a = y * W + x, b = a + 1, d = a + W, e = d + 1;
      if ((x + y) % 2) idx.push(a, d, b, b, d, e);
      else idx.push(a, d, e, a, e, b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    let mat: THREE.Material;
    if (scans) {
      const mask = new Uint8Array(S * S * 4);
      for (let i = 0; i < S * S; i++) {
        const t = desert && grid.terrain[i] === T_GRASS ? T_SAND : grid.terrain[i];
        const channel = t === T_DIRT ? 1 : t === T_FOREST ? 3 : [T_SAND, T_SHALLOW, T_WATER].includes(t) ? 2 : t === T_SNOW ? -1 : 0;
        if (channel >= 0) mask[i * 4 + channel] = 255;
        // AoE4 look: dirt reads as trodden patches inside living meadow, forest floor stays mossy
        if (arid && (t === T_GRASS || t === T_DIRT || t === T_FOREST)) {
          // Arabia: mostly dusty dirt, dry grass in soft patches, a touch of sand; dry forest floor
          const x = i % S, y = (i / S) | 0;
          const gr = t === T_DIRT ? 0.08 : t === T_FOREST ? 0.35 : aridGrass(x, y);
          mask[i * 4] = Math.round(255 * gr);
          mask[i * 4 + 1] = Math.round(255 * (1 - gr) * 0.85);
          mask[i * 4 + 2] = Math.round(255 * (1 - gr) * 0.15);
          mask[i * 4 + 3] = t === T_FOREST ? 150 : 0;
          continue;
        }
        if (!desert && t === T_DIRT) { mask[i * 4 + 1] = 95; mask[i * 4] = 160; }
        if (!desert && t === T_FOREST) { mask[i * 4 + 3] = 170; mask[i * 4] = 85; }
      }
      this.biomeMap = new THREE.DataTexture(mask, S, S);
      this.biomeMap.magFilter = this.biomeMap.minFilter = THREE.LinearFilter;
      this.biomeMap.needsUpdate = true;
      mat = makeGroundMaterial(scans, this.biomeMap, fog, S, lush, arid);
    } else {
      this.detail = makeDetailTexture();
      mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.detail });
      applyFog(mat, fog);
    }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // ---- water
    this.waterNormal = makeWaterNormal();
    this.waterNormal.wrapS = this.waterNormal.wrapT = THREE.RepeatWrapping;
    this.waterNormal.repeat.set(S / 6, S / 6);
    const wgeo = new THREE.PlaneGeometry(S + 40, S + 40, 1, 1);
    wgeo.rotateX(-Math.PI / 2);
    wgeo.translate(S / 2, WATER_Y, S / 2);
    const wmat = new THREE.MeshPhongMaterial({
      color: '#2f7fae', specular: '#bfe4ff', shininess: 70, transparent: true, opacity: 0.8,
      normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.6, 0.6), depthWrite: false,
    });
    applyFog(wmat, fog);
    if (scans) {
      wgeo.dispose(); wmat.dispose();
      this.realisticWater = new RealisticWater(grid, this.waterNormal, fog);
      this.water = this.realisticWater.mesh;
    } else this.water = new THREE.Mesh(wgeo, wmat);
    this.water.renderOrder = 1;
    this.water.receiveShadow = true;
    scene.add(this.water);

    // ---- underside / edges (dark)
    const ugeo = new THREE.PlaneGeometry(S * 6, S * 6);
    ugeo.rotateX(-Math.PI / 2);
    ugeo.translate(S / 2, -1.6, S / 2);
    this.under = new THREE.Mesh(ugeo, new THREE.MeshBasicMaterial({ color: '#0b0d10' }));
    scene.add(this.under);

    // ---- decorations
    for (let i = 0; i < S * S; i++) {
      const t = grid.terrain[i];
      if (grid.occ[i]) continue;
      const x = i % S, y = (i / S) | 0;
      const r = rnd();
      let d: string | null = null;
      if (arid && (t === T_GRASS || t === T_DIRT || t === T_FOREST)) {
        // Arabia: dry tussocks where the grass patches are, scrub and stones scattered everywhere
        const gr = t === T_DIRT ? 0 : t === T_FOREST ? 0.6 : aridGrass(x, y);
        if (r < 0.03) d = 'rock';
        else if (r < 0.045) d = 'scrub';
        else if (r < 0.05 + gr * 0.32) d = 'drygrass';
        if (scans && gr > 0.4 && rnd() < gr * 0.35) this.decos.push({ t: 'drygrass', x: x + rnd(), y: y + rnd(), v: Math.floor(rnd() * 4), rot: rnd() * 6.28, s: 0.6 + rnd() * 0.6, hi: true });
        if (!d) continue;
        this.decos.push({ t: d, x: x + 0.2 + rnd() * 0.6, y: y + 0.2 + rnd() * 0.6, v: Math.floor(rnd() * 4), rot: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
        continue;
      }
      if (t === T_GRASS) d = desert ? (r < 0.015 ? 'cactus' : r < 0.04 ? 'rock' : null) : r < 0.09 ? 'grass' : r < 0.11 ? 'flower' : r < 0.118 ? 'rock' : r < 0.125 ? 'bush' : null;
      else if (t === T_FOREST) d = r < 0.25 ? 'grass' : r < 0.3 ? 'bush' : null;
      else if (t === T_SAND) d = r < 0.02 ? 'rock' : desert && r < 0.03 ? 'cactus' : null;
      else if (t === T_DIRT) d = r < 0.04 ? 'rock' : r < 0.07 ? 'grass' : null;
      else if (t === T_SHALLOW) d = r < 0.15 ? 'reed' : null;
      if (scans && !desert && !d && (t === T_GRASS || t === T_FOREST) && r < 0.3) d = 'grass';
      if (scans && !desert && (t === T_GRASS || t === T_FOREST) && (r < 0.22 || (t === T_FOREST && r < 0.5))) {
        const extra = 1;
        for (let k = 0; k < extra; k++) this.decos.push({ t: rnd() < 0.06 && t === T_GRASS ? 'flower' : 'grass', x: x + rnd(), y: y + rnd(), v: Math.floor(rnd() * 4), rot: rnd() * 6.28, s: 0.6 + rnd() * 0.6, hi: true });
      }
      if (!d) continue;
      this.decos.push({ t: d, x: x + 0.2 + rnd() * 0.6, y: y + 0.2 + rnd() * 0.6, v: Math.floor(rnd() * 4), rot: rnd() * 6.28, s: 0.8 + rnd() * 0.5 });
      if (scans && !desert && (t === T_GRASS || t === T_FOREST) && r < 0.2) {
        this.decos.push({ t: 'grass', x: x + rnd(), y: y + rnd(), v: Math.floor(rnd() * 4), rot: rnd() * 6.28, s: 0.65 + rnd() * 0.6 });
      }
    }
  }

  updateFog(explored: Uint8Array, visible: Uint8Array) {
    const d = this.fogData;
    const n = explored.length;
    for (let i = 0; i < n; i++) {
      const v = visible[i] ? 255 : explored[i] ? 125 : 0;
      const k = i * 4;
      d[k] = v; d[k + 1] = v; d[k + 2] = v; d[k + 3] = 255;
    }
    this.fogTex.needsUpdate = true;
  }

  animate(t: number) {
    this.waterNormal.offset.set(t * 0.012, t * 0.007);
    this.realisticWater?.animate(t);
  }

  waterInView(x0: number, z0: number, x1: number, z1: number) {
    const s = this.grid.size;
    for (let z = Math.max(0, Math.floor(z0)); z < Math.min(s, Math.ceil(z1)); z++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(s, Math.ceil(x1)); x++) {
        const tile = this.grid.terrain[z * s + x];
        if (tile === T_WATER || tile === T_SHALLOW) return true;
      }
    }
    return false;
  }

  dispose(scene: THREE.Scene) {
    for (const m of [this.mesh, this.water, this.under]) {
      scene.remove(m);
      if (m === this.water && this.realisticWater) continue;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.fogTex.dispose();
    this.waterNormal.dispose();
    this.realisticWater?.dispose();
    this.biomeMap?.dispose();
    this.detail?.dispose();
  }
}

function makeDetailTexture(): THREE.CanvasTexture {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  let seed = 99;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const base = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) base[i] = rnd();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += base[((y + dy + N) % N) * N + ((x + dx + N) % N)];
    const v = 0.78 * (s / 9) + 0.22 * base[y * N + x];
    const c = Math.round(205 + (v - 0.5) * 90);
    const i = (y * N + x) * 4;
    img.data[i] = c; img.data[i + 1] = c; img.data[i + 2] = c; img.data[i + 3] = 255;
  }
  // a few blade strokes
  for (let k = 0; k < 500; k++) {
    const x = Math.floor(rnd() * N), y = Math.floor(rnd() * N);
    for (let j = 0; j < 3; j++) {
      const i = (((y - j + N) % N) * N + x) * 4;
      const c = rnd() < 0.5 ? 245 : 170;
      img.data[i] = c; img.data[i + 1] = c; img.data[i + 2] = c;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeWaterNormal(): THREE.CanvasTexture {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const h = (x: number, y: number) =>
    Math.sin((x / N) * Math.PI * 2 * 3 + Math.sin((y / N) * Math.PI * 2 * 2) * 1.5) * 0.5 +
    Math.sin((y / N) * Math.PI * 2 * 4 + Math.cos((x / N) * Math.PI * 2 * 3)) * 0.35 +
    Math.sin(((x + y) / N) * Math.PI * 2 * 5) * 0.15;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y);
    const dy = h(x, y + 1) - h(x, y - 1);
    const v = new THREE.Vector3(-dx, -dy, 1.2).normalize();
    const i = (y * N + x) * 4;
    img.data[i] = (v.x * 0.5 + 0.5) * 255;
    img.data[i + 1] = (v.y * 0.5 + 0.5) * 255;
    img.data[i + 2] = (v.z * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(cv);
}
