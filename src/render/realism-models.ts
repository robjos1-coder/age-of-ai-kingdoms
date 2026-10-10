/** Detailed, deterministic geometry for the realism renderer. All pieces stay instanced. */
import * as THREE from 'three';
import type { MB, Col, PieceOpts } from './mb';

const LEAF = (() => {
  const geometry = new THREE.BufferGeometry();
  // Folded lanceolate leaf: pointed tips and a raised central vein, with both sides.
  const p = [0, 0, -0.5, -0.22, 0, -0.12, 0, 0.05, 0, 0.22, 0, -0.12, 0, 0, 0.5];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3, 2, 1, 0, 3, 2, 0, 2, 4, 1, 3, 4, 2]);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
})();
const BRANCH = new THREE.CylinderGeometry(0.38, 1, 1, 8);
const TRUNK = new THREE.CylinderGeometry(0.38, 1, 1, 16);

function random(seed: number) {
  let value = seed + 1;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}

function branch(mb: MB, a: THREE.Vector3, b: THREE.Vector3, radius: number, surface: 'bark' | 'wood' = 'bark') {
  const direction = b.clone().sub(a);
  const length = direction.length();
  const middle = a.clone().add(b).multiplyScalar(0.5);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), 'YXZ');
  mb.add(radius > 0.06 ? TRUNK : BRANCH, '#78624b', middle.x, middle.y, middle.z, { rx: e.x, ry: e.y, rz: e.z, surface }, radius, length, radius);
}

function leaf(mb: MB, x: number, y: number, z: number, size: number, color: Col, rx: number, ry: number, rz = 0) {
  mb.add(LEAF, color, x, y, z, { rx, ry, rz, surface: 'leaf' }, size, size, size);
}

function foliage(mb: MB, x: number, y: number, z: number, radius: number, count: number, seed: number, pine = false, density = 1) {
  const rnd = random(seed);
  const colors = pine ? ['#344c29', '#405734', '#4a603b', '#536544'] : ['#4b6134', '#59713e', '#627d43', '#70864c', '#49613b'];
  for (let i = 0; i < Math.ceil(count * density); i++) {
    const a = rnd() * Math.PI * 2;
    const dy = (rnd() * 2 - 1) * radius * 0.58;
    const r = Math.sqrt(rnd()) * radius * Math.sqrt(Math.max(0.1, 1 - (dy / radius) ** 2));
    const size = (pine ? 0.13 + rnd() * 0.09 : 0.15 + rnd() * 0.12) / Math.sqrt(density);
    leaf(mb, x + Math.cos(a) * r, y + dy, z + Math.sin(a) * r, size, colors[i % colors.length], rnd() * 1.4 - 0.7, rnd() * 6.28, rnd() * 0.8);
  }
}

export function realisticTree(mb: MB, variant: number, biome: string, lod = 0) {
  const density = lod === 2 ? 0.22 : lod === 1 ? 0.5 : 1;
  const rnd = random(571 + variant * 99);
  const kind = biome === 'palm' ? (variant % 3 === 0 ? 1 : 3) : variant % 3;
  const scale = 0.91 + rnd() * 0.22;
  mb.push(0, 0, 0, 0, variant * 1.7, 0, scale);
  const height = kind === 1 ? 1.95 : kind === 3 ? 2.5 : 2.7;
  const origin = new THREE.Vector3(0, 0.06, 0);
  const tip = new THREE.Vector3(0.04, height, -0.03);
  branch(mb, origin, tip, kind === 1 ? 0.105 : 0.072);
  // Buttress roots visibly anchor the trunk to its ground.
  for (let i = 0; i < 5; i++) {
    const a = i * 1.256 + variant;
    branch(mb, new THREE.Vector3(0, 0.19, 0), new THREE.Vector3(Math.cos(a) * 0.28, 0.01, Math.sin(a) * 0.28), 0.035);
  }
  if (kind === 3) {
    for (let frond = 0; frond < 10; frond++) {
      const angle = frond * Math.PI * 2 / 10;
      let previous = tip.clone();
      for (let section = 1; section <= 6; section++) {
        const f = section / 6;
        const p = new THREE.Vector3(Math.cos(angle) * f * 0.85, height + Math.sin(f * Math.PI) * 0.24 - f * 0.25, Math.sin(angle) * f * 0.85);
        branch(mb, previous, p, 0.008);
        for (const side of [-1, 1]) leaf(mb, p.x + Math.cos(angle + side * 1.2) * 0.09, p.y, p.z + Math.sin(angle + side * 1.2) * 0.09, 0.23 * (1.1 - f * 0.5), '#526738', 0.1, -angle + side * 0.65, -0.25);
        previous = p;
      }
    }
    mb.ball(0.065, '#73513a', 0.05, height - 0.12, 0.06, { surface: 'bark' });
  } else if (kind === 1) {
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.399;
      const start = new THREE.Vector3(0, 0.75 + rnd() * 0.45, 0);
      const radius = 0.3 + rnd() * 0.33;
      const end = new THREE.Vector3(Math.cos(angle) * radius, 1.45 + rnd() * 0.65, Math.sin(angle) * radius);
      branch(mb, start, end, 0.03);
      for (let j = 0; j < 2; j++) {
        const twig = end.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.35, rnd() * 0.2, (rnd() - 0.5) * 0.35));
        branch(mb, end, twig, 0.009);
      }
      foliage(mb, end.x, end.y, end.z, 0.32 + rnd() * 0.15, 54, 99 + i * 17 + variant * 19, false, density);
    }
    foliage(mb, 0, 2.03, 0, 0.43, 85, variant + 928, false, density);
  } else {
    // Layered lateral branches, broken silhouette and individual needles/leaves.
    for (let level = 0; level < 7; level++) {
      const y = 0.55 + level * 0.28;
      const radius = 0.57 * (1 - level / 8);
      for (let j = 0; j < 6; j++) {
        const angle = j * 1.047 + level * 0.73;
        const end = new THREE.Vector3(Math.cos(angle) * radius, y + 0.04, Math.sin(angle) * radius);
        branch(mb, new THREE.Vector3(0, y + 0.08, 0), end, 0.012);
        foliage(mb, end.x * 0.75, y + 0.1, end.z * 0.75, radius * 0.38 + 0.12, 20, level * 103 + j * 17 + variant, true, density);
      }
    }
    foliage(mb, 0, 2.52, 0, 0.15, 30, variant + 319, true, density);
  }
  mb.pop();
}

export function realisticDeco(mb: MB, type: string, variant: number): boolean {
  const rnd = random(88 + variant * 67);
  if (type === 'bush' || type === 'berry') {
    for (let i = 0; i < 5; i++) branch(mb, new THREE.Vector3(0, 0.02, 0), new THREE.Vector3((rnd() - 0.5) * 0.3, 0.17 + rnd() * 0.16, (rnd() - 0.5) * 0.3), 0.009);
    foliage(mb, 0, 0.23, 0, type === 'berry' ? 0.33 : 0.24, type === 'berry' ? 90 : 55, variant + 319);
    if (type === 'berry') for (let i = 0; i < 16; i++) mb.ball(0.017, i % 3 ? '#93283c' : '#653052', Math.cos(i * 2.4) * 0.26, 0.18 + rnd() * 0.16, Math.sin(i * 2.4) * 0.26, { surface: 'skin' });
    return true;
  }
  if (type === 'grass' || type === 'reed' || type === 'flower') {
    const reed = type === 'reed';
    const count = reed ? 12 : 18;
    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.5) * 0.28, z = (rnd() - 0.5) * 0.28;
      const h = reed ? 0.24 + rnd() * 0.35 : 0.09 + rnd() * 0.14;
      leaf(mb, x, h / 2, z, h, ['#7d9a3c', '#8fae47', '#6c8a34', '#a0b856'][i % 4], Math.PI / 2 + rnd() * 0.3, rnd() * 6.28, (rnd() - 0.5) * 0.3);
      if (reed && i % 3 === 0) mb.cyl(0.01, 0.01, 0.07, 6, '#5c472b', x, h, z, { surface: 'thatch' });
    }
    if (type === 'flower') for (let i = 0; i < 3; i++) {
      const x = (rnd() - 0.5) * 0.2, z = (rnd() - 0.5) * 0.2;
      mb.cyl(0.003, 0.003, 0.19, 6, '#5c733b', x, 0.095, z, { surface: 'leaf' });
      for (let p = 0; p < 5; p++) mb.ball(0.012, ['#ded5a1', '#a35d73', '#e7e2d9', '#91709f'][variant % 4], x + Math.cos(p * 1.26) * 0.018, 0.19, z + Math.sin(p * 1.26) * 0.018, { surface: 'skin' }, 0.3);
    }
    return true;
  }
  return false;
}

/** Fractured, partly buried ore outcrops with mineral seams flush to their rock faces. */
export function realisticDeposit(mb: MB, type: 'gold' | 'stone', variant: number) {
  const rnd = random(4721 + variant * 173 + (type === 'gold' ? 0 : 991));
  for (let rock = 0; rock < 6; rock++) {
    const radius = rock === 0 ? 0.34 : 0.1 + rnd() * 0.15;
    const angle = rnd() * Math.PI * 2;
    const distance = rock === 0 ? 0 : 0.16 + rnd() * 0.17;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.getAttribute('position');
    const seed = variant * 3.1 + rock * 7.3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // Coordinate-based noise keeps shared vertices together; clipped planes
      // create exposed fractures instead of smooth spheres or stacked cubes.
      const n = 1 + Math.sin(x * 9 + y * 13 + z * 7 + seed) * 0.09 + Math.sin(x * 21 - z * 17 + seed) * 0.04;
      p.setXYZ(i, Math.min(0.78, x) * n, Math.min(0.82, Math.max(-0.68, y)) * n * (0.66 + rock % 3 * 0.08), z * n);
    }
    geo.computeVertexNormals();
    mb.push(Math.cos(angle) * distance, radius * 0.31 - 0.025, Math.sin(angle) * distance, rnd() * 0.18, rnd() * 6.28, rnd() * 0.18, radius);
    mb.add(geo, type === 'gold' ? ['#ad8d5e', '#9c805c', '#8f7758'][rock % 3] : ['#78808b', '#8d949b', '#69737d'][rock % 3], 0, 0, 0, { surface: 'rock' });
    const veins: number[] = [], quartz: number[] = [];
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i);
      const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.y < 0.12 || rnd() > (type === 'gold' ? 0.32 : 0.14)) continue;
      const start = a.clone().lerp(c, 0.24 + rnd() * 0.18), end = b.clone().lerp(c, 0.25);
      const goldSeam = type === 'gold' && rnd() > 0.35;
      const width = goldSeam ? 0.12 + rnd() * 0.16 : 0.04 + rnd() * 0.06;
      const points = [start, end, end.clone().lerp(c, width), start.clone().lerp(c, width)];
      const target = goldSeam ? veins : quartz;
      for (const j of [0, 1, 2, 0, 2, 3]) target.push(...points[j].clone().addScaledVector(normal, 0.006).toArray());
    }
    for (const [positions, color, surface] of [[veins, '#bda576', 'gold'], [quartz, '#b7b6ab', 'rock']] as const) {
      if (!positions.length) continue;
      const seams = new THREE.BufferGeometry();
      seams.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      seams.computeVertexNormals();
      mb.add(seams, color, 0, 0, 0, { surface });
      seams.dispose();
    }
    mb.pop();
    geo.dispose();
  }
}

export function gableDetails(mb: MB, w: number, d: number, h: number, color: Col, x: number, y: number, z: number, o: PieceOpts) {
  mb.push(x, y, z, o.rx, o.ry, o.rz);
  const surface = mb.surfaces.get(color) ?? 'tile';
  const pitch = Math.atan2(h, d / 2);
  const slopeLength = Math.hypot(h, d / 2);
  for (const side of [-1, 1]) {
    mb.box(w + 0.04, 0.035, 0.045, '#655241', 0, 0.005, side * d / 2, { surface: 'wood' });
    for (const end of [-1, 1]) mb.box(0.04, 0.04, slopeLength + 0.03, '#76614d', end * w / 2, h / 2, side * d / 4, { rx: side * pitch, surface: 'wood' });
    const rows = Math.max(3, Math.round(slopeLength / 0.16));
    for (let row = 1; row < rows; row++) {
      const f = row / rows;
      mb.box(w, 0.008, 0.018, color, 0, h * (1 - f) + 0.008, side * d * f / 2, { rx: side * pitch, surface });
    }
  }
  mb.cyl(0.028, 0.028, w + 0.04, 10, color, 0, h + 0.009, 0, { rz: Math.PI / 2, surface });
  mb.pop();
}

export function pyramidDetails(mb: MB, w: number, d: number, h: number, color: Col, x: number, y: number, z: number, o: PieceOpts) {
  mb.push(x, y, z, o.rx, o.ry, o.rz);
  const surface = mb.surfaces.get(color) ?? 'tile';
  const rows = Math.max(3, Math.round(Math.max(w, d) / 0.26));
  for (const side of [-1, 1]) {
    mb.box(w + 0.03, 0.035, 0.04, '#6d5c48', 0, 0.005, side * d / 2, { surface: 'wood' });
    mb.box(0.04, 0.035, d + 0.03, '#6d5c48', side * w / 2, 0.005, 0, { surface: 'wood' });
    for (let row = 1; row < rows; row++) {
      const f = row / rows;
      mb.box(w * f, 0.009, 0.018, color, 0, h * (1 - f) + 0.008, side * d * f / 2, { rx: side * Math.atan2(h, d / 2), surface });
      mb.box(0.018, 0.009, d * f, color, side * w * f / 2, h * (1 - f) + 0.008, 0, { rz: -side * Math.atan2(h, w / 2), surface });
    }
  }
  mb.pop();
}

export function detailBuilding(mb: MB, type: string, tier: number) {
  if (type === 'farm') {
    for (let row = 0; row < 7; row++) for (let stalk = 0; stalk < 18; stalk++) {
      const x = -1.24 + stalk * 0.146, z = -1.2 + row * 0.4;
      const h = 0.15 + ((row * 13 + stalk * 7) % 11) * 0.008;
      mb.cyl(0.003, 0.003, h, 5, '#a19a59', x, h / 2 + 0.08, z, { surface: 'thatch' });
      leaf(mb, x, h * 0.55 + 0.08, z, 0.13, '#8b9451', 0.7, stalk);
      mb.ball(0.012, '#bbad70', x, h + 0.08, z, { surface: 'thatch' }, 1.7);
    }
    return;
  }
  if (['palisade_wall', 'palisade_gate', 'gate', 'stone_wall', 'outpost', 'watch_tower', 'dock'].includes(type)) return;
  const w = type === 'town_center' ? 3.9 : type === 'castle' ? 3.8 : type === 'wonder' ? 4.9 : type === 'house' || type.endsWith('camp') || type === 'mill' ? 1.85 : 2.85;
  // Individually cut paving around the existing foundation, within its footprint.
  const n = Math.round(w / 0.28);
  for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
    const p = (i + 0.5) / n * (w - 0.12) - (w - 0.12) / 2;
    mb.box((w - 0.12) / n - 0.012, 0.025, 0.14, '#a69b87', p, 0.13, side * (w / 2 - 0.1), { surface: 'stone' });
    mb.box(0.14, 0.025, (w - 0.12) / n - 0.012, '#978e80', side * (w / 2 - 0.1), 0.13, p, { surface: 'stone' });
  }
  if (['town_center', 'house', 'barracks', 'stable', 'market', 'blacksmith', 'mill'].includes(type)) {
    const x = -w * 0.38, z = w * 0.35;
    // Coopered barrel with iron hoops and a lid, plus weathered storage crate.
    mb.cyl(0.105, 0.105, 0.25, 14, '#9e896b', x, 0.27, z, { surface: 'wood' });
    for (const y of [0.175, 0.245, 0.355]) mb.cyl(0.108, 0.108, 0.018, 14, '#747679', x, y, z, { surface: 'metal' });
    mb.cyl(0.099, 0.099, 0.01, 14, '#9e896b', x, 0.4, z, { surface: 'wood' });
    mb.boxB(0.19, 0.16, 0.2, '#9a8264', x + 0.25, 0.14, z, { surface: 'wood' });
    mb.box(0.018, 0.16, 0.22, '#685743', x + 0.25, 0.22, z, { rz: 0.7, surface: 'wood' });
  }
  if (tier >= 3 && ['castle', 'town_center', 'wonder'].includes(type)) {
    const wall = type === 'castle' ? 3.0 : type === 'town_center' ? 2.5 : 3.6;
    for (const side of [-1, 1]) for (const end of [-1, 1]) for (let course = 0; course < 7; course++) {
      mb.box(0.17, 0.12, 0.19, course % 2 ? '#c2b8a6' : '#aa9f8c', side * (wall / 2 + 0.018), 0.24 + course * 0.16, end * (wall / 2 - 0.06), { surface: 'stone' });
    }
  }
}

export function detailShip(mb: MB, length: number, width: number) {
  for (let i = 0; i < 7; i++) {
    const x = -length * 0.35 + i * length * 0.1;
    for (const side of [-1, 1]) {
      mb.cyl(0.006, 0.006, 0.2, 5, '#bcac8a', x, 0.33, width * 0.4 * side, { surface: 'cloth' });
    }
  }
  for (const side of [-1, 1]) mb.cyl(0.009, 0.009, length * 0.74, 5, '#9b8161', 0, 0.4, width * 0.4 * side, { rz: Math.PI / 2, surface: 'wood' });
  for (const side of [-1, 1]) branch(mb, new THREE.Vector3(0.05, 1.04, 0), new THREE.Vector3(-length * 0.4, 0.3, width * 0.35 * side), 0.004, 'wood');
  mb.cyl(0.04, 0.04, 0.04, 8, '#7d6a54', -length * 0.35, 0.32, 0, { surface: 'wood' });
}

export function detailSiege(mb: MB, type: string, variant: string) {
  if (type === 'scorpion' || type === 'heavy_scorpion' || type === 'trebuchet' && variant !== 'packed') return;
  const r = type === 'bombard_cannon' ? 0.17 : type === 'trebuchet' ? 0.14 : type.includes('ram') ? 0.12 : 0.1;
  const xs = type === 'bombard_cannon' ? [0] : type === 'trebuchet' ? [-0.45, 0.45] : [-0.28, 0.28];
  for (const x of xs) for (const side of [-1, 1]) {
    const z = (type === 'bombard_cannon' ? 0.27 : type === 'trebuchet' || type.includes('ram') ? 0.33 : 0.29) * side;
    for (let spoke = 0; spoke < 8; spoke++) mb.box(r * 1.7, 0.012, 0.017, '#8c775b', x, r, z, { rz: spoke * Math.PI / 4, surface: 'wood' });
    mb.cyl(r * 0.23, r * 0.23, 0.02, 12, '#777b7e', x, r, z + side * 0.012, { rx: Math.PI / 2, surface: 'metal' });
  }
}
