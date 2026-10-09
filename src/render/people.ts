// Rigged characters: people, riders and animals. Built in a rest pose (standing, arms hanging);
// the skeleton shader in rig.ts animates them. Models face +X, right side is +Z.

import * as THREE from 'three';
import { MB, type Col } from './mb';
import { BN, NUM_BONES, STYLE, type Rig } from './rig';

const C = {
  skin: '#e5b18a', skin2: '#c98f66', skin3: '#9a6542', hair: '#4a3222', blond: '#d0a95e', red: '#9a4a22', black: '#26221f', grey: '#9a9a9a',
  linen: '#ddd0ae', linen2: '#c9b98f', cloth: '#8a6a45', brown: '#6e4c2e', leather: '#6b4a2b', boot: '#3b2a1c', dboot: '#2a1e14',
  metal: '#b4bcc4', dmetal: '#69717a', mail: '#8d949b', gold: '#e8b830', wood: '#8b5a2b', dwood: '#5a3a1e', straw: '#d9b862',
  stone: '#aaa59b', dstone: '#827c72', white: '#f2efe8', eye: '#1d1a18', lip: '#b56d5a', robe: '#7d5c3a', team: '#ffffff',
  horse: '#8a5a32', horse2: '#5e3d22', horse3: '#d9c9a8', horse4: '#3a2a1e', mane: '#2e2016', camel: '#c9a36a', ele: '#8c8c8c',
  sheep: '#f0ece2', deer: '#a0683a', boar: '#4a3a30', wolf: '#7d7d80',
};

type Hand = ((mb: MB) => void) | null;

export interface Spec {
  style: number;
  skin?: Col;
  shirt: Col;
  shirtTeam?: boolean;
  sleeve?: Col;
  sleeveTeam?: boolean;
  forearm?: Col;
  pants: Col;
  boots?: Col;
  head?: string;
  hair?: Col;
  beard?: Col;
  chest?: Col;
  chain?: Col;
  pauldron?: Col;
  cape?: boolean;
  belt?: Col;
  skirt?: Col;
  robe?: Col;
  bulk?: number;
  right?: Hand;
  left?: Hand;
  shield?: { col: Col; team?: boolean; shape: 'round' | 'kite' | 'tower' | 'buckler' };
  quiver?: boolean;
  tunicTeam?: boolean;
  female?: boolean;
}

function pivots(): Float32Array {
  return new Float32Array(NUM_BONES * 3);
}

// ---------------------------------------------------------------- held items (drawn at the hand pivot, pointing +X)

const sword = (len = 0.3, col: Col = C.metal): Hand => (m) => {
  m.box(0.03, 0.025, 0.1, C.gold, 0.035, -0.012, 0);
  m.box(len, 0.03, 0.011, col, 0.05 + len / 2, -0.012, 0);
  m.cone(0.016, 0.05, 4, col, 0.07 + len, -0.012, 0, { rz: -Math.PI / 2 });
  m.box(0.06, 0.022, 0.022, C.leather, 0.0, -0.012, 0);
  m.ball(0.018, C.gold, -0.035, -0.012, 0);
};
const bigSword: Hand = (m) => {
  m.box(0.035, 0.03, 0.13, C.gold, 0.04, -0.012, 0);
  m.box(0.46, 0.036, 0.013, C.metal, 0.29, -0.012, 0);
  m.cone(0.02, 0.06, 4, C.metal, 0.55, -0.012, 0, { rz: -Math.PI / 2 });
  m.box(0.1, 0.024, 0.024, C.leather, -0.02, -0.012, 0);
};
const katana: Hand = (m) => {
  m.cyl(0.03, 0.03, 0.012, 8, C.gold, 0.03, -0.012, 0, { rz: Math.PI / 2 });
  m.box(0.36, 0.022, 0.009, C.white, 0.22, -0.006, 0, { rz: 0.06 });
  m.box(0.1, 0.022, 0.022, C.black, -0.02, -0.012, 0);
};
const spear = (len = 0.78, tip: Col = C.metal): Hand => (m) => {
  m.cyl(0.011, 0.011, len, 5, C.wood, len * 0.22, -0.012, 0, { rz: Math.PI / 2 });
  m.cone(0.024, 0.09, 4, tip, len * 0.72 + 0.04, -0.012, 0, { rz: -Math.PI / 2 });
};
const lance: Hand = (m) => {
  m.cyl(0.013, 0.018, 0.95, 6, C.dwood, 0.33, -0.012, 0, { rz: Math.PI / 2 });
  m.cone(0.022, 0.1, 5, C.metal, 0.85, -0.012, 0, { rz: -Math.PI / 2 });
  m.cyl(0.035, 0.012, 0.08, 6, C.metal, 0.02, -0.012, 0, { rz: Math.PI / 2 });
  m.box(0.08, 0.05, 0.005, C.team, 0.72, 0.02, 0, { team: true });
};
const halberd: Hand = (m) => { spear(0.85)!(m); m.box(0.07, 0.1, 0.012, C.metal, 0.6, 0.035, 0); m.box(0.04, 0.03, 0.012, C.metal, 0.6, -0.06, 0); };
const axe = (col: Col = C.metal, len = 0.3): Hand => (m) => {
  m.cyl(0.013, 0.013, len, 5, C.wood, len * 0.33, -0.012, 0, { rz: Math.PI / 2 });
  m.box(0.07, 0.1, 0.012, col, len * 0.72, 0.03, 0);
};
const throwingAxe: Hand = (m) => { m.cyl(0.011, 0.011, 0.17, 5, C.wood, 0.06, -0.012, 0, { rz: Math.PI / 2 }); m.box(0.05, 0.075, 0.012, C.metal, 0.13, 0.02, 0); };
const javelin: Hand = (m) => { m.cyl(0.008, 0.008, 0.48, 4, C.wood, 0.12, -0.012, 0, { rz: Math.PI / 2 }); m.cone(0.016, 0.05, 4, C.metal, 0.38, -0.012, 0, { rz: -Math.PI / 2 }); };
const pick: Hand = (m) => { m.cyl(0.013, 0.013, 0.3, 5, C.wood, 0.1, -0.012, 0, { rz: Math.PI / 2 }); m.box(0.025, 0.22, 0.02, C.dmetal, 0.23, -0.012, 0, { rz: 0.15 }); };
const hammer: Hand = (m) => { m.cyl(0.012, 0.012, 0.22, 5, C.wood, 0.07, -0.012, 0, { rz: Math.PI / 2 }); m.box(0.05, 0.1, 0.05, C.dmetal, 0.18, -0.012, 0); };
const hoe: Hand = (m) => { m.cyl(0.012, 0.012, 0.4, 5, C.wood, 0.13, -0.012, 0, { rz: Math.PI / 2 }); m.box(0.025, 0.09, 0.06, C.dmetal, 0.32, -0.05, 0); };
const knife: Hand = (m) => { m.box(0.11, 0.02, 0.01, C.metal, 0.07, -0.012, 0); m.box(0.05, 0.025, 0.02, C.leather, 0, -0.012, 0); };
const basket: Hand = (m) => { m.cyl(0.07, 0.05, 0.07, 8, C.straw, 0.02, -0.06, 0); m.box(0.005, 0.07, 0.1, C.straw, 0.02, -0.015, 0); };
const rod: Hand = (m) => { m.cyl(0.008, 0.012, 0.55, 5, C.wood, 0.22, -0.012, 0, { rz: Math.PI / 2 }); m.box(0.002, 0.3, 0.002, C.linen, 0.49, -0.16, 0); };
const staff: Hand = (m) => { m.cyl(0.013, 0.013, 0.65, 5, C.wood, 0.15, -0.012, 0, { rz: Math.PI / 2 }); m.ball(0.025, C.wood, 0.48, -0.012, 0); };
const crossbow: Hand = (m) => {
  m.box(0.26, 0.035, 0.035, C.wood, 0.1, -0.012, 0);
  m.box(0.03, 0.022, 0.28, C.dwood, 0.21, 0.0, 0, { ry: 0 });
  m.box(0.002, 0.004, 0.27, C.linen, 0.16, 0.0, 0);
};
const gun: Hand = (m) => { m.cyl(0.016, 0.018, 0.42, 6, C.dmetal, 0.18, -0.005, 0, { rz: Math.PI / 2 }); m.box(0.16, 0.045, 0.035, C.wood, -0.04, -0.015, 0); };
const bow = (big = false): Hand => (m) => {
  const L = big ? 0.27 : 0.21;
  // vertical bow, curved toward +X, string toward -X
  for (const s of [-1, 1]) {
    m.box(0.022, L * 0.55, 0.022, C.dwood, 0.03, s * L * 0.28, 0.0, { rz: -s * 0.25 });
    m.box(0.02, L * 0.5, 0.02, C.dwood, -0.005, s * L * 0.72, 0.0, { rz: s * 0.35 });
  }
  m.box(0.003, L * 1.95, 0.003, C.linen, -0.045, 0, 0);
};

// ---------------------------------------------------------------- head

const FACE = (() => {
  const geo = new THREE.SphereGeometry(1, 20, 16);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // A tapered jaw and flatter cheeks instead of a spherical toy head.
    const jaw = y < -0.2 ? 1 - (-y - 0.2) * 0.25 : 1;
    p.setXYZ(i, x * (x > 0 ? 0.91 : 0.97), y * 1.08, z * jaw * 0.9);
  }
  geo.computeVertexNormals();
  return geo;
})();
const HAIR_CAP = (() => {
  const geo = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.68);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    if (p.getX(i) > 0.25 && p.getY(i) < 0.35) p.setY(i, 0.35);
  }
  geo.computeVertexNormals();
  return geo;
})();
const HAIR_LOCK = new THREE.SphereGeometry(1, 12, 10);
const HUMAN_SCALE = [0.86, 1.12, 0.88] as const;
const APRON = new THREE.CylinderGeometry(0.101, 0.153, 0.23, 14, 3, true, Math.PI / 2 - 0.52, 1.04);
const CLOTH_BODY = (() => {
  const geo = new THREE.LatheGeometry([
    new THREE.Vector2(0.085, -0.082), new THREE.Vector2(0.083, -0.055),
    new THREE.Vector2(0.087, -0.028), new THREE.Vector2(0.097, 0.013),
    new THREE.Vector2(0.102, 0.042), new THREE.Vector2(0.071, 0.064),
    new THREE.Vector2(0.03, 0.083),
  ], 24);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), angle = Math.atan2(z, x);
    const fold = Math.sin(angle * 7 + y * 18) * 0.022 + Math.cos(angle * 11 - y * 32) * 0.012;
    p.setXYZ(i, x * (1 + fold), y, z * (1 + fold));
  }
  geo.computeVertexNormals();
  return geo;
})();

function head(mb: MB, s: Spec, skin: Col) {
  const y = 0.665;
  if (mb.realistic) mb.add(FACE, skin, 0, y, 0, { surface: 'skin' }, 0.08, 0.08, 0.08);
  else mb.ball(0.08, skin, 0, y, 0, {}, 1.1, 1);
  // face
  mb.box(mb.realistic ? 0.004 : 0.012, mb.realistic ? 0.008 : 0.02, mb.realistic ? 0.012 : 0.018, C.eye, 0.073, y + 0.012, 0.03);
  mb.box(mb.realistic ? 0.004 : 0.012, mb.realistic ? 0.008 : 0.02, mb.realistic ? 0.012 : 0.018, C.eye, 0.073, y + 0.012, -0.03);
  mb.box(mb.realistic ? 0.006 : 0.008, mb.realistic ? 0.004 : 0.008, mb.realistic ? 0.024 : 0.026, s.hair ?? C.hair, 0.076, y + (mb.realistic ? 0.03 : 0.035), 0.03);
  mb.box(mb.realistic ? 0.006 : 0.008, mb.realistic ? 0.004 : 0.008, mb.realistic ? 0.024 : 0.026, s.hair ?? C.hair, 0.076, y + (mb.realistic ? 0.03 : 0.035), -0.03);
  mb.box(mb.realistic ? 0.019 : 0.03, mb.realistic ? 0.026 : 0.032, mb.realistic ? 0.018 : 0.022, skin, mb.realistic ? 0.078 : 0.08, y - 0.005, 0);
  mb.box(mb.realistic ? 0.004 : 0.006, mb.realistic ? 0.004 : 0.008, mb.realistic ? 0.026 : 0.032, C.lip, 0.074, y - 0.04, 0);
  mb.ball(mb.realistic ? 0.012 : 0.018, skin, 0.0, y, mb.realistic ? 0.077 : 0.081, {}, 1.2);
  mb.ball(mb.realistic ? 0.012 : 0.018, skin, 0.0, y, mb.realistic ? -0.077 : -0.081, {}, 1.2);
  if (s.beard) { mb.ball(0.062, s.beard, 0.035, y - 0.045, 0, {}, 0.9); mb.box(0.02, 0.012, 0.06, s.beard, 0.074, y - 0.02, 0); }
  const hair = s.hair ?? C.hair;
  if (mb.realistic && ['hair', 'long', 'bun'].includes(s.head ?? 'hair')) {
    mb.add(HAIR_CAP, hair, -0.008, y + 0.001, 0, { surface: 'cloth' }, 0.086, 0.09, 0.083);
    if (s.head === 'long') {
      for (let lock = 0; lock < 7; lock++) {
        const angle = 1.7 + lock * 0.48;
        mb.add(HAIR_LOCK, hair, Math.cos(angle) * 0.067, y - 0.072, Math.sin(angle) * 0.069, { surface: 'cloth', rz: -0.1 }, 0.023, 0.103, 0.021);
      }
    } else {
      mb.add(HAIR_LOCK, hair, -0.054, y - 0.019, 0, { surface: 'cloth' }, 0.034, 0.065, 0.069);
      if (s.head === 'bun') mb.ball(0.031, hair, -0.086, y + 0.009, 0, { surface: 'cloth' });
    }
    return;
  }
  const cap = (col: Col, sy = 0.62, dy = 0.03, r = 0.087) => mb.ball(r, col, -0.008, y + dy, 0, {}, sy, 1);
  switch (s.head ?? 'hair') {
    case 'hair':
      cap(hair, 0.62, 0.03);
      mb.box(0.05, 0.1, 0.15, hair, -0.05, y - 0.005, 0);
      break;
    case 'long':
      cap(hair, 0.65, 0.03);
      mb.box(0.06, 0.2, 0.16, hair, -0.045, y - 0.05, 0);
      break;
    case 'bun':
      cap(hair, 0.62, 0.03);
      mb.box(0.05, 0.12, 0.155, hair, -0.05, y - 0.01, 0);
      mb.ball(0.04, hair, -0.085, y + 0.05, 0);
      mb.box(0.012, 0.03, 0.17, C.team, -0.01, y + 0.07, 0, { team: true, rz: 0.4 });
      break;
    case 'cap':
      cap(hair, 0.55, 0.0);
      mb.ball(0.088, C.team, -0.005, y + 0.035, 0, { team: true }, 0.55, 1);
      mb.box(0.06, 0.012, 0.11, C.team, 0.065, y + 0.03, 0, { team: true });
      break;
    case 'straw':
      cap(hair, 0.55, 0.0);
      mb.cyl(0.05, 0.08, 0.06, 8, C.straw, -0.005, y + 0.075, 0);
      mb.cyl(0.15, 0.15, 0.012, 10, C.straw, -0.005, y + 0.045, 0);
      break;
    case 'hood':
      mb.ball(0.098, s.robe ?? C.brown, -0.012, y + 0.01, 0, {}, 1.1, 1);
      mb.box(0.03, 0.11, 0.12, '#2a1d13', 0.068, y - 0.005, 0);
      // re-add face over the hood opening
      mb.box(0.012, 0.02, 0.018, C.eye, 0.084, y + 0.012, 0.028);
      mb.box(0.012, 0.02, 0.018, C.eye, 0.084, y + 0.012, -0.028);
      mb.box(0.012, 0.07, 0.08, skin, 0.08, y - 0.005, 0);
      break;
    case 'helmet':
      cap(C.metal, 0.75, 0.035, 0.09);
      mb.cyl(0.098, 0.098, 0.018, 10, C.dmetal, -0.005, y + 0.025, 0);
      break;
    case 'nasal':
      mb.cone(0.093, 0.13, 8, C.metal, -0.004, y + 0.085, 0);
      mb.cyl(0.094, 0.094, 0.03, 8, C.dmetal, -0.004, y + 0.03, 0);
      mb.box(0.014, 0.065, 0.016, C.dmetal, 0.088, y - 0.0, 0);
      break;
    case 'coif':
      mb.ball(0.095, C.mail, -0.01, y + 0.008, 0, {}, 1.12, 1);
      mb.box(0.03, 0.1, 0.11, skin, 0.07, y - 0.005, 0);
      mb.box(0.012, 0.02, 0.018, C.eye, 0.086, y + 0.012, 0.028);
      mb.box(0.012, 0.02, 0.018, C.eye, 0.086, y + 0.012, -0.028);
      mb.cone(0.096, 0.08, 8, C.metal, -0.01, y + 0.105, 0);
      break;
    case 'kettle':
      cap(hair, 0.6, 0.0);
      mb.ball(0.088, C.dmetal, -0.004, y + 0.04, 0, {}, 0.65, 1);
      mb.cyl(0.14, 0.14, 0.014, 10, C.dmetal, -0.004, y + 0.035, 0);
      break;
    case 'great':
      mb.cyl(0.092, 0.095, 0.17, 8, C.metal, 0, y + 0.01, 0);
      mb.cyl(0.07, 0.092, 0.04, 8, C.metal, 0, y + 0.115, 0);
      mb.box(0.01, 0.014, 0.14, C.black, 0.093, y + 0.02, 0);
      mb.box(0.012, 0.12, 0.016, C.gold, 0.094, y + 0.005, 0);
      mb.box(0.06, 0.06, 0.02, C.team, -0.02, y + 0.16, 0, { team: true });
      break;
    case 'feather':
      cap(C.metal, 0.75, 0.035, 0.09);
      mb.cyl(0.13, 0.13, 0.012, 10, C.dmetal, -0.005, y + 0.03, 0);
      mb.box(0.15, 0.035, 0.03, C.team, -0.07, y + 0.13, 0, { team: true, rz: 0.55 });
      break;
    case 'samurai':
      cap(C.black, 0.7, 0.04, 0.092);
      mb.box(0.03, 0.06, 0.2, '#3a2a2a', -0.02, y + 0.0, 0, { ry: 0 });
      mb.box(0.02, 0.1, 0.12, C.gold, 0.05, y + 0.11, 0, { rz: -0.3 });
      mb.box(0.06, 0.02, 0.24, '#5a2222', -0.04, y - 0.03, 0, { rz: 0.4 });
      break;
    case 'viking':
      cap(C.dmetal, 0.72, 0.035, 0.09);
      mb.box(0.012, 0.06, 0.016, C.dmetal, 0.088, y + 0.0, 0);
      mb.cone(0.022, 0.1, 5, C.white, 0, y + 0.08, 0.1, { rx: -1.0 });
      mb.cone(0.022, 0.1, 5, C.white, 0, y + 0.08, -0.1, { rx: 1.0 });
      break;
    case 'turban':
      mb.ball(0.1, C.white, -0.01, y + 0.05, 0, {}, 0.7, 1);
      mb.ball(0.025, C.team, 0.085, y + 0.06, 0, { team: true });
      break;
    case 'bald':
      break;
  }
}

// ---------------------------------------------------------------- human body

export function human(mb: MB, s: Spec, piv: Float32Array, ox = 0, oy = 0) {
  const scale = mb.realistic ? HUMAN_SCALE : [1, 1, 1];
  const sp = (b: number, x: number, y: number, z: number) => { piv[b * 3] = x * scale[0] + ox; piv[b * 3 + 1] = y * scale[1] + oy; piv[b * 3 + 2] = z * scale[2]; };
  const b = s.bulk ?? 1;
  const skin = s.skin ?? C.skin;
  sp(BN.PELVIS, 0, 0.38, 0); sp(BN.TORSO, 0, 0.43, 0); sp(BN.HEAD, 0, 0.585, 0);
  sp(BN.UARM_R, 0, 0.545, 0.125 * b); sp(BN.LARM_R, 0, 0.41, 0.13 * b); sp(BN.HAND_R, 0, 0.28, 0.135 * b);
  sp(BN.UARM_L, 0, 0.545, -0.125 * b); sp(BN.LARM_L, 0, 0.41, -0.13 * b); sp(BN.HAND_L, 0, 0.28, -0.135 * b);
  sp(BN.THIGH_L, 0, 0.36, -0.055 * b); sp(BN.SHIN_L, 0, 0.2, -0.055 * b); sp(BN.THIGH_R, 0, 0.36, 0.055 * b); sp(BN.SHIN_R, 0, 0.2, 0.055 * b);
  sp(BN.CAPE, -0.08, 0.56, 0);
  mb.push(ox, oy, 0);
  mb.pushScale(scale[0], scale[1], scale[2]);
  const boots = s.boots ?? C.boot;
  // legs
  for (const side of [-1, 1]) {
    const z = 0.055 * side * b;
    mb.bone = side < 0 ? BN.THIGH_L : BN.THIGH_R;
    if (!s.robe) mb.cyl(0.044 * b, 0.035 * b, 0.17, 7, s.pants, 0, 0.28, z);
    mb.bone = side < 0 ? BN.SHIN_L : BN.SHIN_R;
    if (!s.robe) mb.cyl(0.034 * b, 0.029 * b, 0.14, 7, s.pants, 0, 0.13, z);
    mb.cyl(0.036 * b, 0.034 * b, 0.07, 7, boots, 0, 0.065, z);
    mb.box(0.1, 0.045, 0.062 * b, boots, 0.02, 0.022, z);
    mb.ball(0.032, boots, 0.065, 0.025, z, {}, 0.7);
  }
  // hips / lower garment
  mb.bone = BN.PELVIS;
  if (!s.robe) mb.box(0.1, 0.075, 0.165 * b, s.pants, 0, 0.385, 0);
  if (s.robe) {
    mb.cyl(0.1 * b, 0.155 * b, 0.47, 9, s.robe, 0, 0.245, 0);
    mb.cyl(0.157 * b, 0.157 * b, 0.02, 9, '#5a4028', 0, 0.02, 0);
  } else if (s.skirt) {
    mb.cyl(0.095 * b, 0.155 * b, 0.27, 9, s.skirt, 0, 0.3, 0);
    mb.cyl(0.157 * b, 0.157 * b, 0.025, 9, C.linen, 0, 0.17, 0);
    if (mb.realistic) {
      // A linen apron and sewn seams break up the plain bell-shaped dress.
      mb.add(APRON, '#d6d4c6', 0, 0.29, 0, { surface: 'cloth' }, b, 1, b);
      for (const side of [-1, 1]) mb.box(0.012, 0.235, 0.008, s.skirt, 0.045, 0.3, 0.132 * b * side, { surface: 'cloth', rx: side * 0.11 });
    }
  } else if (s.chain) {
    mb.cyl(0.1 * b, 0.128 * b, 0.13, 9, s.chain, 0, 0.345, 0);
    if (s.tunicTeam) mb.cyl(0.103 * b, 0.124 * b, 0.1, 9, C.team, 0, 0.36, 0, { team: true });
  } else {
    mb.cyl(0.098 * b, 0.122 * b, 0.12, 9, s.shirt, 0, 0.365, 0, { team: s.shirtTeam });
  }
  if (s.belt) { mb.cyl(0.101 * b, 0.101 * b, 0.028, 9, s.belt, 0, 0.425, 0); mb.box(0.02, 0.03, 0.03, C.gold, 0.1 * b, 0.425, 0); mb.box(0.04, 0.05, 0.04, C.leather, 0.02, 0.39, 0.1 * b); }
  // torso
  mb.bone = BN.TORSO;
  mb.push(0, 0.505, 0);
  mb.pushScale(0.82, 1, 1.15 * b);
  if (mb.realistic) mb.add(CLOTH_BODY, s.shirt, 0, 0, 0, { team: s.shirtTeam, surface: 'cloth' });
  else mb.cyl(0.103, 0.085, 0.165, 9, s.shirt, 0, 0, 0, { team: s.shirtTeam });
  if (s.chest) mb.cyl(0.108, 0.092, 0.13, 9, s.chest, 0, 0.012, 0);
  mb.pop(); mb.pop();
  if (s.chest && s.tunicTeam) mb.box(0.012, 0.11, 0.08, C.team, 0.088, 0.5, 0, { team: true });
  if (s.female && !mb.realistic) { mb.ball(0.04, s.shirt, 0.06, 0.51, 0.045, {}, 0.9); mb.ball(0.04, s.shirt, 0.06, 0.51, -0.045, {}, 0.9); }
  for (const side of [-1, 1]) mb.ball((mb.realistic && !s.pauldron ? 0.036 : 0.048) * b, s.pauldron ?? s.chest ?? s.sleeve ?? s.shirt, 0, 0.545, 0.12 * side * b, { team: !s.pauldron && !s.chest && !!(s.sleeveTeam ?? s.shirtTeam) }, 0.85, 1);
  mb.cyl(mb.realistic ? 0.024 : 0.03, mb.realistic ? 0.027 : 0.035, 0.05, 7, skin, 0, 0.585, 0);
  if (mb.realistic && s.style === STYLE.NONE) {
    mb.box(0.008, 0.032, 0.075, '#d6d4c6', 0.077, 0.554, 0, { surface: 'cloth' });
    mb.box(0.008, 0.1, 0.012, '#bfc2b3', 0.084, 0.502, 0, { surface: 'cloth' });
    for (let i = 0; i < 3; i++) mb.ball(0.004, '#5c594d', 0.089, 0.53 - i * 0.025, 0, { surface: 'cloth' });
  }
  if (s.quiver) { mb.cyl(0.032, 0.028, 0.24, 7, C.leather, -0.09, 0.53, 0.04, { rx: 0.35 }); for (let i = 0; i < 3; i++) mb.box(0.006, 0.06, 0.006, C.white, -0.09 + i * 0.01, 0.67, 0.08 - i * 0.012, { rx: 0.35 }); }
  if (s.cape) {
    mb.bone = BN.CAPE;
    mb.box(0.02, 0.36, 0.2 * b, C.team, -0.095, 0.38, 0, { team: true });
    mb.box(0.03, 0.03, 0.22 * b, C.gold, -0.09, 0.56, 0);
  }
  // head
  mb.bone = BN.HEAD;
  if (mb.realistic) { mb.push(0, 0.665, 0); mb.pushScale(0.67, 0.64, 0.65); mb.push(0, -0.665, 0); }
  head(mb, s, skin);
  if (mb.realistic) { mb.pop(); mb.pop(); mb.pop(); }
  // arms
  for (const side of [-1, 1]) {
    const R = side > 0;
    const z = (k: number) => k * side * b;
    mb.bone = R ? BN.UARM_R : BN.UARM_L;
    mb.cyl(0.034 * b, 0.029 * b, 0.13, 7, s.sleeve ?? s.chest ?? s.shirt, 0, 0.475, z(0.128), { team: !s.chest && !!(s.sleeveTeam ?? s.shirtTeam) && !s.sleeve });
    mb.bone = R ? BN.LARM_R : BN.LARM_L;
    mb.cyl(0.029 * b, 0.024 * b, 0.12, 7, s.forearm ?? skin, 0, 0.345, z(0.132));
    mb.bone = R ? BN.HAND_R : BN.HAND_L;
    const hand = s.forearm && s.forearm !== C.leather ? s.forearm : skin;
    if (mb.realistic) {
      mb.box(0.036, 0.05, 0.025, hand, 0, 0.265, z(0.135), { surface: s.forearm ? 'leather' : 'skin' });
      mb.ball(0.008, hand, 0.02, 0.276, z(0.135), { surface: s.forearm ? 'leather' : 'skin' }, 1.4);
    } else mb.ball(0.027, hand, 0, 0.265, z(0.135));
    mb.push(0, 0.28, z(0.135));
    const item = R ? s.right : s.left;
    if (item) item(mb);
    if (!R && s.shield) shield(mb, s.shield);
    mb.pop();
  }
  mb.bone = 0;
  mb.pop(); mb.pop();
}

function shield(mb: MB, sh: NonNullable<Spec['shield']>) {
  // strapped so it faces forward when the forearm is raised
  mb.push(0.0, -0.04, -0.03, -2.45, 0, 0);
  if (sh.shape === 'round' || sh.shape === 'buckler') {
    const r = sh.shape === 'buckler' ? 0.075 : 0.125;
    mb.cyl(r, r, 0.022, 12, sh.col, 0, 0, 0, { team: sh.team });
    mb.cyl(r * 1.04, r * 1.04, 0.012, 12, C.dwood, 0, -0.006, 0);
    mb.ball(0.025, C.gold, 0, 0.015, 0, {}, 0.6);
  } else if (sh.shape === 'kite') {
    mb.box(0.17, 0.025, 0.2, sh.col, 0.03, 0, 0, { team: sh.team });
    mb.cone(0.1, 0.16, 4, sh.col, -0.13, 0, 0, { rz: Math.PI / 2, ry: Math.PI / 4, team: sh.team });
    mb.box(0.02, 0.03, 0.2, C.gold, 0.03, 0.006, 0);
  } else {
    mb.box(0.28, 0.025, 0.2, sh.col, 0, 0, 0, { team: sh.team });
    mb.box(0.3, 0.012, 0.03, C.metal, 0, 0.008, 0);
  }
  mb.pop();
}

// ---------------------------------------------------------------- villagers

const SKINS = [C.skin, C.skin2, C.skin3, '#f0c4a0'];
const HAIRS = [C.hair, C.blond, C.red, C.black, '#6b4a2b'];

/** Villager with every tool and carried item, shown/hidden per instance via tags. */
function villager(mb: MB, variant: string, piv: Float32Array) {
  const fem = variant[0] === 'f';
  const k = +(variant[1] ?? 0);
  const skin = SKINS[k % SKINS.length];
  const hair = HAIRS[(k * 3 + (fem ? 1 : 0)) % HAIRS.length];
  const right: Hand = (m) => {
    const tools: [number, Hand][] = [[TAG.AXE, axe()], [TAG.PICK, pick], [TAG.HOE, hoe], [TAG.HAMMER, hammer], [TAG.KNIFE, knife], [TAG.ROD, rod], [TAG.SPEAR, javelin]];
    for (const [t, f] of tools) { m.tag = t; f!(m); }
    m.tag = 0;
  };
  const left: Hand = (m) => { m.tag = TAG.BASKET; basket!(m); m.tag = 0; };
  const spec: Spec = fem
    ? { style: STYLE.NONE, skin, hair, shirt: '#365f68', pants: '#6e5038', skirt: mb.realistic ? (k % 2 ? '#634a50' : '#485663') : k % 2 ? '#8c6844' : '#7a6a8a', head: k % 2 ? 'bun' : 'long', belt: C.team, female: true, right, left }
    : { style: STYLE.NONE, skin, hair, shirt: k % 2 ? C.linen : C.linen2, pants: k % 2 ? C.brown : '#5d5a4a', head: k % 3 === 2 ? 'straw' : 'hair', belt: C.team, beard: k % 2 ? hair : undefined, right, left };
  human(mb, spec, piv);
  if (mb.realistic) mb.pushScale(...HUMAN_SCALE);
  // team neckerchief so villagers read as team-coloured from afar
  mb.bone = BN.TORSO;
  mb.cyl(0.05, 0.075, 0.035, 8, C.team, 0, 0.565, 0, { team: true });
  // carried loads on the left shoulder
  mb.tag = TAG.C_WOOD;
  mb.cyl(0.032, 0.032, 0.3, 6, '#6b4a2d', -0.02, 0.62, -0.13, { rx: Math.PI / 2 });
  mb.cyl(0.028, 0.028, 0.28, 6, '#7b5636', 0.03, 0.66, -0.13, { rx: Math.PI / 2 });
  mb.tag = TAG.C_GOLD;
  mb.ball(0.065, '#7a5a3a', -0.01, 0.64, -0.13); mb.ball(0.04, C.gold, 0.0, 0.69, -0.12);
  mb.tag = TAG.C_STONE;
  mb.ball(0.065, '#7a5a3a', -0.01, 0.64, -0.13); mb.ball(0.045, C.stone, 0.0, 0.69, -0.12);
  mb.tag = TAG.C_FOOD;
  mb.cyl(0.07, 0.05, 0.08, 8, C.straw, -0.01, 0.65, -0.13); mb.ball(0.03, '#c4283a', 0, 0.69, -0.11); mb.ball(0.03, '#e07a2a', -0.02, 0.69, -0.15);
  mb.tag = 0;
  mb.bone = 0;
  if (mb.realistic) mb.pop();
}

export const TAG = { AXE: 1, PICK: 2, HOE: 3, HAMMER: 4, KNIFE: 5, ROD: 6, SPEAR: 7, BASKET: 8, C_WOOD: 11, C_GOLD: 12, C_STONE: 13, C_FOOD: 14, RELIC: 15 } as const;

// ---------------------------------------------------------------- unit specs

const T = C.team;
export function specFor(t: string): Spec {
  switch (t) {
    case 'militia': return { style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.brown, head: 'hair', right: sword(0.26), belt: C.leather, shield: { col: C.wood, shape: 'buckler' } };
    case 'man_at_arms': return { style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.brown, head: 'helmet', chain: C.mail, tunicTeam: true, chest: '#8d7a5e', right: sword(0.3), shield: { col: T, team: true, shape: 'round' }, belt: C.leather, forearm: C.leather };
    case 'long_swordsman': return { style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.dmetal, head: 'nasal', chain: C.mail, tunicTeam: true, chest: C.mail, right: sword(0.36), shield: { col: T, team: true, shape: 'kite' }, belt: C.leather, forearm: C.mail, beard: C.hair };
    case 'two_handed_swordsman': return { style: STYLE.TWOHAND, shirt: T, shirtTeam: true, pants: C.dmetal, head: 'coif', chain: C.mail, tunicTeam: true, chest: C.metal, pauldron: C.metal, right: bigSword, cape: true, belt: C.leather, forearm: C.metal };
    case 'champion': return { style: STYLE.TWOHAND, shirt: T, shirtTeam: true, pants: C.dmetal, head: 'great', chain: C.mail, tunicTeam: true, chest: '#cfd4da', pauldron: '#cfd4da', right: bigSword, cape: true, bulk: 1.08, belt: C.gold, forearm: C.metal, boots: C.dmetal };
    case 'spearman': return { style: STYLE.SPEAR, shirt: T, shirtTeam: true, pants: C.brown, head: 'cap', right: spear(0.72), belt: C.leather, shield: { col: C.wood, shape: 'buckler' } };
    case 'pikeman': return { style: STYLE.SPEAR, shirt: T, shirtTeam: true, pants: C.brown, head: 'kettle', chest: '#8d7a5e', right: spear(0.98), belt: C.leather, forearm: C.leather };
    case 'halberdier': return { style: STYLE.SPEAR, shirt: T, shirtTeam: true, pants: C.dmetal, head: 'kettle', chain: C.mail, tunicTeam: true, chest: C.metal, pauldron: C.metal, right: halberd, belt: C.leather, forearm: C.mail };
    case 'archer': return { style: STYLE.BOW, shirt: '#5f7a3a', pants: C.brown, sleeve: T, sleeveTeam: true, head: 'hood', robe: undefined, left: bow(), belt: C.leather, quiver: true, forearm: C.leather };
    case 'crossbowman': return { style: STYLE.GUN, shirt: T, shirtTeam: true, pants: C.brown, head: 'kettle', chest: '#8d7a5e', right: crossbow, belt: C.leather, quiver: true, forearm: C.leather };
    case 'arbalester': return { style: STYLE.GUN, shirt: T, shirtTeam: true, pants: C.dmetal, head: 'kettle', chain: C.mail, tunicTeam: true, chest: C.mail, right: crossbow, cape: true, belt: C.leather, quiver: true, forearm: C.mail };
    case 'skirmisher': return { style: STYLE.THROW, shirt: '#9b8a62', pants: C.brown, sleeve: T, sleeveTeam: true, head: 'cap', right: javelin, shield: { col: T, team: true, shape: 'buckler' }, quiver: true };
    case 'elite_skirmisher': return { style: STYLE.THROW, shirt: '#9b8a62', pants: C.brown, sleeve: T, sleeveTeam: true, head: 'helmet', right: javelin, shield: { col: T, team: true, shape: 'round' }, chest: '#8d7a5e', quiver: true };
    case 'hand_cannoneer': return { style: STYLE.GUN, shirt: T, shirtTeam: true, pants: C.brown, head: 'feather', chest: '#7a3a2a', right: gun, belt: C.leather, forearm: C.leather };
    case 'longbowman': return { style: STYLE.BOW, shirt: '#3d6b35', pants: C.brown, sleeve: T, sleeveTeam: true, head: 'feather', left: bow(true), cape: true, belt: C.leather, quiver: true, forearm: C.leather };
    case 'throwing_axeman': return { style: STYLE.THROW, shirt: T, shirtTeam: true, pants: C.brown, head: 'hair', hair: C.blond, beard: C.blond, right: throwingAxe, shield: { col: T, team: true, shape: 'round' }, belt: C.leather };
    case 'teutonic_knight': return { style: STYLE.TWOHAND, shirt: C.white, pants: C.dmetal, head: 'great', chain: C.mail, chest: C.metal, pauldron: C.metal, right: bigSword, cape: true, bulk: 1.15, belt: C.black, forearm: C.metal, boots: C.dmetal };
    case 'samurai': return { style: STYLE.TWOHAND, shirt: T, shirtTeam: true, pants: '#2f2f3a', head: 'samurai', chest: '#7a2b25', pauldron: '#5a2222', right: katana, belt: C.gold, forearm: '#3a2a2a' };
    case 'berserk': return { style: STYLE.ONEHAND, shirt: '#7e6a4a', pants: C.brown, sleeve: T, sleeveTeam: true, head: 'viking', beard: C.red, hair: C.red, right: axe(C.metal, 0.34), shield: { col: T, team: true, shape: 'round' }, bulk: 1.1, belt: C.leather };
    case 'chu_ko_nu': return { style: STYLE.GUN, shirt: T, shirtTeam: true, pants: '#2f2f3a', head: 'kettle', chest: '#8a3a2a', right: crossbow, belt: C.gold, quiver: true };
    case 'monk': return { style: STYLE.STAFF, shirt: C.robe, pants: C.brown, head: 'hood', robe: C.robe, right: staff, belt: T };
  }
  return { style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.brown, right: sword() };
}

// ---------------------------------------------------------------- quadrupeds

interface QuadSpec {
  col: Col;
  legTop: number;
  legR: number;
  bodyY: number;
  bodyLen: number;
  bodyR: number;
  fx: number;
  bx: number;
  lz: number;
  neck: (mb: MB) => void;
  neckPiv: [number, number];
  tailPiv: [number, number];
  tail?: (mb: MB) => void;
  body?: (mb: MB) => void;
  hoof?: Col;
}

function quad(mb: MB, q: QuadSpec, piv: Float32Array) {
  const sp = (b: number, x: number, y: number, z: number) => { piv[b * 3] = x; piv[b * 3 + 1] = y; piv[b * 3 + 2] = z; };
  sp(BN.Q_BODY, 0, q.bodyY, 0);
  sp(BN.Q_NECK, q.neckPiv[0], q.neckPiv[1], 0);
  sp(BN.Q_TAIL, q.tailPiv[0], q.tailPiv[1], 0);
  const up = q.legTop * 0.52, lo = q.legTop * 0.48;
  const legs: [number, number, number, number][] = [
    [BN.Q_FL_U, BN.Q_FL_L, q.fx, -q.lz], [BN.Q_FR_U, BN.Q_FR_L, q.fx, q.lz],
    [BN.Q_BL_U, BN.Q_BL_L, q.bx, -q.lz], [BN.Q_BR_U, BN.Q_BR_L, q.bx, q.lz],
  ];
  for (const [u, l, x, z] of legs) {
    sp(u, x, q.legTop, z);
    sp(l, x, q.legTop - up, z);
    mb.bone = u;
    mb.cyl(q.legR * 1.25, q.legR, up + 0.02, 7, q.col, x, q.legTop - up / 2, z);
    mb.bone = l;
    mb.cyl(q.legR * 0.95, q.legR * 0.78, lo, 7, q.col, x, lo / 2 + 0.01, z);
    mb.cyl(q.legR * 0.95, q.legR * 1.05, 0.04, 7, q.hoof ?? C.black, x, 0.02, z);
  }
  mb.bone = BN.Q_BODY;
  mb.push(0, q.bodyY, 0);
  mb.cyl(q.bodyR, q.bodyR * 1.02, q.bodyLen, 10, q.col, 0, 0, 0, { rz: Math.PI / 2 });
  mb.ball(q.bodyR * 1.02, q.col, q.bodyLen / 2, 0, 0, {}, 1, 1);
  mb.ball(q.bodyR * 1.04, q.col, -q.bodyLen / 2, 0.01, 0, {}, 1, 1);
  mb.pop();
  // legs join the body smoothly
  for (const [, , x, z] of legs) mb.ball(q.legR * 1.6, q.col, x, q.legTop + 0.02, z, {}, 1.2);
  if (q.body) q.body(mb);
  mb.bone = BN.Q_NECK;
  q.neck(mb);
  if (q.tail) { mb.bone = BN.Q_TAIL; q.tail(mb); }
  mb.bone = 0;
}

function horseSpec(col: Col, mane: Col = C.mane): QuadSpec {
  return {
    col, legTop: 0.36, legR: 0.033, bodyY: 0.46, bodyLen: 0.44, bodyR: 0.12, fx: 0.22, bx: -0.22, lz: 0.07, hoof: '#2a2420',
    neckPiv: [0.25, 0.5], tailPiv: [-0.34, 0.52],
    neck: (mb) => {
      mb.cyl(0.055, 0.075, 0.28, 8, col, 0.32, 0.6, 0, { rz: -0.6 });
      mb.box(0.24, 0.1, 0.1, col, 0.45, 0.71, 0, { rz: 0.55 });
      mb.box(0.1, 0.075, 0.08, col, 0.53, 0.64, 0, { rz: 0.55 });
      mb.cone(0.022, 0.07, 4, col, 0.39, 0.81, 0.035, { rz: -0.2 });
      mb.cone(0.022, 0.07, 4, col, 0.39, 0.81, -0.035, { rz: -0.2 });
      mb.box(0.012, 0.016, 0.016, C.eye, 0.47, 0.75, 0.05);
      mb.box(0.012, 0.016, 0.016, C.eye, 0.47, 0.75, -0.05);
      mb.box(0.3, 0.05, 0.03, mane, 0.27, 0.66, 0, { rz: -0.6 });
      mb.box(0.03, 0.06, 0.11, C.leather, 0.5, 0.67, 0, { rz: 0.55 });
    },
    tail: (mb) => { mb.box(0.05, 0.26, 0.05, mane, -0.37, 0.4, 0, { rz: 0.25 }); },
  };
}

function rider(mb: MB, s: Spec, piv: Float32Array, seat: number) {
  human(mb, s, piv, -0.03, seat - 0.36);
}

function cavalry(mb: MB, t: string, piv: Float32Array): number {
  const saddle = (col: Col, barding = false, armor?: Col) => (m: MB) => {
    m.box(0.2, 0.05, 0.25, C.leather, -0.02, 0.585, 0);
    m.box(0.24, 0.02, 0.27, C.team, -0.02, 0.57, 0, { team: true });
    if (barding) {
      m.box(0.6, 0.18, 0.27, C.team, 0, 0.47, 0, { team: true });
      m.box(0.62, 0.025, 0.28, C.gold, 0, 0.385, 0);
      if (armor) m.box(0.2, 0.18, 0.2, armor, 0.27, 0.5, 0);
    }
    void col;
  };
  const make = (col: Col, s: Spec, opts: { barding?: boolean; armor?: Col; mane?: Col } = {}) => {
    const q = horseSpec(col, opts.mane);
    q.body = saddle(col, opts.barding, opts.armor);
    quad(mb, q, piv);
    if (opts.armor) { mb.bone = BN.Q_NECK; mb.box(0.2, 0.09, 0.105, opts.armor, 0.47, 0.73, 0, { rz: 0.55 }); }
    rider(mb, s, piv, 0.6);
    return s.style;
  };
  switch (t) {
    case 'scout_cavalry': return make(C.horse, { style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.brown, head: 'hair', right: sword(0.24), belt: C.leather });
    case 'light_cavalry': return make(C.horse3, { style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.brown, head: 'helmet', right: sword(0.28), shield: { col: T, team: true, shape: 'round' } });
    case 'hussar': return make(C.horse3, { style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.brown, head: 'feather', right: sword(0.32), cape: true, forearm: C.leather }, { mane: C.black });
    case 'knight': return make(C.horse2, { style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.dmetal, head: 'great', chain: C.mail, chest: C.metal, right: sword(0.32), shield: { col: T, team: true, shape: 'kite' }, forearm: C.metal }, { barding: true });
    case 'cavalier': return make(C.horse4, { style: STYLE.SPEAR, shirt: T, shirtTeam: true, pants: C.dmetal, head: 'great', chain: C.mail, chest: C.metal, pauldron: C.metal, right: lance, shield: { col: T, team: true, shape: 'kite' }, forearm: C.metal }, { barding: true, armor: C.metal });
    case 'paladin': return make('#ebe5d8', { style: STYLE.SPEAR, shirt: T, shirtTeam: true, pants: C.dmetal, head: 'great', chain: C.mail, chest: '#dce1e6', pauldron: C.gold, right: lance, cape: true, shield: { col: T, team: true, shape: 'kite' }, forearm: C.metal }, { barding: true, armor: C.gold, mane: '#cfc6b4' });
    case 'cataphract': return make('#4a3426', { style: STYLE.SPEAR, shirt: T, shirtTeam: true, pants: C.dmetal, head: 'nasal', chain: C.mail, chest: C.gold, right: lance, cape: true, forearm: C.gold }, { barding: true, armor: C.gold });
    case 'cavalry_archer': return make(C.horse, { style: STYLE.BOW, shirt: T, shirtTeam: true, pants: C.brown, head: 'hood', left: bow(), quiver: true });
    case 'heavy_cavalry_archer': return make(C.horse2, { style: STYLE.BOW, shirt: T, shirtTeam: true, pants: C.brown, head: 'helmet', chest: C.mail, left: bow(), quiver: true }, { barding: true });
    case 'mangudai': return make('#7b5a3a', { style: STYLE.BOW, shirt: '#6a4a2e', pants: C.brown, sleeve: T, sleeveTeam: true, head: 'kettle', left: bow(), quiver: true, beard: C.black, hair: C.black });
  }
  // camels
  const camel = (s: Spec) => {
    const col = C.camel;
    const q: QuadSpec = {
      col, legTop: 0.46, legR: 0.03, bodyY: 0.58, bodyLen: 0.42, bodyR: 0.12, fx: 0.2, bx: -0.2, lz: 0.07, hoof: '#8a7050',
      neckPiv: [0.24, 0.62], tailPiv: [-0.32, 0.62],
      neck: (m) => {
        m.cyl(0.05, 0.065, 0.24, 8, col, 0.32, 0.6, 0, { rz: -1.2 });
        m.cyl(0.045, 0.05, 0.24, 8, col, 0.42, 0.76, 0, { rz: -0.15 });
        m.box(0.18, 0.08, 0.08, col, 0.5, 0.87, 0, { rz: 0.25 });
        m.box(0.012, 0.016, 0.016, C.eye, 0.47, 0.9, 0.042);
        m.box(0.012, 0.016, 0.016, C.eye, 0.47, 0.9, -0.042);
      },
      tail: (m) => m.box(0.03, 0.18, 0.03, col, -0.34, 0.55, 0, { rz: 0.3 }),
      body: (m) => {
        m.ball(0.13, col, 0.0, 0.72, 0, {}, 0.8, 1);
        m.box(0.24, 0.03, 0.28, C.team, -0.06, 0.72, 0, { team: true });
        m.box(0.18, 0.05, 0.22, C.leather, -0.1, 0.75, 0);
      },
    };
    quad(mb, q, piv);
    rider(mb, s, piv, 0.76);
    return s.style;
  };
  if (t === 'camel_rider') return camel({ style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.linen, head: 'turban', right: sword(0.3), beard: C.black });
  if (t === 'heavy_camel_rider') return camel({ style: STYLE.ONEHAND, shirt: T, shirtTeam: true, pants: C.linen, head: 'turban', chest: C.mail, right: sword(0.32), shield: { col: T, team: true, shape: 'round' } });
  if (t === 'mameluke') return camel({ style: STYLE.THROW, shirt: T, shirtTeam: true, pants: C.linen, head: 'turban', chest: C.gold, right: katana, cape: true, beard: C.black });
  if (t === 'war_elephant') {
    const col = C.ele;
    const q: QuadSpec = {
      col, legTop: 0.46, legR: 0.085, bodyY: 0.78, bodyLen: 0.6, bodyR: 0.3, fx: 0.3, bx: -0.3, lz: 0.17, hoof: '#6a6a6a',
      neckPiv: [0.45, 0.88], tailPiv: [-0.6, 0.85],
      neck: (m) => {
        m.ball(0.22, col, 0.6, 0.92, 0, {}, 1.05, 1);
        m.cyl(0.07, 0.11, 0.42, 8, col, 0.78, 0.62, 0, { rz: 0.2 });
        m.cyl(0.04, 0.07, 0.15, 8, col, 0.85, 0.37, 0, { rz: -0.5 });
        m.box(0.04, 0.32, 0.26, '#7a7a7a', 0.5, 0.92, 0.24, { ry: 0.5 });
        m.box(0.04, 0.32, 0.26, '#7a7a7a', 0.5, 0.92, -0.24, { ry: -0.5 });
        m.cone(0.035, 0.3, 6, C.white, 0.86, 0.72, 0.12, { rz: -1.9 });
        m.cone(0.035, 0.3, 6, C.white, 0.86, 0.72, -0.12, { rz: -1.9 });
        m.box(0.012, 0.02, 0.02, C.eye, 0.76, 1.0, 0.13);
        m.box(0.012, 0.02, 0.02, C.eye, 0.76, 1.0, -0.13);
        m.box(0.1, 0.12, 0.3, C.team, 0.66, 1.08, 0, { team: true });
      },
      tail: (m) => m.box(0.03, 0.3, 0.03, col, -0.62, 0.7, 0, { rz: 0.2 }),
      body: (m) => {
        m.box(0.6, 0.1, 0.66, C.team, 0, 1.07, 0, { team: true });
        m.box(0.62, 0.03, 0.68, C.gold, 0, 1.02, 0);
        for (const [x, z] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) m.boxB(0.04, 0.3, 0.04, C.dwood, x, 1.12, z);
        m.boxB(0.5, 0.12, 0.5, C.dwood, 0, 1.12, 0);
        m.pyramid(0.6, 0.6, 0.25, C.gold, 0, 1.42, 0);
      },
    };
    quad(mb, q, piv);
    rider(mb, { style: STYLE.SPEAR, shirt: T, shirtTeam: true, pants: C.linen, head: 'turban', right: spear(0.7), beard: C.black }, piv, 1.24);
    return STYLE.SPEAR;
  }
  return STYLE.NONE;
}

function animal(mb: MB, t: string, piv: Float32Array) {
  switch (t) {
    case 'sheep': {
      const q: QuadSpec = {
        col: '#3a3533', legTop: 0.15, legR: 0.018, bodyY: 0.26, bodyLen: 0.18, bodyR: 0.1, fx: 0.09, bx: -0.09, lz: 0.055,
        neckPiv: [0.12, 0.3], tailPiv: [-0.18, 0.3],
        neck: (m) => {
          m.box(0.12, 0.09, 0.08, '#3a3533', 0.21, 0.32, 0, { rz: 0.3 });
          m.box(0.03, 0.03, 0.08, '#3a3533', 0.17, 0.36, 0.06, { rx: 0.6 });
          m.box(0.03, 0.03, 0.08, '#3a3533', 0.17, 0.36, -0.06, { rx: -0.6 });
          m.ball(0.06, C.sheep, 0.16, 0.37, 0, {}, 0.8);
          if (m.realistic) m.cyl(0.048, 0.048, 0.018, 12, C.team, 0.147, 0.302, 0, { team: true, surface: 'cloth', rz: -Math.PI / 2 + 0.3 });
        },
        body: (m) => {
          if (!m.realistic) { m.ball(0.17, C.sheep, 0, 0.27, 0, {}, 0.75, 1); m.ball(0.1, C.sheep, 0.1, 0.3, 0.06); m.ball(0.1, C.sheep, -0.1, 0.3, -0.05); return; }
          m.pushScale(1.3, 1, 1);
          m.ball(0.135, C.sheep, 0, 0.27, 0, { surface: 'wool' }, 0.8);
          m.pop();
          for (let curl = 0; curl < 32; curl++) {
            const a = curl * 2.399, dx = (curl % 8) / 7 * 0.27 - 0.135;
            const r = 0.11 * Math.sqrt(Math.max(0.3, 1 - (dx / 0.18) ** 2));
            m.ball(0.024, C.sheep, dx, 0.28 + Math.sin(a) * r * 0.65, Math.cos(a) * r, { surface: 'wool' }, 0.8);
          }
        },
        tail: (m) => m.ball(0.04, C.sheep, -0.19, 0.28, 0),
      };
      quad(mb, q, piv);
      return;
    }
    case 'deer': {
      const col = C.deer;
      quad(mb, {
        col, legTop: 0.3, legR: 0.018, bodyY: 0.37, bodyLen: 0.3, bodyR: 0.08, fx: 0.15, bx: -0.15, lz: 0.05,
        neckPiv: [0.17, 0.4], tailPiv: [-0.24, 0.42],
        neck: (m) => {
          m.cyl(0.035, 0.045, 0.2, 7, col, 0.22, 0.48, 0, { rz: -0.4 });
          m.box(0.15, 0.07, 0.07, col, 0.3, 0.58, 0, { rz: 0.4 });
          for (const s of [-1, 1]) { m.box(0.016, 0.15, 0.016, '#e8dcc0', 0.25, 0.68, 0.035 * s, { rx: 0.4 * s }); m.box(0.07, 0.014, 0.014, '#e8dcc0', 0.27, 0.73, 0.07 * s); m.cone(0.02, 0.06, 4, col, 0.24, 0.63, 0.06 * s, { rx: 1.2 * s }); }
          m.box(0.012, 0.014, 0.014, C.eye, 0.32, 0.6, 0.035); m.box(0.012, 0.014, 0.014, C.eye, 0.32, 0.6, -0.035);
        },
        body: (m) => m.box(0.14, 0.06, 0.12, '#f1e8d8', -0.02, 0.32, 0),
        tail: (m) => m.box(0.04, 0.06, 0.04, '#f1e8d8', -0.26, 0.42, 0),
      }, piv);
      return;
    }
    case 'boar': {
      const col = C.boar;
      quad(mb, {
        col, legTop: 0.13, legR: 0.025, bodyY: 0.24, bodyLen: 0.26, bodyR: 0.11, fx: 0.12, bx: -0.12, lz: 0.06,
        neckPiv: [0.16, 0.25], tailPiv: [-0.25, 0.28],
        neck: (m) => {
          m.box(0.16, 0.14, 0.14, col, 0.27, 0.23, 0);
          m.box(0.05, 0.07, 0.08, '#b88a7a', 0.36, 0.2, 0);
          m.cone(0.014, 0.08, 4, C.white, 0.34, 0.19, 0.055, { rz: -0.6 });
          m.cone(0.014, 0.08, 4, C.white, 0.34, 0.19, -0.055, { rz: -0.6 });
          m.box(0.012, 0.014, 0.014, '#c03020', 0.33, 0.27, 0.05); m.box(0.012, 0.014, 0.014, '#c03020', 0.33, 0.27, -0.05);
          m.cone(0.03, 0.05, 4, col, 0.22, 0.32, 0.05); m.cone(0.03, 0.05, 4, col, 0.22, 0.32, -0.05);
        },
        body: (m) => m.box(0.34, 0.05, 0.05, '#2b211b', 0.0, 0.36, 0),
        tail: (m) => m.box(0.02, 0.07, 0.02, col, -0.26, 0.26, 0),
      }, piv);
      return;
    }
    case 'wolf': {
      const col = C.wolf;
      quad(mb, {
        col, legTop: 0.2, legR: 0.02, bodyY: 0.3, bodyLen: 0.26, bodyR: 0.075, fx: 0.13, bx: -0.13, lz: 0.045,
        neckPiv: [0.16, 0.33], tailPiv: [-0.21, 0.33],
        neck: (m) => {
          m.box(0.13, 0.11, 0.1, col, 0.25, 0.37, 0);
          m.box(0.1, 0.05, 0.06, '#5d5d60', 0.34, 0.34, 0);
          m.cone(0.026, 0.07, 4, col, 0.22, 0.46, 0.035); m.cone(0.026, 0.07, 4, col, 0.22, 0.46, -0.035);
          m.box(0.012, 0.014, 0.014, '#ffd35a', 0.31, 0.39, 0.03); m.box(0.012, 0.014, 0.014, '#ffd35a', 0.31, 0.39, -0.03);
        },
        tail: (m) => m.box(0.18, 0.045, 0.045, col, -0.29, 0.29, 0, { rz: 0.5 }),
      }, piv);
      return;
    }
  }
}

// ---------------------------------------------------------------- dispatch

export const RIGGED = new Set([
  'villager', 'monk', 'militia', 'man_at_arms', 'long_swordsman', 'two_handed_swordsman', 'champion', 'spearman', 'pikeman', 'halberdier',
  'archer', 'crossbowman', 'arbalester', 'skirmisher', 'elite_skirmisher', 'hand_cannoneer', 'longbowman', 'throwing_axeman', 'teutonic_knight',
  'samurai', 'berserk', 'chu_ko_nu', 'scout_cavalry', 'light_cavalry', 'hussar', 'knight', 'cavalier', 'paladin', 'cataphract', 'cavalry_archer',
  'heavy_cavalry_archer', 'mangudai', 'camel_rider', 'heavy_camel_rider', 'mameluke', 'war_elephant', 'sheep', 'deer', 'boar', 'wolf',
]);
export const MOUNTED = new Set(['scout_cavalry', 'light_cavalry', 'hussar', 'knight', 'cavalier', 'paladin', 'cataphract', 'cavalry_archer', 'heavy_cavalry_archer', 'mangudai', 'camel_rider', 'heavy_camel_rider', 'mameluke', 'war_elephant']);
export const QUADS = new Set(['sheep', 'deer', 'boar', 'wolf']);

/** Build a rigged unit model. Returns the rig description. */
export function buildRigged(mb: MB, t: string, variant: string): Rig {
  const piv = pivots();
  let style: number = STYLE.NONE;
  let mounted = false, quadOnly = false;
  if (t === 'villager') villager(mb, variant || 'm0', piv);
  else if (MOUNTED.has(t)) { style = cavalry(mb, t, piv); mounted = true; }
  else if (QUADS.has(t)) { animal(mb, t, piv); quadOnly = true; }
  else {
    const s = specFor(t);
    style = s.style;
    human(mb, s, piv);
    if (t === 'monk') {
      if (mb.realistic) mb.pushScale(...HUMAN_SCALE);
      mb.bone = BN.TORSO;
      mb.tag = TAG.RELIC;
      mb.box(0.1, 0.08, 0.09, C.gold, 0.12, 0.47, 0);
      mb.box(0.02, 0.06, 0.02, '#b6402f', 0.17, 0.48, 0);
      mb.tag = 0; mb.bone = 0;
      if (mb.realistic) mb.pop();
    }
  }
  return { piv, mounted, quad: quadOnly, style, graze: t === 'sheep' || t === 'deer' };
}

export { THREE };
