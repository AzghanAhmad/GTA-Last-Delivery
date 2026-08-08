import * as THREE from "three";
import type { WorldCollision } from "./WorldCollision";
import type { BuildingManager } from "./BuildingManager";
import type { PropFactory } from "./Props";
import { mat, box, solid, emissiveBox } from "./BuildKit";
import { NeonSign } from "./NeonSign";
import type { WorldLocation } from "./WorldLocations";

/**
 * Docks: the future mission's final delivery point. A dark waterfront block
 * with warehouses, container stacks, a quay wall, gantry cranes, industrial
 * lamps and road access from the north and west. Water is added by City; here
 * we build everything up to the water's edge.
 */
export class Docks {
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
    const concreteMat = mat(0x2c323a, 0.9);
    const steelMat = mat(0x222a33, 0.5, 0.7);

    const w1 = box(44, 11, 20, warehouseMat, x - 48, 0, z - 30);
    scene.add(w1);
    solid(collision, x - 48, z - 30, 44, 20, 11);
    scene.add(box(44, 0.6, 20, roofMat, x - 48, 11, z - 30));

    const w2 = box(36, 9, 18, warehouseMat, x + 22, 0, z - 46);
    scene.add(w2);
    solid(collision, x + 22, z - 46, 36, 18, 9);
    scene.add(box(36, 0.6, 18, roofMat, x + 22, 9, z - 46));

    const dockSurface = box(180, 0.3, 42, mat(0x1a1f26, 0.8), x - 10, -0.15, z + 45);
    scene.add(dockSurface);

    const quaySouth = box(180, 1.5, 1.2, concreteMat, x - 10, 0, z + 66.4);
    scene.add(quaySouth);
    const quayEast = box(1.2, 1.5, 140, concreteMat, x + 88, 0, z - 55);
    scene.add(quayEast);

    const bollardSpots: Array<{ x: number; z: number; yaw: number }> = [];
    for (let i = 0; i < 9; i++) {
      bollardSpots.push({ x: x - 70 + i * 16, z: z + 65.5, yaw: 0 });
    }
    for (let i = 0; i < 5; i++) {
      bollardSpots.push({ x: x + 87, z: z - 85 + i * 32, yaw: 0 });
    }
    props.bollards(bollardSpots);

    props.containers([
      { x: x - 60, z: z + 20, yaw: 0 },
      { x: x - 53, z: z + 20, yaw: 0 },
      { x: x - 46, z: z + 20, yaw: 0 },
      { x: x - 60, z: z + 14, yaw: 0 },
      { x: x - 40, z: z - 8, yaw: Math.PI / 2 },
      { x: x - 40, z: z - 14, yaw: Math.PI / 2 },
      { x: x + 40, z: z + 4, yaw: 0 },
      { x: x + 47, z: z + 4, yaw: 0 },
      { x: x + 54, z: z + 4, yaw: 0 },
    ]);
    props.crates([
      { x: x - 20, z: z + 12, yaw: 0 },
      { x: x - 14, z: z + 12, yaw: Math.PI / 2 },
      { x: x + 30, z: z + 14, yaw: 0.3 },
      { x: x + 10, z: z + 30, yaw: 0 },
    ]);
    props.dumpsters([
      { x: x - 70, z: z + 40, yaw: 0 },
      { x: x + 60, z: z + 34, yaw: Math.PI / 2 },
    ]);

    this.buildCrane(scene, collision, x - 62, z - 60, -Math.PI / 2, steelMat);
    this.buildCrane(scene, collision, x + 30, z - 70, Math.PI, steelMat);

    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe9bf, emissiveIntensity: 1.8 });
    lampMat.userData.nightGlow = 1.8;
    for (const [lx, lz] of [
      [x - 76, z + 34],
      [x + 64, z + 34],
    ] as const) {
      const pole = box(0.3, 10, 0.3, steelMat, lx, 0, lz);
      scene.add(pole);
      solid(collision, lx, lz, 0.3, 0.3, 10);
      scene.add(box(1.6, 0.5, 0.7, lampMat, lx, 10, lz));
    }
    const pierLight = new THREE.PointLight(0xffe9bf, 50, 34, 2);
    pierLight.userData.nightLight = 50;
    pierLight.position.set(x - 76, 9.5, z + 34);
    scene.add(pierLight);

    const sign = NeonSign.build({ text: "DOCKS", color: 0x5cf0c8, width: 15, emissiveIntensity: 1.5 });
    sign.position.set(x + 22, 7.6, z - 46 - 9.1);
    scene.add(sign);

    props.cones([
      { x: x - 88, z: z + 62, yaw: 0 },
      { x: x - 88, z: z + 56, yaw: 0 },
      { x: x - 80, z: z + 64, yaw: 0 },
    ]);
  }

  private buildCrane(
    scene: THREE.Scene,
    collision: WorldCollision,
    x: number,
    z: number,
    yaw: number,
    steelMat: THREE.Material,
  ): void {
    const group = new THREE.Group();
    const legMat = steelMat;

    for (const side of [-1, 1]) {
      const leg = box(0.7, 16, 0.7, legMat, 0, 0, side * 3.2);
      group.add(leg);
    }
    const trackA = box(7.4, 0.6, 1.0, legMat, 0, 0.3, -3.2);
    const trackB = box(7.4, 0.6, 1.0, legMat, 0, 0.3, 3.2);
    group.add(trackA, trackB);

    const boom = box(0.6, 0.9, 20, legMat, 0, 15.6, -2.4);
    group.add(boom);
    const cabin = box(2.4, 2.2, 2.2, mat(0x2a3540, 0.5, 0.6), 0, 15, 4.4);
    group.add(cabin);
    const cable = box(0.12, 6, 0.12, legMat, 0, 12, -9);
    group.add(cable);
    const hook = emissiveBox(0.9, 0.5, 0.9, 0xff3b3b, 1.2, 0, 9, -9);
    group.add(hook);

    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    solid(collision, x, z, 9, 9, 16);
  }
}
