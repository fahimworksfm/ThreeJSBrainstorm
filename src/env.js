import * as THREE from 'three';

/** A dim, neon-tinted environment map so metal and glass pick up city colors. */
export function makeCityEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060a);
  const panel = (color, intensity, pos, w, h) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  panel(0xffa050, 1.6, [10, 0.5, 0], 8, 2); // sodium street glow
  panel(0xff3b8a, 1.4, [-7, 1, 6], 4, 1.5); // neon
  panel(0x39d0ff, 1.2, [-5, 0.8, -8], 5, 1.2);
  panel(0xfff1d8, 1.0, [3, 1.5, 9], 6, 2.5); // shop windows
  panel(0x1c2440, 0.8, [0, 12, 0], 30, 30); // sky
  panel(0x2a1d24, 0.6, [0, -6, 0], 30, 30); // wet ground bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  return tex;
}
