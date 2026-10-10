import * as THREE from 'three';
import type { Grid } from '../sim/grid';
import type { FogUniforms } from './batches';
import { applyFogToShader } from './rig';
import type { Quality } from './renderer';

const LEVEL = -0.08;

/** Depth-colored water with crossed wave normals, shore foam and planar reflections. */
export class RealisticWater {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
  private height: THREE.DataTexture;
  private target = new THREE.WebGLRenderTarget(768, 768, { type: THREE.HalfFloatType });
  private mirror: THREE.OrthographicCamera | THREE.PerspectiveCamera = new THREE.OrthographicCamera();
  private projection = new THREE.Matrix4();
  private time = { value: 0 };
  private reflected = { value: 0 };
  private lastReflection = -Infinity;

  constructor(grid: Grid, normal: THREE.Texture, fog: FogUniforms) {
    const s = grid.size;
    const data = new Uint8Array((s + 1) ** 2 * 4);
    for (let i = 0; i < grid.height.length; i++) {
      data[i * 4] = Math.max(0, Math.min(255, Math.round((grid.height[i] + 4) / 8 * 255)));
      data[i * 4 + 3] = 255;
    }
    this.height = new THREE.DataTexture(data, s + 1, s + 1);
    this.height.magFilter = this.height.minFilter = THREE.LinearFilter;
    this.height.needsUpdate = true;
    // A coarse grid keeps interpolated distance haze consistent with the shore.
    const segments = Math.ceil((s + 40) / 3);
    const geometry = new THREE.PlaneGeometry(s + 40, s + 40, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(s / 2, LEVEL, s / 2);
    const material = new THREE.MeshPhysicalMaterial({ color: '#ffffff', normalMap: normal, normalScale: new THREE.Vector2(0.38, 0.38), roughness: 0.22, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.15, transparent: true, opacity: 0.9, depthWrite: false });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.waterHeight = { value: this.height };
      shader.uniforms.waterReflection = { value: this.target.texture };
      shader.uniforms.reflectionMatrix = { value: this.projection };
      shader.uniforms.waterTime = this.time;
      shader.uniforms.hasReflection = this.reflected;
      shader.uniforms.waterSize = { value: s };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWaterWorld;
          varying vec4 vReflection;
          uniform mat4 reflectionMatrix;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vReflection = reflectionMatrix * vec4(vWaterWorld, 1.0);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWaterWorld;
          varying vec4 vReflection;
          uniform sampler2D waterHeight;
          uniform sampler2D waterReflection;
          uniform float waterTime;
          uniform float waterSize;
          uniform float hasReflection;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 heightUv = (vWaterWorld.xz + 0.5) / (waterSize + 1.0);
          float landHeight = texture2D(waterHeight, heightUv).r * 8.0 - 4.0;
          float waterDepth = max(0.0, -0.08 - landHeight);
          if (min(heightUv.x, heightUv.y) < 0.0 || max(heightUv.x, heightUv.y) > 1.0) waterDepth = 3.0;
          float deep = 1.0 - exp(-waterDepth * 1.8);
          diffuseColor.rgb = mix(vec3(0.08, 0.24, 0.21), vec3(0.008, 0.066, 0.082), deep);
          float wave = sin(vWaterWorld.x * 15.0 + waterTime * 1.8) * sin(vWaterWorld.z * 11.0 - waterTime * 1.1);
          float foam = (1.0 - smoothstep(0.015, 0.12, waterDepth)) * smoothstep(0.25, 0.9, wave) * 0.45;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.68, 0.63), foam);
          diffuseColor.a = mix(0.3, 0.96, deep) + foam;
        `)
        .replace('#include <normal_fragment_maps>', `
          vec2 waveUv = vWaterWorld.xz * 0.32;
          vec3 n1 = texture2D(normalMap, waveUv + vec2(waterTime * 0.013, waterTime * 0.009)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(normalMap, waveUv * 1.73 + vec2(-waterTime * 0.008, waterTime * 0.011)).xyz * 2.0 - 1.0;
          vec3 mapN = normalize(vec3((n1.xy + n2.yx) * normalScale, n1.z * n2.z));
          normal = normalize(tbn * mapN);
        `)
        .replace('#include <opaque_fragment>', `
          vec2 reflectUv = vReflection.xy / vReflection.w;
          reflectUv += (n1.xy + n2.yx) * 0.008;
          float fresnel = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 4.0);
          vec3 reflectedColor = texture2D(waterReflection, clamp(reflectUv, 0.001, 0.999)).rgb;
          outgoingLight = mix(outgoingLight, reflectedColor, hasReflection * (0.08 + fresnel * 0.72));
          #include <opaque_fragment>`);
      applyFogToShader(shader, fog);
    };
    material.customProgramCacheKey = () => 'realism-water-v1';
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
  }

  animate(time: number) { this.time.value = time; }

  reflect(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, quality: Quality) {
    if (quality === 'low') { this.reflected.value = 0; return; }
    if (this.time.value - this.lastReflection < (quality === 'high' ? 0.08 : 0.16)) return;
    this.lastReflection = this.time.value;
    const resolution = quality === 'high' ? 768 : 384;
    if (this.target.width !== resolution) this.target.setSize(resolution, resolution);
    if (this.mirror.type !== camera.type) this.mirror = camera instanceof THREE.PerspectiveCamera ? new THREE.PerspectiveCamera() : new THREE.OrthographicCamera();
    (this.mirror as THREE.Camera).copy(camera);
    this.mirror.position.y = 2 * LEVEL - camera.position.y;
    const look = camera.getWorldDirection(new THREE.Vector3());
    look.y *= -1;
    this.mirror.up.set(0, -1, 0);
    this.mirror.lookAt(this.mirror.position.clone().add(look));
    this.mirror.updateMatrixWorld();
    this.projection.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.projection.multiply(this.mirror.projectionMatrix).multiply(this.mirror.matrixWorldInverse);
    const hidden: THREE.Object3D[] = [];
    // World indicators and fog overlays must not appear upside down in the water.
    scene.traverse((object) => {
      if (!object.visible || !(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.Material;
      if (object === this.mesh || !material.depthTest || material.transparent && material.type === 'MeshBasicMaterial') {
        object.visible = false;
        hidden.push(object);
      }
    });
    const previousTarget = gl.getRenderTarget();
    const shadowAutoUpdate = gl.shadowMap.autoUpdate;
    const previousPlanes = gl.clippingPlanes;
    const previousXr = gl.xr.enabled;
    try {
      gl.xr.enabled = false;
      gl.shadowMap.autoUpdate = false;
      gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -LEVEL)];
      gl.setRenderTarget(this.target);
      gl.clear();
      gl.render(scene, this.mirror);
      this.reflected.value = 1;
    } finally {
      gl.setRenderTarget(previousTarget);
      gl.clippingPlanes = previousPlanes;
      gl.shadowMap.autoUpdate = shadowAutoUpdate;
      gl.xr.enabled = previousXr;
      for (const object of hidden) object.visible = true;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.height.dispose();
    this.target.dispose();
  }
}
