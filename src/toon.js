import * as THREE from 'three';

/**
 * Cel shading at the lighting level: every lit material gets a two-step light ramp
 * (lit / shade, with a thin soft edge) instead of a smooth falloff, and the sky fill
 * light gets a gentle step too. This is what makes 3D forms read like a drawing.
 * Must run before any material compiles.
 */
const direct = 'vec3 irradiance = dotNL * directLight.color;';
if (THREE.ShaderChunk.lights_physical_pars_fragment.includes(direct)) {
  THREE.ShaderChunk.lights_physical_pars_fragment = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
    direct,
    `float toonNL = smoothstep( 0.0, 0.06, dotNL ) * 0.78 + smoothstep( 0.42, 0.5, dotNL ) * 0.22;
	vec3 irradiance = toonNL * directLight.color;`,
  );
}
const hemi = 'float hemiDiffuseWeight = 0.5 * dotNL + 0.5;';
if (THREE.ShaderChunk.lights_pars_begin.includes(hemi)) {
  THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace(
    hemi,
    'float hemiDiffuseWeight = 0.35 + 0.65 * smoothstep( -0.25, 0.35, dotNL );',
  );
}
