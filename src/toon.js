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

// Height fog: the haze sits in the streets and thins toward the rooftops, like golden-hour air
// down an avenue. The view matrix is rigid (v = R w + t), so world y = column 1 of R dotted with (v - t).
THREE.ShaderChunk.fog_pars_vertex = THREE.ShaderChunk.fog_pars_vertex.replace(
  'varying float vFogDepth;',
  'varying float vFogDepth;\n\tvarying float vFogHeight;',
);
THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex.replace(
  'vFogDepth = - mvPosition.z;',
  'vFogDepth = - mvPosition.z;\n\tvFogHeight = dot( viewMatrix[1].xyz, mvPosition.xyz - viewMatrix[3].xyz );',
);
THREE.ShaderChunk.fog_pars_fragment = THREE.ShaderChunk.fog_pars_fragment.replace(
  'varying float vFogDepth;',
  'varying float vFogDepth;\n\tvarying float vFogHeight;',
);
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
  'float fogD = fogDensity * mix( 1.15, 0.45, smoothstep( 2.0, 70.0, vFogHeight ) );\n\t\tfloat fogFactor = 1.0 - exp( - fogD * fogD * vFogDepth * vFogDepth );',
);
