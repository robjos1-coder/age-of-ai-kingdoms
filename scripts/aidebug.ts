import { Game } from '../src/sim/game';
import type { Settings } from '../src/sim/types';
import { buildingStats } from '../src/sim/stats';
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
while (g.time < until) { g.tick(); g.events.length = 0; }
for (const pid of [2, 3]) {
  const p = g.players[pid];
  const ai = g.ais.find((a) => a.id === pid)!;
  console.log(`P${pid} t=${g.time.toFixed(0)} age=${p.age} block=${g.techBlock(pid, 'feudal_age')} aub=${g.ageUpBuildings(pid, 1)} res=${JSON.stringify(Object.fromEntries(Object.entries(p.res).map(([k, v]) => [k, Math.floor(v)])))}`);
  console.log('  gathered', JSON.stringify(Object.fromEntries(Object.entries(p.stats.gathered).map(([k, v]) => [k, Math.floor(v)]))));
  const tc = [...g.buildings.values()].find((b) => b.o === pid && b.t === 'town_center')!;
  console.log('  TC queue', tc.q.map((q) => `${q.u ?? q.tech}:${q.t.toFixed(0)}/${q.total}`).join(' '));
  const [cx, cy] = g.bcenter(tc);
  console.log('  house spot', ai.findSpot('house', cx, cy, 5, 30), 'popCap', p.popCap, 'pop', p.pop, 'house cost', JSON.stringify(buildingStats(p, 'house').cost));
  const tasks: Record<string, number> = {};
  for (const u of g.units.values()) {
    if (u.o !== pid || u.t !== 'villager' || u.dead !== undefined) continue;
    const t = u.task;
    let k = t ? t.k : 'idle';
    if (t?.k === 'gather') { const e = g.get(t.id); k += ':' + (e ? (e.k === 'r' ? e.t : e.k === 'b' ? e.t : e.t + (e.dead !== undefined ? '(dead)' : '')) : 'none') + (u.sub ? '/ret' : '') + (u.anim === 'walk' ? '/walk' : u.anim === 'work' ? '/work' : '/' + u.anim); }
    tasks[k] = (tasks[k] ?? 0) + 1;
  }
  console.log('  tasks', JSON.stringify(tasks));
}
for (const pid of [2, 3]) {
  const un = [...g.buildings.values()].filter((b) => b.o === pid && !b.done);
  console.log(`P${pid} unfinished:`, un.map((b) => `${b.t}@${b.x},${b.y} prog=${b.prog.toFixed(2)} builders=${[...g.units.values()].filter((u) => u.task?.id === b.id).length}`).join(' | '));
  const idleish = [...g.units.values()].filter((u) => u.o === pid && u.t === 'villager' && u.task && u.anim === 'idle');
  for (const u of idleish.slice(0, 4)) console.log('   idle-anim vil', u.id, JSON.stringify(u.task), 'sub', u.sub, 'pos', u.x.toFixed(1), u.y.toFixed(1), 'path', u.path?.length, 'ca', u.ca.toFixed(1), u.ct);
}
