import * as THREE from "three";
import { MaterialManager } from "../core/MaterialManager";

export interface VegetationSpot {
  x: number;
  z: number;
  /** Uniform scale, so a few street trees can grow taller near plazas. */
  scale: number;
}

export interface VegetationDefs {
  trees: VegetationSpot[];
  bushes: VegetationSpot[];
}

/**
 * Low-poly city vegetation.
 *
 * Trees are a trunk plus two stacked foliage blobs, built as InstancedMesh so
 * the whole tree population stays cheap. Bushes reuse the same foliage
 * instancing as flattened blobs. Everything is generated from procedural
 * geometry only (no external assets), keeping the draw-call and VRAM budget
 * friendly for the target hardware.
 */
export class Vegetation {
  private readonly scene: THREE.Scene;
  private readonly materials: MaterialManager;

  constructor(scene: THREE.Scene, materials = new MaterialManager()) {
    this.scene = scene;
    this.materials = materials;
  }

  build(defs: VegetationDefs): void {
    this.buildTrees(defs.trees);
    this.buildBushes(defs.bushes);
  }

  private buildTrees(spots: readonly VegetationSpot[]): void {
    if (spots.length === 0) return;

    const trunkMat = this.materials.standard("vegTrunkMat", {
      color: 0x3b2f26,
      roughness: 1,
      metalness: 0,
    });
    const leafMat = this.materials.standard("vegLeafMat", {
      color: 0x1d3a24,
      roughness: 1,
      metalness: 0,
      emissive: 0x0a1c10,
      emissiveIntensity: 0.12,
    });
    leafMat.userData.nightGlow = 0.12;

    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 2.3, 6);
    const lowerGeo = new THREE.IcosahedronGeometry(1.15, 1);
    const upperGeo = new THREE.IcosahedronGeometry(0.85, 1);

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const lowers = new THREE.InstancedMesh(lowerGeo, leafMat, spots.length);
    const uppers = new THREE.InstancedMesh(upperGeo, leafMat, spots.length);
    trunks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    lowers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    uppers.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const s = spot.scale;

      pos.set(spot.x, 1.15 * s, spot.z);
      m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(s, 1, s));
      trunks.setMatrixAt(i, m);

      pos.set(spot.x, 2.9 * s, spot.z);
      m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(1.25 * s, 1.05 * s, 1.25 * s));
      lowers.setMatrixAt(i, m);

      pos.set(spot.x, 4.1 * s, spot.z);
      m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(0.95 * s, 0.9 * s, 0.95 * s));
      uppers.setMatrixAt(i, m);
    }

    for (const mesh of [trunks, lowers, uppers]) {
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
  }

  private buildBushes(spots: readonly VegetationSpot[]): void {
    if (spots.length === 0) return;

    const bushMat = this.materials.standard("vegBushMat", {
      color: 0x1f4227,
      roughness: 1,
      metalness: 0,
      emissive: 0x0c2012,
      emissiveIntensity: 0.12,
    });
    bushMat.userData.nightGlow = 0.12;

    const geo = new THREE.IcosahedronGeometry(0.7, 1);
    const mesh = new THREE.InstancedMesh(geo, bushMat, spots.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.castShadow = true;

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      pos.set(s.x, 0.45, s.z);
      m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(1, 0.75, 1));
      mesh.setMatrixAt(i, m);
    }
    this.scene.add(mesh);
  }
}
