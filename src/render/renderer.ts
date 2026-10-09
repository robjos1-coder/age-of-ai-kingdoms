import * as THREE from 'three';
import { NODE_DEFS, buildingDef, unitDef, type BuildingKey } from '../data/defs';
import type { Entity, Game } from '../sim/game';
import { unitStats, buildingStats } from '../sim/stats';
import type { Building, GameEvent, Unit } from '../sim/types';
import { Batches, applyFog, type FogUniforms, type MatKind } from './batches';
import { getModel } from './models';
import { Terrain, WATER_Y } from './terrain';

export type Quality = 'low' | 'medium' | 'high';

interface Particle {
  key: string;
  mat: MatKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  g: number;
  life: number; max: number;
  s0: number; s1: number;
  c0: THREE.Color; c1?: THREE.Color;
  rot: number; spin: number;
}

export interface ViewState {
  selection: Set<number>;
  hover: number;
  ghost: { type: BuildingKey; x: number; y: number; ok: boolean; tiles?: [number, number][] } | null;
  markers: { x: number; y: number; t: number; color: string }[];
  flashIds: Map<number, number>;
}

const SKY = new THREE.Color('#9ec9e8');
const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const C_SEL = new THREE.Color('#5dff6a');
const C_ENEMY = new THREE.Color('#ff4a3d');
const C_ALLY = new THREE.Color('#5ad0ff');
const C_NEUTRAL = new THREE.Color('#ffe65a');
const C_HPBG = new THREE.Color('#1a1a1a');
const C_HP = new THREE.Color('#3be05a');
const C_HPLOW = new THREE.Color('#ffb02e');
const C_HPCRIT = new THREE.Color('#ff3b2e');
const C_PROG = new THREE.Color('#5ab8ff');
const C_FLASH = new THREE.Color(1.7, 1.5, 1.5);
const C_GHOST_OK = new THREE.Color('#6dff7a');
const C_GHOST_BAD = new THREE.Color('#ff5a4a');

export class Renderer {
  canvas: HTMLCanvasElement;
  gl: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  batches: Batches;
  terrain: Terrain;
  fog: FogUniforms = { fogMap: { value: null }, fogSize: { value: 1 } };
  game: Game;
  quality: Quality = 'high';

  // camera state
  tx = 0;
  tz = 0;
  yaw = Math.PI / 4;
  elev = 0.72;
  zoom = 20;
  minZoom = 7;
  maxZoom = 52;
  width = 1;
  height = 1;

  particles: Particle[] = [];
  view: ViewState;
  private teamColors: THREE.Color[] = [];
  private lastFogT = -1;
  time = 0;
  private bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private mats: Record<MatKind, THREE.Material>;
  private iconRT: THREE.WebGLRenderTarget | null = null;
  private iconCache = new Map<string, string>();
  biome: string;

  constructor(canvas: HTMLCanvasElement, game: Game, view: ViewState, quality: Quality) {
    this.canvas = canvas;
    this.game = game;
    this.view = view;
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.15;
    this.gl.shadowMap.enabled = quality !== 'low';
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = SKY;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);

    this.hemi = new THREE.HemisphereLight('#dbeeff', '#5a4a32', 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
    applyFog(lit, this.fog);
    this.mats = {
      lit,
      unlit: new THREE.MeshBasicMaterial({ vertexColors: false, transparent: true, opacity: 0.9, depthWrite: false }),
      add: new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      overlay: new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true }),
      ghost: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }),
    };
    this.batches = new Batches(this.scene, this.mats);
    this.batches.setShadows(quality !== 'low');
    this.biome = game.settings.mapType === 'oasis' ? 'palm' : '';
    this.terrain = new Terrain(this.scene, game.grid, this.fog, game.settings.mapType === 'oasis');
    for (const p of game.players) this.teamColors[p.id] = new THREE.Color(p.color);
    this.resize();
    // start on the human town center
    const tc = [...game.buildings.values()].find((b) => b.o === game.human && b.t === 'town_center');
    if (tc) { const [x, y] = game.bcenter(tc); this.tx = x; this.tz = y + 1; }
    else { this.tx = game.grid.size / 2; this.tz = game.grid.size / 2; }
    this.updateCamera();
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.gl.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    this.batches.setShadows(q !== 'low');
    const sm = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget; }
    this.sun.shadow.mapSize.set(sm, sm);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w; this.height = h;
    const dpr = window.devicePixelRatio || 1;
    this.gl.setPixelRatio(this.quality === 'high' ? Math.min(dpr, 2) : this.quality === 'medium' ? Math.min(dpr, 1.5) : 1);
    this.gl.setSize(w, h, false);
    this.updateCamera();
  }

  // ------------------------------------------------------------------ camera

  updateCamera() {
    const S = this.game.grid.size;
    this.tx = Math.max(0, Math.min(S, this.tx));
    this.tz = Math.max(0, Math.min(S, this.tz));
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    const aspect = this.width / this.height;
    const halfH = this.zoom / 2;
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    const D = 80;
    const ce = Math.cos(this.elev), se = Math.sin(this.elev);
    const ty = this.game.grid.h(this.tx, this.tz);
    this.camera.position.set(this.tx + Math.sin(this.yaw) * ce * D, ty + se * D, this.tz + Math.cos(this.yaw) * ce * D);
    this.camera.lookAt(this.tx, ty, this.tz);
    this.camera.updateMatrixWorld();
    // sun follows
    const sd = new THREE.Vector3(-0.55, 1, 0.35).normalize();
    this.sun.position.set(this.tx + sd.x * 60, ty + sd.y * 60, this.tz + sd.z * 60);
    this.sun.target.position.set(this.tx, ty, this.tz);
    const r = this.zoom * Math.max(1, aspect) * 0.8 + 4;
    const sc = this.sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 160;
    sc.updateProjectionMatrix();
    // view bounds on ground (for culling)
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => this.groundAt((x * 0.5 + 0.5) * this.width, (-y * 0.5 + 0.5) * this.height, 0.4));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (!p) continue;
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    this.bounds = { x0: x0 - 4, y0: y0 - 4, x1: x1 + 4, y1: y1 + 6 };
  }

  pan(dxPx: number, dyPx: number) {
    const upp = this.zoom / this.height;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const k = 1 / Math.sin(this.elev);
    this.tx -= rx * dxPx * upp - fx * dyPx * upp * k;
    this.tz -= rz * dxPx * upp - fz * dyPx * upp * k;
    this.updateCamera();
  }

  zoomBy(f: number, sx?: number, sy?: number) {
    const before = sx !== undefined ? this.groundAt(sx, sy!) : null;
    this.zoom *= f;
    this.updateCamera();
    if (before && sx !== undefined) {
      const after = this.groundAt(sx, sy!);
      if (after) { this.tx += before.x - after.x; this.tz += before.y - after.y; this.updateCamera(); }
    }
  }

  rotate(d: number) {
    this.yaw += d;
    this.updateCamera();
  }

  lookAt(x: number, y: number) {
    this.tx = x; this.tz = y;
    this.updateCamera();
  }

  /** Ground point (sim x,y) under a screen pixel. */
  groundAt(sx: number, sy: number, fixedH?: number): { x: number; y: number } | null {
    const ndc = new THREE.Vector2((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-5) return null;
    let h = fixedH ?? 0.3;
    let x = 0, z = 0;
    for (let i = 0; i < (fixedH !== undefined ? 1 : 5); i++) {
      const t = (h - o.y) / d.y;
      x = o.x + d.x * t; z = o.z + d.z * t;
      if (fixedH !== undefined) break;
      h = Math.max(WATER_Y, this.game.grid.h(x, z));
    }
    return { x, y: z };
  }

  toScreen(x: number, y: number, h: number): { x: number; y: number } {
    tmpV.set(x, h, y).project(this.camera);
    return { x: (tmpV.x * 0.5 + 0.5) * this.width, y: (-tmpV.y * 0.5 + 0.5) * this.height };
  }

  pxPerUnit() {
    return this.height / this.zoom;
  }

  // ------------------------------------------------------------------ picking

  unitRenderPos(u: Unit, alpha: number): [number, number] {
    return [u.px + (u.x - u.px) * alpha, u.py + (u.y - u.py) * alpha];
  }

  pickEntity(sx: number, sy: number, alpha = 1): Entity | null {
    const g = this.game;
    const ppu = this.pxPerUnit();
    let best: Entity | null = null;
    let bestD = Infinity;
    const minR = 26;
    for (const u of g.units.values()) {
      if (u.dead !== undefined || u.inside) continue;
      if (!g.canSee(u)) continue;
      const [x, y] = this.unitRenderPos(u, alpha);
      if (x < this.bounds.x0 || x > this.bounds.x1 || y < this.bounds.y0 || y > this.bounds.y1) continue;
      const d = unitDef(u.t);
      const hh = this.unitY(u, x, y) + (d.radius > 0.4 ? 0.4 : 0.3);
      const p = this.toScreen(x, y, hh);
      const dist = Math.hypot(p.x - sx, p.y - sy);
      const r = Math.max(minR, d.radius * ppu * 1.4);
      if (dist < r && dist < bestD) { bestD = dist; best = u; }
    }
    if (best) return best;
    const gp = this.groundAt(sx, sy);
    for (const b of g.buildings.values()) {
      if (!g.canSee(b)) continue;
      const s = g.bsize(b);
      const [cx, cy] = g.bcenter(b);
      const m = getModel(this.buildingKey(b));
      const hgt = b.done ? m.height * 0.5 : 0.1;
      const p = this.toScreen(cx, cy, g.grid.h(cx, cy) + hgt);
      const r = (s * 0.55) * ppu;
      let dist = Math.hypot(p.x - sx, p.y - sy);
      if (gp && gp.x >= b.x - 0.1 && gp.x <= b.x + s + 0.1 && gp.y >= b.y - 0.1 && gp.y <= b.y + s + 0.1) dist = Math.min(dist, r * 0.5);
      if (dist < r && dist < bestD) { bestD = dist; best = b; }
    }
    if (best) return best;
    for (const r of g.relics.values()) {
      if (r.carrier || r.mon || !g.canSee(r)) continue;
      const p = this.toScreen(r.x, r.y, g.grid.h(r.x, r.y) + 0.2);
      const dist = Math.hypot(p.x - sx, p.y - sy);
      if (dist < minR && dist < bestD) { bestD = dist; best = r; }
    }
    if (best) return best;
    if (gp) {
      const tx = Math.floor(gp.x), ty = Math.floor(gp.y);
      // look at the tile and neighbours for a resource (trees are tall; prefer front tiles)
      for (const [dx, dy] of [[0, 0], [1, 1], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const x = tx + dx, y = ty + dy;
        if (!g.grid.inb(x, y)) continue;
        const id = g.grid.occ[y * g.grid.size + x];
        const n = id ? g.nodes.get(id) : undefined;
        if (n && g.canSee(n)) return n;
      }
    }
    return null;
  }

  unitsInRect(x0: number, y0: number, x1: number, y1: number, owner: number): Unit[] {
    const out: Unit[] = [];
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    for (const u of this.game.units.values()) {
      if (u.o !== owner || u.dead !== undefined || u.inside) continue;
      const p = this.toScreen(u.x, u.y, this.unitY(u, u.x, u.y) + 0.3);
      if (p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) out.push(u);
    }
    return out;
  }

  onScreen(x: number, y: number) {
    const p = this.toScreen(x, y, this.game.grid.h(x, y));
    return p.x >= 0 && p.y >= 0 && p.x <= this.width && p.y <= this.height;
  }

  // ------------------------------------------------------------------ helpers

  unitY(u: Unit, x: number, y: number) {
    const d = unitDef(u.t);
    if (d.naval) return WATER_Y + Math.sin(this.time * 1.6 + u.id) * 0.03 - 0.04;
    return Math.max(this.game.grid.h(x, y), d.naval ? WATER_Y : -0.2);
  }

  buildingKey(b: Building) {
    const age = this.game.players[b.o]?.age ?? 1;
    return `b:${b.t}:${Math.max(1, Math.min(4, age))}`;
  }

  unitKey(u: Unit, alpha: number): string {
    const d = unitDef(u.t);
    const g = this.game;
    let pose = 'idle';
    if (u.dead !== undefined) pose = 'dead';
    else if (u.anim === 'walk') {
      const rate = d.speed > 1.2 ? 7 : 5.5;
      pose = Math.floor(this.time * rate + u.id * 0.37) % 2 ? 'walk1' : 'walk2';
    } else if (u.anim === 'attack') {
      const since = g.time - (u.swing ?? -99);
      const st = u.o > 0 ? unitStats(g.players[u.o], u.t).reload : d.reload;
      if (since < 0.3) pose = 'atk2';
      else if (since > st - 0.6) pose = 'atk1';
      else pose = d.range > 0 ? 'atk1' : 'idle';
    } else if (u.anim === 'work') {
      pose = Math.floor(this.time * 2.2 + u.id * 0.3) % 2 ? 'work1' : 'work2';
    }
    void alpha;
    let variant = '';
    if (u.t === 'villager') {
      const carry = u.ca > 0.5 && u.anim === 'walk' ? (u.ct === 'food' ? 'food' : u.ct ?? 'none') : 'none';
      let gk: string = u.gk ?? 'none';
      if (u.task?.k === 'build' || u.task?.k === 'repair') gk = 'build';
      else if (!u.task) gk = carry !== 'none' ? (u.gk ?? 'none') : 'none';
      variant = `${gk}|${carry}|${u.fem ? 'f' : 'm'}`;
      if (pose === 'work1' || pose === 'work2') {
        if (gk === 'none') pose = 'idle';
      }
    } else if (u.t === 'monk') variant = u.relic ? 'relic' : '';
    else if (u.t === 'trebuchet') variant = u.packed ? 'packed' : 'deployed';
    return `u:${u.t}:${pose}:${variant}`;
  }

  // ------------------------------------------------------------------ events → particles

  handleEvent(e: GameEvent) {
    if (e.x === undefined || e.y === undefined) return;
    const g = this.game;
    if (!g.isVisible(e.x, e.y)) return;
    const h = g.grid.h(e.x, e.y);
    switch (e.k) {
      case 'hit':
        if (e.t === 'stone' || e.t === 'cannon') {
          for (let i = 0; i < 8; i++) this.puff(e.x, h + 0.1, e.y, '#9a8a74', 0.5, 0.25, 1.2);
          for (let i = 0; i < 6; i++) this.spark(e.x, h + 0.2, e.y, '#ffb347', 0.5);
        } else if (e.t === 'melee') {
          if (Math.random() < 0.5) this.spark(e.x, h + 0.35, e.y, '#fff2b0', 0.25);
        }
        break;
      case 'death':
        for (let i = 0; i < 4; i++) this.puff(e.x, h + 0.1, e.y, '#b8a888', 0.4, 0.15, 0.6);
        break;
      case 'collapse': {
        const s = buildingDef(e.t as BuildingKey)?.size ?? 2;
        for (let i = 0; i < 10 + s * 8; i++) this.puff(e.x + (Math.random() - 0.5) * s, h + Math.random() * s * 0.4, e.y + (Math.random() - 0.5) * s, '#a08f78', 0.9 + s * 0.2, 0.4 + s * 0.15, 2.2);
        for (let i = 0; i < s * 6; i++) this.chunk(e.x, h + 0.5, e.y);
        break;
      }
      case 'built':
        break;
      case 'convert':
        for (let i = 0; i < 12; i++) this.spark(e.x, h + 0.4, e.y, '#ffe68a', 0.9, 'add');
        break;
      case 'fire':
        if (e.t === 'cannon' || e.t === 'bullet') for (let i = 0; i < 3; i++) this.puff(e.x, h + 0.4, e.y, '#e0e0e0', 0.35, 0.1, 0.8);
        break;
    }
  }

  private puff(x: number, y: number, z: number, col: string, s1: number, s0: number, life: number) {
    this.particles.push({
      key: 'fx:puff', mat: 'lit', x, y, z,
      vx: (Math.random() - 0.5) * 0.8, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.8, g: -0.2,
      life, max: life, s0: s0 * 0.5, s1: s1 * 0.5, c0: new THREE.Color(col), rot: 0, spin: 0,
    });
  }

  private spark(x: number, y: number, z: number, col: string, life: number, mat: MatKind = 'add') {
    this.particles.push({
      key: 'fx:spark', mat, x, y, z,
      vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, g: 6,
      life, max: life, s0: 0.5, s1: 0.1, c0: new THREE.Color(col), rot: Math.random() * 6, spin: 8,
    });
  }

  private chunk(x: number, y: number, z: number) {
    this.particles.push({
      key: 'fx:chunk', mat: 'lit', x, y, z,
      vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, g: 9,
      life: 1.2, max: 1.2, s0: 1.2, s1: 0.8, c0: new THREE.Color('#8a7a6a'), rot: Math.random() * 6, spin: 6,
    });
  }

  private flame(x: number, y: number, z: number, size: number) {
    this.particles.push({
      key: 'fx:flame', mat: 'add', x: x + (Math.random() - 0.5) * size, y, z: z + (Math.random() - 0.5) * size,
      vx: 0, vy: 0.8 + Math.random() * 0.5, vz: 0, g: -0.5,
      life: 0.7, max: 0.7, s0: 0.35 * size, s1: 0.05, c0: new THREE.Color('#ff9a3a'), c1: new THREE.Color('#401000'), rot: Math.random() * 6, spin: 2,
    });
    if (Math.random() < 0.35) this.particles.push({
      key: 'fx:puff', mat: 'lit', x, y: y + 0.4, z,
      vx: 0.15, vy: 0.6, vz: 0.1, g: -0.1, life: 2.2, max: 2.2, s0: 0.1, s1: 0.45 * size, c0: new THREE.Color('#3a3a3a'), rot: 0, spin: 0,
    });
  }

  // ------------------------------------------------------------------ main render

  render(alpha: number, dt: number) {
    this.time += dt;
    const g = this.game;
    const B = this.batches;
    const b = this.bounds;
    const inView = (x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    this.terrain.animate(this.time);
    if (this.lastFogT !== g.time) {
      this.lastFogT = g.time;
      this.terrain.updateFog(g.explored, g.visible);
    }
    B.begin();
    const sel = this.view.selection;

    // decorations
    const S = g.grid.size;
    for (const d of this.terrain.decos) {
      if (!inView(d.x, d.y)) continue;
      const i = Math.floor(d.y) * S + Math.floor(d.x);
      if (g.grid.occ[i] || !g.explored[i]) continue;
      B.add(`d:${d.t}:${d.v}`, d.x, g.grid.h(d.x, d.y), d.y, d.rot, d.s, d.s, d.s, null, null, 'lit', false);
    }

    // resources
    for (const n of g.nodes.values()) {
      if (!inView(n.x + 0.5, n.y + 0.5) || !g.canSee(n)) continue;
      const x = n.x + 0.5, y = n.y + 0.5;
      const h = g.grid.h(x, y);
      if (n.t === 'tree') {
        if (n.amt < n.max) B.add(`n:stump:${n.v % 6}`, x, h, y, n.v);
        else B.add(`tree:${n.v % 4}:${this.biome}`, x, h, y, 0, 1, 1, 1, null, null, 'lit', true);
      } else if (n.t === 'fish') {
        if (!g.isVisible(x, y) && !g.isExplored(x, y)) continue;
        B.add('n:fish:0', x, WATER_Y, y, this.time * 0.6 + n.v, 1, 1, 1, null, null, 'lit', false);
      } else {
        const f = 0.55 + 0.45 * (n.amt / n.max);
        B.add(`n:${n.t}:${n.v % 5}`, x, h, y, n.v, f, f, f);
      }
    }
    // relics
    for (const r of g.relics.values()) {
      if (r.carrier || r.mon || !inView(r.x, r.y) || !g.canSee(r)) continue;
      const h = g.grid.h(r.x, r.y);
      B.add('n:relic:0', r.x, h, r.y, 0.3);
      if (Math.random() < dt * 3) this.spark(r.x + (Math.random() - 0.5) * 0.4, h + 0.4, r.y + (Math.random() - 0.5) * 0.4, '#ffe68a', 0.8);
    }

    // buildings
    for (const bl of g.buildings.values()) {
      const s = g.bsize(bl);
      const [cx, cy] = g.bcenter(bl);
      if (!inView(cx, cy) || !g.canSee(bl)) continue;
      const def = buildingDef(bl.t);
      const team = this.teamColors[bl.o];
      let h = def.water ? WATER_Y : g.grid.h(cx, cy);
      if (!def.water) {
        // sit on the lowest corner so nothing floats
        h = Math.min(h, g.grid.h(bl.x, bl.y), g.grid.h(bl.x + s, bl.y), g.grid.h(bl.x, bl.y + s), g.grid.h(bl.x + s, bl.y + s)) + 0.02;
      }
      const flash = this.view.flashIds.get(bl.id);
      const tint = flash && flash > this.time ? C_FLASH : null;
      const key = this.buildingKey(bl);
      if (!bl.done) {
        B.add(`found:${s}`, cx, h, cy, 0, 1, 1, 1, team, null, 'lit', false);
        if (bl.prog > 0) {
          const m = getModel(key);
          B.add(key, cx, h, cy, 0, 1, Math.max(0.04, bl.prog), 1, team, tint);
          if (bl.t !== 'farm' && !def.wall) B.add(`scaffold:${s}:${Math.max(0.6, Math.round(m.height * Math.min(1, bl.prog + 0.2) * 2) / 2)}`, cx, h, cy, 0, 1, 1, 1, null, null, 'lit', false);
        }
      } else {
        B.add(key, cx, h, cy, 0, 1, 1, 1, team, tint);
        if (bl.t === 'farm') {
          const maxF = 175 + 425;
          const f = Math.max(0.15, Math.min(1, (bl.food ?? 0) / Math.min(maxF, Math.max(175, bl.food ?? 0) + 1) + 0.25));
          tmpC.set('#7fbf3f').lerp(new THREE.Color('#e0c050'), 1 - Math.min(1, (bl.food ?? 0) / 300));
          B.add('fx:cropRow', cx, h + 0.06, cy, 0, 1, f, 1, null, tmpC, 'lit', false);
        }
        // damage fire
        const maxHp = buildingStats(g.players[bl.o], bl.t).hp;
        const frac = bl.hp / maxHp;
        if (frac < 0.66 && !def.wall && bl.t !== 'farm' && g.isVisible(cx, cy)) {
          const rate = (1 - frac) * 10 * s;
          if (Math.random() < rate * dt) this.flame(cx, h + getModel(key).height * (0.3 + Math.random() * 0.4), cy, s * 0.5);
        }
        if (bl.t === 'blacksmith' && Math.random() < dt * 2) this.particles.push({ key: 'fx:puff', mat: 'lit', x: cx - 0.9, y: h + 2.0, z: cy + 0.35, vx: 0.1, vy: 0.5, vz: 0.05, g: -0.1, life: 2.5, max: 2.5, s0: 0.08, s1: 0.3, c0: new THREE.Color('#8a8a8a'), rot: 0, spin: 0 });
        if (bl.t === 'town_center' && Math.random() < dt * 0.6) this.particles.push({ key: 'fx:puff', mat: 'lit', x: cx - 1.2, y: h + 1.8, z: cy - 1.2, vx: 0.1, vy: 0.4, vz: 0.05, g: -0.1, life: 2.5, max: 2.5, s0: 0.06, s1: 0.25, c0: new THREE.Color('#9a9a9a'), rot: 0, spin: 0 });
      }
      if (sel.has(bl.id)) {
        B.add('fx:ring', cx, h + 0.05, cy, 0, s * 0.72, 1, s * 0.72, null, this.ringColor(bl.o), 'unlit', false);
        if (bl.rally && bl.o === g.human) {
          B.add('fx:flag', bl.rally.x, g.grid.h(bl.rally.x, bl.rally.y), bl.rally.y, 0, 1, 1, 1, team);
        }
        this.hpBar(cx, h + Math.min(getModel(key).height + 0.3, 4.2), cy, bl.hp / buildingStats(g.players[bl.o], bl.t).hp, s * 0.5, bl.done ? null : bl.prog);
      }
    }
    // rubble
    g.rubble = g.rubble.filter((r) => g.time - r.t < 60);
    for (const r of g.rubble) {
      const cx = r.x + r.size / 2, cy = r.y + r.size / 2;
      if (!inView(cx, cy) || !g.isExplored(cx, cy)) continue;
      const sink = Math.max(0, (g.time - r.t - 50) * 0.02);
      B.add(`rubble:${r.size}`, cx, g.grid.h(cx, cy) - sink, cy, 0, 1, 1, 1, null, null, 'lit', false);
    }

    // units
    for (const u of g.units.values()) {
      if (u.inside) continue;
      const [x, y] = this.unitRenderPos(u, alpha);
      if (!inView(x, y)) continue;
      if (!g.canSee(u)) continue;
      const d = unitDef(u.t);
      let h = this.unitY(u, x, y);
      if (u.dead !== undefined && u.food === undefined) h -= Math.max(0, u.dead - 10) * 0.06;
      const team = u.o > 0 ? this.teamColors[u.o] : null;
      const tint = u.flash && u.flash > 0 ? C_FLASH : null;
      const key = this.unitKey(u, alpha);
      const sc = d.naval ? 1 : d.cls.includes('animal') ? 1 : 1.15;
      let pitch = 0;
      if (d.naval) pitch = Math.sin(this.time * 1.3 + u.id) * 0.04;
      B.add(key, x, h, y, -u.a, sc, sc, sc, team, tint, 'lit', u.dead === undefined, 0, pitch);
      if (u.t === 'sheep' && u.o > 0 && u.dead === undefined) {
        // tinted collar
        B.add('fx:disc', x, h + 0.02, y, 0, 0.12, 1, 0.12, null, team, 'unlit', false);
      }
      if (u.relic) {
        if (Math.random() < dt * 2) this.spark(x, h + 0.7, y, '#ffe68a', 0.7);
      }
      if (u.dead !== undefined) continue;
      if (sel.has(u.id) || this.view.hover === u.id) {
        const r = d.radius * 1.8 + 0.1;
        B.add('fx:ring', x, h + 0.03, y, 0, r, 1, r, null, this.ringColor(u.o), 'unlit', false);
      }
      const maxHp = u.o > 0 ? unitStats(g.players[u.o], u.t).hp : d.hp;
      const recent = u.hitT !== undefined && g.time - u.hitT < 3;
      if ((sel.has(u.id) || recent) && !d.cls.includes('animal') || (recent && u.o === 0 && u.t !== 'sheep')) {
        const top = getModel(key).height * sc;
        this.hpBar(x, h + top + 0.18, y, u.hp / maxHp, d.radius > 0.4 ? 0.5 : 0.32, null);
      }
    }

    // projectiles
    for (const p of g.projectiles) {
      if (p.t < 0) continue;
      const t = Math.min(1, (p.t + alpha * 0.1) / p.dur);
      const x = p.sx + (p.tx - p.sx) * t;
      const y = p.sy + (p.ty - p.sy) * t;
      if (!inView(x, y) || !g.isVisible(x, y)) continue;
      const dist = Math.hypot(p.tx - p.sx, p.ty - p.sy);
      const arcH = p.arc * dist;
      const z = p.sz + (p.tz - p.sz) * t + arcH * 4 * t * (1 - t);
      const dz = (p.tz - p.sz) + arcH * 4 * (1 - 2 * t);
      const yaw = -Math.atan2(p.ty - p.sy, p.tx - p.sx);
      const pitch = Math.atan2(dz, Math.max(0.01, dist));
      const key = 'fx:' + (p.kind === 'fire' ? 'fire' : p.kind);
      B.add(key, x, z, y, yaw, 1, 1, 1, null, null, p.kind === 'fire' || p.kind === 'bullet' ? 'add' : 'lit', false, 0, pitch);
    }

    // particles
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const k = 1 - p.life / p.max;
      const s = p.s0 + (p.s1 - p.s0) * k;
      let c = p.c0;
      if (p.c1) { tmpC.copy(p.c0).lerp(p.c1, k); c = tmpC; }
      if (p.mat === 'add') { tmpC.copy(c).multiplyScalar(1 - k); c = tmpC; }
      if (inView(p.x, p.z)) B.add(p.key, p.x, p.y, p.z, p.rot, s, s, s, null, c, p.mat, false);
      keep.push(p);
    }
    this.particles = keep.length > 1500 ? keep.slice(keep.length - 1500) : keep;

    // move markers
    this.view.markers = this.view.markers.filter((m) => this.time - m.t < 0.8);
    for (const m of this.view.markers) {
      const k = (this.time - m.t) / 0.8;
      tmpC.set(m.color).multiplyScalar(1 - k * 0.6);
      B.add('fx:marker', m.x, g.grid.h(m.x, m.y) + 0.05, m.y, 0, 1.4 - k * 0.8, 1, 1.4 - k * 0.8, null, tmpC, 'unlit', false);
    }

    // placement ghost
    const gh = this.view.ghost;
    if (gh) {
      const def = buildingDef(gh.type);
      const tiles = gh.tiles ?? [[gh.x, gh.y]];
      for (const [tx, ty] of tiles) {
        const cx = tx + def.size / 2, cy = ty + def.size / 2;
        const ok = gh.tiles ? g.canPlace(g.human, gh.type, tx, ty) : gh.ok;
        const h = def.water ? WATER_Y : g.grid.h(cx, cy);
        B.add(`b:${gh.type}:${g.players[g.human].age}`, cx, h, cy, 0, 1, 1, 1, null, ok ? C_GHOST_OK : C_GHOST_BAD, 'ghost', false);
        B.add('fx:tile', cx, h + 0.04, cy, 0, def.size, 1, def.size, null, ok ? C_GHOST_OK : C_GHOST_BAD, 'ghost', false);
      }
    }

    B.end();
    this.gl.render(this.scene, this.camera);
  }

  private ringColor(o: number) {
    const g = this.game;
    if (o === g.human) return C_SEL;
    if (o === 0) return C_NEUTRAL;
    return g.allied(o, g.human) ? C_ALLY : C_ENEMY;
  }

  private hpBar(x: number, y: number, z: number, frac: number, w: number, prog: number | null) {
    const B = this.batches;
    const q = this.camera.quaternion;
    const hgt = Math.max(0.05, this.zoom * 0.0045);
    const ww = Math.max(w, this.zoom * 0.02);
    tmpS.set(ww + 0.03, hgt + 0.03, 1);
    tmpM.compose(tmpV.set(x, y, z), q, tmpS);
    B.addMatrix('fx:quad', tmpM, null, C_HPBG, 'overlay', false);
    const f = Math.max(0, Math.min(1, prog ?? frac));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    tmpS.set(ww * f, hgt, 1);
    tmpM.compose(tmpV.set(x - right.x * ww * (1 - f) / 2, y - right.y * ww * (1 - f) / 2 + 0.001, z - right.z * ww * (1 - f) / 2), q, tmpS);
    const col = prog !== null ? C_PROG : frac > 0.5 ? C_HP : frac > 0.25 ? C_HPLOW : C_HPCRIT;
    B.addMatrix('fx:quad', tmpM, null, col, 'overlay', false);
  }

  flash(id: number) {
    this.view.flashIds.set(id, this.time + 0.15);
  }

  // ------------------------------------------------------------------ icons

  /** Render a model to a small image (used for UI buttons and portraits). */
  icon(key: string, color: string, size = 96): string {
    const ck = key + '|' + color + '|' + size;
    const hit = this.iconCache.get(ck);
    if (hit) return hit;
    if (!this.iconRT || this.iconRT.width !== size) {
      this.iconRT?.dispose();
      this.iconRT = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
    }
    const m = getModel(key);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#6a5a4a', 1.6));
    const dl = new THREE.DirectionalLight('#fff4e0', 2.6);
    dl.position.set(-2, 4, 3);
    scene.add(dl);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const tmat = new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(color) });
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(m.base, mat));
    if (m.team) grp.add(new THREE.Mesh(m.team, tmat));
    grp.rotation.y = -0.6;
    scene.add(grp);
    const box = new THREE.Box3().setFromObject(grp);
    box.min.y = Math.max(box.min.y, -0.05);
    const ctr = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const r = Math.max(sz.x * 0.8, sz.y, sz.z * 0.8) * 0.56;
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, 100);
    cam.position.set(ctr.x + 3, ctr.y + 2.2, ctr.z + 3);
    cam.lookAt(ctr);
    const prevBg = this.scene.background;
    scene.background = null;
    this.gl.setRenderTarget(this.iconRT);
    this.gl.setClearColor(0x000000, 0);
    this.gl.clear();
    const sh = this.gl.shadowMap.enabled;
    this.gl.shadowMap.enabled = false;
    this.gl.render(scene, cam);
    this.gl.shadowMap.enabled = sh;
    const buf = new Uint8Array(size * size * 4);
    this.gl.readRenderTargetPixels(this.iconRT, 0, 0, size, size, buf);
    this.gl.setRenderTarget(null);
    this.scene.background = prevBg;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      img.data.set(buf.subarray(src, src + size * 4), y * size * 4);
    }
    ctx.putImageData(img, 0, 0);
    const url = cv.toDataURL();
    mat.dispose(); tmat.dispose();
    this.iconCache.set(ck, url);
    return url;
  }

  dispose() {
    this.batches.dispose();
    this.terrain.dispose(this.scene);
    this.iconRT?.dispose();
    this.gl.dispose();
  }
}

export { NODE_DEFS };
