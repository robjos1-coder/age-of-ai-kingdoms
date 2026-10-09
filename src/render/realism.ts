import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { FogUniforms } from './batches';
import { applyFogToShader } from './rig';

type Shader = THREE.WebGLProgramParametersWithUniforms;
export interface ScanAtlas { color: THREE.Texture; normal: THREE.Texture; arm: THREE.Texture }

/** Each renderer owns its textures so toggling/restarting cannot leave stale GPU resources. */
export class RealismAssets {
  model: ScanAtlas;
  ground: ScanAtlas;
  environment: THREE.WebGLRenderTarget;
  ready: Promise<void>;
  private textures: THREE.Texture[] = [];
  private pmrem: THREE.PMREMGenerator;
  private disposed = false;

  constructor(gl: THREE.WebGLRenderer, scene: THREE.Scene, quality = 'high') {
    const loader = new THREE.TextureLoader();
    const pending: Promise<void>[] = [];
    const load = (file: string, srgb = false) => {
      let complete!: () => void;
      let fail!: (error: unknown) => void;
      pending.push(new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; }));
      const texture = loader.load(`${import.meta.env.BASE_URL}realism/${file}`, (loaded) => {
        const max = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
        const source = loaded.image as HTMLImageElement;
        if (source.width > max) {
          const canvas = document.createElement('canvas');
          canvas.width = max;
          canvas.height = Math.round(source.height * max / source.width);
          canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
          (loaded as THREE.Texture).image = canvas;
          loaded.needsUpdate = true;
        }
        if (this.disposed) loaded.dispose();
        complete();
      }, undefined, fail);
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      this.textures.push(texture);
      return texture;
    };
    const atlas = (prefix: string) => ({ color: load(`${prefix}-color.webp`, true), normal: load(`${prefix}-normal.webp`), arm: load(`${prefix}-arm.webp`) });
    this.model = atlas('model');
    this.ground = atlas('ground');
    this.pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    this.environment = this.pmrem.fromScene(room, 0.04);
    room.dispose();
    scene.environment = this.environment.texture;
    scene.environmentIntensity = 0.65;
    pending.push(new Promise<void>((resolve, reject) => {
      new HDRLoader().load(`${import.meta.env.BASE_URL}realism/daylight.hdr`, (hdr) => {
        if (this.disposed) { hdr.dispose(); resolve(); return; }
        const next = this.pmrem.fromEquirectangular(hdr);
        hdr.dispose();
        this.environment.dispose();
        this.environment = next;
        scene.environment = next.texture;
        resolve();
      }, undefined, reject);
    }));
    this.ready = Promise.all(pending).then(() => undefined);
    // In-match style changes render with the room environment while local assets load.
    // Keep a rejection handler attached even when no caller is awaiting readiness.
    void this.ready.catch((error) => console.error('Unable to load realistic world assets', error));
  }

  dispose() {
    this.disposed = true;
    for (const texture of this.textures) texture.dispose();
    this.environment.dispose();
    this.pmrem.dispose();
  }
}

const ATLAS_GLSL = `
uniform sampler2D scanColor;
uniform sampler2D scanNormal;
uniform sampler2D scanArm;
vec4 scanSampleGrad(sampler2D tex, vec2 uv, float slot, vec2 grid, vec2 du, vec2 dv) {
  vec2 tile = vec2(mod(slot, grid.x), grid.y - 1.0 - floor(slot / grid.x));
  // 8px wrap-around gutters in every 1024px tile. Explicit derivatives avoid
  // a false coarse mip at every fract seam; clamp mip footprint to the gutter.
  vec2 at = (tile + (vec2(8.0) + fract(uv) * 1008.0) / 1024.0) / grid;
  vec2 dx = du * (1008.0 / 1024.0) / grid;
  vec2 dy = dv * (1008.0 / 1024.0) / grid;
  float footprint = max(length(dx * grid), length(dy * grid));
  float limit = min(1.0, 0.006 / max(footprint, 0.00001));
  return textureGrad(tex, at, dx * limit, dy * limit);
}
vec4 scanSample(sampler2D tex, vec2 uv, float slot, vec2 grid) {
  return scanSampleGrad(tex, uv, slot, grid, dFdx(uv), dFdy(uv));
}
`;

function uniforms(shader: Shader, atlas: ScanAtlas) {
  shader.uniforms.scanColor = { value: atlas.color };
  shader.uniforms.scanNormal = { value: atlas.normal };
  shader.uniforms.scanArm = { value: atlas.arm };
}

/** PBR atlas injection also works on the instanced skeleton shader. */
export function applyModelScans(shader: Shader, atlas: ScanAtlas, wind?: { value: number }) {
  uniforms(shader, atlas);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aSurface;\nvarying float vSurface;\nvarying vec2 vScanUv;\nuniform float worldTime;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      if (aSurface > 6.5 && aSurface < 7.5) {
        float sway = sin(worldTime * 1.35 + position.x * 4.2 + position.z * 3.0);
        transformed.x += sway * min(0.025, max(0.0, position.y) * 0.012);
      }`)
    .replace('#include <project_vertex>', '#include <project_vertex>\nvSurface = aSurface;\nvScanUv = uv;');
  shader.uniforms.worldTime = wind ?? { value: 0 };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vSurface;\nvarying vec2 vScanUv;\n' + ATLAS_GLSL)
    .replace('#include <map_fragment>', `
      vec4 scanAlbedo = scanSample(scanColor, vScanUv, floor(vSurface + 0.5), vec2(4.0));
      diffuseColor.rgb *= scanAlbedo.rgb;
      vec3 scanProperties = scanSample(scanArm, vScanUv, floor(vSurface + 0.5), vec2(4.0)).rgb;
      diffuseColor.rgb *= mix(0.65, 1.0, scanProperties.r);
    `)
    .replace('#include <roughnessmap_fragment>', `
      float roughnessFactor = roughness * scanProperties.g;
      if (abs(vSurface - 9.0) < 0.5) roughnessFactor = max(0.27, roughnessFactor * 0.6);
      if (vSurface > 14.5) roughnessFactor = 0.3;
    `)
    .replace('#include <metalnessmap_fragment>', `
      float metalnessFactor = abs(vSurface - 9.0) < 0.5 ? 0.82 : vSurface > 14.5 ? 0.85 : 0.0;
    `)
    .replace('#include <normal_fragment_maps>', `
      vec3 mapN = scanSample(scanNormal, vScanUv, floor(vSurface + 0.5), vec2(4.0)).xyz * 2.0 - 1.0;
      mapN.xy *= normalScale;
      normal = normalize(tbn * mapN);
    `);
}

export function makeRealismMaterial(atlas: ScanAtlas, fog: FogUniforms | null, wind?: { value: number }) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas.color, normalMap: atlas.normal, roughness: 0.95, metalness: 0, normalScale: new THREE.Vector2(0.65, 0.65) });
  material.onBeforeCompile = (shader) => {
    applyModelScans(shader, atlas, wind);
    if (fog) applyFogToShader(shader, fog);
  };
  material.customProgramCacheKey = () => `realism-model-v1-${!!fog}`;
  return material;
}

export function makeGroundMaterial(atlas: ScanAtlas, mask: THREE.Texture, fog: FogUniforms, size: number, lush = false) {
  const material = new THREE.MeshStandardMaterial({ map: atlas.color, normalMap: atlas.normal, roughness: 1, normalScale: new THREE.Vector2(0.85, 0.85) });
  material.onBeforeCompile = (shader) => {
    uniforms(shader, atlas);
    shader.uniforms.biomeMap = { value: mask };
    shader.uniforms.worldSize = { value: size };
    shader.uniforms.lushGround = { value: lush ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGroundPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGroundPos;
        uniform sampler2D biomeMap;
        uniform float worldSize;
        uniform float lushGround;
        ${ATLAS_GLSL}
        vec3 groundScan(sampler2D tex, vec2 uv, vec4 weights, float snow, float rock) {
          // Derivatives must be evaluated before divergent surface branches.
          vec2 du = dFdx(uv), dv = dFdy(uv), grid = vec2(4.0, 2.0);
          vec3 c = vec3(0.0);
          if (weights.r > 0.001) c += scanSampleGrad(tex, uv, lushGround > 0.5 ? 6.0 : 0.0, grid, du, dv).rgb * weights.r;
          if (weights.g > 0.001) c += scanSampleGrad(tex, uv, 1.0, grid, du, dv).rgb * weights.g;
          if (weights.b > 0.001) c += scanSampleGrad(tex, uv, 2.0, grid, du, dv).rgb * weights.b;
          if (weights.a > 0.001) c += scanSampleGrad(tex, uv, 3.0, grid, du, dv).rgb * weights.a;
          if (snow > 0.001) c = mix(c, scanSampleGrad(tex, uv, 4.0, grid, du, dv).rgb, snow);
          if (rock > 0.001) c = mix(c, scanSampleGrad(tex, uv, 5.0, grid, du, dv).rgb, rock);
          return c;
        }
      `)
      .replace('#include <map_fragment>', `
        vec2 terrainUv = vGroundPos.xz / 3.4;
        vec4 weights = texture2D(biomeMap, vGroundPos.xz / worldSize);
        float totalWeight = dot(weights, vec4(1.0));
        float snow = 1.0 - smoothstep(0.05, 0.4, totalWeight);
        weights /= max(totalWeight, 0.001);
        float slope = 1.0 - abs(normalize(vNormal).y);
        // vNormal is in view space: derive the actual terrain slope from position derivatives.
        vec3 gn = normalize(cross(dFdx(vGroundPos), dFdy(vGroundPos)));
        slope = 1.0 - abs(gn.y);
        float rock = smoothstep(0.14, 0.52, slope) * (1.0 - snow);
        vec3 groundAlbedo = groundScan(scanColor, terrainUv, weights, snow, rock);
        // Meadow pigment remains legible at the wide RTS zoom; leave paths and
        // sand neutral, retaining the photographic grass's local variation.
        groundAlbedo *= mix(vec3(1.0), vec3(0.58, 0.91, 0.42), weights.r * mix(0.4, 0.85, lushGround) * (1.0 - rock));
        float macro = sin(vGroundPos.x * 0.23 + sin(vGroundPos.z * 0.17)) * sin(vGroundPos.z * 0.29);
        groundAlbedo *= 0.94 + macro * 0.08;
        diffuseColor.rgb *= groundAlbedo;
        vec3 groundProperties = groundScan(scanArm, terrainUv, weights, snow, rock);
        diffuseColor.rgb *= mix(0.7, 1.0, groundProperties.r);
      `)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = max(0.68, groundProperties.g);')
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = groundScan(scanNormal, terrainUv, weights, snow, rock) * 2.0 - 1.0;
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);
      `);
    applyFogToShader(shader, fog);
  };
  material.customProgramCacheKey = () => 'realism-ground-v1';
  return material;
}
