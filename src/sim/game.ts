// The authoritative single-player simulation.

import {
  BUILDINGS, CIVS, CIV_LIST, GATHER_RATE, GATHER_RES, LINES, NODE_DEFS, PLAYER_COLORS, RELIC_GOLD_PER_S, TECH_BY_ID, TRAIN_QUEUE_MAX, FISH_SHIP_CARRY,
  buildingDef, unitDef,
  type BuildingKey, type CivId, type Cost, type GatherKind, type NodeKind, type Res, type UnitClass, type UnitKey,
} from '../data/defs';
import { Grid, T_WATER, T_SHALLOW, findPath, smoothPath, nearestFree, rectDist, lineClear, type Goal } from './grid';
import { generateMap, mulberry32 } from './mapgen';
import { buildingStats, canAfford, eco, pay, refund, techCost, unitStats, clearStatCache } from './stats';
import type { Building, GameEvent, Player, Projectile, Relic, ResNode, Settings, Task, Unit } from './types';
import { AIController } from './ai';

export const TICK = 0.1;
const MAX_PATHS_PER_TICK = 14;
const CELL = 3;
const WONDER_TIME = 400;
const RELIC_TIME = 400;

export type Entity = Unit | Building | ResNode | Relic;

export class Game {
  settings: Settings;
  grid: Grid;
  players: Player[] = [];
  units = new Map<number, Unit>();
  buildings = new Map<number, Building>();
  nodes = new Map<number, ResNode>();
  relics = new Map<number, Relic>();
  projectiles: Projectile[] = [];
  events: GameEvent[] = [];
  time = 0;
  nextId = 1;
  market: Record<'food' | 'wood' | 'stone', number> = { food: 100, wood: 100, stone: 130 };
  human = 1;
  explored: Uint8Array;
  visible: Uint8Array;
  over = false;
  winner = 0;
  wonderT = new Map<number, number>();
  relicT = 0;
  relicHolder = 0;
  ais: AIController[] = [];
  /** Recent building collapses (for rubble visuals). */
  rubble: { x: number; y: number; size: number; t: number; type: BuildingKey }[] = [];
  rnd: () => number;
  tickCount = 0;
  /** Players with the 'aegis' cheat (instant build / train / research, fast gathering). */
  aegis = new Set<number>();

  private cellsW: number;
  private cells: Unit[][];
  private builders = new Map<number, number>();
  private buildersPrev = new Map<number, number>();
  private pathBudget = 0;
  private visTimer = 0;
  private lastAlert = -99;
  private housedT = -99;
  private diskCache = new Map<number, Int16Array>();

  constructor(settings: Settings, restore?: SaveData) {
    this.settings = settings;
    this.rnd = mulberry32(settings.seed ^ 0x9e3779b9);
    const gen = generateMap(settings, settings.players.length);
    this.grid = gen.grid;
    const S = settings.mapSize;
    this.explored = new Uint8Array(S * S);
    this.visible = new Uint8Array(S * S);
    this.cellsW = Math.ceil(S / CELL);
    this.cells = Array.from({ length: this.cellsW * this.cellsW }, () => []);

    // players (index 0 = Gaia)
    this.players.push(this.makePlayer(0, 'Gaia', '#888', 'britons', false, 0, 0));
    const usedCivs = new Set<CivId>();
    settings.players.forEach((ps, i) => {
      let civ = ps.civ;
      if (civ === 'random') {
        const pool = CIV_LIST.filter((c) => !usedCivs.has(c.id));
        civ = (pool.length ? pool : CIV_LIST)[Math.floor(this.rnd() * (pool.length || CIV_LIST.length))].id;
      }
      usedCivs.add(civ);
      const p = this.makePlayer(i + 1, ps.name, PLAYER_COLORS[ps.color], civ, ps.human, ps.team, ps.diff);
      this.players.push(p);
      if (ps.human) this.human = i + 1;
    });

    if (restore) {
      this.restore(restore);
    } else {
      this.populate(gen);
    }
    for (const p of this.players) if (p.id > 0 && !p.human) this.ais.push(new AIController(this, p.id));
    if (restore?.ai) this.ais.forEach((a, i) => a.load(restore.ai![i]));
    this.updateVisibility(true);
  }

  private makePlayer(id: number, name: string, color: string, civ: CivId, human: boolean, team: number, diff: number): Player {
    return {
      id, name, color, civ, human, team, diff,
      res: { food: 0, wood: 0, gold: 0, stone: 0 }, age: 1, techs: [], pop: 0, popCap: 0, defeated: false,
      stats: { kills: 0, losses: 0, razed: 0, bLost: 0, gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, ageT: [0, 0, 0, 0, 0], trained: 0, techs: 0, converted: 0 },
    };
  }

  private populate(gen: ReturnType<typeof generateMap>) {
    const st = this.settings;
    const startRes: Record<string, Record<Res, number>> = {
      standard: { food: 200, wood: 200, gold: 100, stone: 200 },
      medium: { food: 500, wood: 500, gold: 300, stone: 300 },
      high: { food: 1000, wood: 1000, gold: 700, stone: 700 },
    };
    for (const n of gen.nodes) this.addNode(n.t, n.x, n.y);
    for (const r of gen.relics) {
      const id = this.nextId++;
      this.relics.set(id, { id, k: 'relic', x: r.x, y: r.y });
    }
    gen.starts.forEach((s, i) => {
      const p = this.players[i + 1];
      p.res = { ...startRes[st.startRes] };
      if (p.civ === 'persians') { p.res.food += 50; p.res.wood += 50; }
      p.age = st.startAge;
      const civ = CIVS[p.civ];
      if (civ.freeTechs) for (const t of civ.freeTechs) if (TECH_BY_ID[t].age <= 4) p.techs.push(t);
      const tc = this.addBuilding('town_center', p.id, s.x, s.y, true);
      const nVil = st.startAge >= 3 ? 6 : 3;
      for (let k = 0; k < nVil; k++) {
        const ang = s.angle + Math.PI + (k - 1) * 0.5;
        this.spawnUnit('villager', p.id, s.cx + Math.cos(ang) * 3.2, s.cy + Math.sin(ang) * 3.2);
      }
      const ang = s.angle + Math.PI * 0.5;
      this.spawnUnit('scout_cavalry', p.id, s.cx + Math.cos(ang) * 3.5, s.cy + Math.sin(ang) * 3.5);
      if (st.startAge >= 2) {
        this.addBuilding('house', p.id, s.x - 3, s.y + 1, true);
        this.addBuilding('house', p.id, s.x + 5, s.y + 1, true);
      }
      void tc;
    });
    for (const a of gen.animals) {
      const u = this.spawnUnit(a.t, a.owner ?? 0, a.x, a.y);
      u.hx = a.x; u.hy = a.y;
    }
    this.recountPop();
    for (const p of this.players) if (p.id) p.stats.ageT[p.age] = 0;
    if (this.settings.reveal !== 'normal') this.explored.fill(1);
  }

  // ------------------------------------------------------------------ entity helpers

  get(id: number | undefined): Entity | undefined {
    if (!id) return undefined;
    return this.units.get(id) ?? this.buildings.get(id) ?? this.nodes.get(id) ?? this.relics.get(id);
  }

  allied(a: number, b: number) {
    if (a === b) return true;
    if (a === 0 || b === 0) return false;
    const pa = this.players[a], pb = this.players[b];
    return !!pa.team && pa.team === pb.team;
  }

  enemy(a: number, b: number) {
    return a !== 0 && b !== 0 && !this.allied(a, b);
  }

  alliedFn(o: number) {
    return (g: number) => this.allied(o, g);
  }

  addNode(t: NodeKind, x: number, y: number): ResNode {
    const id = this.nextId++;
    const n: ResNode = { id, k: 'r', t, x, y, amt: NODE_DEFS[t].amount, max: NODE_DEFS[t].amount, v: Math.floor(this.rnd() * 1000), seen: 0 };
    this.nodes.set(id, n);
    const i = y * this.grid.size + x;
    this.grid.occ[i] = id;
    if (t === 'fish') this.grid.wblock[i] = 1;
    else this.grid.block[i] = 1;
    return n;
  }

  removeNode(n: ResNode) {
    this.nodes.delete(n.id);
    const i = n.y * this.grid.size + n.x;
    if (this.grid.occ[i] === n.id) {
      this.grid.occ[i] = 0;
      if (n.t === 'fish') this.grid.wblock[i] = 0;
      else this.grid.block[i] = 0;
    }
  }

  spawnUnit(t: UnitKey, o: number, x: number, y: number): Unit {
    const id = this.nextId++;
    const d = unitDef(t);
    const p = this.players[o];
    const hp = o > 0 ? unitStats(p, t).hp : d.hp;
    const u: Unit = {
      id, k: 'u', t, o, x, y, a: this.rnd() * Math.PI * 2, hp, task: null, q: [], anim: 'idle', at: this.rnd() * 10,
      path: null, pi: 0, pgx: 0, pgy: 0, repath: 0, cd: 0, ca: 0, stance: d.cls.includes('villager') || d.cls.includes('monk') ? 0 : 0,
      idleT: 0, scan: this.rnd() * 0.5, stuck: 0, lx: x, ly: y, sub: 0, px: x, py: y,
    };
    if (d.food) u.food = d.food;
    if (t === 'villager') u.fem = this.rnd() < 0.5;
    if (t === 'trebuchet') u.packed = true;
    if (d.cargo) u.cargo = [];
    this.units.set(id, u);
    return u;
  }

  addBuilding(t: BuildingKey, o: number, x: number, y: number, complete: boolean): Building {
    const id = this.nextId++;
    const p = this.players[o];
    const bs = buildingStats(p, t);
    const b: Building = {
      id, k: 'b', t, o, x, y, hp: complete ? bs.hp : 1, prog: complete ? 1 : 0, done: complete, q: [], gar: [], cd: 0, seen: 0,
    };
    if (t === 'farm') { b.food = eco(p, 'farmFood'); b.reseed = true; }
    if (t === 'monastery') b.relics = [];
    this.buildings.set(id, b);
    this.occupy(b, true);
    if (o === this.human || (this.players[this.human] && this.allied(o, this.human))) b.seen |= 1 << this.human;
    if (complete) this.onBuildingComplete(b, true);
    return b;
  }

  private occupy(b: Building, on: boolean) {
    const d = buildingDef(b.t);
    const S = this.grid.size;
    for (let y = b.y; y < b.y + d.size; y++) {
      for (let x = b.x; x < b.x + d.size; x++) {
        if (!this.grid.inb(x, y)) continue;
        const i = y * S + x;
        if (on) {
          this.grid.occ[i] = b.id;
          if (d.water) this.grid.wblock[i] = 1;
          else if (d.gate) { this.grid.block[i] = 2; this.grid.gateOwner[i] = b.o; }
          else if (!d.passable) this.grid.block[i] = 1;
        } else if (this.grid.occ[i] === b.id) {
          this.grid.occ[i] = 0;
          this.grid.block[i] = 0;
          this.grid.gateOwner[i] = 0;
          if (d.water) this.grid.wblock[i] = 0;
        }
      }
    }
  }

  bsize(b: Building) {
    return buildingDef(b.t).size;
  }

  bcenter(b: Building): [number, number] {
    const s = this.bsize(b);
    return [b.x + s / 2, b.y + s / 2];
  }

  /** Distance from a point to an entity's edge. */
  distTo(x: number, y: number, e: Entity): number {
    if (e.k === 'b') {
      const s = this.bsize(e);
      return rectDist(x, y, { x0: e.x, y0: e.y, x1: e.x + s, y1: e.y + s, range: 0 });
    }
    if (e.k === 'r') return rectDist(x, y, { x0: e.x, y0: e.y, x1: e.x + 1, y1: e.y + 1, range: 0 });
    if (e.k === 'relic') return Math.hypot(e.x - x, e.y - y);
    return Math.max(0, Math.hypot(e.x - x, e.y - y) - unitDef(e.t).radius);
  }

  epos(e: Entity): [number, number] {
    if (e.k === 'b') return this.bcenter(e);
    if (e.k === 'r') return [e.x + 0.5, e.y + 0.5];
    return [e.x, e.y];
  }

  isAnimal(u: Unit) {
    return unitDef(u.t).cls.includes('animal');
  }

  // ------------------------------------------------------------------ main tick

  tick() {
    if (this.over) return;
    const dt = TICK;
    this.time += dt;
    this.tickCount++;
    this.pathBudget = MAX_PATHS_PER_TICK;
    // spatial hash
    for (const c of this.cells) c.length = 0;
    for (const u of this.units.values()) {
      u.px = u.x; u.py = u.y;
      if (u.inside || u.dead !== undefined) continue;
      const ci = Math.min(this.cellsW - 1, Math.max(0, Math.floor(u.y / CELL))) * this.cellsW + Math.min(this.cellsW - 1, Math.max(0, Math.floor(u.x / CELL)));
      this.cells[ci].push(u);
    }
    const tmp = this.buildersPrev; this.buildersPrev = this.builders; this.builders = tmp; this.builders.clear();

    for (const b of this.buildings.values()) this.updateBuilding(b, dt);
    for (const u of this.units.values()) this.updateUnit(u, dt);
    this.updateProjectiles(dt);
    if (this.tickCount % 2 === 0) this.separate();
    this.updateSheep();
    // relic gold
    for (const b of this.buildings.values()) {
      if (b.t === 'monastery' && b.relics && b.relics.length && b.done) {
        const g = b.relics.length * RELIC_GOLD_PER_S * dt;
        this.players[b.o].res.gold += g;
        this.players[b.o].stats.gathered.gold += g;
      }
    }
    if (this.tickCount % 5 === 0) {
      this.recountPop();
      this.checkVictory();
    }
    for (const ai of this.ais) ai.tick(dt);
    this.visTimer -= dt;
    if (this.visTimer <= 0) {
      this.visTimer = 0.3;
      this.updateVisibility(false);
    }
  }

  // ------------------------------------------------------------------ population / victory

  recountPop() {
    for (const p of this.players) { p.pop = 0; p.popCap = 0; }
    for (const u of this.units.values()) {
      if (u.dead !== undefined || u.o === 0) continue;
      const d = unitDef(u.t);
      if (d.cls.includes('animal')) continue;
      this.players[u.o].pop += d.pop ?? 1;
    }
    for (const b of this.buildings.values()) {
      if (!b.done) continue;
      const d = buildingDef(b.t);
      if (d.pop) this.players[b.o].popCap += d.pop;
    }
    for (const p of this.players) {
      if (!p.id) continue;
      p.popCap = Math.min(this.settings.popCap, p.popCap + eco(p, 'popCap'));
    }
  }

  private checkVictory() {
    const alive = new Map<number, boolean>();
    for (const p of this.players) if (p.id && !p.defeated) alive.set(p.id, false);
    for (const u of this.units.values()) {
      if (u.dead !== undefined || !alive.has(u.o)) continue;
      if (this.isAnimal(u)) continue;
      alive.set(u.o, true);
    }
    for (const b of this.buildings.values()) {
      if (!alive.has(b.o) || alive.get(b.o)) continue;
      const d = buildingDef(b.t);
      if (d.wall || d.gate || b.t === 'farm' || b.t === 'house' || !b.done) continue;
      alive.set(b.o, true);
    }
    for (const [id, ok] of alive) {
      const p = this.players[id];
      if (!ok || p.resigned) this.defeat(p);
    }
    // wonder
    if (this.settings.victory === 'standard') {
      for (const b of this.buildings.values()) {
        if (b.t !== 'wonder' || !b.done) continue;
        const t = (this.wonderT.get(b.id) ?? 0) + 0.5;
        this.wonderT.set(b.id, t);
        if (t === 0.5) this.events.push({ k: 'wonder', o: b.o, text: `${this.players[b.o].name} has completed a Wonder!` });
        if (t >= WONDER_TIME) return this.finish(b.o, 'Wonder victory');
      }
      // relics
      const total = this.relics.size;
      if (total > 0) {
        let holder = -1;
        for (const r of this.relics.values()) {
          const o = r.mon ? this.buildings.get(r.mon)?.o ?? -1 : -1;
          if (holder === -1) holder = o;
          if (o !== holder || o <= 0) { holder = -2; break; }
        }
        if (holder > 0) {
          if (this.relicHolder !== holder) { this.relicHolder = holder; this.relicT = 0; this.events.push({ k: 'relic', o: holder, text: `${this.players[holder].name} holds all relics!` }); }
          this.relicT += 0.5;
          if (this.relicT >= RELIC_TIME) return this.finish(holder, 'Relic victory');
        } else { this.relicHolder = 0; this.relicT = 0; }
      }
    }
    // team victory
    const teams = new Set<string>();
    for (const p of this.players) if (p.id && !p.defeated) teams.add(p.team ? 't' + p.team : 'p' + p.id);
    const hp = this.players[this.human];
    if (hp.defeated) return this.finish(-1, 'Defeat');
    if (teams.size <= 1) return this.finish(this.human, 'Conquest');
  }

  private finish(winner: number, how: string) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    const won = winner > 0 && this.allied(winner, this.human);
    this.events.push({ k: won ? 'victory' : 'defeat', text: how });
  }

  defeat(p: Player) {
    if (p.defeated) return;
    p.defeated = true;
    this.events.push({ k: 'defeat', o: p.id, text: `${p.name} has been defeated.` });
    for (const u of [...this.units.values()]) if (u.o === p.id && !this.isAnimal(u)) this.killUnit(u, 0, true);
    for (const b of [...this.buildings.values()]) if (b.o === p.id) this.destroyBuilding(b, 0);
  }

  timeLeftWonder(): { o: number; t: number } | null {
    let best: { o: number; t: number } | null = null;
    for (const [id, t] of this.wonderT) {
      const b = this.buildings.get(id);
      if (!b) continue;
      const left = WONDER_TIME - t;
      if (!best || left < best.t) best = { o: b.o, t: left };
    }
    if (this.relicHolder > 0) {
      const left = RELIC_TIME - this.relicT;
      if (!best || left < best.t) best = { o: this.relicHolder, t: left };
    }
    return best;
  }

  // ------------------------------------------------------------------ visibility (human + allies)

  private disk(r: number): Int16Array {
    const key = Math.round(r * 2);
    let d = this.diskCache.get(key);
    if (d) return d;
    const rr = key / 2;
    const out: number[] = [];
    const R = Math.ceil(rr);
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= rr * rr + 0.5) out.push(x, y);
    d = new Int16Array(out);
    this.diskCache.set(key, d);
    return d;
  }

  updateVisibility(force: boolean) {
    const S = this.grid.size;
    const vis = this.visible;
    vis.fill(0);
    if (this.settings.reveal === 'all') { vis.fill(1); this.explored.fill(1); }
    const stamp = (cx: number, cy: number, r: number) => {
      const d = this.disk(r);
      const tx = Math.floor(cx), ty = Math.floor(cy);
      for (let k = 0; k < d.length; k += 2) {
        const x = tx + d[k], y = ty + d[k + 1];
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        const i = y * S + x;
        vis[i] = 1;
        this.explored[i] = 1;
      }
    };
    const me = this.human;
    for (const u of this.units.values()) {
      if (u.dead !== undefined || u.inside || !this.allied(u.o, me)) continue;
      const p = this.players[u.o];
      stamp(u.x, u.y, unitStats(p, u.t).los);
    }
    for (const b of this.buildings.values()) {
      if (!this.allied(b.o, me)) continue;
      const [cx, cy] = this.bcenter(b);
      const los = b.done ? buildingStats(this.players[b.o], b.t).los : 2;
      stamp(cx, cy, los + this.bsize(b) / 2);
    }
    const bit = 1 << me;
    for (const b of this.buildings.values()) {
      if (b.seen & bit) continue;
      if (vis[b.y * S + b.x]) b.seen |= bit;
    }
    for (const n of this.nodes.values()) {
      if (n.seen & bit) continue;
      if (vis[n.y * S + n.x]) n.seen |= bit;
    }
    void force;
  }

  isVisible(x: number, y: number) {
    const S = this.grid.size;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= S || ty >= S) return false;
    return this.visible[ty * S + tx] === 1;
  }

  isExplored(x: number, y: number) {
    const S = this.grid.size;
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= S || ty >= S) return false;
    return this.explored[ty * S + tx] === 1;
  }

  /** Can the human player see this entity right now (or remember it, for buildings/resources)? */
  canSee(e: Entity): boolean {
    if (e.k === 'u') {
      if (e.inside) return false;
      return this.allied(e.o, this.human) || this.isVisible(e.x, e.y);
    }
    if (e.k === 'b') return this.allied(e.o, this.human) || (e.seen & (1 << this.human)) !== 0;
    if (e.k === 'r') return (e.seen & (1 << this.human)) !== 0 || this.settings.reveal !== 'normal';
    if (e.carrier) return false;
    return this.isExplored(e.x, e.y);
  }

  // ------------------------------------------------------------------ spatial queries

  unitsNear(x: number, y: number, r: number, fn: (u: Unit) => void) {
    const cx0 = Math.max(0, Math.floor((x - r) / CELL)), cx1 = Math.min(this.cellsW - 1, Math.floor((x + r) / CELL));
    const cy0 = Math.max(0, Math.floor((y - r) / CELL)), cy1 = Math.min(this.cellsW - 1, Math.floor((y + r) / CELL));
    const r2 = r * r;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const cell = this.cells[cy * this.cellsW + cx];
        for (let i = 0; i < cell.length; i++) {
          const u = cell[i];
          if (u.dead !== undefined || u.inside) continue;
          const dx = u.x - x, dy = u.y - y;
          if (dx * dx + dy * dy <= r2) fn(u);
        }
      }
    }
  }

  /** Nearest enemy (unit or building) within range r of (x, y) for owner o. */
  findEnemy(o: number, x: number, y: number, r: number, opts: { units?: boolean; buildings?: boolean; naval?: boolean; noWalls?: boolean; canHitShips?: boolean } = {}): Unit | Building | null {
    let best: Unit | Building | null = null;
    let bestD = Infinity;
    if (opts.units !== false) {
      this.unitsNear(x, y, r, (u) => {
        if (!this.enemy(o, u.o)) return;
        const d = (u.x - x) ** 2 + (u.y - y) ** 2;
        // prefer non-siege military slightly
        if (d < bestD) { bestD = d; best = u; }
      });
    }
    if (best) return best;
    if (opts.buildings !== false) {
      for (const b of this.buildings.values()) {
        if (!this.enemy(o, b.o)) continue;
        const d0 = this.distTo(x, y, b);
        if (d0 > r) continue;
        const d = d0 * d0 + (buildingDef(b.t).wall && opts.noWalls !== false ? 400 : 0);
        if (d < bestD) { bestD = d; best = b; }
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ movement

  private requestPath(u: Unit, goal: Goal): boolean {
    if (this.pathBudget <= 0) return false;
    this.pathBudget--;
    const d = unitDef(u.t);
    const allied = this.alliedFn(u.o);
    const res = findPath(this.grid, u.x, u.y, goal, !!d.naval, allied);
    let pts = res.pts;
    if (res.reached && goal.x1 - goal.x0 < 0.01 && goal.range < 0.6) {
      // exact point destination
      const ex = goal.x0, ey = goal.y0;
      if (this.grid.passable(ex, ey, !!d.naval, allied)) {
        if (pts.length >= 2) { pts[pts.length - 2] = ex; pts[pts.length - 1] = ey; }
        else pts = [ex, ey];
      }
    }
    if (res.reached && pts.length === 0) {
      // already in the goal tile: step straight toward the goal rectangle
      pts = [Math.max(goal.x0, Math.min(goal.x1, u.x)), Math.max(goal.y0, Math.min(goal.y1, u.y))];
      if (Math.hypot(pts[0] - u.x, pts[1] - u.y) < 0.01) pts = [(goal.x0 + goal.x1) / 2, (goal.y0 + goal.y1) / 2];
    }
    u.path = res.reached && pts.length === 2 ? pts : smoothPath(this.grid, u.x, u.y, pts, !!d.naval, allied);
    u.pi = 0;
    u.pgx = (goal.x0 + goal.x1) / 2;
    u.pgy = (goal.y0 + goal.y1) / 2;
    u.repath = 4 + this.rnd() * 2;
    if (!res.reached && u.path.length === 0) return true;
    return true;
  }

  /** Move toward a goal; returns 'arrived', 'moving' or 'blocked'. */
  goTo(u: Unit, goal: Goal, dt: number, speed: number): 'arrived' | 'moving' | 'blocked' {
    if (rectDist(u.x, u.y, goal) <= goal.range) {
      u.path = null;
      return 'arrived';
    }
    if (u.t === 'trebuchet' && !u.packed) {
      u.packT = (u.packT ?? 0) + dt;
      u.anim = 'idle';
      if (u.packT >= (unitDef(u.t).setup ?? 4)) { u.packed = true; u.packT = 0; }
      return 'moving';
    }
    const gcx = (goal.x0 + goal.x1) / 2, gcy = (goal.y0 + goal.y1) / 2;
    u.repath -= dt;
    if (!u.path || Math.abs(gcx - u.pgx) + Math.abs(gcy - u.pgy) > 0.8 || (u.repath <= 0 && u.pi >= u.path.length / 2)) {
      if (!this.requestPath(u, goal)) { u.anim = 'idle'; return 'moving'; }
      if (u.path!.length === 0) {
        // no progress possible
        u.path = null;
        return 'blocked';
      }
    }
    const path = u.path!;
    if (u.pi * 2 >= path.length) {
      // path exhausted but not arrived: closest reachable point
      if (rectDist(u.x, u.y, goal) <= goal.range + 1.2) { u.path = null; return 'arrived'; }
      u.path = null;
      u.stuck++;
      return u.stuck > 2 ? 'blocked' : 'moving';
    }
    const tx = path[u.pi * 2], ty = path[u.pi * 2 + 1];
    const dx = tx - u.x, dy = ty - u.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * dt * this.terrainSpeed(u);
    u.anim = 'walk';
    if (dist <= step) {
      u.x = tx; u.y = ty;
      u.pi++;
    } else {
      u.x += (dx / dist) * step;
      u.y += (dy / dist) * step;
    }
    if (dist > 0.01) this.face(u, Math.atan2(dy, dx), dt);
    return 'moving';
  }

  private terrainSpeed(u: Unit) {
    if (unitDef(u.t).naval) return 1;
    const i = Math.floor(u.y) * this.grid.size + Math.floor(u.x);
    return this.grid.terrain[i] === T_SHALLOW ? 0.8 : 1;
  }

  face(u: Unit, ang: number, dt: number) {
    let d = ang - u.a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const max = 10 * dt;
    u.a += Math.max(-max, Math.min(max, d));
  }

  private separate() {
    const g = this.grid;
    for (const c of this.cells) {
      for (const u of c) {
        const du = unitDef(u.t);
        const ru = du.radius;
        const moving = u.anim === 'walk';
        this.unitsNear(u.x, u.y, ru + 0.7, (v) => {
          if (v.id <= u.id) return;
          const dv = unitDef(v.t);
          if (!!dv.naval !== !!du.naval) return;
          const rr = ru + dv.radius;
          let dx = v.x - u.x, dy = v.y - u.y;
          let d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) return;
          if (d2 < 1e-6) { dx = this.rnd() - 0.5; dy = this.rnd() - 0.5; d2 = dx * dx + dy * dy; }
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          // gatherers/builders/attackers in place are heavier
          const vMoving = v.anim === 'walk';
          let wu = 0.5, wv = 0.5;
          if (moving && !vMoving) { wu = 0.25; wv = 0.75; }
          else if (!moving && vMoving) { wu = 0.75; wv = 0.25; }
          if (u.anim === 'work' || u.anim === 'attack') { wu *= 0.3; }
          if (v.anim === 'work' || v.anim === 'attack') { wv *= 0.3; }
          const ux = u.x - nx * push * wu * 2, uy = u.y - ny * push * wu * 2;
          const vx = v.x + nx * push * wv * 2, vy = v.y + ny * push * wv * 2;
          const al = this.alliedFn(u.o);
          if (g.passable(ux, uy, !!du.naval, al)) { u.x = ux; u.y = uy; }
          if (g.passable(vx, vy, !!dv.naval, this.alliedFn(v.o))) { v.x = vx; v.y = vy; }
        });
      }
    }
  }

  /** Units standing inside newly blocked tiles get bumped out. */
  private unstick(u: Unit) {
    const d = unitDef(u.t);
    if (this.grid.passable(u.x, u.y, !!d.naval, this.alliedFn(u.o))) return;
    const f = nearestFree(this.grid, u.x, u.y, !!d.naval, 8, this.alliedFn(u.o));
    if (f) { u.x = f[0]; u.y = f[1]; u.path = null; }
  }

  // ------------------------------------------------------------------ units

  private updateUnit(u: Unit, dt: number) {
    if (u.dead !== undefined) {
      u.dead += dt;
      if (u.food !== undefined && u.food > 0) {
        // carcass: decays slowly
        u.food -= dt * 0.04;
        if (u.food <= 0) this.units.delete(u.id);
      } else if (u.dead > 15) this.units.delete(u.id);
      return;
    }
    const d = unitDef(u.t);
    const p = this.players[u.o];
    const st = u.o > 0 ? unitStats(p, u.t) : null;
    if (u.inside) {
      if (st && u.hp < st.hp && this.buildings.has(u.inside)) u.hp = Math.min(st.hp, u.hp + dt * 0.5);
      return;
    }
    if (u.cd > 0) u.cd -= dt;
    if (u.flash) u.flash = Math.max(0, u.flash - dt);
    if (d.regen && st && u.hp < st.hp) u.hp = Math.min(st.hp, u.hp + d.regen * dt);
    if (u.rest && u.rest > 0) u.rest -= dt;
    u.at += dt;
    if (this.tickCount % 10 === u.id % 10) this.unstick(u);

    if (d.cls.includes('animal') && (u.o === 0 || u.t !== 'sheep')) {
      this.updateAnimal(u, d, dt);
      return;
    }
    if (u.t === 'sheep') {
      // owned sheep: just follow move commands
      if (u.task?.k === 'move') this.taskMove(u, dt, d.speed);
      else { u.anim = 'idle'; u.task = null; }
      return;
    }
    const speed = st!.speed;
    if (!u.task && u.q.length) u.task = u.q.shift()!;
    if (u.task) {
      u.idleT = 0;
      switch (u.task.k) {
        case 'move': this.taskMove(u, dt, speed); break;
        case 'patrol': this.taskPatrol(u, dt, speed); break;
        case 'attack': this.taskAttack(u, dt, speed); break;
        case 'attackGround': this.taskAttackGround(u, dt, speed); break;
        case 'gather': this.taskGather(u, dt, speed); break;
        case 'build': case 'repair': this.taskBuild(u, dt, speed); break;
        case 'garrison': this.taskGarrison(u, dt, speed); break;
        case 'heal': this.taskHeal(u, dt, speed); break;
        case 'convert': this.taskConvert(u, dt, speed); break;
        case 'relic': this.taskRelic(u, dt, speed); break;
        case 'unload': this.taskUnload(u, dt, speed); break;
        case 'follow': this.taskFollow(u, dt, speed); break;
        case 'scout': this.taskScout(u, dt, speed); break;
      }
    } else {
      u.idleT += dt;
      if (u.anim !== 'idle' && u.anim !== 'attack') u.anim = 'idle';
      if (u.anim === 'attack' && this.time - (u.swing ?? 0) > 1) u.anim = 'idle';
      this.idleBehaviour(u, d, st!, dt);
    }
    // stuck detection
    if (u.anim === 'walk') {
      if (this.tickCount % 10 === 0) {
        const moved = Math.hypot(u.x - u.lx, u.y - u.ly);
        if (moved < 0.08) { u.stuck++; u.path = null; }
        else u.stuck = Math.max(0, u.stuck - 1);
        u.lx = u.x; u.ly = u.y;
        if (u.stuck > 6) { u.stuck = 0; if (u.task?.k === 'scout') { u.task.x = undefined; u.path = null; } else this.endTask(u); }
      }
    }
  }

  endTask(u: Unit) {
    u.task = null;
    u.path = null;
    u.sub = 0;
    u.conv = undefined;
    if (u.anim === 'walk' || u.anim === 'work') u.anim = 'idle';
  }

  /** Combat role used for "similar units join in" (null: never assists, e.g. villagers, monks, rams). */
  private role(t: UnitKey): string | null {
    const c = unitDef(t).cls;
    if (c.includes('villager') || c.includes('monk') || c.includes('animal') || c.includes('trade') || c.includes('ram')) return null;
    if (c.includes('ship')) return unitDef(t).naval ? 'ship' : null;
    if (c.includes('siege')) return 'siege';
    if (c.includes('archer')) return 'ranged';
    if (c.includes('cavalry') || c.includes('camel')) return 'cav';
    if (c.includes('infantry')) return 'inf';
    return null;
  }

  /** Idle units of this owner near (x, y) that could join a fight: not garrisoned, not told to hold or stay passive. */
  private idleFighters(o: number, x: number, y: number, r: number, fn: (v: Unit, role: string) => void) {
    this.unitsNear(x, y, r, (v) => {
      if (v.o !== o || v.task || v.q.length || v.inside || v.dead !== undefined) return;
      if (v.stance === 2 || v.stance === 3) return;
      const role = this.role(v.t);
      if (!role || unitStats(this.players[o], v.t).atk <= 0) return;
      fn(v, role);
    });
  }

  /** AoE-style group response: when units are sent to attack, idle units of the same kind nearby join in. */
  assist(o: number, attackers: Unit[], tgt: Unit | Building, radius = 6) {
    const roles = new Set(attackers.map((u) => this.role(u.t)).filter((r): r is string => !!r));
    if (!roles.size) return;
    let cx = 0, cy = 0;
    for (const u of attackers) { cx += u.x; cy += u.y; }
    cx /= attackers.length; cy /= attackers.length;
    this.idleFighters(o, cx, cy, radius, (v, role) => {
      if (!roles.has(role)) return;
      if (role === 'siege' && tgt.k === 'u') return; // siege only joins sieges
      v.hx = v.x; v.hy = v.y;
      v.task = { k: 'attack', id: tgt.id };
    });
  }

  /** Someone of ours (unit or building) was hit: idle soldiers close by come to help, whatever their kind. */
  private callForHelp(victim: Unit | Building, src: Unit) {
    if (victim.k === 'u') {
      if (this.time - (victim.helpT ?? -9) < 1.5) return;
      victim.helpT = this.time;
    }
    const [x, y] = this.epos(victim);
    this.idleFighters(victim.o, x, y, victim.k === 'b' ? 7 : 5, (v, role) => {
      if (role === 'siege' || role === 'ship') return;
      v.hx = v.x; v.hy = v.y;
      v.task = { k: 'attack', id: src.id };
    });
  }

  /** Explored-tile map for an owner (only the human keeps one; AIs see the whole map). */
  private exploredFor(o: number) {
    return o === this.human && this.settings.reveal === 'normal' ? this.explored : null;
  }

  /** Auto-scout: head for the nearest unexplored ground (biased to stay near home first), keep clear of
   *  enemy defences, and veer away from whatever last attacked us. */
  private taskScout(u: Unit, dt: number, speed: number) {
    const t = u.task!;
    const g = this.grid, S = g.size;
    const exp = this.exploredFor(u.o);
    u.scan -= dt;
    const reached = t.x !== undefined && exp !== null && exp[Math.floor(t.y!) * S + Math.floor(t.x!)] === 1 && u.scan <= 0;
    if (t.x === undefined || reached) {
      u.scan = 1.5;
      const next = this.pickScoutTarget(u, t);
      if (!next) {
        this.endTask(u);
        if (u.o === this.human) this.events.push({ k: 'msg', o: u.o, text: 'Scouting complete: the whole map is explored.' });
        return;
      }
      t.x = next[0]; t.y = next[1];
      u.path = null;
    }
    const r = this.goTo(u, { x0: t.x!, y0: t.y!, x1: t.x!, y1: t.y!, range: 1.2 }, dt, speed);
    if (r !== 'moving') { t.x = undefined; u.path = null; }
  }

  private pickScoutTarget(u: Unit, t: Task): [number, number] | null {
    const g = this.grid, S = g.size;
    if (g.regionDirty) g.computeRegions();
    const exp = this.exploredFor(u.o);
    const reg = g.region[Math.floor(u.y) * S + Math.floor(u.x)];
    const home = [...this.buildings.values()].find((b) => b.o === u.o && b.t === 'town_center');
    const [hx, hy] = home ? this.bcenter(home) : [u.x, u.y];
    // enemy defences we know about
    const danger: [number, number, number][] = [];
    for (const b of this.buildings.values()) {
      if (!this.enemy(u.o, b.o) || !buildingDef(b.t).atk) continue;
      if (exp && !exp[Math.floor(b.y) * S + Math.floor(b.x)]) continue;
      const [bx, by] = this.bcenter(b);
      danger.push([bx, by, (buildingStats(this.players[b.o], b.t).range || 7) + 2.5]);
    }
    const ok = (i: number) => g.region[i] === reg && g.landOk(i) && (!exp || !exp[i]);
    const score = (x: number, y: number) => {
      let s = Math.hypot(x - u.x, y - u.y) + 0.45 * Math.hypot(x - hx, y - hy);
      for (const [dx, dy, r] of danger) if (Math.hypot(x - dx, y - dy) < r) s += 1000;
      if (t.x2 !== undefined && Math.hypot(x - t.x2, y - t.y2!) < 9) s += 60;
      return s;
    };
    let best: [number, number] | null = null, bestS = Infinity;
    for (let k = 0; k < 140; k++) {
      const i = Math.floor(this.rnd() * S * S);
      if (!ok(i)) continue;
      const x = (i % S) + 0.5, y = Math.floor(i / S) + 0.5, s = score(x, y);
      if (s < bestS) { bestS = s; best = [x, y]; }
    }
    if (best) return best;
    // nearly everything explored: sweep the grid for the last pockets
    for (let i = 0; i < S * S; i += 3) {
      if (!ok(i)) continue;
      const x = (i % S) + 0.5, y = Math.floor(i / S) + 0.5, s = score(x, y);
      if (s < bestS) { bestS = s; best = [x, y]; }
    }
    return exp ? best : best ?? [this.rnd() * S, this.rnd() * S];
  }

  cmdScout(o: number, ids: number[]) {
    for (const u of this.ownUnits(o, ids)) {
      if (!this.canScout(u)) continue;
      u.q = [];
      this.assign(u, { k: 'scout' }, false);
    }
  }

  canScout(u: Unit) {
    const d = unitDef(u.t);
    return !d.naval && d.speed >= 1.2 && (d.cls.includes('cavalry') || d.cls.includes('camel')) && !d.cls.includes('cavarcher');
  }

  private idleBehaviour(u: Unit, d: ReturnType<typeof unitDef>, st: ReturnType<typeof unitStats>, dt: number) {
    u.scan -= dt;
    if (u.scan > 0) return;
    u.scan = 0.5 + this.rnd() * 0.3;
    // trebuchets idle packed
    if (d.cls.includes('monk')) {
      if (u.relic) return;
      // auto-heal
      let best: Unit | null = null, bestD = Infinity;
      this.unitsNear(u.x, u.y, st.los, (v) => {
        if (v === u || !this.allied(v.o, u.o) || this.isAnimal(v)) return;
        const vs = unitStats(this.players[v.o], v.t);
        if (v.hp >= vs.hp || unitDef(v.t).cls.includes('siege') || unitDef(v.t).naval) return;
        const dd = (v.x - u.x) ** 2 + (v.y - u.y) ** 2;
        if (dd < bestD) { bestD = dd; best = v; }
      });
      if (best) u.task = { k: 'heal', id: (best as Unit).id };
      return;
    }
    if (st.atk <= 0 || u.stance === 3) return;
    if (d.cls.includes('villager')) return;
    if (u.t === 'fishing_ship') return;
    const r = u.stance === 2 ? st.range + d.radius + 0.6 : st.los;
    const e = this.findEnemy(u.o, u.x, u.y, Math.max(r, st.range + 0.5), { buildings: u.stance !== 2 && st.range > 0 || d.cls.includes('siege') });
    if (e) {
      if (u.stance === 2 && this.distTo(u.x, u.y, e) > st.range + 0.4) return;
      if (u.hx === undefined || u.stance !== 1) { u.hx = u.x; u.hy = u.y; }
      u.task = { k: 'attack', id: e.id };
    } else if (u.stance === 1 && u.hx !== undefined && Math.hypot(u.x - u.hx, u.y - (u.hy ?? 0)) > 1) {
      u.task = { k: 'move', x: u.hx, y: u.hy };
    }
  }

  private taskMove(u: Unit, dt: number, speed: number) {
    const t = u.task!;
    if (t.am) {
      u.scan -= dt;
      if (u.scan <= 0) {
        u.scan = 0.5;
        const st = unitStats(this.players[u.o], u.t);
        const e = this.findEnemy(u.o, u.x, u.y, st.los, {});
        if (e) {
          u.q.unshift({ ...t });
          u.task = { k: 'attack', id: e.id };
          return;
        }
      }
    }
    const goal: Goal = { x0: t.x!, y0: t.y!, x1: t.x!, y1: t.y!, range: 0.15 };
    const r = this.goTo(u, goal, dt, speed);
    if (r !== 'moving') {
      this.endTask(u);
      if (u.stance === 1) { u.hx = u.x; u.hy = u.y; }
    }
  }

  private taskPatrol(u: Unit, dt: number, speed: number) {
    const t = u.task!;
    u.scan -= dt;
    if (u.scan <= 0) {
      u.scan = 0.5;
      const st = unitStats(this.players[u.o], u.t);
      const e = this.findEnemy(u.o, u.x, u.y, st.los, {});
      if (e) { u.q.unshift({ ...t }); u.task = { k: 'attack', id: e.id }; return; }
    }
    const tx = t.leg ? t.x2! : t.x!, ty = t.leg ? t.y2! : t.y!;
    const r = this.goTo(u, { x0: tx, y0: ty, x1: tx, y1: ty, range: 0.3 }, dt, speed);
    if (r !== 'moving') { t.leg = t.leg ? 0 : 1; u.path = null; }
  }

  private targetAlive(e: Entity | undefined): e is Unit | Building {
    if (!e) return false;
    if (e.k === 'u') return e.dead === undefined && !e.inside;
    if (e.k === 'b') return e.hp > 0;
    return false;
  }

  private taskAttack(u: Unit, dt: number, speed: number) {
    const t = u.task!;
    const tgt = this.get(t.id);
    if (!this.targetAlive(tgt) || (tgt.k === 'u' && this.allied(tgt.o, u.o) && tgt.o !== 0 && !this.isAnimal(tgt))) {
      this.endTask(u);
      // look for another target nearby immediately
      u.scan = 0;
      return;
    }
    const d = unitDef(u.t);
    const st = unitStats(this.players[u.o], u.t);
    // defensive stance leash
    if (u.stance === 1 && u.hx !== undefined && Math.hypot(u.x - u.hx, u.y - u.hy!) > 8) {
      u.task = { k: 'move', x: u.hx, y: u.hy };
      return;
    }
    if (u.stance === 2) {
      const dist = this.distTo(u.x, u.y, tgt) - d.radius;
      if (dist > st.range + 0.5) { this.endTask(u); return; }
    }
    // villagers hunting use a short ranged throw
    let range = st.range;
    const hunting = d.cls.includes('villager') && tgt.k === 'u' && this.isAnimal(tgt) && tgt.t !== 'sheep';
    if (hunting) range = 3;
    this.doAttack(u, tgt, range, st, dt, speed);
  }

  private doAttack(u: Unit, tgt: Unit | Building, range: number, st: ReturnType<typeof unitStats>, dt: number, speed: number) {
    const d = unitDef(u.t);
    const [tx, ty] = this.epos(tgt);
    const dist = this.distTo(u.x, u.y, tgt) - d.radius;
    const reach = range > 0 ? range : 0.25;
    if (dist > reach) {
      let goal: Goal;
      if (tgt.k === 'b') {
        const s = this.bsize(tgt);
        goal = { x0: tgt.x, y0: tgt.y, x1: tgt.x + s, y1: tgt.y + s, range: Math.max(0.55, reach + d.radius - 0.1) };
      } else {
        const tr = unitDef(tgt.t).radius;
        goal = { x0: tx, y0: ty, x1: tx, y1: ty, range: Math.max(0.3, reach + d.radius + tr - 0.15) };
      }
      const r = this.goTo(u, goal, dt, speed);
      if (r === 'blocked') {
        // try to hit whatever wall blocks us
        this.endTask(u);
      }
      return;
    }
    if (d.minRange && dist < d.minRange && tgt.k === 'u') {
      // too close: back off a bit
      const ang = Math.atan2(u.y - ty, u.x - tx);
      const nx = u.x + Math.cos(ang) * speed * dt, ny = u.y + Math.sin(ang) * speed * dt;
      if (this.grid.passable(nx, ny, !!d.naval, this.alliedFn(u.o))) { u.x = nx; u.y = ny; u.anim = 'walk'; return; }
      this.endTask(u);
      return;
    }
    u.path = null;
    if (u.t === 'trebuchet' && u.packed) {
      u.packT = (u.packT ?? 0) + dt;
      u.anim = 'idle';
      if (u.packT >= (d.setup ?? 4)) { u.packed = false; u.packT = 0; u.cd = 1; }
      return;
    }
    this.face(u, Math.atan2(ty - u.y, tx - u.x), dt);
    if (u.anim !== 'attack') u.anim = 'attack';
    if (u.cd > 0) return;
    u.cd = st.reload;
    u.swing = this.time;
    this.fire(u, tgt, st, range);
  }

  private fire(u: Unit, tgt: Unit | Building, st: ReturnType<typeof unitStats>, range: number) {
    const d = unitDef(u.t);
    const [tx, ty] = this.epos(tgt);
    const pierce = d.atkType === 'p';
    let atk = st.atk;
    let bonus = st.bonus;
    if (d.cls.includes('villager') && tgt.k === 'u' && this.isAnimal(tgt)) { atk = tgt.t === 'boar' ? 4 : 5; bonus = {}; }
    if (d.proj || (range > 0 && d.cls.includes('villager'))) {
      const kind = d.proj ?? 'axe';
      const sh = this.grid.h(u.x, u.y) + (d.naval ? 0.5 : 0.5);
      const th = this.grid.h(tx, ty) + (tgt.k === 'b' ? 0.6 : 0.35);
      const dist = Math.hypot(tx - u.x, ty - u.y);
      const speedP = kind === 'stone' ? 7 : kind === 'cannon' || kind === 'bullet' ? 18 : kind === 'bolt' ? 14 : 10;
      this.projectiles.push({
        kind, o: u.o, src: u.id, tgt: tgt.id,
        sx: u.x, sy: u.y, sz: sh, tx, ty, tz: th,
        t: 0, dur: Math.max(0.15, dist / speedP), atk, pierce, bonus, splash: d.splash ?? 0,
        friendly: kind === 'stone' || kind === 'cannon', arc: kind === 'stone' ? 0.35 : kind === 'arrow' || kind === 'axe' ? 0.12 : 0.03,
      });
      if (d.cls.includes('unique') && u.t === 'chu_ko_nu') {
        // chu ko nu fires extra bolts
        for (let k = 0; k < 2; k++) {
          const p0 = this.projectiles[this.projectiles.length - 1];
          this.projectiles.push({ ...p0, t: -0.08 * (k + 1), atk: 3, tx: tx + (this.rnd() - 0.5) * 0.6, ty: ty + (this.rnd() - 0.5) * 0.6 });
        }
      }
      this.events.push({ k: 'fire', t: kind, x: u.x, y: u.y, o: u.o });
    } else {
      this.damage(u.o, atk, pierce, bonus, tgt, u);
      if (d.splash) {
        this.unitsNear(tx, ty, d.splash + 0.4, (v) => {
          if (v === tgt || !this.enemy(u.o, v.o)) return;
          this.damage(u.o, atk * 0.5, pierce, bonus, v, u);
        });
      }
      this.events.push({ k: 'hit', t: d.cls.includes('villager') ? 'villager' : 'melee', x: tx, y: ty, o: u.o });
    }
  }

  private taskAttackGround(u: Unit, dt: number, speed: number) {
    const t = u.task!;
    const d = unitDef(u.t);
    const st = unitStats(this.players[u.o], u.t);
    const dist = Math.hypot(t.x! - u.x, t.y! - u.y);
    if (dist > st.range) {
      const r = this.goTo(u, { x0: t.x!, y0: t.y!, x1: t.x!, y1: t.y!, range: st.range - 0.2 }, dt, speed);
      if (r === 'blocked') this.endTask(u);
      return;
    }
    if (u.t === 'trebuchet' && u.packed) {
      u.packT = (u.packT ?? 0) + dt;
      if (u.packT >= (d.setup ?? 4)) { u.packed = false; u.packT = 0; u.cd = 1; }
      return;
    }
    this.face(u, Math.atan2(t.y! - u.y, t.x! - u.x), dt);
    u.anim = 'attack';
    if (u.cd > 0) return;
    u.cd = st.reload;
    u.swing = this.time;
    this.projectiles.push({
      kind: d.proj ?? 'stone', o: u.o, src: u.id, tgt: 0, sx: u.x, sy: u.y, sz: this.grid.h(u.x, u.y) + 0.5,
      tx: t.x!, ty: t.y!, tz: this.grid.h(t.x!, t.y!), t: 0, dur: Math.max(0.3, dist / 7), atk: st.atk, pierce: d.atkType === 'p',
      bonus: st.bonus, splash: Math.max(0.6, d.splash ?? 0.6), friendly: true, arc: 0.35,
    });
  }

  // ------------------------------------------------------------------ combat resolution

  armorOf(e: Unit | Building): [number, number] {
    if (e.k === 'b') {
      const bs = buildingStats(this.players[e.o], e.t);
      return [bs.armorM, bs.armorP];
    }
    if (e.o === 0) { const d = unitDef(e.t); return d.armor; }
    const s = unitStats(this.players[e.o], e.t);
    return [s.armorM, s.armorP];
  }

  classesOf(e: Unit | Building): UnitClass[] {
    if (e.k === 'b') {
      const d = buildingDef(e.t);
      const c: UnitClass[] = ['building'];
      if (d.stoneDef) c.push('stonedef');
      if (d.wall || d.gate) c.push('wall');
      return c;
    }
    return unitDef(e.t).cls;
  }

  damage(o: number, atk: number, pierce: boolean, bonus: Partial<Record<UnitClass, number>>, tgt: Unit | Building, src?: Unit) {
    if (tgt.k === 'u' && (tgt.dead !== undefined || tgt.inside)) return;
    if (tgt.k === 'b' && tgt.hp <= 0) return;
    const [am, ap] = this.armorOf(tgt);
    const armor = pierce ? ap : am;
    let dmg = Math.max(0, atk - armor);
    for (const c of this.classesOf(tgt)) dmg += bonus[c] ?? 0;
    // elevation
    if (src) {
      const [tx, ty] = this.epos(tgt);
      const dh = this.grid.h(src.x, src.y) - this.grid.h(tx, ty);
      if (dh > 0.5) dmg *= 1.25;
      else if (dh < -0.5) dmg *= 0.75;
    }
    dmg = Math.max(1, dmg);
    tgt.hp -= dmg;
    if (tgt.k === 'u') {
      tgt.flash = 0.15;
      tgt.hitBy = src?.id;
      tgt.hitT = this.time;
    }
    // alerts
    if (tgt.o === this.human && o !== this.human && o !== 0 && this.time - this.lastAlert > 12) {
      this.lastAlert = this.time;
      const [x, y] = this.epos(tgt);
      this.events.push({ k: 'attack', o: tgt.o, x, y, text: tgt.k === 'b' ? 'Your buildings are under attack!' : 'You are under attack!' });
    }
    if (tgt.hp <= 0) {
      if (tgt.k === 'u') this.killUnit(tgt, o);
      else this.destroyBuilding(tgt, o);
      return;
    }
    // nearby idle soldiers come to the defence of units and buildings under attack
    if (src && src.dead === undefined && tgt.o !== 0 && src.o !== 0 && this.enemy(tgt.o, src.o)) this.callForHelp(tgt, src);
    // a scout under fire veers away from its attacker and picks somewhere else to explore
    if (tgt.k === 'u' && src && tgt.task?.k === 'scout') { tgt.task.x2 = src.x; tgt.task.y2 = src.y; tgt.task.x = undefined; }
    // retaliation
    if (tgt.k === 'u' && src && src.dead === undefined && !tgt.inside) {
      const td = unitDef(tgt.t);
      if (tgt.o === 0) {
        if (tgt.t === 'boar' || tgt.t === 'wolf') { if (!tgt.task || tgt.task.k !== 'attack') tgt.task = { k: 'attack', id: src.id }; }
        else if (td.flee) { tgt.task = { k: 'move', x: tgt.x + (tgt.x - src.x) * 3, y: tgt.y + (tgt.y - src.y) * 3 }; }
        return;
      }
      const ts = unitStats(this.players[tgt.o], tgt.t);
      if (td.cls.includes('villager')) {
        const hunting = tgt.task?.k === 'gather' && tgt.task.id === src.id;
        if (src.o === 0 && !hunting && !tgt.task?.k.startsWith('attack')) tgt.task = { k: 'attack', id: src.id };
        return;
      }
      if (ts.atk > 0 && tgt.stance !== 3 && (!tgt.task || (tgt.task.k === 'move' && tgt.task.am))) {
        if (tgt.stance === 2 && this.distTo(tgt.x, tgt.y, src) > ts.range + 0.5) return;
        if (tgt.hx === undefined) { tgt.hx = tgt.x; tgt.hy = tgt.y; }
        if (tgt.task) tgt.q.unshift(tgt.task);
        tgt.task = { k: 'attack', id: src.id };
      }
    }
  }

  killUnit(u: Unit, by: number, silent = false) {
    if (u.dead !== undefined) return;
    const d = unitDef(u.t);
    u.dead = 0;
    u.hp = 0;
    u.task = null;
    u.q = [];
    u.path = null;
    u.anim = 'dead';
    if (u.o > 0 && !d.cls.includes('animal')) {
      this.players[u.o].stats.losses++;
      if (by > 0 && by !== u.o) this.players[by].stats.kills++;
    }
    if (u.relic) {
      const r = this.relics.get(u.relic);
      if (r) { r.carrier = undefined; r.x = u.x; r.y = u.y; }
      u.relic = undefined;
    }
    if (u.cargo) {
      for (const id of u.cargo) {
        const c = this.units.get(id);
        if (c) { c.inside = undefined; this.killUnit(c, by, true); }
      }
      u.cargo = [];
    }
    if (u.food === undefined || u.food <= 0 || d.naval) u.food = undefined;
    if (!silent) this.events.push({ k: 'death', x: u.x, y: u.y, t: u.t, o: u.o });
  }

  destroyBuilding(b: Building, by: number) {
    if (!this.buildings.has(b.id)) return;
    this.buildings.delete(b.id);
    this.occupy(b, false);
    this.grid.regionDirty = true;
    const [cx, cy] = this.bcenter(b);
    if (b.o > 0) {
      this.players[b.o].stats.bLost++;
      if (by > 0 && by !== b.o) this.players[by].stats.razed++;
    }
    // eject garrison
    for (const id of b.gar) {
      const u = this.units.get(id);
      if (!u) continue;
      u.inside = undefined;
      const f = nearestFree(this.grid, cx, cy, false, 8, this.alliedFn(u.o));
      if (f) { u.x = f[0]; u.y = f[1]; } else this.killUnit(u, by);
    }
    // drop relics
    if (b.relics) {
      b.relics.forEach((rid, i) => {
        const r = this.relics.get(rid);
        if (!r) return;
        r.mon = undefined;
        const f = nearestFree(this.grid, cx + (i % 3) - 1, cy + Math.floor(i / 3) - 1, false, 6);
        if (f) { r.x = f[0]; r.y = f[1]; }
      });
    }
    // refund queue
    if (b.o > 0) for (const q of b.q) this.refundQueue(b, q);
    this.wonderT.delete(b.id);
    this.events.push({ k: 'collapse', x: cx, y: cy, t: b.t, o: b.o, id: b.id });
    this.rubble.push({ x: b.x, y: b.y, size: this.bsize(b), t: this.time, type: b.t });
  }

  private updateProjectiles(dt: number) {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.t += dt;
      // homing: track live unit targets
      if (p.tgt && p.splash === 0) {
        const tg = this.get(p.tgt);
        if (tg && tg.k === 'u' && tg.dead === undefined && !tg.inside) { p.tx = tg.x; p.ty = tg.y; p.tz = this.grid.h(tg.x, tg.y) + 0.35; }
      }
      if (p.t < p.dur) { keep.push(p); continue; }
      const src = this.units.get(p.src);
      if (p.splash > 0) {
        const hits: (Unit | Building)[] = [];
        this.unitsNear(p.tx, p.ty, p.splash + 0.3, (v) => {
          if (this.isAnimal(v) && v.o === 0) return;
          if (!p.friendly && !this.enemy(p.o, v.o)) return;
          if (v.o === p.o && p.kind !== 'stone' && p.kind !== 'cannon') return;
          hits.push(v);
        });
        const tg = this.get(p.tgt);
        if (tg && tg.k === 'b') hits.push(tg);
        else {
          const occ = this.grid.inb(Math.floor(p.tx), Math.floor(p.ty)) ? this.grid.occ[Math.floor(p.ty) * this.grid.size + Math.floor(p.tx)] : 0;
          const bb = occ ? this.buildings.get(occ) : undefined;
          if (bb && this.enemy(p.o, bb.o)) hits.push(bb);
        }
        for (const h of hits) {
          const [hx, hy] = this.epos(h);
          const dd = Math.hypot(hx - p.tx, hy - p.ty);
          const f = h.k === 'b' || dd < 0.5 ? 1 : 0.5;
          this.damage(p.o, p.atk * f, p.pierce, p.bonus, h, src && src.dead === undefined ? src : undefined);
        }
        this.events.push({ k: 'hit', t: p.kind, x: p.tx, y: p.ty, o: p.o });
      } else {
        const tg = this.get(p.tgt);
        if (tg && (tg.k === 'u' || tg.k === 'b') && this.targetAlive(tg)) {
          const dd = this.distTo(p.tx, p.ty, tg);
          if (dd < 0.6) this.damage(p.o, p.atk, p.pierce, p.bonus, tg, src && src.dead === undefined ? src : undefined);
        }
        if (p.kind !== 'arrow') this.events.push({ k: 'hit', t: p.kind, x: p.tx, y: p.ty, o: p.o });
      }
    }
    this.projectiles = keep;
  }

  // ------------------------------------------------------------------ animals

  private updateAnimal(u: Unit, d: ReturnType<typeof unitDef>, dt: number) {
    if (u.hx === undefined) { u.hx = u.x; u.hy = u.y; }
    if (u.task) {
      if (u.task.k === 'attack') {
        const tg = this.get(u.task.id);
        const leash = u.t === 'boar' ? 30 : 10;
        if (!this.targetAlive(tg) || Math.hypot(u.x - u.hx, u.y - u.hy!) > leash) {
          u.task = { k: 'move', x: u.hx, y: u.hy };
          return;
        }
        const fake = { ...unitStats(this.players[1], 'militia'), atk: d.atk, reload: d.reload, range: 0, bonus: {} };
        this.doAttack(u, tg as Unit | Building, 0, fake, dt, d.speed * 1.2);
        return;
      }
      if (u.task.k === 'move') {
        const t = u.task;
        const dx = t.x! - u.x, dy = t.y! - u.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.2) { u.task = null; u.anim = 'idle'; return; }
        const step = d.speed * dt * (d.flee ? 1.6 : 1);
        const nx = u.x + (dx / dist) * Math.min(step, dist), ny = u.y + (dy / dist) * Math.min(step, dist);
        if (this.grid.passable(nx, ny, false)) { u.x = nx; u.y = ny; u.anim = 'walk'; this.face(u, Math.atan2(dy, dx), dt); }
        else { u.task = null; u.anim = 'idle'; }
        return;
      }
      u.task = null;
    }
    u.anim = 'idle';
    u.scan -= dt;
    if (u.scan > 0) return;
    u.scan = 0.6 + this.rnd() * 0.6;
    if (d.flee) {
      let threat: Unit | null = null;
      this.unitsNear(u.x, u.y, 4, (v) => { if (!threat && v.o > 0 && !this.isAnimal(v)) threat = v; });
      if (threat) {
        const t = threat as Unit;
        const ang = Math.atan2(u.y - t.y, u.x - t.x) + (this.rnd() - 0.5);
        u.task = { k: 'move', x: u.x + Math.cos(ang) * 5, y: u.y + Math.sin(ang) * 5 };
        return;
      }
    }
    if (d.hostile) {
      let prey: Unit | null = null;
      this.unitsNear(u.x, u.y, d.los, (v) => { if (!prey && v.o > 0 && !this.isAnimal(v) && !unitDef(v.t).naval) prey = v; });
      if (prey) { u.task = { k: 'attack', id: (prey as Unit).id }; return; }
    }
    // wander
    if (this.rnd() < (u.t === 'sheep' ? 0.05 : 0.12)) {
      const ang = this.rnd() * Math.PI * 2;
      const r = 1 + this.rnd() * 2;
      const tx = u.hx + Math.cos(ang) * r, ty = u.hy! + Math.sin(ang) * r;
      u.task = { k: 'move', x: tx, y: ty };
    }
  }

  /** Sheep change owner when only one player's units are close. */
  private updateSheep() {
    if (this.tickCount % 5 !== 0) return;
    for (const u of this.units.values()) {
      if (u.t !== 'sheep' || u.dead !== undefined) continue;
      let owner = -1, ownerNear = false, conflict = false;
      this.unitsNear(u.x, u.y, 2.5, (v) => {
        if (v.o <= 0 || this.isAnimal(v)) return;
        if (v.o === u.o) ownerNear = true;
        else if (owner === -1) owner = v.o;
        else if (owner !== v.o) conflict = true;
      });
      if (!ownerNear && owner > 0 && !conflict && u.o !== owner) {
        u.o = owner;
        u.task = null;
        u.hx = u.x; u.hy = u.y;
      }
    }
  }

  // ------------------------------------------------------------------ economy tasks

  carryCap(u: Unit) {
    if (u.t === 'fishing_ship') return FISH_SHIP_CARRY * eco(this.players[u.o], 'carry') / 10;
    return eco(this.players[u.o], 'carry');
  }

  private gatherKindOf(e: Entity): GatherKind | null {
    if (e.k === 'r') return NODE_DEFS[e.t].gather;
    if (e.k === 'b') return e.t === 'farm' ? 'farm' : null;
    if (e.k === 'u') {
      if (e.t === 'sheep') return 'sheep';
      if (e.food !== undefined && this.isAnimal(e)) return 'hunt';
    }
    return null;
  }

  dropSiteFor(o: number, res: Res, x: number, y: number, naval: boolean): Building | null {
    let best: Building | null = null, bestD = Infinity;
    for (const b of this.buildings.values()) {
      if (b.o !== o || !b.done) continue;
      const d = buildingDef(b.t);
      if (!d.drop || !d.drop.includes(res)) continue;
      if (naval !== !!d.water) continue;
      const dd = this.distTo(x, y, b);
      if (dd < bestD) { bestD = dd; best = b; }
    }
    return best;
  }

  /** Find the nearest resource of a gather kind (for auto-continuation). */
  findResource(o: number, kind: GatherKind, x: number, y: number, maxD: number, exclude?: number): Entity | null {
    let best: Entity | null = null, bestD = maxD;
    if (kind === 'farm') {
      for (const b of this.buildings.values()) {
        if (b.o !== o || b.t !== 'farm' || !b.done || b.id === exclude) continue;
        if (b.farmer && b.farmer !== exclude && this.units.get(b.farmer)?.task?.id === b.id) continue;
        const dd = this.distTo(x, y, b);
        if (dd < bestD) { bestD = dd; best = b; }
      }
      return best;
    }
    if (kind === 'hunt' || kind === 'sheep') {
      this.unitsNear(x, y, maxD, () => {});
      for (const u of this.units.values()) {
        if (u.id === exclude || !this.isAnimal(u)) continue;
        if (kind === 'sheep' && u.t !== 'sheep') continue;
        if (kind === 'hunt' && u.t === 'sheep') continue;
        if (u.t === 'wolf') continue;
        if (u.dead !== undefined && !(u.food && u.food > 0)) continue;
        if (u.t === 'sheep' && u.o !== o && u.o !== 0 && u.dead === undefined) continue;
        if (u.t === 'boar' && u.dead === undefined) continue; // don't auto-hunt live boar
        const dd = Math.hypot(u.x - x, u.y - y) * (u.dead !== undefined ? 0.7 : 1);
        if (dd < bestD) { bestD = dd; best = u; }
      }
      return best;
    }
    const R = Math.ceil(maxD);
    const S = this.grid.size;
    const tx = Math.floor(x), ty = Math.floor(y);
    for (let r = 0; r <= R; r++) {
      let found: ResNode | null = null, fd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
          const id = this.grid.occ[ny * S + nx];
          if (!id || id === exclude) continue;
          const n = this.nodes.get(id);
          if (!n || NODE_DEFS[n.t].gather !== kind || n.amt <= 0) continue;
          const dd = (nx + 0.5 - x) ** 2 + (ny + 0.5 - y) ** 2;
          if (dd < fd) { fd = dd; found = n; }
        }
      }
      if (found) return found;
    }
    return null;
  }

  private taskGather(u: Unit, dt: number, speed: number) {
    const t = u.task!;
    const d = unitDef(u.t);
    const p = this.players[u.o];
    let tgt = this.get(t.id);
    // returning phase
    if (u.sub === 1) {
      if (!u.ct || u.ca <= 0) { u.sub = 0; return; }
      const drop = this.dropSiteFor(u.o, u.ct, u.x, u.y, !!d.naval);
      if (!drop) { u.anim = 'idle'; return; }
      const s = this.bsize(drop);
      const r = this.goTo(u, { x0: drop.x, y0: drop.y, x1: drop.x + s, y1: drop.y + s, range: 0.6 + d.radius }, dt, speed);
      if (r === 'arrived') {
        const amt = u.ca;
        p.res[u.ct] += amt;
        p.stats.gathered[u.ct] += amt;
        if (u.o === this.human) this.events.push({ k: 'deposit', x: u.x, y: u.y, t: u.ct, o: u.o });
        u.ca = 0;
        u.sub = 0;
        u.path = null;
      } else if (r === 'blocked') { u.anim = 'idle'; u.sub = 0; }
      return;
    }
    // validate target
    let kind = tgt ? this.gatherKindOf(tgt) : null;
    const depleted = !tgt || !kind ||
      (tgt.k === 'r' && tgt.amt <= 0) ||
      (tgt.k === 'b' && ((tgt.food ?? 0) <= 0 || !tgt.done || tgt.o !== u.o)) ||
      (tgt.k === 'u' && tgt.dead !== undefined && !(tgt.food && tgt.food > 0));
    if (depleted) {
      const k = (u.gk && u.gk !== 'build' ? u.gk : null) as GatherKind | null;
      const next = k ? this.findResource(u.o, k === 'sheep' ? 'sheep' : k, u.x, u.y, k === 'farm' ? 12 : 9, t.id) : null;
      const alt = !next && (k === 'sheep' || k === 'hunt') ? this.findResource(u.o, k === 'sheep' ? 'hunt' : 'sheep', u.x, u.y, 9, t.id) : null;
      const n2 = next ?? alt;
      if (n2) { t.id = n2.id; u.path = null; return; }
      // farm reseed
      if (k === 'farm' && tgt && tgt.k === 'b' && tgt.t === 'farm') { this.endTask(u); return; }
      if (u.ca > 0) { u.sub = 1; t.id = 0; return; }
      this.endTask(u);
      return;
    }
    tgt = tgt!;
    kind = kind!;
    if (d.naval && kind !== 'fish') { this.endTask(u); return; }
    // live animal: hunt it first
    if (tgt.k === 'u' && tgt.dead === undefined) {
      if (tgt.t === 'sheep' && tgt.o !== u.o && tgt.o !== 0) { this.endTask(u); return; }
      const st = unitStats(p, u.t);
      this.doAttack(u, tgt, tgt.t === 'sheep' ? 0 : 3, st, dt, speed);
      u.gk = kind;
      return;
    }
    const res = GATHER_RES[kind];
    if (u.ct !== res) { u.ct = res; u.ca = 0; }
    const cap = this.carryCap(u);
    if (u.ca >= cap) { u.sub = 1; u.path = null; return; }
    // go to it
    let goal: Goal;
    if (tgt.k === 'b') {
      // farm: stand inside it
      const s = this.bsize(tgt);
      goal = { x0: tgt.x + 0.6, y0: tgt.y + 0.6, x1: tgt.x + s - 0.6, y1: tgt.y + s - 0.6, range: 0.05 };
      if (tgt.farmer && tgt.farmer !== u.id) {
        const f = this.units.get(tgt.farmer);
        if (f && f.dead === undefined && f.task?.id === tgt.id) {
          const alt = this.findResource(u.o, 'farm', u.x, u.y, 12, tgt.id);
          if (alt) { t.id = alt.id; return; }
          this.endTask(u);
          return;
        }
      }
      tgt.farmer = u.id;
    } else if (tgt.k === 'r') {
      goal = { x0: tgt.x, y0: tgt.y, x1: tgt.x + 1, y1: tgt.y + 1, range: 0.55 + d.radius };
    } else {
      const tu = tgt as Unit;
      goal = { x0: tu.x, y0: tu.y, x1: tu.x, y1: tu.y, range: 0.45 + d.radius };
    }
    const r = this.goTo(u, goal, dt, speed);
    if (r === 'blocked') {
      const alt = this.findResource(u.o, kind, u.x, u.y, 6, tgt.id);
      if (alt) { t.id = alt.id; u.path = null; } else this.endTask(u);
      return;
    }
    if (r !== 'arrived') return;
    // gather
    const [tx, ty] = this.epos(tgt);
    if (tgt.k !== 'b') this.face(u, Math.atan2(ty - u.y, tx - u.x), dt);
    else if (this.rnd() < 0.02) u.a += (this.rnd() - 0.5) * 2;
    u.anim = 'work';
    u.gk = kind;
    u.last = tgt.id;
    let rate = GATHER_RATE[kind] * eco(p, `gather_${kind}` as 'gather_wood');
    if (!p.human) rate *= [0.8, 1, 1.1, 1.25, 1.4][p.diff] ?? 1;
    if (this.aegis.has(u.o)) rate *= 10;
    let amt = Math.min(rate * dt, cap - u.ca);
    if (tgt.k === 'r') {
      amt = Math.min(amt, tgt.amt);
      tgt.amt -= amt;
      if (tgt.amt <= 0) this.removeNode(tgt);
    } else if (tgt.k === 'b') {
      amt = Math.min(amt, tgt.food ?? 0);
      tgt.food = (tgt.food ?? 0) - amt;
      if ((tgt.food ?? 0) <= 0) this.farmDepleted(tgt);
    } else {
      const tu = tgt as Unit;
      amt = Math.min(amt, tu.food ?? 0);
      tu.food = (tu.food ?? 0) - amt;
      if ((tu.food ?? 0) <= 0) this.units.delete(tu.id);
    }
    u.ca += amt;
    if (u.ca >= cap - 1e-6) { u.sub = 1; u.path = null; }
  }

  private farmDepleted(b: Building) {
    const p = this.players[b.o];
    const farmer = b.farmer ? this.units.get(b.farmer) : undefined;
    // auto-reseed if affordable
    const cost = buildingStats(p, 'farm').cost;
    if (b.reseed && canAfford(p, cost)) {
      pay(p, cost);
      b.food = eco(p, 'farmFood');
      b.prog = 0; b.done = false; b.hp = 1;
      if (farmer) { farmer.task = { k: 'build', id: b.id }; farmer.sub = 0; if (farmer.ca > 0) farmer.q.unshift({ k: 'gather', id: b.id }); }
      return;
    }
    this.buildings.delete(b.id);
    this.occupy(b, false);
    this.events.push({ k: 'msg', o: b.o, text: 'A farm has been exhausted.' });
  }

  private taskBuild(u: Unit, dt: number, speed: number) {
    const t = u.task!;
    const b = this.buildings.get(t.id!);
    const p = this.players[u.o];
    if (!b || !this.allied(b.o, u.o)) { this.endTask(u); return; }
    const bs = buildingStats(this.players[b.o], b.t);
    if (t.k === 'build' && b.done) { this.afterBuild(u, b); return; }
    if (t.k === 'repair' && (b.hp >= bs.hp || !b.done)) {
      if (!b.done) { t.k = 'build'; return; }
      this.endTask(u); return;
    }
    const s = this.bsize(b);
    const d = unitDef(u.t);
    const r = this.goTo(u, { x0: b.x, y0: b.y, x1: b.x + s, y1: b.y + s, range: 0.5 + d.radius }, dt, speed);
    if (r === 'blocked') { this.endTask(u); return; }
    if (r !== 'arrived') return;
    const [cx, cy] = this.bcenter(b);
    this.face(u, Math.atan2(cy - u.y, cx - u.x), dt);
    // wait for units to clear the footprint before starting construction
    if (t.k === 'build' && b.prog === 0) {
      let blocked = false;
      if (!buildingDef(b.t).passable) {
        this.unitsNear(cx, cy, s, (v) => {
          if (v.x > b.x && v.x < b.x + s && v.y > b.y && v.y < b.y + s && !this.isAnimal(v)) {
            blocked = true;
            if (v.o === u.o && !v.task) {
              const f = nearestFree(this.grid, v.x, v.y, false, 6, this.alliedFn(v.o));
              if (f) v.task = { k: 'move', x: f[0], y: f[1] };
            } else if (v.o === u.o) {
              const f = nearestFree(this.grid, v.x, v.y, false, 6, this.alliedFn(v.o));
              if (f) { v.x = f[0]; v.y = f[1]; v.path = null; }
            }
          }
        });
      }
      if (blocked) { u.anim = 'idle'; return; }
    }
    u.anim = 'work';
    u.gk = 'build';
    const n = Math.max(1, this.buildersPrev.get(b.id) ?? 1);
    this.builders.set(b.id, (this.builders.get(b.id) ?? 0) + 1);
    const rate = (3 / (n + 2)) / bs.time * eco(p, 'build') * (this.aegis.has(u.o) ? 60 : 1);
    if (t.k === 'build') {
      const before = b.prog;
      b.prog = Math.min(1, b.prog + rate * dt);
      b.hp = Math.min(bs.hp, b.hp + (b.prog - before) * bs.hp);
      if (b.prog >= 1) {
        b.done = true;
        b.hp = Math.max(1, b.hp);
        this.onBuildingComplete(b, false);
        this.afterBuild(u, b);
      }
    } else {
      const hpRate = bs.hp * rate * 0.5 * (n / Math.max(1, n));
      const dh = Math.min(hpRate * dt, bs.hp - b.hp);
      // repair cost: 50% of building cost for full hp
      const cost = bs.cost;
      const frac = dh / bs.hp * 0.5;
      for (const k in cost) {
        const need = (cost[k as Res] ?? 0) * frac;
        if (p.res[k as Res] < need) { this.endTask(u); return; }
      }
      for (const k in cost) p.res[k as Res] -= (cost[k as Res] ?? 0) * frac;
      b.hp += dh;
    }
  }

  private afterBuild(u: Unit, b: Building) {
    this.endTask(u);
    const d = buildingDef(b.t);
    if (b.t === 'farm' && b.o === u.o) {
      if (!b.farmer || b.farmer === u.id || !this.units.get(b.farmer)?.task) { b.farmer = u.id; u.task = { k: 'gather', id: b.id }; return; }
    }
    if (u.q.length) return;
    // continue with nearby unfinished foundations of the same kind (walls, houses)
    let next: Building | null = null, nd = 12;
    for (const o of this.buildings.values()) {
      if (o.o !== u.o || o.done || o.id === b.id) continue;
      const dd = this.distTo(u.x, u.y, o);
      if (dd < nd && (o.t === b.t || (d.wall && buildingDef(o.t).gate))) { nd = dd; next = o; }
    }
    if (next) { u.task = { k: 'build', id: next.id }; return; }
    if (d.drop) {
      const [cx, cy] = this.bcenter(b);
      const order: GatherKind[] = d.drop.includes('wood') && d.drop.length === 1 ? ['wood'] : d.drop.includes('gold') && d.drop.length === 2 ? ['gold', 'stone'] : b.t === 'mill' ? ['forage', 'farm'] : [];
      for (const k of order) {
        const n = this.findResource(u.o, k, cx, cy, 8);
        if (n) { u.task = { k: 'gather', id: n.id }; return; }
      }
    }
  }

  private onBuildingComplete(b: Building, initial: boolean) {
    this.recountPop();
    if (!initial) {
      this.events.push({ k: 'built', o: b.o, t: b.t, x: b.x, y: b.y, id: b.id });
      if (b.t === 'farm') b.food = eco(this.players[b.o], 'farmFood');
    }
    const bs = buildingStats(this.players[b.o], b.t);
    b.hp = Math.min(b.hp, bs.hp);
    if (initial) b.hp = bs.hp;
  }

  private taskGarrison(u: Unit, dt: number, speed: number) {
    const t = u.task!;
    const tgt = this.get(t.id);
    const d = unitDef(u.t);
    if (!tgt || (tgt.k !== 'b' && tgt.k !== 'u')) { this.endTask(u); return; }
    if (tgt.k === 'b') {
      if (!tgt.done || !this.canGarrison(u, tgt)) { this.endTask(u); return; }
      const s = this.bsize(tgt);
      const r = this.goTo(u, { x0: tgt.x, y0: tgt.y, x1: tgt.x + s, y1: tgt.y + s, range: 0.6 + d.radius }, dt, speed);
      if (r === 'blocked') { this.endTask(u); return; }
      if (r !== 'arrived') return;
      if (tgt.t === 'monastery' && u.relic) {
        const rel = this.relics.get(u.relic);
        if (rel) { rel.carrier = undefined; rel.mon = tgt.id; tgt.relics!.push(rel.id); }
        u.relic = undefined;
        this.events.push({ k: 'relic', o: u.o, text: 'Relic stored in the Monastery.' });
        this.endTask(u);
        return;
      }
      this.enter(u, tgt);
    } else {
      // transport ship
      const ship = tgt as Unit;
      if (ship.dead !== undefined || !ship.cargo || ship.o !== u.o) { this.endTask(u); return; }
      const cap = unitDef(ship.t).cargo ?? 0;
      if (ship.cargo.length >= cap) { this.endTask(u); return; }
      const dist = Math.hypot(ship.x - u.x, ship.y - u.y);
      if (dist > 3.2) {
        if (u.sub !== 2 || dist > 10) {
          u.sub = 0;
          const r = this.goTo(u, { x0: ship.x, y0: ship.y, x1: ship.x, y1: ship.y, range: 1.6 }, dt, speed);
          if (r === 'moving') return;
          u.sub = 2;
        }
        // reached the shore but the ship is out of reach: call the ship over
        if (!ship.task || ship.task.k === 'move') {
          const w = nearestFree(this.grid, u.x, u.y, true, 4);
          if (w) ship.task = { k: 'move', x: w[0], y: w[1] };
        }
        u.anim = 'idle';
        u.path = null;
        return;
      }
      ship.cargo.push(u.id);
      u.inside = ship.id;
      u.task = null; u.q = []; u.path = null;
    }
  }

  canGarrison(u: Unit, b: Building): boolean {
    if (!this.allied(b.o, u.o) || !b.done) return false;
    const d = unitDef(u.t);
    if (d.naval) return false;
    if (b.t === 'monastery') return !!u.relic;
    const bs = buildingStats(this.players[b.o], b.t);
    if (!bs.garrison || b.gar.length >= bs.garrison) return false;
    if (b.t === 'town_center' || b.t === 'watch_tower') return d.cls.includes('villager') || d.cls.includes('infantry') || d.cls.includes('archer') && !d.cls.includes('cavalry') || d.cls.includes('monk');
    if (b.t === 'castle') return !d.cls.includes('siege');
    return false;
  }

  enter(u: Unit, b: Building) {
    b.gar.push(u.id);
    u.inside = b.id;
    u.task = null;
    u.q = [];
    u.path = null;
    u.anim = 'idle';
  }

  ungarrison(b: Building, ids?: number[]) {
    const [cx, cy] = this.bcenter(b);
    const out = ids ?? [...b.gar];
    const s = this.bsize(b);
    for (const id of out) {
      const u = this.units.get(id);
      b.gar = b.gar.filter((g) => g !== id);
      if (!u) continue;
      u.inside = undefined;
      const ex = b.rally ? b.rally.x : cx, ey = b.rally ? b.rally.y + 0 : cy + s;
      const f = nearestFree(this.grid, cx + (ex - cx) * 0.3, cy + (ey - cy) * 0.3, false, 10, this.alliedFn(u.o)) ?? [cx, cy + s / 2 + 0.5];
      u.x = f[0] + (this.rnd() - 0.5) * 0.3; u.y = f[1] + (this.rnd() - 0.5) * 0.3;
      u.px = u.x; u.py = u.y;
      if (u.bell) { u.task = u.bell; u.bell = null; }
      else if (b.rally) u.task = { k: 'move', x: b.rally.x, y: b.rally.y };
    }
  }

  private taskHeal(u: Unit, dt: number, speed: number) {
    const tgt = this.units.get(u.task!.id!);
    if (!tgt || tgt.dead !== undefined || tgt.inside || !this.allied(tgt.o, u.o)) { this.endTask(u); return; }
    const ts = unitStats(this.players[tgt.o], tgt.t);
    if (tgt.hp >= ts.hp) { this.endTask(u); return; }
    const r = this.goTo(u, { x0: tgt.x, y0: tgt.y, x1: tgt.x, y1: tgt.y, range: 3.5 }, dt, speed);
    if (r === 'blocked') { this.endTask(u); return; }
    if (r !== 'arrived') return;
    this.face(u, Math.atan2(tgt.y - u.y, tgt.x - u.x), dt);
    u.anim = 'work';
    const st = unitStats(this.players[u.o], u.t);
    tgt.hp = Math.min(ts.hp, tgt.hp + st.heal * dt * 1.5);
  }

  private taskConvert(u: Unit, dt: number, speed: number) {
    const tgt = this.units.get(u.task!.id!);
    const d = tgt ? unitDef(tgt.t) : null;
    if (!tgt || !d || tgt.dead !== undefined || tgt.inside || !this.enemy(u.o, tgt.o) || d.cls.includes('siege') && !d.naval && tgt.t !== 'trebuchet' && false) { this.endTask(u); return; }
    if (d.cls.includes('animal')) { this.endTask(u); return; }
    if (u.rest && u.rest > 0) { u.anim = 'idle'; return; }
    const st = unitStats(this.players[u.o], u.t);
    const dist = Math.hypot(tgt.x - u.x, tgt.y - u.y);
    if (dist > st.range) {
      u.conv = undefined;
      const r = this.goTo(u, { x0: tgt.x, y0: tgt.y, x1: tgt.x, y1: tgt.y, range: st.range - 0.5 }, dt, speed);
      if (r === 'blocked') this.endTask(u);
      return;
    }
    u.path = null;
    this.face(u, Math.atan2(tgt.y - u.y, tgt.x - u.x), dt);
    u.anim = 'work';
    if (u.conv === undefined) u.conv = 4 + this.rnd() * 6 * (d.cls.includes('monk') ? 1.5 : 1);
    u.conv -= dt;
    if (u.conv <= 0) {
      const from = tgt.o;
      tgt.o = u.o;
      tgt.task = null; tgt.q = []; tgt.path = null;
      const ns = unitStats(this.players[u.o], tgt.t);
      tgt.hp = Math.min(tgt.hp, ns.hp);
      if (tgt.cargo) for (const id of tgt.cargo) { const c = this.units.get(id); if (c) c.o = u.o; }
      this.players[u.o].stats.converted++;
      this.events.push({ k: 'convert', o: u.o, x: tgt.x, y: tgt.y, text: from === this.human ? 'One of your units was converted!' : u.o === this.human ? 'Unit converted!' : undefined });
      u.rest = 62 * eco(this.players[u.o], 'monkRest');
      this.endTask(u);
    }
  }

  private taskRelic(u: Unit, dt: number, speed: number) {
    const r = this.relics.get(u.task!.id!);
    if (!r || r.carrier || r.mon || u.relic || u.t !== 'monk') { this.endTask(u); return; }
    const res = this.goTo(u, { x0: r.x, y0: r.y, x1: r.x, y1: r.y, range: 0.6 }, dt, speed);
    if (res === 'blocked') { this.endTask(u); return; }
    if (res !== 'arrived') return;
    r.carrier = u.id;
    u.relic = r.id;
    this.events.push({ k: 'relic', o: u.o, text: u.o === this.human ? 'Relic picked up. Bring it to a Monastery.' : undefined });
    // auto-return to nearest monastery
    let best: Building | null = null, bd = Infinity;
    for (const b of this.buildings.values()) {
      if (b.o !== u.o || b.t !== 'monastery' || !b.done) continue;
      const dd = this.distTo(u.x, u.y, b);
      if (dd < bd) { bd = dd; best = b; }
    }
    if (best) u.task = { k: 'garrison', id: best.id };
    else this.endTask(u);
  }

  private taskUnload(u: Unit, dt: number, speed: number) {
    const t = u.task!;
    if (!u.cargo || u.cargo.length === 0) { this.endTask(u); return; }
    const r = this.goTo(u, { x0: t.x!, y0: t.y!, x1: t.x!, y1: t.y!, range: 1.2 }, dt, speed);
    if (r === 'moving') {
      // close to any shore?
      const land = nearestFree(this.grid, u.x, u.y, false, 1);
      if (!land || Math.hypot(land[0] - t.x!, land[1] - t.y!) > 4) return;
    }
    const land = nearestFree(this.grid, u.x, u.y, false, 3);
    if (!land) { if (r !== 'moving') this.endTask(u); return; }
    for (const id of u.cargo) {
      const c = this.units.get(id);
      if (!c) continue;
      c.inside = undefined;
      const f = nearestFree(this.grid, land[0] + (this.rnd() - 0.5), land[1] + (this.rnd() - 0.5), false, 3) ?? land;
      c.x = f[0]; c.y = f[1]; c.px = c.x; c.py = c.y;
      if (this.grid.passable(t.x!, t.y!, false)) c.task = { k: 'move', x: t.x! + (this.rnd() - 0.5) * 2, y: t.y! + (this.rnd() - 0.5) * 2 };
    }
    u.cargo = [];
    this.endTask(u);
  }

  private taskFollow(u: Unit, dt: number, speed: number) {
    const tgt = this.units.get(u.task!.id!);
    if (!tgt || tgt.dead !== undefined) { this.endTask(u); return; }
    const r = this.goTo(u, { x0: tgt.x, y0: tgt.y, x1: tgt.x, y1: tgt.y, range: 1.5 }, dt, speed);
    if (r === 'arrived') u.anim = 'idle';
  }

  // ------------------------------------------------------------------ buildings

  private updateBuilding(b: Building, dt: number) {
    const p = this.players[b.o];
    if (!b.done) return;
    const d = buildingDef(b.t);
    const bs = buildingStats(p, b.t);
    if (b.autoVil && b.q.length === 0 && p.pop < p.popCap) this.cmdTrain(b.o, b.id, 'villager', 1);
    // production / research
    if (b.q.length) {
      const item = b.q[0];
      let ok = true;
      if (item.u) {
        const pop = unitDef(item.u).pop ?? 1;
        if (p.pop + pop > p.popCap) {
          ok = false;
          if (b.o === this.human && this.time - this.housedT > 15 && item.t >= item.total - 0.2) {
            this.housedT = this.time;
            this.events.push({ k: 'housed', o: b.o, text: p.popCap >= this.settings.popCap ? 'Population limit reached.' : 'You need to build more houses.' });
          }
        }
      }
      if (ok) {
        item.t += dt * (this.aegis.has(b.o) ? 25 : 1);
        if (item.t >= item.total) {
          if (item.u) {
            const pop = unitDef(item.u).pop ?? 1;
            if (p.pop + pop <= p.popCap) {
              b.q.shift();
              this.produce(b, item.u);
              p.pop += pop;
            } else item.t = item.total;
          } else if (item.tech) {
            b.q.shift();
            this.completeTech(p, item.tech, b);
          }
        }
      }
    }
    // attack
    if (bs.atk > 0) {
      if (b.cd > 0) b.cd -= dt;
      if (b.cd <= 0) {
        const [cx, cy] = this.bcenter(b);
        const range = bs.range + d.size / 2;
        let tgt = b.tgt ? this.units.get(b.tgt) : undefined;
        if (!tgt || tgt.dead !== undefined || tgt.inside || Math.hypot(tgt.x - cx, tgt.y - cy) > range || !this.enemy(b.o, tgt.o)) {
          tgt = undefined;
          let bd = Infinity;
          this.unitsNear(cx, cy, range, (u) => {
            if (!this.enemy(b.o, u.o)) return;
            let dd = (u.x - cx) ** 2 + (u.y - cy) ** 2;
            if (unitDef(u.t).cls.includes('ram')) dd += 50; // arrows don't hurt rams much
            if (dd < bd) { bd = dd; tgt = u; }
          });
          b.tgt = (tgt as Unit | undefined)?.id;
        }
        if (tgt) {
          const g = b.gar.filter((id) => { const u = this.units.get(id); return u && (unitDef(u.t).cls.includes('villager') || unitDef(u.t).cls.includes('archer') || unitDef(u.t).cls.includes('infantry')); }).length;
          const arrows = (b.t === 'castle' ? 4 : 1) + g;
          b.cd = d.reload ?? 2;
          const tu = tgt as Unit;
          for (let k = 0; k < arrows; k++) {
            const ox = (this.rnd() - 0.5) * d.size * 0.5, oy = (this.rnd() - 0.5) * d.size * 0.5;
            const sx = cx + ox, sy = cy + oy;
            const dist = Math.hypot(tu.x - sx, tu.y - sy);
            this.projectiles.push({
              kind: 'arrow', o: b.o, src: b.id, tgt: tu.id, sx, sy, sz: this.grid.h(cx, cy) + (b.t === 'watch_tower' ? 2.4 : b.t === 'castle' ? 2.2 : 1.6),
              tx: tu.x, ty: tu.y, tz: this.grid.h(tu.x, tu.y) + 0.35, t: -k * 0.12, dur: dist / 11, atk: bs.atk, pierce: true, bonus: {}, splash: 0, friendly: false, arc: 0.1,
            });
          }
          this.events.push({ k: 'fire', t: 'arrow', x: cx, y: cy, o: b.o });
        }
      }
    }
    // fire damage visual flag
    b.burn = b.hp / bs.hp;
  }

  private produce(b: Building, t: UnitKey) {
    const d = unitDef(t);
    const p = this.players[b.o];
    const [cx, cy] = this.bcenter(b);
    const s = this.bsize(b);
    const rx = b.rally?.x ?? cx + s, ry = b.rally?.y ?? cy + s;
    // spawn at the building edge nearest to the rally point
    const ang = Math.atan2(ry - cy, rx - cx);
    const ex = cx + Math.cos(ang) * (s / 2 + 0.6), ey = cy + Math.sin(ang) * (s / 2 + 0.6);
    const f = nearestFree(this.grid, ex, ey, !!d.naval, 10, this.alliedFn(b.o));
    if (!f) return;
    const u = this.spawnUnit(t, b.o, f[0], f[1]);
    u.a = ang;
    p.stats.trained++;
    if (b.o === this.human) this.events.push({ k: 'trained', o: b.o, t, x: u.x, y: u.y, id: u.id });
    if (b.rally) {
      const re = b.rally.id ? this.get(b.rally.id) : undefined;
      if (re && t === 'villager') {
        const k = this.gatherKindOf(re);
        if (k) { u.task = { k: 'gather', id: re.id }; return; }
        if (re.k === 'b' && !re.done) { u.task = { k: 'build', id: re.id }; return; }
      }
      if (re && t === 'fishing_ship' && re.k === 'r' && re.t === 'fish') { u.task = { k: 'gather', id: re.id }; return; }
      if (re && re.k === 'b' && this.canGarrison(u, re)) { u.task = { k: 'garrison', id: re.id }; return; }
      u.task = { k: 'move', x: b.rally.x, y: b.rally.y };
    }
  }

  private completeTech(p: Player, id: string, b: Building) {
    const t = TECH_BY_ID[id];
    p.techs.push(id);
    p.stats.techs++;
    const oldHp = new Map<string, number>();
    if (t.isAge) {
      p.age = t.isAge;
      p.stats.ageT[p.age] = this.time;
      this.events.push({ k: 'age', o: p.id, text: `${p.name} advanced to the ${['', 'Dark', 'Feudal', 'Castle', 'Imperial'][p.age]} Age.` });
    } else {
      this.events.push({ k: 'research', o: p.id, t: id, text: p.id === this.human ? `${t.name} researched.` : undefined, x: b.x, y: b.y });
    }
    // remember old max HP to scale current HP
    for (const u of this.units.values()) if (u.o === p.id && !oldHp.has(u.t)) oldHp.set(u.t, unitStats(p, u.t).hp);
    const oldB = new Map<string, number>();
    for (const bb of this.buildings.values()) if (bb.o === p.id && !oldB.has(bb.t)) oldB.set(bb.t, buildingStats(p, bb.t).hp);
    clearStatCache();
    if (t.upgrade) {
      const [from, to] = t.upgrade;
      for (const u of this.units.values()) {
        if (u.o !== p.id || u.t !== from || u.dead !== undefined) continue;
        const frac = u.hp / (oldHp.get(from) ?? 1);
        u.t = to;
        u.hp = Math.max(1, frac * unitStats(p, to).hp);
      }
    }
    for (const u of this.units.values()) {
      if (u.o !== p.id || u.dead !== undefined) continue;
      const before = oldHp.get(u.t);
      const after = unitStats(p, u.t).hp;
      if (before !== undefined && after > before) u.hp += after - before;
    }
    for (const bb of this.buildings.values()) {
      if (bb.o !== p.id) continue;
      const before = oldB.get(bb.t);
      const after = buildingStats(p, bb.t).hp;
      if (before !== undefined && after !== before) bb.hp = Math.max(1, bb.hp * (after / before));
    }
  }

  private refundQueue(b: Building, q: QueueItemLike) {
    const p = this.players[b.o];
    if (q.u) refund(p, unitStats(p, q.u).cost);
    else if (q.tech) refund(p, techCost(p, q.tech));
  }

  // ------------------------------------------------------------------ availability (UI + AI)

  hasBuilding(o: number, t: BuildingKey, done = true) {
    for (const b of this.buildings.values()) if (b.o === o && b.t === t && (!done || b.done)) return true;
    return false;
  }

  countBuildings(o: number, t: BuildingKey, includeUnfinished = true) {
    let n = 0;
    for (const b of this.buildings.values()) if (b.o === o && b.t === t && (includeUnfinished || b.done)) n++;
    return n;
  }

  researchedOrQueued(p: Player, id: string) {
    if (p.techs.includes(id)) return true;
    for (const b of this.buildings.values()) if (b.o === p.id && b.q.some((q) => q.tech === id)) return true;
    return false;
  }

  /** Can this building type be built by player (age + prerequisites)? Returns reason or null. */
  buildBlock(o: number, t: BuildingKey): string | null {
    const p = this.players[o];
    const d = buildingDef(t);
    if (d.age > p.age) return `Requires ${['', 'Dark', 'Feudal', 'Castle', 'Imperial'][d.age]} Age`;
    if (d.req && !this.hasBuilding(o, d.req)) return `Requires a ${buildingDef(d.req).name}`;
    if (d.max && this.countBuildings(o, t) >= d.max) return 'Limit reached';
    return null;
  }

  /** The unit types a building can currently train for its owner. */
  trainable(b: Building): UnitKey[] {
    const p = this.players[b.o];
    const d = buildingDef(b.t);
    const out: UnitKey[] = [];
    const list = [...d.trains];
    if (b.t === 'castle') list.unshift(CIVS[p.civ].unique);
    for (const base of list) {
      const ud = unitDef(base);
      let t = base;
      if (ud.line) {
        // the most advanced researched member of this line
        const line = LINES[ud.line];
        for (const tech of Object.values(TECH_BY_ID)) {
          if (tech.upgrade && p.techs.includes(tech.id) && line.includes(tech.upgrade[1])) {
            if (line.indexOf(tech.upgrade[1]) > line.indexOf(t)) t = tech.upgrade[1];
          }
        }
      }
      out.push(t);
    }
    return out;
  }

  trainBlock(b: Building, t: UnitKey): string | null {
    const p = this.players[b.o];
    const d = unitDef(t);
    const line = d.line ? LINES[d.line] : null;
    const baseAge = line ? unitDef(line[0]).age : d.age;
    if (baseAge > p.age) return `Requires ${['', 'Dark', 'Feudal', 'Castle', 'Imperial'][baseAge]} Age`;
    if (t === 'hand_cannoneer' || t === 'bombard_cannon' || t === 'cannon_galleon') {
      if (!p.techs.includes('chemistry')) return 'Requires Chemistry';
    }
    if (t === 'trebuchet' && p.age < 4) return 'Requires Imperial Age';
    return null;
  }

  /** Techs shown at a building: those not researched whose prerequisites are met. */
  techsAt(b: Building): string[] {
    const p = this.players[b.o];
    const out: string[] = [];
    for (const t of Object.values(TECH_BY_ID)) {
      if (t.at !== b.t) continue;
      if (t.civ && t.civ !== p.civ) continue;
      if (t.isAge) { if (t.isAge !== p.age + 1) continue; }
      if (this.researchedOrQueued(p, t.id)) continue;
      if (t.req && !t.req.every((r) => p.techs.includes(r) || this.researchedOrQueued(p, r))) continue;
      if (t.upgrade && t.upgrade[0] && t.req === undefined) {
        // only show upgrade if previous member is available (base line)
      }
      out.push(t.id);
    }
    return out;
  }

  techBlock(o: number, id: string): string | null {
    const p = this.players[o];
    const t = TECH_BY_ID[id];
    if (t.age > p.age) return `Requires ${['', 'Dark', 'Feudal', 'Castle', 'Imperial'][t.age]} Age`;
    if (t.req && !t.req.every((r) => p.techs.includes(r))) return `Requires ${t.req.map((r) => TECH_BY_ID[r].name).join(', ')}`;
    if (t.isAge) {
      const need = 2;
      const have = this.ageUpBuildings(o, p.age);
      if (have < need) return `Requires 2 different ${['', 'Dark', 'Feudal', 'Castle', 'Imperial'][p.age]} Age buildings (${have}/2)`;
      for (const b of this.buildings.values()) if (b.o === o && b.q.some((q) => q.tech && TECH_BY_ID[q.tech].isAge)) return 'Already advancing';
    }
    return null;
  }

  ageUpBuildings(o: number, age: number): number {
    const types = new Set<string>();
    for (const b of this.buildings.values()) {
      if (b.o !== o || !b.done) continue;
      const d = buildingDef(b.t);
      if (d.ageUp && d.age === age) {
        if (b.t === 'castle') return 2;
        types.add(b.t);
      }
    }
    return types.size;
  }

  // ------------------------------------------------------------------ placement

  canPlace(o: number, t: BuildingKey, x: number, y: number, checkExplored = true): boolean {
    const d = buildingDef(t);
    const S = this.grid.size;
    let touchesLand = false;
    for (let yy = y; yy < y + d.size; yy++) {
      for (let xx = x; xx < x + d.size; xx++) {
        if (xx < 0 || yy < 0 || xx >= S || yy >= S) return false;
        const i = yy * S + xx;
        if (this.grid.occ[i]) {
          // allow gates over own walls
          const ob = this.buildings.get(this.grid.occ[i]);
          if (!(d.gate && ob && ob.o === o && buildingDef(ob.t).wall)) return false;
        }
        if (checkExplored && o === this.human && !this.explored[i]) return false;
        const ter = this.grid.terrain[i];
        if (d.water) {
          if (ter !== T_WATER && ter !== T_SHALLOW) return false;
        } else if (ter === T_WATER || ter === T_SHALLOW) return false;
      }
    }
    if (d.water) {
      for (let yy = y - 1; yy <= y + d.size; yy++) for (let xx = x - 1; xx <= x + d.size; xx++) {
        if (!this.grid.inb(xx, yy)) continue;
        const ter = this.grid.terrain[yy * S + xx];
        if (ter !== T_WATER && ter !== T_SHALLOW) touchesLand = true;
      }
      if (!touchesLand) return false;
    }
    // no placing on top of enemy units
    let enemyUnit = false;
    this.unitsNear(x + d.size / 2, y + d.size / 2, d.size, (u) => {
      if (u.x > x && u.x < x + d.size && u.y > y && u.y < y + d.size && this.enemy(o, u.o)) enemyUnit = true;
    });
    return !enemyUnit;
  }

  /** Wall tile line from (x0,y0) to (x1,y1) with 4-connectivity. */
  wallLine(x0: number, y0: number, x1: number, y1: number): [number, number][] {
    const out: [number, number][] = [];
    let x = x0, y = y0;
    out.push([x, y]);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x1 > x0 ? 1 : -1, sy = y1 > y0 ? 1 : -1;
    let err = dx - dy;
    let guard = 0;
    while ((x !== x1 || y !== y1) && guard++ < 400) {
      const e2 = 2 * err;
      if (e2 > -dy && x !== x1) { err -= dy; x += sx; out.push([x, y]); }
      else if (e2 < dx && y !== y1) { err += dx; y += sy; out.push([x, y]); }
      else if (x !== x1) { x += sx; out.push([x, y]); }
      else { y += sy; out.push([x, y]); }
    }
    return out;
  }

  // ------------------------------------------------------------------ commands

  private ownUnits(o: number, ids: number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const u = this.units.get(id);
      if (u && u.o === o && u.dead === undefined && !u.inside) out.push(u);
    }
    return out;
  }

  private assign(u: Unit, task: Task, queue: boolean) {
    if (queue && (u.task || u.q.length)) { u.q.push(task); return; }
    u.q = [];
    u.task = task;
    u.path = null;
    u.sub = u.ca > 0 && task.k === 'gather' ? u.sub : 0;
    u.conv = undefined;
    if (task.k !== 'gather' || u.sub !== 1) u.sub = 0;
    u.hx = undefined;
  }

  cmdMove(o: number, ids: number[], x: number, y: number, opts: { am?: boolean; queue?: boolean; patrol?: boolean } = {}) {
    const us = this.ownUnits(o, ids);
    if (!us.length) return;
    // formation: spread units in a grid around the target, keeping relative order
    const n = us.length;
    const cols = Math.ceil(Math.sqrt(n));
    let mx = 0, my = 0;
    for (const u of us) { mx += u.x; my += u.y; }
    mx /= n; my /= n;
    const ang = Math.atan2(y - my, x - mx);
    const fx = Math.cos(ang), fy = Math.sin(ang);
    const sorted = [...us].sort((a, b) => {
      const ra = (a.x - mx) * -fy + (a.y - my) * fx;
      const rb = (b.x - mx) * -fy + (b.y - my) * fx;
      return ra - rb;
    });
    // put melee in front, ranged & siege behind
    const front = (u: Unit) => { const d = unitDef(u.t); return d.range > 0 ? (d.cls.includes('siege') ? 2 : 1) : 0; };
    sorted.sort((a, b) => front(a) - front(b));
    const spacing = 0.75;
    sorted.forEach((u, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const lateral = (col - (Math.min(cols, n - row * cols) - 1) / 2) * spacing;
      const back = row * spacing;
      let tx = x + -fy * lateral - fx * back;
      let ty = y + fx * lateral - fy * back;
      if (n === 1) { tx = x; ty = y; }
      const d = unitDef(u.t);
      if (!this.grid.passable(tx, ty, !!d.naval, this.alliedFn(o))) {
        const f = nearestFree(this.grid, tx, ty, !!d.naval, 3, this.alliedFn(o));
        if (f) { tx = f[0]; ty = f[1]; }
      }
      if (u.t === 'sheep') { u.task = { k: 'move', x: tx, y: ty }; return; }
      if (opts.patrol) this.assign(u, { k: 'patrol', x: u.x, y: u.y, x2: tx, y2: ty, leg: 1 }, !!opts.queue);
      else this.assign(u, { k: 'move', x: tx, y: ty, am: opts.am }, !!opts.queue);
      if (u.stance === 1) { u.hx = tx; u.hy = ty; }
    });
  }

  /** Smart right-click / tap on an entity. */
  cmdTarget(o: number, ids: number[], targetId: number, queue = false): string | null {
    const tgt = this.get(targetId);
    const us = this.ownUnits(o, ids);
    if (!tgt || !us.length) return null;
    let did: string | null = null;
    const moveTo = (u: Unit) => { const [x, y] = this.epos(tgt); this.assign(u, { k: 'move', x, y }, queue); };
    for (const u of us) {
      const d = unitDef(u.t);
      const st = unitStats(this.players[o], u.t);
      const vil = d.cls.includes('villager');
      if (u.t === 'sheep') { moveTo(u); continue; }
      if (tgt.k === 'relic') {
        if (u.t === 'monk' && !tgt.carrier && !tgt.mon) { this.assign(u, { k: 'relic', id: tgt.id }, queue); did = 'relic'; }
        else moveTo(u);
        continue;
      }
      if (tgt.k === 'r') {
        if (vil && tgt.t !== 'fish') { this.assign(u, { k: 'gather', id: tgt.id }, queue); did = 'gather'; }
        else if (vil && tgt.t === 'fish' && nearestFree(this.grid, tgt.x + 0.5, tgt.y + 0.5, false, 1)) { this.assign(u, { k: 'gather', id: tgt.id }, queue); did = 'gather'; }
        else if (u.t === 'fishing_ship' && tgt.t === 'fish') { this.assign(u, { k: 'gather', id: tgt.id }, queue); did = 'gather'; }
        else moveTo(u);
        continue;
      }
      if (tgt.k === 'b') {
        if (this.allied(tgt.o, o)) {
          if (vil && !tgt.done) { this.assign(u, { k: 'build', id: tgt.id }, queue); did = 'build'; continue; }
          if (vil && tgt.t === 'farm' && tgt.o === o) { this.assign(u, { k: 'gather', id: tgt.id }, queue); did = 'gather'; continue; }
          if (u.relic && tgt.t === 'monastery') { this.assign(u, { k: 'garrison', id: tgt.id }, queue); did = 'garrison'; continue; }
          const bs = buildingStats(this.players[tgt.o], tgt.t);
          if (vil && tgt.hp < bs.hp && tgt.o === o) { this.assign(u, { k: 'repair', id: tgt.id }, queue); did = 'repair'; continue; }
          if (vil && u.ca > 0 && buildingDef(tgt.t).drop?.includes(u.ct!)) {
            this.assign(u, { k: 'gather', id: u.last ?? 0 }, queue);
            u.sub = 1;
            did = 'drop';
            continue;
          }
          if (this.canGarrison(u, tgt)) { this.assign(u, { k: 'garrison', id: tgt.id }, queue); did = 'garrison'; continue; }
          moveTo(u);
          continue;
        }
        if (st.atk > 0 || vil) { this.assign(u, { k: 'attack', id: tgt.id }, queue); did = 'attack'; }
        else moveTo(u);
        continue;
      }
      // unit target
      const tu = tgt as Unit;
      if (tu.id === u.id) continue;
      if (vil && this.isAnimal(tu) && tu.t !== 'wolf') { this.assign(u, { k: 'gather', id: tu.id }, queue); did = 'gather'; continue; }
      if (tu.t === 'sheep' && tu.o === o) { moveTo(u); continue; }
      if (this.allied(tu.o, o) && !this.isAnimal(tu)) {
        if (u.t === 'monk') {
          const ts = unitStats(this.players[tu.o], tu.t);
          if (tu.hp < ts.hp) { this.assign(u, { k: 'heal', id: tu.id }, queue); did = 'heal'; continue; }
        }
        if (tu.cargo !== undefined && !d.naval && tu.o === o) { this.assign(u, { k: 'garrison', id: tu.id }, queue); did = 'garrison'; continue; }
        this.assign(u, { k: 'follow', id: tu.id }, queue);
        continue;
      }
      if (u.t === 'monk') { this.assign(u, { k: 'convert', id: tu.id }, queue); did = 'convert'; continue; }
      if (st.atk > 0) { this.assign(u, { k: 'attack', id: tu.id }, queue); did = 'attack'; }
      else moveTo(u);
    }
    if (did === 'attack' && !queue && (tgt.k === 'u' || tgt.k === 'b') && this.enemy(o, tgt.o) && !(tgt.k === 'u' && this.isAnimal(tgt))) {
      this.assist(o, us.filter((u) => u.task?.k === 'attack' && u.task.id === tgt.id), tgt);
    }
    return did;
  }

  cmdAttack(o: number, ids: number[], targetId: number) {
    for (const u of this.ownUnits(o, ids)) {
      if (unitStats(this.players[o], u.t).atk > 0 || unitDef(u.t).cls.includes('villager')) this.assign(u, { k: 'attack', id: targetId }, false);
    }
  }

  cmdAttackGround(o: number, ids: number[], x: number, y: number) {
    for (const u of this.ownUnits(o, ids)) {
      const d = unitDef(u.t);
      if (d.proj === 'stone' || d.proj === 'cannon') this.assign(u, { k: 'attackGround', x, y }, false);
    }
  }

  cmdAutoVillagers(o: number, bid: number, on: boolean) {
    const b = this.buildings.get(bid);
    if (b && b.o === o && b.t === 'town_center') b.autoVil = on;
  }

  cmdStop(o: number, ids: number[]) {
    for (const u of this.ownUnits(o, ids)) { u.q = []; this.endTask(u); u.hx = u.x; u.hy = u.y; }
  }

  cmdStance(o: number, ids: number[], s: 0 | 1 | 2 | 3) {
    for (const u of this.ownUnits(o, ids)) { u.stance = s; u.hx = u.x; u.hy = u.y; }
  }

  cmdDelete(o: number, ids: number[]) {
    for (const id of ids) {
      const u = this.units.get(id);
      if (u && u.o === o && u.dead === undefined) { this.killUnit(u, 0); continue; }
      const b = this.buildings.get(id);
      if (b && b.o === o) {
        if (!b.done && b.prog === 0) refund(this.players[o], buildingStats(this.players[o], b.t).cost);
        this.destroyBuilding(b, 0);
      }
    }
  }

  cmdGarrison(o: number, ids: number[], bid: number) {
    const b = this.buildings.get(bid);
    const ship = this.units.get(bid);
    for (const u of this.ownUnits(o, ids)) {
      if (b && this.canGarrison(u, b)) this.assign(u, { k: 'garrison', id: bid }, false);
      else if (ship && ship.cargo && !unitDef(u.t).naval) this.assign(u, { k: 'garrison', id: bid }, false);
    }
  }

  cmdUngarrison(o: number, id: number) {
    const b = this.buildings.get(id);
    if (b && b.o === o) { this.ungarrison(b); return; }
    const s = this.units.get(id);
    if (s && s.o === o && s.cargo?.length) this.assign(s, { k: 'unload', x: s.x, y: s.y }, false);
  }

  cmdUnload(o: number, ids: number[], x: number, y: number) {
    for (const u of this.ownUnits(o, ids)) if (u.cargo?.length) this.assign(u, { k: 'unload', x, y }, false);
  }

  cmdTownBell(o: number, ring: boolean) {
    if (ring) {
      for (const u of this.units.values()) {
        if (u.o !== o || u.dead !== undefined || u.inside || u.t !== 'villager') continue;
        let best: Building | null = null, bd = 30;
        for (const b of this.buildings.values()) {
          if (b.o !== o || !this.canGarrison(u, b)) continue;
          const reserved = [...this.units.values()].filter((v) => v.task?.k === 'garrison' && v.task.id === b.id).length;
          const cap = buildingStats(this.players[o], b.t).garrison;
          if (b.gar.length + reserved >= cap) continue;
          const dd = this.distTo(u.x, u.y, b);
          if (dd < bd) { bd = dd; best = b; }
        }
        if (best) { u.bell = u.task?.k === 'garrison' ? null : u.task; u.task = { k: 'garrison', id: best.id }; u.path = null; u.q = []; }
      }
    } else {
      for (const b of this.buildings.values()) {
        if (b.o !== o || !b.gar.length) continue;
        const vils = b.gar.filter((id) => this.units.get(id)?.t === 'villager');
        if (vils.length) this.ungarrison(b, vils);
      }
    }
  }

  cmdBuild(o: number, ids: number[], t: BuildingKey, x: number, y: number, queue = false): Building | null {
    const p = this.players[o];
    if (this.buildBlock(o, t)) return null;
    if (!this.canPlace(o, t, x, y)) return null;
    const cost = buildingStats(p, t).cost;
    if (!canAfford(p, cost)) return null;
    // gate replaces own wall
    const d = buildingDef(t);
    if (d.gate) {
      const occ = this.grid.occ[y * this.grid.size + x];
      const ob = occ ? this.buildings.get(occ) : undefined;
      if (ob) { this.buildings.delete(ob.id); this.occupy(ob, false); }
    }
    pay(p, cost);
    const b = this.addBuilding(t, o, x, y, false);
    const us = this.ownUnits(o, ids).filter((u) => unitDef(u.t).cls.includes('villager'));
    for (const u of us) this.assign(u, { k: 'build', id: b.id }, queue);
    this.grid.regionDirty = true;
    return b;
  }

  cmdBuildWall(o: number, ids: number[], t: BuildingKey, x0: number, y0: number, x1: number, y1: number): number {
    const line = this.wallLine(x0, y0, x1, y1);
    const p = this.players[o];
    const cost = buildingStats(p, t).cost;
    const placed: Building[] = [];
    for (const [x, y] of line) {
      if (!this.canPlace(o, t, x, y) || !canAfford(p, cost)) continue;
      pay(p, cost);
      placed.push(this.addBuilding(t, o, x, y, false));
    }
    if (!placed.length) return 0;
    const us = this.ownUnits(o, ids).filter((u) => unitDef(u.t).cls.includes('villager'));
    for (const u of us) {
      let best = placed[0], bd = Infinity;
      for (const b of placed) { const dd = Math.hypot(b.x - u.x, b.y - u.y); if (dd < bd) { bd = dd; best = b; } }
      this.assign(u, { k: 'build', id: best.id }, false);
    }
    return placed.length;
  }

  cmdTrain(o: number, bid: number, t: UnitKey, count = 1): number {
    const b = this.buildings.get(bid);
    if (!b || b.o !== o || !b.done) return 0;
    const p = this.players[o];
    if (!this.trainable(b).includes(t) || this.trainBlock(b, t)) return 0;
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (b.q.length >= TRAIN_QUEUE_MAX) break;
      if (b.q.some((q) => q.tech && TECH_BY_ID[q.tech].isAge)) break;
      const st = unitStats(p, t);
      if (!canAfford(p, st.cost)) break;
      pay(p, st.cost);
      let time = st.time;
      if (b.t === 'town_center' && p.civ === 'britons') time /= 1.0;
      b.q.push({ u: t, t: 0, total: time });
      n++;
    }
    return n;
  }

  cmdResearch(o: number, bid: number, id: string): boolean {
    const b = this.buildings.get(bid);
    if (!b || b.o !== o || !b.done) return false;
    const p = this.players[o];
    const t = TECH_BY_ID[id];
    if (!t || t.at !== b.t || this.researchedOrQueued(p, id) || this.techBlock(o, id)) return false;
    if (b.q.length >= TRAIN_QUEUE_MAX) return false;
    const cost = techCost(p, id);
    if (!canAfford(p, cost)) return false;
    pay(p, cost);
    b.q.push({ tech: id, t: 0, total: t.time });
    return true;
  }

  cmdCancel(o: number, bid: number, idx: number) {
    const b = this.buildings.get(bid);
    if (!b || b.o !== o) return;
    const q = b.q[idx];
    if (!q) return;
    b.q.splice(idx, 1);
    this.refundQueue(b, q);
  }

  cmdRally(o: number, bid: number, x: number, y: number, id?: number) {
    const b = this.buildings.get(bid);
    if (!b || b.o !== o) return;
    b.rally = { x, y, id };
  }

  cmdMarket(o: number, action: 'buy' | 'sell', r: 'food' | 'wood' | 'stone') {
    const p = this.players[o];
    if (!this.hasBuilding(o, 'market')) return false;
    const fee = 0.3 * eco(p, 'tradeFee');
    const price = this.market[r];
    if (action === 'buy') {
      const cost = Math.round(price * (1 + fee));
      if (p.res.gold < cost) return false;
      p.res.gold -= cost;
      p.res[r] += 100;
      this.market[r] = Math.min(9999, price + 3 + price * 0.03);
    } else {
      if (p.res[r] < 100) return false;
      p.res[r] -= 100;
      p.res.gold += Math.round(price * (1 - fee));
      this.market[r] = Math.max(20, price - 3 - price * 0.03);
    }
    return true;
  }

  marketPrice(o: number, action: 'buy' | 'sell', r: 'food' | 'wood' | 'stone') {
    const fee = 0.3 * eco(this.players[o], 'tradeFee');
    const price = this.market[r];
    return action === 'buy' ? Math.round(price * (1 + fee)) : Math.round(price * (1 - fee));
  }

  // ------------------------------------------------------------------ cheats (the classics)

  cheat(o: number, code: string): string | null {
    const p = this.players[o];
    const c = code.trim().toLowerCase();
    const add = (r: Res, n: number) => { p.res[r] += n; };
    switch (c) {
      case "cheese steak jimmy's": case 'cheese steak jimmys': add('food', 1000); return '+1000 food';
      case 'lumberjack': add('wood', 1000); return '+1000 wood';
      case 'robin hood': add('gold', 1000); return '+1000 gold';
      case 'rock on': add('stone', 1000); return '+1000 stone';
      case 'ninjalui': for (const r of ['food', 'wood', 'gold', 'stone'] as Res[]) add(r, 100000); return '+100000 of everything';
      case 'marco': this.explored.fill(1); return 'Map revealed';
      case 'polo': this.settings.reveal = this.settings.reveal === 'all' ? 'explored' : 'all'; this.explored.fill(1); return this.settings.reveal === 'all' ? 'Fog of war removed' : 'Fog of war restored';
      case 'aegis': if (this.aegis.has(o)) this.aegis.delete(o); else this.aegis.add(o); return this.aegis.has(o) ? 'Aegis: instant build & train' : 'Aegis off';
      case 'i r winner': for (const q of this.players) if (q.id && this.enemy(o, q.id)) this.defeat(q); return 'Victory!';
      case 'wimpywimpywimpy': this.defeat(p); return 'You gave up...';
    }
    return null;
  }

  // ------------------------------------------------------------------ save / load

  save(): SaveData {
    return {
      v: 1,
      settings: this.settings,
      time: this.time,
      nextId: this.nextId,
      market: this.market,
      players: this.players.map((p) => ({ ...p })),
      units: [...this.units.values()].map((u) => ({ ...u, path: null })),
      buildings: [...this.buildings.values()],
      nodes: [...this.nodes.values()],
      relics: [...this.relics.values()],
      explored: rleEncode(this.explored),
      wonderT: [...this.wonderT.entries()],
      relicT: this.relicT, relicHolder: this.relicHolder,
      ai: this.ais.map((a) => a.save()),
    };
  }

  private restore(s: SaveData) {
    this.time = s.time;
    this.nextId = s.nextId;
    this.market = s.market;
    this.players = s.players;
    // map nodes: clear generated occupancy and re-apply saved state
    this.grid.occ.fill(0); this.grid.block.fill(0); this.grid.wblock.fill(0);
    for (const n of s.nodes) {
      this.nodes.set(n.id, n);
      const i = n.y * this.grid.size + n.x;
      this.grid.occ[i] = n.id;
      if (n.t === 'fish') this.grid.wblock[i] = 1; else this.grid.block[i] = 1;
    }
    for (const b of s.buildings) { this.buildings.set(b.id, b); this.occupy(b, true); }
    for (const u of s.units) this.units.set(u.id, u);
    for (const r of s.relics) this.relics.set(r.id, r);
    this.explored = rleDecode(s.explored, this.grid.size * this.grid.size);
    this.wonderT = new Map(s.wonderT);
    this.relicT = s.relicT; this.relicHolder = s.relicHolder;
    this.human = this.players.find((p) => p.human)?.id ?? 1;
  }
}

interface QueueItemLike { u?: UnitKey; tech?: string }

export interface SaveData {
  v: number;
  settings: Settings;
  time: number;
  nextId: number;
  market: Record<'food' | 'wood' | 'stone', number>;
  players: Player[];
  units: Unit[];
  buildings: Building[];
  nodes: ResNode[];
  relics: Relic[];
  explored: number[];
  wonderT: [number, number][];
  relicT: number;
  relicHolder: number;
  ai?: unknown[];
}

function rleEncode(a: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let n = 1;
    while (i + n < a.length && a[i + n] === v && n < 65535) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

function rleDecode(r: number[], n: number): Uint8Array {
  const a = new Uint8Array(n);
  let i = 0;
  for (let k = 0; k < r.length; k += 2) { a.fill(r[k], i, i + r[k + 1]); i += r[k + 1]; }
  return a;
}


export { BUILDINGS, lineClear };
export type { Cost };
