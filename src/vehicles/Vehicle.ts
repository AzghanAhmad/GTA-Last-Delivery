import * as THREE from "three";

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

  isOccupied = false;
  speed = 0;

  private steerAngle = 0;
  private wheelSpin = 0;
  private readonly colliders: THREE.Box3[] = [];

  constructor(config: VehicleConfig = SEDAN_CONFIG, style: VehicleStyle = defaultVehicleStyle) {
    this.config = config;
    this.group = new THREE.Group();
    const parts = buildVehicleModel(config, style);
    this.frontSteerGroups = parts.frontSteerGroups;
    this.wheelSpinGroups = parts.wheelSpinGroups;
    this.headlightMaterials = parts.headlightMaterials;
    this.brakeLightMaterials = parts.brakeLightMaterials;
    this.group.add(...parts.meshes);
  }

  get yaw(): number {
    return this.group.rotation.y;
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
      if (inward < 0) this.speed = 0;
    }
  }
}

function buildVehicleModel(config: VehicleConfig, style: VehicleStyle): VehicleParts & { meshes: THREE.Object3D[] } {
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: style.bodyColor,
    metalness: 0.4,
    roughness: 0.35,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: style.glassColor,
    metalness: 0.8,
    roughness: 0.1,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: style.wheelColor,
    roughness: 0.9,
  });
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xbfefff,
    emissiveIntensity: 1.5,
  });
  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xff2222,
    emissiveIntensity: 0.8,
  });

  const halfW = config.width * 0.5;
  const halfL = config.length * 0.5;
  const meshes: THREE.Object3D[] = [];

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(config.width, 0.5, config.length), bodyMaterial);
  chassis.position.y = 0.7;
  meshes.push(chassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.1), glassMaterial);
  cabin.position.set(0, 1.12, -0.15);
  meshes.push(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.42, 0.04), glassMaterial);
  windshield.position.set(0, 1.18, 0.84);
  meshes.push(windshield);

  const rearWindow = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.4, 0.04), glassMaterial);
  rearWindow.position.set(0, 1.16, -1.12);
  meshes.push(rearWindow);

  for (const sideX of [-halfW + 0.08, halfW - 0.08]) {
    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 1.9), glassMaterial);
    sideWindow.position.set(sideX, 1.16, -0.15);
    meshes.push(sideWindow);
  }

  for (const lightX of [-0.55, 0.55]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.05), headlightMaterial);
    headlight.position.set(lightX, 0.72, halfL - 0.02);
    meshes.push(headlight);
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.05), brakeLightMaterial);
    taillight.position.set(lightX, 0.8, -halfL + 0.02);
    meshes.push(taillight);
  }

  const frontSteerGroups: THREE.Group[] = [];
  const wheelSpinGroups: THREE.Group[] = [];

  for (const [x, z, isFront] of [
    [-halfW + 0.25, halfL - 0.55, true],
    [halfW - 0.25, halfL - 0.55, true],
    [-halfW + 0.25, -halfL + 0.55, false],
    [halfW - 0.25, -halfL + 0.55, false],
  ] as Array<[number, number, boolean]>) {
    const spinGroup = new THREE.Group();
    spinGroup.position.set(0, config.wheelRadius, 0);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(config.wheelRadius, config.wheelRadius, 0.24, 12),
      wheelMaterial,
    );
    wheel.rotation.z = Math.PI / 2;
    spinGroup.add(wheel);

    if (isFront) {
      const steerGroup = new THREE.Group();
      steerGroup.position.set(x, 0, z);
      steerGroup.add(spinGroup);
      frontSteerGroups.push(steerGroup);
      meshes.push(steerGroup);
    } else {
      spinGroup.position.set(x, config.wheelRadius, z);
      meshes.push(spinGroup);
    }
    wheelSpinGroups.push(spinGroup);
  }

  return {
    meshes,
    frontSteerGroups,
    wheelSpinGroups,
    headlightMaterials: [headlightMaterial, headlightMaterial],
    brakeLightMaterials: [brakeLightMaterial, brakeLightMaterial],
  };
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
