import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const norm = (name) => name.replace(/^mixamorig:?/, '');

const loader = new GLTFLoader();
const embedded = () => (typeof window !== 'undefined' ? window.__NW_MODELS : null);
/** Load a model from the embedded bundle if there is one, else from its URL. */
function loadModel(url, key) {
  const e = embedded();
  if (e?.[key]) {
    const bin = Uint8Array.from(atob(e[key]), (c) => c.charCodeAt(0));
    return loader.parseAsync(bin.buffer, '');
  }
  return loader.loadAsync(url);
}

let motionPromise = null;
/** The shared motion-capture clips (Idle / Walk / Run), loaded once. */
function loadMotion(url) {
  motionPromise ??= loadModel(url ?? `${BASE}models/Soldier.glb`, 'motion');
  return motionPromise;
}

/** A second character for the crowd: Michelle, a stylized Mixamo character from the three.js examples. */
export async function loadMichelle() {
  const [gltf, motion] = await Promise.all([loadModel(`${BASE}models/Michelle.glb`, 'michelle'), loadMotion()]);
  const root = gltf.scene;
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[norm(o.name)] = o;
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      o.material.roughness = 1;
      o.material.metalness = 0;
    }
  });
  // fit to a realistic height
  root.updateMatrixWorld(true);
  const h = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
  root.scale.setScalar(1.66 / h);
  const clips = {};
  for (const clip of motion.animations) {
    if (['Idle', 'Walk', 'Run'].includes(clip.name)) clips[clip.name] = retarget(motion.scene, clip, root, bones);
  }
  return { root, bones, clips, kind: 'michelle' };
}

/**
 * The hero: a skinned human (Ready Player Me avatar from the three.js examples) dressed
 * for the city, driven by motion-captured Mixamo clips (Idle / Walk / Run from the
 * three.js Soldier sample). Both use the standard Mixamo skeleton, so the clips carry
 * over once the bone-name prefix is stripped.
 */
export async function loadHero(urls = {}) {
  const [avatar, motion, body] = await Promise.all([
    loadModel(urls.avatar ?? `${BASE}models/readyplayer.me.glb`, 'avatar'),
    loadMotion(urls.motion),
    loadModel(urls.body ?? `${BASE}models/hero-body.glb`, 'body').catch(() => null),
  ]);
  const root = avatar.scene;
  // the hero's own body (public/models/hero-body.glb, from the character sheet) on the avatar's skeleton; the
  // avatar dressed to match when it isn't there
  const fitted = body ? fitBody(root, body.scene) : null;
  if (!fitted) dressAvatar(root);
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[norm(o.name)] = o;
  });

  // backpack on the upper spine
  const spine = bones.Spine2;
  if (spine) {
    const pack = new THREE.Group();
    const canvas = new THREE.MeshStandardMaterial({ color: 0x6d6a3e, roughness: 1 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x4a3522, roughness: 1 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.42, 0.17, 3, 0.06), canvas);
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.16, 0.08, 2, 0.03), canvas);
    pocket.position.set(0, -0.1, -0.1);
    const flap = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.17, 0.19, 2, 0.05), canvas);
    flap.position.set(0, 0.15, -0.005);
    pack.add(body, pocket, flap);
    // two leather buckle straps down the flap, and a pocket on each side
    for (const s of [-1, 1]) {
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.012), strap);
      buckle.position.set(s * 0.07, 0.07, -0.1);
      const side = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.16, 0.11, 2, 0.025), canvas);
      side.position.set(s * 0.19, -0.08, 0);
      pack.add(buckle, side);
    }
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.4, 0.02), strap);
      st.position.set(s * 0.11, 0.02, 0.23);
      pack.add(st);
    }
    pack.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    // bone space is in the avatar's units (meters here); place behind the back
    pack.position.set(0, 0.05, -0.2);
    if (fitted?.packZ != null) {
      // against the back of the hero's own jacket
      root.updateMatrixWorld(true);
      const at = spine.getWorldPosition(new THREE.Vector3()).applyMatrix4(root.matrixWorld.clone().invert());
      at.y += 0.05;
      at.z = fitted.packZ - 0.075;
      pack.position.copy(spine.worldToLocal(at.applyMatrix4(root.matrixWorld)));
    }
    pack.userData.rest = pack.position.clone();
    spine.add(pack);
  }

  const clips = {};
  for (const clip of motion.animations) {
    if (['Idle', 'Walk', 'Run'].includes(clip.name)) clips[clip.name] = retarget(motion.scene, clip, root, bones);
  }
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const name of ['Idle', 'Walk', 'Run']) {
    if (!clips[name]) continue;
    const a = mixer.clipAction(clips[name]);
    a.play();
    a.setEffectiveWeight(name === 'Idle' ? 1 : 0);
    actions[name] = a;
  }
  return { root, mixer, actions, bones, clips, pack: bones.Spine2?.children.find((c) => c.userData.rest) ?? null, sec: { look: 0, pitch: 0, lean: 0, bob: 0 } };
}

/**
 * Put the hero's own body (an unrigged mesh, standing in an A-pose, height 1, facing +z) on the avatar's
 * skeleton: scale it to the skeleton, move the joints to where its shoulders, elbows, knees and ankles are,
 * skin each vertex to the bones nearest it, and drop the avatar's own meshes. Returns { mesh, packZ } or null.
 */
function fitBody(root, bodyScene) {
  let src = null;
  bodyScene.traverse((o) => {
    if (o.isMesh && !src) src = o;
  });
  if (!src?.geometry.attributes.position) return null;
  const bones = {};
  const all = [];
  root.traverse((o) => {
    if (o.isBone) {
      bones[norm(o.name)] = o;
      all.push(o);
    }
  });
  if (!bones.Hips || !bones.Head || !bones.LeftArm || !bones.LeftUpLeg) return null;
  root.traverse((o) => o.isSkinnedMesh && o.skeleton.pose());
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const J = {};
  for (const [n, b] of Object.entries(bones)) J[n] = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot);

  // the body, scaled to the skeleton (its top is the top of the hair)
  const geo = src.geometry.clone();
  const top = (J.HeadTop_End?.y ?? J.Head.y + 0.18) * 1.04;
  geo.scale(top, top, top);
  const P = geo.attributes.position;
  const N = P.count;
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    px[i] = P.getX(i);
    py[i] = P.getY(i);
    pz[i] = P.getZ(i);
  }
  /** Center of the vertices that pass test (and the z extent), or null. */
  const centroid = (test) => {
    let n = 0;
    let x = 0;
    let y = 0;
    let z = 0;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < N; i++) {
      if (!test(px[i], py[i], pz[i])) continue;
      n++;
      x += px[i];
      y += py[i];
      z += pz[i];
      z0 = Math.min(z0, pz[i]);
      z1 = Math.max(z1, pz[i]);
    }
    return n > 8 ? { x: x / n, y: y / n, z: z / n, z0, z1, n } : null;
  };

  // spine and head: centered in the body's slice at each height
  for (const name of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']) {
    const j = J[name];
    const c = centroid((x, y) => Math.abs(y - j.y) < 0.03 && Math.abs(x) < 0.12);
    if (c) j.set(0, j.y, (c.z0 + c.z1) / 2);
  }
  if (J.HeadTop_End) J.HeadTop_End.set(0, top * 0.985, J.Head.z);

  // the arms: everything out past the shoulder joint and below it, as a line (shoulder to fingertip). The
  // generated mesh is a little lopsided, so both are fitted and then averaged into a mirror-image pair.
  const arms = {};
  for (const side of ['Left', 'Right']) {
    const sx = Math.sign(J[`${side}Arm`].x) || 1;
    const sh = J[`${side}Arm`];
    const arm = [];
    // further out the lower it goes (the arms angle away from the body), so the jacket's sides don't count
    for (let i = 0; i < N; i++) if (px[i] * sx > Math.abs(sh.x) + 0.04 + Math.max(0, sh.y - py[i]) * 0.3 && py[i] < sh.y + 0.06 && py[i] > J.Hips.y - 0.25) arm.push(i);
    if (arm.length < 50) continue;
    const c = new THREE.Vector3();
    for (const i of arm) c.add(new THREE.Vector3(px[i], py[i], pz[i]));
    c.divideScalar(arm.length);
    // principal direction by power iteration on the covariance
    let d = new THREE.Vector3(sx, -0.6, 0).normalize();
    for (let it = 0; it < 12; it++) {
      const nd = new THREE.Vector3();
      for (const i of arm) {
        const q = new THREE.Vector3(px[i] - c.x, py[i] - c.y, pz[i] - c.z);
        nd.addScaledVector(q, q.dot(d));
      }
      d = nd.normalize();
    }
    if (d.x * sx < 0) d.negate();
    let tmax = -Infinity;
    for (const i of arm) tmax = Math.max(tmax, (px[i] - c.x) * d.x + (py[i] - c.y) * d.y + (pz[i] - c.z) * d.z);
    const tip = c.clone().addScaledVector(d, tmax);
    // where that line crosses the skeleton's shoulder width, kept near the skeleton's shoulder height
    const s0 = c.clone().addScaledVector(d, (sh.x - c.x) / d.x);
    s0.y = THREE.MathUtils.clamp(s0.y, sh.y - 0.08, sh.y + 0.02);
    arms[side] = { sx, d, s0, tip, len: tip.distanceTo(s0) };
  }
  if (arms.Left && arms.Right) {
    const L = arms.Left;
    const R = arms.Right;
    const d = new THREE.Vector3((L.d.x * L.sx + R.d.x * R.sx) / 2, (L.d.y + R.d.y) / 2, (L.d.z + R.d.z) / 2).normalize();
    const y = (L.s0.y + R.s0.y) / 2;
    const z = (L.s0.z + R.s0.z) / 2;
    const len = (L.len + R.len) / 2;
    for (const [side, A] of Object.entries(arms)) {
      const dir = new THREE.Vector3(d.x * A.sx, d.y, d.z);
      const s0 = new THREE.Vector3(A.s0.x, y, z);
      J[`${side}Arm`].copy(s0);
      J[`${side}ForeArm`].copy(s0).addScaledVector(dir, len * 0.43);
      J[`${side}Hand`].copy(s0).addScaledVector(dir, len * 0.8);
      J[`${side}HandMiddle1`]?.copy(s0).addScaledVector(dir, len * 0.9);
      if (J[`${side}Shoulder`]) J[`${side}Shoulder`].set(J[`${side}Shoulder`].x, y - 0.01, z);
    }
  }

  for (const side of ['Left', 'Right']) {
    const sx = Math.sign(J[`${side}UpLeg`].x) || (side === 'Left' ? 1 : -1);
    // the leg: centered in its own trouser leg at the hip, knee and ankle
    const leg = (j, band) => centroid((x, y) => x * sx > 0.02 && Math.abs(y - j.y) < band);
    for (const [name, band] of [[`${side}UpLeg`, 0.03], [`${side}Leg`, 0.03], [`${side}Foot`, 0.025]]) {
      const c = leg(J[name], band);
      if (c) J[name].set(c.x, J[name].y, (c.z0 + c.z1) / 2);
    }
    const foot = centroid((x, y) => x * sx > 0.02 && y < J[`${side}Foot`].y * 0.6);
    if (foot && J[`${side}ToeBase`]) {
      J[`${side}ToeBase`].set(J[`${side}Foot`].x, Math.min(J[`${side}ToeBase`].y, J[`${side}Foot`].y * 0.4), foot.z1 - (foot.z1 - foot.z0) * 0.3);
      J[`${side}Toe_End`]?.set(J[`${side}ToeBase`].x, J[`${side}ToeBase`].y, foot.z1);
    }
  }

  // move the joints (rotations stay as they were), parents first
  const toWorld = root.matrixWorld;
  for (const b of all) {
    const j = J[norm(b.name)];
    if (!j || !b.parent) continue;
    b.parent.updateWorldMatrix(true, false);
    b.position.copy(b.parent.worldToLocal(j.clone().applyMatrix4(toWorld)));
    b.updateMatrixWorld(true);
  }
  root.updateMatrixWorld(true);
  const W = {};
  for (const [n, b] of Object.entries(bones)) W[n] = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot);

  // skin: each vertex to the bones whose segments are nearest it (never across to the other arm or leg)
  const seg = [
    ['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'], ['Head', 'HeadTop_End'],
  ];
  for (const s of ['Left', 'Right']) {
    seg.push([`${s}Shoulder`, `${s}Arm`], [`${s}Arm`, `${s}ForeArm`], [`${s}ForeArm`, `${s}Hand`], [`${s}Hand`, `${s}HandMiddle1`, 1.6]);
    seg.push([`${s}UpLeg`, `${s}Leg`], [`${s}Leg`, `${s}Foot`], [`${s}Foot`, `${s}ToeBase`], [`${s}ToeBase`, `${s}Toe_End`]);
  }
  const segs = seg
    .filter(([a, b]) => W[a] && W[b] && bones[a])
    .map(([a, b, ext = 1]) => {
      const A = W[a];
      const B = W[b].clone().sub(A).multiplyScalar(ext).add(A);
      const side = a.startsWith('Left') ? Math.sign(W.LeftArm.x) : a.startsWith('Right') ? Math.sign(W.RightArm.x) : 0;
      return { bone: all.indexOf(bones[a]), A, AB: B.clone().sub(A), side, shin: /(?<!Up)Leg$|Foot|Toe/.test(a), arm: /Shoulder|Arm|Hand/.test(a) };
    });
  const crotch = Math.min(W.LeftUpLeg.y, W.RightUpLeg.y) - 0.04;
  // the neck, collar and chest stay with the spine: arms only pull from partway out to the shoulder
  const armIn = Math.abs(W.LeftArm.x) * 0.6;
  const armTop = Math.max(W.LeftArm.y, W.RightArm.y) + 0.07;
  const skinIndex = new Uint16Array(N * 4);
  const skinWeight = new Float32Array(N * 4);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const w = new Float32Array(segs.length);
  for (let i = 0; i < N; i++) {
    p.set(px[i], py[i], pz[i]);
    for (let k = 0; k < segs.length; k++) {
      const sg = segs[k];
      // the wrong side, or a leg reaching up into the hips: no pull at all
      if ((sg.side && px[i] * sg.side < -0.015) || (sg.shin && py[i] > crotch + 0.12) || (sg.arm && (Math.abs(px[i]) < armIn || py[i] > armTop))) {
        w[k] = 0;
        continue;
      }
      const t = THREE.MathUtils.clamp(q.copy(p).sub(sg.A).dot(sg.AB) / sg.AB.lengthSq(), 0, 1);
      const d = q.copy(sg.A).addScaledVector(sg.AB, t).distanceTo(p);
      w[k] = 1 / (d ** 4 + 1e-7);
    }
    // the four strongest
    const order = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 4);
    let sum = 0;
    for (const k of order) sum += w[k];
    order.forEach((k, j) => {
      skinIndex[i * 4 + j] = segs[k].bone;
      skinWeight[i * 4 + j] = sum > 0 ? w[k] / sum : j === 0 ? 1 : 0;
    });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  // the colors were painted from the sheet in sRGB; glTF reads vertex colors as linear
  const col = geo.attributes.color;
  if (col) {
    const c = new THREE.Color();
    for (let i = 0; i < col.count; i++) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).convertSRGBToLinear();
      col.setXYZ(i, c.r, c.g, c.b);
    }
  }
  // the hands sit right on the drawing's outlines, so the projection paints them gray: past the wrist on each
  // arm's own line is skin
  if (col) {
    const skin = new THREE.Color(0xe0a68a).convertSRGBToLinear();
    const q = new THREE.Vector3();
    for (const A of Object.values(arms)) {
      // the hand: the fingertip end of the arm, back to the cuff
      const reach = A.len * 0.2;
      for (let i = 0; i < N; i++) {
        if (px[i] * A.sx < Math.abs(A.s0.x)) continue;
        const k = 1 - THREE.MathUtils.smoothstep(q.set(px[i], py[i], pz[i]).distanceTo(A.tip), reach * 0.8, reach);
        if (k > 0) col.setXYZ(i, col.getX(i) + (skin.r - col.getX(i)) * k, col.getY(i) + (skin.g - col.getY(i)) * k, col.getZ(i) + (skin.b - col.getZ(i)) * k);
      }
    }
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();

  // the avatar's own meshes go; the bones stay
  const old = [];
  root.traverse((o) => o.isMesh && old.push(o));
  for (const o of old) o.removeFromParent();
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: !!col, roughness: 1, metalness: 0 }));
  mesh.name = 'HeroBody';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(all), mesh.matrixWorld);
  // where the backpack goes: against the back of the jacket at the shoulder blades
  const back = centroid((x, y) => Math.abs(y - W.Spine2.y) < 0.04 && Math.abs(x) < 0.12);
  return { mesh, packZ: back ? back.z0 : null };
}

/** Dress the stock avatar like the character sheet: the fallback when the hero's own body isn't there. */
function dressAvatar(root) {
  // dressed after the character sheet (aiImages/character): a short brown leather jacket open over a dark
  // hoodie, blue jeans, rust-red canvas sneakers, an olive canvas backpack
  const outfit = {
    Wolf3D_Outfit_Top: 0x6a3f27, // brown leather jacket
    Wolf3D_Outfit_Bottom: 0x4d6f94, // blue jeans
    Wolf3D_Outfit_Footwear: 0xa8553c, // rust-red sneakers
  };
  const HOOD = new THREE.Color(0x3c3f44).multiplyScalar(1.6);
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[norm(o.name)] = o;
  });
  root.updateMatrixWorld(true);
  const hipsWorld = bones.Hips?.getWorldPosition(new THREE.Vector3());
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const m = o.material;
    if (o.name === 'Wolf3D_Headwear') o.visible = false; // no hat
    if (o.name === 'Wolf3D_Beard') o.visible = false;
    if (outfit[o.name] !== undefined) {
      // keep the texture's folds and seams, but repaint the color
      m.color.set(outfit[o.name]).multiplyScalar(1.6);
      const map = m.map;
      if (map) {
        m.userData.outfit = true;
        const top = o.name === 'Wolf3D_Outfit_Top';
        // the avatar's top is a long tail-coat over a vest, shirt and bow tie: cut it off at the hip like a jacket,
        // and paint the vest, shirt and tie (the purple, lavender and dark parts of its texture) as the hoodie
        const hem = top && hipsWorld ? o.worldToLocal(hipsWorld.clone()).y + 0.02 : -1e9;
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uHood = { value: HOOD };
          sh.uniforms.uHem = { value: hem };
          sh.vertexShader = sh.vertexShader
            .replace('void main() {', 'varying float vBindY;\nvoid main() {')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindY = position.y;');
          sh.fragmentShader = sh.fragmentShader
            .replace('void main() {', 'uniform vec3 uHood;\nuniform float uHem;\nvarying float vBindY;\nvoid main() {')
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
               ${top ? 'if (vBindY < uHem) discard;' : ''}
               vec3 tx = sampledDiffuseColor.rgb;
               float lum = dot(tx, vec3(0.299, 0.587, 0.114));
               bool inner = ${top ? '(tx.b > tx.g * 1.1 && tx.r < 0.45) || (tx.b > 0.25 && tx.b > tx.r * 0.8) || (tx.r < 0.13 && tx.b < tx.g)' : 'false'};
               diffuseColor.rgb = inner ? uHood * clamp(0.42 + lum * 0.5, 0.42, 0.62) : diffuse * clamp(lum * 1.6, 0.35, 1.25);`,
            );
        };
        m.customProgramCacheKey = () => `outfit${o.name}`;
        // with the tails cut away you can see inside the jacket
        if (top) m.side = THREE.DoubleSide;
      }
    }
    m.roughness = 1;
    m.metalness = 0;
  });

  // messy dark hair: a lumpy cap with tufts sticking up and forward
  if (bones.Head) {
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x241e1b, roughness: 1 });
    const capGeo = new THREE.SphereGeometry(0.108, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const pos = capGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // clumps: a few bumps that grow toward the crown
      const n = Math.sin(v.x * 70) * Math.cos(v.z * 60) * 0.5 + Math.sin((v.x + v.z) * 45) * 0.5;
      v.multiplyScalar(1 + Math.max(0, n) * 0.07 * (v.y / 0.108));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    capGeo.computeVertexNormals();
    const cap = new THREE.Mesh(capGeo, hairMat);
    cap.scale.set(1.04, 0.95, 1.14);
    cap.position.set(0, 0.112, -0.004);
    cap.rotation.x = -0.18;
    cap.castShadow = true;
    bones.Head.add(cap);
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.35), hairMat);
    back.scale.set(1.02, 1.0, 1.1);
    back.position.set(0, 0.08, -0.02);
    back.rotation.x = -0.5;
    bones.Head.add(back);
    // tufts: short cones, swept up and to one side like the sheet
    const tuft = new THREE.ConeGeometry(0.018, 0.055, 6);
    const spots = [[0.03, 0.21, 0.07, -0.9, 0.3], [-0.02, 0.215, 0.06, -1.0, -0.2], [0.06, 0.2, 0.02, -0.4, 0.8], [-0.06, 0.2, 0.01, -0.3, -0.8], [0.04, 0.17, 0.1, -1.4, 0.4], [-0.05, 0.17, 0.095, -1.3, -0.3]];
    for (const [x, y, z, rx, rz] of spots) {
      const t = new THREE.Mesh(tuft, hairMat);
      t.position.set(x, y, z);
      t.rotation.set(rx, 0, rz);
      bones.Head.add(t);
    }
  }
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
/** Limb bones and the child each one points at. */
const AIM = {
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandMiddle1',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandMiddle1',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
};

/**
 * World-space retarget: each target bone gets the source bone's rotation *relative to its
 * own rest pose*, so rigs with different rest poses (T-pose vs A-pose) still line up.
 */
function retarget(sourceRoot, clip, targetRoot, targetBones, fps = 30) {
  // face the source the same way as the target, so world-space deltas line up
  sourceRoot.rotation.y = Math.PI;
  const src = {};
  let srcSkinned = null;
  sourceRoot.traverse((o) => {
    if (o.isBone) src[o.name.replace(/^mixamorig:?/, '')] = o;
    if (o.isSkinnedMesh) srcSkinned = o;
  });
  srcSkinned?.skeleton.pose();
  sourceRoot.updateMatrixWorld(true);
  targetRoot.traverse((o) => o.isSkinnedMesh && o.skeleton.pose());
  targetRoot.updateMatrixWorld(true);

  // target bones in parent-first order
  const order = [];
  targetRoot.traverse((o) => o.isBone && src[norm(o.name)] && order.push(o));
  const key = (b) => norm(b.name);
  const restSrc = {};
  const restTgt = {};
  const restLocal = {};
  for (const b of order) {
    restSrc[b.name] = src[key(b)].getWorldQuaternion(new THREE.Quaternion());
    restTgt[b.name] = b.getWorldQuaternion(new THREE.Quaternion());
    restLocal[b.name] = b.quaternion.clone();
  }
  const hipsSrc = src.Hips;
  const hipsTgt = targetBones.Hips;
  const hipRestSrc = hipsSrc.getWorldPosition(new THREE.Vector3());
  const hipRestTgt = hipsTgt.getWorldPosition(new THREE.Vector3());
  const hipScale = hipRestTgt.y / Math.max(0.01, hipRestSrc.y);
  const hipParentInv = hipsTgt.parent.matrixWorld.clone().invert();
  const hipRestLocal = hipsTgt.position.clone();

  const mixer = new THREE.AnimationMixer(sourceRoot);
  const action = mixer.clipAction(clip);
  action.play();
  const frames = Math.max(2, Math.round(clip.duration * fps));
  const times = new Float32Array(frames);
  const quats = Object.fromEntries(order.map((b) => [b.name, new Float32Array(frames * 4)]));
  const hipPos = new Float32Array(frames * 3);
  const world = {};
  // the clip's average hip turn (the idle stands side-on): taken out so he faces the way he's going
  let yaw = 0;
  for (let f = 0; f < frames; f++) {
    mixer.setTime((f / (frames - 1)) * clip.duration);
    sourceRoot.updateMatrixWorld(true);
    const d = hipsSrc.getWorldQuaternion(new THREE.Quaternion()).multiply(restSrc[hipsTgt.name].clone().invert());
    const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(d);
    yaw += Math.atan2(fw.x, fw.z) / frames;
  }
  const unturn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw);
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * clip.duration;
    times[f] = t;
    mixer.setTime(t);
    sourceRoot.updateMatrixWorld(true);
    for (const b of order) {
      const aimAt = AIM[key(b)];
      const tc = aimAt && targetBones[aimAt];
      const sc = aimAt && src[aimAt];
      if (tc && sc && tc.parent === b) {
        // limbs: point the bone where the source's bone points. Rotation deltas only carry over between rigs
        // that share a rest pose (this avatar rests in a T-pose with different arm and hand rolls than the
        // mocap rig), which twisted the arms and hands; directions don't care.
        const parentWorld = world[b.parent.name] ?? b.parent.getWorldQuaternion(new THREE.Quaternion());
        const w0 = parentWorld.clone().multiply(restLocal[b.name]);
        const cur = tc.position.clone().applyQuaternion(w0).normalize();
        const want = sc.getWorldPosition(new THREE.Vector3()).sub(src[key(b)].getWorldPosition(_v)).normalize();
        const w = new THREE.Quaternion().setFromUnitVectors(cur, want).multiply(w0);
        world[b.name] = w;
        _q.copy(parentWorld).invert().multiply(w);
        _q.toArray(quats[b.name], f * 4);
        continue;
      }
      const qa = src[key(b)].getWorldQuaternion(new THREE.Quaternion());
      // delta from rest, applied to the target's rest orientation
      const w = qa.multiply(restSrc[b.name].clone().invert()).premultiply(unturn).multiply(restTgt[b.name]);
      world[b.name] = w;
      const parentWorld = world[b.parent.name] ?? b.parent.getWorldQuaternion(new THREE.Quaternion());
      _q.copy(parentWorld).invert().multiply(w);
      // the two rigs hold their heads differently: keep most of the target's own neck and head pose
      const damp = { Spine: 0.15, Spine1: 0.1, Spine2: 0.1, Neck: 0, Head: 0 }[key(b)];
      if (damp !== undefined) {
        _q.slerpQuaternions(restLocal[b.name], _q.clone(), damp);
        world[b.name] = b.parent && world[b.parent.name] ? world[b.parent.name].clone().multiply(_q) : w;
      }
      _q.toArray(quats[b.name], f * 4);
    }
    // hips: carry the up/down bob and sway, not the travel
    const hp = hipsSrc.getWorldPosition(new THREE.Vector3()).sub(hipRestSrc).multiplyScalar(hipScale);
    hp.x *= 0.5;
    hp.z = 0;
    _v.copy(hipRestTgt).add(hp).applyMatrix4(hipParentInv);
    (hipRestLocal.lengthSq() ? _v : _v).toArray(hipPos, f * 3);
  }
  const tracks = order.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, quats[b.name]));
  tracks.push(new THREE.VectorKeyframeTrack(`${hipsTgt.name}.position`, times, hipPos));
  action.stop();
  mixer.uncacheRoot(sourceRoot);
  srcSkinned?.skeleton.pose();
  sourceRoot.rotation.y = 0;
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Blend idle/walk/run by speed and keep the footfalls in step with how fast he moves. */
const _axis = new THREE.Vector3();
const _qw = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qparent = new THREE.Quaternion();
/** Add a world-space rotation to a bone on top of whatever the animation set. */
export function turnBone(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 1e-4) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_qparent);
  _qb.copy(_qparent).multiply(bone.quaternion); // bone world rotation
  _qw.setFromAxisAngle(axis, angle).multiply(_qb);
  bone.quaternion.copy(_qparent.invert().multiply(_qw));
}

/**
 * Secondary motion on top of the clips: lean into turns, turn the head and shoulders toward
 * where the camera looks, breathe when standing, and let the backpack bounce with each step.
 * look/pitch are radians relative to the way he faces; turnRate is radians per second.
 */
export function heroSecondary(hero, dt, { speed, turnRate, look, pitch, phase, t, air = 0, vy = 0, land = 0 }) {
  const s = hero.sec;
  const k = Math.min(1, dt * 6);
  // don't twist around to look straight behind; ease back to center instead
  const lookable = Math.abs(look) < 2.2 ? THREE.MathUtils.clamp(look, -1.1, 1.1) : 0;
  s.look += (lookable - s.look) * k;
  s.pitch += (THREE.MathUtils.clamp(pitch, -0.6, 0.5) - s.pitch) * k;
  s.lean += (THREE.MathUtils.clamp(-turnRate * speed * 0.035, -0.28, 0.28) - s.lean) * Math.min(1, dt * 8);
  hero.root.updateMatrixWorld(true);
  const fwd = _axis.set(0, 0, 1).applyQuaternion(hero.root.quaternion).clone();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(hero.root.quaternion);
  const up = new THREE.Vector3(0, 1, 0);
  const b = hero.bones;
  turnBone(b.Spine, fwd, s.lean);
  turnBone(b.Spine1, up, s.look * 0.25);
  turnBone(b.Neck, up, s.look * 0.3);
  turnBone(b.Head, up, s.look * 0.3);
  turnBone(b.Head, right, -s.pitch * 0.45);
  // in the air: knees tuck on the way up, legs reach for the ground on the way down, arms out
  s.air = (s.air ?? 0) + ((air > 0.02 ? 1 : 0) - (s.air ?? 0)) * Math.min(1, dt * 14);
  if (s.air > 0.01 || land > 0.01) {
    const tuck = s.air * THREE.MathUtils.clamp(0.6 + vy * 0.12, 0.2, 1) + land * 0.5;
    for (const [side, sgn] of [['Left', 1], ['Right', -1]]) {
      turnBone(b[`${side}UpLeg`], right, -tuck * (side === 'Left' ? 0.9 : 0.6));
      turnBone(b[`${side}Leg`], right, tuck * 1.2);
      turnBone(b[`${side}Arm`], fwd, sgn * s.air * 0.5);
    }
    turnBone(b.Spine, right, tuck * 0.15);
  }
  // breathing and a slow weight shift when standing still
  const still = 1 - THREE.MathUtils.clamp(speed / 1.2, 0, 1);
  turnBone(b.Spine2, right, Math.sin(t * 1.7) * 0.025 * still);
  turnBone(b.Spine, fwd, Math.sin(t * 0.45) * 0.03 * still);
  // the pack bounces on each footfall and swings a little with the stride
  if (hero.pack) {
    const moving = THREE.MathUtils.clamp(speed / 2, 0, 1.4);
    const bounce = Math.abs(Math.sin(phase)) * 0.018 * moving;
    s.bob += (bounce - s.bob) * Math.min(1, dt * 18);
    hero.pack.position.copy(hero.pack.userData.rest);
    hero.pack.position.y += s.bob;
    hero.pack.rotation.z = Math.sin(phase) * 0.05 * moving - s.lean * 0.4;
    hero.pack.rotation.x = -s.bob * 3;
  }
}

/** Characters hold each pose for two film frames (12 poses a second), Spider-Verse style. */
export const POSE_STEP = { value: 1 / 12 };

/** Advance a mixer on twos. Returns the time stepped (0 when this frame holds the pose). */
export function stepMixer(owner, mixer, dt) {
  owner.poseAcc = (owner.poseAcc ?? 0) + dt;
  if (owner.poseAcc < POSE_STEP.value) return 0;
  const step = owner.poseAcc;
  owner.poseAcc = 0;
  mixer.update(step);
  return step;
}

export function animateHero(hero, dt, speed) {
  const { actions } = hero;
  const walkW = THREE.MathUtils.clamp(speed / 1.6, 0, 1) * (1 - THREE.MathUtils.clamp((speed - 3.6) / 2.5, 0, 1));
  const runW = THREE.MathUtils.clamp((speed - 3.6) / 2.5, 0, 1);
  const idleW = 1 - Math.max(walkW, runW);
  actions.Idle?.setEffectiveWeight(idleW);
  actions.Walk?.setEffectiveWeight(walkW);
  actions.Run?.setEffectiveWeight(runW);
  // the clips cover ~1.6 m/s walking and ~5 m/s running
  if (actions.Walk) actions.Walk.timeScale = THREE.MathUtils.clamp(speed / 1.7, 0.6, 2.2);
  if (actions.Run) actions.Run.timeScale = THREE.MathUtils.clamp(speed / 6, 0.8, 1.4);
  return stepMixer(hero, hero.mixer, dt);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

/** Rotate a bone so the direction to its child points along dir (in the hero's own space). */
function aim(hero, boneName, childName, dir) {
  const bone = hero.bones[boneName];
  const child = hero.bones[childName];
  if (!bone || !child) return;
  hero.root.updateMatrixWorld(true);
  const from = _a.copy(child.getWorldPosition(new THREE.Vector3())).sub(bone.getWorldPosition(_b)).normalize();
  const to = new THREE.Vector3(...dir).normalize().applyQuaternion(hero.root.getWorldQuaternion(_qa));
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
  bone.parent.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(world));
}

/** Sitting poses for riding: aim each limb, whatever the rig's local axes are. */
/**
 * Sitting on a ride. steer (-1..1-ish, radians of front-wheel angle) turns the hands with the bars or
 * the wheel and the head into the turn; stopped, he glances around.
 */
export function poseHeroRiding(hero, mode, steer = 0, t = 0, speed = 0) {
  for (const a of Object.values(hero.actions)) a.setEffectiveWeight(0);
  hero.mixer.update(0);
  hero.root.traverse((o) => o.isSkinnedMesh && o.skeleton.pose());
  const st = Math.max(-0.6, Math.min(0.6, steer));
  const lean = mode === 'suv' ? 0.05 : mode === 'moto' ? 0.5 : 0.4;
  // lean the shoulders into the turn on two wheels
  aim(hero, 'Spine', 'Neck', [mode === 'suv' ? 0 : st * 0.35, 1, lean]);
  const idle = Math.abs(speed) < 0.5 ? Math.sin(t * 0.6) * 0.35 + Math.sin(t * 1.7) * 0.08 : 0;
  aim(hero, 'Neck', 'Head', [st * 0.9 + idle, 1, lean * 0.2 + 0.1]);
  const kneeOut = mode === 'moto' ? 0.28 : 0.1;
  for (const [side, s] of [['Left', 1], ['Right', -1]]) {
    aim(hero, `${side}UpLeg`, `${side}Leg`, [s * kneeOut, mode === 'suv' ? -0.05 : -0.35, 1]);
    aim(hero, `${side}Leg`, `${side}Foot`, [0, -1, mode === 'suv' ? 0.35 : 0.15]);
    let reach;
    if (mode === 'suv') {
      // hands at ten and two, rolling with the wheel
      const turn = st * 4 * 0.35;
      reach = [s * 0.15 * Math.cos(turn), -0.35 + s * Math.sin(turn) * 0.3, 1];
    } else {
      // the outside grip pushes forward, the inside one pulls back
      reach = [s * 0.35, -0.55, 1 + s * st * 1.1];
    }
    aim(hero, `${side}Arm`, `${side}ForeArm`, reach);
    aim(hero, `${side}ForeArm`, `${side}Hand`, mode === 'suv' ? [-s * 0.3, 0.1, 1] : [-s * 0.05, -0.25, 1]);
  }
}

/** Legs follow the pedals around the crank (bike), knees rise and fall in turn. */
export function pedalHero(hero, phase) {
  for (const [side, s, off] of [['Left', 1, 0], ['Right', -1, Math.PI]]) {
    const p = phase + off;
    aim(hero, `${side}UpLeg`, `${side}Leg`, [s * 0.1, -0.35 + Math.sin(p) * 0.3, 1]);
    aim(hero, `${side}Leg`, `${side}Foot`, [0, -1, 0.15 + Math.cos(p) * 0.35]);
  }
}
