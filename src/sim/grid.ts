// Map grid, passability and A* pathfinding.

export const T_GRASS = 0;
export const T_WATER = 1;
export const T_SHALLOW = 2;
export const T_SAND = 3;
export const T_DIRT = 4;
export const T_FOREST = 5;
export const T_SNOW = 6;

export class Grid {
  size: number;
  terrain: Uint8Array;
  /** Corner heights, (size+1)^2 */
  height: Float32Array;
  /** Id of building / resource occupying a tile (0 = none). */
  occ: Int32Array;
  /** Land movement: 0 free, 1 blocked, 2 gate (passable for owner & allies). */
  block: Uint8Array;
  /** Water movement: 0 free, 1 blocked. */
  wblock: Uint8Array;
  gateOwner: Int8Array;
  /** Land connectivity region labels (recomputed lazily). */
  region: Int32Array;
  regionDirty = true;

  constructor(size: number) {
    this.size = size;
    const n = size * size;
    this.terrain = new Uint8Array(n);
    this.height = new Float32Array((size + 1) * (size + 1));
    this.occ = new Int32Array(n);
    this.block = new Uint8Array(n);
    this.wblock = new Uint8Array(n);
    this.gateOwner = new Int8Array(n);
    this.region = new Int32Array(n);
  }

  inb(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }
  idx(x: number, y: number) {
    return y * this.size + x;
  }
  isWater(i: number) {
    const t = this.terrain[i];
    return t === T_WATER;
  }
  landOk(i: number, allied?: (o: number) => boolean) {
    if (this.terrain[i] === T_WATER) return false;
    const b = this.block[i];
    if (b === 0) return true;
    if (b === 2 && allied) return allied(this.gateOwner[i]);
    return false;
  }
  waterOk(i: number) {
    const t = this.terrain[i];
    return (t === T_WATER || t === T_SHALLOW) && this.wblock[i] === 0;
  }
  passable(x: number, y: number, naval: boolean, allied?: (o: number) => boolean) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (!this.inb(tx, ty)) return false;
    const i = ty * this.size + tx;
    return naval ? this.waterOk(i) : this.landOk(i, allied);
  }

  /** Bilinear height at a world position. */
  h(x: number, y: number) {
    const s = this.size;
    if (x < 0) x = 0; if (y < 0) y = 0; if (x > s) x = s; if (y > s) y = s;
    const ix = Math.min(s - 1, Math.floor(x)), iy = Math.min(s - 1, Math.floor(y));
    const fx = x - ix, fy = y - iy;
    const w = s + 1;
    const h00 = this.height[iy * w + ix], h10 = this.height[iy * w + ix + 1];
    const h01 = this.height[(iy + 1) * w + ix], h11 = this.height[(iy + 1) * w + ix + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy;
  }

  /** Land regions (ignoring gates & buildings except walls are considered passable) for reachability checks. */
  computeRegions() {
    const s = this.size, n = s * s;
    this.region.fill(-1);
    let label = 0;
    const stack: number[] = [];
    for (let i = 0; i < n; i++) {
      if (this.region[i] !== -1 || this.terrain[i] === T_WATER) continue;
      this.region[i] = label;
      stack.push(i);
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % s, cy = (c / s) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = cx + DX4[d], ny = cy + DY4[d];
          if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue;
          const ni = ny * s + nx;
          if (this.region[ni] !== -1 || this.terrain[ni] === T_WATER) continue;
          this.region[ni] = label;
          stack.push(ni);
        }
      }
      label++;
    }
    this.regionDirty = false;
  }
}

const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1];
const DY8 = [0, 0, 1, -1, 1, -1, 1, -1];
const COST8 = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

export interface Goal {
  x0: number; y0: number; x1: number; y1: number; // continuous rect
  range: number;
}

function rectDist(px: number, py: number, g: Goal) {
  const dx = px < g.x0 ? g.x0 - px : px > g.x1 ? px - g.x1 : 0;
  const dy = py < g.y0 ? g.y0 - py : py > g.y1 ? py - g.y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}
export { rectDist };

// Reusable A* buffers
let bufSize = 0;
let gScore: Float32Array;
let fHeap: Int32Array;
let fKey: Float32Array;
let came: Int32Array;
let stamp: Uint32Array;
let closed: Uint32Array;
let gen = 1;

function ensure(n: number) {
  if (bufSize >= n) return;
  bufSize = n;
  gScore = new Float32Array(n);
  fHeap = new Int32Array(n * 2);
  fKey = new Float32Array(n * 2);
  came = new Int32Array(n);
  stamp = new Uint32Array(n);
  closed = new Uint32Array(n);
}

export interface PathResult {
  pts: number[]; // x,y pairs (tile centres / exact end)
  reached: boolean;
}

/**
 * A* on the tile grid. Returns waypoints (tile centres) from start to the goal (or the closest
 * reachable tile if the goal is unreachable). The start tile is never checked for passability.
 */
export function findPath(
  g: Grid,
  sx: number, sy: number,
  goal: Goal,
  naval: boolean,
  allied: ((o: number) => boolean) | undefined,
  maxNodes = 9000,
): PathResult {
  const s = g.size;
  ensure(s * s);
  gen++;
  if (gen > 0xfffffff0) { gen = 1; stamp.fill(0); closed.fill(0); }
  const stx = Math.max(0, Math.min(s - 1, Math.floor(sx)));
  const sty = Math.max(0, Math.min(s - 1, Math.floor(sy)));
  const start = sty * s + stx;
  const gcx = (goal.x0 + goal.x1) / 2, gcy = (goal.y0 + goal.y1) / 2;

  let heapLen = 0;
  const push = (node: number, f: number) => {
    let i = heapLen++;
    fHeap[i] = node; fKey[i] = f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fKey[p] <= fKey[i]) break;
      const tn = fHeap[p]; fHeap[p] = fHeap[i]; fHeap[i] = tn;
      const tk = fKey[p]; fKey[p] = fKey[i]; fKey[i] = tk;
      i = p;
    }
  };
  const pop = () => {
    const top = fHeap[0];
    heapLen--;
    if (heapLen > 0) {
      fHeap[0] = fHeap[heapLen]; fKey[0] = fKey[heapLen];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heapLen && fKey[l] < fKey[m]) m = l;
        if (r < heapLen && fKey[r] < fKey[m]) m = r;
        if (m === i) break;
        const tn = fHeap[m]; fHeap[m] = fHeap[i]; fHeap[i] = tn;
        const tk = fKey[m]; fKey[m] = fKey[i]; fKey[i] = tk;
        i = m;
      }
    }
    return top;
  };
  const ok = (i: number) => (naval ? g.waterOk(i) : g.landOk(i, allied));

  stamp[start] = gen;
  gScore[start] = 0;
  came[start] = -1;
  const h0 = rectDist(stx + 0.5, sty + 0.5, goal);
  push(start, h0);
  let best = start, bestH = h0;
  let found = -1;
  let expanded = 0;

  while (heapLen > 0) {
    const cur = pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    const cx = cur % s, cy = (cur / s) | 0;
    const hd = rectDist(cx + 0.5, cy + 0.5, goal);
    if (hd <= goal.range) { found = cur; break; }
    if (hd < bestH || (hd === bestH && gScore[cur] < gScore[best])) { bestH = hd; best = cur; }
    if (++expanded > maxNodes) break;
    const gc = gScore[cur];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX8[d], ny = cy + DY8[d];
      if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue;
      const ni = ny * s + nx;
      if (closed[ni] === gen) continue;
      if (!ok(ni)) continue;
      if (d >= 4 && cur !== start) {
        // no corner cutting (except when leaving the start tile, so units can't get trapped in pockets)
        if (!ok(cy * s + nx) || !ok(ny * s + cx)) continue;
      }
      const ng = gc + COST8[d];
      if (stamp[ni] === gen && ng >= gScore[ni]) continue;
      stamp[ni] = gen;
      gScore[ni] = ng;
      came[ni] = cur;
      const hx = Math.abs(nx + 0.5 - gcx), hy = Math.abs(ny + 0.5 - gcy);
      // octile to centre, minus rect radius-ish; keep admissible-ish by using rectDist
      const hh = Math.max(rectDist(nx + 0.5, ny + 0.5, goal) - goal.range, 0);
      void hx; void hy;
      push(ni, ng + hh * 1.001);
    }
  }
  const end = found >= 0 ? found : best;
  const tiles: number[] = [];
  let c = end;
  while (c !== -1) {
    tiles.push(c);
    c = came[c];
    if (tiles.length > s * s) break;
  }
  tiles.reverse();
  const pts: number[] = [];
  for (let i = 1; i < tiles.length; i++) {
    const t = tiles[i];
    pts.push((t % s) + 0.5, ((t / s) | 0) + 0.5);
  }
  return { pts, reached: found >= 0 };
}

/** Is a straight segment walkable (samples along the line with a small lateral margin)? */
export function lineClear(g: Grid, x0: number, y0: number, x1: number, y1: number, naval: boolean, allied?: (o: number) => boolean, margin = 0.18) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return true;
  const steps = Math.ceil(len / 0.25);
  const nx = (-dy / len) * margin, ny = (dx / len) * margin;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + dx * t, py = y0 + dy * t;
    if (!g.passable(px, py, naval, allied)) return false;
    if (margin > 0) {
      if (!g.passable(px + nx, py + ny, naval, allied)) return false;
      if (!g.passable(px - nx, py - ny, naval, allied)) return false;
    }
  }
  return true;
}

/** String-pull a waypoint list starting from (sx, sy). */
export function smoothPath(g: Grid, sx: number, sy: number, pts: number[], naval: boolean, allied?: (o: number) => boolean): number[] {
  if (pts.length <= 2) return pts;
  const out: number[] = [];
  let ax = sx, ay = sy;
  let i = 0;
  const n = pts.length / 2;
  while (i < n) {
    // farthest visible waypoint from (ax, ay)
    let j = n - 1;
    for (; j > i; j--) {
      if (lineClear(g, ax, ay, pts[j * 2], pts[j * 2 + 1], naval, allied)) break;
    }
    out.push(pts[j * 2], pts[j * 2 + 1]);
    ax = pts[j * 2]; ay = pts[j * 2 + 1];
    i = j + 1;
  }
  return out;
}

/** Nearest tile (centre) passable for the domain, searching in rings. */
export function nearestFree(g: Grid, x: number, y: number, naval: boolean, maxR = 12, allied?: (o: number) => boolean): [number, number] | null {
  const tx = Math.floor(x), ty = Math.floor(y);
  for (let r = 0; r <= maxR; r++) {
    let bestD = Infinity, bx = 0, by = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx, ny = ty + dy;
        if (!g.inb(nx, ny)) continue;
        const i = ny * g.size + nx;
        if (naval ? !g.waterOk(i) : !g.landOk(i, allied)) continue;
        const d = (nx + 0.5 - x) ** 2 + (ny + 0.5 - y) ** 2;
        if (d < bestD) { bestD = d; bx = nx + 0.5; by = ny + 0.5; }
      }
    }
    if (bestD < Infinity) return [bx, by];
  }
  return null;
}
