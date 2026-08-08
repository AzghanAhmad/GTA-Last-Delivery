import * as THREE from "three";
import type { WorldCollision } from "./WorldCollision";

/** Tiny shared helpers so district builders stay compact. */

export function mat(color: number, roughness = 0.8, metalness = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** Creates a box mesh centered at (x, y, z) with its base at y (bottom). */
export function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h * 0.5, z);
  return mesh;
}

/** Registers a solid footprint in the world collision registry. */
export function solid(collision: WorldCollision, x: number, z: number, w: number, d: number, h: number): void {
  collision.addBox(x - w * 0.5, z - d * 0.5, x + w * 0.5, z + d * 0.5, h);
}

/** Adds an emissive light fixture (plane or box) that never casts a real light. */
export function emissiveBox(
  w: number,
  h: number,
  d: number,
  color: number,
  intensity: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  return box(
    w,
    h,
    d,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.5,
    }),
    x,
    y,
    z,
  );
}
