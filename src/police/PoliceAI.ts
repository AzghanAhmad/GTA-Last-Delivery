import * as THREE from "three";
import type { Vehicle, VehicleInput } from "../vehicles/Vehicle";

/**
 * Steering/speed controller for an AI-driven vehicle.
 *
 * Given a target point, produces a VehicleInput. It steers toward the target,
 * reduces speed for sharp turns, brakes when close, uses a forward probe to
 * steer around obstacles, and briefly reverses if it gets stuck. The control
 * output feeds the same arcade Vehicle physics the player uses.
 */
export class PoliceAI {
  private readonly vehicle: Vehicle;
  private colliders: readonly THREE.Box3[] = [];
  private stuckTimer = 0;
  private reverseTimer = 0;
  private reversing = false;

  constructor(vehicle: Vehicle, colliders: readonly THREE.Box3[]) {
    this.vehicle = vehicle;
    this.colliders = colliders;
  }

  setColliders(colliders: readonly THREE.Box3[]): void {
    this.colliders = colliders;
  }

  drive(delta: number, target: THREE.Vector3, maxSpeed: number, aggression: number): VehicleInput {
    const pos = this.vehicle.group.position;
    const yaw = this.vehicle.yaw;

    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, dz);
    let headingError = wrapAngle(desiredHeading - yaw);

    let avoidOffset = 0;
    let avoiding = false;
    const lookAhead = Math.min(7, 3 + Math.abs(this.vehicle.speed) * 0.3);
    const probeX = pos.x + Math.sin(yaw) * lookAhead;
    const probeZ = pos.z + Math.cos(yaw) * lookAhead;
    for (const box of this.colliders) {
      if (!pointInBox(probeX, probeZ, box)) continue;
      const boxCenterX = (box.min.x + box.max.x) * 0.5;
      const boxCenterZ = (box.min.z + box.max.z) * 0.5;
      let awayX = pos.x - boxCenterX;
      let awayZ = pos.z - boxCenterZ;
      if (awayX * awayX + awayZ * awayZ < 1e-4) {
        awayX = -Math.sin(yaw);
        awayZ = -Math.cos(yaw);
      }
      avoidOffset = wrapAngle(Math.atan2(awayX, awayZ) - yaw) * 1.3;
      avoiding = true;
      break;
    }

    let steer = THREE.MathUtils.clamp(headingError * 1.6 + avoidOffset, -1, 1);
    const absError = Math.abs(headingError);

    let targetSpeed = maxSpeed * (1 - Math.min(absError / Math.PI, 1) * 0.65);
    if (avoiding) targetSpeed *= 0.5;
    if (dist < 6) targetSpeed = Math.min(targetSpeed, dist * 1.2);
    if (dist < 2) targetSpeed = 0;

    let throttle: number;
    let handbrake = absError > 1.2 && Math.abs(this.vehicle.speed) > maxSpeed * 0.5;

    if (this.reversing) {
      this.reverseTimer -= delta;
      throttle = -1;
      steer = 0;
      handbrake = false;
      if (this.reverseTimer <= 0) {
        this.reversing = false;
        this.stuckTimer = 0;
      }
    } else {
      const speedDiff = targetSpeed - this.vehicle.speed;
      throttle = THREE.MathUtils.clamp(speedDiff * 0.4, -1, 1);
      if (throttle > 0 && this.vehicle.speed < 0.4 && targetSpeed > 2) {
        this.stuckTimer += delta;
        if (this.stuckTimer > 1.1) {
          this.reversing = true;
          this.reverseTimer = 0.7;
        }
      } else {
        this.stuckTimer = 0;
      }
    }

    steer *= 0.85 + aggression * 0.3;
    return { throttle, steer, handbrake };
  }
}

function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
}

function pointInBox(px: number, pz: number, box: THREE.Box3): boolean {
  return px >= box.min.x && px <= box.max.x && pz >= box.min.z && pz <= box.max.z;
}
