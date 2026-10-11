// Procedural low-poly art: every unit, building, resource and effect in the game is built here.
// Models face +X, origin at ground level centre.

import * as THREE from 'three';
import { MB, type Col } from './mb';
import { buildRigged } from './people';
import { setHDLod } from './people-hd';
import type { Rig } from './rig';
import { realisticTree, realisticDeco, realisticDeposit, detailBuilding, detailShip, detailSiege } from './realism-models';
import { hdBuilding, renovation } from './buildings-hd';

export interface ModelGeo {
  base: THREE.BufferGeometry;
  team: THREE.BufferGeometry | null;
  height: number;
  rig?: Rig;
}

const cache = new Map<string, ModelGeo>();

export function getModel(key: string, realistic = false): ModelGeo {
  const cacheKey = `${realistic ? 'real:' : 'classic:'}${key}`;
  let m = cache.get(cacheKey);
  if (m) return m;
  const context = /^(b:|renov:|scaffold:|found:|rubble:)/.test(key) ? 'building' : /^(tree:|n:|d:)/.test(key) ? 'natural' : key.startsWith('fx:') ? 'effect' : 'unit';
  const mb = new MB(realistic, context);
  let rig: Rig | undefined;
  if (key.startsWith('r:')) {
    const [, t, raw] = key.split(':');
    const [v, lod] = (raw ?? '').split('@');
    setHDLod(+(lod ?? 0));
    rig = buildRigged(mb, t, v ?? '');
    setHDLod(0);
  } else buildModel(mb, key);
  const g = mb.build();
  const bb = g.base.boundingBox!;
  let h = bb.max.y;
  if (g.team?.boundingBox) h = Math.max(h, g.team.boundingBox.max.y);
  if (rig) {
    // rigged models: height of the rest pose, ignoring hidden tagged items
    const pos = g.base.getAttribute('position'), tag = g.base.getAttribute('aTag');
    h = 0;
    for (let i = 0; i < pos.count; i++) if (tag.getX(i) === 0) h = Math.max(h, pos.getY(i));
  }
  m = { base: g.base, team: g.team, height: h, rig };
  cache.set(cacheKey, m);
  return m;
}

// ---------------------------------------------------------------- palette
const C = {
  skin: '#e2ae86', skin2: '#b9805a', hair: '#4a3222', blond: '#caa45c', grey: '#9a9a9a',
  linen: '#d9ccab', cloth: '#8a6a45', brown: '#6e4c2e', leather: '#6b4a2b', boot: '#3e2c1e',
  metal: '#a8b0b8', dmetal: '#646b73', gold: '#e8b830', wood: '#8b5a2b', dwood: '#5a3a1e', plank: '#a87842',
  straw: '#d9b862', thatch: '#c39a48', stone: '#aaa59b', dstone: '#827c72', plaster: '#ebe2cd', red: '#b6402f',
  white: '#f2efe8', black: '#2b2b2e', leaf: '#4c8a2c', leaf2: '#3a7424', leaf3: '#5d9c34', pine: '#2f6236', pine2: '#3c7440',
  trunk: '#6b4a2d', soil: '#6d4a2e', soil2: '#5b3d25', wheat: '#d8b851', green: '#6aa83a', sheep: '#f0ece2', deer: '#a0683a',
  boar: '#4a3a30', wolf: '#7d7d80', horse: '#8a5a32', horse2: '#5e3d22', horse3: '#d9c9a8', camel: '#c9a36a', ele: '#8f8f8f',
  rope: '#c7b07a', team: '#ffffff', teamD: '#cfcfcf', glow: '#ffb347', water: '#3a7ca5',
};

// ---------------------------------------------------------------- siege & ships (people and animals are rigged: see people.ts)

function wheels(mb: MB, xs: number[], z: number, r: number) {
  for (const x of xs) for (const s of [-1, 1]) {
    mb.cyl(r, r, 0.05, 8, C.dwood, x, r, z * s, { rx: Math.PI / 2 });
    mb.cyl(r * 0.3, r * 0.3, 0.07, 6, C.dmetal, x, r, z * s, { rx: Math.PI / 2 });
  }
}

function siege(mb: MB, t: string, pose: string, variant: string) {
  switch (t) {
    case 'battering_ram': case 'capped_ram': {
      wheels(mb, [-0.3, 0.3], 0.3, 0.12);
      mb.boxB(0.9, 0.12, 0.5, C.dwood, 0, 0.12, 0);
      mb.gable(0.95, 0.66, 0.42, t === 'capped_ram' ? C.dmetal : C.wood, 0, 0.42, 0);
      mb.box(0.92, 0.32, 0.04, C.plank, 0, 0.36, 0.3);
      mb.box(0.92, 0.32, 0.04, C.plank, 0, 0.36, -0.3);
      const off = pose === 'atk1' ? -0.15 : pose === 'atk2' ? 0.18 : 0;
      mb.cyl(0.07, 0.07, 1.0, 7, C.trunk, 0.15 + off, 0.36, 0, { rz: Math.PI / 2 });
      mb.cyl(0.1, 0.1, 0.12, 7, C.dmetal, 0.66 + off, 0.36, 0, { rz: Math.PI / 2 });
      mb.box(0.3, 0.06, 0.52, C.team, -0.2, 0.66, 0, { team: true });
      break;
    }
    case 'mangonel': case 'onager': {
      wheels(mb, [-0.28, 0.28], 0.26, 0.1);
      mb.boxB(0.8, 0.1, 0.42, C.dwood, 0, 0.12, 0);
      mb.boxB(0.08, 0.38, 0.08, C.wood, 0.1, 0.2, 0.17);
      mb.boxB(0.08, 0.38, 0.08, C.wood, 0.1, 0.2, -0.17);
      mb.box(0.1, 0.06, 0.42, C.wood, 0.1, 0.56, 0);
      const ang = pose === 'atk2' ? 1.3 : 0.2;
      mb.push(-0.05, 0.28, 0, 0, 0, ang);
      mb.box(0.75, 0.05, 0.05, C.wood, -0.35, 0, 0);
      mb.cyl(0.09, 0.07, 0.07, 7, C.dwood, -0.72, 0.03, 0);
      if (pose !== 'atk2') mb.ball(0.06, C.dstone, -0.72, 0.08, 0);
      mb.pop();
      mb.box(0.2, 0.05, 0.44, C.team, -0.28, 0.2, 0, { team: true });
      if (t === 'onager') mb.box(0.82, 0.04, 0.04, C.dmetal, 0, 0.2, 0.22);
      break;
    }
    case 'scorpion': case 'heavy_scorpion': {
      mb.boxB(0.06, 0.32, 0.06, C.wood, -0.1, 0, 0.15, { rx: -0.3 });
      mb.boxB(0.06, 0.32, 0.06, C.wood, -0.1, 0, -0.15, { rx: 0.3 });
      mb.boxB(0.06, 0.32, 0.06, C.wood, 0.15, 0, 0, { rz: 0.3 });
      mb.box(0.7, 0.07, 0.1, C.wood, 0.05, 0.36, 0);
      mb.box(0.06, 0.06, 0.6, t === 'heavy_scorpion' ? C.dmetal : C.dwood, 0.25, 0.38, 0);
      if (pose !== 'atk2') mb.box(0.5, 0.025, 0.025, C.metal, 0.15, 0.42, 0);
      mb.box(0.2, 0.08, 0.14, C.team, -0.15, 0.36, 0, { team: true });
      break;
    }
    case 'trebuchet': {
      if (variant === 'packed') {
        wheels(mb, [-0.45, 0.45], 0.3, 0.14);
        mb.boxB(1.3, 0.12, 0.5, C.dwood, 0, 0.14, 0);
        mb.box(1.5, 0.08, 0.08, C.wood, 0.05, 0.36, 0);
        mb.box(0.4, 0.25, 0.4, C.dstone, -0.4, 0.4, 0);
        mb.box(0.3, 0.08, 0.52, C.team, 0.3, 0.3, 0, { team: true });
      } else {
        mb.boxB(1.4, 0.12, 0.9, C.dwood, 0, 0, 0);
        for (const s of [-1, 1]) {
          mb.boxB(0.08, 1.2, 0.08, C.wood, -0.25, 0.1, 0.35 * s, { rz: -0.15 });
          mb.boxB(0.08, 1.2, 0.08, C.wood, 0.25, 0.1, 0.35 * s, { rz: 0.15 });
        }
        mb.box(0.1, 0.1, 0.8, C.wood, 0, 1.25, 0);
        const ang = pose === 'atk2' ? -1.0 : pose === 'atk1' ? 0.75 : 0.75;
        mb.push(0, 1.25, 0, 0, 0, ang);
        mb.box(2.0, 0.07, 0.07, C.wood, -0.45, 0, 0);
        mb.box(0.36, 0.36, 0.36, C.dstone, 0.5, -0.25, 0);
        mb.box(0.36, 0.06, 0.38, C.team, 0.5, -0.04, 0, { team: true });
        mb.pop();
      }
      break;
    }
    case 'bombard_cannon': {
      wheels(mb, [0], 0.24, 0.17);
      mb.box(0.7, 0.06, 0.16, C.dwood, -0.15, 0.14, 0, { rz: 0.15 });
      const kick = pose === 'atk2' ? -0.08 : 0;
      mb.cyl(0.08, 0.1, 0.8, 8, '#4a4f55', 0.15 + kick, 0.3, 0, { rz: Math.PI / 2 - 0.08 });
      mb.cyl(0.11, 0.11, 0.06, 8, C.gold, 0.53 + kick, 0.33, 0, { rz: Math.PI / 2 });
      mb.box(0.14, 0.06, 0.18, C.team, -0.3, 0.2, 0, { team: true });
      break;
    }
  }
  if (mb.realistic) detailSiege(mb, t, variant);
}

function hullGeo(L: number, W: number, h: number, taper: number, segments = 4): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const w = (W / 2) * taper;
  sh.moveTo(-L / 2, -w * 0.8);
  sh.quadraticCurveTo(-L / 2 - 0.06, 0, -L / 2, w * 0.8);
  sh.lineTo(L * 0.12, w);
  sh.quadraticCurveTo(L * 0.4, w * 0.85, L / 2, 0);
  sh.quadraticCurveTo(L * 0.4, -w * 0.85, L * 0.12, -w);
  sh.lineTo(-L / 2, -w * 0.8);
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: segments });
  g.rotateX(-Math.PI / 2);
  return g;
}

function ship(mb: MB, t: string, pose: string) {
  const L = t === 'fishing_ship' ? 1.0 : t === 'transport_ship' ? 1.3 : t === 'galleon' || t === 'cannon_galleon' ? 1.6 : 1.4;
  const W = t === 'transport_ship' ? 0.62 : t === 'fishing_ship' ? 0.42 : 0.5;
  const hullC = t === 'galleon' || t === 'cannon_galleon' ? '#5a3a22' : C.wood;
  // hull: narrow keel, wider upper hull, deck, rails
  mb.add(hullGeo(L * 0.9, W, 0.14, 0.62, mb.realistic ? 16 : 4), C.dwood, 0, -0.06, 0);
  mb.add(hullGeo(L, W, 0.2, 1, mb.realistic ? 16 : 4), hullC, 0, 0.06, 0);
  mb.add(hullGeo(L * 0.92, W, 0.02, 0.86, mb.realistic ? 16 : 4), C.plank, 0, 0.255, 0);
  mb.add(hullGeo(L * 1.01, W, 0.05, 1.02, mb.realistic ? 16 : 4), C.team, 0, 0.09, 0, { team: true });
  mb.box(0.04, 0.05, W * 0.78, C.dwood, -L * 0.48, 0.3, 0);
  mb.box(L * 0.2, 0.18, W * 0.72, C.plank, -L * 0.34, 0.36, 0);
  mb.box(L * 0.22, 0.03, W * 0.78, C.dwood, -L * 0.34, 0.46, 0);
  mb.box(0.2, 0.025, 0.025, C.dwood, L * 0.55, 0.3, 0, { rz: 0.35 });
  const sail = (x: number, h: number, w: number) => {
    mb.cyl(0.025, 0.03, h, 5, C.dwood, x, 0.25 + h / 2, 0);
    if (mb.realistic) {
      const cloth = new THREE.PlaneGeometry(w, h * 0.6, 8, 6);
      cloth.rotateY(Math.PI / 2);
      const positions = cloth.getAttribute('position');
      for (let i = 0; i < positions.count; i++) positions.setX(i, 0.1 * Math.sin((positions.getZ(i) / w + 0.5) * Math.PI) * Math.cos(positions.getY(i) / h * 2));
      cloth.computeVertexNormals();
      mb.add(cloth, '#d8cfb9', x + 0.03, 0.25 + h * 0.55, 0, { surface: 'cloth' });
      cloth.scale(-1, 1, -1);
      mb.add(cloth, '#d8cfb9', x + 0.035, 0.25 + h * 0.55, 0, { surface: 'cloth' });
      cloth.dispose();
      mb.box(0.012, h * 0.35, w * 0.12, C.team, x + 0.135, 0.25 + h * 0.55, 0, { team: true });
      mb.box(0.012, h * 0.05, w * 0.36, C.team, x + 0.136, 0.25 + h * 0.58, 0, { team: true });
    } else mb.box(0.03, h * 0.6, w, C.team, x + 0.03, 0.25 + h * 0.55, 0, { team: true });
    mb.box(0.04, 0.03, w + 0.06, C.dwood, x + 0.03, 0.25 + h * 0.86, 0);
  };
  switch (t) {
    case 'fishing_ship':
      sail(0.05, 0.6, 0.4);
      mb.box(0.2, 0.04, 0.2, '#b8a77a', -0.25, 0.28, 0.08);
      mb.box(0.5, 0.012, 0.012, C.wood, 0.25, 0.42, 0.28, { rx: -0.4 });
      break;
    case 'transport_ship':
      sail(0.0, 0.8, 0.55);
      for (let i = 0; i < 3; i++) mb.box(0.12, 0.1, 0.12, C.plank, -0.3 + i * 0.25, 0.3, 0.12 * (i % 2 ? 1 : -1));
      break;
    case 'galley': case 'war_galley': case 'fire_galley':
      sail(0.05, 0.85, 0.6);
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) mb.box(0.03, 0.03, 0.32, C.wood, -0.35 + i * 0.17, 0.16, (W / 2 + 0.12) * s, { rx: 0.4 * s, ry: pose === 'walk1' ? 0.3 : pose === 'walk2' ? -0.3 : 0 });
      if (t === 'war_galley') sail(-0.4, 0.6, 0.45);
      if (t === 'fire_galley') { mb.cyl(0.08, 0.05, 0.12, 6, C.dmetal, L * 0.42, 0.34, 0); mb.ball(0.07, '#ff7a1c', L * 0.42, 0.45, 0); }
      break;
    case 'galleon': case 'cannon_galleon':
      sail(0.3, 1.0, 0.65);
      sail(-0.25, 0.8, 0.55);
      mb.box(0.3, 0.2, W * 0.9, '#6b4428', -L * 0.38, 0.42, 0);
      if (t === 'cannon_galleon') for (let i = 0; i < 3; i++) for (const s of [-1, 1]) mb.cyl(0.03, 0.035, 0.14, 6, C.black, -0.2 + i * 0.25, 0.2, (W / 2 + 0.04) * s, { rx: Math.PI / 2 });
      break;
  }
  if (mb.realistic) detailShip(mb, L, W);
}

function buildUnit(mb: MB, t: string, pose: string, variant: string) {
  const naval = ['fishing_ship', 'transport_ship', 'galley', 'war_galley', 'galleon', 'fire_galley', 'cannon_galleon', 'trade_cog'];
  if (naval.includes(t)) {
    if (pose === 'dead') { mb.push(0, -0.25, 0, 0.6, 0, 0.3); ship(mb, t, 'idle'); mb.pop(); return; }
    return ship(mb, t, pose);
  }
  if (pose === 'dead') { mb.push(0, -0.05, 0, 0.35, 0, 0.2); siege(mb, t, 'idle', variant); mb.pop(); return; }
  return siege(mb, t, pose, variant);
}

// ---------------------------------------------------------------- buildings

interface Style { wall: Col; wall2: Col; roof: Col; roof2: Col; trim: Col; base: Col; win: Col }
const STYLES: Style[] = [
  { wall: '#9c7247', wall2: '#6e4c2c', roof: '#c9a04d', roof2: '#a8813b', trim: '#5a3b20', base: '#7d7366', win: '#2a2018' },
  { wall: '#9c7247', wall2: '#6e4c2c', roof: '#c9a04d', roof2: '#a8813b', trim: '#5a3b20', base: '#7d7366', win: '#2a2018' },
  { wall: '#e8dcc0', wall2: '#6e4a2a', roof: '#8e5a34', roof2: '#6e4428', trim: '#5a3b20', base: '#8f877a', win: '#2a2018' },
  { wall: '#d4ccb9', wall2: '#9d968a', roof: '#b0503a', roof2: '#8f3d2c', trim: '#6b625a', base: '#8a8378', win: '#30353f' },
  { wall: '#ece6da', wall2: '#b0a898', roof: '#3f5f8a', roof2: '#2f4a6e', trim: '#d4a83a', base: '#9a9284', win: '#2e3f5a' },
];

function plinth(mb: MB, w: number, d: number, st: Style, h = 0.12) {
  mb.box(w, h + 0.5, d, st.base, 0, h / 2 - 0.25, 0);
}

function windows(mb: MB, w: number, d: number, y: number, st: Style, n = 2, side = true) {
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * (d / (n + 0.5));
    mb.box(0.03, 0.14, 0.1, st.win, w / 2 + 0.005, y, z);
    if (mb.realistic) {
      // Lintels, projecting sills, mullions and open wooden shutters.
      for (const dy of [-0.085, 0.085]) mb.box(0.065, 0.024, 0.15, st.trim, w / 2 + 0.015, y + dy, z, { surface: 'wood' });
      mb.box(0.042, 0.145, 0.009, st.trim, w / 2 + 0.023, y, z, { surface: 'wood' });
      for (const s of [-1, 1]) mb.box(0.028, 0.14, 0.062, st.wall2, w / 2 + 0.036, y, z + s * 0.11, { ry: s * 0.22, surface: 'wood' });
    }
    if (side) {
      const x = (i - (n - 1) / 2) * (w / (n + 0.5));
      mb.box(0.1, 0.14, 0.03, st.win, x, y, d / 2 + 0.005);
      if (mb.realistic) {
        for (const dy of [-0.085, 0.085]) mb.box(0.15, 0.024, 0.065, st.trim, x, y + dy, d / 2 + 0.015, { surface: 'wood' });
        mb.box(0.009, 0.145, 0.042, st.trim, x, y, d / 2 + 0.023, { surface: 'wood' });
      }
    }
  }
}

function timber(mb: MB, w: number, h: number, d: number, y0: number, st: Style) {
  for (const s of [-1, 1]) {
    mb.box(w + 0.02, 0.04, 0.03, st.wall2, 0, y0 + h - 0.02, (d / 2) * s);
    mb.box(0.03, 0.04, d + 0.02, st.wall2, (w / 2) * s, y0 + h - 0.02, 0);
    mb.box(0.04, h, 0.04, st.wall2, (w / 2) * s, y0 + h / 2, (d / 2));
    mb.box(0.04, h, 0.04, st.wall2, (w / 2) * s, y0 + h / 2, -(d / 2));
  }
  mb.box(0.03, h * 0.9, 0.03, st.wall2, w / 2 + 0.01, y0 + h / 2, 0, { rx: 0.7 });
  mb.box(0.03, h * 0.9, 0.03, st.wall2, 0, y0 + h / 2, d / 2 + 0.01, { rz: 0.7 });
}

function house(mb: MB, w: number, d: number, h: number, st: Style, tier: number, roofH = 0.6, x = 0, z = 0, y = 0) {
  mb.push(x, y, z);
  mb.boxB(w, h, d, st.wall, 0, 0, 0);
  if (tier === 2) timber(mb, w, h, d, 0, st);
  if (tier >= 3) mb.boxB(w + 0.04, h * 0.35, d + 0.04, st.wall2, 0, 0, 0);
  if (tier === 1) for (let i = 0; i < 4; i++) mb.box(w + 0.01, 0.02, d + 0.01, st.wall2, 0, h * (0.2 + i * 0.22), 0);
  mb.gable(w + 0.18, d + 0.18, roofH, st.roof, 0, h, 0);
  mb.box(w + 0.2, 0.04, 0.06, st.roof2, 0, h + roofH - 0.01, 0);
  mb.box(0.03, 0.26, 0.16, st.win, w / 2 + 0.005, 0.13, 0);
  if (mb.realistic) {
    for (const side of [-1, 1]) mb.boxB(0.05, 0.28, 0.023, st.trim, w / 2 + 0.027, 0, side * 0.09, { surface: 'wood' });
    mb.box(0.05, 0.025, 0.22, st.trim, w / 2 + 0.027, 0.28, 0, { surface: 'wood' });
    mb.box(0.2, 0.04, 0.26, st.base, w / 2 + 0.08, 0.02, 0, { surface: 'stone' });
    mb.box(0.023, 0.024, 0.02, '#98927d', w / 2 + 0.03, 0.13, 0.04, { surface: 'metal' });
    if (tier <= 2) {
      mb.boxB(0.2, 0.42, 0.22, st.base, -w * 0.25, h + roofH * 0.4, -d * 0.15, { surface: 'stone' });
      mb.box(0.26, 0.04, 0.27, st.base, -w * 0.25, h + roofH * 0.4 + 0.42, -d * 0.15, { surface: 'stone' });
    }
  }
  windows(mb, w, d, h * 0.65, st, 1, true);
  mb.pop();
}

function banner(mb: MB, x: number, y: number, z: number, h = 0.7, w = 0.3) {
  mb.cylB(0.018, 0.022, h, 5, C.dwood, x, y, z);
  mb.box(w, w * 0.65, 0.02, C.team, x + w / 2, y + h - w * 0.35, z, { team: true });
  mb.ball(0.03, C.gold, x, y + h + 0.02, z);
}

function crenels(mb: MB, w: number, d: number, y: number, col: Col, size = 0.12) {
  const n = Math.max(2, Math.round(w / (size * 2.2)));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    mb.boxB(size, size, size, col, t * w, y, d / 2 - size / 2);
    mb.boxB(size, size, size, col, t * w, y, -d / 2 + size / 2);
  }
  const m = Math.max(2, Math.round(d / (size * 2.2)));
  for (let i = 0; i < m; i++) {
    const t = (i + 0.5) / m - 0.5;
    mb.boxB(size, size, size, col, w / 2 - size / 2, y, t * d);
    mb.boxB(size, size, size, col, -w / 2 + size / 2, y, t * d);
  }
}

function tower(mb: MB, r: number, h: number, st: Style, tier: number, x = 0, z = 0, roof = true) {
  const seg = 8;
  mb.cylB(r, r * 1.08, h, seg, tier >= 3 ? st.wall2 : st.wall, x, 0, z);
  if (roof) {
    mb.coneB(r * 1.35, r * 2.2, seg, st.roof, x, h, z);
    mb.ball(0.04, C.gold, x, h + r * 2.2, z);
  } else {
    mb.cylB(r * 1.12, r * 1.12, 0.1, seg, st.wall2, x, h, z);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mb.boxB(0.1, 0.12, 0.1, st.wall2, x + Math.cos(a) * r, h + 0.1, z + Math.sin(a) * r); }
  }
  mb.box(0.03, 0.16, 0.08, st.win, x + r + 0.01, h * 0.7, z);
}

function buildBuilding(mb: MB, t: string, tier: number, variant = 0) {
  if (mb.realistic && hdBuilding(mb, t, tier, variant)) return;
  const st = STYLES[tier];
  const stone = tier >= 3;
  if (mb.realistic) {
    mb.surfaces.set(st.wall, tier === 1 ? 'wood' : 'plaster');
    mb.surfaces.set(st.wall2, tier <= 2 ? 'wood' : 'stone');
    mb.surfaces.set(st.roof, tier === 1 ? 'thatch' : tier === 4 ? 'slate' : 'tile');
    mb.surfaces.set(st.roof2, tier === 1 ? 'thatch' : tier === 4 ? 'slate' : 'tile');
    mb.surfaces.set(st.base, 'stone');
    mb.surfaces.set(st.trim, tier <= 2 ? 'wood' : 'stone');
    mb.surfaces.set(st.win, 'cloth');
  }
  switch (t) {
    case 'town_center': {
      plinth(mb, 3.9, 3.9, st, 0.14);
      mb.boxB(3.5, 0.05, 3.5, '#9c8f7a', 0, 0.14, 0);
      // main hall
      mb.push(0, 0.14, 0);
      mb.boxB(2.5, 1.1, 2.5, st.wall, 0, 0, 0);
      if (tier === 2) timber(mb, 2.5, 1.1, 2.5, 0, st);
      if (stone) { mb.boxB(2.56, 0.4, 2.56, st.wall2, 0, 0, 0); crenels(mb, 2.5, 2.5, 1.1, st.wall2, 0.14); }
      mb.pyramid(stone ? 2.2 : 2.9, stone ? 2.2 : 2.9, 0.9, st.roof, 0, 1.1, 0);
      // central tower
      mb.boxB(1.0, 2.1, 1.0, stone ? st.wall2 : st.wall, 0, 1.0, 0);
      if (tier === 2) timber(mb, 1.0, 1.0, 1.0, 2.1, st);
      mb.box(0.04, 0.3, 0.3, st.win, 0.51, 2.7, 0);
      mb.box(0.3, 0.3, 0.04, st.win, 0, 2.7, 0.51);
      mb.cylB(0.1, 0.12, 0.18, 6, C.gold, 0, 2.6, 0);
      mb.pyramid(1.4, 1.4, 0.8, st.roof2, 0, 3.1, 0);
      banner(mb, 0, 3.85, 0, 0.6, 0.35);
      // door & windows
      mb.boxB(0.04, 0.55, 0.45, st.trim, 1.26, 0, 0);
      mb.boxB(0.04, 0.5, 0.38, '#2a1d12', 1.27, 0, 0);
      windows(mb, 2.5, 2.5, 0.75, st, 3, true);
      mb.pop();
      // corner annexes
      for (const [x, z] of [[1.45, 1.45], [-1.45, 1.45], [1.45, -1.45], [-1.45, -1.45]]) {
        if (stone) tower(mb, 0.36, 1.5, st, tier, x, z, tier === 4);
        else { mb.boxB(0.7, 0.7, 0.7, st.wall, x, 0.14, z); mb.pyramid(0.95, 0.95, 0.5, st.roof, x, 0.84, z); }
      }
      banner(mb, 1.9, 0.14, 1.2, 0.9, 0.3);
      banner(mb, 1.9, 0.14, -1.2, 0.9, 0.3);
      // firewood & barrels
      mb.cylB(0.13, 0.13, 0.25, 7, C.dwood, -1.75, 0.14, 0.4);
      mb.cylB(0.13, 0.13, 0.25, 7, C.dwood, -1.75, 0.14, 0.12);
      break;
    }
    case 'house': {
      plinth(mb, 1.85, 1.85, st, 0.08);
      house(mb, 1.3, 1.1, 0.7, st, tier, 0.62, 0, -0.1, 0.08);
      mb.boxB(0.14, 0.45, 0.14, stone ? st.wall2 : C.dstone, -0.4, 0.75, 0.3);
      // team shutters
      mb.box(0.03, 0.18, 0.05, C.team, 0.66, 0.6, 0.2, { team: true });
      mb.box(0.03, 0.18, 0.05, C.team, 0.66, 0.6, -0.2, { team: true });
      // garden
      mb.boxB(1.2, 0.05, 0.35, C.soil, 0, 0.08, 0.7);
      for (let i = 0; i < 4; i++) mb.ball(0.07, C.leaf3, -0.45 + i * 0.3, 0.17, 0.7);
      break;
    }
    case 'mill': {
      plinth(mb, 1.85, 1.85, st, 0.08);
      mb.cylB(0.55, 0.65, 1.3, 8, stone ? st.wall2 : st.wall, -0.1, 0.08, 0);
      mb.coneB(0.75, 0.6, 8, st.roof, -0.1, 1.38, 0);
      mb.box(0.12, 0.12, 0.12, C.dwood, 0.55, 1.15, 0);
      for (let i = 0; i < 4; i++) {
        mb.push(0.62, 1.15, 0, i * Math.PI / 2 + 0.3, 0, 0);
        mb.box(0.03, 0.85, 0.05, C.dwood, 0, 0.45, 0);
        mb.box(0.02, 0.6, 0.2, C.team, 0.01, 0.5, 0.11, { team: true });
        mb.pop();
      }
      mb.boxB(0.04, 0.4, 0.25, '#2a1d12', 0.52, 0.08, 0.3);
      for (let i = 0; i < 3; i++) mb.cylB(0.1, 0.1, 0.2, 7, C.linen, -0.6 + i * 0.22, 0.08, 0.7);
      break;
    }
    case 'lumber_camp': {
      plinth(mb, 1.85, 1.85, st, 0.05);
      for (const [x, z] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) mb.boxB(0.08, 0.8, 0.08, C.dwood, x, 0.05, z);
      mb.box(1.45, 0.06, 1.45, stone ? st.roof : C.plank, 0, 0.9, 0, { rx: 0.18 });
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) mb.cyl(0.09, 0.09, 1.1, 7, C.trunk, -0.1, 0.15 + i * 0.16, -0.25 + j * 0.18 + i * 0.09, { rz: Math.PI / 2 });
      mb.cylB(0.18, 0.2, 0.22, 8, C.trunk, 0.6, 0.05, 0.75);
      mb.box(0.3, 0.025, 0.025, C.wood, 0.62, 0.38, 0.75, { rz: 1.0 });
      banner(mb, -0.75, 0.05, 0.75, 0.9, 0.25);
      break;
    }
    case 'mining_camp': {
      plinth(mb, 1.85, 1.85, st, 0.05);
      for (const [x, z] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) mb.boxB(0.08, 0.8, 0.08, C.dwood, x, 0.05, z);
      mb.gable(1.5, 1.5, 0.35, stone ? st.roof : C.plank, 0, 0.85, 0);
      mb.boxB(0.5, 0.25, 0.35, C.wood, -0.2, 0.15, 0.1);
      wheelsAt(mb, -0.2, 0.1, 0.1);
      for (let i = 0; i < 5; i++) mb.ball(0.08, i % 2 ? C.gold : C.dstone, -0.35 + i * 0.07, 0.43, 0.1 + (i % 2) * 0.08);
      mb.ball(0.25, C.dstone, 0.4, 0.15, -0.3, {}, 0.6);
      mb.ball(0.15, C.gold, 0.45, 0.25, -0.25, {}, 0.6);
      banner(mb, -0.75, 0.05, 0.75, 0.9, 0.25);
      break;
    }
    case 'farm': {
      mb.boxB(2.92, 0.06, 2.92, C.soil, 0, 0, 0);
      for (let i = 0; i < 7; i++) mb.boxB(2.7, 0.04, 0.16, C.soil2, 0, 0.06, -1.2 + i * 0.4);
      for (const [x, z] of [[1.42, 1.42], [-1.42, 1.42], [1.42, -1.42], [-1.42, -1.42]]) mb.boxB(0.06, 0.25, 0.06, C.dwood, x, 0, z);
      mb.box(2.85, 0.03, 0.03, C.wood, 0, 0.18, 1.42);
      mb.box(2.85, 0.03, 0.03, C.wood, 0, 0.18, -1.42);
      mb.box(0.03, 0.03, 2.85, C.wood, -1.42, 0.18, 0);
      break;
    }
    case 'dock': {
      for (const [x, z] of [[1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3], [0, 1.3], [0, -1.3], [1.3, 0], [-1.3, 0]]) mb.cylB(0.07, 0.07, 1.2, 6, C.dwood, x, -0.9, z);
      mb.boxB(2.9, 0.1, 2.9, C.plank, 0, 0.15, 0);
      for (let i = 0; i < 9; i++) mb.box(0.02, 0.105, 2.9, C.wood, -1.3 + i * 0.32, 0.2, 0);
      house(mb, 1.1, 0.9, 0.6, st, tier, 0.45, -0.65, -0.65, 0.25);
      // crane
      mb.boxB(0.1, 1.3, 0.1, C.dwood, 0.9, 0.25, -0.9);
      mb.box(0.9, 0.07, 0.07, C.dwood, 0.6, 1.5, -0.9, { rz: -0.2 });
      mb.box(0.012, 0.6, 0.012, C.rope, 0.2, 1.2, -0.9);
      mb.box(0.18, 0.15, 0.18, C.plank, 0.2, 0.86, -0.9);
      for (let i = 0; i < 3; i++) mb.cylB(0.1, 0.1, 0.22, 7, C.dwood, 0.6 + i * 0.25, 0.25, 0.9);
      banner(mb, 1.25, 0.25, 1.25, 1.1, 0.4);
      break;
    }
    case 'barracks': {
      plinth(mb, 2.85, 2.85, st, 0.1);
      house(mb, 2.3, 1.4, 0.95, st, tier, 0.75, -0.1, -0.5, 0.1);
      if (stone) crenels(mb, 1.0, 1.0, 1.5, st.wall2, 0.1);
      // yard
      mb.boxB(1.0, 0.03, 0.8, '#a08a64', 0.3, 0.1, 0.85);
      mb.boxB(0.05, 0.5, 0.05, C.dwood, 0.75, 0.1, 0.9);
      mb.box(0.25, 0.04, 0.04, C.dwood, 0.75, 0.48, 0.9);
      mb.ball(0.08, C.straw, 0.75, 0.62, 0.9);
      for (let i = 0; i < 4; i++) mb.box(0.02, 0.6, 0.02, C.wood, -0.9 + i * 0.12, 0.42, 0.35, { rz: 0.15 });
      mb.cone(0.03, 0.08, 4, C.metal, -0.86, 0.76, 0.35);
      banner(mb, 1.2, 0.1, -1.2, 1.3, 0.4);
      banner(mb, -1.25, 0.1, 1.2, 1.0, 0.32);
      break;
    }
    case 'archery_range': {
      plinth(mb, 2.85, 2.85, st, 0.1);
      house(mb, 1.5, 2.2, 0.9, st, tier, 0.6, -0.6, -0.2, 0.1);
      for (let i = 0; i < 2; i++) {
        mb.boxB(0.04, 0.4, 0.04, C.dwood, 0.9, 0.1, -0.6 + i * 0.9);
        mb.cyl(0.24, 0.24, 0.12, 10, C.straw, 0.95, 0.55, -0.6 + i * 0.9, { rz: Math.PI / 2 });
        mb.cyl(0.16, 0.16, 0.13, 10, C.white, 0.95, 0.55, -0.6 + i * 0.9, { rz: Math.PI / 2 });
        mb.cyl(0.07, 0.07, 0.14, 8, C.red, 0.95, 0.55, -0.6 + i * 0.9, { rz: Math.PI / 2 });
      }
      banner(mb, 1.2, 0.1, 1.15, 1.2, 0.35);
      break;
    }
    case 'stable': {
      plinth(mb, 2.85, 2.85, st, 0.1);
      mb.push(-0.3, 0.1, -0.3);
      mb.boxB(2.0, 0.85, 1.6, st.wall, 0, 0, 0);
      if (tier === 2) timber(mb, 2.0, 0.85, 1.6, 0, st);
      mb.gable(2.2, 1.85, 0.8, st.roof, 0, 0.85, 0);
      mb.boxB(0.04, 0.6, 0.6, st.trim, 1.01, 0, 0);
      mb.box(0.05, 0.6, 0.04, st.wall2, 1.03, 0.3, 0, { rx: 0.75 });
      mb.box(0.05, 0.6, 0.04, st.wall2, 1.03, 0.3, 0, { rx: -0.75 });
      mb.pop();
      for (let i = 0; i < 5; i++) mb.boxB(0.05, 0.35, 0.05, C.dwood, 1.2, 0.1, -1.2 + i * 0.6);
      mb.box(0.03, 0.04, 2.5, C.wood, 1.2, 0.35, 0);
      mb.box(0.03, 0.04, 2.5, C.wood, 1.2, 0.22, 0);
      mb.boxB(0.35, 0.25, 0.25, C.straw, 0.6, 0.1, 1.0);
      mb.boxB(0.35, 0.25, 0.25, C.straw, 0.3, 0.1, 1.15);
      banner(mb, -1.2, 0.1, 1.2, 1.2, 0.35);
      break;
    }
    case 'blacksmith': {
      plinth(mb, 2.85, 2.85, st, 0.1);
      house(mb, 1.9, 1.5, 0.9, st, tier, 0.65, -0.3, -0.3, 0.1);
      mb.boxB(0.35, 1.9, 0.35, stone ? st.wall2 : C.dstone, -0.9, 0.1, 0.35);
      mb.boxB(0.6, 0.35, 0.5, C.dstone, 0.75, 0.1, 0.75);
      mb.box(0.3, 0.06, 0.3, C.glow, 0.75, 0.47, 0.75);
      mb.boxB(0.25, 0.22, 0.12, C.dmetal, 0.2, 0.1, 0.9);
      mb.box(0.32, 0.05, 0.14, C.dmetal, 0.2, 0.34, 0.9);
      banner(mb, 1.2, 0.1, -1.2, 1.1, 0.35);
      break;
    }
    case 'market': {
      plinth(mb, 2.85, 2.85, st, 0.06);
      house(mb, 1.3, 1.1, 0.8, st, tier, 0.55, -0.7, -0.7, 0.06);
      const awn = [C.team, '#d8a73a', '#5a8f4a', C.team];
      for (let i = 0; i < 3; i++) {
        const x = 0.75, z = -0.9 + i * 0.85;
        for (const [dx, dz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) mb.boxB(0.04, 0.6, 0.04, C.dwood, x + dx, 0.06, z + dz);
        mb.box(0.75, 0.04, 0.75, awn[i], x, 0.7, z, { team: i !== 1 && i !== 2, rz: 0.15 });
        mb.boxB(0.55, 0.25, 0.3, C.plank, x, 0.06, z);
        mb.ball(0.06, i === 0 ? C.red : i === 1 ? C.gold : C.green, x - 0.1, 0.36, z);
        mb.ball(0.06, '#e07a2a', x + 0.1, 0.36, z);
      }
      for (let i = 0; i < 3; i++) mb.cylB(0.11, 0.11, 0.25, 7, C.dwood, -0.9 + i * 0.25, 0.06, 0.9);
      mb.boxB(0.3, 0.3, 0.3, C.plank, -0.2, 0.06, 1.0);
      break;
    }
    case 'monastery': {
      plinth(mb, 2.85, 2.85, st, 0.1);
      mb.push(-0.2, 0.1, 0);
      mb.boxB(2.0, 1.05, 1.1, st.wall, 0, 0, 0);
      mb.gable(2.1, 1.3, 0.75, st.roof, 0, 1.05, 0);
      for (let i = 0; i < 3; i++) { mb.box(0.12, 0.35, 0.03, '#3b6fb0', -0.6 + i * 0.6, 0.6, 0.56); mb.box(0.12, 0.35, 0.03, '#3b6fb0', -0.6 + i * 0.6, 0.6, -0.56); }
      mb.boxB(0.04, 0.6, 0.35, st.trim, 1.01, 0, 0);
      mb.pop();
      mb.boxB(0.7, 2.0, 0.7, st.wall2, -1.0, 0.1, 0.9);
      mb.box(0.04, 0.3, 0.2, C.black, -0.64, 1.75, 0.9);
      mb.coneB(0.55, 0.9, 4, st.roof2, -1.0, 2.1, 0.9, { ry: Math.PI / 4 });
      mb.boxB(0.04, 0.3, 0.04, C.gold, -1.0, 3.0, 0.9);
      mb.box(0.04, 0.04, 0.18, C.gold, -1.0, 3.2, 0.9);
      mb.boxB(0.5, 0.03, 0.5, '#7a9a4a', 0.8, 0.1, 1.0);
      banner(mb, 1.25, 0.1, -1.1, 1.0, 0.3);
      break;
    }
    case 'university': {
      plinth(mb, 2.85, 2.85, st, 0.12);
      mb.boxB(2.3, 1.0, 2.0, st.wall, 0, 0.12, 0);
      for (let i = 0; i < 5; i++) mb.cylB(0.07, 0.07, 1.0, 6, C.white, 1.25, 0.12, -0.8 + i * 0.4);
      mb.boxB(0.5, 0.1, 2.2, st.wall2, 1.2, 1.12, 0);
      mb.boxB(2.4, 0.12, 2.1, st.wall2, 0, 1.12, 0);
      mb.ball(0.7, st.roof, 0, 1.24, 0, {}, 0.8, 1);
      mb.ball(0.05, C.gold, 0, 1.85, 0);
      banner(mb, -1.2, 0.12, 1.2, 1.4, 0.35);
      break;
    }
    case 'siege_workshop': {
      plinth(mb, 2.85, 2.85, st, 0.1);
      for (const [x, z] of [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2], [0, 1.2], [0, -1.2]]) mb.boxB(0.12, 1.1, 0.12, C.dwood, x, 0.1, z);
      mb.gable(2.7, 2.7, 0.7, st.roof, 0, 1.2, 0);
      mb.boxB(2.5, 0.6, 0.05, st.wall, 0, 0.1, -1.2);
      wheelsAt(mb, 0.3, 0.3, 0.25);
      mb.box(1.0, 0.06, 0.06, C.wood, 0.0, 0.7, 0.3, { rz: 0.4 });
      mb.boxB(0.6, 0.15, 0.4, C.wood, 0.3, 0.3, 0.3);
      banner(mb, 1.3, 0.1, 1.3, 1.3, 0.35);
      break;
    }
    case 'castle': {
      const S = 3.8;
      plinth(mb, S, S, st, 0.15);
      mb.boxB(3.0, 1.4, 3.0, st.wall2, 0, 0.15, 0);
      crenels(mb, 3.0, 3.0, 1.55, st.wall2, 0.16);
      for (const [x, z] of [[1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]]) {
        mb.cylB(0.5, 0.55, 2.0, 8, st.wall2, x, 0.15, z);
        mb.cylB(0.56, 0.56, 0.12, 8, st.base, x, 2.15, z);
        mb.coneB(0.62, 0.9, 8, st.roof, x, 2.27, z);
        mb.box(0.25, 0.18, 0.02, C.team, x + 0.3, 2.5, z, { team: true, ry: Math.PI / 2 });
      }
      mb.boxB(1.5, 2.6, 1.5, st.wall, 0, 0.15, 0);
      crenels(mb, 1.5, 1.5, 2.75, st.wall, 0.14);
      mb.pyramid(1.3, 1.3, 0.9, st.roof2, 0, 2.75, 0);
      banner(mb, 0, 3.6, 0, 0.8, 0.5);
      mb.boxB(0.06, 0.8, 0.7, '#3a2a1c', 1.51, 0.15, 0);
      mb.box(0.08, 0.8, 0.9, st.base, 1.52, 1.0, 0);
      mb.box(0.05, 0.9, 0.5, C.team, 1.53, 1.0, 0.9, { team: true });
      mb.box(0.05, 0.9, 0.5, C.team, 1.53, 1.0, -0.9, { team: true });
      break;
    }
    case 'wonder': {
      plinth(mb, 4.9, 4.9, st, 0.2);
      mb.boxB(4.4, 0.5, 4.4, '#d8cfb8', 0, 0.2, 0);
      mb.boxB(3.6, 1.2, 3.6, '#ece4d0', 0, 0.7, 0);
      for (let i = 0; i < 6; i++) { mb.cylB(0.09, 0.09, 1.2, 6, C.white, 1.85, 0.7, -1.5 + i * 0.6); mb.cylB(0.09, 0.09, 1.2, 6, C.white, -1.5 + i * 0.6, 0.7, 1.85); }
      mb.boxB(2.6, 0.9, 2.6, '#e0d6bf', 0, 1.9, 0);
      mb.ball(1.15, C.gold, 0, 2.8, 0, {}, 0.95, 1);
      mb.cylB(0.05, 0.05, 0.6, 5, C.gold, 0, 3.8, 0);
      for (const [x, z] of [[2.0, 2.0], [-2.0, 2.0], [2.0, -2.0], [-2.0, -2.0]]) {
        mb.cylB(0.22, 0.26, 3.2, 8, '#ece4d0', x, 0.2, z);
        mb.coneB(0.3, 0.8, 8, C.gold, x, 3.4, z);
      }
      mb.box(0.06, 1.0, 1.2, C.team, 1.82, 1.3, 0, { team: true });
      mb.box(1.2, 1.0, 0.06, C.team, 0, 1.3, 1.82, { team: true });
      break;
    }
    case 'watch_tower': {
      plinth(mb, 0.98, 0.98, st, 0.06);
      if (tier <= 2) {
        mb.boxB(0.7, 0.7, 0.7, C.dstone, 0, 0.06, 0);
        for (const [x, z] of [[0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]]) mb.boxB(0.08, 1.5, 0.08, C.dwood, x, 0.7, z);
        mb.boxB(0.85, 0.08, 0.85, C.plank, 0, 2.0, 0);
        mb.boxB(0.85, 0.3, 0.04, C.plank, 0, 2.08, 0.41);
        mb.boxB(0.85, 0.3, 0.04, C.plank, 0, 2.08, -0.41);
        mb.boxB(0.04, 0.3, 0.85, C.plank, 0.41, 2.08, 0);
        mb.pyramid(0.95, 0.95, 0.45, st.roof, 0, 2.4, 0);
        banner(mb, 0, 2.85, 0, 0.4, 0.22);
      } else {
        const h = tier === 4 ? 2.9 : 2.5;
        mb.cylB(0.38, 0.44, h, 8, st.wall2, 0, 0.06, 0);
        mb.cylB(0.46, 0.46, 0.1, 8, st.base, 0, h, 0);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mb.boxB(0.1, 0.14, 0.1, st.wall2, Math.cos(a) * 0.4, h + 0.1, Math.sin(a) * 0.4); }
        mb.coneB(0.45, 0.7, 8, st.roof, 0, h + 0.24, 0);
        mb.box(0.03, 0.2, 0.08, st.win, 0.43, h * 0.65, 0);
        banner(mb, 0, h + 0.9, 0, 0.35, 0.22);
      }
      break;
    }
    case 'outpost': {
      for (const [x, z] of [[0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [-0.25, -0.25]]) mb.boxB(0.07, 1.3, 0.07, C.dwood, x, 0, z, { rx: z * 0.15, rz: -x * 0.15 });
      mb.boxB(0.6, 0.06, 0.6, C.plank, 0, 1.3, 0);
      mb.boxB(0.06, 0.3, 0.06, C.dwood, 0.2, 1.36, 0.2);
      mb.ball(0.07, C.glow, 0.2, 1.72, 0.2);
      banner(mb, -0.2, 1.36, -0.2, 0.45, 0.2);
      break;
    }
    case 'palisade_wall': {
      for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25], [0, 0]]) {
        mb.cylB(0.13, 0.14, 0.8, 6, C.trunk, x, -0.1, z);
        mb.coneB(0.13, 0.2, 6, '#7b5a3a', x, 0.7, z);
      }
      mb.box(1.0, 0.06, 0.06, C.dwood, 0, 0.45, 0);
      mb.box(0.06, 0.06, 1.0, C.dwood, 0, 0.45, 0);
      break;
    }
    case 'stone_wall': {
      mb.boxB(1.0, 1.0, 1.0, st.wall2, 0, -0.2, 0);
      mb.boxB(1.04, 0.15, 1.04, st.base, 0, -0.2, 0);
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) mb.boxB(0.22, 0.2, 0.22, st.wall2, x, 0.8, z);
      break;
    }
    case 'gate': {
      for (const s of [-1, 1]) {
        mb.boxB(1.0, 1.4, 0.32, st.wall2, 0, -0.2, 0.34 * s);
        crenels(mb, 1.0, 0.32, 1.2, st.wall2, 0.12);
      }
      mb.boxB(1.0, 0.35, 1.0, st.wall2, 0, 0.85, 0);
      mb.box(1.02, 0.25, 0.4, C.team, 0, 0.75, 0, { team: true });
      mb.boxB(0.06, 0.8, 0.36, '#3a2a1c', 0.3, -0.05, 0);
      break;
    }
    case 'palisade_gate': {
      for (const s of [-1, 1]) {
        mb.cylB(0.15, 0.16, 1.1, 6, C.trunk, 0, -0.1, 0.38 * s);
        mb.coneB(0.15, 0.2, 6, '#7b5a3a', 0, 1.0, 0.38 * s);
      }
      mb.box(0.1, 0.1, 1.0, C.dwood, 0, 0.85, 0);
      mb.box(0.06, 0.18, 0.6, C.team, 0, 0.7, 0, { team: true });
      break;
    }
  }
  if (mb.realistic) detailBuilding(mb, t, tier);
}

function wheelsAt(mb: MB, x: number, z: number, r: number) {
  for (const s of [-1, 1]) mb.cyl(r, r, 0.05, 8, C.dwood, x, r, z + 0.22 * s, { rx: Math.PI / 2 });
}

function foundation(mb: MB, s: number) {
  const w = s - 0.1;
  mb.boxB(w, 0.06, 0.12, C.plank, 0, 0, w / 2 - 0.06);
  mb.boxB(w, 0.06, 0.12, C.plank, 0, 0, -w / 2 + 0.06);
  mb.boxB(0.12, 0.06, w, C.plank, w / 2 - 0.06, 0, 0);
  mb.boxB(0.12, 0.06, w, C.plank, -w / 2 + 0.06, 0, 0);
  mb.boxB(w - 0.2, 0.03, w - 0.2, '#a08a64', 0, 0, 0);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) mb.boxB(0.07, 0.25, 0.07, C.dwood, (x * w) / 2 - x * 0.06, 0, (z * w) / 2 - z * 0.06);
}

function scaffold(mb: MB, s: number, h: number) {
  const w = s / 2 + 0.05;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]) mb.boxB(0.05, h, 0.05, C.wood, x * w, 0, z * w);
  for (let y = 0.4; y < h; y += 0.5) {
    mb.box(s + 0.1, 0.04, 0.04, C.wood, 0, y, w);
    mb.box(s + 0.1, 0.04, 0.04, C.wood, 0, y, -w);
    mb.box(0.04, 0.04, s + 0.1, C.wood, w, y, 0);
    mb.box(0.04, 0.04, s + 0.1, C.wood, -w, y, 0);
  }
}

function rubbleModel(mb: MB, s: number) {
  let seed = s * 13;
  const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  mb.boxB(s * 0.9, 0.04, s * 0.9, '#4a4038', 0, 0, 0);
  for (let i = 0; i < s * s * 3; i++) {
    mb.box(0.12 + r() * 0.2, 0.08 + r() * 0.12, 0.12 + r() * 0.2, r() < 0.5 ? C.dstone : '#3b2f26', (r() - 0.5) * s * 0.8, 0.06, (r() - 0.5) * s * 0.8, { ry: r() * 3 });
  }
}

// ---------------------------------------------------------------- resources

function tree(mb: MB, v: number, biome: string, lod = 0) {
  if (mb.realistic) return realisticTree(mb, v, biome, lod);
  const kind = biome === 'palm' ? (v % 3 === 0 ? 1 : 3) : v % 3;
  const s = 0.85 + ((v * 7) % 10) / 30;
  mb.push(0, 0, 0, 0, (v % 6) * 1.1, 0, s);
  if (kind === 3) {
    mb.cylB(0.06, 0.08, 1.4, 6, '#8a6a42', 0, 0, 0, { rz: 0.12 });
    for (let i = 0; i < 6; i++) mb.box(0.55, 0.03, 0.16, C.leaf, 0.27 * Math.cos(i), 1.4, 0.27 * Math.sin(i), { ry: -i, rz: -0.4 });
  } else if (kind === 0 || kind === 2) {
    // pine
    mb.cylB(0.07, 0.09, 0.4, 6, C.trunk, 0, 0, 0);
    const col = kind === 0 ? C.pine : C.pine2;
    mb.coneB(0.48, 0.65, 7, col, 0, 0.3, 0);
    mb.coneB(0.38, 0.55, 7, col, 0, 0.7, 0);
    mb.coneB(0.26, 0.5, 7, col, 0, 1.05, 0);
  } else {
    // oak
    mb.cylB(0.08, 0.11, 0.7, 6, C.trunk, 0, 0, 0);
    mb.ball(0.42, C.leaf, 0, 0.95, 0, {}, 0.85);
    mb.ball(0.3, C.leaf2, 0.25, 0.85, 0.12);
    mb.ball(0.28, C.leaf3, -0.18, 1.05, -0.15);
    mb.ball(0.25, C.leaf, -0.05, 0.8, 0.28);
  }
  mb.pop();
}

function resource(mb: MB, t: string, v: number) {
  if (mb.realistic && (t === 'gold' || t === 'stone')) { realisticDeposit(mb, t, v); return; }
  switch (t) {
    case 'stump':
      mb.cylB(0.12, 0.14, 0.15, 7, C.trunk, 0, 0, 0);
      mb.cyl(0.08, 0.1, 0.9, 6, C.trunk, 0.25, 0.1, 0.1, { rz: Math.PI / 2, ry: v });
      mb.ball(0.2, C.leaf2, 0.7, 0.15, 0.25, {}, 0.6);
      break;
    case 'berry':
      if (mb.realistic) { realisticDeco(mb, 'berry', v); break; }
      mb.ball(0.32, '#3f7a2a', 0, 0.22, 0, {}, 0.75, 1);
      for (let i = 0; i < 9; i++) mb.ball(0.045, i % 3 ? '#c4283a' : '#7a2a6a', Math.cos(i * 2.4) * 0.28, 0.2 + (i % 3) * 0.08, Math.sin(i * 2.4) * 0.28);
      break;
    case 'gold':
      mb.ball(0.36, '#7a7066', 0, 0.12, 0, { ry: v }, 0.6);
      mb.ball(0.22, '#8a8076', 0.22, 0.1, 0.18, {}, 0.7);
      for (let i = 0; i < 6; i++) mb.ball(0.08 + (i % 3) * 0.02, C.gold, Math.cos(i * 1.7 + v) * 0.24, 0.24 + (i % 2) * 0.06, Math.sin(i * 1.7 + v) * 0.24, { ry: i });
      break;
    case 'stone':
      mb.ball(0.36, '#9c968c', 0, 0.12, 0, { ry: v }, 0.65);
      mb.ball(0.24, '#b5afa4', 0.24, 0.12, -0.15, {}, 0.8);
      mb.box(0.24, 0.18, 0.2, '#c8c2b8', -0.2, 0.2, 0.15, { ry: v });
      break;
    case 'fish':
      for (let i = 0; i < 3; i++) {
        mb.push(Math.cos(i * 2.1) * 0.25, -0.12, Math.sin(i * 2.1) * 0.25, 0, i * 2.1, 0);
        mb.box(0.22, 0.06, 0.08, '#8fb4c4', 0, 0, 0);
        mb.box(0.06, 0.08, 0.02, '#8fb4c4', -0.13, 0, 0);
        mb.pop();
      }
      break;
    case 'relic':
      mb.boxB(0.4, 0.12, 0.3, C.stone, 0, 0, 0);
      mb.boxB(0.3, 0.2, 0.2, C.gold, 0, 0.12, 0);
      mb.pyramid(0.3, 0.2, 0.08, '#f4d26a', 0, 0.32, 0);
      mb.box(0.04, 0.04, 0.22, C.red, 0, 0.22, 0);
      break;
  }
}

// ---------------------------------------------------------------- decorations & effects

function deco(mb: MB, t: string, v: number) {
  if (mb.realistic && realisticDeco(mb, t, v)) return;
  switch (t) {
    case 'grass':
      for (let i = 0; i < 4; i++) mb.cone(0.03, 0.18, 3, i % 2 ? '#5f9a35' : '#6fae3d', Math.cos(i * 1.7 + v) * 0.08, 0.09, Math.sin(i * 1.7 + v) * 0.08, { rz: (i - 1.5) * 0.25 });
      break;
    case 'flower':
      mb.cone(0.02, 0.14, 3, '#5f9a35', 0, 0.07, 0);
      mb.ball(0.04, ['#e8d34a', '#e05a7a', '#f2f2f2', '#9a6ae0'][v % 4], 0, 0.15, 0);
      break;
    case 'rock':
      mb.ball(0.12, '#8d877c', 0, 0.04, 0, { ry: v }, 0.6);
      break;
    case 'bush':
      mb.ball(0.18, '#4a8a30', 0, 0.1, 0, {}, 0.7);
      mb.ball(0.13, '#3f7a28', 0.12, 0.08, 0.06, {}, 0.7);
      break;
    case 'reed':
      for (let i = 0; i < 5; i++) mb.box(0.02, 0.35, 0.02, '#6f8a3a', Math.cos(i * 1.3) * 0.1, 0.17, Math.sin(i * 1.3) * 0.1, { rz: (i - 2) * 0.1 });
      break;
    case 'cactus':
      mb.cylB(0.07, 0.08, 0.45, 6, '#4f8a4a', 0, 0, 0);
      mb.cylB(0.04, 0.05, 0.18, 6, '#4f8a4a', 0.1, 0.18, 0, { rz: -0.8 });
      break;
  }
}

function effect(mb: MB, t: string) {
  switch (t) {
    case 'puff': mb.ball(0.5, '#ffffff', 0, 0, 0, {}, 1, 0); break;
    case 'flame': mb.cone(0.3, 1.0, 5, '#ff8a2a', 0, 0.5, 0); break;
    case 'spark': mb.box(0.1, 0.1, 0.1, '#ffd35a', 0, 0, 0); break;
    case 'chunk': mb.box(0.12, 0.08, 0.1, '#7a6a5a', 0, 0, 0); break;
    case 'ring': {
      const g = new THREE.RingGeometry(0.85, 1.0, 24, 1);
      g.rotateX(-Math.PI / 2);
      mb.add(g, '#ffffff', 0, 0, 0);
      break;
    }
    case 'disc': {
      const g = new THREE.CircleGeometry(1, 20);
      g.rotateX(-Math.PI / 2);
      mb.add(g, '#ffffff', 0, 0, 0);
      break;
    }
    case 'tile': {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      mb.add(g, '#ffffff', 0, 0, 0);
      break;
    }
    case 'quad': {
      const g = new THREE.PlaneGeometry(1, 1);
      mb.add(g, '#ffffff', 0, 0, 0);
      break;
    }
    case 'arrow':
      mb.box(0.36, 0.02, 0.02, C.wood, 0, 0, 0);
      mb.cone(0.025, 0.06, 4, C.metal, 0.2, 0, 0, { rz: -Math.PI / 2 });
      mb.box(0.06, 0.01, 0.05, C.white, -0.16, 0, 0);
      break;
    case 'bolt':
      mb.box(0.5, 0.035, 0.035, C.dwood, 0, 0, 0);
      mb.cone(0.04, 0.1, 4, C.metal, 0.3, 0, 0, { rz: -Math.PI / 2 });
      break;
    case 'stone': mb.ball(0.12, C.dstone, 0, 0, 0); break;
    case 'cannon': mb.ball(0.08, '#2a2a2a', 0, 0, 0, {}, 1, 1); break;
    case 'bullet': mb.box(0.12, 0.03, 0.03, '#ffe08a', 0, 0, 0); break;
    case 'axe': mb.box(0.12, 0.03, 0.03, C.wood, 0, 0, 0); mb.box(0.05, 0.07, 0.02, C.metal, 0.05, 0.03, 0); break;
    case 'fire': mb.ball(0.08, '#ff7a1c', 0, 0, 0); break;
    case 'flag':
      mb.cylB(0.02, 0.025, 0.9, 5, C.dwood, 0, 0, 0);
      mb.box(0.35, 0.24, 0.02, C.team, 0.18, 0.75, 0, { team: true });
      break;
    case 'marker': {
      const g = new THREE.RingGeometry(0.25, 0.36, 16, 1);
      g.rotateX(-Math.PI / 2);
      mb.add(g, '#ffffff', 0, 0, 0);
      break;
    }
    case 'cropRow':
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) mb.boxB(0.1, 0.22, 0.1, '#ffffff', -1.2 + j * 0.4, 0, -1.2 + i * 0.4);
      break;
  }
}

// ---------------------------------------------------------------- dispatch

function buildModel(mb: MB, key: string) {
  const parts = key.split(':');
  switch (parts[0]) {
    case 'u': buildUnit(mb, parts[1], parts[2] ?? 'idle', parts[3] ?? ''); break;
    case 'b': buildBuilding(mb, parts[1], +(parts[2] ?? 1), +(parts[3] ?? 0)); break;
    case 'found': foundation(mb, +parts[1]); break;
    case 'scaffold': scaffold(mb, +parts[1], +parts[2]); break;
    case 'renov': renovation(mb, parts[1] ?? 'main'); break;
    case 'rubble': rubbleModel(mb, +parts[1]); break;
    case 'tree': tree(mb, +parts[1], parts[2] ?? '', +(parts[3] ?? 0)); break;
    case 'n': resource(mb, parts[1], +(parts[2] ?? 0)); break;
    case 'd': deco(mb, parts[1], +(parts[2] ?? 0)); break;
    case 'fx': effect(mb, parts[1]); break;
  }
}
