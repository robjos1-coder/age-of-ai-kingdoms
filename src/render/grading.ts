// Colour grading for the realistic renderer, implemented as three.js's CustomToneMapping hook so it
// costs nothing extra (no post-processing pass): filmic tone curve, richer saturation, gentle contrast
// and warm-highlight / cool-shadow split toning in the spirit of Age of Empires IV.

import * as THREE from 'three';

const GRADE = /* glsl */ `
vec3 CustomToneMapping( vec3 color ) {
  color *= toneMappingExposure;
  // ACES fitted curve (Narkowicz) — softer shoulder than the default for sunny scenes
  vec3 c = clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), 0.0, 1.0);
  // work in an approximately perceptual space for grading
  vec3 g = sqrt(c);
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, 1.2);                                   // saturation
  g = (g - 0.5) * 1.07 + 0.5;                                 // contrast
  g += vec3(0.022, 0.011, -0.018) * smoothstep(0.45, 0.95, l); // warm highlights
  g += vec3(-0.012, 0.004, 0.024) * (1.0 - smoothstep(0.05, 0.45, l)); // cool shadows
  g = clamp(g, 0.0, 1.0);
  return g * g;
}
`;

const chunk = THREE.ShaderChunk as unknown as Record<string, string>;
if (!chunk.tonemapping_pars_fragment.includes('warm highlights')) {
  chunk.tonemapping_pars_fragment = chunk.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', GRADE);
}
