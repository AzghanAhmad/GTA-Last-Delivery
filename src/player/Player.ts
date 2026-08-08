import * as THREE from "three";

export enum PlayerState {
  ON_FOOT = "onFoot",
  IN_VEHICLE = "inVehicle",
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

export interface PlaceholderParts {
  legLeftPivot: THREE.Group;
  legRightPivot: THREE.Group;
  armLeftPivot: THREE.Group;
  armRightPivot: THREE.Group;
}

/**
 * Player entity: transform, simple kinematics, gravity/jump and AABB collision.
 *
 * The group origin sits at the player's feet. The group is rotated to face the
 * movement direction; the camera never drives the player's facing directly.
 * The body is a temporary low-poly placeholder built from primitives that will
 * be replaced by a real character model later.
 */
export class Player {
  readonly group: THREE.Group;
  readonly config: PlayerConfig;

  readonly legLeftPivot: THREE.Group;
  readonly legRightPivot: THREE.Group;
  readonly armLeftPivot: THREE.Group;
  readonly armRightPivot: THREE.Group;

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

    const parts = buildPlaceholder();
    this.legLeftPivot = parts.legLeftPivot;
    this.legRightPivot = parts.legRightPivot;
    this.armLeftPivot = parts.armLeftPivot;
    this.armRightPivot = parts.armRightPivot;

    this.group.add(
      parts.torso,
      parts.head,
      this.legLeftPivot,
      this.legRightPivot,
      this.armLeftPivot,
      this.armRightPivot,
    );
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

function buildPlaceholder(): PlaceholderParts & { torso: THREE.Mesh; head: THREE.Mesh } {
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x14c8ff,
    emissive: 0x0a3a55,
    roughness: 0.5,
    metalness: 0.2,
  });
  const limbMaterial = new THREE.MeshStandardMaterial({
    color: 0x0aa8e0,
    roughness: 0.6,
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2c99a,
    roughness: 0.8,
  });
  const visorMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a1a2a,
    emissive: 0x22e0ff,
  });

  const hipY = 0.85;
  const shoulderY = 1.6;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.32), bodyMaterial);
  torso.position.y = 1.25;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), headMaterial);
  head.position.y = 1.78;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.06), visorMaterial);
  visor.position.set(0, 0.02, 0.15);
  head.add(visor);

  const legLeftPivot = new THREE.Group();
  legLeftPivot.position.set(-0.18, hipY, 0);
  const legLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, hipY, 0.16), limbMaterial);
  legLeft.position.y = -hipY * 0.5;
  legLeftPivot.add(legLeft);

  const legRightPivot = new THREE.Group();
  legRightPivot.position.set(0.18, hipY, 0);
  const legRight = new THREE.Mesh(new THREE.BoxGeometry(0.14, hipY, 0.16), limbMaterial);
  legRight.position.y = -hipY * 0.5;
  legRightPivot.add(legRight);

  const armLeftPivot = new THREE.Group();
  armLeftPivot.position.set(-0.32, shoulderY, 0);
  const armLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), limbMaterial);
  armLeft.position.y = -0.31;
  armLeftPivot.add(armLeft);

  const armRightPivot = new THREE.Group();
  armRightPivot.position.set(0.32, shoulderY, 0);
  const armRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), limbMaterial);
  armRight.position.y = -0.31;
  armRightPivot.add(armRight);

  return { torso, head, legLeftPivot, legRightPivot, armLeftPivot, armRightPivot };
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
