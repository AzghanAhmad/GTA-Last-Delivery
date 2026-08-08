import * as THREE from "three";
import { Vehicle, type VehicleConfig, type VehicleStyle } from "../vehicles/Vehicle";

export const POLICE_CONFIG: VehicleConfig = {
  name: "Police",
  maxForwardSpeed: 16,
  maxReverseSpeed: 6,
  acceleration: 10,
  braking: 22,
  reverseAcceleration: 7,
  naturalDeceleration: 3.5,
  steeringStrength: 2.4,
  maxSteerAngle: 0.6,
  steerSmoothing: 10,
  handbrakeStrength: 30,
  length: 4.4,
  width: 1.85,
  height: 1.4,
  wheelRadius: 0.34,
};

export const policeVehicleStyle: VehicleStyle = {
  bodyColor: 0xf2f3f5,
  glassColor: 0x141e2b,
  wheelColor: 0x0d0d0f,
};

/**
 * AI-driven police vehicle.
 *
 * Reuses the base Vehicle physics and model, adds a dark/white police paint
 * job and a two-bar roof light bar that alternates red/blue. The flashing is
 * purely emissive (no dynamic lights) to stay cheap on the target hardware.
 */
export class PoliceVehicle extends Vehicle {
  private readonly leftLightMaterial: THREE.MeshStandardMaterial;
  private readonly rightLightMaterial: THREE.MeshStandardMaterial;

  constructor(config: VehicleConfig = POLICE_CONFIG, style: VehicleStyle = policeVehicleStyle) {
    super(config, style);

    const leftLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.16, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xff2244,
        emissiveIntensity: 0,
      }),
    );
    const rightLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.16, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x2266ff,
        emissiveIntensity: 0,
      }),
    );
    leftLight.position.set(-0.45, 1.52, -0.15);
    rightLight.position.set(0.45, 1.52, -0.15);
    this.group.add(leftLight, rightLight);

    this.leftLightMaterial = leftLight.material as THREE.MeshStandardMaterial;
    this.rightLightMaterial = rightLight.material as THREE.MeshStandardMaterial;
  }

  /** Alternates the red/blue roof lights based on an accumulating clock. */
  updateLights(time: number): void {
    const leftOn = Math.floor(time * 4) % 2 === 0;
    this.leftLightMaterial.emissiveIntensity = leftOn ? 2.5 : 0.1;
    this.rightLightMaterial.emissiveIntensity = leftOn ? 0.1 : 2.5;
  }
}
