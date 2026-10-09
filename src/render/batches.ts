// Immediate-mode instancing: every frame, entities push instances into per-model InstancedMeshes.
// This keeps draw calls to roughly one or two per distinct model, which matters on phones.

import * as THREE from 'three';
import { getModel } from './models';

export type MatKind = 'lit' | 'unlit' | 'add' | 'overlay' | 'ghost';

interface Batch {
  key: string;
  mat: MatKind;
  base: THREE.InstancedMesh;
  team: THREE.InstancedMesh | null;
  n: number;
  cap: number;
  shadow: boolean;
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

  constructor(scene: THREE.Scene, mats: Record<MatKind, THREE.Material>) {
    this.scene = scene;
    this.mats = mats;
  }

  private create(key: string, mat: MatKind, cap: number, shadow: boolean): Batch {
    const model = getModel(key);
    const mk = (geo: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(geo, this.mats[mat], cap);
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
    return { key, mat, base: mk(model.base), team: model.team ? mk(model.team) : null, n: 0, cap, shadow };
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
  }
}

// ---------------------------------------------------------------- fog of war shader injection

export interface FogUniforms {
  fogMap: { value: THREE.Texture | null };
  fogSize: { value: number };
  cloudMap: { value: THREE.Texture | null };
  cloudT: { value: number };
}

export function applyFog(mat: THREE.Material, u: FogUniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fogMap = u.fogMap;
    shader.uniforms.fogSize = u.fogSize;
    shader.uniforms.cloudMap = u.cloudMap;
    shader.uniforms.cloudT = u.cloudT;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogUv;\nuniform float fogSize;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 fogWp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    fogWp = instanceMatrix * fogWp;
  #endif
  fogWp = modelMatrix * fogWp;
  vFogUv = fogWp.xz / fogSize;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFogUv;\nuniform sampler2D fogMap;\nuniform sampler2D cloudMap;\nuniform float cloudT;\nuniform float fogSize;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  float fogV = texture2D( fogMap, vFogUv ).r;
  if (vFogUv.x < 0.0 || vFogUv.y < 0.0 || vFogUv.x > 1.0 || vFogUv.y > 1.0) fogV = 0.0;
  vec2 cuv = vFogUv * fogSize / 48.0 + vec2(cloudT * 0.006, cloudT * 0.0035);
  float cl = texture2D( cloudMap, cuv ).r;
  gl_FragColor.rgb *= fogV * mix(1.0, 0.8, smoothstep(0.45, 0.75, cl));`);
  };
  mat.needsUpdate = true;
}
