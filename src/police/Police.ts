import * as THREE from "three";
import type { VehicleInput } from "../vehicles/Vehicle";
import { PoliceAI } from "./PoliceAI";
import type { PoliceVehicle } from "./PoliceVehicle";
import type { WantedSystem } from "./WantedSystem";

export enum PoliceState {
  IDLE = "IDLE",
  ALERT = "ALERT",
  PURSUING = "PURSUING",
  SEARCHING = "SEARCHING",
  RETURNING = "RETURNING",
  ARRESTED = "ARRESTED",
}

/** What the police track: a moving point with a velocity for interception. */
export interface TargetProvider {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

/** Mutable target object updated by the PoliceManager each frame. */
export class TrackedTarget implements TargetProvider {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
}

/**
 * A single police unit: its vehicle, behavior state and timers.
 *
 * ALERT -> brief activation before pursuit. PURSUING drives toward a predicted
 * intercept point and builds an arrest timer when close. SEARCHING drives to
 * the last known position and re-acquires if the player comes back. RETURNING
 * drives back to its spawn point until the manager removes it.
 */
export class Police {
  readonly vehicle: PoliceVehicle;
  readonly ai: PoliceAI;
  state = PoliceState.ALERT;
  spawnPoint = new THREE.Vector3();
  finished = false;

  private readonly onArrest: () => void;
  private readonly predictionTimeMax: number;
  private readonly returnTimeout: number;
  readonly lastKnown = new THREE.Vector3();
  private detectionRadius: number;
  private stateTimer = 0;
  private arrestTimer = 0;
  private time = 0;

  constructor(
    vehicle: PoliceVehicle,
    colliders: readonly THREE.Box3[],
    detectionRadius: number,
    predictionTimeMax: number,
    returnTimeout: number,
    onArrest: () => void,
  ) {
    this.vehicle = vehicle;
    this.ai = new PoliceAI(vehicle, colliders);
    this.detectionRadius = detectionRadius;
    this.predictionTimeMax = predictionTimeMax;
    this.returnTimeout = returnTimeout;
    this.onArrest = onArrest;
  }

  get sirenActive(): boolean {
    return this.state === PoliceState.ALERT || this.state === PoliceState.PURSUING;
  }

  beginReturn(): void {
    if (this.state === PoliceState.ARRESTED || this.state === PoliceState.RETURNING) return;
    this.state = PoliceState.RETURNING;
    this.stateTimer = 0;
    this.arrestTimer = 0;
  }

  setDynamicColliders(colliders: readonly THREE.Box3[]): void {
    this.ai.setColliders(colliders);
  }

  update(delta: number, target: TargetProvider, wanted: WantedSystem): void {
    this.time += delta;
    this.detectionRadius = wanted.getDetectionRadius();
    this.vehicle.updateLights(this.time);

    const input = this.computeControls(delta, target, wanted);
    if (this.state === PoliceState.ARRESTED) this.vehicle.speed = 0;
    this.vehicle.update(delta, input);
  }

  private computeControls(delta: number, target: TargetProvider, wanted: WantedSystem): VehicleInput {
    const pos = this.vehicle.group.position;
    const dist = horizontalDistance(pos, target.position);
    const maxSpeed = this.vehicle.config.maxForwardSpeed;
    const aggression = wanted.getWantedLevel() / wanted.maxWantedLevel;

    switch (this.state) {
      case PoliceState.ALERT: {
        this.stateTimer += delta;
        if (this.stateTimer > 1.0) {
          this.state = PoliceState.PURSUING;
          this.stateTimer = 0;
        }
        return this.ai.drive(delta, target.position, maxSpeed * 0.5, aggression);
      }

      case PoliceState.PURSUING: {
        if (dist > this.detectionRadius) {
          this.lastKnown.copy(target.position);
          this.state = PoliceState.SEARCHING;
          this.stateTimer = 0;
          this.arrestTimer = 0;
        } else if (dist < wanted.config.arrestDistance) {
          this.arrestTimer += delta;
          if (this.arrestTimer >= wanted.config.arrestDuration) {
            this.state = PoliceState.ARRESTED;
            this.arrestTimer = 0;
            this.onArrest();
            return { throttle: 0, steer: 0, handbrake: true };
          }
        } else {
          this.arrestTimer = 0;
        }
        const intercept = this.computeIntercept(target, dist, maxSpeed);
        return this.ai.drive(delta, intercept, maxSpeed, aggression);
      }

      case PoliceState.SEARCHING: {
        this.stateTimer += delta;
        if (dist <= this.detectionRadius) {
          this.state = PoliceState.PURSUING;
          this.stateTimer = 0;
          this.arrestTimer = 0;
          return this.ai.drive(delta, target.position, maxSpeed, aggression);
        }
        if (this.stateTimer > wanted.config.searchDuration) {
          this.beginReturn();
        }
        return this.ai.drive(delta, this.lastKnown, maxSpeed * 0.8, aggression);
      }

      case PoliceState.RETURNING: {
        this.stateTimer += delta;
        const toSpawn = horizontalDistance(pos, this.spawnPoint);
        if (toSpawn < 4 || this.stateTimer > this.returnTimeout) this.finished = true;
        return this.ai.drive(delta, this.spawnPoint, maxSpeed * 0.9, aggression);
      }

      default:
        return { throttle: 0, steer: 0, handbrake: false };
    }
  }

  private computeIntercept(target: TargetProvider, dist: number, maxSpeed: number): THREE.Vector3 {
    const prediction = THREE.MathUtils.clamp(dist / Math.max(6, maxSpeed), 0, this.predictionTimeMax);
    return new THREE.Vector3().copy(target.position).addScaledVector(target.velocity, prediction);
  }
}

function horizontalDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}
