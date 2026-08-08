import * as THREE from "three";
import type { WorldCollision } from "./WorldCollision";
import type { BuildingManager } from "./BuildingManager";
import type { PropFactory } from "./Props";
import { mat, box, solid, emissiveBox } from "./BuildKit";
import { NeonSign } from "./NeonSign";
import type { WorldLocation } from "./WorldLocations";

/**
 * Central landmark: "NOVA" neon tower.
 *
 * A stacked, tapering tower built from the landmark facade material with an
 * emissive crown, an antenna beacon and a big NEON NOVA sign sprite. It is
 * visible from several streets and acts as the player's reference point. One
 * PointLight keeps it affordable.
 */
export class Landmark {
  constructor(
    scene: THREE.Scene,
    collision: WorldCollision,
    buildings: BuildingManager,
    props: PropFactory,
    location: WorldLocation,
  ) {
    const x = location.x;
    const z = location.z;

    const towerMat = buildings.facadeMaterial("landmark");
    const roofMat = buildings.roofMaterial;

    const baseW = 13;
    const tiers: Array<{ w: number; h: number; y: number }> = [
      { w: baseW, h: 10, y: 5 },
      { w: 9.5, h: 10, y: 15 },
      { w: 6.5, h: 12, y: 26 },
      { w: 3.8, h: 10, y: 37 },
    ];
    for (const tier of tiers) {
      const t = box(tier.w, tier.h, tier.w, towerMat, x, tier.y, z);
      scene.add(t);
      const cap = box(tier.w + 0.5, 0.7, tier.w + 0.5, roofMat, x, tier.y + tier.h, z);
      scene.add(cap);
    }

    const crownMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x1ee6ff,
      emissiveIntensity: 2,
      roughness: 0.4,
    });
    crownMat.userData.nightGlow = 2;
    for (const [cy, cw] of [
      [29, 4.6],
      [40, 3.0],
    ] as const) {
      const band = box(cw, 1.6, cw, crownMat, x, cy, z);
      scene.add(band);
    }

    const antenna = box(0.5, 8, 0.5, mat(0x2a3240, 0.6, 0.7), x, 47, z);
    scene.add(antenna);
    const beacon = emissiveBox(1.2, 1.2, 1.2, 0xff3b5c, 2.5, x, 51, z);
    scene.add(beacon);

    const light = new THREE.PointLight(0x1ee6ff, 120, 60, 2);
    light.userData.nightLight = 120;
    light.position.set(x, 40, z);
    scene.add(light);

    const sign = NeonSign.buildSprite({ text: "NOVA", color: 0x1ee6ff, width: 30, emissiveIntensity: 1.8 });
    sign.position.set(x, 31, z);
    scene.add(sign);

    const plazaEdge = 10;
    solid(collision, x, z, baseW, baseW, 47);
    for (const [ax, az] of [
      [-plazaEdge, -plazaEdge],
      [plazaEdge, -plazaEdge],
      [-plazaEdge, plazaEdge],
      [plazaEdge, plazaEdge],
    ] as const) {
      props.bench(x + ax * 0.8, z + az * 0.8, Math.atan2(-ax, -az) + Math.PI);
    }
    props.bollards([
      { x: x + plazaEdge, z, yaw: 0 },
      { x: x - plazaEdge, z, yaw: 0 },
      { x, z: z + plazaEdge, yaw: 0 },
      { x, z: z - plazaEdge, yaw: 0 },
    ]);
  }
}
