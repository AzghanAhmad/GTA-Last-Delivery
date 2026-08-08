import * as THREE from "three";
import { VehicleModel, SUPERCAR_CONFIG, SUPERCAR_STYLE, type VehicleModelResult } from "./VehicleModel";

export interface VehicleInput {
  /** -1 (reverse) .. 0 (coast) .. 1 (accelerate). */
  throttle: number;
  /** -1 (right) .. 1 (left). */
  steer: number;
  handbrake: boolean;
}

export interface VehicleConfig {
  name: string;
  maxForwardSpeed: number;
  maxReverseSpeed: number;
  acceleration: number;
  braking: number;
  reverseAcceleration: number;
  naturalDeceleration: number;
  /** Max heading change rate (rad/s) at full steer and optimal speed. */
  steeringStrength: number;
  /** Max front-wheel visual steering angle (rad). */
  maxSteerAngle: number;
  steerSmoothing: number;
  handbrakeStrength: number;
  length: number;
  width: number;
  height: number;
  wheelRadius: number;
}

export const SEDAN_CONFIG: VehicleConfig = {
  name: "Sedan",
  maxForwardSpeed: 14,
  maxReverseSpeed: 6,
  acceleration: 8,
  braking: 20,
  reverseAcceleration: 6,
  naturalDeceleration: 3,
  steeringStrength: 2.2,
  maxSteerAngle: 0.6,
  steerSmoothing: 8,
  handbrakeStrength: 28,
  length: 4.3,
  width: 1.8,
  height: 1.35,
  wheelRadius: 0.34,
};

export interface VehicleParts {
  frontSteerGroups: THREE.Group[];
  wheelSpinGroups: THREE.Group[];
  headlightMaterials: THREE.MeshStandardMaterial[];
  brakeLightMaterials: THREE.MeshStandardMaterial[];
  /** Left-front door pivot that swings outward, or null when the model has none. */
  driverDoorGroup: THREE.Group | null;
}

export interface VehicleStyle {
  bodyColor: number;
  glassColor: number;
  wheelColor: number;
}

export const defaultVehicleStyle: VehicleStyle = {
  bodyColor: 0xd84a4a,
  glassColor: 0x1a2a3a,
  wheelColor: 0x111111,
};

/**
 * Arcade-style drivable vehicle.
 *
 * The group origin sits at ground level under the center of the car. The car
 * faces its local +Z axis. Speed is a signed scalar along the heading; the
 * vehicle pivots around its own orientation via smoothed steering. Collisions
 * use a lightweight 2D SAT test against axis-aligned box colliders.
 *
 * The body is a temporary low-poly placeholder; the config/data structure is
 * designed so sedans, sports cars, SUVs and police cars can be added later.
 */
export class Vehicle {
  readonly group: THREE.Group;
  readonly config: VehicleConfig;

  readonly frontSteerGroups: THREE.Group[];
  readonly wheelSpinGroups: THREE.Group[];
  readonly headlightMaterials: THREE.MeshStandardMaterial[];
  readonly brakeLightMaterials: THREE.MeshStandardMaterial[];
  /** Where the seated driver's feet anchor; follows the car while driving. */
  readonly driverSeatAnchor: THREE.Group;
  /** Marker at the driver's door (outside), used for enter prompts and exits. */
  readonly driverDoorAnchor: THREE.Group;

  isOccupied = false;
  speed = 0;

  /** 0..100 cosmetic damage accumulated from hard impacts; read by the mission. */
  private damageValue = 0;
  private headlightsOn = false;

  private static readonly doorOpenAngle = 0.95;
  private doorGroup: THREE.Group | null;
  private doorOpenAmount = 0;
  private doorTarget = 0;
  private steerAngle = 0;
  private wheelSpin = 0;
  private readonly colliders: THREE.Box3[] = [];

  constructor(
    config: VehicleConfig = SEDAN_CONFIG,
    style: VehicleStyle = defaultVehicleStyle,
    parts: VehicleModelResult = VehicleModel.buildPlaceholder(config, style),
  ) {
    this.config = config;
    this.group = new THREE.Group();
    this.frontSteerGroups = parts.frontSteerGroups;
    this.wheelSpinGroups = parts.wheelSpinGroups;
    this.headlightMaterials = parts.headlightMaterials;
    this.brakeLightMaterials = parts.brakeLightMaterials;
    this.doorGroup = parts.driverDoorGroup;
    this.group.add(...parts.meshes);

    // Driver on the left (-X), seat just below beltline height so the seated
    // rig's head clears the roof; door anchor hangs off the door side.
    this.driverSeatAnchor = new THREE.Group();
    this.driverSeatAnchor.position.set(-config.width * 0.3, 0.42, 0.15);
    this.driverDoorAnchor = new THREE.Group();
    this.driverDoorAnchor.position.set(-config.width * 0.5, 0.85, 0.7);
    this.group.add(this.driverSeatAnchor, this.driverDoorAnchor);
  }

  get driverDoorGroup(): THREE.Group | null {
    return this.doorGroup;
  }

  /** The Heist's target vehicle: a fast prototype car with a distinct identity. */
  static supercar(): Vehicle {
    return new Vehicle(SUPERCAR_CONFIG, SUPERCAR_STYLE, VehicleModel.buildSupercar());
  }

  /** Swaps the procedural visual for a GLB vehicle mapped onto the same handles. */
  adoptGltf(gltf: import("three/examples/jsm/loaders/GLTFLoader.js").GLTF, nodeMap = {}): void {
    for (const child of [...this.group.children]) {
      if (child === this.driverSeatAnchor || child === this.driverDoorAnchor) continue;
      this.group.remove(child);
    }
    this.group.add(gltf.scene.clone(true));
    const handles = VehicleModel.adoptGltf(gltf, nodeMap);
    this.frontSteerGroups.splice(0, this.frontSteerGroups.length, ...handles.frontSteerGroups);
    this.wheelSpinGroups.splice(0, this.wheelSpinGroups.length, ...handles.wheelSpinGroups);
    this.headlightMaterials.splice(0, this.headlightMaterials.length, ...handles.headlightMaterials);
    this.brakeLightMaterials.splice(0, this.brakeLightMaterials.length, ...handles.brakeLightMaterials);
    this.doorGroup = handles.driverDoorGroup;
  }

  get yaw(): number {
    return this.group.rotation.y;
  }

  get damage(): number {
    return this.damageValue;
  }

  /** Clears accumulated damage (used by mission restart). */
  resetDamage(): void {
    this.damageValue = 0;
  }

  get areHeadlightsOn(): boolean {
    return this.headlightsOn;
  }

  /** Turns the headlight glow on/off (bright beam when on, dim when off). */
  setHeadlights(on: boolean): void {
    this.headlightsOn = on;
    const intensity = on ? 3.0 : 0.15;
    for (const material of this.headlightMaterials) material.emissiveIntensity = intensity;
  }

  /** Adds impact damage, clamped to 100. Soft bumps below the threshold do nothing. */
  private registerImpact(impactSpeed: number): void {
    const amount = Math.max(0, impactSpeed - 5) * 2.2;
    if (amount > 0) this.damageValue = Math.min(100, this.damageValue + amount);
  }

  /** Writes the horizontal world velocity vector into `out`. */
  getVelocity(out: THREE.Vector3): THREE.Vector3 {
    const yaw = this.group.rotation.y;
    out.set(Math.sin(yaw) * this.speed, 0, Math.cos(yaw) * this.speed);
    return out;
  }

  setColliders(colliders: readonly THREE.Box3[]): void {
    this.colliders.length = 0;
    this.colliders.push(...colliders);
  }

  /** Requests the driver door to open (true) or close (false); animates smoothly. */
  setDoorOpen(open: boolean): void {
    this.doorTarget = open ? 1 : 0;
  }

  /** Advances the door swing toward its target; call every frame while animating. */
  updateDoor(delta: number): void {
    if (!this.doorGroup) {
      this.doorOpenAmount = this.doorTarget;
      return;
    }
    const t = 1 - Math.exp(-9 * delta);
    this.doorOpenAmount += (this.doorTarget - this.doorOpenAmount) * t;
    this.doorGroup.rotation.y = this.doorOpenAmount * Vehicle.doorOpenAngle;
  }

  /** Writes the driver door marker's world position into `out`. */
  getDriverDoorWorld(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return this.driverDoorAnchor.getWorldPosition(out);
  }

  /** Writes the driver seat anchor's world position into `out`. */
  getDriverSeatWorld(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return this.driverSeatAnchor.getWorldPosition(out);
  }

  update(delta: number, input: VehicleInput): void {
    const c = this.config;

    const steerTarget = input.steer * c.maxSteerAngle;
    this.steerAngle += (steerTarget - this.steerAngle) * (1 - Math.exp(-c.steerSmoothing * delta));

    if (input.throttle > 0) {
      this.speed += c.acceleration * delta;
    } else if (input.throttle < 0) {
      if (this.speed > 0.1) {
        this.speed -= c.braking * delta;
      } else {
        this.speed -= c.reverseAcceleration * delta;
      }
    } else {
      const coast = c.naturalDeceleration * delta;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - coast);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + coast);
    }

    if (input.handbrake) {
      const skid = c.handbrakeStrength * delta;
      if (this.speed > 0) this.speed = Math.max(0, this.speed - skid);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + skid);
    }

    this.speed = THREE.MathUtils.clamp(this.speed, -c.maxReverseSpeed, c.maxForwardSpeed);

    const direction = this.speed > 0 ? 1 : this.speed < 0 ? -1 : 0;
    const speedFactor = Math.min(1, Math.abs(this.speed) / c.maxForwardSpeed);
    const turnFactor = 0.25 + 0.75 * speedFactor;
    const highSpeedCut = 1 - speedFactor * 0.4;
    const turnRate = (this.steerAngle / c.maxSteerAngle) * c.steeringStrength * turnFactor * highSpeedCut * direction;
    this.group.rotation.y += turnRate * delta;

    const yaw = this.group.rotation.y;
    this.group.position.x += Math.sin(yaw) * this.speed * delta;
    this.group.position.z += Math.cos(yaw) * this.speed * delta;
    this.group.position.y = 0;

    this.wheelSpin += (this.speed * delta) / c.wheelRadius;
    for (const spinGroup of this.wheelSpinGroups) spinGroup.rotation.x = -this.wheelSpin;
    for (const steerGroup of this.frontSteerGroups) steerGroup.rotation.y = this.steerAngle;

    const braking = input.throttle < 0 && this.speed > 0.5;
    const brakeGlow = braking ? 3.0 : 0.8;
    for (const material of this.brakeLightMaterials) material.emissiveIntensity = brakeGlow;

    this.resolveCollisions();
  }

  private resolveCollisions(): void {
    const c = this.config;
    const hw = c.width * 0.5;
    const hl = c.length * 0.5;

    for (const collider of this.colliders) {
      const yaw = this.group.rotation.y;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cx = this.group.position.x;
      const cz = this.group.position.z;

      const reach = hw + hl;
      if (cx + reach < collider.min.x || cx - reach > collider.max.x) continue;
      if (cz + reach < collider.min.z || cz - reach > collider.max.z) continue;

      const vCorners = vehicleCorners(cx, cz, cosY, sinY, hw, hl);
      const bCorners = boxCorners(collider);
      const axes: ReadonlyArray<readonly [number, number]> = [
        [1, 0],
        [0, 1],
        [sinY, cosY],
        [cosY, -sinY],
      ];

      let minOverlap = Infinity;
      let bestAxis: readonly [number, number] | null = null;

      for (const axis of axes) {
        const vRange = project(vCorners, axis);
        const bRange = project(bCorners, axis);
        const overlap = Math.min(vRange.max, bRange.max) - Math.max(vRange.min, bRange.min);
        if (overlap <= 0) {
          bestAxis = null;
          break;
        }
        if (overlap < minOverlap) {
          minOverlap = overlap;
          bestAxis = axis;
        }
      }

      if (!bestAxis) continue;

      const obcx = (collider.min.x + collider.max.x) * 0.5;
      const obcz = (collider.min.z + collider.max.z) * 0.5;
      const towardVehicle = Math.sign((cx - obcx) * bestAxis[0] + (cz - obcz) * bestAxis[1]);
      const push = (towardVehicle >= 0 ? 1 : -1) * minOverlap;
      this.group.position.x += bestAxis[0] * push;
      this.group.position.z += bestAxis[1] * push;

      const normalX = bestAxis[0] * (towardVehicle >= 0 ? 1 : -1);
      const normalZ = bestAxis[1] * (towardVehicle >= 0 ? 1 : -1);
      const inward = this.speed * (sinY * normalX + cosY * normalZ);
      if (inward < 0) {
        this.registerImpact(-inward);
        this.speed = 0;
      }
    }
  }
}

type Corner = readonly [number, number];

function vehicleCorners(cx: number, cz: number, cosY: number, sinY: number, hw: number, hl: number): Corner[] {
  return [
    [cx - hw * cosY - hl * sinY, cz + hw * sinY - hl * cosY],
    [cx + hw * cosY - hl * sinY, cz - hw * sinY - hl * cosY],
    [cx + hw * cosY + hl * sinY, cz - hw * sinY + hl * cosY],
    [cx - hw * cosY + hl * sinY, cz + hw * sinY + hl * cosY],
  ];
}

function boxCorners(box: THREE.Box3): Corner[] {
  return [
    [box.min.x, box.min.z],
    [box.max.x, box.min.z],
    [box.max.x, box.max.z],
    [box.min.x, box.max.z],
  ];
}

function project(corners: readonly Corner[], axis: readonly [number, number]): { min: number; max: number } {
  const [ax, az] = axis;
  let min = Infinity;
  let max = -Infinity;
  for (const [x, z] of corners) {
    const value = x * ax + z * az;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}
