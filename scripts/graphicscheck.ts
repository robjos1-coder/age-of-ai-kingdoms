/** Validate both art libraries, including every age, rig, material slot and model variant. */
import assert from 'node:assert/strict';
import { BUILDINGS, UNITS } from '../src/data/defs';
import { getModel } from '../src/render/models';
import { RIGGED } from '../src/render/people';

let checked = 0;
let classicTriangles = 0;
let realisticTriangles = 0;
const keys: string[] = [];
for (const type of Object.keys(BUILDINGS)) for (const age of [1, 2, 3, 4]) keys.push(`b:${type}:${age}`);
for (const age of [1, 2, 3, 4]) for (const v of [1, 2]) keys.push(`b:house:${age}:${v}`);
keys.push('renov:main', 'renov:jib', 'renov:load', 'renov:rope');
for (const type of Object.keys(UNITS)) {
  if (RIGGED.has(type)) keys.push(`r:${type}:${type === 'villager' ? 'm' : ''}`);
  else for (const pose of ['idle', 'walk1', 'atk1', 'atk2', 'dead']) keys.push(`u:${type}:${pose}:${type === 'trebuchet' ? 'deployed' : ''}`);
}
for (const sex of ['m', 'f']) for (const lod of ['', '@1']) keys.push(`r:villager:${sex}${lod}`);
keys.push('u:trebuchet:idle:packed');
for (let v = 0; v < 6; v++) keys.push(`tree:${v}:`, `tree:${v}:palm`);
for (let v = 0; v < 6; v++) for (const lod of [1, 2]) keys.push(`tree:${v}::${lod}`, `tree:${v}:palm:${lod}`);
for (const type of ['stump', 'berry', 'gold', 'stone', 'fish', 'relic']) for (let v = 0; v < 5; v++) keys.push(`n:${type}:${v}`);
for (const type of ['grass', 'flower', 'rock', 'bush', 'reed', 'cactus']) for (let v = 0; v < 4; v++) keys.push(`d:${type}:${v}`);
for (const size of [1, 2, 3, 4, 5]) keys.push(`found:${size}`, `scaffold:${size}:2`, `rubble:${size}`);

for (const key of keys) {
  const classic = getModel(key, false);
  const real = getModel(key, true);
  assert.notEqual(real.base, classic.base, `${key}: separate style caches`);
  for (const model of [classic, real]) {
    assert(Number.isFinite(model.height) && model.height > -1, `${key}: valid height (fish sit below the surface)`);
    for (const geometry of [model.base, model.team]) {
      if (!geometry) continue;
      const count = geometry.getAttribute('position').count;
      for (const name of ['normal', 'color', 'uv', 'aBone', 'aTag', 'aSurface']) {
        const attribute = geometry.getAttribute(name);
        assert.equal(attribute.count, count, `${key}: matching ${name} vertex count`);
        assert(Array.from(attribute.array).every(Number.isFinite), `${key}: finite ${name}`);
      }
      const surface = geometry.getAttribute('aSurface');
      for (let i = 0; i < surface.count; i++) assert(surface.getX(i) >= 0 && surface.getX(i) <= 16, `${key}: atlas slot (or foliage card) in range`);
      if (model === real) realisticTriangles += count / 3;
      else classicTriangles += count / 3;
    }
    if (model.rig) {
      assert(Array.from(model.rig.piv).every(Number.isFinite), `${key}: finite skeleton`);
      assert.equal(real.rig?.quad, classic.rig?.quad, `${key}: animation preserved`);
    }
  }
  checked += 2;
}
assert(realisticTriangles > classicTriangles * 2, 'Realism adds meaningful geometric detail');
assert(getModel('tree:0::3', true).base.getAttribute('position').count < getModel('tree:0::0', true).base.getAttribute('position').count, 'Wide-zoom trees reduce geometry while retaining the realistic surface');
console.log(`Validated ${checked} models across both styles. ${Math.round(classicTriangles).toLocaleString()} classic / ${Math.round(realisticTriangles).toLocaleString()} realistic triangles.`);
