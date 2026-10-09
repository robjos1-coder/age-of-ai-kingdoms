import { Game } from '../src/sim/game';
import type { Settings } from '../src/sim/types';
const settings: Settings = {
  mapType: (process.argv[2] ?? 'arabia') as Settings['mapType'], mapSize: 120, startRes: 'standard', startAge: 1, popCap: 150, victory: 'standard', reveal: 'normal', speed: 1, seed: +(process.argv[3] ?? 42),
  players: [
    { civ: 'britons', human: true, team: 0, diff: 1, color: 1, name: 'H' },
    { civ: 'franks', human: false, team: 0, diff: 2, color: 2, name: 'Hard' },
    { civ: 'mongols', human: false, team: 0, diff: 2, color: 3, name: 'Hard2' },
  ],
};
const g = new Game(settings);
const marks: Record<string, number> = {};
const mark = (k: string) => { if (marks[k] === undefined) marks[k] = Math.round(g.time); };
let lastLog = 0;
while (g.time < 1100 && !g.players[2].stats.ageT[2]) {
  g.tick(); g.events.length = 0;
  const p = g.players[2];
  const vils = [...g.units.values()].filter((u) => u.o === 2 && u.t === 'villager' && u.dead === undefined).length;
  for (const n of [10, 15, 19]) if (vils >= n) mark('vils' + n);
  if (g.ageUpBuildings(2, 1) >= 2) mark('2bldgs');
  if (p.res.food >= 500) mark('500food');
  for (const t of ['mill', 'lumber_camp', 'barracks', 'mining_camp']) if (g.hasBuilding(2, t as never)) mark(t);
  if (g.researchedOrQueued(p, 'feudal_age')) mark('clicked');
  if (g.time - lastLog >= 60) { lastLog = g.time; console.log(`t=${g.time.toFixed(0)} vils=${vils} pop=${p.pop}/${p.popCap} F${p.res.food | 0} W${p.res.wood | 0} G${p.res.gold | 0} gathered F${p.stats.gathered.food | 0} W${p.stats.gathered.wood | 0}`); }
}
console.log(marks, 'feudal', g.players[2].stats.ageT[2]);
