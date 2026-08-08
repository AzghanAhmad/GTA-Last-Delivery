import * as THREE from "three";
import type { WorldCollision } from "./WorldCollision";
import type { BuildingManager } from "./BuildingManager";
import type { PropFactory } from "./Props";
import { mat, box, solid, emissiveBox } from "./BuildKit";
import { NeonSign } from "./NeonSign";
import type { WorldLocation } from "./WorldLocations";

/**
 * Gas station: canopy with bright underside, fuel pumps, a small convenience
 * store ("NEON 24"), a parking area and one canopy PointLight. No fuel
 * gameplay; purely a landmark district for now.
 */
export class GasStation {
  constructor(
    scene: THREE.Scene,
    collision: WorldCollision,
    buildings: BuildingManager,
    props: PropFactory,
    location: WorldLocation,
  ) {
    const x = location.x;
    const z = location.z;

    const canopyMat = mat(0x232a33, 0.5, 0.6);
    const underMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff3d6,
      emissiveIntensity: 1.6,
      roughness: 0.6,
    });
    underMat.userData.nightGlow = 1.6;

    const canopy = box(18, 0.7, 11, canopyMat, x, 5.2, z);
    scene.add(canopy);
    const under = box(17.4, 0.1, 10.4, underMat, x, 5.15, z);
    scene.add(under);
    solid(collision, x, z, 18, 11, 5.2);

    for (const [px, pz] of [
      [-6.5, -4.5],
      [6.5, -4.5],
      [-6.5, 4.5],
      [6.5, 4.5],
    ] as const) {
      const pole = box(0.35, 5.2, 0.35, canopyMat, x + px, 0, z + pz);
      scene.add(pole);
      solid(collision, x + px, z + pz, 0.35, 0.35, 5.2);
    }

    for (const [px, pz] of [
      [-3, 2.5],
      [3, 2.5],
      [-3, -2.5],
      [3, -2.5],
    ] as const) {
      const pump = box(1.1, 1.5, 0.7, mat(0x2c343e, 0.6, 0.4), x + px, 0, z + pz);
      scene.add(pump);
      solid(collision, x + px, z + pz, 1.1, 0.7, 1.5);
      const screen = emissiveBox(0.9, 0.3, 0.05, 0xbfefff, 1.4, x + px, 1.1, z + pz);
      scene.add(screen);
    }

    const light = new THREE.PointLight(0xfff3d6, 60, 26, 2);
    light.userData.nightLight = 60;
    light.position.set(x, 4.6, z);
    scene.add(light);

    const storeW = 12;
    const storeD = 8;
    const storeX = x - 15;
    const storeZ = z + 8;
    const store = box(storeW, 6, storeD, buildings.facadeMaterial("shop", 1), storeX, 0, storeZ);
    scene.add(store);
    solid(collision, storeX, storeZ, storeW, storeD, 6);

    const awning = box(storeW + 0.8, 0.2, 2.2, mat(0xcc3344, 0.5), storeX, 3.4, storeZ + storeD * 0.5 + 0.6);
    scene.add(awning);

    const sign = NeonSign.build({ text: "NEON 24", color: 0xff4d6d, width: 9, emissiveIntensity: 1.6 });
    sign.position.set(storeX, 4.4, storeZ + storeD * 0.5 + 0.05);
    scene.add(sign);

    const brand = NeonSign.build({ text: "VOLT", color: 0xffd23a, width: 14, emissiveIntensity: 1.5 });
    brand.position.set(x, 5.6, z - 6);
    scene.add(brand);

    props.parkCar(x - 2, z + 14, Math.PI, 0x3a4a6a);
    props.parkCar(x - 12, z + 15, Math.PI, 0x7a5a3a);
    props.bollards([
      { x: x - 6, z: z - 7.5, yaw: 0 },
      { x: x + 6, z: z - 7.5, yaw: 0 },
      { x: x - 6, z: z + 7.5, yaw: 0 },
      { x: x + 6, z: z + 7.5, yaw: 0 },
    ]);
  }
}
