import * as THREE from "three";
import { PlayerModel } from "./PlayerModel";

export enum PlayerState {
  ON_FOOT = "onFoot",
  /** Animated walk-to-seat sequence; movement input is ignored. */
  ENTERING_VEHICLE = "enteringVehicle",
  IN_VEHICLE = "inVehicle",
  /** Animated seat-to-ground sequence; movement input is ignored. */
  EXITING_VEHICLE = "exitingVehicle",
}

export interface PlayerConfig {
  walkSpeed: number;
  sprintSpeed: number;
  acceleration: number;
  deceleration: number;
  jumpForce: number;
  gravity: number;
  /** Smoothing rate for rotating the body toward the movement direction. */
  turnSmoothing: number;
  /** Collider width along X, in world units. */
  width: number;
  /** Collider depth along Z, in world units. */
  depth: number;
  /** Collider height along Y, in world units. */
  height: number;
}

export const defaultPlayerConfig: PlayerConfig = {
  walkSpeed: 4,
  sprintSpeed: 7.5,
  acceleration: 18,
  deceleration: 26,
  jumpForce: 7,
  gravity: 20,
  turnSmoothing: 10,
  width: 0.9,
  depth: 0.9,
  height: 1.85,
};

/**
 * Player entity: transform, simple kinematics, gravity/jump and AABB collision.
 *
 * The group origin sits at the player's feet. The group is rotated to face the
 * movement direction; the camera never drives the player's facing directly.
 * All visual representation (mesh, rig, animations) lives in `PlayerModel`,
 * so a character model can be swapped without touching movement code.
 */
export class Player {
  readonly group: THREE.Group;
  readonly config: PlayerConfig;
  /** Visual representation (procedural fallback rig or adopted GLTF model). */
  readonly model: PlayerModel;

  readonly velocity = new THREE.Vector3();
  isGrounded = true;
  isSprinting = false;
  horizontalSpeed = 0;
  state = PlayerState.ON_FOOT;

  private facing = 0;
  private readonly colliders: THREE.Box3[] = [];
  private readonly aabb = new THREE.Box3();

  constructor(config: PlayerConfig = defaultPlayerConfig) {
    this.config = config;
    this.group = new THREE.Group();

    this.model = new PlayerModel();
    this.group.add(this.model.group);
  }

  setColliders(colliders: readonly THREE.Box3[]): void {
    this.colliders.length = 0;
    this.colliders.push(...colliders);
  }

  jump(): void {
    if (!this.isGrounded) return;
    this.velocity.y = this.config.jumpForce;
    this.isGrounded = false;
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    this.model.setVisible(visible);
  }

  /** Places the player at a ground position facing a given yaw and resets motion. */
  teleport(x: number, z: number, yaw: number): void {
    this.group.position.set(x, 0, z);
    this.facing = yaw;
    this.group.rotation.y = yaw;
    this.velocity.set(0, 0, 0);
    this.isGrounded = true;
  }

  update(delta: number, moveDirection: THREE.Vector3, sprint: boolean): void {
    this.isSprinting = sprint;

    const moving = moveDirection.lengthSq() > 1e-4;
    const targetSpeed = sprint ? this.config.sprintSpeed : this.config.walkSpeed;
    const rate = moving ? this.config.acceleration : this.config.deceleration;
    const desiredX = moving ? moveDirection.x * targetSpeed : 0;
    const desiredZ = moving ? moveDirection.z * targetSpeed : 0;

    this.velocity.x = approach(this.velocity.x, desiredX, rate * delta);
    this.velocity.z = approach(this.velocity.z, desiredZ, rate * delta);

    this.group.position.x += this.velocity.x * delta;
    this.group.position.z += this.velocity.z * delta;

    this.velocity.y -= this.config.gravity * delta;
    this.group.position.y += this.velocity.y * delta;

    if (moving) {
      this.facing = dampAngle(this.facing, Math.atan2(moveDirection.x, moveDirection.z), this.config.turnSmoothing, delta);
      this.group.rotation.y = this.facing;
    }

    this.horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.group.position.y <= 0 && this.velocity.y <= 0) {
      this.group.position.y = 0;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    this.resolveCollisions();

    this.model.update(delta, {
      moving,
      speed: this.horizontalSpeed,
      sprinting: this.isSprinting,
      grounded: this.isGrounded,
      verticalVelocity: this.velocity.y,
    });
  }

  private resolveCollisions(): void {
    this.updateAABB();
    for (const collider of this.colliders) {
      if (!this.aabb.intersectsBox(collider)) continue;

      const overlapX = Math.min(this.aabb.max.x, collider.max.x) - Math.max(this.aabb.min.x, collider.min.x);
      const overlapZ = Math.min(this.aabb.max.z, collider.max.z) - Math.max(this.aabb.min.z, collider.min.z);
      const centerX = this.group.position.x;
      const centerZ = this.group.position.z;
      const colliderCenterX = (collider.min.x + collider.max.x) * 0.5;
      const colliderCenterZ = (collider.min.z + collider.max.z) * 0.5;

      if (overlapX < overlapZ) {
        this.group.position.x += centerX < colliderCenterX ? -overlapX : overlapX;
      } else {
        this.group.position.z += centerZ < colliderCenterZ ? -overlapZ : overlapZ;
      }
      this.updateAABB();
    }
  }

  private updateAABB(): void {
    const p = this.group.position;
    this.aabb.min.set(
      p.x - this.config.width * 0.5,
      p.y,
      p.z - this.config.depth * 0.5,
    );
    this.aabb.max.set(
      p.x + this.config.width * 0.5,
      p.y + this.config.height,
      p.z + this.config.depth * 0.5,
    );
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

function dampAngle(current: number, target: number, smoothing: number, delta: number): number {
  const twoPi = Math.PI * 2;
  let diff = target - current;
  diff = ((diff + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  return current + diff * (1 - Math.exp(-smoothing * delta));
}
