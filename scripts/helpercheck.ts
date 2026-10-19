/** Simulation checks for the AoE-style helper behaviours: group assist, defending allies, auto-scout and auto villagers. */
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game';
import type { Settings } from '../src/sim/types';

const settings: Settings = {
  mapType: 'arabia', mapSize: 96, startRes: 'high', startAge: 1, popCap: 150,
  victory: 'standard', reveal: 'normal', speed: 1, seed: 7,
  players: [
    { civ: 'franks', human: true, team: 0, diff: 1, color: 1, name: 'You' },
    { civ: 'britons', human: false, team: 0, diff: 4, color: 2, name: 'Enemy' },
  ],
};
const game = new Game(settings);
game.ais = [];
const me = game.human, foe = me === 1 ? 2 : 1;
const tc = [...game.buildings.values()].find((b) => b.o === me && b.t === 'town_center')!;
const [cx, cy] = game.bcenter(tc);
const ticks = (n: number) => { for (let i = 0; i < n; i++) game.tick(); };

// 1. Ordering one militia to attack pulls in nearby idle militia, but not archers or villagers.
const x0 = cx + 6, y0 = cy + 6;
const a = game.spawnUnit('militia', me, x0, y0);
const b = game.spawnUnit('militia', me, x0 + 1, y0);
const c = game.spawnUnit('militia', me, x0, y0 + 1.5);
const archer = game.spawnUnit('archer', me, x0 + 1, y0 + 1);
const far = game.spawnUnit('militia', me, x0 + 14, y0 + 14);
const enemy = game.spawnUnit('militia', foe, x0 + 9, y0);
ticks(2);
assert.equal(game.cmdTarget(me, [a.id], enemy.id), 'attack');
assert(b.task?.k === 'attack' && b.task.id === enemy.id, 'Nearby idle militia joins the attack');
assert(c.task?.k === 'attack' && c.task.id === enemy.id, 'Every similar idle unit nearby joins');
assert.notEqual(archer.task?.id, enemy.id, 'Different unit kinds are left alone');
assert.equal(far.task, null, 'Units far away are not pulled in');

// 2. Stand Ground units never get pulled in.
game.cmdStop(me, [a.id, b.id, c.id]);
game.cmdStance(me, [c.id], 2);
assert.equal(game.cmdTarget(me, [a.id], enemy.id), 'attack');
assert.notEqual(c.task?.id, enemy.id, 'Stand Ground units hold position');

// 3. A villager hit by an enemy calls nearby idle soldiers of any kind.
for (const u of [a, b, c, archer, enemy]) game.killUnit(u, 0, true);
const vil = [...game.units.values()].find((u) => u.o === me && u.t === 'villager')!;
const guard = game.spawnUnit('archer', me, vil.x + 2, vil.y);
const raider = game.spawnUnit('scout_cavalry', foe, vil.x + 1, vil.y + 1);
ticks(1);
guard.task = null; guard.q = [];
game.damage(foe, 3, false, {}, vil, raider);
assert(guard.task?.k === 'attack' && guard.task.id === raider.id, 'Idle soldiers defend a villager under attack');
game.killUnit(raider, 0, true);

// 4. Auto-scout explores new ground and keeps going.
const scout = [...game.units.values()].find((u) => u.o === me && u.t === 'scout_cavalry' && u.dead === undefined)!;
assert(game.canScout(scout), 'Scout cavalry can auto-scout');
const explored0 = game.explored.reduce((s, v) => s + v, 0);
game.cmdScout(me, [scout.id]);
ticks(60 * 20);
const explored1 = game.explored.reduce((s, v) => s + v, 0);
assert.equal(scout.task?.k, 'scout', 'The scout is still scouting after a minute');
assert(explored1 > explored0 * 1.5, `Auto-scout explores the map (${explored0} → ${explored1} tiles)`);
assert(!game.canScout(vil), 'Villagers cannot auto-scout');

// 5. Auto villagers keeps the town centre busy while resources last.
const p = game.players[me];
// housing for the test: free pop space with a few finished houses next to the town centre
for (const u of [far, guard]) game.killUnit(u, 0, true);
for (let i = 0; i < 4; i++) game.addBuilding('house', me, Math.floor(cx) - 8 + i * 3, Math.floor(cy) + 8, true);
ticks(1);
tc.q = [];
game.cmdAutoVillagers(me, tc.id, true);
ticks(2);
assert(tc.q.length > 0 && tc.q[0].u === 'villager', 'Auto villagers queues a villager when idle');
const vils0 = [...game.units.values()].filter((u) => u.o === me && u.t === 'villager' && u.dead === undefined).length;
ticks(60 * 20 * 2);
const vils1 = [...game.units.values()].filter((u) => u.o === me && u.t === 'villager' && u.dead === undefined).length;
assert(vils1 >= vils0 + 3, `Villagers keep coming (${vils0} → ${vils1})`);
game.cmdAutoVillagers(me, tc.id, false);
tc.q = [];
ticks(2);
assert.equal(tc.q.length, 0, 'Turning it off stops the queue');

console.log('Helper checks passed: group assist, stand ground, defending villagers, auto-scout, auto villagers.');
