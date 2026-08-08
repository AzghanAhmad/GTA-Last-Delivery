import * as THREE from "three";
import { PlayerState, type Player } from "../player/Player";
import type { Vehicle } from "./Vehicle";

/**
 * Owns the set of drivable vehicles and the enter/exit flow.
 *
 * The nearest unoccupied vehicle within interaction distance can be entered.
 * Entering hides the player and marks the vehicle occupied; exiting places the
 * player on the driver's side (with fallbacks if blocked) and restores them.
 */
export class VehicleManager {
  private readonly player: Player;
  private readonly colliders: readonly THREE.Box3[];
  private readonly vehicleList: Vehicle[] = [];
  private activeVehicle: Vehicle | null = null;
  readonly interactionDistance = 3.0;

  constructor(player: Player, colliders: readonly THREE.Box3[]) {
    this.player = player;
    this.colliders = colliders;
  }

  get vehicles(): readonly Vehicle[] {
    return this.vehicleList;
  }

  get active(): Vehicle | null {
    return this.activeVehicle;
  }

  register(vehicle: Vehicle): void {
    this.vehicleList.push(vehicle);
  }

  findEnterable(): Vehicle | null {
    let best: Vehicle | null = null;
    let bestDistance = Infinity;
    const playerPos = this.player.group.position;
    for (const vehicle of this.vehicleList) {
      if (vehicle.isOccupied) continue;
      const dx = vehicle.group.position.x - playerPos.x;
      const dz = vehicle.group.position.z - playerPos.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= this.interactionDistance && distance < bestDistance) {
        best = vehicle;
        bestDistance = distance;
      }
    }
    return best;
  }

  enter(vehicle: Vehicle): void {
    if (this.activeVehicle || vehicle.isOccupied) return;
    vehicle.isOccupied = true;
    vehicle.speed = 0;
    this.activeVehicle = vehicle;
    this.player.state = PlayerState.IN_VEHICLE;
    this.player.setVisible(false);
  }

  exit(): boolean {
    const vehicle = this.activeVehicle;
    if (!vehicle) return false;

    vehicle.speed = 0;
    vehicle.isOccupied = false;
    this.activeVehicle = null;

    const spot = this.findExitSpot(vehicle);
    this.player.setVisible(true);
    this.player.state = PlayerState.ON_FOOT;
    this.player.teleport(spot.x, spot.z, vehicle.yaw);
    return true;
  }

  /** Finds a clear spot beside the vehicle, preferring the driver's side. */
  private findExitSpot(vehicle: Vehicle): { x: number; z: number } {
    const yaw = vehicle.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const sideGap = vehicle.config.width * 0.5 + 1.2;
    const endGap = vehicle.config.length * 0.5 + 1.2;

    const local = (lx: number, lz: number): { x: number; z: number } => ({
      x: vehicle.group.position.x + lx * cos + lz * sin,
      z: vehicle.group.position.z - lx * sin + lz * cos,
    });

    const candidates = [
      local(-sideGap, 0.6),
      local(sideGap, 0.6),
      local(0, endGap),
      local(0, -endGap),
    ];

    for (const spot of candidates) {
      if (!this.isSpotBlocked(spot.x, spot.z)) return spot;
    }
    return candidates[0];
  }

  private isSpotBlocked(x: number, z: number): boolean {
    const player = this.player.config;
    const half = Math.max(player.width, player.depth) * 0.5;
    const probe = new THREE.Box3(
      new THREE.Vector3(x - half, 0, z - half),
      new THREE.Vector3(x + half, 2, z + half),
    );
    for (const collider of this.colliders) {
      if (probe.intersectsBox(collider)) return true;
    }
    return false;
  }
}
