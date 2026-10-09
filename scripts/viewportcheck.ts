/** Exercise delayed/missing rotation events without a browser or WebGL context. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Renderer } from '../src/render/renderer';

const viewport = { devicePixelRatio: 3, innerWidth: 390, innerHeight: 844 };
Object.assign(globalThis, { window: viewport });
const canvas = { clientWidth: 390, clientHeight: 844, width: 300, height: 150 };
let ratio = 1, allocations = 0;
// Only the WebGL allocation is stubbed: camera projection and picking use Three.js.
const renderer = Object.assign(Object.create(Renderer.prototype) as Renderer, {
  canvas,
  gl: {
    getPixelRatio: () => ratio,
    setPixelRatio: (value: number) => { ratio = value; },
    setSize: (w: number, h: number, updateStyle: boolean) => {
      assert.equal(updateStyle, false, 'CSS owns the display size');
      canvas.width = Math.floor(w * ratio); canvas.height = Math.floor(h * ratio);
      allocations++;
    },
  },
  camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400),
  sun: new THREE.DirectionalLight(),
  game: { grid: { size: 128, h: () => 0 } },
  fog: { atmosphere: { hazeNear: { value: 0 }, hazeRange: { value: 0 }, hazeStrength: { value: 0 } } },
  width: 1, height: 1, tx: 64, tz: 64, yaw: Math.PI / 4, elev: 0.72,
  zoom: 20, minZoom: 7, maxZoom: 52, quality: 'high', realism: true, haze: true,
});

function verifyProjection() {
  assert.equal(renderer.width, canvas.clientWidth);
  assert.equal(renderer.height, canvas.clientHeight);
  assert.equal(canvas.width, Math.floor(canvas.clientWidth * ratio));
  assert.equal(canvas.height, Math.floor(canvas.clientHeight * ratio));
  const camera = renderer.camera;
  const center = new THREE.Vector3(renderer.tx, 0, renderer.tz);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const screen = (point: THREE.Vector3) => point.project(camera).multiply(new THREE.Vector3(renderer.width / 2, renderer.height / 2, 1));
  const origin = screen(center.clone());
  const horizontal = screen(center.clone().add(right)).distanceTo(origin);
  const vertical = screen(center.clone().add(up)).distanceTo(origin);
  assert(Math.abs(horizontal - vertical) < 1e-8, 'One world unit has equal pixel scale on both screen axes');
  assert.equal(renderer.zoom, 20, 'Rotation preserves player zoom');
  const target = renderer.groundAt(renderer.width / 2, renderer.height / 2);
  assert(target && Math.abs(target.x - 64) < 1e-8 && Math.abs(target.y - 64) < 1e-8, 'Screen-center picking tracks the resized camera');
}

renderer.resize(); verifyProjection();
assert.equal(ratio, 2, 'High quality caps phone pixel density');
for (let cycle = 0; cycle < 10; cycle++) {
  // A resize notification arrives while CSS still has the old dimensions.
  viewport.innerWidth = 844; viewport.innerHeight = 390;
  const before = allocations;
  renderer.resize();
  assert.equal(allocations, before, 'Early event does not reallocate the unchanged canvas');
  // Layout changes later, without another event. The next frame must recover.
  canvas.clientWidth = 844; canvas.clientHeight = 390;
  renderer.resize(); verifyProjection();
  canvas.clientWidth = 390; canvas.clientHeight = 844;
  renderer.resize(); verifyProjection();
}
const settled = allocations;
for (let frame = 0; frame < 120; frame++) renderer.resize();
assert.equal(allocations, settled, 'Steady frames do not resize the drawing buffer');

canvas.clientHeight = 0;
renderer.resize();
assert.equal(allocations, settled, 'Ignore transient zero-size layouts');
assert.equal(renderer.height, 844, 'Retain the last valid camera during a transition');
canvas.clientHeight = 844;
canvas.width = 300; canvas.height = 150;
renderer.resize(); verifyProjection();
assert.equal(allocations, settled + 1, 'Recover a reset drawing buffer even when CSS dimensions match');

renderer.quality = 'medium'; renderer.resize(); verifyProjection();
assert.equal(ratio, 1.5);
renderer.quality = 'low'; renderer.resize(); verifyProjection();
assert.equal(ratio, 1);
viewport.devicePixelRatio = 1.25;
renderer.quality = 'high'; renderer.resize(); verifyProjection();
assert.equal(ratio, 1.25);
console.log('Viewport checks passed: repeated rotations, delayed events, projection, picking, zoom, pixel density, buffer recovery and steady-frame allocation.');
