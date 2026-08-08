import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AssetManager } from "../world/AssetManager";

export type PlayerAnimationName =
  | "idle"
  | "walk"
  | "run"
  | "sprint"
  | "jump"
  | "fall"
  | "land"
  | "enter_vehicle"
  | "exit_vehicle"
  | "sit_driving";

export interface PlayerMotionState {
  /** Any horizontal input. */
  moving: boolean;
  /** Horizontal speed in m/s. */
  speed: number;
  sprinting: boolean;
  grounded: boolean;
  verticalVelocity: number;
}

export interface ModelAdjust {
  scale?: number;
  /** Extra yaw so the model faces +Z (GLTF forward convention). */
  rotationY?: number;
}

/**
 * Player visual representation: mesh, skeleton and animations.
 *
 * Gameplay (position/velocity/collision/state) stays in `Player`; this class
 * owns only the visual. It provides a low-poly procedural humanoid fallback
 * (head, neck, torso, arms + elbows + hands, legs + knees + feet) with
 * procedurally generated AnimationClip loops and supports swapping in a GLTF
 * humanoid rig with real clips via `adoptGltf` / `loadFrom`. All transitions
 * run through an AnimationMixer so blends are smooth, and walk/run/sprint
 * playback rate scales with movement speed so the feet do not slide. The model
 * faces +Z and inherits its world yaw from the parent player group.
 */
export class PlayerModel {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private readonly actions = new Map<PlayerAnimationName, THREE.AnimationAction>();
  private currentName: PlayerAnimationName | null = null;
  private landTimer = 0;
  private adopted = false;
  private driving = false;

  constructor() {
    const { root, boneNames } = buildFallbackRig();
    this.group.add(root);
    this.mixer = new THREE.AnimationMixer(root);
    this.installClips(fallbackClips(boneNames), false);
    this.group.name = "playerModel";
  }

  get hasRealModel(): boolean {
    return this.adopted;
  }

  /**
   * Loads the player GLB through the AssetManager and adopts it, scaled to a
   * believable ~1.8 m height. Returns false (keeping the procedural fallback)
   * when no legal asset is registered — see src/assets/README.md.
   */
  async loadFrom(assets: AssetManager, id = "characters/player"): Promise<boolean> {
    if (!assets.hasModel(id)) return false;
    let gltf: GLTF;
    try {
      gltf = await assets.loadModel(id);
    } catch (error) {
      console.warn("[PlayerModel] Character asset unavailable, using procedural rig.", error);
      return false;
    }
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const height = bounds.max.y - bounds.min.y;
    const scale = height > 0 ? 1.8 / height : 1;
    this.adoptGltf(gltf, { scale });
    return true;
  }

  /** Swaps the fallback rig for a GLTF humanoid (clones nothing; adopts nodes). */
  adoptGltf(gltf: GLTF, adjust: ModelAdjust = {}): void {
    this.mixer.stopAllAction();
    while (this.group.children.length > 0) this.group.remove(this.group.children[0]);

    const root = gltf.scene.clone(true);
    const scale = adjust.scale ?? 1;
    root.scale.set(scale, scale, scale);
    root.rotation.y = adjust.rotationY ?? 0;
    root.traverse((object) => {
      object.frustumCulled = true;
      if ((object as THREE.Mesh).isMesh) {
        (object as THREE.Mesh).castShadow = true;
        (object as THREE.Mesh).receiveShadow = true;
      }
    });
    this.group.add(root);
    this.mixer = new THREE.AnimationMixer(root);
    this.installClips(gltf.animations, true);
    this.adopted = true;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Enters/exits the driving state; plays SIT_DRIVING while driving. */
  setDriving(driving: boolean): void {
    if (this.driving === driving) return;
    this.driving = driving;
    if (driving) this.fadeTo("sit_driving");
  }

  /** Fades to the enter/exit vehicle animations when the model provides them. */
  playVehicleTransition(kind: "enter" | "exit"): void {
    const name: PlayerAnimationName = kind === "enter" ? "enter_vehicle" : "exit_vehicle";
    if (!this.actions.has(name)) return;
    this.fadeTo(name);
  }

  /** Drives the animation state machine; call every frame from Player.update. */
  update(delta: number, state: PlayerMotionState): void {
    this.mixer.update(delta);

    if (this.driving) {
      if (this.currentName !== "sit_driving") this.fadeTo("sit_driving");
      return;
    }

    if (this.landTimer > 0) {
      this.landTimer -= delta;
      if (this.landTimer <= 0) this.landTimer = 0;
      else return;
    }

    if (state.grounded && !this.lastGrounded && state.verticalVelocity <= 0) {
      this.landTimer = 0.3;
      this.fadeTo("land");
      this.lastGrounded = state.grounded;
      return;
    }
    this.lastGrounded = state.grounded;

    const target = this.pickAnimation(state);
    if (target !== this.currentName) this.fadeTo(target);

    this.scalePlaybackToSpeed(state);
  }

  /** Advances the mixer without touching the locomotion state machine. */
  updateMixerOnly(delta: number): void {
    this.mixer.update(delta);
  }

  private lastGrounded = true;

  private pickAnimation(state: PlayerMotionState): PlayerAnimationName {
    if (!state.grounded) {
      return state.verticalVelocity > 0 ? "jump" : "fall";
    }
    if (!state.moving || state.speed < 0.3) return "idle";
    if (state.speed < 4) return "walk";
    if (state.speed < 6.2) return "run";
    return "sprint";
  }

  /** Speeds the loop up/down with movement so feet track the ground better. */
  private scalePlaybackToSpeed(state: PlayerMotionState): void {
    const action = this.currentName ? this.actions.get(this.currentName) : null;
    if (!action) return;
    const speed = Math.max(0, state.speed);
    let factor = 1;
    if (this.currentName === "walk") factor = speed / 2.0;
    else if (this.currentName === "run") factor = speed / 5.0;
    else if (this.currentName === "sprint") factor = speed / 7.0;
    action.setEffectiveTimeScale(THREE.MathUtils.clamp(factor, 0.45, 2));
  }

  private installClips(clips: readonly THREE.AnimationClip[], fromGltf: boolean): void {
    this.actions.clear();
    this.currentName = null;

    if (fromGltf) {
      const named = new Map<string, THREE.AnimationClip>();
      for (const clip of clips) named.set(clip.name.toLowerCase(), clip);
      for (const name of PLAYER_ANIMATIONS) {
        const clip = named.get(name) ?? findClip(named, name);
        if (clip) this.actions.set(name, this.mixer.clipAction(clip));
      }
      const idle = this.actions.get("idle") ?? this.actions.values().next().value;
      if (idle) {
        idle.play();
        this.currentName = "idle";
      }
      return;
    }

    for (const clip of clips) {
      const name = clip.name as PlayerAnimationName;
      this.actions.set(name, this.mixer.clipAction(clip));
    }
    this.actions.get("idle")?.play();
    this.currentName = "idle";
  }

  private fadeTo(name: PlayerAnimationName): void {
    const next = this.actions.get(name);
    if (!next) return;
    const previous = this.currentName ? this.actions.get(this.currentName) : null;
    if (previous && previous !== next) {
      previous.fadeOut(0.18);
    }
    next.reset().fadeIn(0.18).play();
    this.currentName = name;
  }
}

const PLAYER_ANIMATIONS: readonly PlayerAnimationName[] = [
  "idle",
  "walk",
  "run",
  "sprint",
  "jump",
  "fall",
  "land",
  "enter_vehicle",
  "exit_vehicle",
  "sit_driving",
];

function findClip(named: Map<string, THREE.AnimationClip>, name: string): THREE.AnimationClip | undefined {
  for (const [key, clip] of named) {
    if (key.includes(name)) return clip;
  }
  return undefined;
}

interface BoneNames {
  hips: string;
  spine: string;
  neck: string;
  head: string;
  armL: string;
  armR: string;
  elbowL: string;
  elbowR: string;
  legL: string;
  legR: string;
  kneeL: string;
  kneeR: string;
}

/**
 * Builds the procedural fallback rig: a proportioned low-poly humanoid with a
 * neck, shoulder/elbow arm chain and hip/knee leg chain so the sit/enter/exit
 * poses bend at believable joints. Stylized on purpose — a real GLB replaces
 * this via `loadFrom`.
 *
 * The rig is built so the soles of the feet rest at the walkable surface:
 * roads, sidewalks, parking lots and open ground all sit flush at y=0 and the
 * player is grounded at y=0, so the feet land exactly on the floor. Limbs
 * overlap the body slightly (torso half-width 0.23 vs arm inner edge 0.175)
 * and a pelvis box bridges the thighs, so there are no visible gaps between
 * arms/body or legs/body. The head is a round low-poly sphere with a flat
 * face (brows, eyes, nose, mouth) sitting on its front surface.
 */
function buildFallbackRig(): { root: THREE.Group; boneNames: BoneNames } {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48a, roughness: 0.85 });
  const noseSkin = new THREE.MeshStandardMaterial({ color: 0xdc9f70, roughness: 0.8 });
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.7, metalness: 0.15 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.85 });
  const shoes = new THREE.MeshStandardMaterial({ color: 0x0f1318, roughness: 0.9 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.35 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x5a2a2a, roughness: 0.6 });

  const names: BoneNames = {
    hips: "hips",
    spine: "spine",
    neck: "neck",
    head: "head",
    armL: "armL",
    armR: "armR",
    elbowL: "elbowL",
    elbowR: "elbowR",
    legL: "legL",
    legR: "legR",
    kneeL: "kneeL",
    kneeR: "kneeR",
  };

  // Feet soles rest exactly on the walkable surface (player is grounded at y=0).
  const hips = new THREE.Group();
  hips.name = names.hips;
  hips.position.y = 0.94;
  root.add(hips);

  // Pelvis bridges the two thighs so there is no crotch gap to the torso.
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.28), pants);
  pelvis.castShadow = true;
  hips.add(pelvis);

  const spine = new THREE.Group();
  spine.name = names.spine;
  spine.position.y = 0.24;
  hips.add(spine);

  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.27), jacket);
  waist.position.y = -0.08;
  waist.castShadow = true;
  spine.add(waist);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.28), jacket);
  torso.position.y = 0.25;
  torso.castShadow = true;
  spine.add(torso);

  const neck = new THREE.Group();
  neck.name = names.neck;
  neck.position.y = 0.46;
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.12, 8), skin);
  neckMesh.position.y = 0.06;
  neckMesh.castShadow = true;
  neck.add(neckMesh);
  spine.add(neck);

  const head = new THREE.Group();
  head.name = names.head;
  head.position.y = 0.16;
  // Round head: a sphere skull with a hair dome cap on top.
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), skin);
  skull.position.y = -0.01;
  skull.castShadow = true;
  head.add(skull);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.158, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.28),
    jacket,
  );
  hair.position.y = -0.01;
  hair.castShadow = true;
  head.add(hair);

  // Face: brows, eyes, nose and mouth sit on the sphere's front surface.
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.015), noseSkin);
  browL.position.set(-0.055, 0.06, 0.13);
  head.add(browL);
  const browR = browL.clone();
  browR.position.x = 0.055;
  head.add(browR);
  for (const eyeX of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.028, 0.02), eyeMat);
    eye.position.set(eyeX * 0.055, 0.0, 0.142);
    head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.05, 0.02), noseSkin);
  nose.position.set(0, -0.045, 0.148);
  head.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.015), mouthMat);
  mouth.position.set(0, -0.115, 0.1);
  head.add(mouth);
  neck.add(head);

  const makeArm = (name: string, elbow: string, x: number): void => {
    const shoulder = new THREE.Group();
    shoulder.name = name;
    shoulder.position.set(x, 0.3, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.3, 0.14), jacket);
    upper.position.y = -0.15;
    upper.castShadow = true;
    shoulder.add(upper);
    const elbowPivot = new THREE.Group();
    elbowPivot.name = elbow;
    elbowPivot.position.y = -0.3;
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.27, 0.13), jacket);
    forearm.position.y = -0.14;
    forearm.castShadow = true;
    elbowPivot.add(forearm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.11), skin);
    hand.position.y = -0.29;
    hand.castShadow = true;
    elbowPivot.add(hand);
    shoulder.add(elbowPivot);
    spine.add(shoulder);
  };

  const makeLeg = (name: string, knee: string, x: number): void => {
    const hip = new THREE.Group();
    hip.name = name;
    hip.position.set(x, 0, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.46, 0.2), pants);
    thigh.position.y = -0.23;
    thigh.castShadow = true;
    hip.add(thigh);
    const kneePivot = new THREE.Group();
    kneePivot.name = knee;
    kneePivot.position.y = -0.46;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.4, 0.17), pants);
    shin.position.y = -0.2;
    shin.castShadow = true;
    kneePivot.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.26), shoes);
    foot.position.set(0, -0.44, 0.04);
    foot.castShadow = true;
    kneePivot.add(foot);
    hip.add(kneePivot);
    hips.add(hip);
  };

  makeArm(names.armL, names.elbowL, -0.24);
  makeArm(names.armR, names.elbowR, 0.24);
  makeLeg(names.legL, names.kneeL, -0.14);
  makeLeg(names.legR, names.kneeR, 0.14);

  return { root, boneNames: names };
}

/** Procedurally generated looped clips for the fallback rig. */
function fallbackClips(names: BoneNames): THREE.AnimationClip[] {
  return [
    makeLoop("idle", 2.6, (t) => [
      rot(names.hips, 0, 0.03 * Math.sin(t * 0.4), 0),
      rot(names.spine, 0.04 * Math.sin(t * 0.4 + 0.6), 0, 0),
      rot(names.head, 0, 0.04 * Math.sin(t * 0.3 + 1), 0),
      pos(names.hips, 0, 0.012 * Math.sin(t * 0.4), 0),
    ]),
    makeLoop("walk", 0.8, (t) => {
      const p = t * Math.PI * 2;
      return [
        rot(names.legL, 0.55 * Math.sin(p), 0, 0),
        rot(names.legR, 0.55 * Math.sin(p + Math.PI), 0, 0),
        rot(names.armL, -0.35 * Math.sin(p), 0, 0),
        rot(names.armR, -0.35 * Math.sin(p + Math.PI), 0, 0),
        pos(names.hips, 0, Math.abs(Math.sin(p)) * 0.02, 0),
      ];
    }),
    makeLoop("run", 0.5, (t) => {
      const p = t * Math.PI * 2;
      return [
        rot(names.legL, 0.8 * Math.sin(p), 0, 0),
        rot(names.legR, 0.8 * Math.sin(p + Math.PI), 0, 0),
        rot(names.armL, -0.5 * Math.sin(p), 0, 0),
        rot(names.armR, -0.5 * Math.sin(p + Math.PI), 0, 0),
        rot(names.spine, 0.14, 0, 0),
        pos(names.hips, 0, Math.abs(Math.sin(p)) * 0.03, 0),
      ];
    }),
    makeLoop("sprint", 0.42, (t) => {
      const p = t * Math.PI * 2;
      return [
        rot(names.legL, 1.0 * Math.sin(p), 0, 0),
        rot(names.legR, 1.0 * Math.sin(p + Math.PI), 0, 0),
        rot(names.armL, -0.7 * Math.sin(p), 0, 0),
        rot(names.armR, -0.7 * Math.sin(p + Math.PI), 0, 0),
        rot(names.spine, 0.2, 0, 0),
        pos(names.hips, 0, Math.abs(Math.sin(p)) * 0.04, 0),
      ];
    }),
    makeClip("jump", 0.5, [
      rot(names.legL, -0.7, 0, 0),
      rot(names.legR, -0.5, 0, 0),
      rot(names.armL, 0.5, 0, 0),
      rot(names.armR, -0.5, 0, 0),
      pos(names.hips, 0, 0.06, 0),
    ]),
    makeClip("fall", 0.6, [
      rot(names.legL, 0.18, 0, 0),
      rot(names.legR, 0.1, 0, 0),
      rot(names.armL, 0.6, 0, 0),
      rot(names.armR, -0.6, 0, 0),
      rot(names.spine, 0.06, 0, 0),
    ]),
    makeClip("land", 0.3, [
      rot(names.legL, -0.6, 0, 0),
      rot(names.legR, -0.6, 0, 0),
      pos(names.hips, 0, -0.09, 0),
      rot(names.spine, -0.08, 0, 0),
    ]),
    makeLoop("sit_driving", 2.0, (t) => {
      const breathe = 0.03 * Math.sin(t * 0.9);
      return [
        pos(names.hips, 0, 0.08, 0),
        rot(names.legL, -1.1, 0.06, 0),
        rot(names.legR, -1.1, -0.06, 0),
        rot(names.kneeL, -1.25, 0, 0),
        rot(names.kneeR, -1.25, 0, 0),
        rot(names.spine, -0.14 + breathe, 0, 0),
        rot(names.armL, -1.15, 0.18, 0),
        rot(names.armR, -1.15, -0.18, 0),
        rot(names.elbowL, -1.35, 0, 0),
        rot(names.elbowR, -1.35, 0, 0),
        rot(names.head, 0, 0, 0),
      ];
    }),
    makeClip("enter_vehicle", 0.9, [
      rot(names.spine, -0.3, 0, 0),
      rot(names.legR, -0.5, 0, 0),
      rot(names.legL, 0.15, 0, 0),
      rot(names.kneeL, -0.3, 0, 0),
      rot(names.armL, -0.6, 0, 0),
      rot(names.armR, 0.25, 0, 0),
      rot(names.head, -0.12, 0, 0),
    ]),
    makeClip("exit_vehicle", 1.0, [
      rot(names.spine, 0.12, 0, 0),
      rot(names.legL, 0.35, 0, 0),
      rot(names.legR, -0.15, 0, 0),
      rot(names.kneeR, -0.25, 0, 0),
      rot(names.armL, 0.2, 0, 0),
      rot(names.armR, -0.2, 0, 0),
      rot(names.head, 0.08, 0, 0),
    ]),
  ];
}

type TrackSpec = { bone: string; euler: readonly [number, number, number]; y?: number };

function makeLoop(
  name: string,
  duration: number,
  sample: (t: number) => TrackSpec[],
): THREE.AnimationClip {
  const points = 4;
  const byBone = new Map<string, { times: number[]; quats: number[]; ys: number[] }>();
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    for (const spec of sample(t)) {
      let entry = byBone.get(spec.bone);
      if (!entry) {
        entry = { times: [], quats: [], ys: [] };
        byBone.set(spec.bone, entry);
      }
      entry.times.push(t * duration);
      entry.quats.push(...eulerToQuat(spec.euler).toArray());
      entry.ys.push(spec.y ?? 0);
    }
  }
  return buildClip(name, duration, byBone);
}

function makeClip(name: string, duration: number, specs: TrackSpec[]): THREE.AnimationClip {
  const byBone = new Map<string, { times: number[]; quats: number[]; ys: number[] }>();
  for (const spec of specs) {
    const entry = {
      times: [0, duration],
      quats: [...eulerToQuat(spec.euler).toArray(), ...eulerToQuat(spec.euler).toArray()],
      ys: [spec.y ?? 0, spec.y ?? 0],
    };
    byBone.set(spec.bone, entry);
  }
  return buildClip(name, duration, byBone);
}

function buildClip(
  name: string,
  duration: number,
  byBone: Map<string, { times: number[]; quats: number[]; ys: number[] }>,
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, entry] of byBone) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, entry.times, entry.quats));
    if (entry.ys.some((y) => y !== 0)) {
      tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, entry.times, flatPositions(entry.ys)));
    }
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

function flatPositions(ys: number[]): number[] {
  const out: number[] = [];
  for (const y of ys) out.push(0, y, 0);
  return out;
}

function rot(bone: string, x: number, y: number, z: number): TrackSpec {
  return { bone, euler: [x, y, z] };
}

function pos(bone: string, _x: number, y: number, _z: number): TrackSpec {
  return { bone, euler: [0, 0, 0], y };
}

function eulerToQuat(euler: readonly [number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(euler[0], euler[1], euler[2], "XYZ"));
}
