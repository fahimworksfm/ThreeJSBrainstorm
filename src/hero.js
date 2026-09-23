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
  const [avatar, motion] = await Promise.all([
    loadModel(urls.avatar ?? `${BASE}models/readyplayer.me.glb`, 'avatar'),
    loadMotion(urls.motion),
  ]);
  const root = avatar.scene;
  const outfit = {
    Wolf3D_Outfit_Top: 0x5a3a24, // brown leather jacket
    Wolf3D_Outfit_Bottom: 0x3b5578, // blue jeans
    Wolf3D_Outfit_Footwear: 0x8a3a24, // red-brown sneakers
  };
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[norm(o.name)] = o;
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
        m.onBeforeCompile = (s) => {
          s.fragmentShader = s.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
             diffuseColor.rgb = diffuse * clamp(lum * 1.6, 0.35, 1.25);`,
          );
        };
        m.customProgramCacheKey = () => `outfit${o.name}`;
      }
    }
    m.roughness = 1;
    m.metalness = 0;
  });

  // short dark hair
  if (bones.Head) {
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 1 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.108, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
    cap.scale.set(1.0, 0.9, 1.12);
    cap.position.set(0, 0.115, -0.005);
    cap.rotation.x = -0.18;
    cap.castShadow = true;
    bones.Head.add(cap);
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.098, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.35), hairMat);
    back.scale.set(1.0, 1.0, 1.1);
    back.position.set(0, 0.08, -0.02);
    back.rotation.x = -0.5;
    bones.Head.add(back);
  }

  // backpack on the upper spine
  const spine = bones.Spine2;
  if (spine) {
    const pack = new THREE.Group();
    const canvas = new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 1 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 1 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.42, 0.17, 3, 0.06), canvas);
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.16, 0.08, 2, 0.03), canvas);
    pocket.position.set(0, -0.1, -0.1);
    const flap = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.14, 0.19, 2, 0.05), strap);
    flap.position.set(0, 0.16, 0);
    pack.add(body, pocket, flap);
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

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

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
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * clip.duration;
    times[f] = t;
    mixer.setTime(t);
    sourceRoot.updateMatrixWorld(true);
    for (const b of order) {
      const qa = src[key(b)].getWorldQuaternion(new THREE.Quaternion());
      // delta from rest, applied to the target's rest orientation
      const w = qa.multiply(restSrc[b.name].clone().invert()).multiply(restTgt[b.name]);
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
function turnBone(bone, axis, angle) {
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
export function heroSecondary(hero, dt, { speed, turnRate, look, pitch, phase, t }) {
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
  hero.mixer.update(dt);
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
