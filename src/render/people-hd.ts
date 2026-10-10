// High-detail characters for the realistic (AoE4-style) renderer.
// Same skeleton and pivots contract as people.ts (facing +X, right side +Z, rest pose standing with
// arms hanging), but with realistic proportions, sculpted limbs and layered clothing and armour.

import * as THREE from 'three';
import type { MB, Col } from './mb';
import type { Surface } from './surfaces';
import { BN, STYLE } from './rig';
import type { Spec } from './people';

const P = {
  skin: '#e2ae88', lip: '#a8604e', eye: '#231c18', brow: '#3a2a20',
  steel: '#b9c0c7', dsteel: '#6c747d', mail: '#8f969d', gold: '#d9aa3a', brass: '#b8893a',
  leather: '#6d4a2c', dleather: '#4a3220', boot: '#3e2b1d', wood: '#7a5130', dwood: '#4f3420',
  linen: '#d8cdb0', white: '#efe9dc', team: '#ffffff', rope: '#b49a62', straw: '#d8b862',
};

// ---------------------------------------------------------------- geometry helpers

const geoCache = new Map<string, THREE.BufferGeometry>();

/** 0 = full detail (close-ups), 1 = gameplay-distance detail. */
let LOD = 0;
export function setHDLod(l: number) { LOD = l; }

/** Closed lathe ("turned") shape along +Y from 0..len, radii sampled evenly bottom→top, with rounded caps. */
function turned(radii: number[], len: number, seg = 9, capBottom = true, capTop = true): THREE.BufferGeometry {
  if (LOD) seg = Math.min(seg, 6);
  const key = `t|${radii.map((r) => r.toFixed(4)).join(',')}|${len.toFixed(4)}|${seg}|${capBottom}|${capTop}`;
  let g = geoCache.get(key);
  if (g) return g;
  const pts: THREE.Vector2[] = [];
  const n = radii.length - 1;
  if (capBottom) { pts.push(new THREE.Vector2(0.0001, 0)); pts.push(new THREE.Vector2(radii[0] * 0.72, len * 0.012)); }
  for (let i = 0; i <= n; i++) {
    const y = (capBottom ? len * 0.04 : 0) + (len * (1 - (capBottom ? 0.04 : 0) - (capTop ? 0.04 : 0)) * i) / n;
    pts.push(new THREE.Vector2(radii[i], y));
  }
  if (capTop) { pts.push(new THREE.Vector2(radii[n] * 0.72, len * 0.988)); pts.push(new THREE.Vector2(0.0001, len)); }
  g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

/** Open, gently folded garment shell (skirts, cloaks, robes) from y0 (bottom) up to y1. */
function drape(rBottom: number, rTop: number, h: number, folds: number, depth: number, seg = 14, arc = Math.PI * 2, start = 0): THREE.BufferGeometry {
  if (LOD) seg = Math.max(6, Math.round(seg * 0.6));
  const key = `d|${rBottom}|${rTop}|${h}|${folds}|${depth}|${seg}|${arc}|${start}`;
  let g = geoCache.get(key);
  if (g) return g;
  g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 2, true, start, arc);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const t = (h / 2 - y) / h; // 0 at top, 1 at hem
    const f = 1 + Math.sin(a * folds) * depth * t + Math.sin(a * folds * 2.3 + 1.7) * depth * 0.35 * t;
    p.setXYZ(i, x * f, y, z * f);
  }
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

const ELLIPSOID_HI = new THREE.SphereGeometry(1, 12, 8);
const ELLIPSOID_LO = new THREE.SphereGeometry(1, 8, 5);
const BEAD = new THREE.SphereGeometry(1, 7, 5);
const ELL = () => (LOD ? ELLIPSOID_LO : ELLIPSOID_HI);
const DOM = () => (LOD ? DOME_LO : DOME_HI);
const FAC = () => (LOD ? FACE_LO : FACE_HI);
const DOME_HI = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
const DOME_LO = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
const TORUS = new THREE.TorusGeometry(1, 0.12, 4, 12);

const faceGeo = (ws: number, hs: number) => {
  const geo = new THREE.SphereGeometry(1, ws, hs);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // jaw taper, flatter cheeks, a slight brow ridge and a defined chin
    const jaw = y < -0.15 ? 1 - (-y - 0.15) * 0.42 : 1;
    z *= 0.86 * jaw;
    if (x > 0) {
      x *= 0.9 * (y < -0.15 ? 1 - (-y - 0.15) * 0.15 : 1);
      if (y > 0.18 && y < 0.42) x += 0.05 * Math.cos((y - 0.3) * 12) * Math.max(0, 1 - Math.abs(z) * 1.6);
    }
    p.setXYZ(i, x, y * 1.12, z);
  }
  geo.computeVertexNormals();
  return geo;
};
const FACE_HI = faceGeo(14, 10);
const FACE_LO = faceGeo(9, 6);

const NOSE = (() => {
  const g = new THREE.ConeGeometry(1, 1, 4, 1);
  g.rotateZ(-Math.PI / 2);
  return g;
})();

/** Low-poly sphere for small details (eyes, rivets, buttons). */
function bead(mb: MB, r: number, col: Col, x: number, y: number, z: number, o: Opts = {}, sy = 1) {
  if (LOD && r < 0.015) return;
  mb.add(BEAD, col, x, y, z, o, r, r * sy, r);
}

/** Cylinder with an explicit, modest segment count (MB's realistic cylinders are heavily tessellated). */
function cy(mb: MB, rt: number, rb: number, h: number, seg: number, col: Col, x: number, y: number, z: number, o: Opts = {}) {
  mb.add(cylGeo(rt, rb, Math.min(seg, 10)), col, x, y, z, o, 1, h, 1);
}
const cylCache = new Map<string, THREE.BufferGeometry>();
function cylGeo(rt: number, rb: number, seg: number) {
  const k = rt + '|' + rb + '|' + seg;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, 1, seg, 1); cylCache.set(k, g); }
  return g;
}

type Opts = { team?: boolean; rx?: number; ry?: number; rz?: number; surface?: Surface };

// ---------------------------------------------------------------- proportions (rest pose)

const Y = {
  hip: 0.395, knee: 0.215, ankle: 0.048, pelvis: 0.4, waist: 0.452, chest: 0.535, shoulder: 0.595, neck: 0.615,
  head: 0.672, elbow: 0.47, wrist: 0.355,
};
const Z = { hip: 0.049, shoulder: 0.1, elbow: 0.106, wrist: 0.11 };

// ---------------------------------------------------------------- equipment

type HandFn = ((mb: MB) => void) & { kind?: string; len?: number };

function hdItem(mb: MB, item: HandFn) {
  const k = item.kind;
  const g = -0.03; // grip sits in the palm, just below the wrist pivot
  switch (k) {
    case 'sword': {
      const L = item.len ?? 0.3;
      cy(mb, 0.011, 0.011, 0.075, 8, P.dleather, -0.01, g, 0, { rz: Math.PI / 2, surface: 'leather' });
      bead(mb, 0.016, P.brass, -0.05, g, 0, { surface: 'gold' });
      mb.box(0.014, 0.014, 0.1, P.dsteel, 0.032, g, 0, { surface: 'metal' });
      mb.box(L, 0.032, 0.007, P.steel, 0.04 + L / 2, g, 0, { surface: 'metal' });
      mb.box(L * 0.85, 0.008, 0.009, P.dsteel, 0.04 + L * 0.44, g, 0, { surface: 'metal' });
      mb.add(NOSE, P.steel, 0.04 + L + 0.022, g, 0, { surface: 'metal' }, 0.045, 0.016, 0.004);
      return true;
    }
    case 'bigSword': {
      const L = 0.5;
      cy(mb, 0.012, 0.012, 0.13, 8, P.dleather, -0.03, g, 0, { rz: Math.PI / 2, surface: 'leather' });
      bead(mb, 0.02, P.brass, -0.1, g, 0, { surface: 'gold' });
      mb.box(0.016, 0.016, 0.14, P.dsteel, 0.04, g, 0, { surface: 'metal' });
      mb.box(L, 0.038, 0.008, P.steel, 0.05 + L / 2, g, 0, { surface: 'metal' });
      mb.box(L * 0.85, 0.009, 0.01, P.dsteel, 0.05 + L * 0.44, g, 0, { surface: 'metal' });
      mb.add(NOSE, P.steel, 0.05 + L + 0.025, g, 0, { surface: 'metal' }, 0.05, 0.019, 0.004);
      return true;
    }
    case 'spear': case 'lance': {
      const L = item.len ?? 0.8;
      const lance = k === 'lance';
      cy(mb, lance ? 0.014 : 0.01, lance ? 0.016 : 0.011, L, 8, lance ? P.dwood : P.wood, L * 0.22, g, 0, { rz: Math.PI / 2, surface: 'wood' });
      mb.add(NOSE, P.steel, L * 0.72 + 0.06, g, 0, { surface: 'metal' }, 0.09, 0.022, 0.022);
      cy(mb, 0.014, 0.012, 0.04, 8, P.dsteel, L * 0.72, g, 0, { rz: Math.PI / 2, surface: 'metal' });
      if (lance) { cy(mb, 0.032, 0.014, 0.08, 10, P.steel, 0.03, g, 0, { rz: Math.PI / 2, surface: 'metal' }); mb.box(0.09, 0.055, 0.004, P.team, L * 0.62, g + 0.035, 0, { team: true }); }
      return true;
    }
    case 'halberd': {
      const L = 0.88;
      cy(mb, 0.01, 0.011, L, 8, P.wood, L * 0.22, g, 0, { rz: Math.PI / 2, surface: 'wood' });
      mb.add(NOSE, P.steel, L * 0.72 + 0.05, g, 0, { surface: 'metal' }, 0.07, 0.02, 0.02);
      mb.box(0.075, 0.11, 0.008, P.steel, L * 0.64, g + 0.05, 0, { surface: 'metal' });
      mb.box(0.03, 0.05, 0.008, P.steel, L * 0.64, g - 0.045, 0, { rz: 0.5, surface: 'metal' });
      return true;
    }
    case 'axe': {
      const L = item.len ?? 0.32;
      cy(mb, 0.011, 0.013, L, 8, P.wood, L * 0.33, g, 0, { rz: Math.PI / 2, surface: 'wood' });
      mb.box(0.05, 0.05, 0.016, P.dsteel, L * 0.74, g + 0.02, 0, { surface: 'metal' });
      mb.box(0.03, 0.11, 0.006, P.steel, L * 0.74 + 0.02, g + 0.035, 0, { surface: 'metal' });
      return true;
    }
    case 'bow': {
      const big = (item.len ?? 0) > 0;
      const Lh = big ? 0.29 : 0.23;
      // a smoothly recurved stave: chain of short segments
      for (let i = -6; i < 6; i++) {
        const t0 = i / 6, t1 = (i + 1) / 6;
        const x0 = 0.035 * (1 - t0 * t0) - 0.012 * Math.max(0, Math.abs(t0) - 0.85) * 10, x1 = 0.035 * (1 - t1 * t1) - 0.012 * Math.max(0, Math.abs(t1) - 0.85) * 10;
        const y0 = t0 * Lh, y1 = t1 * Lh;
        const len = Math.hypot(x1 - x0, y1 - y0);
        cy(mb, 0.0085, 0.0085, len, 6, P.dwood, (x0 + x1) / 2 + 0.005, (y0 + y1) / 2, 0, { rz: -Math.atan2(x1 - x0, y1 - y0), surface: 'wood' });
      }
      cy(mb, 0.013, 0.013, 0.05, 8, P.dleather, 0.04, 0, 0, { surface: 'leather' });
      cy(mb, 0.0018, 0.0018, Lh * 2 - 0.01, 4, P.linen, -0.018, 0, 0, { surface: 'cloth' });
      return true;
    }
    case 'crossbow': {
      mb.box(0.27, 0.03, 0.034, P.wood, 0.1, g, 0, { surface: 'wood' });
      mb.box(0.02, 0.018, 0.3, P.dsteel, 0.21, g + 0.012, 0, { surface: 'metal' });
      cy(mb, 0.0015, 0.0015, 0.29, 4, P.linen, 0.16, g + 0.014, 0, { rx: Math.PI / 2, surface: 'cloth' });
      mb.box(0.03, 0.03, 0.04, P.dsteel, 0.24, g, 0, { surface: 'metal' });
      return true;
    }
    case 'gun': {
      cy(mb, 0.013, 0.016, 0.42, 10, P.dsteel, 0.2, g + 0.006, 0, { rz: Math.PI / 2, surface: 'metal' });
      mb.box(0.18, 0.045, 0.034, P.wood, -0.03, g - 0.006, 0, { surface: 'wood' });
      cy(mb, 0.019, 0.019, 0.02, 10, P.brass, 0.41, g + 0.006, 0, { rz: Math.PI / 2, surface: 'gold' });
      return true;
    }
    case 'staff': {
      cy(mb, 0.012, 0.014, 0.7, 8, P.wood, 0.16, g, 0, { rz: Math.PI / 2, surface: 'wood' });
      mb.add(TORUS, P.dwood, 0.51, g, 0, { ry: Math.PI / 2, surface: 'wood' }, 0.03, 0.03, 0.03);
      return true;
    }
    case 'javelin': {
      cy(mb, 0.0075, 0.0075, 0.5, 6, P.wood, 0.12, g, 0, { rz: Math.PI / 2, surface: 'wood' });
      mb.add(NOSE, P.steel, 0.4, g, 0, { surface: 'metal' }, 0.06, 0.016, 0.016);
      return true;
    }
    case 'throwingAxe': {
      cy(mb, 0.01, 0.011, 0.18, 8, P.wood, 0.06, g, 0, { rz: Math.PI / 2, surface: 'wood' });
      mb.box(0.045, 0.08, 0.008, P.steel, 0.13, g + 0.02, 0, { rz: -0.2, surface: 'metal' });
      return true;
    }
    case 'katana': {
      cy(mb, 0.011, 0.011, 0.11, 8, '#2a2222', -0.02, g, 0, { rz: Math.PI / 2, surface: 'cloth' });
      cy(mb, 0.026, 0.026, 0.01, 12, P.gold, 0.04, g, 0, { rz: Math.PI / 2, surface: 'gold' });
      for (let i = 0; i < 6; i++) mb.box(0.065, 0.024, 0.006, P.steel, 0.08 + i * 0.058, g + 0.0015 * i * i, 0, { rz: 0.025 * i, surface: 'metal' });
      return true;
    }
  }
  return false;
}

function shieldHD(mb: MB, sh: NonNullable<Spec['shield']>) {
  // strapped to the forearm, facing forward when the arm is raised in guard
  mb.push(0.0, -0.035, -0.035, -2.45, 0, 0);
  const team = !!sh.team;
  if (sh.shape === 'round' || sh.shape === 'buckler') {
    const r = sh.shape === 'buckler' ? 0.07 : 0.12;
    cy(mb, r, r * 0.96, 0.018, 24, sh.col, 0, 0, 0, { team, surface: team ? 'cloth' : 'wood' });
    mb.add(TORUS, P.dsteel, 0, 0.004, 0, { rx: Math.PI / 2, surface: 'metal' }, r, r, r * 0.5);
    mb.add(DOM(), P.steel, 0, 0.009, 0, { surface: 'metal' }, r * 0.28, r * 0.18, r * 0.28);
    if (team && r > 0.1) for (let i = 0; i < 4; i++) mb.box(0.012, 0.006, r * 1.6, P.white, 0, 0.011, 0, { ry: i * Math.PI / 4 * 2 + Math.PI / 4, surface: 'cloth' });
  } else if (sh.shape === 'kite') {
    const sk = new THREE.Shape();
    sk.moveTo(0.13, 0); sk.quadraticCurveTo(0.13, 0.1, 0, 0.1); sk.quadraticCurveTo(-0.08, 0.1, -0.2, 0);
    sk.quadraticCurveTo(-0.08, -0.1, 0, -0.1); sk.quadraticCurveTo(0.13, -0.1, 0.13, 0);
    const g = new THREE.ExtrudeGeometry(sk, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 6 });
    g.rotateX(Math.PI / 2);
    mb.add(g, sh.col, 0, 0.01, 0, { team, surface: team ? 'cloth' : 'wood' });
    g.dispose();
    // heraldic cross
    mb.box(0.28, 0.006, 0.026, P.gold, -0.03, 0.017, 0, { surface: 'gold' });
    mb.box(0.026, 0.006, 0.15, P.gold, 0.05, 0.017, 0, { surface: 'gold' });
  } else {
    mb.box(0.3, 0.02, 0.2, sh.col, 0, 0, 0, { team, surface: team ? 'cloth' : 'wood' });
    mb.box(0.31, 0.01, 0.025, P.dsteel, 0, 0.012, 0, { surface: 'metal' });
  }
  mb.pop();
}

// ---------------------------------------------------------------- head & headgear

function headHD(mb: MB, s: Spec, skin: Col) {
  const y = Y.head;
  const hair = s.hair ?? '#4a3222';
  mb.add(FAC(), skin, 0, y, 0, { surface: 'skin' }, 0.05, 0.05, 0.05);
  // features (too small to see at gameplay distance)
  if (!LOD) {
  mb.add(NOSE, skin, 0.05, y - 0.004, 0, { surface: 'skin' }, 0.018, 0.024, 0.012);
  for (const s2 of [-1, 1]) {
    bead(mb, 0.0055, P.eye, 0.043, y + 0.01, 0.017 * s2, { surface: 'skin' }, 0.8);
    mb.box(0.006, 0.0045, 0.018, s.beard ?? P.brow, 0.046, y + 0.02, 0.017 * s2, { rx: s2 * -0.15, surface: 'cloth' });
    bead(mb, 0.011, skin, -0.002, y + 0.002, 0.045 * s2, { surface: 'skin' }, 1.3);
  }
  mb.box(0.004, 0.003, 0.016, P.lip, 0.044, y - 0.026, 0, { surface: 'skin' });
  }
  if (s.beard) {
    mb.add(ELL(), s.beard, 0.022, y - 0.03, 0, { surface: 'cloth' }, 0.03, 0.03, 0.04);
    mb.box(0.008, 0.008, 0.032, s.beard, 0.046, y - 0.017, 0, { surface: 'cloth' });
  }
  const capHair = (sy = 1) => mb.add(DOM(), hair, -0.006, y - 0.004, 0, { surface: 'cloth' }, 0.053, 0.066 * sy, 0.05);
  switch (s.head ?? 'hair') {
    case 'hair':
      capHair();
      mb.add(ELL(), hair, -0.022, y - 0.012, 0, { surface: 'cloth' }, 0.034, 0.042, 0.045);
      break;
    case 'long':
      capHair();
      mb.add(ELL(), hair, -0.03, y - 0.04, 0, { surface: 'cloth' }, 0.03, 0.075, 0.05);
      break;
    case 'bun':
      capHair();
      mb.add(ELL(), hair, -0.028, y - 0.012, 0, { surface: 'cloth' }, 0.027, 0.04, 0.046);
      bead(mb, 0.022, hair, -0.055, y + 0.012, 0, { surface: 'cloth' });
      mb.add(DOM(), P.linen, -0.006, y + 0.012, 0, { surface: 'cloth', rz: 0.25 }, 0.056, 0.05, 0.054);
      break;
    case 'cap':
      capHair(0.6);
      mb.add(DOM(), P.team, -0.004, y + 0.012, 0, { team: true, surface: 'cloth' }, 0.057, 0.06, 0.055);
      cy(mb, 0.058, 0.058, 0.012, 16, P.team, -0.004, y + 0.012, 0, { team: true, surface: 'cloth' });
      mb.add(ELL(), P.team, -0.03, y + 0.06, 0, { team: true, surface: 'cloth', rz: 0.6 }, 0.022, 0.035, 0.02);
      break;
    case 'straw':
      capHair(0.6);
      mb.add(DOM(), P.straw, -0.004, y + 0.02, 0, { surface: 'thatch' }, 0.045, 0.045, 0.045);
      cy(mb, 0.1, 0.1, 0.006, 20, P.straw, -0.004, y + 0.022, 0, { surface: 'thatch' });
      cy(mb, 0.046, 0.046, 0.01, 16, '#7a4a2a', -0.004, y + 0.027, 0, { surface: 'cloth' });
      break;
    case 'hood': {
      const col = s.robe ?? '#5a6a3a';
      mb.add(DOM(), col, -0.02, y - 0.002, 0, { surface: 'wool' }, 0.058, 0.072, 0.06);
      mb.add(ELL(), col, -0.03, y - 0.015, 0, { surface: 'wool' }, 0.04, 0.05, 0.058);
      mb.add(ELL(), col, -0.02, y - 0.062, 0, { surface: 'wool' }, 0.07, 0.03, 0.095);
      mb.add(ELL(), col, -0.065, y + 0.03, 0, { surface: 'wool', rz: 0.9 }, 0.012, 0.05, 0.02);
      break;
    }
    case 'helmet': // spangenhelm / cervelliere
      mb.add(DOM(), P.steel, -0.002, y + 0.006, 0, { surface: 'metal' }, 0.058, 0.064, 0.056);
      cy(mb, 0.059, 0.059, 0.012, 20, P.dsteel, -0.002, y + 0.008, 0, { surface: 'metal' });
      for (let i = 0; i < 4; i++) mb.box(0.006, 0.06, 0.012, P.dsteel, -0.002 + Math.cos(i * Math.PI / 2) * 0.03, y + 0.045, Math.sin(i * Math.PI / 2) * 0.03, { ry: -i * Math.PI / 2, rz: (i % 2 ? 0 : 1) * (i === 0 ? -0.6 : 0.6), rx: (i % 2) * (i === 1 ? 0.6 : -0.6), surface: 'metal' });
      break;
    case 'nasal':
      cy(mb, 0, 0.058, 0.085, 20, P.steel, -0.002, y + 0.05, 0, { surface: 'metal' });
      cy(mb, 0.059, 0.059, 0.014, 20, P.dsteel, -0.002, y + 0.012, 0, { surface: 'metal' });
      mb.box(0.006, 0.05, 0.011, P.dsteel, 0.058, y - 0.006, 0, { surface: 'metal' });
      mb.add(DOM(), P.mail, -0.012, y - 0.02, 0, { surface: 'metal', rx: Math.PI }, 0.06, 0.045, 0.06);
      break;
    case 'coif':
      mb.add(ELL(), P.mail, -0.006, y + 0.004, 0, { surface: 'metal' }, 0.06, 0.066, 0.058);
      mb.add(ELL(), P.mail, -0.012, y - 0.05, 0, { surface: 'metal' }, 0.065, 0.03, 0.09);
      mb.add(FAC(), skin, 0.008, y - 0.002, 0, { surface: 'skin' }, 0.046, 0.044, 0.04);
      for (const s2 of [-1, 1]) bead(mb, 0.0055, P.eye, 0.048, y + 0.01, 0.016 * s2, { surface: 'skin' }, 0.8);
      mb.add(DOM(), P.steel, -0.004, y + 0.03, 0, { surface: 'metal' }, 0.06, 0.05, 0.058);
      break;
    case 'kettle':
      capHair(0.6);
      mb.add(DOM(), P.dsteel, -0.003, y + 0.014, 0, { surface: 'metal' }, 0.058, 0.062, 0.057);
      cy(mb, 0.098, 0.088, 0.008, 24, P.dsteel, -0.003, y + 0.012, 0, { surface: 'metal' });
      mb.add(TORUS, P.steel, -0.003, y + 0.016, 0, { rx: Math.PI / 2, surface: 'metal' }, 0.098, 0.098, 0.04);
      break;
    case 'great':
      cy(mb, 0.061, 0.062, 0.12, 20, P.steel, 0, y + 0.006, 0, { surface: 'metal' });
      cy(mb, 0.05, 0.061, 0.02, 20, P.steel, 0, y + 0.075, 0, { surface: 'metal' });
      mb.box(0.006, 0.008, 0.09, '#141414', 0.061, y + 0.016, 0, { surface: 'metal' });
      mb.box(0.008, 0.07, 0.012, P.brass, 0.062, y - 0.005, 0, { surface: 'gold' });
      mb.box(0.008, 0.012, 0.11, P.brass, 0.061, y + 0.03, 0, { surface: 'gold' });
      for (let i = 0; i < 3; i++) for (const s2 of [-1, 1]) bead(mb, 0.0035, '#141414', 0.058, y - 0.025 - i * 0.012, 0.025 * s2, { surface: 'metal' });
      mb.add(ELL(), P.team, -0.01, y + 0.1, 0, { team: true, surface: 'cloth' }, 0.025, 0.025, 0.012);
      break;
    case 'feather':
      capHair(0.6);
      mb.add(DOM(), P.team, -0.004, y + 0.016, 0, { team: true, surface: 'wool' }, 0.06, 0.05, 0.058);
      cy(mb, 0.09, 0.085, 0.008, 24, P.team, -0.004, y + 0.018, 0, { team: true, surface: 'wool' });
      mb.add(ELL(), P.white, -0.04, y + 0.07, 0.02, { surface: 'cloth', rz: 0.8 }, 0.014, 0.07, 0.008);
      break;
    case 'samurai':
      mb.add(DOM(), '#2a2424', -0.004, y + 0.01, 0, { surface: 'metal' }, 0.062, 0.062, 0.06);
      cy(mb, 0.075, 0.09, 0.03, 20, '#3a2424', -0.01, y - 0.01, 0, { surface: 'leather' });
      mb.box(0.006, 0.07, 0.11, P.gold, 0.045, y + 0.07, 0, { rz: -0.35, surface: 'gold' });
      break;
    case 'viking':
      mb.add(DOM(), P.dsteel, -0.002, y + 0.006, 0, { surface: 'metal' }, 0.058, 0.064, 0.056);
      cy(mb, 0.059, 0.059, 0.012, 20, P.dsteel, -0.002, y + 0.008, 0, { surface: 'metal' });
      mb.box(0.012, 0.025, 0.06, P.dsteel, 0.055, y + 0.005, 0, { surface: 'metal' });
      break;
    case 'turban':
      mb.add(ELL(), P.white, -0.006, y + 0.03, 0, { surface: 'cloth' }, 0.064, 0.045, 0.062);
      mb.add(TORUS, '#e6dfcf', -0.006, y + 0.02, 0, { rx: Math.PI / 2, surface: 'cloth' }, 0.058, 0.058, 0.18);
      bead(mb, 0.012, P.team, 0.058, y + 0.035, 0, { team: true, surface: 'gold' });
      break;
  }
}

// ---------------------------------------------------------------- body

export function humanHD(mb: MB, s: Spec, piv: Float32Array, ox = 0, oy = 0) {
  oy -= 0.012;
  const b = s.bulk ?? 1;
  const sp = (bone: number, x: number, y: number, z: number) => { piv[bone * 3] = x + ox; piv[bone * 3 + 1] = y + oy; piv[bone * 3 + 2] = z; };
  sp(BN.PELVIS, 0, Y.pelvis, 0); sp(BN.TORSO, 0, Y.waist, 0); sp(BN.HEAD, 0, Y.neck, 0);
  sp(BN.UARM_R, 0, Y.shoulder, Z.shoulder * b); sp(BN.LARM_R, 0, Y.elbow, Z.elbow * b); sp(BN.HAND_R, 0, Y.wrist, Z.wrist * b);
  sp(BN.UARM_L, 0, Y.shoulder, -Z.shoulder * b); sp(BN.LARM_L, 0, Y.elbow, -Z.elbow * b); sp(BN.HAND_L, 0, Y.wrist, -Z.wrist * b);
  sp(BN.THIGH_L, 0, Y.hip, -Z.hip * b); sp(BN.SHIN_L, 0, Y.knee, -Z.hip * b); sp(BN.THIGH_R, 0, Y.hip, Z.hip * b); sp(BN.SHIN_R, 0, Y.knee, Z.hip * b);
  sp(BN.CAPE, -0.065, Y.shoulder, 0);
  mb.push(ox, oy, 0);
  const skin = s.skin ?? P.skin;
  const boots = s.boots ?? P.boot;
  const armoured = !!(s.chain || s.chest);
  const pantsSurf: Surface = s.pants === '#69717a' || s.pants === P.dsteel ? 'metal' : 'cloth';

  // ---- legs
  for (const side of [-1, 1]) {
    const z = Z.hip * side * b;
    mb.bone = side < 0 ? BN.THIGH_L : BN.THIGH_R;
    if (!s.robe) mb.add(turned([0.031, 0.037, 0.042, 0.044, 0.042].map((r) => r * b), Y.hip - Y.knee + 0.025, 14), s.pants, 0, Y.knee - 0.01, z, { surface: pantsSurf });
    mb.bone = side < 0 ? BN.SHIN_L : BN.SHIN_R;
    if (!s.robe) mb.add(turned([0.024, 0.028, 0.034, 0.033, 0.031].map((r) => r * b), Y.knee - Y.ankle + 0.01, 14), s.pants, 0, Y.ankle, z, { surface: pantsSurf });
    // boot: shaft + shaped foot + sole
    mb.add(turned([0.03, 0.031, 0.034].map((r) => r * b), 0.09, 14, false, true), boots, 0, 0.03, z, { surface: 'leather' });
    mb.add(ELL(), boots, 0.024, 0.024, z, { surface: 'leather' }, 0.058, 0.026, 0.031 * b);
    mb.box(0.105, 0.01, 0.06 * b, P.dleather, 0.022, 0.005, z, { surface: 'leather' });
    if (s.boots === '#69717a' || armoured && s.pauldron) mb.add(turned([0.032, 0.035, 0.036], 0.11, 9, false, false), P.steel, 0, Y.ankle + 0.06, z, { surface: 'metal' });
  }

  // ---- hips and lower garment
  mb.bone = BN.PELVIS;
  if (!s.robe) mb.add(ELL(), s.pants, 0, Y.pelvis, 0, { surface: pantsSurf }, 0.062, 0.05, 0.088 * b);
  const hem = s.robe ? 0.02 : s.skirt ? 0.12 : s.chain ? 0.235 : 0.285;
  const skirtTop = Y.waist + 0.005;
  const skirtH = skirtTop - hem;
  if (s.robe) {
    mb.add(drape(0.13 * b, 0.082 * b, skirtH, 7, 0.06), s.robe, 0, hem + skirtH / 2, 0, { surface: 'wool' });
  } else if (s.skirt) {
    mb.add(drape(0.14 * b, 0.08 * b, skirtH, 6, 0.05), s.skirt, 0, hem + skirtH / 2, 0, { surface: 'wool' });
    mb.add(drape(0.115 * b, 0.084 * b, skirtH * 0.8, 3, 0.04, 14, 1.3, Math.PI / 2 - 0.65), P.linen, 0.006, hem + skirtH * 0.55, 0, { surface: 'cloth' });
  } else if (s.chain) {
    mb.add(drape(0.112 * b, 0.082 * b, skirtH, 9, 0.025), s.chain, 0, hem + skirtH / 2, 0, { surface: 'metal' });
    if (s.tunicTeam) {
      // surcoat panels front and back (split for the legs), over the mail
      for (const fb of [1, -1]) mb.add(drape(0.118 * b, 0.086 * b, skirtH - 0.03, 4, 0.03, 10, 1.25, fb > 0 ? Math.PI / 2 - 0.62 : -Math.PI / 2 - 0.62), P.team, 0, hem + 0.03 + (skirtH - 0.03) / 2, 0, { team: true, surface: 'cloth' });
    }
  } else {
    mb.add(drape(0.106 * b, 0.084 * b, skirtH, 8, 0.045), s.shirt, 0, hem + skirtH / 2, 0, { team: s.shirtTeam, surface: 'cloth' });
  }
  const belt = s.belt ?? P.leather;
  mb.add(turned([0.087 * b, 0.087 * b], 0.024, 9, false, false), belt, 0, Y.waist - 0.016, 0, { team: belt === P.team, surface: belt === P.team ? 'cloth' : 'leather' });
  mb.box(0.012, 0.022, 0.026, P.brass, 0.087 * b, Y.waist - 0.004, 0, { surface: 'gold' });
  if (!s.robe) mb.add(ELL(), P.leather, 0.01, Y.waist - 0.04, 0.085 * b, { surface: 'leather' }, 0.03, 0.035, 0.012);
  if (s.robe) { mb.add(TORUS, P.rope, 0, Y.waist - 0.005, 0, { rx: Math.PI / 2, surface: 'thatch' }, 0.088 * b, 0.088 * b, 0.12); cy(mb, 0.006, 0.006, 0.16, 6, P.rope, 0.07, Y.waist - 0.09, 0.03, { surface: 'thatch' }); }

  // ---- torso
  mb.bone = BN.TORSO;
  mb.push(0, Y.waist - 0.01, 0);
  mb.pushScale(0.8, 1, 1.22 * b);
  const torso = turned([0.072, 0.078, 0.086, 0.092, 0.09, 0.074, 0.04], Y.neck - Y.waist + 0.01, 9);
  const shirtCol = s.robe ?? s.shirt;
  const shirtSurf: Surface = s.robe ? 'wool' : 'cloth';
  mb.add(torso, shirtCol, 0, 0, 0, { team: s.shirtTeam && !s.robe, surface: shirtSurf });
  if (s.chain) mb.add(turned([0.076, 0.082, 0.09, 0.096, 0.094, 0.078, 0.046], Y.neck - Y.waist + 0.005, 9, false, true), s.chain, 0, 0.0, 0, { surface: 'metal' });
  if (s.chest && s.chest !== s.chain) {
    const plate = s.chest === P.steel || s.chest === '#b4bcc4' || s.chest === '#cfd4da' || s.chest === '#dce1e6' || s.chest === '#a8b0b8';
    mb.add(turned([0.079, 0.086, 0.095, 0.101, 0.097], 0.115, 9, false, false), s.chest, 0, 0.02, 0, { surface: plate ? 'metal' : 'leather' });
    if (!plate) for (let i = 0; i < 5; i++) mb.add(TORUS, s.chest, 0, 0.03 + i * 0.022, 0, { rx: Math.PI / 2, surface: 'leather' }, 0.086 + i * 0.003, 0.086 + i * 0.003, 0.08);
  }
  mb.pop(); mb.pop();
  if (s.tunicTeam || (s.shirtTeam && armoured)) {
    // tabard: team field with a contrasting heraldic band, front and back
    for (const fb of [1, -1]) {
      mb.box(0.006, 0.15, 0.1 * b, P.team, fb * 0.079, Y.chest, 0, { team: true, surface: 'cloth' });
      mb.box(0.007, 0.15, 0.022 * b, P.gold, fb * 0.081, Y.chest, 0, { surface: 'gold' });
    }
  }
  if (s.female) for (const s2 of [-1, 1]) mb.add(ELL(), shirtCol, 0.058, Y.chest - 0.005, 0.034 * s2, { surface: 'cloth' }, 0.028, 0.03, 0.032);
  // shoulders (deltoids / pauldrons)
  for (const side of [-1, 1]) {
    const col = s.pauldron ?? s.chain ?? s.sleeve ?? shirtCol;
    mb.add(ELL(), col, 0, Y.shoulder - 0.012, (Z.shoulder - 0.008) * side * b, { team: !s.pauldron && !s.chain && !!(s.sleeveTeam ?? (s.shirtTeam && !s.robe)) && !s.sleeve || (!!s.sleeveTeam && !s.pauldron && !s.chain), surface: s.pauldron || s.chain ? 'metal' : shirtSurf }, (s.pauldron ? 0.045 : 0.031) * b, s.pauldron ? 0.036 : 0.03, (s.pauldron ? 0.046 : 0.03) * b);
    if (s.pauldron) mb.add(TORUS, P.brass, 0, Y.shoulder + 0.002, Z.shoulder * side * b, { rx: Math.PI / 2, surface: 'gold' }, 0.046 * b, 0.046 * b, 0.12);
  }
  // collar/neck
  mb.add(turned([0.024, 0.023, 0.022], 0.05, 9, false, false), skin, 0, Y.neck - 0.03, 0, { surface: 'skin' });
  if (!s.chain && !s.robe) mb.add(TORUS, s.shirtTeam ? P.team : P.linen, 0, Y.neck - 0.025, 0, { rx: Math.PI / 2, team: !!s.shirtTeam, surface: 'cloth' }, 0.035, 0.035, 0.25);
  if (s.quiver) {
    mb.add(turned([0.022, 0.026, 0.028], 0.2, 9, true, false), P.leather, -0.072, Y.waist - 0.05, 0.035, { rx: 0.4, surface: 'leather' });
    for (let i = 0; i < 4; i++) cy(mb, 0.0035, 0.0035, 0.07, 4, P.wood, -0.072 - (i % 2) * 0.008, Y.waist + 0.155, 0.11 + (i - 1.5) * 0.008, { rx: 0.4, surface: 'wood' });
    if (!LOD) for (let i = 0; i < 4; i++) mb.box(0.014, 0.022, 0.003, P.white, -0.072 - (i % 2) * 0.008, Y.waist + 0.195, 0.125 + (i - 1.5) * 0.008, { rx: 0.4, surface: 'cloth' });
  }
  if (s.cape) {
    mb.bone = BN.CAPE;
    mb.add(drape(0.13 * b, 0.075 * b, 0.36, 5, 0.06, 16, Math.PI * 1.05, Math.PI * 0.98), P.team, -0.008, Y.shoulder - 0.19, 0, { team: true, surface: 'wool' });
    for (const s2 of [-1, 1]) bead(mb, 0.01, P.brass, 0.03, Y.shoulder - 0.005, 0.06 * s2 * b, { surface: 'gold' });
  }

  // ---- head
  mb.bone = BN.HEAD;
  headHD(mb, s, skin);

  // ---- arms
  for (const side of [-1, 1]) {
    const R = side > 0;
    const z = (k: number) => k * side * b;
    const sleeve = s.sleeve ?? s.chain ?? shirtCol;
    const sleeveTeam = !!s.sleeveTeam || (!!s.shirtTeam && !s.chain && !s.sleeve && !s.robe);
    mb.bone = R ? BN.UARM_R : BN.UARM_L;
    mb.add(turned([0.026, 0.029, 0.032, 0.034, 0.035].map((r) => r * b), Y.shoulder - Y.elbow + 0.012, 14), sleeve, 0, Y.elbow - 0.006, z(Z.elbow - 0.002), { team: sleeveTeam, surface: s.chain && !s.sleeve ? 'metal' : s.robe ? 'wool' : 'cloth' });
    if (s.robe) mb.add(drape(0.05 * b, 0.032 * b, 0.1, 3, 0.05, 12), s.robe, 0, Y.elbow - 0.02, z(Z.elbow), { surface: 'wool' });
    mb.bone = R ? BN.LARM_R : BN.LARM_L;
    const fore = s.forearm ?? skin;
    const foreSurf: Surface = s.forearm ? (s.forearm === P.leather || s.forearm === '#6b4a2b' ? 'leather' : 'metal') : 'skin';
    mb.add(turned([0.019, 0.022, 0.026, 0.028].map((r) => r * b), Y.elbow - Y.wrist + 0.008, 14), fore, 0, Y.wrist - 0.002, z(Z.wrist - 0.002), { surface: foreSurf });
    if (s.forearm) mb.add(turned([0.025, 0.028].map((r) => r * b), 0.04, 12, false, false), fore, 0, Y.wrist - 0.004, z(Z.wrist), { surface: foreSurf });
    mb.bone = R ? BN.HAND_R : BN.HAND_L;
    const handCol = s.forearm && foreSurf !== 'skin' ? (foreSurf === 'metal' ? P.dsteel : P.dleather) : skin;
    mb.add(ELL(), handCol, 0.006, Y.wrist - 0.028, z(Z.wrist), { surface: foreSurf === 'metal' ? 'metal' : foreSurf === 'leather' ? 'leather' : 'skin' }, 0.02, 0.03, 0.014);
    mb.add(ELL(), handCol, 0.02, Y.wrist - 0.02, z(Z.wrist) - side * 0.008, { surface: foreSurf === 'skin' ? 'skin' : 'leather' }, 0.008, 0.015, 0.008);
    mb.push(0, Y.wrist, z(Z.wrist));
    const item = (R ? s.right : s.left) as HandFn | null | undefined;
    if (item && !hdItem(mb, item)) { mb.push(0, -0.018, 0); item(mb); mb.pop(); }
    if (!R && s.shield) shieldHD(mb, s.shield);
    mb.pop();
  }
  mb.bone = 0;
  mb.pop();
}

/** Where villagers carry loads in the HD body (left shoulder). */
export const HD_CARRY = { y: Y.shoulder + 0.035, z: -Z.shoulder - 0.01, neck: Y.neck - 0.03 };

export { STYLE };
