import * as THREE from "three";
import type { Player } from "../player/Player";
import type { PoliceManager } from "../police/PoliceManager";
import type { VehicleManager } from "../vehicles/VehicleManager";
import type { WantedSystem } from "../police/WantedSystem";

export interface DebugStats {
  frameTimeMs: number;
}

/**
 * Lightweight debug overlay for development.
 *
 * Shows a one-line status bar with renderer/scene/camera/player health, vehicle
 * speed, police count and frame time. Purely diagnostic; not part of the game
 * UI and only updated in dev mode.
 */
export class DebugOverlay {
  private readonly root: HTMLElement;
  private readonly player: Player;
  private readonly vehicleManager: VehicleManager;
  private readonly policeManager: PoliceManager;
  private readonly wanted: WantedSystem;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly size = new THREE.Vector2();

  constructor(
    container: HTMLElement,
    player: Player,
    vehicleManager: VehicleManager,
    policeManager: PoliceManager,
    wanted: WantedSystem,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    const root = container.querySelector<HTMLElement>("#debug-overlay");
    if (!root) throw new Error("Missing #debug-overlay in index.html");
    this.root = root;
    this.player = player;
    this.vehicleManager = vehicleManager;
    this.policeManager = policeManager;
    this.wanted = wanted;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  update(stats: DebugStats): void {
    const vehicle = this.vehicleManager.active;
    const speed = vehicle ? (vehicle.speed * 3.6).toFixed(1) : "0.0";
    this.renderer.getDrawingBufferSize(this.size);
    const cam = this.camera.position;
    const pl = this.player.group.position;
    this.root.textContent = [
      `renderer:ok(${this.size.x}x${this.size.y})`,
      `scene:${this.scene.children.length}`,
      `camera:${cam.x.toFixed(0)},${cam.y.toFixed(0)},${cam.z.toFixed(0)}`,
      `player:${pl.x.toFixed(0)},${pl.z.toFixed(0)}`,
      `vehicle:${vehicle ? "active" : "parked"}`,
      `state:${this.player.state}`,
      `speed:${speed}km/h`,
      `wanted:${this.wanted.getWantedLevel()}/${this.wanted.maxWantedLevel}`,
      `police:${this.policeManager.policeCount}`,
      `frame:${stats.frameTimeMs.toFixed(1)}ms`,
    ].join("  |  ");
  }

  toggleVisible(): void {
    this.root.classList.toggle("hidden");
  }
}
