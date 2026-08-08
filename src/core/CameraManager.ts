import * as THREE from "three";
import type { InputManager } from "./InputManager";

export type CameraMode = "player" | "vehicle";

export interface CameraConfig {
  /** Orbit radius from the player feet. */
  distance: number;
  /** Extra vertical bias added to the orbit height. */
  heightOffset: number;
  /** Height of the point the camera looks at, above the player feet. */
  lookOffset: number;
  pitchMin: number;
  pitchMax: number;
  pitchDefault: number;
  sensitivity: number;
  smoothing: number;
  positionSmoothing: number;
  /** The camera is pushed out to at least this distance from the look target. */
  minDistance: number;

  vehicleDistance: number;
  vehicleHeightOffset: number;
  vehicleLookOffset: number;
  vehiclePitchDefault: number;
  vehicleSmoothing: number;
  vehiclePositionSmoothing: number;
  vehicleMinDistance: number;
}

export const defaultCameraConfig: CameraConfig = {
  distance: 6,
  heightOffset: 0.6,
  lookOffset: 1.6,
  pitchMin: -0.04,
  pitchMax: 1.15,
  pitchDefault: 0.35,
  sensitivity: 0.003,
  smoothing: 9,
  positionSmoothing: 12,
  minDistance: 1.4,

  vehicleDistance: 8,
  vehicleHeightOffset: 0.8,
  vehicleLookOffset: 1.2,
  vehiclePitchDefault: 0.4,
  vehicleSmoothing: 6,
  vehiclePositionSmoothing: 6,
  vehicleMinDistance: 2.0,
};

/**
 * Smooth third-person camera with player and vehicle modes.
 *
 * Yaw/pitch are exponentially damped toward their targets so the camera never
 * snaps, and the camera position is additionally damped so switching between a
 * walking player and a parked vehicle glides instead of jumping. The camera is
 * clamped to a minimum distance from the look target so it never enters its
 * subject, and pulled forward when a building wall would sit between camera and
 * subject (collider raycast) so the view never clips through geometry. In
 * vehicle mode the world yaw follows the vehicle heading, with the mouse orbit
 * applied as a relative offset; on foot the yaw is world-absolute.
 *
 * Mouse conventions (traced end-to-end):
 *   mousemove.movementX (+ = pointer right)  -> yaw DEcreases
 *   mousemove.movementY (+ = pointer down)   -> pitch INcreases (camera rises)
 * The orbit offset is `target + (sin yaw, cos yaw) * d`, so a decreasing yaw
 * swings the camera around the target toward its own right; the camera's right
 * is the subject's right, so the world pans left on screen. That reads as
 * "mouse right turns the camera right" in both player and vehicle modes.
 * Pitch sign: pointer up lowers the camera so the view tilts up; pointer down
 * raises it so the view tilts down — the natural look up/down.
 */
export class CameraManager {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: InputManager;
  private readonly colliders: readonly THREE.Box3[];
  readonly config: CameraConfig;

  private activeMode: CameraMode = "player";

  private targetYaw = 0;
  private currentYaw = 0;
  private targetPitch: number;
  private currentPitch: number;
  private vehicleRelYaw = 0;

  private readonly orbitOffset = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly currentPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly blocked = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    input: InputManager,
    config: Partial<CameraConfig> = {},
    colliders: readonly THREE.Box3[] = [],
  ) {
    this.camera = camera;
    this.input = input;
    this.config = { ...defaultCameraConfig, ...config };
    this.colliders = colliders;
    this.targetPitch = this.currentPitch = this.config.pitchDefault;
    this.currentPosition.copy(this.camera.position);
  }

  get mode(): CameraMode {
    return this.activeMode;
  }

  /** Resets yaw/pitch and mode for a fresh game start. */
  reset(): void {
    this.activeMode = "player";
    this.targetYaw = this.currentYaw = 0;
    this.vehicleRelYaw = 0;
    this.targetPitch = this.currentPitch = this.config.pitchDefault;
    this.currentPosition.copy(this.camera.position);
  }

  /** Re-bases the damped position on the camera's current spot (used after cinematic cuts). */
  syncFromCamera(): void {
    this.currentPosition.copy(this.camera.position);
  }

  /**
   * Switches camera mode without snapping: the new mode's target angles are
   * initialized from the camera's current world yaw/pitch. `target` is the
   * new follow object (used by vehicle mode for its heading).
   */
  setMode(mode: CameraMode, target?: THREE.Object3D): void {
    this.activeMode = mode;
    if (mode === "vehicle" && target) {
      this.vehicleRelYaw = this.currentYaw - target.rotation.y;
      this.targetPitch = this.currentPitch;
    } else if (mode === "player") {
      this.targetYaw = this.currentYaw;
    }
  }

  update(delta: number, target: THREE.Object3D): void {
    const c = this.config;
    // Negated yaw input: a rightward pointer movement must turn the view to the
    // right (world pans left), matching the orbit convention above.
    const mouseX = -this.input.mouseDeltaX * c.sensitivity;
    const mouseY = this.input.mouseDeltaY * c.sensitivity;

    let pitchMin: number;
    let pitchMax: number;
    let angularT: number;
    let positionT: number;

    if (this.activeMode === "vehicle") {
      this.vehicleRelYaw += mouseX;
      this.targetYaw = target.rotation.y + this.vehicleRelYaw;
      pitchMin = c.pitchMin;
      pitchMax = c.pitchMax;
      angularT = 1 - Math.exp(-c.vehicleSmoothing * delta);
      positionT = 1 - Math.exp(-c.vehiclePositionSmoothing * delta);
    } else {
      this.targetYaw += mouseX;
      pitchMin = c.pitchMin;
      pitchMax = c.pitchMax;
      angularT = 1 - Math.exp(-c.smoothing * delta);
      positionT = 1 - Math.exp(-c.positionSmoothing * delta);
    }

    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + mouseY, pitchMin, pitchMax);
    this.currentYaw += (this.targetYaw - this.currentYaw) * angularT;
    this.currentPitch += (this.targetPitch - this.currentPitch) * angularT;

    const distance = this.activeMode === "vehicle" ? c.vehicleDistance : c.distance;
    const heightOffset = this.activeMode === "vehicle" ? c.vehicleHeightOffset : c.heightOffset;
    const lookOffset = this.activeMode === "vehicle" ? c.vehicleLookOffset : c.lookOffset;

    this.orbitOffset.set(
      distance * Math.cos(this.currentPitch) * Math.sin(this.currentYaw),
      distance * Math.sin(this.currentPitch) + heightOffset,
      distance * Math.cos(this.currentPitch) * Math.cos(this.currentYaw),
    );
    this.desiredPosition.copy(target.position).add(this.orbitOffset);

    this.lookTarget.set(
      target.position.x,
      target.position.y + lookOffset,
      target.position.z,
    );

    // Pull the camera in when a building wall would block the view.
    const minDistance = this.activeMode === "vehicle" ? c.vehicleMinDistance : c.minDistance;
    const hit = this.cameraObstruction(this.lookTarget, this.desiredPosition);
    if (hit > minDistance + 0.35) {
      this.blocked.subVectors(this.desiredPosition, this.lookTarget).setLength(hit - 0.3);
      this.desiredPosition.copy(this.lookTarget).add(this.blocked);
    }

    this.currentPosition.lerp(this.desiredPosition, positionT);
    this.toCamera.subVectors(this.currentPosition, this.lookTarget);
    if (this.toCamera.length() < minDistance) {
      this.toCamera.setLength(minDistance);
      this.currentPosition.copy(this.lookTarget).add(this.toCamera);
    }
    // Keep the camera above ground even during smoothing dips.
    if (this.currentPosition.y < 0.3) this.currentPosition.y = 0.3;

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.lookTarget);
  }

  /**
   * Returns how far along the segment lookTarget->end the camera would first
   * enter an AABB collider, or -1 when the view is unobstructed.
   */
  private cameraObstruction(origin: THREE.Vector3, end: THREE.Vector3): number {
    let tmin = 0;
    let tmax = 1;
    for (const box of this.colliders) {
      let min = 0;
      let max = 1;
      let valid = true;
      for (let axis = 0; axis < 3; axis++) {
        const o = origin.getComponent(axis);
        const e = end.getComponent(axis);
        const lo = box.min.getComponent(axis);
        const hi = box.max.getComponent(axis);
        const d = e - o;
        if (Math.abs(d) < 1e-6) {
          if (o < lo || o > hi) {
            valid = false;
            break;
          }
          continue;
        }
        const t1 = (lo - o) / d;
        const t2 = (hi - o) / d;
        min = Math.max(min, Math.min(t1, t2));
        max = Math.min(max, Math.max(t1, t2));
        if (min > max) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      tmin = Math.max(tmin, min);
      tmax = Math.min(tmax, max);
      if (tmin > tmax) return -1;
    }
    return tmin === 0 ? -1 : tmin;
  }

  /** Writes the normalized horizontal direction the camera is facing into `out`. */
  getForward(out: THREE.Vector3): THREE.Vector3 {
    this.forward.set(-Math.sin(this.currentYaw), 0, -Math.cos(this.currentYaw));
    out.copy(this.forward);
    return out;
  }
}
