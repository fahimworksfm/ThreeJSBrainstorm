// Small material patches shared by the comic look: a crisp rim light on characters and
// cars, and a dithered fade for anything that gets between the camera and the hero.
import * as THREE from 'three';

/** Rim color and strength, driven by the time of day (warm sun at golden hour, neon-cool at night). */
export const RIM = {
  color: { value: new THREE.Color(1, 0.8, 0.55) },
  strength: { value: 0.6 },
};

/** A hard-edged Fresnel rim, the ink-and-highlight edge comic colorists paint on figures. */
export function rimLight(material, scale = 1) {
  if (material.userData.rim) return material;
  material.userData.rim = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.uniforms.rimColor = RIM.color;
    shader.uniforms.rimStrength = RIM.strength;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 rimColor;\nuniform float rimStrength;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `{
          float fres = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          float rim = smoothstep(0.62, 0.72, fres) * ${scale.toFixed(2)};
          outgoingLight += rimColor * rim * rimStrength;
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `rim${scale}`;
  material.needsUpdate = true;
  return material;
}

/** Screen-door fade (ordered dither) for fragments within [near, far] meters of the camera. */
export function nearFade(material, near = 2.5, far = 6) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vNfWorld;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 nfWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          nfWorld = instanceMatrix * nfWorld;
        #endif
        vNfWorld = (modelMatrix * nfWorld).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec3 vNfWorld;\nvoid main() {')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          float keep = smoothstep(${near.toFixed(2)}, ${far.toFixed(2)}, distance(vNfWorld, cameraPosition));
          vec2 p = floor(mod(gl_FragCoord.xy, 4.0));
          float b = mod(p.x * 4.0 + p.y * 7.0 + p.x * p.y * 3.0, 16.0) / 16.0;
          if (keep < 0.999 && keep <= b) discard;
        }`,
      );
  };
  material.customProgramCacheKey = () => `nearfade${near}-${far}${material.userData.rim ? 'rim' : ''}`;
  material.needsUpdate = true;
  return material;
}

/** Pavement that lets the wet-street reflection underneath show through when it rains. */
export function wetGround(material) {
  material.userData.wetGround = true;
  return material;
}

/** Called when the weather changes: soaked pavement turns darker and mirror-like. */
export function setWet(root, wet) {
  root.traverse((o) => {
    const m = o.material;
    if (!m?.userData?.wetGround) return;
    // draw before the additive lamp pools so they still glow on top
    o.renderOrder = wet ? -1 : 0;
    if (m.transparent === wet) return;
    m.transparent = wet;
    m.opacity = wet ? 0.72 : 1;
    m.needsUpdate = true;
  });
}
