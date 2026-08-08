import * as THREE from "three";
import type { MissionObjective } from "./MissionObjective";

/**
 * In-world beacon marking the current mission objective.
 *
 * A vertical translucent beam with a flat spinning ring and a cone on top, so
 * it reads at a distance in the neon night city. On top sits an optional label
 * sprite (the objective's short name) and, for delivery zones, a flat ground
 * ring marking the area. Built from a handful of unlit (MeshBasic) meshes plus
 * one sprite, so it stays cheap on the target hardware. Game drives it from the
 * active objective via `setObjective` and animates the spin every frame.
 */
export class MissionMarker {
  readonly group: THREE.Group;

  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly accentMaterial: THREE.MeshBasicMaterial;
  private readonly ring: THREE.Mesh;
  private readonly cone: THREE.Mesh;
  private labelSprite: THREE.Sprite | null = null;
  private deliveryRing: THREE.Mesh | null = null;
  private readonly deliveryRingMaterial: THREE.MeshBasicMaterial;

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

    this.cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 5), this.accentMaterial);
    this.cone.position.y = 12.9;
    this.group.add(this.cone);

    this.deliveryRingMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.group.visible = false;
    scene.add(this.group);
  }

  /** Applies a full objective: position, color, label sprite and delivery ring. */
  setObjective(objective: MissionObjective | null): void {
    if (!objective) {
      this.setVisible(false);
      this.setLabel(null);
      this.setRing(null);
      return;
    }
    this.setPosition(objective.x, objective.z);
    this.setColor(objective.color);
    this.setLabel(objective.label);
    this.setRing(objective.ring ?? null);
    this.setVisible(true);
  }

  setPosition(x: number, z: number): void {
    this.group.position.set(x, 0, z);
  }

  setColor(color: number): void {
    this.beamMaterial.color.setHex(color);
    this.accentMaterial.color.setHex(color);
    this.deliveryRingMaterial.color.setHex(color);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    if (this.labelSprite) this.labelSprite.visible = visible;
    if (this.deliveryRing) this.deliveryRing.visible = visible;
  }

  /** Shows/hides the label sprite above the beacon (null hides it). */
  setLabel(text: string | null): void {
    if (!text) {
      if (this.labelSprite) this.labelSprite.visible = false;
      return;
    }
    if (!this.labelSprite) {
      this.labelSprite = this.makeLabelSprite();
      this.group.add(this.labelSprite);
    }
    this.updateLabelTexture(text);
    this.labelSprite.visible = true;
  }

  /** Shows/hides the flat delivery-zone ring (null hides it). */
  setRing(radius: number | null): void {
    if (!radius) {
      if (this.deliveryRing) this.deliveryRing.visible = false;
      return;
    }
    if (!this.deliveryRing) {
      this.deliveryRing = new THREE.Mesh(new THREE.RingGeometry(1, 1, 40, 1), this.deliveryRingMaterial);
      this.deliveryRing.rotation.x = -Math.PI / 2;
      this.deliveryRing.position.y = 0.06;
      this.group.add(this.deliveryRing);
    }
    this.deliveryRing.geometry.dispose();
    this.deliveryRing.geometry = new THREE.RingGeometry(radius - 0.6, radius, 48, 1);
    this.deliveryRing.visible = true;
  }

  /** Spins the ground ring; call every frame while the marker is visible. */
  update(delta: number): void {
    if (!this.group.visible) return;
    this.ring.rotation.z += delta * 1.4;
  }

  dispose(): void {
    if (this.labelSprite) {
      this.labelSprite.material.map?.dispose();
      this.labelSprite.material.dispose();
    }
  }

  private makeLabelSprite(): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const material = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.y = 14.6;
    sprite.scale.set(7, 1.8, 1);
    sprite.userData.canvas = canvas;
    return sprite;
  }

  private updateLabelTexture(text: string): void {
    if (!this.labelSprite) return;
    const canvas = this.labelSprite.userData.canvas as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#f2f6ff";
    ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
    const texture = this.labelSprite.material.map;
    if (texture) texture.needsUpdate = true;
  }
}
