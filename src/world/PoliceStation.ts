import * as THREE from "three";
import type { WorldCollision } from "./WorldCollision";
import type { BuildingManager } from "./BuildingManager";
import type { PropFactory } from "./Props";
import { mat, box, solid, emissiveBox } from "./BuildKit";
import { NeonSign } from "./NeonSign";
import type { WorldLocation } from "./WorldLocations";

/**
 * Police station: a recognizable main building with a POLICE sign, a south
 * wing, a small front parking lot with parked police cruisers and an entrance
 * light. No interior; instantly readable from the main road to the west.
 */
export class PoliceStation {
  constructor(
    scene: THREE.Scene,
    collision: WorldCollision,
    buildings: BuildingManager,
    props: PropFactory,
    location: WorldLocation,
  ) {
    const x = location.x;
    const z = location.z;

    const policeMat = buildings.facadeMaterial("police");
    const roofMat = buildings.roofMaterial;
    const darkMat = mat(0x11151b, 0.9);
    const glassMat = mat(0x0c1420, 0.2, 0.8);

    const main = box(22, 8, 16, policeMat, x, 0, z);
    scene.add(main);
    solid(collision, x, z, 22, 16, 8);
    const mainRoof = box(23, 0.6, 17, roofMat, x, 8, z);
    scene.add(mainRoof);

    const wing = box(15, 6, 13, policeMat, x + 6, 0, z + 13);
    scene.add(wing);
    solid(collision, x + 6, z + 13, 15, 13, 6);

    const doorRecess = box(1.8, 3.2, 0.6, darkMat, x - 9.5, 0, z);
    scene.add(doorRecess);
    const door = box(1.4, 2.8, 0.2, glassMat, x - 9.2, 0.2, z);
    scene.add(door);

    const accent = emissiveBox(22.5, 0.5, 0.4, 0x2266ff, 1.4, x, 6.2, z);
    scene.add(accent);

    const sign = NeonSign.build({ text: "POLICE", color: 0x6ea8ff, width: 11, emissiveIntensity: 1.5 });
    sign.position.set(x - 10.6, 6.4, z);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);

    const light = new THREE.PointLight(0xcfe0ff, 45, 24, 2);
    light.position.set(x - 9, 3.4, z);
    scene.add(light);

    props.acUnits([
      { x: x + 4, z: z - 2, yaw: 0 },
      { x: x - 4, z: z - 3, yaw: 0 },
      { x: x + 6, z: z + 15, yaw: 0 },
    ]);

    const cruisers: Array<[number, number, number]> = [
      [0xe8eaee, x - 6.5, z - 10],
      [0xe8eaee, x - 6.5, z - 2],
      [0xe8eaee, x - 6.5, z + 6],
    ];
    for (const [color, cx, cz] of cruisers) {
      props.parkCar(cx, cz, Math.PI / 2, color);
    }
    props.parkCar(x + 9, z - 12, 0, 0x2a3f5c);
    props.parkCar(x + 9, z - 4, 0, 0x5a3a3a);

    props.bollards([
      { x: x - 12, z: z - 14, yaw: 0 },
      { x: x - 12, z: z + 12, yaw: 0 },
      { x: x + 14, z: z + 20, yaw: 0 },
      { x: x + 14, z: z - 14, yaw: 0 },
    ]);
  }
}
