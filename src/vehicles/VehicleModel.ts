import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { VehicleConfig, VehicleParts, VehicleStyle } from "./Vehicle";

export interface VehicleNodeMap {
  /** Name substrings of front wheels that both steer and spin. */
  steerWheels?: readonly string[];
  /** Name substrings of rear wheels that only spin. */
  spinWheels?: readonly string[];
  headlightNodes?: readonly string[];
  taillightNodes?: readonly string[];
  /** First matched node becomes the driver door pivot (rotates outward). */
  driverDoorNodes?: readonly string[];
}

export interface VehicleModelResult extends VehicleParts {
  meshes: THREE.Object3D[];
}

/**
 * Vehicle visual layer, separated from the Vehicle physics.
 *
 * `buildPlaceholder` produces an improved low-poly car built from primitives
 * (body, cabin, bumpers, grille, mirrors, rims, emissive lights) with the wheel
 * pivots the physics drives. `adoptGltf` maps a GLB vehicle onto the same
 * handles by node-name conventions (see src/assets/README.md), so a real model
 * can be dropped in without touching the physics. The vehicle's forward axis is
 * +Z (the front of the car), matching the world road convention.
 */
export class VehicleModel {
  static buildPlaceholder(config: VehicleConfig, style: VehicleStyle): VehicleModelResult {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: style.bodyColor,
      metalness: 0.55,
      roughness: 0.3,
    });
    const skirtMat = new THREE.MeshStandardMaterial({
      color: shade(style.bodyColor, 0.45),
      metalness: 0.4,
      roughness: 0.7,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: style.glassColor,
      metalness: 0.85,
      roughness: 0.08,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const tireMat = new THREE.MeshStandardMaterial({ color: style.wheelColor, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.85, roughness: 0.25 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x161a1f, roughness: 0.5, metalness: 0.5 });
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xbfefff,
      emissiveIntensity: 1.5,
    });
    const brakeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff2222,
      emissiveIntensity: 0.8,
    });

    const halfW = config.width * 0.5;
    const halfL = config.length * 0.5;
    const meshes: THREE.Object3D[] = [];

    // Lower body + skirt so the car reads as a solid mass with a beltline.
    const lower = new THREE.Mesh(new THREE.BoxGeometry(config.width, 0.34, config.length), skirtMat);
    lower.position.y = 0.42;
    meshes.push(lower);

    const body = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.04, 0.4, config.length - 0.1), bodyMat);
    body.position.y = 0.78;
    meshes.push(body);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.06, 0.14, 1.5), bodyMat);
    hood.position.set(0, 1.0, halfL - 0.75);
    meshes.push(hood);

    const trunk = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.06, 0.16, 1.1), bodyMat);
    trunk.position.set(0, 0.98, -halfL + 0.6);
    meshes.push(trunk);

    // Cabin with angled windshield.
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.5, 0.46, 1.9), glassMat);
    cabin.position.set(0, 1.18, -0.1);
    meshes.push(cabin);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.46, 0.4, 0.05), glassMat);
    windshield.position.set(0, 1.24, 0.72);
    windshield.rotation.x = 0.42;
    meshes.push(windshield);
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.46, 0.36, 0.05), glassMat);
    rearGlass.position.set(0, 1.22, -1.0);
    rearGlass.rotation.x = -0.42;
    meshes.push(rearGlass);
    for (const sideX of [-halfW + 0.1, halfW - 0.1]) {
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 1.7), glassMat);
      sideGlass.position.set(sideX, 1.2, -0.1);
      meshes.push(sideGlass);
    }

    // Bumpers + grille.
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.15, 0.3, 0.16), trimMat);
    frontBumper.position.set(0, 0.5, halfL - 0.04);
    meshes.push(frontBumper);
    const rearBumper = frontBumper.clone();
    rearBumper.position.z = -halfL + 0.04;
    meshes.push(rearBumper);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(config.width * 0.5, 0.24, 0.06), trimMat);
    grille.position.set(0, 0.62, halfL - 0.02);
    meshes.push(grille);

    // Lights.
    for (const lightX of [-0.55, 0.55]) {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.05), headlightMat);
      headlight.position.set(lightX, 0.78, halfL - 0.02);
      meshes.push(headlight);
      const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.05), brakeMat);
      taillight.position.set(lightX, 0.86, -halfL + 0.02);
      meshes.push(taillight);
    }

    // Mirrors.
    for (const mirrorX of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), bodyMat);
      mirror.position.set(mirrorX * (halfW + 0.12), 1.06, 0.35);
      meshes.push(mirror);
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.12), trimMat);
      stalk.position.set(mirrorX * halfW, 1.04, 0.35);
      meshes.push(stalk);
    }

    const frontSteerGroups: THREE.Group[] = [];
    const wheelSpinGroups: THREE.Group[] = [];

    const wheels: Array<[number, number, boolean]> = [
      [-halfW + 0.28, halfL - 0.6, true],
      [halfW - 0.28, halfL - 0.6, true],
      [-halfW + 0.28, -halfL + 0.6, false],
      [halfW - 0.28, -halfL + 0.6, false],
    ];

    for (const [x, z, isFront] of wheels) {
      const spinGroup = new THREE.Group();
      spinGroup.position.set(0, config.wheelRadius, 0);

      const tire = new THREE.Mesh(new THREE.CylinderGeometry(config.wheelRadius, config.wheelRadius, 0.26, 14), tireMat);
      tire.rotation.z = Math.PI / 2;
      spinGroup.add(tire);
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(config.wheelRadius * 0.55, config.wheelRadius * 0.55, 0.27, 10),
        rimMat,
      );
      rim.rotation.z = Math.PI / 2;
      spinGroup.add(rim);

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

    const driverDoorGroup = buildDriverDoor(config, bodyMat);
    meshes.push(driverDoorGroup);

    for (const mesh of meshes) {
      mesh.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          (object as THREE.Mesh).castShadow = true;
        }
      });
    }

    return {
      meshes,
      frontSteerGroups,
      wheelSpinGroups,
      headlightMaterials: [headlightMat, headlightMat],
      brakeLightMaterials: [brakeMat, brakeMat],
      driverDoorGroup,
    };
  }

  /** Premium prototype car with a distinct identity (no real manufacturer). */
  static buildSupercar(): VehicleModelResult {
    const config = SUPERCAR_CONFIG;
    const style = SUPERCAR_STYLE;

    const paint = new THREE.MeshPhysicalMaterial({
      color: style.bodyColor,
      metalness: 0.75,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const darkTrim = new THREE.MeshStandardMaterial({ color: 0x10131a, roughness: 0.4, metalness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: style.glassColor,
      metalness: 0.9,
      roughness: 0.05,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const tireMat = new THREE.MeshStandardMaterial({ color: style.wheelColor, roughness: 0.95 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xcfd6df, metalness: 0.95, roughness: 0.18 });
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xbfefff,
      emissiveIntensity: 2,
    });
    const brakeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff1a1a,
      emissiveIntensity: 1.2,
    });

    const halfW = config.width * 0.5;
    const halfL = config.length * 0.5;
    const meshes: THREE.Object3D[] = [];

    // Wide low body with a tapered nose and raised tail.
    const body = new THREE.Mesh(new THREE.BoxGeometry(config.width, 0.34, config.length), paint);
    body.position.y = 0.5;
    meshes.push(body);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.3, 0.2, 1.1), paint);
    nose.position.set(0, 0.68, halfL - 0.45);
    meshes.push(nose);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.2, 0.24, 0.9), paint);
    tail.position.set(0, 0.66, -halfL + 0.4);
    meshes.push(tail);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.7, 0.34, 1.8), glassMat);
    canopy.position.set(0, 0.92, -0.05);
    meshes.push(canopy);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.64, 0.3, 0.05), glassMat);
    windshield.position.set(0, 0.98, 0.66);
    windshield.rotation.x = 0.5;
    meshes.push(windshield);

    for (const sideX of [-halfW + 0.12, halfW - 0.12]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, config.length - 0.3), darkTrim);
      blade.position.set(sideX, 0.72, 0);
      meshes.push(blade);
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 1.6), glassMat);
      sideGlass.position.set(sideX, 0.84, -0.05);
      meshes.push(sideGlass);
    }

    // Splitter, side skirts and rear diffuser.
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(config.width, 0.08, 0.5), darkTrim);
    splitter.position.set(0, 0.28, halfL - 0.05);
    meshes.push(splitter);
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(config.width, 0.12, 0.4), darkTrim);
    diffuser.position.set(0, 0.3, -halfL + 0.02);
    meshes.push(diffuser);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.4, 0.06, 0.4), darkTrim);
    spoiler.position.set(0, 0.98, -halfL + 0.15);
    meshes.push(spoiler);
    const wingEnd = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.4), darkTrim);
    wingEnd.position.set(-halfW + 0.2, 0.92, -halfL + 0.15);
    meshes.push(wingEnd);
    const wingEndR = wingEnd.clone();
    wingEndR.position.x = halfW - 0.2;
    meshes.push(wingEndR);

    // Blade headlight strips + taillight bar.
    for (const lightX of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.06), headlightMat);
      head.position.set(lightX * (halfW - 0.45), 0.78, halfL - 0.02);
      meshes.push(head);
    }
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(config.width - 0.5, 0.08, 0.05), brakeMat);
    tailBar.position.set(0, 0.82, -halfL + 0.02);
    meshes.push(tailBar);

    const frontSteerGroups: THREE.Group[] = [];
    const wheelSpinGroups: THREE.Group[] = [];
    const wheelSpecs: Array<[number, number, boolean]> = [
      [-halfW + 0.3, halfL - 0.55, true],
      [halfW - 0.3, halfL - 0.55, true],
      [-halfW + 0.3, -halfL + 0.55, false],
      [halfW - 0.3, -halfL + 0.55, false],
    ];
    for (const [x, z, isFront] of wheelSpecs) {
      const spinGroup = new THREE.Group();
      spinGroup.position.set(0, config.wheelRadius, 0);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(config.wheelRadius, config.wheelRadius, 0.3, 16), tireMat);
      tire.rotation.z = Math.PI / 2;
      spinGroup.add(tire);
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(config.wheelRadius * 0.6, config.wheelRadius * 0.6, 0.32, 12),
        rimMat,
      );
      rim.rotation.z = Math.PI / 2;
      spinGroup.add(rim);
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

    const driverDoorGroup = buildDriverDoor(config, paint);
    meshes.push(driverDoorGroup);

    for (const mesh of meshes) {
      mesh.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          (object as THREE.Mesh).castShadow = true;
        }
      });
    }

    return {
      meshes,
      frontSteerGroups,
      wheelSpinGroups,
      headlightMaterials: [headlightMat, headlightMat],
      brakeLightMaterials: [brakeMat, brakeMat],
      driverDoorGroup,
    };
  }

  /**
   * Maps a GLB vehicle onto the physics handles by node-name convention.
   * Missing nodes are simply skipped; the returned arrays can be empty.
   */
  static adoptGltf(gltf: GLTF, nodeMap: VehicleNodeMap = {}): VehicleParts {
    const root = gltf.scene;
    const frontSteerGroups: THREE.Group[] = [];
    const wheelSpinGroups: THREE.Group[] = [];
    const headlightMaterials: THREE.MeshStandardMaterial[] = [];
    const taillightMaterials: THREE.MeshStandardMaterial[] = [];

    const findNodes = (substrings: readonly string[] | undefined): THREE.Object3D[] => {
      const found: THREE.Object3D[] = [];
      if (!substrings) return found;
      for (const substring of substrings) {
        for (const match of findByNameSubstring(root, substring)) found.push(match);
      }
      return found;
    };

    for (const node of findNodes(nodeMap.steerWheels)) {
      frontSteerGroups.push(node as THREE.Group);
      wheelSpinGroups.push(new THREE.Group());
    }
    for (const node of findNodes(nodeMap.spinWheels)) {
      void node;
      wheelSpinGroups.push(new THREE.Group());
    }
    for (const node of findNodes(nodeMap.headlightNodes)) {
      const material = (node as THREE.Mesh).material;
      if (Array.isArray(material)) headlightMaterials.push(...(material as THREE.MeshStandardMaterial[]));
      else headlightMaterials.push(material as THREE.MeshStandardMaterial);
    }
    for (const node of findNodes(nodeMap.taillightNodes)) {
      const material = (node as THREE.Mesh).material;
      if (Array.isArray(material)) taillightMaterials.push(...(material as THREE.MeshStandardMaterial[]));
      else taillightMaterials.push(material as THREE.MeshStandardMaterial);
    }
    const doorNode = findNodes(nodeMap.driverDoorNodes)[0] ?? null;

    return {
      frontSteerGroups,
      wheelSpinGroups,
      headlightMaterials,
      brakeLightMaterials: taillightMaterials,
      driverDoorGroup: doorNode as THREE.Group | null,
    };
  }
}

/**
 * "Aurora GT" — the premium prototype car used as the Heist's target vehicle.
 * Fast and distinct from the starter sedan; built with `Vehicle.supercar()`.
 */
export const SUPERCAR_CONFIG: VehicleConfig = {
  name: "Aurora GT",
  maxForwardSpeed: 22,
  maxReverseSpeed: 8,
  acceleration: 12,
  braking: 26,
  reverseAcceleration: 8,
  naturalDeceleration: 3,
  steeringStrength: 2.6,
  maxSteerAngle: 0.55,
  steerSmoothing: 10,
  handbrakeStrength: 34,
  length: 4.6,
  width: 2.0,
  height: 1.15,
  wheelRadius: 0.32,
};

export const SUPERCAR_STYLE: VehicleStyle = {
  bodyColor: 0xc2262e,
  glassColor: 0x0a0e14,
  wheelColor: 0x0a0a0c,
};

/**
 * Left-front door as a hinge pivot + panel, so `Vehicle.updateDoor` can swing it
 * outward. The hinge sits at the A-pillar; the panel extends rearward and opens
 * toward -X (the driver side) with a positive rotation about +Y.
 */
function buildDriverDoor(config: VehicleConfig, material: THREE.Material): THREE.Group {
  const hinge = new THREE.Group();
  hinge.position.set(-config.width * 0.5, 0.85, config.length * 0.5 - 1.25);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 1.3), material);
  panel.position.set(0, 0, -0.6);
  panel.castShadow = true;
  hinge.add(panel);
  return hinge;
}

function shade(color: number, factor: number): number {
  const c = new THREE.Color(color);
  c.multiplyScalar(factor);
  return c.getHex();
}

function findByNameSubstring(root: THREE.Object3D, substring: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.name && object.name.toLowerCase().includes(substring.toLowerCase())) out.push(object);
  });
  return out;
}
