import * as THREE from "three";

/**
 * In-world beacon marking the current mission objective.
 *
 * A vertical translucent beam with a flat spinning ring and a cone on top, so
 * it reads at a distance in the neon night city. Built from a handful of
 * unlit (MeshBasic) meshes, so it stays cheap on the target hardware. Game
 * moves it on every objective change and hides it when there is no objective.
 */
export class MissionMarker {
  readonly group: THREE.Group;

  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly accentMaterial: THREE.MeshBasicMaterial;
  private readonly ring: THREE.Mesh;

  constructor(scene: THREE.Scene, color: number) {
    this.group = new THREE.Group();

    this.beamMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    });
    this.accentMaterial = new THREE.MeshBasicMaterial({ color });

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 12, 12, 1, true), this.beamMaterial);
    beam.position.y = 6;
    this.group.add(beam);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 28), this.accentMaterial);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.4;
    this.group.add(this.ring);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 5), this.accentMaterial);
    cone.position.y = 12.9;
    this.group.add(cone);

    this.group.visible = false;
    scene.add(this.group);
  }

  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }

  setColor(color: number): void {
    this.beamMaterial.color.setHex(color);
    this.accentMaterial.color.setHex(color);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Spins the ground ring; call every frame while the marker is visible. */
  update(delta: number): void {
    if (!this.group.visible) return;
    this.ring.rotation.z += delta * 1.4;
  }
}
