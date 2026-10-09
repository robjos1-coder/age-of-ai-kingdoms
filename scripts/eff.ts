import { Game } from '../src/sim/game';
import type { Settings } from '../src/sim/types';
const settings: Settings = {
  mapType: (process.argv[3] ?? 'arabia') as Settings['mapType'], mapSize: 120, startRes: 'standard', startAge: 1, popCap: 150, victory: 'standard', reveal: 'normal', speed: 1, seed: +(process.argv[4] ?? 42),
  players: [
    { civ: 'britons', human: true, team: 0, diff: 1, color: 1, name: 'H' },
    { civ: 'franks', human: false, team: 0, diff: 2, color: 2, name: 'Hard' },
    { civ: 'mongols', human: false, team: 0, diff: 2, color: 3, name: 'Hard2' },
  ],
};
const g = new Game(settings);
const until = +(process.argv[2] ?? 600);
const acc: Record<string, number> = {};
const tcIdle: Record<number, number> = {};
while (g.time < until) {
  g.tick(); g.events.length = 0;
  for (const u of g.units.values()) {
    if (u.o !== 2 || u.t !== 'villager' || u.dead !== undefined) continue;
    let k = u.inside ? 'inside' : !u.task ? 'notask' : u.task.k + ':' + u.anim + (u.sub ? ':ret' : '');
    if (u.task?.k === 'gather' && u.anim === 'work') k = 'gather:work:' + u.gk;
    acc[k] = (acc[k] ?? 0) + 0.1;
  }
  for (const b of g.buildings.values()) if (b.t === 'town_center' && b.o >= 2 && b.q.length === 0) tcIdle[b.o] = (tcIdle[b.o] ?? 0) + 0.1;
}
const tot = Object.values(acc).reduce((a, b) => a + b, 0);
for (const [k, v] of Object.entries(acc).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(28), (v / tot * 100).toFixed(1) + '%');
console.log('TC idle seconds', tcIdle, 'feudal at', g.players[2].stats.ageT[2], g.players[3].stats.ageT[2]);
