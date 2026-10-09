// Headless AI-vs-AI soak test: node --import tsx scripts/simtest.ts [minutes] [mapType] [seed]
import { Game } from '../src/sim/game';
import type { Settings } from '../src/sim/types';

const minutes = +(process.argv[2] ?? 25);
const mapType = (process.argv[3] ?? 'arabia') as Settings['mapType'];
const seed = +(process.argv[4] ?? 42);
const settings: Settings = {
  mapType, mapSize: 120, startRes: 'standard', startAge: 1, popCap: 150, victory: 'standard', reveal: 'normal', speed: 1, seed,
  players: [
    { civ: 'britons', human: true, team: 0, diff: 1, color: 1, name: 'Idle human' },
    { civ: 'franks', human: false, team: 0, diff: 2, color: 2, name: 'AI Hard' },
    { civ: 'mongols', human: false, team: 0, diff: 1, color: 3, name: 'AI Moderate' },
  ],
};
const t0 = Date.now();
const g = new Game(settings);
// make the human invulnerable-ish so AIs fight each other: give human no units
for (const u of [...g.units.values()]) if (u.o === 1) g.units.delete(u.id);
const report = () => {
  const lines: string[] = [];
  for (const p of g.players) {
    if (!p.id) continue;
    const us = [...g.units.values()].filter((u) => u.o === p.id && u.dead === undefined);
    const vil = us.filter((u) => u.t === 'villager').length;
    const idle = us.filter((u) => u.t === 'villager' && !u.task).length;
    const mil = us.length - vil;
    const bl = [...g.buildings.values()].filter((b) => b.o === p.id);
    const types: Record<string, number> = {};
    for (const b of bl) types[b.t] = (types[b.t] ?? 0) + 1;
    lines.push(`  P${p.id} ${p.name.padEnd(12)} age ${p.age} pop ${p.pop}/${p.popCap} vil ${vil} (idle ${idle}) mil ${mil} res F${Math.floor(p.res.food)} W${Math.floor(p.res.wood)} G${Math.floor(p.res.gold)} S${Math.floor(p.res.stone)} techs ${p.techs.length} ${p.defeated ? 'DEFEATED' : ''}\n     ${Object.entries(types).map(([k, v]) => k + ':' + v).join(' ')}`);
  }
  console.log(`t=${(g.time / 60).toFixed(1)}min\n` + lines.join('\n'));
};
let nextReport = 0;
let ticks = 0;
const tickTimes: number[] = [];
while (g.time < minutes * 60 && !g.over) {
  const a = performance.now();
  g.tick();
  tickTimes.push(performance.now() - a);
  ticks++;
  if (g.time >= nextReport) { report(); nextReport += 300; }
  g.events.length = 0;
}
report();
for (const p of g.players) if (p.id > 1) console.log(`  ${p.name} ageT feudal ${(p.stats.ageT[2] / 60).toFixed(1)} castle ${(p.stats.ageT[3] / 60).toFixed(1)} imp ${(p.stats.ageT[4] / 60).toFixed(1)} kills ${p.stats.kills} losses ${p.stats.losses} razed ${p.stats.razed}`);
tickTimes.sort((a, b) => a - b);
console.log(`ticks ${ticks}, real ${(Date.now() - t0) / 1000}s, tick avg ${(tickTimes.reduce((a, b) => a + b, 0) / ticks).toFixed(2)}ms p99 ${tickTimes[Math.floor(ticks * 0.99)].toFixed(2)}ms max ${tickTimes[ticks - 1].toFixed(1)}ms; over=${g.over} winner=${g.winner}`);
