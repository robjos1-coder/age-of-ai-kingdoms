// Model builder: accumulates flat-shaded, vertex-coloured low-poly geometry with a transform stack.
// Pieces flagged `team` go into a separate geometry tinted by player colour at render time.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SURFACE, SURFACE_SCALE, surfaceFor, type Surface } from './surfaces';
import { gableDetails, pyramidDetails } from './realism-models';

const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();
const tmpP = new THREE.Vector3();
const tmpN = new THREE.Vector3();

export type Col = number | string;

export interface PieceOpts {
  team?: boolean;
  rx?: number;
  ry?: number;
  rz?: number;
  surface?: Surface;
}

export class MB {
  private base: Buf = { pos: [], nor: [], col: [], bone: [], tag: [], uv: [], surface: [] };
  private team: Buf = { pos: [], nor: [], col: [], bone: [], tag: [], uv: [], surface: [] };
  surfaces = new Map<Col, Surface>();
  constructor(public realistic = false, public context = 'unit') {
    if (realistic) this.jitter = 0.012;
  }
  /** Skeleton joint that subsequently added geometry is attached to (0 = static). */
  bone = 0;
  /** Optional normal override for foliage cards (model-space position → normal, both mutable). */
  normalFn: ((p: THREE.Vector3, n: THREE.Vector3) => void) | null = null;
  /** Optional geometry tag (e.g. which tool / carried item); untagged = 0. */
  tag = 0;
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  /** Small deterministic jitter so neighbouring faces have slightly different shades. */
  jitter = 0.04;
  private seed = 1;

  get m() {
    return this.stack[this.stack.length - 1];
  }

  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(s, s, s),
    );
    this.stack.push(this.m.clone().multiply(m));
    return this;
  }

  pushScale(sx: number, sy: number, sz: number) {
    this.stack.push(this.m.clone().multiply(new THREE.Matrix4().makeScale(sx, sy, sz)));
    return this;
  }

  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  add(geo: THREE.BufferGeometry, color: Col, x: number, y: number, z: number, o: PieceOpts = {}, sx = 1, sy = 1, sz = 1) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    tmpM.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, 'YXZ')),
      new THREE.Vector3(sx, sy, sz),
    );
    g.applyMatrix4(this.m.clone().multiply(tmpM));
    if (!this.realistic || !g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const tgt = o.team ? this.team : this.base;
    tmpC.set(color as THREE.ColorRepresentation);
    const surface = o.surface ?? (o.team ? 'cloth' : this.surfaces.get(color) ?? surfaceFor(color, this.context));
    const slot = SURFACE[surface];
    const card = surface === 'foliage';
    const guv = card ? g.getAttribute('uv') : null;
    if (this.realistic && !['leaf', 'skin', 'cloth', 'leather', 'wool', 'foliage'].includes(surface)) {
      tmpC.lerp(WHITE, surface === 'rock' ? 0.2 : surface === 'slate' ? 0.32 : surface === 'tile' ? 0.6 : surface === 'thatch' ? 0.65 : 0.8);
    }
    const density = SURFACE_SCALE[slot];
    const n = pos.count;
    for (let i = 0; i < n; i += 3) {
      const j = 1 + (this.rand() - 0.5) * this.jitter * 2;
      for (let k = 0; k < 3; k++) {
        tgt.pos.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
        if (card && this.normalFn) {
          tmpP.set(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
          tmpN.set(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
          this.normalFn(tmpP, tmpN);
          tgt.nor.push(tmpN.x, tmpN.y, tmpN.z);
        } else tgt.nor.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
        tgt.col.push(tmpC.r * j, tmpC.g * j, tmpC.b * j);
        tgt.bone.push(this.bone);
        tgt.tag.push(this.tag);
        tgt.surface.push(slot);
        // Piece-space projection keeps grain attached to moving limbs and tools.
        // Select one plane per triangle to avoid UV discontinuities on rounded surfaces.
        const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
        const p = i + k;
        const u = nx > ny && nx > nz ? pos.getZ(p) : pos.getX(p);
        const v = ny > nx && ny > nz ? pos.getZ(p) : pos.getY(p);
        if (guv) tgt.uv.push(guv.getX(p), guv.getY(p));
        else tgt.uv.push(u * density, v * density);
      }
    }
    if (g !== geo) g.dispose();
    g = null as unknown as THREE.BufferGeometry;
    return this;
  }

  box(w: number, h: number, d: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    if (this.realistic && this.context === 'unit' && Math.min(w, h, d) > 0.015) return this.add(roundedBox(w, h, d), color, x, y, z, o);
    return this.add(BOX, color, x, y, z, o, w, h, d);
  }

  /** Box whose bottom sits at y. */
  boxB(w: number, h: number, d: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.box(w, h, d, color, x, y + h / 2, z, o);
  }

  cyl(rTop: number, rBot: number, h: number, seg: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.add(cylGeo(rTop, rBot, this.realistic ? Math.max(10, Math.min(16, Math.round(seg * 1.5))) : seg), color, x, y, z, o, 1, h, 1);
  }

  cylB(rTop: number, rBot: number, h: number, seg: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.cyl(rTop, rBot, h, seg, color, x, y + h / 2, z, o);
  }

  cone(r: number, h: number, seg: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.cyl(0, r, h, seg, color, x, y, z, o);
  }

  coneB(r: number, h: number, seg: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.cone(r, h, seg, color, x, y + h / 2, z, o);
  }

  ball(r: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}, sy = 1, detail = 0) {
    return this.add(this.realistic ? SPHERE : detail ? ICO1 : ICO0, color, x, y, z, o, r, r * sy, r);
  }

  /** Low-poly sphere for small repeated details. */
  bead(r: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}, sy = 1) {
    return this.add(BEAD, color, x, y, z, o, r, r * sy, r);
  }

  /** Square pyramid roof, bottom at y. */
  pyramid(w: number, d: number, h: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    this.add(PYR, color, x, y + h / 2, z, o, w, h, d);
    if (this.realistic && this.context === 'building') pyramidDetails(this, w, d, h, color, x, y, z, o);
    return this;
  }

  /** Gable roof (triangular prism) with ridge along X, bottom at y. */
  gable(w: number, d: number, h: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    this.add(PRISM, color, x, y, z, o, w, h, d);
    if (this.realistic && this.context === 'building') gableDetails(this, w, d, h, color, x, y, z, o);
    return this;
  }

  /** Thin plane-ish slab (for flags, sails). */
  slab(w: number, h: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}, t = 0.02) {
    return this.add(BOX, color, x, y, z, o, t, h, w);
  }

  build(): { base: THREE.BufferGeometry; team: THREE.BufferGeometry | null } {
    const mk = (d: Buf) => {
      if (!d.pos.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
      g.setAttribute('aBone', new THREE.Float32BufferAttribute(d.bone, 1));
      g.setAttribute('aTag', new THREE.Float32BufferAttribute(d.tag, 1));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
      g.setAttribute('aSurface', new THREE.Float32BufferAttribute(d.surface, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    };
    return { base: mk(this.base) ?? emptyGeo(), team: mk(this.team) };
  }
}

interface Buf { pos: number[]; nor: number[]; col: number[]; bone: number[]; tag: number[]; uv: number[]; surface: number[] }

function emptyGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  g.setAttribute('aBone', new THREE.Float32BufferAttribute([0, 0, 0], 1));
  g.setAttribute('aTag', new THREE.Float32BufferAttribute([0, 0, 0], 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
  g.setAttribute('aSurface', new THREE.Float32BufferAttribute([0, 0, 0], 1));
  return g;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHITE = new THREE.Color(1, 1, 1);
const SPHERE = new THREE.SphereGeometry(1, 12, 8);
const BEAD = new THREE.SphereGeometry(1, 7, 5);
const roundCache = new Map<string, THREE.BufferGeometry>();
function roundedBox(w: number, h: number, d: number) {
  const key = `${w}|${h}|${d}`;
  let geometry = roundCache.get(key);
  if (!geometry) {
    geometry = new RoundedBoxGeometry(w, h, d, 1, Math.min(0.025, Math.min(w, h, d) * 0.22));
    roundCache.set(key, geometry);
  }
  return geometry;
}
const ICO0 = new THREE.IcosahedronGeometry(1, 0);
const ICO1 = new THREE.IcosahedronGeometry(1, 1);
const PYR = (() => {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  return g;
})();
const PRISM = (() => {
  // triangle in YZ extruded along X; base width 1 (z from -.5..5), height 1
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.lineTo(-0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
})();
const cylCache = new Map<string, THREE.BufferGeometry>();
function cylGeo(rt: number, rb: number, seg: number) {
  const k = `${rt}|${rb}|${seg}`;
  let g = cylCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, 1, seg, 1);
    cylCache.set(k, g);
  }
  return g;
}
