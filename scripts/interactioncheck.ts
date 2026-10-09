/** Exercise mobile taps through the real app command path and simulation. */
import assert from 'node:assert/strict';
import { App } from '../src/ui/app';
import { Game } from '../src/sim/game';
import type { Entity } from '../src/sim/game';
import type { Settings } from '../src/sim/types';

const settings: Settings = {
  mapType: 'arabia', mapSize: 120, startRes: 'standard', startAge: 1, popCap: 150,
  victory: 'standard', reveal: 'normal', speed: 1, seed: 42,
  players: [
    { civ: 'franks', human: true, team: 0, diff: 1, color: 1, name: 'You' },
    { civ: 'britons', human: false, team: 0, diff: 1, color: 2, name: 'Enemy' },
  ],
};
const game = new Game(settings);
game.ais = [];
const villagers = [...game.units.values()].filter((u) => u.o === game.human && u.t === 'villager');
const villager = villagers[0];
const sheep = [...game.units.values()].filter((u) => u.o === game.human && u.t === 'sheep')
  .sort((a, b) => Math.hypot(a.x - villager.x, a.y - villager.y) - Math.hypot(b.x - villager.x, b.y - villager.y))[0];
const scout = [...game.units.values()].find((u) => u.o === game.human && u.t === 'scout_cavalry')!;
let target: Entity = sheep;
// Only browser rendering is stubbed. App selection, smart taps, and game commands are real.
const app = Object.assign(Object.create(App.prototype) as App, {
  game, mode: { k: 'normal' }, menuPath: 'root', hud: { dirty: false },
  view: { selection: new Set<number>(), markers: [] },
  renderer: {
    time: 0, groundAt: () => ({ x: target.x, y: target.y }), pickEntity: () => target,
    flash: () => {}, onScreen: () => true,
  },
});
const reset = (...ids: number[]) => {
  game.cmdStop(game.human, villagers.map((u) => u.id));
  app.select(ids);
  target = sheep;
};
const tap = (opts: { touch: boolean; shift?: boolean; double?: boolean } = { touch: true }) => app.tapWorld(100, 100, opts);

reset(villager.id); tap();
assert.deepEqual(villager.task, { k: 'gather', id: sheep.id }, 'Tap claimed sheep assigns gathering');
assert.deepEqual([...app.view.selection], [villager.id], 'The villager remains selected');
reset(villager.id); tap({ touch: true, double: true });
assert.equal(villager.task?.k, 'gather', 'Rapid repeat taps continue gathering instead of selecting sheep');

reset(...villagers.map((u) => u.id)); tap();
assert(villagers.every((u) => u.task?.k === 'gather' && u.task.id === sheep.id), 'A group of villagers can shepherd');
reset(villager.id);
game.cmdMove(game.human, [villager.id], villager.x + 1, villager.y);
tap({ touch: true, shift: true });
assert.equal(villager.task?.k, 'move');
assert.deepEqual(villager.q, [{ k: 'gather', id: sheep.id }], 'Shift-tap queues shepherding');

reset(scout.id); tap();
assert.deepEqual([...app.view.selection], [sheep.id], 'Scout tap still selects claimed sheep for herding');
reset(); tap();
assert.deepEqual([...app.view.selection], [sheep.id], 'Unselected sheep remain selectable');
reset(villager.id); target = villagers[1]; tap();
assert.deepEqual([...app.view.selection], [target.id], 'Tap another villager still selects it');
reset(villager.id); tap({ touch: false });
assert.deepEqual([...app.view.selection], [sheep.id], 'Desktop left click retains normal selection');
reset(villager.id); app.command(100, 100);
assert.equal(villager.task?.k, 'gather', 'Desktop right-click retains shepherding');

reset(villager.id);
sheep.o = 0; tap();
assert.equal(villager.task?.k, 'gather', 'Neutral sheep remain gatherable');
sheep.o = game.human;
tap();
const initialFood = sheep.food!;
const initialStock = game.players[game.human].res.food;
for (let tick = 0; tick < 300; tick++) game.tick();
assert(sheep.dead !== undefined && sheep.food! < initialFood, 'A claimed sheep is harvested after the tap');
assert(villager.ca > 0 || game.players[game.human].res.food > initialStock, 'Gathered food reaches the villager or stockpile');
console.log('Interaction checks passed: claimed and neutral sheep, repeated taps, groups, queues, selection, desktop commands, and food harvesting.');
