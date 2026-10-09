// Computer opponent. Uses the same command API as the human player.

import {
  CIVS, TECH_BY_ID, buildingDef, unitDef,
  type BuildingKey, type Cost, type GatherKind, type Res, type UnitKey,
} from '../data/defs';
import { T_WATER } from './grid';
import type { Game } from './game';
import { buildingStats, canAfford, techCost, unitStats } from './stats';
import type { Building, Player, Unit } from './types';

interface AIState {
  wave: number;
  attacking: boolean;
  launchSize: number;
  targetX: number;
  targetY: number;
  lastAttackT: number;
  belled: boolean;
  defendT: number;
  rebalanceT: number;
  scoutT: number;
  enemy: number;
}

const DIFF = [
  { name: 'Easy', vils: 24, period: 2.4, firstAttack: 1200, armyBase: 10, armyGrow: 2, feudalVils: 14, castleVils: 22, imperialVils: 28, maxProd: 1 },
  { name: 'Moderate', vils: 45, period: 1.6, firstAttack: 840, armyBase: 10, armyGrow: 3, feudalVils: 17, castleVils: 27, imperialVils: 38, maxProd: 2 },
  { name: 'Hard', vils: 65, period: 1.0, firstAttack: 600, armyBase: 9, armyGrow: 4, feudalVils: 19, castleVils: 30, imperialVils: 48, maxProd: 3 },
  { name: 'Hardest', vils: 75, period: 0.8, firstAttack: 540, armyBase: 10, armyGrow: 5, feudalVils: 20, castleVils: 32, imperialVils: 52, maxProd: 4 },
];

const ECO_TECHS: string[][] = [
  [],
  ['loom'],
  ['double_bit_axe', 'horse_collar', 'wheelbarrow', 'gold_mining', 'town_watch'],
  ['bow_saw', 'heavy_plow', 'hand_cart', 'gold_shaft_mining', 'stone_mining'],
  ['two_man_saw', 'crop_rotation'],
];

type Kind = 'food' | 'wood' | 'gold' | 'stone';

export class AIController {
  game: Game;
  id: number;
  timer: number;
  s: AIState;

  constructor(game: Game, id: number) {
    this.game = game;
    this.id = id;
    this.timer = 1 + id * 0.37;
    this.s = { wave: 0, attacking: false, launchSize: 0, targetX: 0, targetY: 0, lastAttackT: 0, belled: false, defendT: 0, rebalanceT: 0, scoutT: 0, enemy: 0 };
  }

  save() { return this.s; }
  load(d: unknown) { if (d) this.s = { ...this.s, ...(d as AIState) }; }

  get p(): Player { return this.game.players[this.id]; }
  get diff() { return DIFF[Math.max(0, Math.min(3, this.p.diff))]; }

  tick(dt: number) {
    if (this.p.defeated) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.diff.period;
    try {
      this.think();
    } catch (e) {
      console.warn('AI error', e);
    }
  }

  // ------------------------------------------------------------------ snapshot

  private units: Unit[] = [];
  private vils: Unit[] = [];
  private army: Unit[] = [];
  private blds: Building[] = [];
  private tc: Building | null = null;
  private reserve: Cost = {};

  private snapshot() {
    const g = this.game;
    this.units = []; this.vils = []; this.army = []; this.blds = [];
    for (const u of g.units.values()) {
      if (u.o !== this.id || u.dead !== undefined) continue;
      if (u.t === 'sheep') continue;
      this.units.push(u);
      const d = unitDef(u.t);
      if (d.cls.includes('villager')) this.vils.push(u);
      else if (u.t !== 'fishing_ship' && u.t !== 'transport_ship' && u.t !== 'monk') this.army.push(u);
    }
    for (const b of g.buildings.values()) if (b.o === this.id) this.blds.push(b);
    this.tc = this.blds.find((b) => b.t === 'town_center' && b.done) ?? null;
  }

  private count(t: BuildingKey, unfinished = true) {
    return this.blds.filter((b) => b.t === t && (unfinished || b.done)).length;
  }

  private queued(t: UnitKey) {
    let n = 0;
    for (const b of this.blds) for (const q of b.q) if (q.u === t) n++;
    return n;
  }

  private afford(c: Cost) {
    const p = this.p;
    for (const k in c) {
      const r = k as Res;
      if (p.res[r] - (this.reserve[r] ?? 0) < (c[r] ?? 0)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ main

  private think() {
    const g = this.game;
    this.snapshot();
    if (!this.units.length && !this.blds.length) return;
    if (!this.tc) {
      // try to rebuild a TC
      if (this.vils.length && canAfford(this.p, buildingStats(this.p, 'town_center').cost) && this.p.age >= 1) {
        const v = this.vils[0];
        const spot = this.findSpot('town_center', v.x, v.y, 2, 20);
        if (spot) g.cmdBuild(this.id, this.vils.slice(0, 5).map((u) => u.id), 'town_center', spot[0], spot[1]);
      }
    }
    this.pickEnemy();
    this.computeReserve();
    this.staffFoundations();
    this.defend();
    this.hunt();
    this.ageUp();
    this.trainVillagers();
    this.assignVillagers();
    this.buildHouses();
    this.buildStructures();
    this.research();
    this.trainMilitary();
    this.navy();
    this.monks();
    this.attack();
  }

  private pickEnemy() {
    const g = this.game;
    const cur = g.players[this.s.enemy];
    if (cur && !cur.defeated && g.enemy(this.id, cur.id)) return;
    const [cx, cy] = this.tc ? g.bcenter(this.tc) : [g.grid.size / 2, g.grid.size / 2];
    let best = 0, bd = Infinity;
    for (const p of g.players) {
      if (!p.id || p.defeated || !g.enemy(this.id, p.id)) continue;
      for (const b of g.buildings.values()) {
        if (b.o !== p.id) continue;
        const d = Math.hypot(b.x - cx, b.y - cy);
        if (d < bd) { bd = d; best = p.id; }
      }
    }
    this.s.enemy = best;
  }

  private computeReserve() {
    this.reserve = {};
    const p = this.p;
    if (p.age >= 4) return;
    const next = ['', 'feudal_age', 'castle_age', 'imperial_age'][p.age];
    const needV = [0, this.diff.feudalVils, this.diff.castleVils, this.diff.imperialVils][p.age];
    if (this.vils.length >= needV - 4 && !this.game.researchedOrQueued(p, next)) {
      this.reserve = { ...techCost(p, next) };
    }
    // castle: save stone
    if (p.age >= 3 && this.p.diff >= 1 && this.count('castle') === 0 && this.vils.length > 25) {
      this.reserve.stone = 650;
    }
  }

  // ------------------------------------------------------------------ hunting: herd sheep home, lure boar

  private lure: { vil: number; boar: number; t: number } | null = null;

  private hunt() {
    const g = this.game;
    if (!this.tc) return;
    const [bx, by] = this.base();
    // scout collects wild sheep; owned sheep walk to the TC
    const scout = this.army.find((u) => u.t === 'scout_cavalry');
    let wild: Unit | null = null, wd = 30;
    for (const u of g.units.values()) {
      if (u.t !== 'sheep' || u.dead !== undefined) continue;
      if (u.o === this.id) {
        const d = Math.hypot(u.x - bx, u.y - by);
        if (d > 6 && !u.task) g.cmdMove(this.id, [u.id], bx + (g.rnd() - 0.5) * 4, by + 3 + g.rnd() * 2);
      } else if (u.o === 0) {
        const d = Math.hypot(u.x - bx, u.y - by);
        if (d < wd) { wd = d; wild = u; }
      }
    }
    if (scout && !this.s.attacking && (!scout.task || scout.task.k === 'move')) {
      if (wild) { if (!scout.task) g.cmdMove(this.id, [scout.id], wild.x, wild.y); }
      else if (!scout.task && g.time < 900) {
        const a = g.rnd() * Math.PI * 2, r = 12 + g.rnd() * 14;
        g.cmdMove(this.id, [scout.id], bx + Math.cos(a) * r, by + Math.sin(a) * r);
      }
    }
    // boar lure (Dark/Feudal age, when enough villagers)
    if (this.p.age > 2 || this.vils.length < 6) return;
    if (this.lure) {
      const v = g.units.get(this.lure.vil);
      const boar = g.units.get(this.lure.boar);
      if (!v || v.dead !== undefined || !boar || boar.dead !== undefined || g.time - this.lure.t > 60) { this.lure = null; return; }
      const d = Math.hypot(boar.x - bx, boar.y - by);
      if (boar.task?.k === 'attack' && boar.task.id === v.id) {
        if (d > 5) { if (v.task?.k !== 'move') g.cmdMove(this.id, [v.id], bx, by); }
        else {
          const hunters = this.vils.filter((u) => Math.hypot(u.x - bx, u.y - by) < 10 && u.id !== v.id).slice(0, 5).map((u) => u.id);
          g.cmdTarget(this.id, [v.id, ...hunters], boar.id);
          this.lure = null;
        }
      } else if (!v.task || v.task.k !== 'attack') g.cmdAttack(this.id, [v.id], boar.id);
      return;
    }
    // any boar carcass or live boar near the TC already? let gatherers handle it
    let best: Unit | null = null, bd = 22;
    for (const u of g.units.values()) {
      if (u.t !== 'boar' || u.dead !== undefined || u.o !== 0) continue;
      const d = Math.hypot(u.x - bx, u.y - by);
      if (d < bd) { bd = d; best = u; }
    }
    if (!best) return;
    const v = this.closestVil(best.x, best.y);
    if (!v) return;
    this.lure = { vil: v.id, boar: best.id, t: g.time };
    g.cmdAttack(this.id, [v.id], best.id);
  }

  // ------------------------------------------------------------------ economy

  private trainVillagers() {
    const g = this.game;
    let target = Math.min(this.diff.vils, Math.floor(g.settings.popCap * 0.6));
    // while saving up for the next age, pause villagers once the click-up count is reached
    const p = this.p;
    if (p.age < 4) {
      const next = ['', 'feudal_age', 'castle_age', 'imperial_age'][p.age];
      const needV = [0, this.diff.feudalVils, this.diff.castleVils, this.diff.imperialVils][p.age];
      if (!g.researchedOrQueued(p, next) && this.vils.length >= needV + 1 && !canAfford(p, techCost(p, next)) && p.age <= 2) target = Math.min(target, this.vils.length);
    }
    let have = this.vils.length + this.queued('villager');
    for (const b of this.blds) {
      if (b.t !== 'town_center' || !b.done) continue;
      if (b.q.length >= 2 || have >= target) continue;
      if (b.q.some((q) => q.tech)) continue;
      if (this.p.res.food >= 50 && g.cmdTrain(this.id, b.id, 'villager', 1)) have++;
    }
  }

  private desired(): Record<Kind, number> {
    const a = this.p.age;
    let d: Record<Kind, number> =
      a === 1 ? (this.vils.length < 8 ? { food: 0.8, wood: 0.2, gold: 0, stone: 0 } : { food: 0.64, wood: 0.36, gold: 0, stone: 0 })
      : a === 2 ? { food: 0.45, wood: 0.35, gold: 0.17, stone: 0.03 }
      : a === 3 ? { food: 0.4, wood: 0.3, gold: 0.22, stone: 0.08 }
      : { food: 0.36, wood: 0.3, gold: 0.28, stone: 0.06 };
    if (a === 1 && this.vils.length > this.diff.feudalVils - 3) d = { food: 0.6, wood: 0.35, gold: 0.05, stone: 0 };
    // adjust toward what we're short on
    const r = this.p.res;
    if (r.wood > 1500) d.wood *= 0.6;
    if (r.food > 2000) d.food *= 0.6;
    if (r.gold > 1500) d.gold *= 0.6;
    if (r.stone > 800) d.stone *= 0.3;
    const sum = d.food + d.wood + d.gold + d.stone;
    return { food: d.food / sum, wood: d.wood / sum, gold: d.gold / sum, stone: d.stone / sum };
  }

  private kindOf(u: Unit): Kind | 'build' | null {
    const t = u.task;
    if (!t) return null;
    if (t.k === 'build' || t.k === 'repair') return 'build';
    if (t.k !== 'gather') return null;
    const e = this.game.get(t.id);
    if (u.sub === 1 && u.ct) return u.ct as Kind;
    if (!e) return u.ct as Kind ?? null;
    if (e.k === 'r') return ({ tree: 'wood', berry: 'food', gold: 'gold', stone: 'stone', fish: 'food' } as const)[e.t];
    return 'food';
  }

  private assignVillagers() {
    const g = this.game;
    const counts: Record<Kind, number> = { food: 0, wood: 0, gold: 0, stone: 0 };
    const idle: Unit[] = [];
    for (const v of this.vils) {
      if (v.inside) continue;
      const k = this.kindOf(v);
      if (k && k !== 'build') counts[k]++;
      else if (!k && !v.task) idle.push(v);
    }
    const total = this.vils.length;
    const want = this.desired();
    const pickKind = (): Kind => {
      let best: Kind = 'food', bd = -Infinity;
      for (const k of ['food', 'wood', 'gold', 'stone'] as Kind[]) {
        const deficit = want[k] * total - counts[k];
        if (deficit > bd) { bd = deficit; best = k; }
      }
      return best;
    };
    for (const v of idle) {
      const k = pickKind();
      if (this.sendTo(v, k)) counts[k]++;
      else if (k !== 'wood' && this.sendTo(v, 'wood')) counts.wood++;
    }
    // occasional rebalance
    this.s.rebalanceT -= this.diff.period;
    if (this.s.rebalanceT <= 0 && total > 8) {
      this.s.rebalanceT = 12;
      let over: Kind | null = null, under: Kind | null = null, mo = 1.5, mu = 1.5;
      for (const k of ['food', 'wood', 'gold', 'stone'] as Kind[]) {
        const diff = counts[k] - want[k] * total;
        if (diff > mo) { mo = diff; over = k; }
        if (-diff > mu) { mu = -diff; under = k; }
      }
      if (over && under) {
        const n = Math.min(3, Math.floor(Math.min(mo, mu)));
        const movers = this.vils.filter((v) => this.kindOf(v) === over && v.ca < 3 && !(over === 'food' && this.game.get(v.task?.id)?.k === 'b')).slice(0, n);
        for (const v of movers) this.sendTo(v, under);
      }
    }
  }

  private base(): [number, number] {
    return this.tc ? this.game.bcenter(this.tc) : this.vils.length ? [this.vils[0].x, this.vils[0].y] : [0, 0];
  }

  /** Send a villager to gather a resource category; builds drop sites / farms as needed. */
  private sendTo(v: Unit, k: Kind): boolean {
    const g = this.game;
    const [bx, by] = this.base();
    if (k === 'food') {
      // sheep / carcasses near base, then berries, then farms
      const near = g.findResource(this.id, 'sheep', bx, by, 14) ?? g.findResource(this.id, 'hunt', bx, by, 14);
      if (near && near.k === 'u' && (near.dead !== undefined || near.t !== 'boar')) {
        const huntersOn = this.vils.filter((u) => u.task?.id === near.id).length;
        if (huntersOn < 6) { g.cmdTarget(this.id, [v.id], near.id); return true; }
      }
      const berry = g.findResource(this.id, 'forage', bx, by, 14);
      if (berry) {
        const on = this.vils.filter((u) => u.task?.k === 'gather' && g.get(u.task.id)?.k === 'r' && (g.get(u.task.id) as { t: string }).t === 'berry').length;
        if (on < 7) {
          if (!this.ensureDrop(berry, 'mill', 4)) { /* building it */ }
          g.cmdTarget(this.id, [v.id], berry.id);
          return true;
        }
      }
      // free farm?
      for (const b of this.blds) {
        if (b.t !== 'farm' || !b.done) continue;
        const f = b.farmer ? g.units.get(b.farmer) : undefined;
        if (f && f.dead === undefined && f.task?.id === b.id) continue;
        if (this.vils.some((u) => u !== v && u.task?.id === b.id)) continue;
        g.cmdTarget(this.id, [v.id], b.id);
        return true;
      }
      // build a farm
      if (canAfford(this.p, buildingStats(this.p, 'farm').cost) && !g.buildBlock(this.id, 'farm')) {
        const anchor = this.farmAnchor();
        const spot = this.findSpot('farm', anchor[0], anchor[1], 2, 12, true);
        if (spot) { g.cmdBuild(this.id, [v.id], 'farm', spot[0], spot[1]); return true; }
      } else if (g.buildBlock(this.id, 'farm') === 'Requires a Mill' && !this.count('mill')) {
        const spot = this.findSpot('mill', bx, by, 4, 10);
        if (spot && canAfford(this.p, buildingStats(this.p, 'mill').cost)) { g.cmdBuild(this.id, [v.id], 'mill', spot[0], spot[1]); return true; }
      }
      // deer far away
      const deer = g.findResource(this.id, 'hunt', bx, by, 13);
      if (deer && deer.k === 'u' && deer.t !== 'boar') { g.cmdTarget(this.id, [v.id], deer.id); return true; }
      return false;
    }
    const gk: GatherKind = k === 'wood' ? 'wood' : k;
    const n = g.findResource(this.id, gk, bx, by, 40);
    if (!n) return false;
    const dropType: BuildingKey = k === 'wood' ? 'lumber_camp' : 'mining_camp';
    this.ensureDrop(n, dropType, k === 'wood' ? 5 : 4);
    g.cmdTarget(this.id, [v.id], n.id);
    return true;
  }

  private farmAnchor(): [number, number] {
    const g = this.game;
    // alternate between TC and mills
    const anchors: Building[] = this.blds.filter((b) => b.done && (b.t === 'town_center' || b.t === 'mill'));
    let best = anchors[0], bestFarms = Infinity;
    for (const a of anchors) {
      const [cx, cy] = g.bcenter(a);
      const farms = this.blds.filter((b) => b.t === 'farm' && Math.hypot(b.x + 1.5 - cx, b.y + 1.5 - cy) < 7).length;
      if (farms < bestFarms && farms < 8) { bestFarms = farms; best = a; }
    }
    return best ? g.bcenter(best) : this.base();
  }

  /** Make sure a drop-off of the right type is within `maxD` of a resource. */
  private ensureDrop(n: { x: number; y: number; k: string }, type: BuildingKey, maxD: number): boolean {
    const g = this.game;
    const res: Res = type === 'lumber_camp' ? 'wood' : type === 'mill' ? 'food' : (n as { t?: string }).t === 'stone' ? 'stone' : 'gold';
    const drop = g.dropSiteFor(this.id, res, n.x + 0.5, n.y + 0.5, false);
    if (drop && g.distTo(n.x + 0.5, n.y + 0.5, drop) <= maxD) return true;
    // already building one nearby?
    for (const b of this.blds) {
      if (b.t === type && !b.done && Math.hypot(b.x - n.x, b.y - n.y) < maxD + 3) return false;
    }
    const cost = buildingStats(this.p, type).cost;
    if (!this.afford(cost) && !(canAfford(this.p, cost) && this.p.age === 1)) return false;
    if (g.buildBlock(this.id, type)) return false;
    const spot = this.findSpot(type, n.x + 0.5, n.y + 0.5, 1, 5, false, true);
    if (!spot) return false;
    const builder = this.closestVil(n.x, n.y);
    if (!builder) return false;
    g.cmdBuild(this.id, [builder.id], type, spot[0], spot[1]);
    // builder will gather afterward automatically
    return false;
  }

  private closestVil(x: number, y: number, exclude?: Set<number>): Unit | null {
    let best: Unit | null = null, bd = Infinity;
    for (const v of this.vils) {
      if (v.inside || exclude?.has(v.id)) continue;
      if (v.task?.k === 'build') continue;
      const d = Math.hypot(v.x - x, v.y - y) + (v.ca > 5 ? 3 : 0);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // ------------------------------------------------------------------ construction

  private abandoned = new Map<number, number>();

  /** Make sure every foundation has someone building it; cancel ones nobody can reach. */
  private staffFoundations() {
    const g = this.game;
    for (const b of this.blds) {
      if (b.done) { this.abandoned.delete(b.id); continue; }
      const builders = this.vils.filter((v) => (v.task?.k === 'build' || v.task?.k === 'repair') && v.task.id === b.id).length;
      if (builders > 0) { if (b.prog > 0) this.abandoned.delete(b.id); continue; }
      if (b.t === 'farm' && b.farmer) {
        const f = g.units.get(b.farmer);
        if (f && f.dead === undefined && f.task?.id === b.id) continue;
      }
      const since = this.abandoned.get(b.id);
      if (since === undefined) this.abandoned.set(b.id, g.time);
      else if (g.time - since > 90 && b.prog === 0) { g.cmdDelete(this.id, [b.id]); this.abandoned.delete(b.id); continue; }
      const want = buildingDef(b.t).size >= 3 ? 2 : 1;
      const ex = new Set<number>();
      for (let i = 0; i < want; i++) {
        const v = this.closestVil(b.x, b.y, ex);
        if (!v) break;
        ex.add(v.id);
        g.cmdTarget(this.id, [v.id], b.id);
      }
    }
  }

  private building(t: BuildingKey) {
    return this.blds.some((b) => b.t === t && !b.done);
  }

  private tryBuild(t: BuildingKey, nBuilders = 1, near?: [number, number], rMin = 6, rMax = 18): boolean {
    const g = this.game;
    if (g.buildBlock(this.id, t)) return false;
    const cost = buildingStats(this.p, t).cost;
    if (!this.afford(cost)) return false;
    const [bx, by] = near ?? this.base();
    const spot = this.findSpot(t, bx, by, rMin, rMax);
    if (!spot) return false;
    const ex = new Set<number>();
    const ids: number[] = [];
    for (let i = 0; i < nBuilders; i++) {
      const v = this.closestVil(spot[0], spot[1], ex);
      if (!v) break;
      ex.add(v.id);
      ids.push(v.id);
    }
    if (!ids.length) return false;
    return !!g.cmdBuild(this.id, ids, t, spot[0], spot[1]);
  }

  private buildHouses() {
    const p = this.p;
    if (p.popCap >= this.game.settings.popCap) return;
    const head = p.popCap - p.pop;
    const producing = this.blds.filter((b) => b.q.length && b.done).length;
    const building = this.blds.filter((b) => b.t === 'house' && !b.done).length;
    const need = head <= 3 + producing * 1.5;
    if (need && building < (p.age >= 3 ? 3 : p.age >= 2 ? 2 : 1)) this.tryBuild('house', 1, undefined, 5, 30);
  }

  private buildStructures() {
    const p = this.p;
    const nv = this.vils.length;
    const d = this.diff;
    const fav = CIVS[p.civ].favour;
    const wantRange = fav.some((u) => unitDef(u).at === 'archery_range' || ['archer', 'skirmisher', 'longbowman', 'chu_ko_nu', 'cavalry_archer', 'mangudai'].includes(u));
    const wantStable = fav.some((u) => ['knight', 'scout_cavalry', 'camel_rider', 'cataphract', 'war_elephant', 'mameluke'].includes(u));
    // Dark age
    if (nv >= 7 && !this.count('lumber_camp') && !this.building('lumber_camp')) this.forceCamp('wood');
    if (nv >= 10 && !this.count('mill')) this.tryBuild('mill', 1, undefined, 4, 12);
    if (nv >= 12 && !this.count('barracks')) this.tryBuild('barracks', 2, undefined, 7, 16);
    if (p.age === 1 && nv >= d.feudalVils - 4 && this.game.ageUpBuildings(this.id, 1) < 2 && !this.building('mining_camp') && !this.count('mining_camp')) this.forceCamp('gold');
    if (p.age >= 2) {
      if (!this.count('mining_camp')) this.forceCamp('gold');
      if (!this.count('blacksmith')) this.tryBuild('blacksmith', 1);
      if (wantRange && this.count('archery_range') < 1) this.tryBuild('archery_range', 2);
      if (wantStable && this.count('stable') < 1) this.tryBuild('stable', 2);
      if (!wantRange && !wantStable && this.count('archery_range') < 1) this.tryBuild('archery_range', 2);
      if (this.p.diff >= 1 && !this.count('market') && nv > 22) this.tryBuild('market', 1);
      if (this.p.diff >= 2 && this.count('watch_tower') < 1 && p.res.stone > 200) this.tryBuild('watch_tower', 1, undefined, 4, 9);
      this.dock();
    }
    if (p.age >= 3) {
      if (!this.count('university')) this.tryBuild('university', 1);
      if (!this.count('siege_workshop') && nv > 26) this.tryBuild('siege_workshop', 1);
      if (!this.count('monastery') && this.game.relics.size && nv > 25) this.tryBuild('monastery', 1);
      if (this.count('castle') < (this.p.diff >= 2 ? 2 : 1) && p.res.stone >= 650 && p.diff >= 1) {
        this.reserve.stone = 0;
        this.tryBuild('castle', 4, undefined, 8, 18);
      }
      if (this.p.diff >= 2 && this.count('town_center') < 3 && nv > 30 && p.res.wood > 400) this.tryBuild('town_center', 3, undefined, 12, 22);
      const prodMax = Math.min(d.maxProd, 1 + Math.floor(nv / 18));
      const main: BuildingKey = wantStable ? 'stable' : wantRange ? 'archery_range' : 'barracks';
      if (this.count(main) < prodMax && p.res.wood > 300) this.tryBuild(main, 2);
      if (this.count('barracks') < Math.max(1, prodMax - 1) && p.res.wood > 400) this.tryBuild('barracks', 2);
    }
    if (p.age >= 4) {
      const all: BuildingKey[] = ['barracks', 'archery_range', 'stable', 'siege_workshop'];
      for (const t of all) if (this.count(t) < d.maxProd && p.res.wood > 600) { this.tryBuild(t, 2); break; }
    }
  }

  private forceCamp(k: 'wood' | 'gold' | 'stone') {
    const g = this.game;
    const [bx, by] = this.base();
    const n = g.findResource(this.id, k, bx, by, 30);
    if (!n || n.k !== 'r') return;
    const type: BuildingKey = k === 'wood' ? 'lumber_camp' : 'mining_camp';
    const cost = buildingStats(this.p, type).cost;
    if (!canAfford(this.p, cost)) return;
    const spot = this.findSpot(type, n.x + 0.5, n.y + 0.5, 1, 5, false, true);
    if (!spot) return;
    const v = this.closestVil(n.x, n.y);
    if (!v) return;
    g.cmdBuild(this.id, [v.id], type, spot[0], spot[1]);
    // send a couple more to that resource after
    if (k !== 'wood') v.q.push({ k: 'gather', id: n.id });
  }

  private dock() {
    const g = this.game;
    if (this.count('dock') || this.p.age < 2 || !this.tc) return;
    // is there water near the base?
    const [bx, by] = this.base();
    const spot = this.findSpot('dock', bx, by, 4, 24, false, true);
    if (!spot) return;
    let fish = 0;
    for (const n of g.nodes.values()) if (n.t === 'fish' && Math.hypot(n.x - spot[0], n.y - spot[1]) < 20) fish++;
    if (fish < 3) return;
    const cost = buildingStats(this.p, 'dock').cost;
    if (!this.afford(cost)) return;
    const v = this.closestVil(spot[0], spot[1]);
    if (v) g.cmdBuild(this.id, [v.id], 'dock', spot[0], spot[1]);
  }

  /** Spiral search for a valid building spot around (cx, cy). */
  findSpot(t: BuildingKey, cx: number, cy: number, rMin: number, rMax: number, farm = false, nearRes = false): [number, number] | null {
    const g = this.game;
    const d = buildingDef(t);
    const s = d.size;
    const S = g.grid.size;
    const tc = this.tc;
    const rnd = g.rnd;
    for (let r = rMin; r <= rMax; r++) {
      const cands: [number, number][] = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        cands.push([Math.round(cx + dx - s / 2), Math.round(cy + dy - s / 2)]);
      }
      for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
      for (const [x, y] of cands) {
        if (!g.canPlace(this.id, t, x, y, false)) continue;
        if (d.water) return [x, y];
        // keep a free ring around non-farm buildings so nothing gets trapped
        let ok = true;
        for (let yy = y - 1; yy <= y + s && ok; yy++) for (let xx = x - 1; xx <= x + s && ok; xx++) {
          if (xx < 0 || yy < 0 || xx >= S || yy >= S) { ok = false; break; }
          if (xx >= x && xx < x + s && yy >= y && yy < y + s) continue;
          const i = yy * S + xx;
          if (g.grid.terrain[i] === T_WATER && !farm) continue;
          const occ = g.grid.occ[i];
          if (!occ) continue;
          const ob = g.buildings.get(occ);
          if (ob) {
            if (farm && (ob.t === 'farm' || ob.t === 'town_center' || ob.t === 'mill')) continue;
            ok = false;
          } else if (!nearRes && !farm) {
            ok = false;
          }
        }
        if (!ok) continue;
        // keep the area around the TC for farms
        if (tc && !farm && t !== 'house' && !nearRes) {
          const [tx, ty] = g.bcenter(tc);
          if (Math.hypot(x + s / 2 - tx, y + s / 2 - ty) < 6) continue;
        }
        return [x, y];
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ ages & research

  private ageUp() {
    const g = this.game;
    const p = this.p;
    if (p.age >= 4 || !this.tc) return;
    const next = ['', 'feudal_age', 'castle_age', 'imperial_age'][p.age];
    const needV = [0, this.diff.feudalVils, this.diff.castleVils, this.diff.imperialVils][p.age];
    if (this.vils.length < needV) return;
    if (p.diff === 0 && g.time < [0, 720, 1500, 2400][p.age]) return;
    if (g.researchedOrQueued(p, next)) return;
    if (g.techBlock(this.id, next)) {
      // build what's needed for the requirement
      if (p.age === 1) {
        if (!this.count('mill')) this.tryBuild('mill', 1, undefined, 4, 12);
        if (!this.count('barracks')) this.tryBuild('barracks', 2);
        if (!this.count('lumber_camp')) this.forceCamp('wood');
      } else if (p.age === 2) {
        if (!this.count('blacksmith')) this.tryBuild('blacksmith', 1);
        if (!this.count('archery_range')) this.tryBuild('archery_range', 1);
        if (!this.count('market')) this.tryBuild('market', 1);
      } else if (p.age === 3) {
        if (!this.count('university')) this.tryBuild('university', 1);
        if (!this.count('monastery')) this.tryBuild('monastery', 1);
        if (!this.count('siege_workshop')) this.tryBuild('siege_workshop', 1);
      }
      return;
    }
    if (canAfford(p, techCost(p, next))) {
      const tc = this.blds.find((b) => b.t === 'town_center' && b.done);
      if (!tc) return;
      // drop queued (not yet started) villagers so the age research starts right away
      for (let i = tc.q.length - 1; i >= 1; i--) if (tc.q[i].u) g.cmdCancel(this.id, tc.id, i);
      g.cmdResearch(this.id, tc.id, next);
    }
  }

  private research() {
    const g = this.game;
    const p = this.p;
    const list: string[] = [];
    for (let a = 1; a <= p.age; a++) list.push(...ECO_TECHS[a]);
    if (this.army.length > 4 || p.age >= 3) {
      const types = new Set(this.army.map((u) => u.t));
      const has = (c: string) => [...types].some((t) => unitDef(t).cls.includes(c as never));
      if (has('infantry') || has('cavalry') || has('camel')) list.push('forging', 'iron_casting', 'blast_furnace');
      if (has('infantry')) list.push('scale_mail', 'chain_mail', 'man_at_arms_up', 'long_swordsman_up', 'pikeman_up', 'squires', 'two_handed_up', 'halberdier_up');
      if (has('cavalry') || has('camel')) list.push('scale_barding', 'bloodlines', 'chain_barding', 'husbandry', 'cavalier_up', 'light_cavalry_up', 'heavy_camel_up', 'plate_barding', 'paladin_up', 'hussar_up');
      if (has('archer')) list.push('fletching', 'padded_archer_armor', 'bodkin_arrow', 'crossbowman_up', 'elite_skirmisher_up', 'thumb_ring', 'leather_archer_armor', 'bracer', 'arbalester_up', 'heavy_ca_up', 'ring_archer_armor');
      if (has('siege')) list.push('capped_ram_up', 'onager_up', 'siege_engineers');
      if (p.age >= 3) list.push('ballistics', 'masonry', 'conscription', 'chemistry');
      if (p.age >= 3 && this.count('castle')) {
        const ut = Object.values(TECH_BY_ID).find((t) => t.civ === p.civ);
        if (ut) list.push(ut.id);
        list.push('elite_unique');
      }
    }
    if (p.age === 1 && this.vils.length < 15) return;
    let started = 0;
    for (const id of list) {
      if (started >= (p.diff >= 2 ? 2 : 1)) break;
      const t = TECH_BY_ID[id];
      if (!t || g.researchedOrQueued(p, id) || g.techBlock(this.id, id)) continue;
      if (t.civ && t.civ !== p.civ) continue;
      const cost = techCost(p, id);
      if (!this.afford(cost)) continue;
      const b = this.blds.find((bb) => bb.t === t.at && bb.done && bb.q.length === 0);
      if (!b) continue;
      if (id === 'loom' && this.vils.length < 18 && g.time < 600) continue;
      if (g.cmdResearch(this.id, b.id, id)) started++;
    }
  }

  // ------------------------------------------------------------------ military

  private enemyComp() {
    const g = this.game;
    const c = { archer: 0, cavalry: 0, infantry: 0, siege: 0, total: 0, ship: 0 };
    for (const u of g.units.values()) {
      if (u.dead !== undefined || !g.enemy(this.id, u.o)) continue;
      const d = unitDef(u.t);
      if (d.cls.includes('villager') || d.cls.includes('animal')) continue;
      c.total++;
      if (d.cls.includes('ship')) c.ship++;
      else if (d.cls.includes('siege')) c.siege++;
      else if (d.cls.includes('archer')) c.archer++;
      else if (d.cls.includes('cavalry') || d.cls.includes('camel')) c.cavalry++;
      else c.infantry++;
    }
    return c;
  }

  private trainMilitary() {
    const g = this.game;
    const p = this.p;
    if (p.age === 1 && this.vils.length < 14) return;
    const comp = this.enemyComp();
    const fav = new Set(CIVS[p.civ].favour);
    const unique = CIVS[p.civ].unique;
    const sieges = this.army.filter((u) => unitDef(u.t).cls.includes('siege')).length + this.queued('battering_ram') + this.queued('capped_ram') + this.queued('mangonel') + this.queued('onager') + this.queued('trebuchet');
    for (const b of this.blds) {
      if (!b.done || b.q.length >= 2) continue;
      const d = buildingDef(b.t);
      if (!d.trains.length || b.t === 'town_center' || b.t === 'dock' || b.t === 'monastery') continue;
      const opts = g.trainable(b).filter((t) => !g.trainBlock(b, t));
      if (!opts.length) continue;
      let best: UnitKey | null = null, bs = -Infinity;
      for (const t of opts) {
        const ud = unitDef(t);
        const st = unitStats(p, t);
        let score = g.rnd() * 1.5;
        const base = ud.line ? (Object.entries({}).length, t) : t;
        if (fav.has(t) || [...fav].some((f) => unitDef(f).line && unitDef(f).line === ud.line)) score += 3;
        if (t === unique) score += 4;
        if (ud.cls.includes('spear')) score += comp.cavalry * 0.4 - 1;
        if (ud.cls.includes('skirm')) score += comp.archer * 0.4 - 1.5;
        if (ud.cls.includes('camel')) score += comp.cavalry * 0.3;
        if (ud.cls.includes('archer') && !ud.cls.includes('skirm')) score += comp.infantry * 0.25;
        if (t === 'scout_cavalry' || t === 'light_cavalry' || t === 'hussar') score += comp.siege * 0.6 + (p.age === 2 ? 0.5 : -1.5);
        if (t === 'knight' || t === 'cavalier' || t === 'paladin') score += comp.archer * 0.3 + 1;
        if (t === 'militia') score -= 2;
        if (ud.cls.includes('gunpowder') && !ud.cls.includes('siege')) score += comp.infantry * 0.2 - 0.5;
        if (ud.cls.includes('siege')) {
          const cap = p.age >= 4 ? 5 : 3;
          if (sieges >= cap) score -= 20;
          if (ud.cls.includes('ram')) score += 2;
          if (t === 'mangonel' || t === 'onager') score += comp.archer * 0.15 + comp.infantry * 0.1;
          if (t === 'scorpion' || t === 'heavy_scorpion') score -= 2;
          if (t === 'bombard_cannon') score -= 1;
          if (t === 'trebuchet') score += 1;
        }
        void base;
        if (!this.afford(st.cost)) score -= 10;
        if (score > bs) { bs = score; best = t; }
      }
      if (best && this.afford(unitStats(p, best).cost)) {
        g.cmdTrain(this.id, b.id, best, 1);
        if (!b.rally) {
          const gp = this.gatherPoint();
          g.cmdRally(this.id, b.id, gp[0], gp[1]);
        }
      }
    }
  }

  private gatherPoint(): [number, number] {
    const g = this.game;
    const [bx, by] = this.base();
    const e = this.enemyBase();
    if (!e) return [bx + 6, by + 6];
    const dx = e[0] - bx, dy = e[1] - by;
    const L = Math.hypot(dx, dy) || 1;
    let x = bx + (dx / L) * 9, y = by + (dy / L) * 9;
    if (!g.grid.passable(x, y, false)) {
      x = bx + (dx / L) * 6; y = by + (dy / L) * 6;
    }
    return [x, y];
  }

  private enemyBase(): [number, number] | null {
    const g = this.game;
    if (!this.s.enemy) return null;
    const [bx, by] = this.base();
    let best: Building | null = null, bd = Infinity;
    for (const b of g.buildings.values()) {
      if (b.o !== this.s.enemy) continue;
      const d = buildingDef(b.t);
      if (d.wall || d.gate) continue;
      const dd = Math.hypot(b.x - bx, b.y - by) + (b.t === 'town_center' ? -6 : 0);
      if (dd < bd) { bd = dd; best = b; }
    }
    return best ? g.bcenter(best) : null;
  }

  private navy() {
    const g = this.game;
    const docks = this.blds.filter((b) => b.t === 'dock' && b.done);
    if (!docks.length) return;
    const fishers = this.units.filter((u) => u.t === 'fishing_ship');
    const target = this.p.diff >= 2 ? 8 : 5;
    for (const d of docks) {
      if (d.q.length >= 1) continue;
      if (fishers.length + this.queued('fishing_ship') < target && this.afford({ wood: 75 })) g.cmdTrain(this.id, d.id, 'fishing_ship', 1);
      else {
        const comp = this.enemyComp();
        const war = this.units.filter((u) => unitDef(u.t).naval && unitDef(u.t).atk > 0).length;
        if (comp.ship > war && this.p.age >= 2) {
          const t = g.trainable(d).find((x) => unitDef(x).line === 'galley');
          if (t && !g.trainBlock(d, t) && this.afford(unitStats(this.p, t).cost)) g.cmdTrain(this.id, d.id, t, 1);
        }
      }
    }
    for (const f of fishers) {
      if (f.task) continue;
      const n = g.findResource(this.id, 'fish', f.x, f.y, 30);
      if (n) g.cmdTarget(this.id, [f.id], n.id);
    }
    // warships hunt enemy ships
    for (const u of this.units) {
      const d = unitDef(u.t);
      if (!d.naval || d.atk <= 0 || u.task) continue;
      let best: Unit | null = null, bd = 60;
      for (const e of g.units.values()) {
        if (e.dead !== undefined || !g.enemy(this.id, e.o) || !unitDef(e.t).naval) continue;
        const dd = Math.hypot(e.x - u.x, e.y - u.y);
        if (dd < bd) { bd = dd; best = e; }
      }
      if (best) g.cmdTarget(this.id, [u.id], best.id);
    }
  }

  private monks() {
    const g = this.game;
    const mon = this.blds.find((b) => b.t === 'monastery' && b.done);
    if (!mon) return;
    const monks = this.units.filter((u) => u.t === 'monk');
    const free = [...g.relics.values()].filter((r) => !r.carrier && !r.mon);
    const want = Math.min(4, free.length + 2);
    if (monks.length + this.queued('monk') < want && mon.q.length < 1 && this.afford({ gold: 100 })) g.cmdTrain(this.id, mon.id, 'monk', 1);
    for (const m of monks) {
      if (m.task || m.relic) continue;
      let best = free[0], bd = Infinity;
      for (const r of free) {
        const d = Math.hypot(r.x - m.x, r.y - m.y);
        if (d < bd && !monks.some((o) => o.task?.k === 'relic' && o.task.id === r.id)) { bd = d; best = r; }
      }
      if (best && bd < Infinity) g.cmdTarget(this.id, [m.id], best.id);
      else if (this.s.attacking && this.army.length) g.cmdTarget(this.id, [m.id], this.army[0].id);
    }
  }

  private defend() {
    const g = this.game;
    if (!this.blds.length) return;
    // enemies near our buildings
    let threat: Unit | null = null, threatN = 0;
    const [bx, by] = this.base();
    for (const u of g.units.values()) {
      if (u.dead !== undefined || u.inside || !g.enemy(this.id, u.o)) continue;
      const d = unitDef(u.t);
      if (d.cls.includes('animal')) continue;
      const near = this.blds.some((b) => Math.abs(b.x - u.x) < 12 && Math.abs(b.y - u.y) < 12);
      if (!near) continue;
      threatN++;
      if (!threat || Math.hypot(u.x - bx, u.y - by) < Math.hypot(threat.x - bx, threat.y - by)) threat = u;
    }
    if (threat) {
      this.s.defendT = g.time;
      const defenders = this.army.filter((u) => {
        if (this.s.attacking && Math.hypot(u.x - bx, u.y - by) > 30) return false;
        return !u.task || u.task.k === 'move' || u.task.k === 'patrol';
      });
      if (defenders.length) g.cmdMove(this.id, defenders.map((u) => u.id), threat.x, threat.y, { am: true });
      // town bell when overwhelmed near the TC
      const tcNear = Math.hypot(threat.x - bx, threat.y - by) < 14;
      if (tcNear && threatN >= 5 && threatN > this.army.length * 0.8 && !this.s.belled) {
        g.cmdTownBell(this.id, true);
        this.s.belled = true;
      }
      // villagers fight lone raiders
      if (threatN <= 2 && unitDef(threat.t).cls.includes('cavalry') === false && unitDef(threat.t).cls.includes('archer') === false) {
        const near = this.vils.filter((v) => Math.hypot(v.x - threat!.x, v.y - threat!.y) < 5).slice(0, 4);
        if (near.length >= 3) g.cmdAttack(this.id, near.map((v) => v.id), threat.id);
      }
    } else if (this.s.belled && g.time - this.s.defendT > 8) {
      g.cmdTownBell(this.id, false);
      this.s.belled = false;
    }
  }

  private attack() {
    const g = this.game;
    const d = this.diff;
    const military = this.army.filter((u) => !unitDef(u.t).naval);
    if (this.s.attacking) {
      const alive = military.filter((u) => u.task && (u.task.k === 'attack' || (u.task.k === 'move' && u.task.am)) || Math.hypot(u.x - this.s.targetX, u.y - this.s.targetY) < 25);
      if (military.length < Math.max(3, this.s.launchSize * 0.3)) {
        // retreat
        this.s.attacking = false;
        this.s.lastAttackT = g.time;
        const gp = this.gatherPoint();
        g.cmdMove(this.id, military.map((u) => u.id), gp[0], gp[1]);
        return;
      }
      // keep idle attackers moving to the next target
      const idle = military.filter((u) => !u.task);
      if (idle.length) {
        const tgt = this.enemyBase();
        if (!tgt) { this.s.attacking = false; return; }
        this.s.targetX = tgt[0]; this.s.targetY = tgt[1];
        g.cmdMove(this.id, idle.map((u) => u.id), tgt[0], tgt[1], { am: true });
        // siege go for buildings
        for (const u of idle) {
          if (!unitDef(u.t).cls.includes('siege')) continue;
          const b = this.nearestEnemyBuilding(u.x, u.y);
          if (b) g.cmdTarget(this.id, [u.id], b.id);
        }
      }
      void alive;
      return;
    }
    if (g.time < d.firstAttack) return;
    if (g.time - this.s.lastAttackT < 60) return;
    const need = d.armyBase + d.armyGrow * this.s.wave;
    if (military.length < need) return;
    const tgt = this.enemyBase();
    if (!tgt) return;
    this.s.attacking = true;
    this.s.wave++;
    this.s.launchSize = military.length;
    this.s.targetX = tgt[0]; this.s.targetY = tgt[1];
    g.cmdMove(this.id, military.filter((u) => !unitDef(u.t).cls.includes('siege')).map((u) => u.id), tgt[0], tgt[1], { am: true });
    for (const u of military) {
      if (!unitDef(u.t).cls.includes('siege')) continue;
      const b = this.nearestEnemyBuilding(tgt[0], tgt[1]);
      if (b) g.cmdTarget(this.id, [u.id], b.id);
    }
    if (this.s.enemy === g.human && this.s.wave === 1) g.events.push({ k: 'msg', text: `${this.p.name} is marching on your town!` });
  }

  private nearestEnemyBuilding(x: number, y: number): Building | null {
    const g = this.game;
    let best: Building | null = null, bd = Infinity;
    for (const b of g.buildings.values()) {
      if (!g.enemy(this.id, b.o)) continue;
      const d = buildingDef(b.t);
      const dd = Math.hypot(b.x - x, b.y - y) + (d.wall ? 20 : 0) + (b.t === 'farm' ? 15 : 0);
      if (dd < bd) { bd = dd; best = b; }
    }
    return best;
  }
}
