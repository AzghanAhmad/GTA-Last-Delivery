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
  pitchMin: -0.25,
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
 * subject. In vehicle mode the world yaw follows the vehicle heading, with the
 * mouse orbit applied as a relative offset; on foot the yaw is world-absolute.
 */
export class CameraManager {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: InputManager;
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

  constructor(
    camera: THREE.PerspectiveCamera,
    input: InputManager,
    config: Partial<CameraConfig> = {},
  ) {
    this.camera = camera;
    this.input = input;
    this.config = { ...defaultCameraConfig, ...config };
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
    const mouseX = this.input.mouseDeltaX * c.sensitivity;
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

    this.currentPosition.lerp(this.desiredPosition, positionT);
    this.toCamera.subVectors(this.currentPosition, this.lookTarget);
    if (this.toCamera.length() < (this.activeMode === "vehicle" ? c.vehicleMinDistance : c.minDistance)) {
      this.toCamera.setLength(this.mode === "vehicle" ? c.vehicleMinDistance : c.minDistance);
      this.currentPosition.copy(this.lookTarget).add(this.toCamera);
    }

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.lookTarget);
  }

  /** Writes the normalized horizontal direction the camera is facing into `out`. */
  getForward(out: THREE.Vector3): THREE.Vector3 {
    this.forward.set(-Math.sin(this.currentYaw), 0, -Math.cos(this.currentYaw));
    out.copy(this.forward);
    return out;
  }
}
