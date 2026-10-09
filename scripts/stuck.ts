import { Game } from '../src/sim/game';
import type { Settings } from '../src/sim/types';
import { findPath } from '../src/sim/grid';
const settings: Settings = {
  mapType: 'arabia', mapSize: 120, startRes: 'standard', startAge: 1, popCap: 150, victory: 'standard', reveal: 'normal', speed: 1, seed: 42,
  players: [
    { civ: 'britons', human: true, team: 0, diff: 1, color: 1, name: 'H' },
    { civ: 'franks', human: false, team: 0, diff: 2, color: 2, name: 'Hard' },
    { civ: 'mongols', human: false, team: 0, diff: 1, color: 3, name: 'Mod' },
  ],
};
const g = new Game(settings);
for (const u of [...g.units.values()]) if (u.o === 1) g.units.delete(u.id);
const until = +(process.argv[2] ?? 600);
let paths = 0;
const orig = (g as any).requestPath.bind(g);
(g as any).requestPath = (u: any, goal: any) => { paths++; return orig(u, goal); };
let lastT = 0, lastP = 0;
while (g.time < until) { g.tick(); g.events.length = 0; if (g.time - lastT >= 60) { console.log(`t=${g.time.toFixed(0)} paths/min=${paths - lastP}`); lastT = g.time; lastP = paths; } }
const S = g.grid.size;
const stuck = [...g.units.values()].filter((u) => u.t === 'villager' && u.dead === undefined && u.task && u.anim === 'idle' && u.o > 1);
console.log('stuck count', stuck.length, 'idle', [...g.units.values()].filter((u) => u.t === 'villager' && !u.task && u.o > 1).length);
for (const u of stuck.slice(0, 5)) {
  const tx = Math.floor(u.x), ty = Math.floor(u.y);
  console.log('vil', u.id, 'owner', u.o, JSON.stringify(u.task), 'sub', u.sub, 'pos', u.x.toFixed(2), u.y.toFixed(2), 'repath', u.repath.toFixed(1), 'stuck', u.stuck);
  let map = '';
  for (let y = ty - 3; y <= ty + 3; y++) {
    for (let x = tx - 3; x <= tx + 3; x++) {
      const i = y * S + x;
      const occ = g.grid.occ[i];
      const e = occ ? g.get(occ) : undefined;
      const ch = x === tx && y === ty ? '@' : g.grid.terrain[i] === 1 ? '~' : !e ? (g.grid.block[i] ? '#' : '.') : e.k === 'r' ? e.t[0] : e.k === 'b' ? e.t[0].toUpperCase() : '?';
      map += ch;
    }
    map += '\n';
  }
  console.log(map);
  const drop = u.ct ? g.dropSiteFor(u.o, u.ct, u.x, u.y, false) : null;
  if (drop) {
    const s = g.bsize(drop);
    const r = findPath(g.grid, u.x, u.y, { x0: drop.x, y0: drop.y, x1: drop.x + s, y1: drop.y + s, range: 0.8 }, false, g.alliedFn(u.o));
    console.log('  path to drop', drop.t, 'reached', r.reached, 'len', r.pts.length / 2);
  }
}
