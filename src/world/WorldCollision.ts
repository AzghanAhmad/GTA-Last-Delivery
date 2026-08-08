import * as THREE from "three";

/**
 * Centralized world collision registry.
 *
 * Every solid object in the city (buildings, props, water, boundaries) is
 * registered here as an axis-aligned Box3. Player, Vehicle, VehicleManager,
 * Police and PoliceManager all receive the same readonly array so collision
 * data stays in one place and is never duplicated.
 */
export class WorldCollision {
  private readonly list: THREE.Box3[] = [];

  get colliders(): readonly THREE.Box3[] {
    return this.list;
  }

  /** Registers a footprint box on the ground. `height` sets the top. */
  addBox(minX: number, minZ: number, maxX: number, maxZ: number, height = 6): THREE.Box3 {
    const box = new THREE.Box3(
      new THREE.Vector3(minX, 0, minZ),
      new THREE.Vector3(maxX, height, maxZ),
    );
    this.list.push(box);
    return box;
  }

  /** Registers an object's world-space bounds as a solid box. */
  addObject(object: THREE.Object3D, height = 6): THREE.Box3 {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    box.min.y = 0;
    box.max.y = height;
    this.list.push(box);
    return box;
  }

  /** Adds the four invisible world-boundary walls. */
  addWorldBoundary(half: number, thickness: number, height = 10): void {
    const e = half - thickness;
    this.addBox(-half, -half - thickness, half, -e, height); // north
    this.addBox(-half, e, half, half + thickness, height); // south
    this.addBox(-half - thickness, -half, -e, half, height); // west
    this.addBox(e, -half, half + thickness, half, height); // east
  }
}
