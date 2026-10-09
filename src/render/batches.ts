// Immediate-mode instancing: every frame, entities push instances into per-model InstancedMeshes.
// This keeps draw calls to roughly one or two per distinct model, which matters on phones.

import * as THREE from 'three';
import { getModel } from './models';
import { applyFogToShader, makeRigDepthMaterial, makeRigMaterial } from './rig';
import type { ScanAtlas } from './realism';

export type MatKind = 'lit' | 'unlit' | 'add' | 'overlay' | 'ghost';

interface Batch {
  key: string;
  mat: MatKind;
  base: THREE.InstancedMesh;
  team: THREE.InstancedMesh | null;
  n: number;
  cap: number;
  shadow: boolean;
  anim?: THREE.InstancedBufferAttribute;
  show?: THREE.InstancedBufferAttribute;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);

export class Batches {
  scene: THREE.Scene;
  mats: Record<MatKind, THREE.Material>;
  map = new Map<string, Batch>();
  shadows = true;
  fog: FogUniforms | null = null;
  private rigMats = new Map<string, { mat: THREE.Material; depth: THREE.Material }>();

  constructor(scene: THREE.Scene, mats: Record<MatKind, THREE.Material>, fog?: FogUniforms, public realistic = false, private scans?: ScanAtlas, private wind?: { value: number }) {
    this.scene = scene;
    this.mats = mats;
    this.fog = fog ?? null;
  }

  private create(key: string, mat: MatKind, cap: number, shadow: boolean): Batch {
    const model = getModel(key, this.realistic && mat === 'lit');
    let material = this.mats[mat];
    let depth: THREE.Material | undefined;
    let anim: THREE.InstancedBufferAttribute | undefined, show: THREE.InstancedBufferAttribute | undefined;
    if (model.rig && mat === 'lit') {
      let rm = this.rigMats.get(key);
      if (!rm) { rm = { mat: makeRigMaterial(model.rig, this.fog, this.scans, this.wind), depth: makeRigDepthMaterial(model.rig) }; this.rigMats.set(key, rm); }
      material = rm.mat;
      depth = rm.depth;
      anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      show = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
      anim.setUsage(THREE.DynamicDrawUsage);
      show.setUsage(THREE.DynamicDrawUsage);
      model.base.setAttribute('aAnim', anim);
      model.base.setAttribute('aShow', show);
      if (model.team) { model.team.setAttribute('aAnim', anim); model.team.setAttribute('aShow', show); }
    }
    const mk = (geo: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(geo, material, cap);
      if (depth) m.customDepthMaterial = depth;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = shadow && this.shadows;
      m.receiveShadow = mat === 'lit';
      if (mat === 'overlay') m.renderOrder = 10;
      if (mat === 'add') m.renderOrder = 5;
      this.scene.add(m);
      return m;
    };
    return { key, mat, base: mk(model.base), team: model.team ? mk(model.team) : null, n: 0, cap, shadow, anim, show };
  }

  private get(key: string, mat: MatKind, shadow: boolean): Batch {
    let b = this.map.get(key + '#' + mat);
    if (!b) {
      b = this.create(key, mat, 64, shadow);
      this.map.set(key + '#' + mat, b);
    } else if (b.n >= b.cap) {
      // grow
      const nb = this.create(key, mat, b.cap * 2, shadow);
      nb.base.instanceMatrix.array.set(b.base.instanceMatrix.array);
      nb.base.instanceColor!.array.set(b.base.instanceColor!.array);
      if (b.team && nb.team) {
        nb.team.instanceMatrix.array.set(b.team.instanceMatrix.array);
        nb.team.instanceColor!.array.set(b.team.instanceColor!.array);
      }
      if (b.anim && nb.anim) nb.anim.array.set(b.anim.array);
      if (b.show && nb.show) nb.show.array.set(b.show.array);
      nb.n = b.n;
      this.scene.remove(b.base); b.base.dispose();
      if (b.team) { this.scene.remove(b.team); b.team.dispose(); }
      this.map.set(key + '#' + mat, nb);
      b = nb;
    }
    return b;
  }

  begin() {
    for (const b of this.map.values()) b.n = 0;
  }

  /** Add an instance by position / yaw / scale. */
  add(key: string, x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx, team?: THREE.Color | null, tint?: THREE.Color | null, mat: MatKind = 'lit', shadow = true, pitch = 0, roll = 0) {
    const b = this.get(key, mat, shadow);
    _p.set(x, y, z);
    _e.set(pitch, yaw, roll, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    this.write(b, _m, team, tint);
  }

  /** Add an animated (rigged) instance. roll tips the model over sideways (death). */
  addRig(key: string, x: number, y: number, z: number, yaw: number, scale: number, team: THREE.Color | null, tint: THREE.Color | null,
    clip: number, t: number, mclip: number, mt: number, show0: number, show1: number, roll = 0, shadow = true) {
    const b = this.get(key, 'lit', shadow);
    _p.set(x, y, z);
    _e.set(roll, yaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(scale, scale, scale);
    _m.compose(_p, _q, _s);
    const i = b.n;
    this.write(b, _m, team, tint);
    if (b.anim) {
      const a = b.anim.array as Float32Array;
      a[i * 4] = clip; a[i * 4 + 1] = t; a[i * 4 + 2] = mclip; a[i * 4 + 3] = mt;
      const sh = b.show!.array as Float32Array;
      sh[i * 2] = show0; sh[i * 2 + 1] = show1;
    }
  }

  addMatrix(key: string, m: THREE.Matrix4, team?: THREE.Color | null, tint?: THREE.Color | null, mat: MatKind = 'lit', shadow = true) {
    const b = this.get(key, mat, shadow);
    this.write(b, m, team, tint);
  }

  private write(b: Batch, m: THREE.Matrix4, team?: THREE.Color | null, tint?: THREE.Color | null) {
    const i = b.n++;
    m.toArray(b.base.instanceMatrix.array as Float32Array, i * 16);
    const t = tint ?? WHITE;
    const ca = b.base.instanceColor!.array as Float32Array;
    ca[i * 3] = t.r; ca[i * 3 + 1] = t.g; ca[i * 3 + 2] = t.b;
    if (b.team) {
      m.toArray(b.team.instanceMatrix.array as Float32Array, i * 16);
      const tc = team ?? WHITE;
      _c.copy(tc);
      if (tint) _c.multiply(tint);
      const ta = b.team.instanceColor!.array as Float32Array;
      ta[i * 3] = _c.r; ta[i * 3 + 1] = _c.g; ta[i * 3 + 2] = _c.b;
    }
  }

  end() {
    for (const b of this.map.values()) {
      b.base.count = b.n;
      b.base.visible = b.n > 0;
      if (b.n) {
        b.base.instanceMatrix.needsUpdate = true;
        b.base.instanceColor!.needsUpdate = true;
      }
      if (b.anim && b.n) { b.anim.needsUpdate = true; b.show!.needsUpdate = true; }
      if (b.team) {
        b.team.count = b.n;
        b.team.visible = b.n > 0;
        if (b.n) {
          b.team.instanceMatrix.needsUpdate = true;
          b.team.instanceColor!.needsUpdate = true;
        }
      }
    }
  }

  setShadows(on: boolean) {
    this.shadows = on;
    for (const b of this.map.values()) {
      b.base.castShadow = on && b.shadow;
      if (b.team) b.team.castShadow = on && b.shadow;
    }
  }

  dispose() {
    for (const b of this.map.values()) {
      this.scene.remove(b.base); b.base.dispose();
      if (b.team) { this.scene.remove(b.team); b.team.dispose(); }
    }
    this.map.clear();
    for (const materials of this.rigMats.values()) { materials.mat.dispose(); materials.depth.dispose(); }
    this.rigMats.clear();
  }
}

// ---------------------------------------------------------------- fog of war shader injection

export interface FogUniforms {
  fogMap: { value: THREE.Texture | null };
  fogSize: { value: number };
  cloudMap: { value: THREE.Texture | null };
  cloudT: { value: number };
  /** Analytic aerial perspective; shared by terrain, water and animated models. */
  atmosphere?: {
    hazeColor: { value: THREE.Color };
    hazeNear: { value: number };
    hazeRange: { value: number };
    hazeStrength: { value: number };
  };
}

export function applyFog(mat: THREE.Material, u: FogUniforms) {
  mat.onBeforeCompile = (shader) => applyFogToShader(shader, u);
  mat.needsUpdate = true;
}
