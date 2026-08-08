import * as THREE from "three";
import type { WorldLocations } from "./WorldLocations";

/**
 * Development-only world markers.
 *
 * Renders a magenta beacon + floating label at each named world location so
 * the layout can be validated at a glance. Replaced by real mission markers
 * later; never created outside dev mode.
 */
export class DebugMarkers {
  constructor(scene: THREE.Scene, locations: WorldLocations) {
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff38ff,
      emissiveIntensity: 2,
      roughness: 0.4,
    });
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 1 });

    for (const [name, location] of Object.entries(locations)) {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 1.6, 10), markerMat);
      beacon.position.set(location.x, 0.8, location.z);
      scene.add(beacon);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 6), poleMat);
      pole.position.set(location.x, 2.2, location.z);
      scene.add(pole);

      const label = makeLabel(name);
      label.position.set(location.x, 4.8, location.z);
      scene.add(label);
    }
  }
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for debug marker");

  ctx.font = "bold 42px system-ui, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#ff38ff";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 256, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(7, 0.9, 1);
  return sprite;
}
