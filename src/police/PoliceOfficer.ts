import * as THREE from "three";

export enum OfficerState {
  EXITING = "EXITING",
  APPROACHING = "APPROACHING",
  ARRESTING = "ARRESTING",
  DONE = "DONE",
}

/**
 * A police officer who leaves the cruiser to arrest the player.
 *
 * A low-poly humanoid (dark uniform, cap and a small badge) that exits the car,
 * walks to the target, stands for a short standoff and then reports the arrest.
 * Movement slides against the static colliders so the officer never clips
 * through buildings or parked cars. The walk is a simple alternating limb swing
 * driven by the distance travelled.
 */
export class PoliceOfficer {
  readonly group: THREE.Group;
  state = OfficerState.EXITING;

  private readonly onArrest: () => void;
  private readonly legLeftPivot: THREE.Group;
  private readonly legRightPivot: THREE.Group;
  private readonly armLeftPivot: THREE.Group;
  private readonly armRightPivot: THREE.Group;
  private colliders: readonly THREE.Box3[];
  private exitTimer = 0;
  private arrestTimer = 0;
  private walkPhase = 0;
  private reportedFlag = false;
  private readonly stopDistance = 1.7;
  private readonly speed = 2.4;

  constructor(
    scene: THREE.Scene,
    x: number,
    z: number,
    yaw: number,
    colliders: readonly THREE.Box3[],
    onArrest: () => void,
  ) {
    this.onArrest = onArrest;
    this.colliders = colliders;
    this.group = new THREE.Group();

    const parts = buildOfficer();
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

    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    scene.add(this.group);
  }

  /** True once the arrest standoff finished and the bust was reported. */
  get hasReported(): boolean {
    return this.reportedFlag;
  }

  /** True during the standing "hands up" phase that triggers the bust camera. */
  get isArresting(): boolean {
    return this.state === OfficerState.ARRESTING;
  }

  setColliders(colliders: readonly THREE.Box3[]): void {
    this.colliders = colliders;
  }

  update(delta: number, targetPosition: THREE.Vector3): void {
    const pos = this.group.position;
    const dx = targetPosition.x - pos.x;
    const dz = targetPosition.z - pos.z;
    const dist = Math.hypot(dx, dz);

    switch (this.state) {
      case OfficerState.EXITING: {
        this.exitTimer += delta;
        if (this.exitTimer > 0.6) this.state = OfficerState.APPROACHING;
        break;
      }
      case OfficerState.APPROACHING: {
        if (dist > this.stopDistance) {
          const step = this.speed * delta;
          const nx = pos.x + (dx / dist) * step;
          const nz = pos.z + (dz / dist) * step;
          if (this.canMove(nx, pos.z)) pos.x = nx;
          if (this.canMove(pos.x, nz)) pos.z = nz;
          this.group.rotation.y = Math.atan2(dx, dz);
          this.walkPhase += step * 1.5;
          this.animateWalk();
        } else {
          this.state = OfficerState.ARRESTING;
          this.arrestTimer = 0;
        }
        break;
      }
      case OfficerState.ARRESTING: {
        this.arrestTimer += delta;
        this.animateArrest();
        if (this.arrestTimer >= 1.2 && !this.reportedFlag) {
          this.reportedFlag = true;
          this.state = OfficerState.DONE;
          this.onArrest();
        }
        break;
      }
      default:
        break;
    }
  }

  private canMove(x: number, z: number): boolean {
    const probe = new THREE.Box3(
      new THREE.Vector3(x - 0.35, 0, z - 0.35),
      new THREE.Vector3(x + 0.35, 1.8, z + 0.35),
    );
    for (const collider of this.colliders) {
      if (probe.intersectsBox(collider)) return false;
    }
    return true;
  }

  private animateWalk(): void {
    const swing = Math.sin(this.walkPhase) * 0.6;
    this.legLeftPivot.rotation.x = swing;
    this.legRightPivot.rotation.x = -swing;
    this.armLeftPivot.rotation.x = -swing * 0.8;
    this.armRightPivot.rotation.x = swing * 0.8;
  }

  private animateArrest(): void {
    this.legLeftPivot.rotation.x = 0;
    this.legRightPivot.rotation.x = 0;
    this.armLeftPivot.rotation.x = -0.9;
    this.armRightPivot.rotation.x = -0.9;
  }
}

function buildOfficer(): {
  torso: THREE.Mesh;
  head: THREE.Mesh;
  legLeftPivot: THREE.Group;
  legRightPivot: THREE.Group;
  armLeftPivot: THREE.Group;
  armRightPivot: THREE.Group;
} {
  const uniform = new THREE.MeshStandardMaterial({
    color: 0x2c3550,
    roughness: 0.7,
    metalness: 0.2,
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c99a, roughness: 0.8 });
  const badge = new THREE.MeshStandardMaterial({
    color: 0xffd76a,
    emissive: 0xffb040,
    emissiveIntensity: 0.6,
    metalness: 0.7,
    roughness: 0.3,
  });

  const hipY = 0.85;
  const shoulderY = 1.55;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), uniform);
  torso.position.y = 1.2;
  const badgeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.02), badge);
  badgeMesh.position.set(0, 0.12, 0.16);
  torso.add(badgeMesh);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skin);
  head.position.y = 1.72;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), uniform);
  cap.position.set(0, 0.11, 0);
  head.add(cap);

  const legLeftPivot = buildLimb(new THREE.BoxGeometry(0.14, hipY, 0.16), uniform, -0.18, hipY);
  const legRightPivot = buildLimb(new THREE.BoxGeometry(0.14, hipY, 0.16), uniform, 0.18, hipY);
  const armLeftPivot = buildLimb(new THREE.BoxGeometry(0.12, 0.62, 0.12), uniform, -0.32, shoulderY);
  const armRightPivot = buildLimb(new THREE.BoxGeometry(0.12, 0.62, 0.12), uniform, 0.32, shoulderY);

  return { torso, head, legLeftPivot, legRightPivot, armLeftPivot, armRightPivot };
}

function buildLimb(
  geometry: THREE.BoxGeometry,
  material: THREE.Material,
  x: number,
  pivotY: number,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, pivotY, 0);
  const limb = new THREE.Mesh(geometry, material);
  limb.position.y = -pivotY * 0.5;
  pivot.add(limb);
  return pivot;
}
