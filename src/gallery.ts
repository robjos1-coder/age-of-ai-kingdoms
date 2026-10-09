// Debug model gallery: open index.html#gallery (or #gallery=units / buildings / misc)
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BUILDINGS, UNITS } from './data/defs';
import { getModel } from './render/models';

export function runGallery(which: string) {
  document.body.innerHTML = '<canvas id="g" style="position:fixed;inset:0;width:100%;height:100%"></canvas>';
  const canvas = document.getElementById('g') as HTMLCanvasElement;
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.setPixelRatio(Math.min(2, devicePixelRatio));
  gl.setSize(innerWidth, innerHeight, false);
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.15;
  gl.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9ec9e8');
  scene.add(new THREE.HemisphereLight('#dbeeff', '#5a4a32', 1.25));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(-30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#6aa84f' }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const team = new THREE.MeshLambertMaterial({ vertexColors: true, color: '#2f6fe4' });
  const put = (key: string, x: number, z: number, rot = -0.6) => {
    const m = getModel(key);
    const g = new THREE.Group();
    const a = new THREE.Mesh(m.base, mat); a.castShadow = true; a.receiveShadow = true; g.add(a);
    if (m.team) { const b = new THREE.Mesh(m.team, team); b.castShadow = true; g.add(b); }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
  };
  let x = 0, z = 0;
  if (which === 'units' || which === '') {
    const poses = ['idle', 'walk1', 'walk2', 'atk1', 'atk2', 'work1', 'dead'];
    for (const t of Object.keys(UNITS)) {
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
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 500);
  cam.position.set(-6, 9, -6);
  const ctl = new OrbitControls(cam, canvas);
  ctl.target.set(4, 0, 4);
  ctl.update();
  (window as unknown as { gcam: unknown }).gcam = { cam, ctl };
  const loop = () => { requestAnimationFrame(loop); gl.render(scene, cam); };
  loop();
}
