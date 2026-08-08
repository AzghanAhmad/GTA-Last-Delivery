import * as THREE from "three";
import type { WorldCollision } from "./WorldCollision";
import type { BuildingManager } from "./BuildingManager";
import type { PropFactory } from "./Props";
import { mat, box, solid } from "./BuildKit";
import { NeonSign } from "./NeonSign";
import type { WorldLocation } from "./WorldLocations";

/**
 * Warehouse district: a darker industrial block with large warehouses, loading
 * docks, container stacks, crates, floodlight poles and fences. Distinct look
 * from the central city; the future Heist may use this area.
 */
export class WarehouseDistrict {
  constructor(
    scene: THREE.Scene,
    collision: WorldCollision,
    buildings: BuildingManager,
    props: PropFactory,
    location: WorldLocation,
  ) {
    const x = location.x;
    const z = location.z;

    const warehouseMat = buildings.facadeMaterial("warehouse");
    const roofMat = buildings.roofMaterial;
    const dockMat = mat(0x0c1015, 0.9);

    const specs = [
      { wx: x - 45, wz: z - 25, w: 44, d: 24, h: 12 },
      { wx: x - 20, wz: z + 18, w: 48, d: 22, h: 10 },
      { wx: x + 45, wz: z - 32, w: 30, d: 20, h: 9 },
    ] as const;

    for (const spec of specs) {
      const building = box(spec.w, spec.h, spec.d, warehouseMat, spec.wx, 0, spec.wz);
      scene.add(building);
      solid(collision, spec.wx, spec.wz, spec.w, spec.d, spec.h);
      const roof = box(spec.w, 0.6, spec.d, roofMat, spec.wx, spec.h, spec.wz);
      scene.add(roof);
      for (let i = -2; i <= 2; i++) {
        const bay = box(3.4, 3.6, 0.6, dockMat, spec.wx + i * 6.4, 0, spec.wz - spec.d * 0.5 - 0.2);
        scene.add(bay);
      }
    }

    props.containers([
      { x: x - 30, z: z + 42, yaw: 0 },
      { x: x - 23, z: z + 42, yaw: 0 },
      { x: x - 16, z: z + 42, yaw: 0 },
      { x: x - 30, z: z + 36, yaw: 0 },
      { x: x + 30, z: z + 30, yaw: Math.PI / 2 },
      { x: x + 36, z: z + 30, yaw: Math.PI / 2 },
      { x: x + 42, z: z + 30, yaw: Math.PI / 2 },
      { x: x + 30, z: z + 24, yaw: Math.PI / 2 },
      { x: x + 55, z: z + 10, yaw: 0 },
      { x: x + 61, z: z + 10, yaw: 0 },
    ]);

    props.crates([
      { x: x - 5, z: z + 28, yaw: 0 },
      { x: x + 1, z: z + 28, yaw: Math.PI / 2 },
      { x: x - 5, z: z + 21, yaw: 0.4 },
      { x: x + 14, z: z + 30, yaw: 0 },
      { x: x + 20, z: z + 30, yaw: Math.PI / 3 },
      { x: x - 60, z: z + 20, yaw: 0 },
      { x: x - 66, z: z + 20, yaw: Math.PI / 2 },
    ]);

    props.dumpsters([
      { x: x - 52, z: z - 12, yaw: 0 },
      { x: x + 50, z: z + 38, yaw: 0 },
      { x: x + 12, z: z + 42, yaw: Math.PI / 2 },
      { x: x - 44, z: z + 34, yaw: 0 },
    ]);

    const floodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfe8ff, emissiveIntensity: 1.8 });
    floodMat.userData.nightGlow = 1.8;
    for (const [lx, lz] of [
      [x - 60, z + 8],
      [x + 60, z - 40],
    ] as const) {
      const pole = box(0.3, 9, 0.3, mat(0x2a3038, 0.6, 0.5), lx, 0, lz);
      scene.add(pole);
      solid(collision, lx, lz, 0.3, 0.3, 9);
      const head = box(1.2, 0.5, 0.7, floodMat, lx, 9, lz);
      scene.add(head);
    }
    const floodLight = new THREE.PointLight(0xbfe8ff, 40, 30, 2);
    floodLight.userData.nightLight = 40;
    floodLight.position.set(x - 60, 8.5, z + 8);
    scene.add(floodLight);

    const sign = NeonSign.build({ text: "MOTION FREIGHT", color: 0x7fe0ff, width: 16, emissiveIntensity: 1.3 });
    sign.position.set(x - 45, 11, z - 25 - 12.5);
    scene.add(sign);

    props.fence(x - 58, z + 44, x + 58, z + 44, 1.6);
    props.fence(x - 58, z + 44, x - 58, z - 44, 1.6);
    props.barrier(x - 58, z - 44, Math.PI / 2, 10);

    props.acUnits([
      { x: x - 20, z: z + 18, yaw: 0 },
      { x: x + 45, z: z - 32, yaw: 0 },
    ]);
  }
}
