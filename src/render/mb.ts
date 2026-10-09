// Model builder: accumulates flat-shaded, vertex-coloured low-poly geometry with a transform stack.
// Pieces flagged `team` go into a separate geometry tinted by player colour at render time.

import * as THREE from 'three';

const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();

export type Col = number | string;

export interface PieceOpts {
  team?: boolean;
  rx?: number;
  ry?: number;
  rz?: number;
}

export class MB {
  private base: Buf = { pos: [], nor: [], col: [], bone: [], tag: [] };
  private team: Buf = { pos: [], nor: [], col: [], bone: [], tag: [] };
  /** Skeleton joint that subsequently added geometry is attached to (0 = static). */
  bone = 0;
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
    g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const tgt = o.team ? this.team : this.base;
    tmpC.set(color as THREE.ColorRepresentation);
    const n = pos.count;
    for (let i = 0; i < n; i += 3) {
      const j = 1 + (this.rand() - 0.5) * this.jitter * 2;
      for (let k = 0; k < 3; k++) {
        tgt.pos.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
        tgt.nor.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
        tgt.col.push(tmpC.r * j, tmpC.g * j, tmpC.b * j);
        tgt.bone.push(this.bone);
        tgt.tag.push(this.tag);
      }
    }
    if (g !== geo) g.dispose();
    g = null as unknown as THREE.BufferGeometry;
    return this;
  }

  box(w: number, h: number, d: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.add(BOX, color, x, y, z, o, w, h, d);
  }

  /** Box whose bottom sits at y. */
  boxB(w: number, h: number, d: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.add(BOX, color, x, y + h / 2, z, o, w, h, d);
  }

  cyl(rTop: number, rBot: number, h: number, seg: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.add(cylGeo(rTop, rBot, seg), color, x, y, z, o, 1, h, 1);
  }

  cylB(rTop: number, rBot: number, h: number, seg: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.add(cylGeo(rTop, rBot, seg), color, x, y + h / 2, z, o, 1, h, 1);
  }

  cone(r: number, h: number, seg: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.add(cylGeo(0, r, seg), color, x, y, z, o, 1, h, 1);
  }

  coneB(r: number, h: number, seg: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.add(cylGeo(0, r, seg), color, x, y + h / 2, z, o, 1, h, 1);
  }

  ball(r: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}, sy = 1, detail = 0) {
    return this.add(detail ? ICO1 : ICO0, color, x, y, z, o, r, r * sy, r);
  }

  /** Square pyramid roof, bottom at y. */
  pyramid(w: number, d: number, h: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.add(PYR, color, x, y + h / 2, z, o, w, h, d);
  }

  /** Gable roof (triangular prism) with ridge along X, bottom at y. */
  gable(w: number, d: number, h: number, color: Col, x = 0, y = 0, z = 0, o: PieceOpts = {}) {
    return this.add(PRISM, color, x, y, z, o, w, h, d);
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
      g.computeBoundingSphere();
      g.computeBoundingBox();
      return g;
    };
    return { base: mk(this.base) ?? emptyGeo(), team: mk(this.team) };
  }
}

interface Buf { pos: number[]; nor: number[]; col: number[]; bone: number[]; tag: number[] }

function emptyGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  g.setAttribute('aBone', new THREE.Float32BufferAttribute([0, 0, 0], 1));
  g.setAttribute('aTag', new THREE.Float32BufferAttribute([0, 0, 0], 1));
  return g;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
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
