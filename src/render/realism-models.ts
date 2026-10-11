/** Detailed, deterministic geometry for the realism renderer. All pieces stay instanced. */
import * as THREE from 'three';
import type { MB, Col, PieceOpts } from './mb';
import { grassTuft, leafClump, spray, spire } from './foliage';

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

// ---------------------------------------------------------------- shared tree shapes
// Lumpy blob (inner shadow mass of broadleaf crowns) and ragged cone (dense core of conifers).

const BLOBS = [0, 1, 2, 3].map((k) => {
  const g = new THREE.SphereGeometry(1, 9, 6);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + Math.sin(x * 3.1 + k * 1.7) * 0.11 + Math.sin(y * 4.3 + z * 2.9 + k) * 0.09 + Math.sin(z * 5.7 - x * 2.3 + k * 2.3) * 0.06;
    p.setXYZ(i, x * n, y * n * (y < 0 ? 0.72 : 1), z * n);
  }
  g.computeVertexNormals();
  return g;
});
const TIER = (() => {
  const g = new THREE.CylinderGeometry(0, 1, 1, 10, 2, false);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    // ragged, drooping branch tips along the bottom edge
    const r = Math.hypot(x, z);
    const jag = y < -0.4 ? 1 + Math.sin(a * 5) * 0.12 + Math.sin(a * 11) * 0.06 : 1;
    p.setXYZ(i, x * jag, y - (r > 0.6 ? Math.max(0, Math.sin(a * 5)) * 0.08 : 0), z * jag);
  }
  g.computeVertexNormals();
  return g;
})();

// ---------------------------------------------------------------- card trees (all distances)
// Trunk and limbs are geometry; the foliage is alpha-cut texture cards whose normals are bent outwards
// from the crown, so it shades like a soft volume with a broken, leafy silhouette.

function cardTree(mb: MB, variant: number, kind: number, lod: number) {
  const rnd = random(571 + variant * 99);
  const scale = 0.9 + rnd() * 0.25;
  mb.push(0, 0, 0, 0, variant * 1.7, 0, scale);
  const tmp = new THREE.Vector3();
  if (kind === 3) {
    // palm: leaning, segmented trunk and arching fronds (two cards each: rising, then drooping)
    let prev = new THREE.Vector3(0, 0.02, 0);
    for (let i = 1; i <= 6; i++) {
      const p = new THREE.Vector3(Math.sin(i * 0.28) * 0.16, i * 0.42, 0.02 * i);
      branch(mb, prev, p, 0.075 - i * 0.006);
      prev = p;
    }
    mb.normalFn = (p, n) => {
      tmp.set(p.x - prev.x * scale, 0.5 * scale, p.z - prev.z * scale).normalize();
      n.multiplyScalar(0.3).add(tmp).normalize();
    };
    const cols = ['#7d9650', '#86a058', '#73904a'];
    for (let f = 0; f < 9; f++) {
      const a = f * (Math.PI * 2 / 9) + rnd() * 0.3, l1 = 0.45 + rnd() * 0.1, rise = -0.35 - rnd() * 0.2;
      spray(mb, prev.x, prev.y, prev.z, a, l1, rise, cols[f % 3]);
      const ex = prev.x + Math.cos(a) * l1 * Math.cos(rise), ey = prev.y - Math.sin(rise) * l1, ez = prev.z + Math.sin(a) * l1 * Math.cos(rise);
      spray(mb, ex, ey, ez, a, 0.55 + rnd() * 0.15, 0.55 + rnd() * 0.25, cols[(f + 1) % 3]);
    }
    mb.ball(0.07, '#73513a', prev.x + 0.05, prev.y - 0.1, prev.z + 0.05, { surface: 'bark' });
  } else if (kind === 1) {
    // broadleaf: buttressed trunk, a few limbs, clumps clustered around a lobed crown
    const crownY = 1.62 + rnd() * 0.15, rx = 0.8 + rnd() * 0.12, ry = 0.66 + rnd() * 0.08;
    branch(mb, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, 1.25, -0.02), 0.11);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + rnd();
      branch(mb, new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(Math.cos(a) * 0.22, 0.0, Math.sin(a) * 0.22), 0.03);
    }
    const limbs: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + rnd() * 0.6;
      const end = new THREE.Vector3(Math.cos(a) * rx * 0.6, crownY - 0.05 + rnd() * 0.25, Math.sin(a) * rx * 0.6);
      branch(mb, new THREE.Vector3(0.02, 0.95 + i * 0.1, 0), end, 0.035);
      limbs.push(end);
    }
    mb.normalFn = (p, n) => {
      tmp.set(p.x, (p.y - crownY * scale) * 1.15 + 0.12 * scale, p.z).normalize();
      n.multiplyScalar(0.25).add(tmp).normalize();
    };
    // dark inner mass keeps the crown from looking see-through at a distance
    mb.add(BLOBS[variant % 4], '#3a4f26', 0, crownY - 0.05, 0, { surface: 'leaf' }, rx * 0.45, ry * 0.45, rx * 0.45);
    const cols = ['#6f8c44', '#7a964b', '#66823f', '#83a052'];
    const n = lod >= 3 ? 16 : 22;
    for (let i = 0; i < n; i++) {
      // fibonacci-ish spread over the upper ~3/4 of an ellipsoid, pulled towards the limb ends
      const t = (i + 0.5) / n, y = 0.95 - t * 1.75;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const a = i * 2.399 + rnd() * 0.5;
      let x = Math.cos(a) * r * rx * 0.78, z = Math.sin(a) * r * rx * 0.78;
      const l = limbs[i % limbs.length];
      x = x * 0.75 + l.x * 0.25; z = z * 0.75 + l.z * 0.25;
      const size = 0.62 + rnd() * 0.2 - (y < -0.3 ? 0.08 : 0);
      leafClump(mb, x, crownY + y * ry * 0.85, z, size, cols[(i + variant) % cols.length], rnd);
    }
  } else {
    // conifer: straight trunk with whorls of drooping needle sprays, narrowing to a spire
    const top = 2.7 + rnd() * 0.3;
    branch(mb, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, top - 0.2, -0.01), 0.07);
    mb.normalFn = (p, n) => {
      const h = Math.hypot(p.x, p.z);
      tmp.set(p.x, h * 0.55 + 0.22 * scale, p.z).normalize();
      n.multiplyScalar(0.2).add(tmp).normalize();
    };
    mb.add(TIER, '#22331d', 0, (top * 0.55) / 2 + 0.5, 0, { surface: 'leaf', ry: variant }, 0.3, top * 0.55, 0.3);
    const cols = kind === 0 ? ['#5c7843', '#647f49', '#53703d'] : ['#506e47', '#58764e', '#496641'];
    const tiers = lod >= 3 ? 6 : 8;
    for (let t = 0; t < tiers; t++) {
      const f = t / tiers, y = 0.45 + f * (top - 0.75);
      const len = 0.78 * (1 - f * 0.82) + 0.12;
      const per = Math.max(4, Math.round(7 - f * 3));
      for (let j = 0; j < per; j++) {
        const a = j * (Math.PI * 2 / per) + t * 0.9 + rnd() * 0.4;
        spray(mb, Math.cos(a) * 0.03, y + rnd() * 0.06, Math.sin(a) * 0.03, a, len * (0.85 + rnd() * 0.3), 0.32 + f * 0.1 + rnd() * 0.15, cols[(j + t) % 3]);
      }
    }
    spire(mb, 0, top - 0.45, 0, 0.6, cols[0]);
  }
  mb.normalFn = null;
  mb.pop();
}

export function realisticTree(mb: MB, variant: number, biome: string, lod = 0) {
  const kind = biome === 'palm' ? (variant % 3 === 0 ? 1 : 3) : variant % 3;
  cardTree(mb, variant, kind, lod);
}

export function realisticDeco(mb: MB, type: string, variant: number): boolean {
  const rnd = random(88 + variant * 67);
  if (type === 'bush' || type === 'berry') {
    // low shrub of leaf-cluster cards around a few stems
    for (let i = 0; i < 5; i++) branch(mb, new THREE.Vector3(0, 0.02, 0), new THREE.Vector3((rnd() - 0.5) * 0.3, 0.17 + rnd() * 0.16, (rnd() - 0.5) * 0.3), 0.009);
    const tmp = new THREE.Vector3();
    mb.normalFn = (p, n) => { tmp.set(p.x, (p.y - 0.12) * 1.3 + 0.08, p.z).normalize(); n.multiplyScalar(0.25).add(tmp).normalize(); };
    const cols = ['#6f8c44', '#7a964b', '#66823f'];
    const n = type === 'berry' ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const a = i * 2.399 + rnd(), r = i ? 0.13 + rnd() * 0.06 : 0;
      leafClump(mb, Math.cos(a) * r, 0.2 + rnd() * 0.08 + (i ? 0 : 0.06), Math.sin(a) * r, 0.3 + rnd() * 0.08, cols[i % 3], rnd);
    }
    mb.normalFn = null;
    if (type === 'berry') for (let i = 0; i < 16; i++) mb.ball(0.017, i % 3 ? '#93283c' : '#653052', Math.cos(i * 2.4) * 0.26, 0.18 + rnd() * 0.16, Math.sin(i * 2.4) * 0.26, { surface: 'skin' });
    return true;
  }
  if (type === 'grass' || type === 'flower') {
    // painted grass cards (true colour in the texture, gentle per-variant tint)
    const tint = ['#eceedc', '#e2e8cf', '#efe8d2', '#dce3c8'][variant % 4];
    grassTuft(mb, 0.34 + rnd() * 0.12, 0.19 + rnd() * 0.07, tint, type === 'flower', rnd() * 3, 3 + (variant % 2));
    return true;
  }
  if (type === 'reed') {
    grassTuft(mb, 0.36, 0.5 + rnd() * 0.15, '#c9c49c', false, rnd() * 3);
    for (let i = 0; i < 4; i++) {
      const x = (rnd() - 0.5) * 0.2, z = (rnd() - 0.5) * 0.2, h = 0.45 + rnd() * 0.2;
      mb.cyl(0.004, 0.004, h, 6, '#6b6a3a', x, h / 2, z, { surface: 'leaf' });
      mb.cyl(0.014, 0.014, 0.08, 6, '#5c472b', x, h + 0.03, z, { surface: 'thatch' });
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
