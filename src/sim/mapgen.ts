// Random map generation: terrain, elevation, water, forests, resources, wildlife, relics.

import type { NodeKind, UnitKey } from '../data/defs';
import { Grid, T_DIRT, T_FOREST, T_GRASS, T_SAND, T_SHALLOW, T_SNOW, T_WATER } from './grid';
import type { Settings } from './types';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Noise {
  perm: Uint8Array;
  constructor(rnd: () => number) {
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  private v(ix: number, iy: number) {
    return this.perm[(ix & 255) + this.perm[iy & 255]] / 255;
  }
  value(x: number, y: number) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this.v(ix, iy), b = this.v(ix + 1, iy), c = this.v(ix, iy + 1), d = this.v(ix + 1, iy + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  }
  fbm(x: number, y: number, oct = 4) {
    let s = 0, amp = 0.5, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) {
      s += this.value(x * f, y * f) * amp;
      tot += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / tot;
  }
}

export interface GenNode { t: NodeKind; x: number; y: number }
export interface GenAnimal { t: UnitKey; x: number; y: number; owner?: number }
export interface GenStart { x: number; y: number; cx: number; cy: number; angle: number }

export interface MapGenResult {
  grid: Grid;
  starts: GenStart[];
  nodes: GenNode[];
  animals: GenAnimal[];
  relics: { x: number; y: number }[];
}

export function generateMap(settings: Settings, nPlayers: number): MapGenResult {
  const S = settings.mapSize;
  const rnd = mulberry32(settings.seed);
  const R = (a: number, b: number) => a + rnd() * (b - a);
  const RI = (a: number, b: number) => Math.floor(R(a, b + 1));
  const noise = new Noise(rnd);
  const noise2 = new Noise(rnd);
  const g = new Grid(S);
  const type = settings.mapType;
  const c = S / 2;

  // ---------------------------------------------------------------- players
  const startR = S * (type === 'coastal' ? 0.32 : type === 'oasis' ? 0.37 : 0.36);
  const a0 = rnd() * Math.PI * 2;
  const starts: GenStart[] = [];
  for (let i = 0; i < nPlayers; i++) {
    const ang = a0 + (i / nPlayers) * Math.PI * 2 + R(-0.12, 0.12);
    const cx = Math.round(c + Math.cos(ang) * startR);
    const cy = Math.round(c + Math.sin(ang) * startR);
    starts.push({ x: cx - 2, y: cy - 2, cx, cy, angle: ang });
  }
  const nearStart = (x: number, y: number, r: number) => starts.some((s) => (s.cx - x) ** 2 + (s.cy - y) ** 2 < r * r);
  const distStart = (x: number, y: number) => Math.min(...starts.map((s) => Math.hypot(s.cx - x, s.cy - y)));

  // ---------------------------------------------------------------- water
  const water = new Float32Array(S * S); // >0.5 = water
  const blob = (bx: number, by: number, r: number, wob = 0.35) => {
    const sc = 0.18;
    for (let y = Math.max(0, Math.floor(by - r * 1.6)); y < Math.min(S, by + r * 1.6); y++) {
      for (let x = Math.max(0, Math.floor(bx - r * 1.6)); x < Math.min(S, bx + r * 1.6); x++) {
        const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / r;
        const n = (noise2.fbm(x * sc, y * sc, 3) - 0.5) * 2 * wob;
        const v = 1 - d + n;
        if (v > 0) water[y * S + x] = Math.max(water[y * S + x], 0.5 + v);
      }
    }
  };
  if (type === 'lakes') {
    blob(c, c, S * 0.13, 0.45);
    const ponds = Math.round(S / 40);
    for (let i = 0; i < ponds * 3 && i < 30; i++) {
      const px = R(10, S - 10), py = R(10, S - 10);
      if (nearStart(px, py, 20) || Math.hypot(px - c, py - c) < S * 0.2) continue;
      blob(px, py, R(3.5, 6), 0.4);
      if (i > ponds * 2) break;
    }
  } else if (type === 'coastal') {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const ang = Math.atan2(y - c, x - c);
        const edge = S * 0.43 + (noise2.fbm(Math.cos(ang) * 3 + 10, Math.sin(ang) * 3 + 10, 3) - 0.5) * S * 0.12;
        const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        if (d > edge) water[y * S + x] = 0.5 + (d - edge) / 3;
      }
    }
  } else if (type === 'oasis') {
    blob(c, c, S * 0.08, 0.3);
  } else if (type === 'highland') {
    for (let i = 0; i < 4; i++) {
      const px = R(12, S - 12), py = R(12, S - 12);
      if (nearStart(px, py, 18)) continue;
      blob(px, py, R(3, 5.5), 0.4);
    }
  } else if (type === 'arabia') {
    for (let i = 0; i < 2; i++) {
      const px = R(12, S - 12), py = R(12, S - 12);
      if (nearStart(px, py, 20)) continue;
      blob(px, py, R(2.5, 4), 0.4);
    }
  }
  // keep start areas dry
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (distStart(x, y) < 13) water[y * S + x] = 0;
  }
  for (let i = 0; i < S * S; i++) if (water[i] > 0.5) g.terrain[i] = T_WATER;

  // shallows at lake edges for highland fords; also random fords in lakes
  // distance to land (for water tiles) and to water (for land tiles)
  const distW = bfsDist(g, (i) => g.terrain[i] === T_WATER);
  const distL = bfsDist(g, (i) => g.terrain[i] !== T_WATER);
  for (let i = 0; i < S * S; i++) {
    if (g.terrain[i] === T_WATER && distL[i] <= 1 && type !== 'coastal' && rnd() < 0.08) g.terrain[i] = T_SHALLOW;
  }

  // ---------------------------------------------------------------- terrain paint
  const desert = type === 'oasis';
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (g.terrain[i] === T_WATER || g.terrain[i] === T_SHALLOW) continue;
      const dn = noise.fbm(x * 0.06 + 50, y * 0.06 + 50, 3);
      if (distW[i] <= 2) g.terrain[i] = T_SAND;
      else if (desert) g.terrain[i] = dn > 0.58 ? T_DIRT : T_SAND;
      else if (dn > 0.71) g.terrain[i] = T_DIRT;
      else g.terrain[i] = T_GRASS;
    }
  }

  // ---------------------------------------------------------------- height
  const amp = type === 'highland' ? 3.2 : type === 'arabia' ? 1.6 : type === 'oasis' ? 0.9 : 1.1;
  const w = S + 1;
  const tileH = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let h = noise.fbm(x * 0.035, y * 0.035, 4);
      h = Math.max(0, h - 0.42) * amp * 2.2;
      // flatten start areas
      const ds = distStart(x + 0.5, y + 0.5);
      if (ds < 14) h *= smooth((ds - 7) / 7);
      // coastal fade
      if (g.terrain[i] !== T_WATER && g.terrain[i] !== T_SHALLOW) {
        const dw = distW[i];
        if (dw < 6) h *= smooth(dw / 6);
        tileH[i] = 0.22 + h;
      } else if (g.terrain[i] === T_SHALLOW) {
        tileH[i] = -0.12;
      } else {
        tileH[i] = -0.25 - Math.min(distL[i], 5) * 0.22;
      }
    }
  }
  for (let y = 0; y <= S; y++) {
    for (let x = 0; x <= S; x++) {
      let s = 0, n = 0, minH = 99;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || ty < 0 || tx >= S || ty >= S) continue;
        const v = tileH[ty * S + tx];
        s += v; n++;
        if (v < minH) minH = v;
      }
      let hh = n ? s / n : 0;
      if (minH < 0) hh = Math.min(hh, minH * 0.6 + hh * 0.4);
      g.height[y * w + x] = hh;
    }
  }

  // ---------------------------------------------------------------- placement helpers
  const used = new Uint8Array(S * S); // resources & reserved
  for (const s of starts) {
    for (let y = s.y - 1; y < s.y + 5; y++) for (let x = s.x - 1; x < s.x + 5; x++) if (g.inb(x, y)) used[y * S + x] = 2;
  }
  const land = (x: number, y: number) => g.inb(x, y) && g.terrain[y * S + x] !== T_WATER && g.terrain[y * S + x] !== T_SHALLOW;
  const free = (x: number, y: number) => land(x, y) && !used[y * S + x];
  const nodes: GenNode[] = [];
  const animals: GenAnimal[] = [];
  const relics: { x: number; y: number }[] = [];
  const putNode = (t: NodeKind, x: number, y: number) => {
    used[y * S + x] = 1;
    nodes.push({ t, x, y });
  };
  const areaFree = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!free(x + dx, y + dy)) return false;
    return true;
  };
  /** Clump of n tiles grown from (x,y). */
  const clump = (t: NodeKind, x: number, y: number, n: number) => {
    const cells: [number, number][] = [[x, y]];
    const set = new Set<number>([y * S + x]);
    let guard = 0;
    while (cells.length < n && guard++ < n * 30) {
      const [bx, by] = cells[Math.floor(rnd() * cells.length)];
      const d = Math.floor(rnd() * 4);
      const nx = bx + [1, -1, 0, 0][d], ny = by + [0, 0, 1, -1][d];
      if (!free(nx, ny) || set.has(ny * S + nx)) continue;
      set.add(ny * S + nx);
      cells.push([nx, ny]);
    }
    for (const [cx2, cy2] of cells) if (free(cx2, cy2)) putNode(t, cx2, cy2);
    return cells.length;
  };
  const placeAround = (s: GenStart, dmin: number, dmax: number, clear: number, fn: (x: number, y: number) => void, avoidOthers = 18, tries = 80) => {
    for (let k = 0; k < tries; k++) {
      const ang = rnd() * Math.PI * 2;
      const d = R(dmin, dmax);
      const x = Math.round(s.cx + Math.cos(ang) * d), y = Math.round(s.cy + Math.sin(ang) * d);
      if (!areaFree(x, y, clear)) continue;
      if (starts.some((o) => o !== s && Math.hypot(o.cx - x, o.cy - y) < avoidOthers)) continue;
      fn(x, y);
      return true;
    }
    return false;
  };

  // ---------------------------------------------------------------- per-player resources
  starts.forEach((s, pi) => {
    // sheep near TC
    for (let k = 0; k < 4; k++) {
      const ang = rnd() * Math.PI * 2, d = R(4, 6);
      const x = s.cx + Math.cos(ang) * d, y = s.cy + Math.sin(ang) * d;
      if (land(Math.floor(x), Math.floor(y))) animals.push({ t: 'sheep', x, y, owner: pi + 1 });
    }
    placeAround(s, 7, 9, 1, (x, y) => clump('berry', x, y, 6));
    placeAround(s, 8, 10, 1, (x, y) => clump('gold', x, y, 7));
    placeAround(s, 9, 12, 1, (x, y) => clump('stone', x, y, 5));
    placeAround(s, 14, 19, 1, (x, y) => clump('gold', x, y, 4));
    placeAround(s, 15, 20, 1, (x, y) => clump('stone', x, y, 4));
    // main woodlines
    placeAround(s, 10, 13, 2, (x, y) => clump('tree', x, y, 38), 20);
    placeAround(s, 12, 16, 2, (x, y) => clump('tree', x, y, 26), 20);
    placeAround(s, 14, 18, 2, (x, y) => clump('tree', x, y, 20), 20);
    // wildlife
    placeAround(s, 12, 18, 1, (x, y) => { for (let k = 0; k < 2; k++) animals.push({ t: 'sheep', x: x + 0.5 + k * 0.6, y: y + 0.5, owner: 0 }); });
    placeAround(s, 14, 20, 1, (x, y) => { for (let k = 0; k < 2; k++) animals.push({ t: 'sheep', x: x + 0.5, y: y + 0.5 + k * 0.6, owner: 0 }); });
    placeAround(s, 15, 22, 2, (x, y) => { for (let k = 0; k < 4; k++) animals.push({ t: 'deer', x: x + R(-1, 1), y: y + R(-1, 1) }); });
    placeAround(s, 13, 18, 1, (x, y) => animals.push({ t: 'boar', x: x + 0.5, y: y + 0.5 }));
    placeAround(s, 15, 20, 1, (x, y) => animals.push({ t: 'boar', x: x + 0.5, y: y + 0.5 }));
  });

  // ---------------------------------------------------------------- forests
  const forestDensity = type === 'black_forest' ? 0.43 : type === 'arabia' ? 0.69 : type === 'oasis' ? 0.7 : 0.64;
  const clearR = type === 'black_forest' ? 15 : 13;
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      if (!free(x, y)) continue;
      const f = noise2.fbm(x * 0.08 + 7, y * 0.08 + 3, 4);
      if (f < 1 - forestDensity + 0.3) continue;
      if (distStart(x, y) < clearR) continue;
      putNode('tree', x, y);
    }
  }
  if (type === 'black_forest') {
    // carve lanes between players and to centre so armies can meet
    for (let i = 0; i < starts.length; i++) {
      const a = starts[i];
      carveLane(a.cx, a.cy, c, c);
      const b = starts[(i + 1) % starts.length];
      if (starts.length > 2 || i === 0) carveLane(a.cx, a.cy, b.cx, b.cy);
    }
  }
  if (type === 'oasis') {
    // palm ring around oasis
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d > S * 0.09 && d < S * 0.14 && free(x, y) && rnd() < 0.55) putNode('tree', x, y);
    }
  }
  function carveLane(x0: number, y0: number, x1: number, y1: number) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let t = 0; t <= len; t += 0.5) {
      const px = x0 + ((x1 - x0) * t) / len + Math.sin(t * 0.15) * 3;
      const py = y0 + ((y1 - y0) * t) / len + Math.cos(t * 0.13) * 3;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = Math.round(px + dx), y = Math.round(py + dy);
        if (!g.inb(x, y)) continue;
        const i = y * S + x;
        if (used[i] === 1) {
          used[i] = 0;
          const ni = nodes.findIndex((n) => n.x === x && n.y === y);
          if (ni >= 0 && nodes[ni].t === 'tree') nodes.splice(ni, 1);
          else if (ni >= 0) used[i] = 1;
        }
      }
    }
  }

  // ---------------------------------------------------------------- neutral resources
  const extra = Math.round((S * S) / 1600);
  for (let k = 0, placed = 0; k < extra * 20 && placed < extra; k++) {
    const x = RI(6, S - 7), y = RI(6, S - 7);
    if (distStart(x, y) < 22 || !areaFree(x, y, 2)) continue;
    clump(rnd() < 0.6 ? 'gold' : 'stone', x, y, RI(4, 6));
    placed++;
  }
  // relics
  const nRelics = S >= 120 ? 5 : 3;
  for (let k = 0; k < 400 && relics.length < nRelics; k++) {
    const x = RI(5, S - 6), y = RI(5, S - 6);
    if (distStart(x, y) < 25 || !areaFree(x, y, 1)) continue;
    if (relics.some((r) => Math.hypot(r.x - x, r.y - y) < S / 5)) continue;
    used[y * S + x] = 3;
    relics.push({ x: x + 0.5, y: y + 0.5 });
  }
  // extra wildlife
  for (let k = 0, n = 0; k < 200 && n < Math.round(S / 30); k++) {
    const x = RI(5, S - 6), y = RI(5, S - 6);
    if (distStart(x, y) < 24 || !areaFree(x, y, 1)) continue;
    animals.push({ t: 'wolf', x: x + 0.5, y: y + 0.5 });
    n++;
  }
  for (let k = 0, n = 0; k < 200 && n < Math.round(S / 25); k++) {
    const x = RI(5, S - 6), y = RI(5, S - 6);
    if (distStart(x, y) < 22 || !areaFree(x, y, 2)) continue;
    for (let j = 0; j < 3; j++) animals.push({ t: 'deer', x: x + R(-1.5, 1.5), y: y + R(-1.5, 1.5) });
    n++;
  }

  // ---------------------------------------------------------------- fish
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (g.terrain[i] !== T_WATER) continue;
      const dl = distL[i];
      if (dl === 1 && rnd() < 0.025) nodes.push({ t: 'fish', x, y });
      else if (dl >= 3 && dl <= 7 && rnd() < 0.012) nodes.push({ t: 'fish', x, y });
    }
  }
  // remove overlapping fish
  {
    const seen = new Set<number>();
    for (let k = nodes.length - 1; k >= 0; k--) {
      const n = nodes[k];
      if (n.t !== 'fish') continue;
      let close = false;
      for (const s2 of seen) {
        const sx = s2 % S, sy = (s2 / S) | 0;
        if (Math.abs(sx - n.x) < 3 && Math.abs(sy - n.y) < 3) { close = true; break; }
      }
      if (close) nodes.splice(k, 1);
      else seen.add(n.y * S + n.x);
    }
  }

  // forest floor under trees
  for (const n of nodes) {
    if (n.t === 'tree') {
      const i = n.y * S + n.x;
      if (g.terrain[i] === T_GRASS || g.terrain[i] === T_DIRT) g.terrain[i] = T_FOREST;
    }
  }
  if (type === 'highland') {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (g.terrain[i] === T_GRASS && tileH[i] > 2.4) g.terrain[i] = T_SNOW;
    }
  }

  // connectivity: make sure all starts share a land region (carve shallows if needed)
  g.computeRegions();
  const r0 = g.region[starts[0].cy * S + starts[0].cx];
  for (const s of starts) {
    if (g.region[s.cy * S + s.cx] === r0) continue;
    const a = starts[0];
    const len = Math.hypot(s.cx - a.cx, s.cy - a.cy);
    for (let t = 0; t <= len; t += 0.5) {
      const x = Math.round(a.cx + ((s.cx - a.cx) * t) / len), y = Math.round(a.cy + ((s.cy - a.cy) * t) / len);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (g.inb(x + dx, y + dy) && g.terrain[(y + dy) * S + x + dx] === T_WATER) g.terrain[(y + dy) * S + x + dx] = T_SHALLOW;
      }
    }
    g.computeRegions();
  }

  return { grid: g, starts, nodes, animals, relics };
}

function smooth(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function bfsDist(g: Grid, isSource: (i: number) => boolean): Int32Array {
  const S = g.size, n = S * S;
  const d = new Int32Array(n).fill(9999);
  const q = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) if (isSource(i)) { d[i] = 0; q[qt++] = i; }
  while (qh < qt) {
    const c = q[qh++];
    const cx = c % S, cy = (c / S) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + [1, -1, 0, 0][k], ny = cy + [0, 0, 1, -1][k];
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const ni = ny * S + nx;
      if (d[ni] > d[c] + 1) { d[ni] = d[c] + 1; q[qt++] = ni; }
    }
  }
  return d;
}

export { T_DIRT, T_FOREST, T_GRASS, T_SAND, T_SHALLOW, T_SNOW, T_WATER };
