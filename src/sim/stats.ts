// Effective stats for a player: civilization bonuses + researched technologies.

import {
  BUILDINGS, CARRY_BASE, CIVS, FARM_FOOD, TECH_BY_ID, buildingDef, unitDef,
  type BuildingKey, type Cost, type EcoStat, type Mod, type Res, type UnitClass, type UnitKey,
} from '../data/defs';
import type { Player } from './types';

export interface UStats {
  hp: number;
  atk: number;
  armorM: number;
  armorP: number;
  range: number;
  speed: number;
  reload: number;
  los: number;
  bonus: Partial<Record<UnitClass, number>>;
  heal: number;
  cost: Cost;
  time: number;
}

export interface BStats {
  hp: number;
  armorM: number;
  armorP: number;
  atk: number;
  range: number;
  cost: Cost;
  time: number;
  garrison: number;
  los: number;
}

interface Cache {
  key: string;
  units: Map<string, UStats>;
  bldgs: Map<string, BStats>;
  eco: Map<string, number>;
  mods: Mod[];
}

const caches = new Map<Player, Cache>();

function cacheFor(p: Player): Cache {
  const key = p.age + '|' + p.techs.length + '|' + p.civ;
  let c = caches.get(p);
  if (!c || c.key !== key) {
    const mods: Mod[] = [...CIVS[p.civ].mods];
    for (const id of p.techs) {
      const t = TECH_BY_ID[id];
      if (t?.mods) mods.push(...t.mods);
    }
    c = { key, units: new Map(), bldgs: new Map(), eco: new Map(), mods: mods.filter((m) => !m.fromAge || m.fromAge <= p.age) };
    caches.set(p, c);
  }
  return c;
}

export function clearStatCache() {
  caches.clear();
}

function matchUnit(m: Mod, t: UnitKey, cls: UnitClass[]) {
  if (m.b) return false;
  if (m.u && !m.u.includes(t)) return false;
  if (m.c && !m.c.some((c) => cls.includes(c))) return false;
  return !!(m.u || m.c);
}

function scaleCost(c: Cost, mul: number): Cost {
  const out: Cost = {};
  for (const k in c) out[k as Res] = Math.round((c[k as Res] ?? 0) * mul);
  return out;
}

export function unitStats(p: Player, t: UnitKey): UStats {
  const c = cacheFor(p);
  let s = c.units.get(t);
  if (s) return s;
  const d = unitDef(t);
  s = {
    hp: d.hp, atk: d.atk, armorM: d.armor[0], armorP: d.armor[1], range: d.range, speed: d.speed,
    reload: d.reload, los: d.los, bonus: { ...(d.bonus ?? {}) }, heal: d.heal ?? 0, cost: { ...d.cost }, time: d.time,
  };
  let costMul = 1;
  const muls: Mod[] = [];
  for (const m of c.mods) {
    if (!matchUnit(m, t, d.cls)) continue;
    if (m.mul !== undefined) { muls.push(m); continue; }
    const a = m.add ?? 0;
    switch (m.stat) {
      case 'hp': s.hp += a; break;
      case 'atk': s.atk += a; break;
      case 'armorM': s.armorM += a; break;
      case 'armorP': s.armorP += a; break;
      case 'range': if (s.range > 0) s.range += a; break;
      case 'los': s.los += a; break;
      case 'bldgBonus': s.bonus.building = (s.bonus.building ?? 0) + a; break;
      default: break;
    }
  }
  for (const m of muls) {
    const k = m.mul!;
    switch (m.stat) {
      case 'hp': s.hp *= k; break;
      case 'atk': s.atk *= k; break;
      case 'speed': s.speed *= k; break;
      case 'reload': s.reload *= k; break;
      case 'cost': costMul *= k; break;
      case 'time': s.time *= k; break;
      case 'bldgBonus': if (s.bonus.building) s.bonus.building *= k; break;
      case 'heal': s.heal *= k; break;
      default: break;
    }
  }
  s.hp = Math.round(s.hp);
  if (costMul !== 1) s.cost = scaleCost(s.cost, costMul);
  c.units.set(t, s);
  return s;
}

export function buildingStats(p: Player, t: BuildingKey): BStats {
  const c = cacheFor(p);
  let s = c.bldgs.get(t);
  if (s) return s;
  const d = buildingDef(t);
  s = {
    hp: d.hp, armorM: d.armor[0], armorP: d.armor[1], atk: d.atk ?? 0, range: d.range ?? 0,
    cost: { ...d.cost }, time: d.time, garrison: d.garrison ?? 0, los: d.los,
  };
  let costMul = 1;
  for (const m of c.mods) {
    if (!m.b) continue;
    if (m.b !== 'all' && !m.b.includes(t)) continue;
    const a = m.add ?? 0, k = m.mul ?? 1;
    switch (m.stat) {
      case 'bhp': s.hp = (s.hp + a) * k; break;
      case 'barmorM': s.armorM += a; break;
      case 'barmorP': s.armorP += a; break;
      case 'batk': if (s.atk > 0) s.atk = (s.atk + a) * k; break;
      case 'brange': if (s.range > 0) s.range += a; break;
      case 'bcost': costMul *= k; break;
      case 'btime': s.time *= k; break;
      case 'bgarrison': s.garrison = Math.round(s.garrison * k + a); break;
      case 'blos': s.los += a; break;
      default: break;
    }
  }
  s.hp = Math.round(s.hp);
  if (costMul !== 1) s.cost = scaleCost(s.cost, costMul);
  c.bldgs.set(t, s);
  return s;
}

export function eco(p: Player, stat: EcoStat): number {
  const c = cacheFor(p);
  let v = c.eco.get(stat);
  if (v !== undefined) return v;
  let add = 0, mul = 1;
  for (const m of c.mods) {
    if (m.stat !== stat || m.u || m.c || m.b) continue;
    add += m.add ?? 0;
    mul *= m.mul ?? 1;
  }
  if (stat === 'carry') v = (CARRY_BASE + add) * mul;
  else if (stat === 'farmFood') v = (FARM_FOOD + add) * mul;
  else if (stat === 'popCap' || stat === 'tcWork') v = add * mul;
  else v = (1 + add) * mul;
  c.eco.set(stat, v);
  return v;
}

export function techCost(p: Player, id: string): Cost {
  const t = TECH_BY_ID[id];
  const m = eco(p, 'techCost');
  if (m === 1 || t.isAge) return t.cost;
  return scaleCost(t.cost, m);
}

export function canAfford(p: Player, c: Cost) {
  for (const k in c) if ((p.res[k as Res] ?? 0) < (c[k as Res] ?? 0)) return false;
  return true;
}

export function pay(p: Player, c: Cost) {
  for (const k in c) p.res[k as Res] -= c[k as Res] ?? 0;
}

export function refund(p: Player, c: Cost, frac = 1) {
  for (const k in c) p.res[k as Res] += Math.floor((c[k as Res] ?? 0) * frac);
}

export function missing(p: Player, c: Cost): Res[] {
  const out: Res[] = [];
  for (const k in c) if ((p.res[k as Res] ?? 0) < (c[k as Res] ?? 0)) out.push(k as Res);
  return out;
}

export const ALL_BUILDINGS = Object.keys(BUILDINGS) as BuildingKey[];
