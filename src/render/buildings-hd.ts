// AoE4-style buildings for the realistic renderer.
// Models face +X (doors on +X), origin at ground centre, footprint size s → extent ±s/2.
// Tiers follow the ages: 1 log & thatch, 2 timber-frame & shingle, 3 stone + timber & clay tile, 4 dressed stone & slate.

import * as THREE from 'three';
import type { MB, Col } from './mb';
import type { Surface } from './surfaces';

const K = {
  plaster: '#e8dfc8', timber: '#4f3624', log: '#7a5a3c', logEnd: '#b08a5e', stone: '#bdb5a5', dstone: '#958d7f', quoin: '#d2cab8',
  thatch: '#c8a556', shingle: '#7f5b3b', tile: '#ad5a3d', slate: '#5a6878', gold: '#d9aa3a', iron: '#5d6168',
  door: '#5a3a24', glass: '#2a2a2e', straw: '#d8b862', sack: '#cdbb94', crate: '#9a7a52', leaf: '#4d6a30', soil: '#6d4a2e',
  white: '#efe8da', team: '#ffffff', glow: '#ff9a3a', water: '#4a6a78',
};

interface Tier { wall: Col; wallS: Surface; roof: Col; roofS: Surface; frame: boolean; stone: boolean; logs: boolean; trim: Col }
function tierStyle(t: number): Tier {
  if (t <= 1) return { wall: K.log, wallS: 'wood', roof: K.thatch, roofS: 'thatch', frame: false, stone: false, logs: true, trim: K.timber };
  if (t === 2) return { wall: K.plaster, wallS: 'plaster', roof: K.shingle, roofS: 'tile', frame: true, stone: false, logs: false, trim: K.timber };
  if (t === 3) return { wall: K.plaster, wallS: 'plaster', roof: K.tile, roofS: 'tile', frame: true, stone: true, logs: false, trim: K.timber };
  return { wall: K.stone, wallS: 'stone', roof: K.slate, roofS: 'slate', frame: false, stone: true, logs: false, trim: K.gold };
}

// ---------------------------------------------------------------- geometry

const TRI = (() => {
  // unit gable infill: triangle in the YZ plane (z ∈ [-.5,.5], y ∈ [0,1]), thickness 1 along X
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
})();
const CYL = new Map<string, THREE.BufferGeometry>();
function cylG(rt: number, rb: number, seg: number) {
  const k = `${rt}|${rb}|${seg}`;
  let g = CYL.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, 1, seg, 1); CYL.set(k, g); }
  return g;
}

type O = { team?: boolean; rx?: number; ry?: number; rz?: number; surface?: Surface };
const box = (mb: MB, w: number, h: number, d: number, c: Col, x: number, y: number, z: number, o: O = {}) => mb.box(w, h, d, c, x, y, z, o);
const boxB = (mb: MB, w: number, h: number, d: number, c: Col, x: number, y: number, z: number, o: O = {}) => mb.box(w, h, d, c, x, y + h / 2, z, o);
const cyl = (mb: MB, rt: number, rb: number, h: number, seg: number, c: Col, x: number, y: number, z: number, o: O = {}) => mb.add(cylG(rt, rb, seg), c, x, y, z, o, 1, h, 1);
const cylB = (mb: MB, rt: number, rb: number, h: number, seg: number, c: Col, x: number, y: number, z: number, o: O = {}) => cyl(mb, rt, rb, h, seg, c, x, y + h / 2, z, o);

// ---------------------------------------------------------------- kit

function plinth(mb: MB, w: number, d: number, h = 0.1) {
  boxB(mb, w, h + 0.4, d, K.dstone, 0, -0.4, 0, { surface: 'stone' });
  boxB(mb, w - 0.06, 0.025, d - 0.06, '#9a8a6c', 0, h, 0, { surface: 'soil' });
}

/** Walls of a block (centre x,z; footprint w×d; from y0 up h). */
function walls(mb: MB, st: Tier, w: number, d: number, h: number, x = 0, z = 0, y0 = 0, stoneBase = st.stone) {
  if (st.logs) {
    // stacked logs with notched, protruding corners
    const rows = Math.max(3, Math.round(h / 0.1));
    const r = h / rows / 2;
    for (let i = 0; i < rows; i++) {
      const y = y0 + r + i * 2 * r;
      const along = i % 2 === 0;
      for (const s of [-1, 1]) {
        if (along) cyl(mb, r, r, w + 0.1, 8, K.log, x, y, z + s * (d / 2 - r), { rz: Math.PI / 2, surface: 'bark' });
        else cyl(mb, r, r, d + 0.1, 8, K.log, x + s * (w / 2 - r), y, z, { rx: Math.PI / 2, surface: 'bark' });
      }
    }
    boxB(mb, w - 0.06, h, d - 0.06, '#8a6a48', x, y0, z, { surface: 'wood' });
    return;
  }
  boxB(mb, w, h, d, st.wall, x, y0, z, { surface: st.wallS });
  if (stoneBase && st.frame) {
    const sb = Math.min(h, 0.42);
    boxB(mb, w + 0.03, sb, d + 0.03, K.stone, x, y0, z, { surface: 'stone' });
    quoins(mb, w + 0.03, d + 0.03, sb, x, z, y0);
    if (h > sb + 0.05) frame(mb, w, d, h - sb, x, z, y0 + sb);
  } else if (st.frame) {
    frame(mb, w, d, h, x, z, y0);
  } else {
    quoins(mb, w, d, h, x, z, y0);
    box(mb, w + 0.05, 0.04, d + 0.05, K.quoin, x, y0 + h * 0.55, z, { surface: 'stone' });
  }
}

/** Timber framing: sill, head, posts, a middle rail and diagonal braces on every face. */
function frame(mb: MB, w: number, d: number, h: number, x: number, z: number, y0: number) {
  const t = 0.035;
  for (const [len, other, axis] of [[w, d, 'x'], [d, w, 'z']] as const) {
    for (const s of [-1, 1]) {
      const px = axis === 'x' ? x : x + s * (other / 2 + 0.006);
      const pz = axis === 'x' ? z + s * (other / 2 + 0.006) : z;
      const bw = axis === 'x' ? len + 0.02 : t, bd = axis === 'x' ? t : len + 0.02;
      box(mb, bw, t * 1.2, bd, K.timber, px, y0 + t * 0.6, pz, { surface: 'wood' });
      box(mb, bw, t * 1.2, bd, K.timber, px, y0 + h - t * 0.6, pz, { surface: 'wood' });
      box(mb, bw, t * 0.8, bd, K.timber, px, y0 + h * 0.5, pz, { surface: 'wood' });
      const n = Math.max(2, Math.round(len / 0.34));
      for (let i = 0; i <= n; i++) {
        const u = -len / 2 + (len * i) / n;
        box(mb, axis === 'x' ? t : t, h, axis === 'x' ? t : t, K.timber, axis === 'x' ? x + u : px, y0 + h / 2, axis === 'x' ? pz : z + u, { surface: 'wood' });
        if (i < n && i % 2 === 0) {
          const pw = len / n, ang = Math.atan2(h * 0.5, pw);
          const cu = u + pw / 2, diag = Math.hypot(pw, h * 0.5);
          if (axis === 'x') box(mb, diag, t * 0.8, t, K.timber, x + cu, y0 + h * 0.25, pz, { rz: ang, surface: 'wood' });
          else box(mb, t, t * 0.8, diag, K.timber, px, y0 + h * 0.25, z + cu, { rx: -ang, surface: 'wood' });
        }
      }
    }
  }
}

function quoins(mb: MB, w: number, d: number, h: number, x: number, z: number, y0: number) {
  const n = Math.max(2, Math.round(h / 0.13));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let i = 0; i < n; i++) {
      const long = i % 2 === 0;
      box(mb, long ? 0.12 : 0.07, h / n - 0.012, long ? 0.07 : 0.12, K.quoin, x + sx * (w / 2 - (long ? 0.05 : 0.025)) + sx * 0.012, y0 + (i + 0.5) * (h / n), z + sz * (d / 2 - (long ? 0.025 : 0.05)) + sz * 0.012, { surface: 'stone' });
    }
  }
}

/** Gable roof with thickness, overhangs, gable-end infill and a ridge cap. axis = ridge direction. */
function roof(mb: MB, st: Tier, w: number, d: number, h: number, x: number, z: number, y0: number, axis: 'x' | 'z' = 'x', ov = 0.09, endWall: Col | null = null) {
  const L = axis === 'x' ? w : d, D = axis === 'x' ? d : w;
  const pitch = Math.atan2(h, D / 2);
  const slope = Math.hypot(h, D / 2) + ov;
  const thick = st.roofS === 'thatch' ? 0.07 : 0.035;
  for (const s of [-1, 1]) {
    const off = (D / 4 + Math.cos(pitch) * ov / 2) * s;
    const yy = y0 + h / 2 - Math.sin(pitch) * ov / 2 + thick / 2;
    if (axis === 'x') box(mb, L + ov * 2, thick, slope, st.roof, x, yy, z + off, { rx: s * pitch, surface: st.roofS });
    else box(mb, slope, thick, L + ov * 2, st.roof, x + off, yy, z, { rz: -s * pitch, surface: st.roofS });
    // fascia / barge boards
    if (st.roofS !== 'thatch') {
      for (const e of [-1, 1]) {
        if (axis === 'x') box(mb, 0.03, 0.05, slope, K.timber, x + e * (L / 2 + ov), yy - 0.01, z + off, { rx: s * pitch, surface: 'wood' });
        else box(mb, slope, 0.05, 0.03, K.timber, x + off, yy - 0.01, z + e * (L / 2 + ov), { rz: -s * pitch, surface: 'wood' });
      }
    }
  }
  // gable ends
  const gw = endWall ?? (st.frame ? K.plaster : st.logs ? K.log : K.stone);
  for (const e of [-1, 1]) {
    if (axis === 'x') mb.add(TRI, gw, x + e * (L / 2 - 0.02), y0, z, { surface: st.logs ? 'wood' : st.frame ? 'plaster' : 'stone' }, 0.04, h, D);
    else mb.add(TRI, gw, x, y0, z + e * (L / 2 - 0.02), { ry: Math.PI / 2, surface: st.logs ? 'wood' : st.frame ? 'plaster' : 'stone' }, 0.04, h, D);
    if (st.frame) {
      // king post on the gable face
      if (axis === 'x') box(mb, 0.035, h * 0.92, 0.035, K.timber, x + e * (L / 2), y0 + h * 0.46, z, { surface: 'wood' });
      else box(mb, 0.035, h * 0.92, 0.035, K.timber, x, y0 + h * 0.46, z + e * (L / 2), { surface: 'wood' });
    }
  }
  // ridge
  if (st.roofS === 'thatch') {
    if (axis === 'x') cyl(mb, 0.06, 0.06, L + ov * 2, 10, '#a98a44', x, y0 + h + 0.03, z, { rz: Math.PI / 2, surface: 'thatch' });
    else cyl(mb, 0.06, 0.06, L + ov * 2, 10, '#a98a44', x, y0 + h + 0.03, z, { rx: Math.PI / 2, surface: 'thatch' });
  } else {
    if (axis === 'x') box(mb, L + ov * 2, 0.05, 0.08, st.roofS === 'slate' ? '#3e4a58' : '#8a4630', x, y0 + h + 0.025, z, { surface: st.roofS });
    else box(mb, 0.08, 0.05, L + ov * 2, st.roofS === 'slate' ? '#3e4a58' : '#8a4630', x, y0 + h + 0.025, z, { surface: st.roofS });
    if (st.trim === K.gold) for (const e of [-1, 1]) {
      if (axis === 'x') cylB(mb, 0.012, 0.012, 0.16, 6, K.gold, x + e * (L / 2 + ov - 0.02), y0 + h + 0.04, z, { surface: 'gold' });
      else cylB(mb, 0.012, 0.012, 0.16, 6, K.gold, x, y0 + h + 0.04, z + e * (L / 2 + ov - 0.02), { surface: 'gold' });
    }
  }
}

/** Single-pitch lean-to roof sloping down towards +dir. */
function shed(mb: MB, st: Tier, w: number, d: number, hHigh: number, hLow: number, x: number, z: number, y0: number, dir: 'x' | 'z') {
  const D = dir === 'x' ? w : d, L = dir === 'x' ? d : w;
  const ang = Math.atan2(hHigh - hLow, D);
  const len = Math.hypot(D, hHigh - hLow) + 0.12;
  const y = y0 + (hHigh + hLow) / 2 + 0.02;
  if (dir === 'x') box(mb, len, st.roofS === 'thatch' ? 0.06 : 0.035, L + 0.12, st.roof, x, y, z, { rz: -ang, surface: st.roofS });
  else box(mb, L + 0.12, st.roofS === 'thatch' ? 0.06 : 0.035, len, st.roof, x, y, z, { rx: ang, surface: st.roofS });
}

/** Framed door on the face given by normal (nx,nz). */
function door(mb: MB, x: number, z: number, y0: number, nx: number, nz: number, w = 0.24, h = 0.36, team = false) {
  const o: O = { ry: nx !== 0 ? 0 : Math.PI / 2, surface: 'wood' };
  box(mb, 0.03, h, w, K.door, x + nx * 0.012, y0 + h / 2, z + nz * 0.012, o);
  for (const s of [-1, 1]) box(mb, 0.05, h + 0.03, 0.035, K.timber, x + nx * 0.02 + (nz ? s * (w / 2 + 0.015) : 0), y0 + h / 2, z + nz * 0.02 + (nx ? s * (w / 2 + 0.015) : 0), o);
  box(mb, 0.06, 0.045, w + 0.1, K.timber, x + nx * 0.022, y0 + h + 0.02, z + nz * 0.022, o);
  box(mb, 0.035, 0.012, w * 0.9, K.iron, x + nx * 0.03, y0 + h * 0.3, z + nz * 0.03, { ...o, surface: 'metal' });
  box(mb, 0.035, 0.012, w * 0.9, K.iron, x + nx * 0.03, y0 + h * 0.75, z + nz * 0.03, { ...o, surface: 'metal' });
  box(mb, 0.14, 0.03, w + 0.1, K.dstone, x + nx * 0.06, y0 + 0.015, z + nz * 0.06, { ...o, surface: 'stone' });
  if (team) box(mb, 0.012, 0.12, w * 0.8, K.team, x + nx * 0.035, y0 + h + 0.12, z + nz * 0.035, { ...o, team: true, surface: 'cloth' });
}

function windowW(mb: MB, x: number, y: number, z: number, nx: number, nz: number, w = 0.13, h = 0.17) {
  const o: O = { ry: nx !== 0 ? 0 : Math.PI / 2, surface: 'wood' };
  box(mb, 0.025, h, w, K.glass, x + nx * 0.008, y, z + nz * 0.008, { ...o, surface: 'cloth' });
  box(mb, 0.04, 0.025, w + 0.06, K.timber, x + nx * 0.018, y + h / 2 + 0.012, z + nz * 0.018, o);
  box(mb, 0.06, 0.022, w + 0.08, K.timber, x + nx * 0.025, y - h / 2 - 0.011, z + nz * 0.025, o);
  box(mb, 0.03, h, 0.012, K.timber, x + nx * 0.02, y, z + nz * 0.02, o);
  for (const s of [-1, 1]) box(mb, 0.02, h, w * 0.5, K.team, x + nx * 0.03 + (nz ? s * (w * 0.78) : 0), y, z + nz * 0.03 + (nx ? s * (w * 0.78) : 0), { ...o, team: true, surface: 'wood' });
}

function chimney(mb: MB, x: number, z: number, y0: number, h: number) {
  boxB(mb, 0.18, h, 0.18, K.dstone, x, y0, z, { surface: 'stone' });
  boxB(mb, 0.22, 0.04, 0.22, K.stone, x, y0 + h, z, { surface: 'stone' });
  boxB(mb, 0.1, 0.05, 0.1, '#3a3430', x, y0 + h + 0.04, z, { surface: 'stone' });
}

function banner(mb: MB, x: number, y: number, z: number, h = 1.1, w = 0.32) {
  cylB(mb, 0.018, 0.024, h, 8, K.timber, x, y, z, { surface: 'wood' });
  box(mb, 0.02, 0.02, w + 0.06, K.timber, x + 0.02, y + h - 0.04, z, { surface: 'wood' });
  box(mb, 0.012, w * 1.25, w, K.team, x + 0.025, y + h - 0.06 - w * 0.62, z, { team: true, surface: 'cloth' });
  mb.add(TRI, K.team, x + 0.025, y + h - 0.06 - w * 1.25 - w * 0.25, z, { team: true, rx: Math.PI, surface: 'cloth' }, 0.012, w * 0.25, w);
  box(mb, 0.015, 0.02, w + 0.01, K.gold, x + 0.03, y + h - 0.07, z, { surface: 'gold' });
  mb.bead(0.03, K.gold, x, y + h + 0.03, z, { surface: 'gold' });
}

/** Long cloth banner hanging flat on a wall facing +X. */
function wallBanner(mb: MB, x: number, y: number, z: number, h = 0.5, w = 0.2) {
  box(mb, 0.01, h, w, K.team, x, y - h / 2, z, { team: true, surface: 'cloth' });
  box(mb, 0.012, 0.025, w + 0.04, K.gold, x + 0.002, y, z, { surface: 'gold' });
  box(mb, 0.012, 0.06, 0.03, K.gold, x + 0.004, y - h * 0.45, z, { surface: 'gold' });
}

function barrel(mb: MB, x: number, z: number, y0 = 0.1, r = 0.075) {
  cylB(mb, r, r * 0.92, r * 2.4, 12, '#8e7353', x, y0, z, { surface: 'wood' });
  for (const k of [0.25, 0.75]) cylB(mb, r * 1.02, r * 1.02, 0.014, 12, K.iron, x, y0 + r * 2.4 * k, z, { surface: 'metal' });
}
function crate(mb: MB, x: number, z: number, y0 = 0.1, s = 0.14, ry = 0) {
  boxB(mb, s, s, s, K.crate, x, y0, z, { ry, surface: 'wood' });
  box(mb, s * 1.3, 0.014, 0.014, K.timber, x, y0 + s / 2, z + s / 2 + 0.004, { ry, rz: 0.75, surface: 'wood' });
}
function sack(mb: MB, x: number, z: number, y0 = 0.1) {
  mb.bead(0.06, K.sack, x, y0 + 0.05, z, { surface: 'cloth' }, 1.1);
}
function woodpile(mb: MB, x: number, z: number, y0 = 0.1, len = 0.5, axis: 'x' | 'z' = 'z') {
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
    const p = (i - (3 - r) / 2) * 0.07;
    if (axis === 'z') cyl(mb, 0.035, 0.035, len, 7, K.log, x + p, y0 + 0.035 + r * 0.06, z, { rx: Math.PI / 2, surface: 'bark' });
    else cyl(mb, 0.035, 0.035, len, 7, K.log, x, y0 + 0.035 + r * 0.06, z + p, { rz: Math.PI / 2, surface: 'bark' });
  }
}
function fence(mb: MB, x0: number, z0: number, x1: number, z1: number, y0 = 0.1) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.32));
  const ang = -Math.atan2(z1 - z0, x1 - x0);
  for (let i = 0; i <= n; i++) cylB(mb, 0.016, 0.018, 0.24, 6, K.timber, x0 + ((x1 - x0) * i) / n, y0, z0 + ((z1 - z0) * i) / n, { surface: 'wood' });
  for (const h of [0.1, 0.2]) box(mb, len, 0.025, 0.018, '#6a4a30', (x0 + x1) / 2, y0 + h, (z0 + z1) / 2, { ry: ang, surface: 'wood' });
}
function cart(mb: MB, x: number, z: number, y0 = 0.1, ry = 0) {
  mb.push(x, y0, z, 0, ry, 0);
  boxB(mb, 0.34, 0.1, 0.22, '#8a6a46', 0, 0.1, 0, { surface: 'wood' });
  for (const s of [-1, 1]) {
    cyl(mb, 0.1, 0.1, 0.025, 12, K.timber, 0, 0.1, s * 0.13, { rx: Math.PI / 2, surface: 'wood' });
    box(mb, 0.36, 0.012, 0.012, K.timber, 0.3, 0.14, s * 0.07, { rz: -0.25, surface: 'wood' });
  }
  sack(mb, -0.05, 0, 0.2); sack(mb, 0.07, 0.03, 0.2);
  mb.pop();
}
function hay(mb: MB, x: number, z: number, y0 = 0.1) {
  cyl(mb, 0.1, 0.1, 0.18, 12, K.straw, x, y0 + 0.1, z, { rx: Math.PI / 2, surface: 'thatch' });
}
function well(mb: MB, x: number, z: number, y0 = 0.1) {
  cylB(mb, 0.16, 0.17, 0.16, 14, K.stone, x, y0, z, { surface: 'stone' });
  cylB(mb, 0.13, 0.13, 0.01, 14, K.water, x, y0 + 0.15, z, { surface: 'skin' });
  for (const s of [-1, 1]) boxB(mb, 0.03, 0.34, 0.03, K.timber, x, y0 + 0.16, z + s * 0.15, { surface: 'wood' });
  mb.add(TRI, K.shingle, x, y0 + 0.48, z, { ry: Math.PI / 2, surface: 'tile' }, 0.42, 0.14, 0.34);
}

// ---------------------------------------------------------------- buildings

function house(mb: MB, tier: number, v: number) {
  const st = tierStyle(tier);
  plinth(mb, 1.86, 1.86, 0.08);
  const y0 = 0.1;
  if (v === 1 && tier >= 2) {
    // two storeys with a jettied (overhanging) upper floor, gable facing the street (+X)
    walls(mb, st, 1.1, 0.9, 0.48, -0.08, -0.05, y0);
    walls(mb, { ...st, stone: false }, 1.22, 1.02, 0.42, -0.08, -0.05, y0 + 0.5, false);
    for (let i = 0; i < 4; i++) box(mb, 1.24, 0.03, 0.03, K.timber, -0.08, y0 + 0.49, -0.05 + (i - 1.5) * 0.3, { surface: 'wood' });
    roof(mb, st, 1.22, 1.02, 0.5, -0.08, -0.05, y0 + 0.92, 'x', 0.1);
    door(mb, 0.47, 0.18, y0, 1, 0);
    windowW(mb, 0.47, y0 + 0.27, -0.25, 1, 0);
    windowW(mb, 0.53, y0 + 0.72, -0.2, 1, 0); windowW(mb, 0.53, y0 + 0.72, 0.18, 1, 0);
    windowW(mb, -0.2, y0 + 0.72, 0.465, 0, 1); windowW(mb, 0.2, y0 + 0.72, 0.465, 0, 1);
    chimney(mb, -0.55, -0.4, y0 + 0.9, 0.62);
    barrel(mb, 0.68, 0.62); crate(mb, 0.72, -0.62, 0.1, 0.13, 0.4);
  } else if (v === 2) {
    // L-shaped: main block plus a lean-to with a woodpile
    walls(mb, st, 1.05, 0.82, 0.55, -0.2, -0.25, y0);
    roof(mb, st, 1.05, 0.82, 0.48, -0.2, -0.25, y0 + 0.55, 'x');
    walls(mb, { ...st, stone: false }, 0.55, 0.62, 0.38, 0.12, 0.45, y0, false);
    shed(mb, st, 0.55, 0.62, 0.5, 0.36, 0.12, 0.45, y0, 'z');
    door(mb, 0.33, -0.25, y0, 1, 0);
    windowW(mb, 0.33, y0 + 0.32, -0.52, 1, 0);
    windowW(mb, 0.4, y0 + 0.22, 0.45, 1, 0);
    chimney(mb, -0.62, -0.5, y0 + 0.5, 0.62);
    woodpile(mb, -0.6, 0.55, 0.1, 0.45);
    fence(mb, 0.72, 0.15, 0.72, 0.85);
  } else {
    // cottage: eaves to the street, chimney on the gable
    walls(mb, st, 1.24, 0.9, 0.58, -0.05, -0.1, y0);
    roof(mb, st, 1.24, 0.9, 0.55, -0.05, -0.1, y0 + 0.58, 'z', 0.1);
    door(mb, 0.57, -0.1, y0, 1, 0, 0.22, 0.34);
    windowW(mb, 0.57, y0 + 0.36, -0.42, 1, 0); windowW(mb, 0.57, y0 + 0.36, 0.25, 1, 0);
    windowW(mb, -0.05, y0 + 0.36, 0.35, 0, 1);
    chimney(mb, -0.55, -0.1, y0 + 0.5, 0.75);
    // kitchen garden with a fence
    boxB(mb, 1.1, 0.035, 0.32, K.soil, -0.05, 0.1, 0.62, { surface: 'soil' });
    for (let i = 0; i < 5; i++) mb.bead(0.06, K.leaf, -0.5 + i * 0.22, 0.17, 0.62, { surface: 'leaf' }, 0.7);
    fence(mb, -0.62, 0.82, 0.55, 0.82);
    barrel(mb, 0.72, 0.5);
  }
  if (tier >= 3) banner(mb, 0.78, 0.1, -0.78, 0.8, 0.2);
}

function townCenter(mb: MB, tier: number) {
  const st = tierStyle(tier);
  plinth(mb, 3.9, 3.9, 0.12);
  const y0 = 0.14;
  // courtyard paving
  boxB(mb, 3.6, 0.02, 3.6, '#a59b88', 0, y0 - 0.02, 0, { surface: 'stone' });
  if (tier <= 1) {
    // great log hall with a thatched roof and a bell frame
    walls(mb, st, 2.5, 1.5, 0.78, -0.3, -0.3, y0);
    roof(mb, st, 2.5, 1.5, 0.9, -0.3, -0.3, y0 + 0.78, 'x', 0.14);
    walls(mb, st, 1.0, 0.9, 0.6, 0.9, 0.95, y0);
    roof(mb, st, 1.0, 0.9, 0.55, 0.9, 0.95, y0 + 0.6, 'z', 0.1);
    // bell frame
    for (const s of [-1, 1]) boxB(mb, 0.07, 1.05, 0.07, K.timber, -1.4, y0, 1.25 + s * 0.22, { surface: 'wood' });
    box(mb, 0.09, 0.07, 0.6, K.timber, -1.4, y0 + 1.05, 1.25, { surface: 'wood' });
    cylB(mb, 0.05, 0.09, 0.14, 12, K.gold, -1.4, y0 + 0.85, 1.25, { surface: 'gold' });
    mb.add(TRI, K.thatch, -1.4, y0 + 1.1, 1.25, { ry: Math.PI / 2, surface: 'thatch' }, 0.62, 0.22, 0.4);
    door(mb, 0.96, -0.3, y0, 1, 0, 0.36, 0.48, true);
    windowW(mb, 0.96, y0 + 0.45, -0.75, 1, 0); windowW(mb, 0.96, y0 + 0.45, 0.15, 1, 0);
  } else {
    const stoneT = tier >= 3;
    // main hall (two storeys) + cross wing + central bell tower
    walls(mb, st, 2.4, 1.4, 0.95, -0.35, -0.4, y0);
    roof(mb, st, 2.4, 1.4, 0.82, -0.35, -0.4, y0 + 0.95, 'x', 0.13);
    walls(mb, st, 1.1, 1.3, 0.85, 0.95, 0.55, y0);
    roof(mb, st, 1.1, 1.3, 0.72, 0.95, 0.55, y0 + 0.85, 'z', 0.12);
    // tower
    const tx = -0.35, tz = -0.4, th = stoneT ? 2.2 : 1.9;
    walls(mb, { ...st, frame: !stoneT && st.frame }, 0.72, 0.72, th, tx, tz, y0 + 0.5, false);
    for (const [nx, nz] of [[1, 0], [0, 1]] as const) box(mb, nx ? 0.03 : 0.22, 0.26, nz ? 0.03 : 0.22, '#1e1a16', tx + nx * 0.37, y0 + 0.5 + th - 0.3, tz + nz * 0.37, { surface: 'stone' });
    cylB(mb, 0.07, 0.11, 0.15, 12, K.gold, tx, y0 + 0.5 + th - 0.42, tz, { surface: 'gold' });
    if (stoneT) {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        boxB(mb, 0.13, 0.12, 0.13, K.stone, tx + Math.cos(a) * 0.33, y0 + 0.5 + th, tz + Math.sin(a) * 0.33, { surface: 'stone' });
      }
      mb.add(new THREE.ConeGeometry(0.42, 1, 4), st.roof, tx, y0 + 0.5 + th + 0.32, tz, { ry: Math.PI / 4, surface: st.roofS }, 1, 0.6, 1);
    } else {
      mb.add(new THREE.ConeGeometry(0.55, 1, 4), st.roof, tx, y0 + 0.5 + th + 0.28, tz, { ry: Math.PI / 4, surface: st.roofS }, 1, 0.55, 1);
    }
    banner(mb, tx, y0 + 0.5 + th + (stoneT ? 0.62 : 0.55), tz, 0.55, 0.3);
    // entrance porch on the wing
    door(mb, 1.51, 0.55, y0, 1, 0, 0.36, 0.5, true);
    for (const s of [-1, 1]) boxB(mb, 0.06, 0.62, 0.06, K.timber, 1.68, y0, 0.55 + s * 0.3, { surface: 'wood' });
    shed(mb, st, 0.32, 0.78, 0.66, 0.56, 1.66, 0.55, y0, 'x');
    for (const z of [-0.95, -0.4, 0.15]) { windowW(mb, 0.86, y0 + 0.35, z, 1, 0); windowW(mb, 0.86, y0 + 0.75, z, 1, 0); }
    for (const x of [0.65, 1.25]) windowW(mb, x, y0 + 0.55, 1.21, 0, 1);
    wallBanner(mb, 0.875, y0 + 0.92, -0.67, 0.42, 0.18);
    wallBanner(mb, 0.875, y0 + 0.92, -0.13, 0.42, 0.18);
    if (stoneT) {
      // corner turret on the hall
      cylB(mb, 0.24, 0.26, 1.55, 14, K.stone, -1.55, y0, -1.1, { surface: 'stone' });
      mb.add(new THREE.ConeGeometry(0.32, 1, 14), st.roof, -1.55, y0 + 1.55 + 0.3, -1.1, { surface: st.roofS }, 1, 0.6, 1);
      if (tier >= 4) cylB(mb, 0.012, 0.012, 0.2, 6, K.gold, -1.55, y0 + 2.15, -1.1, { surface: 'gold' });
    }
    chimney(mb, -1.35, -0.75, y0 + 1.2, 0.75);
  }
  // town square life
  banner(mb, 1.75, y0, -1.55, 1.25, 0.34);
  banner(mb, 1.75, y0, 1.55, 1.25, 0.34);
  well(mb, 1.45, -0.75, y0);
  cart(mb, -1.4, 1.55, y0, 0.6);
  barrel(mb, -0.25, 1.62, y0); barrel(mb, -0.08, 1.7, y0); crate(mb, 0.15, 1.62, y0, 0.15, 0.3);
  woodpile(mb, -1.7, 0.4, y0, 0.55);
}

function barracks(mb: MB, tier: number) {
  const st = tierStyle(tier);
  plinth(mb, 2.86, 2.86, 0.1);
  const y0 = 0.1;
  walls(mb, st, 2.4, 1.25, 0.82, -0.12, -0.62, y0);
  roof(mb, st, 2.4, 1.25, 0.72, -0.12, -0.62, y0 + 0.82, 'x', 0.12);
  door(mb, -0.12, 0.01, y0, 0, 1, 0.42, 0.5, true);
  for (const x of [-0.9, 0.6]) windowW(mb, x, y0 + 0.5, 0.0, 0, 1);
  windowW(mb, 1.09, y0 + 0.5, -0.62, 1, 0);
  wallBanner(mb, 1.085, y0 + 0.8, -0.95, 0.5, 0.2);
  wallBanner(mb, 1.085, y0 + 0.8, -0.3, 0.5, 0.2);
  if (tier >= 3) { cylB(mb, 0.2, 0.22, 1.3, 14, K.stone, 1.1, y0, -1.2, { surface: 'stone' }); mb.add(new THREE.ConeGeometry(0.27, 1, 14), st.roof, 1.1, y0 + 1.3 + 0.25, -1.2, { surface: st.roofS }, 1, 0.5, 1); }
  // training yard: dirt, dummies, weapon rack
  boxB(mb, 2.5, 0.015, 1.15, '#a48a62', 0, y0, 0.75, { surface: 'soil' });
  for (const [x, z] of [[0.7, 0.75], [1.05, 0.95]]) {
    cylB(mb, 0.025, 0.03, 0.5, 8, K.timber, x, y0, z, { surface: 'wood' });
    box(mb, 0.03, 0.03, 0.28, K.timber, x, y0 + 0.4, z, { surface: 'wood' });
    mb.bead(0.07, K.straw, x, y0 + 0.36, z, { surface: 'thatch' }, 1.4);
    mb.bead(0.05, K.sack, x, y0 + 0.52, z, { surface: 'cloth' });
  }
  // rack of spears and team shields
  boxB(mb, 0.04, 0.4, 0.6, K.timber, -0.9, y0, 0.95, { surface: 'wood' });
  for (let i = 0; i < 5; i++) {
    cylB(mb, 0.008, 0.008, 0.7, 5, '#8a6a46', -0.87, y0, 0.72 + i * 0.11, { rz: 0.12, surface: 'wood' });
    mb.add(new THREE.ConeGeometry(0.02, 1, 4), '#aab2ba', -0.78, y0 + 0.74, 0.72 + i * 0.11, { surface: 'metal' }, 1, 0.07, 1);
  }
  for (let i = 0; i < 2; i++) cyl(mb, 0.1, 0.1, 0.02, 14, K.team, -0.86, y0 + 0.25, 0.8 + i * 0.3, { rz: Math.PI / 2, team: true, surface: 'cloth' });
  fence(mb, -1.3, 1.36, 1.3, 1.36, y0);
  banner(mb, 1.3, y0, 0.15, 1.3, 0.34);
  barrel(mb, -1.25, 0.2, y0); crate(mb, -1.25, 0.45, y0, 0.14);
}

function archeryRange(mb: MB, tier: number) {
  const st = tierStyle(tier);
  plinth(mb, 2.86, 2.86, 0.1);
  const y0 = 0.1;
  walls(mb, st, 1.2, 2.3, 0.75, -0.72, -0.1, y0);
  roof(mb, st, 1.2, 2.3, 0.6, -0.72, -0.1, y0 + 0.75, 'z', 0.12);
  door(mb, -0.11, -0.1, y0, 1, 0, 0.36, 0.46, true);
  for (const z of [-0.75, 0.55]) windowW(mb, -0.11, y0 + 0.48, z, 1, 0);
  wallBanner(mb, -0.115, y0 + 0.72, 0.2, 0.42, 0.18);
  // open shooting lanes with straw butts
  boxB(mb, 1.45, 0.015, 2.3, '#a48a62', 0.65, y0, 0, { surface: 'soil' });
  for (let i = 0; i < 3; i++) {
    const z = -0.8 + i * 0.8;
    for (const s of [-1, 1]) boxB(mb, 0.035, 0.46, 0.035, K.timber, 1.15, y0, z + s * 0.2, { surface: 'wood' });
    cyl(mb, 0.21, 0.21, 0.12, 18, K.straw, 1.2, y0 + 0.42, z, { rz: Math.PI / 2, surface: 'thatch' });
    cyl(mb, 0.15, 0.15, 0.125, 18, K.white, 1.2, y0 + 0.42, z, { rz: Math.PI / 2, surface: 'cloth' });
    cyl(mb, 0.08, 0.08, 0.13, 14, K.team, 1.2, y0 + 0.42, z, { rz: Math.PI / 2, team: true, surface: 'cloth' });
    for (let a = 0; a < 2; a++) box(mb, 0.18, 0.006, 0.006, '#8a6a46', 1.07, y0 + 0.44 + a * 0.05, z - 0.04 + a * 0.07, { rz: -0.1, surface: 'wood' });
  }
  for (let i = 0; i < 3; i++) box(mb, 0.04, 0.015, 0.3, K.white, 0.25, y0 + 0.01, -0.8 + i * 0.8, { surface: 'cloth' });
  fence(mb, 1.36, -1.36, 1.36, 1.36, y0);
  banner(mb, 0.3, y0, 1.25, 1.2, 0.32);
  barrel(mb, -1.2, 1.25, y0); hay(mb, -0.85, 1.25, y0);
}

function stable(mb: MB, tier: number) {
  const st = tierStyle(tier);
  plinth(mb, 2.86, 2.86, 0.1);
  const y0 = 0.1;
  walls(mb, st, 1.9, 1.5, 0.82, -0.4, -0.55, y0);
  roof(mb, st, 1.9, 1.5, 0.78, -0.4, -0.55, y0 + 0.82, 'x', 0.12);
  // big barn doors (one ajar) and a hay loft opening on the gable
  for (const s of [-1, 1]) box(mb, 0.035, 0.6, 0.3, K.door, 0.57, y0 + 0.3, -0.55 + s * 0.16, { ry: s > 0 ? 0.5 : 0, surface: 'wood' });
  box(mb, 0.03, 0.26, 0.3, '#1e1a16', 0.56, y0 + 1.05, -0.55, { surface: 'wood' });
  box(mb, 0.36, 0.04, 0.04, K.timber, 0.75, y0 + 1.25, -0.55, { surface: 'wood' });
  hay(mb, 0.68, -0.25, y0 + 0.0);
  for (const x of [-1.0, -0.3]) windowW(mb, x, y0 + 0.5, 0.21, 0, 1, 0.18, 0.12);
  wallBanner(mb, 0.565, y0 + 0.75, -1.05, 0.38, 0.16);
  // paddock with a trough
  fence(mb, -1.35, 0.55, 1.35, 0.55, y0); fence(mb, 1.35, 0.55, 1.35, 1.35, y0); fence(mb, -1.35, 1.35, 1.35, 1.35, y0); fence(mb, -1.35, 0.55, -1.35, 1.35, y0);
  boxB(mb, 0.5, 0.1, 0.14, '#7a5a3c', 0.4, y0, 1.1, { surface: 'wood' });
  boxB(mb, 0.44, 0.02, 0.1, K.water, 0.4, y0 + 0.085, 1.1, { surface: 'skin' });
  for (let i = 0; i < 3; i++) hay(mb, -0.9 + i * 0.25, 0.85, y0);
  banner(mb, 1.2, y0, -1.25, 1.2, 0.32);
}

function mill(mb: MB, tier: number) {
  const st = tierStyle(tier);
  plinth(mb, 1.86, 1.86, 0.08);
  const y0 = 0.1;
  let hubX = 0.42, hubY = 1.25;
  if (tier <= 2) {
    // post mill: wooden body on a trestle
    for (const [x, z] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) boxB(mb, 0.05, 0.42, 0.05, K.timber, x * 0.9, y0, z * 0.9, { rx: z * 0.4, rz: -x * 0.4, surface: 'wood' });
    cylB(mb, 0.07, 0.08, 0.5, 10, K.timber, 0, y0, 0, { surface: 'wood' });
    walls(mb, { ...st, frame: false, logs: false, wall: '#9a7a52', wallS: 'wood' }, 0.7, 0.6, 0.62, 0, 0, y0 + 0.5, false);
    for (let i = 0; i < 6; i++) box(mb, 0.71, 0.012, 0.61, '#6a4a30', 0, y0 + 0.55 + i * 0.1, 0, { surface: 'wood' });
    roof(mb, { ...st, frame: false }, 0.7, 0.6, 0.32, 0, 0, y0 + 1.12, 'x', 0.06, '#9a7a52');
    hubX = 0.4; hubY = y0 + 0.9;
    box(mb, 0.5, 0.03, 0.1, K.timber, 0.55, y0 + 0.3, 0, { rz: 0.6, surface: 'wood' });
  } else {
    // stone tower mill with a rotating cap
    cylB(mb, 0.42, 0.55, 1.35, 18, K.stone, 0, y0, 0, { surface: 'stone' });
    cylB(mb, 0.46, 0.46, 0.06, 18, K.dstone, 0, y0 + 1.35, 0, { surface: 'stone' });
    mb.add(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), st.roof, 0, y0 + 1.4, 0, { surface: st.roofS }, 0.46, 0.4, 0.46);
    door(mb, 0.5, 0, y0, 1, 0, 0.24, 0.38);
    windowW(mb, 0.47, y0 + 0.85, 0, 1, 0, 0.1, 0.14);
    hubX = 0.5; hubY = y0 + 1.5;
  }
  // sails: lattice frames with team cloth
  cyl(mb, 0.05, 0.05, 0.16, 10, K.timber, hubX, hubY, 0, { rz: Math.PI / 2, surface: 'wood' });
  for (let i = 0; i < 4; i++) {
    mb.push(hubX + 0.09, hubY, 0, i * Math.PI / 2 + 0.35, 0, 0);
    box(mb, 0.035, 0.95, 0.035, K.timber, 0, 0.5, 0, { surface: 'wood' });
    for (let j = 1; j < 6; j++) box(mb, 0.015, 0.015, 0.22, '#6a4a30', 0, 0.12 + j * 0.15, 0.11, { surface: 'wood' });
    box(mb, 0.012, 0.75, 0.2, j2(i) ? K.white : K.team, 0.012, 0.55, 0.11, { team: !j2(i), surface: 'cloth' });
    mb.pop();
  }
  for (let i = 0; i < 3; i++) sack(mb, -0.55 + i * 0.13, 0.65, 0.1);
  cart(mb, -0.5, -0.55, 0.1, 1.2);
}
const j2 = (i: number) => i % 2 === 1;

function lumberCamp(mb: MB, tier: number) {
  const st = tierStyle(tier);
  plinth(mb, 1.86, 1.86, 0.05);
  const y0 = 0.07;
  for (const [x, z, h] of [[0.6, 0.55, 0.8], [-0.6, 0.55, 0.8], [0.6, -0.55, 0.62], [-0.6, -0.55, 0.62]] as const) cylB(mb, 0.035, 0.04, h, 8, K.timber, x, y0, z, { surface: 'wood' });
  shed(mb, st, 1.35, 1.25, 0.84, 0.64, 0, 0, y0, 'z');
  if (tier >= 2) boxB(mb, 1.25, 0.55, 0.04, st.frame ? K.plaster : K.log, 0, y0, -0.57, { surface: st.frame ? 'plaster' : 'wood' });
  woodpile(mb, -0.15, -0.2, y0, 1.0, 'x');
  woodpile(mb, -0.15, 0.2, y0, 0.9, 'x');
  // saw-horse with a log, chopping stump with an axe
  for (const s of [-1, 1]) box(mb, 0.03, 0.26, 0.2, K.timber, 0.68 + s * 0.15, y0 + 0.12, 0.72, { rx: 0.3, surface: 'wood' });
  cyl(mb, 0.05, 0.05, 0.6, 9, K.log, 0.68, y0 + 0.26, 0.72, { rz: Math.PI / 2, surface: 'bark' });
  cylB(mb, 0.13, 0.15, 0.18, 12, K.log, -0.65, y0, 0.72, { surface: 'bark' });
  cylB(mb, 0.12, 0.12, 0.01, 12, K.logEnd, -0.65, y0 + 0.18, 0.72, { surface: 'wood' });
  box(mb, 0.25, 0.018, 0.018, K.timber, -0.6, y0 + 0.28, 0.72, { rz: 1.0, surface: 'wood' });
  box(mb, 0.05, 0.08, 0.012, '#8a9198', -0.66, y0 + 0.2, 0.72, { surface: 'metal' });
  banner(mb, -0.75, y0, -0.78, 0.95, 0.25);
}

function miningCamp(mb: MB, tier: number) {
  const st = tierStyle(tier);
  plinth(mb, 1.86, 1.86, 0.05);
  const y0 = 0.07;
  walls(mb, st, 0.9, 0.7, 0.5, -0.38, -0.45, y0);
  roof(mb, st, 0.9, 0.7, 0.36, -0.38, -0.45, y0 + 0.5, 'x', 0.08);
  door(mb, 0.07, -0.45, y0, 1, 0, 0.2, 0.32);
  // rails, ore cart and piles
  for (const s of [-1, 1]) box(mb, 1.5, 0.015, 0.02, K.iron, 0.05, y0 + 0.01, 0.42 + s * 0.08, { surface: 'metal' });
  for (let i = 0; i < 7; i++) box(mb, 0.04, 0.012, 0.26, K.timber, -0.65 + i * 0.22, y0 + 0.005, 0.42, { surface: 'wood' });
  boxB(mb, 0.3, 0.16, 0.22, '#6e5034', 0.1, y0 + 0.06, 0.42, { surface: 'wood' });
  for (const s of [-1, 1]) for (const e of [-1, 1]) cyl(mb, 0.045, 0.045, 0.02, 10, K.iron, 0.1 + e * 0.1, y0 + 0.05, 0.42 + s * 0.12, { rx: Math.PI / 2, surface: 'metal' });
  for (let i = 0; i < 4; i++) mb.bead(0.05, i % 2 ? K.gold : '#8a8278', 0.05 + i * 0.04, y0 + 0.25, 0.42 + (i % 2) * 0.04, { surface: i % 2 ? 'gold' : 'rock' });
  mb.bead(0.22, '#8a8278', 0.55, y0 + 0.02, -0.5, { surface: 'rock' }, 0.55);
  mb.bead(0.14, K.gold, 0.6, y0 + 0.1, -0.4, { surface: 'gold' }, 0.55);
  // tools and lantern post
  for (let i = 0; i < 2; i++) box(mb, 0.02, 0.4, 0.02, K.timber, -0.88, y0 + 0.2, 0.0 + i * 0.1, { rx: 0.2, surface: 'wood' });
  cylB(mb, 0.02, 0.02, 0.65, 6, K.timber, 0.75, y0, 0.78, { surface: 'wood' });
  mb.bead(0.04, K.glow, 0.78, y0 + 0.6, 0.78, { surface: 'cloth' });
  banner(mb, -0.78, y0, 0.78, 0.95, 0.25);
}

function blacksmith(mb: MB, tier: number) {
  const st = tierStyle(tier);
  plinth(mb, 2.86, 2.86, 0.1);
  const y0 = 0.1;
  walls(mb, st, 1.8, 1.3, 0.78, -0.4, -0.5, y0);
  roof(mb, st, 1.8, 1.3, 0.6, -0.4, -0.5, y0 + 0.78, 'x', 0.1);
  chimney(mb, -1.1, -0.1, y0, 1.85);
  door(mb, 0.51, -0.8, y0, 1, 0, 0.26, 0.4);
  windowW(mb, 0.51, y0 + 0.5, -0.2, 1, 0);
  // open-fronted forge under a lean-to with glowing coals, anvil and quench barrel
  for (const z of [0.2, 0.9]) cylB(mb, 0.035, 0.04, 0.68, 8, K.timber, 0.9, y0, z, { surface: 'wood' });
  shed(mb, st, 0.85, 0.95, 0.82, 0.66, 0.5, 0.55, y0, 'x');
  boxB(mb, 0.5, 0.32, 0.4, K.dstone, 0.2, y0, 0.55, { surface: 'stone' });
  boxB(mb, 0.36, 0.03, 0.28, K.glow, 0.2, y0 + 0.32, 0.55, { surface: 'cloth' });
  boxB(mb, 0.12, 0.2, 0.08, K.iron, 0.75, y0, 0.45, { surface: 'metal' });
  box(mb, 0.24, 0.05, 0.1, K.iron, 0.75, y0 + 0.22, 0.45, { surface: 'metal' });
  barrel(mb, 0.65, 0.95, y0, 0.08);
  for (let i = 0; i < 4; i++) box(mb, 0.015, 0.36, 0.015, '#aab2ba', 1.05, y0 + 0.3, -0.2 + i * 0.12, { rz: 0.1, surface: 'metal' });
  boxB(mb, 0.04, 0.3, 0.5, K.timber, 1.1, y0, -0.05, { surface: 'wood' });
  wallBanner(mb, 0.505, y0 + 0.72, -0.55, 0.36, 0.16);
  banner(mb, 1.25, y0, -1.25, 1.15, 0.3);
}

function market(mb: MB, tier: number) {
  const st = tierStyle(tier);
  plinth(mb, 2.86, 2.86, 0.06);
  const y0 = 0.07;
  walls(mb, st, 1.25, 1.05, 0.72, -0.7, -0.7, y0);
  roof(mb, st, 1.25, 1.05, 0.55, -0.7, -0.7, y0 + 0.72, 'x', 0.1);
  door(mb, -0.07, -0.7, y0, 1, 0, 0.26, 0.4);
  windowW(mb, -0.7, y0 + 0.45, -0.17, 0, 1);
  // stalls with striped awnings
  const goods = ['#c4283a', '#e0a020', '#6a9a3a', '#d87428', '#8a5aa0'];
  for (let i = 0; i < 3; i++) {
    const x = 0.75, z = -0.95 + i * 0.85;
    for (const [dx, dz] of [[0.28, 0.32], [-0.28, 0.32], [0.28, -0.32], [-0.28, -0.32]]) cylB(mb, 0.018, 0.02, dx > 0 ? 0.5 : 0.62, 6, K.timber, x + dx, y0, z + dz, { surface: 'wood' });
    for (let k = 0; k < 4; k++) box(mb, 0.68, 0.02, 0.17, k % 2 ? K.white : K.team, x, y0 + 0.58 - 0.05 * 0, z - 0.25 + k * 0.17, { rz: 0.2, team: k % 2 === 0, surface: 'cloth' });
    boxB(mb, 0.5, 0.22, 0.56, '#8a6a46', x, y0, z, { surface: 'wood' });
    for (let k = 0; k < 4; k++) mb.bead(0.045, goods[(i + k) % goods.length], x - 0.12 + (k % 2) * 0.22, y0 + 0.26, z - 0.12 + Math.floor(k / 2) * 0.24, { surface: 'skin' });
  }
  for (let i = 0; i < 3; i++) barrel(mb, -1.1 + i * 0.2, 0.95, y0);
  crate(mb, -0.3, 1.0, y0, 0.16, 0.3); crate(mb, -0.3, 1.0, y0 + 0.16, 0.12, 0.8);
  sack(mb, 0.1, 1.05, y0); sack(mb, 0.25, 1.1, y0);
  cart(mb, -0.6, 0.35, y0, 0.4);
  banner(mb, -1.25, y0, -1.25, 1.3, 0.34);
}

function monastery(mb: MB, tier: number) {
  const st = tierStyle(Math.max(3, tier));
  plinth(mb, 2.86, 2.86, 0.1);
  const y0 = 0.1;
  // nave with buttresses and tall windows, a bell tower with a spire
  walls(mb, { ...st, frame: false, wall: K.stone, wallS: 'stone' }, 2.0, 1.05, 1.0, -0.15, 0, y0, false);
  roof(mb, { ...st, frame: false }, 2.0, 1.05, 0.75, -0.15, 0, y0 + 1.0, 'x', 0.1, K.stone);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x = -1.0 + i * 0.55;
    boxB(mb, 0.1, 0.8, 0.1, K.dstone, x, y0, s * 0.56, { surface: 'stone' });
    if (i < 3) box(mb, 0.025, 0.4, 0.1, '#3d5f90', x + 0.27, y0 + 0.6, s * 0.53, { ry: Math.PI / 2, surface: 'cloth' });
  }
  cyl(mb, 0.14, 0.14, 0.03, 16, '#4a6fa0', 0.86, y0 + 1.15, 0, { rz: Math.PI / 2, surface: 'cloth' });
  door(mb, 0.86, 0, y0, 1, 0, 0.3, 0.5);
  walls(mb, { ...st, frame: false, wall: K.stone, wallS: 'stone' }, 0.6, 0.6, 1.9, -1.05, 0.95, y0, false);
  box(mb, 0.03, 0.3, 0.14, '#1e1a16', -0.74, y0 + 1.65, 0.95, { surface: 'stone' });
  mb.add(new THREE.ConeGeometry(0.43, 1, 4), st.roof, -1.05, y0 + 1.9 + 0.5, 0.95, { ry: Math.PI / 4, surface: st.roofS }, 1, 1.0, 1);
  cylB(mb, 0.015, 0.015, 0.3, 6, K.gold, -1.05, y0 + 2.9, 0.95, { surface: 'gold' });
  box(mb, 0.015, 0.015, 0.16, K.gold, -1.05, y0 + 3.12, 0.95, { surface: 'gold' });
  // cloister garden
  boxB(mb, 0.9, 0.025, 0.55, '#5d7a38', 0.6, y0, 1.0, { surface: 'leaf' });
  for (let i = 0; i < 4; i++) mb.bead(0.07, '#4d6a30', 0.25 + i * 0.24, y0 + 0.06, 1.0, { surface: 'leaf' });
  fence(mb, 0.1, 1.32, 1.3, 1.32, y0);
  wallBanner(mb, 0.87, y0 + 0.95, -0.35, 0.5, 0.18);
  wallBanner(mb, 0.87, y0 + 0.95, 0.35, 0.5, 0.18);
}

function university(mb: MB, tier: number) {
  const st = tierStyle(Math.max(3, tier));
  plinth(mb, 2.86, 2.86, 0.12);
  const y0 = 0.12;
  walls(mb, { ...st, frame: false, wall: K.stone, wallS: 'stone' }, 2.2, 1.9, 1.0, -0.15, 0, y0, false);
  boxB(mb, 2.3, 0.1, 2.0, K.quoin, -0.15, y0 + 1.0, 0, { surface: 'stone' });
  // colonnaded portico and a lead/copper dome with lantern
  for (let i = 0; i < 6; i++) cylB(mb, 0.055, 0.06, 0.95, 12, K.white, 1.05, y0, -0.75 + i * 0.3, { surface: 'stone' });
  boxB(mb, 0.35, 0.08, 1.9, K.quoin, 1.0, y0 + 0.95, 0, { surface: 'stone' });
  mb.add(TRI, K.quoin, 1.0, y0 + 1.03, 0, { surface: 'stone' }, 0.35, 0.3, 1.9);
  cylB(mb, 0.6, 0.62, 0.3, 20, K.stone, -0.15, y0 + 1.1, 0, { surface: 'stone' });
  mb.add(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), tier >= 4 ? '#5d8a7e' : st.roof, -0.15, y0 + 1.4, 0, { surface: tier >= 4 ? 'metal' : st.roofS }, 0.62, 0.55, 0.62);
  cylB(mb, 0.1, 0.1, 0.2, 10, K.stone, -0.15, y0 + 1.93, 0, { surface: 'stone' });
  mb.bead(0.06, K.gold, -0.15, y0 + 2.18, 0, { surface: 'gold' });
  for (const z of [-0.6, 0, 0.6]) windowW(mb, 0.96, y0 + 0.55, z, 1, 0, 0.14, 0.3);
  door(mb, 0.96, 0, y0, 1, 0, 0.3, 0.48);
  wallBanner(mb, 0.965, y0 + 0.92, -0.3, 0.4, 0.16);
  wallBanner(mb, 0.965, y0 + 0.92, 0.3, 0.4, 0.16);
  banner(mb, -1.25, y0, 1.25, 1.4, 0.34);
}

/** Returns true when an HD model was built for this building type. */
export function hdBuilding(mb: MB, t: string, tier: number, variant: number): boolean {
  switch (t) {
    case 'house': house(mb, tier, variant % 3); return true;
    case 'town_center': townCenter(mb, tier); return true;
    case 'barracks': barracks(mb, tier); return true;
    case 'archery_range': archeryRange(mb, tier); return true;
    case 'stable': stable(mb, tier); return true;
    case 'mill': mill(mb, tier); return true;
    case 'lumber_camp': lumberCamp(mb, tier); return true;
    case 'mining_camp': miningCamp(mb, tier); return true;
    case 'blacksmith': blacksmith(mb, tier); return true;
    case 'market': market(mb, tier); return true;
    case 'monastery': monastery(mb, tier); return true;
    case 'university': university(mb, tier); return true;
  }
  return false;
}
