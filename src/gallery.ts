// Debug model gallery: open index.html#gallery (or #gallery=units / buildings / misc)
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BUILDINGS, UNITS } from './data/defs';
import { getModel } from './render/models';
import { Batches, type MatKind } from './render/batches';
import { RIGGED, QUADS, MOUNTED, TAG } from './render/people';
import { CLIP, QCLIP } from './render/rig';
import { RealismAssets, makeRealismMaterial } from './render/realism';
import { Terrain } from './render/terrain';
import { Grid, T_GRASS } from './sim/grid';

export function runGallery(which: string) {
  const realistic = which.endsWith('-realism');
  if (realistic) which = which.slice(0, -8);
  document.body.innerHTML = '<canvas id="g" style="position:fixed;inset:0;width:100%;height:100%"></canvas>';
  const canvas = document.getElementById('g') as HTMLCanvasElement;
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(Math.min(2, devicePixelRatio));
  gl.setSize(innerWidth, innerHeight, false);
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = realistic ? 0.92 : 1.15;
  gl.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9ec9e8');
  scene.add(new THREE.HemisphereLight('#dbeeff', '#5a4a32', realistic ? 0.95 : 1.25));
  const sun = new THREE.DirectionalLight('#fff1d6', realistic ? 2.6 : 2.4);
  sun.position.set(-30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60;
  scene.add(sun);
  const assets = realistic ? new RealismAssets(gl, scene) : null;
  const grid = new Grid(168);
  grid.terrain.fill(T_GRASS);
  const cloud = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  cloud.needsUpdate = true;
  const fog = { fogMap: { value: null as THREE.Texture | null }, fogSize: { value: 168 }, cloudMap: { value: cloud as THREE.Texture | null }, cloudT: { value: 0 } };
  const terrain = assets ? new Terrain(scene, grid, fog, false, assets.ground) : null;
  terrain?.updateFog(new Uint8Array(168 * 168).fill(1), new Uint8Array(168 * 168).fill(1));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#6aa84f' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  if (!realistic) scene.add(ground);
  const wind = { value: 0 };
  const mat = assets ? makeRealismMaterial(assets.model, null, wind) : new THREE.MeshLambertMaterial({ vertexColors: true });
  const team = mat.clone();
  team.onBeforeCompile = mat.onBeforeCompile;
  team.customProgramCacheKey = mat.customProgramCacheKey;
  team.color.set('#2f6fe4');
  const focuses = new Map<string, [number, number]>();
  const put = (key: string, x: number, z: number, rot = -0.6) => {
    if (realistic) { x += 6; z += 6; }
    const m = getModel(key, realistic);
    const g = new THREE.Group();
    const a = new THREE.Mesh(m.base, mat); a.castShadow = true; a.receiveShadow = true; g.add(a);
    if (m.team) { const b = new THREE.Mesh(m.team, team); b.castShadow = true; g.add(b); }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
    focuses.set(key, [x, z]);
  };
  let x = 0, z = 0;
  if (which === 'units' || which === '') {
    const poses = ['idle', 'walk1', 'walk2', 'atk1', 'atk2', 'work1', 'dead'];
    for (const t of Object.keys(UNITS).filter((k) => !RIGGED.has(k))) {
      x = 0;
      for (const p of poses) {
        const v = t === 'villager' ? (p.startsWith('work') ? 'wood|none|m' : p.startsWith('walk') ? 'gold|gold|f' : 'build|none|m') : t === 'trebuchet' ? (p === 'idle' || p.startsWith('walk') ? 'packed' : 'deployed') : '';
        put(`u:${t}:${p}:${v}`, x, z);
        x += t.includes('ship') || t.includes('galle') || t === 'trebuchet' || t === 'war_elephant' ? 2.2 : 1.3;
      }
      z += t.includes('ship') || t.includes('galle') || t === 'trebuchet' || t === 'war_elephant' ? 2.2 : 1.4;
    }
  }
  if (which === 'buildings') {
    for (const t of Object.keys(BUILDINGS)) {
      x = 0;
      const s = BUILDINGS[t as keyof typeof BUILDINGS].size;
      for (const age of [1, 2, 3, 4]) { put(`b:${t}:${age}`, x, z, 0); x += s + 1.5; }
      put(`found:${s}`, x, z, 0); x += s + 1.5;
      put(`scaffold:${s}:2`, x, z, 0); x += s + 1.5;
      put(`rubble:${s}`, x, z, 0);
      z += s + 1.5;
    }
  }
  if (which === 'misc') {
    for (let v = 0; v < 6; v++) { put(`tree:${v}:`, v * 1.5, 0); put(`tree:${v}:palm`, v * 1.5, 2); }
    ['stump', 'berry', 'gold', 'stone', 'fish', 'relic'].forEach((t, i) => put(`n:${t}:${i}`, i * 1.5, 4));
    ['grass', 'flower', 'rock', 'bush', 'reed', 'cactus'].forEach((t, i) => put(`d:${t}:${i}`, i * 1.5, 6));
    ['arrow', 'bolt', 'stone', 'flag', 'marker', 'ring', 'cropRow'].forEach((t, i) => put(`fx:${t}`, i * 3, 9));
  }
  // animated rigged characters: each row a unit type, each column a clip
  let animate: ((t: number) => void) | null = null;
  if (which.startsWith('people')) {
    const lit = assets ? makeRealismMaterial(assets.model, null, wind) : new THREE.MeshLambertMaterial({ vertexColors: true });
    const basic = new THREE.MeshBasicMaterial();
    const mats = { lit, unlit: basic, add: basic, overlay: basic, ghost: basic } as Record<MatKind, THREE.Material>;
    const B = new Batches(scene, mats, undefined, realistic, assets?.model, wind);
    const only = which.split(':').slice(1);
    const villagerVariant = /^[fm]\d+$/.test(only.at(-1) ?? '') ? only.pop()! : 'm1';
    const types = only.length ? only : [...RIGGED];
    const hClips = [CLIP.IDLE, CLIP.WALK, CLIP.READY, CLIP.SWING, CLIP.THRUST, CLIP.BOW, CLIP.AIM, CLIP.THROW, CLIP.CHOP, CLIP.HOE, CLIP.FORAGE, CLIP.HAMMER, CLIP.PRAY, CLIP.CARRY, CLIP.HEAL, CLIP.DEAD];
    const col = new THREE.Color('#2f6fe4');
    types.forEach((t, row) => {
      const clips = QUADS.has(t) ? [QCLIP.IDLE, QCLIP.WALK, QCLIP.GALLOP, QCLIP.ATTACK, QCLIP.DEAD] : hClips;
      clips.forEach((clip, i) => focuses.set(`${t}: clip ${clip}`, [i * 1.3 + (realistic ? 6 : 0), row * (only.length ? 2.5 : 1.5) + (realistic ? 6 : 0)]));
    });
    animate = (time: number) => {
      B.begin();
      types.forEach((t, row) => {
        const quad = QUADS.has(t), mounted = MOUNTED.has(t);
        const clips = quad ? [QCLIP.IDLE, QCLIP.WALK, QCLIP.GALLOP, QCLIP.ATTACK, QCLIP.DEAD] : hClips;
        clips.forEach((c, i) => {
          const cyclic = quad ? c !== QCLIP.ATTACK : ![CLIP.SWING, CLIP.THRUST, CLIP.BOW, CLIP.AIM, CLIP.THROW].includes(c as never);
          const ph = cyclic ? time * (c === CLIP.IDLE ? 0.25 : 1) : (time * 0.8) % 1.3 / 1.3;
          const key = t === 'villager' ? `r:villager:${villagerVariant}` : `r:${t}:`;
          const show0 = t === 'villager' ? (c === CLIP.HOE ? TAG.HOE : c === CLIP.HAMMER ? TAG.HAMMER : c === CLIP.FORAGE ? TAG.BASKET : TAG.AXE) : 0;
          const show1 = t === 'villager' && c === CLIP.CARRY ? TAG.C_WOOD : 0;
          const roll = c === (quad ? QCLIP.DEAD : CLIP.DEAD) ? 1.45 : 0;
          const mclip = mounted ? (c === CLIP.WALK ? QCLIP.GALLOP : QCLIP.IDLE) : 0;
          B.addRig(key, i * 1.3 + (realistic ? 6 : 0), 0, row * (only.length ? 2.5 : 1.5) + (realistic ? 6 : 0), -0.6, 1, col, null, c, ph, mclip, time * 1.2, show0, show1, roll);
        });
      });
      B.end();
    };
  }
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 500);
  cam.position.set(realistic ? 1 : -6, 9, realistic ? 1 : -6);
  const ctl = new OrbitControls(cam, canvas);
  ctl.target.set(realistic ? 10 : 4, 0, realistic ? 10 : 4);
  ctl.update();
  if (focuses.size) {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:12px;left:12px;display:flex;gap:8px;align-items:center;padding:8px;background:#171c19dd;border-radius:6px;color:white;font:14px system-ui;z-index:1';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Model focus');
    for (const key of focuses.keys()) { const option = document.createElement('option'); option.value = key; option.textContent = key; select.append(option); }
    select.addEventListener('change', () => {
      const [x, z] = focuses.get(select.value)!;
      ctl.target.set(x, 0.65, z);
      cam.position.set(x + 5, 4.5, z + 5);
      ctl.update();
    });
    const label = document.createElement('span');
    label.textContent = realistic ? 'Realistic models' : 'Classic models';
    panel.append(label, select);
    document.body.append(panel);
  }
  (window as unknown as { gcam: unknown }).gcam = { cam, ctl };
  const t0 = performance.now();
  const loop = () => { requestAnimationFrame(loop); const time = (performance.now() - t0) / 1000; wind.value = time; terrain?.animate(time); animate?.(time); gl.render(scene, cam); };
  (window as unknown as { gframe: (t: number) => void }).gframe = (t: number) => { animate?.(t); gl.render(scene, cam); };
  loop();
  window.addEventListener('resize', () => { gl.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
}
