import * as THREE from "three";
import { PlayerState, type Player } from "../player/Player";
import type { Vehicle } from "./Vehicle";

type ManagerPhase = "idle" | "entering" | "driving" | "exiting";

/**
 * Owns the set of drivable vehicles and the enter/exit flow.
 *
 * Entering and exiting are animated sequences: the player model plays the
 * enter/exit clips while the player is lerped toward the driver seat (or out to
 * a clear spot beside the door), the driver door opens/closes, and while
 * driving the player's feet are pinned to the seat anchor so the seated figure
 * stays visible in the (translucent) cabin. `findEnterable` measures distance
 * to the driver door, so the prompt only appears next to the door.
 */
export class VehicleManager {
  private readonly player: Player;
  private readonly colliders: readonly THREE.Box3[];
  private readonly vehicleList: Vehicle[] = [];
  private readonly spawns = new Map<Vehicle, Readonly<{ x: number; z: number; yaw: number }>>();
  private readonly tmpDoor = new THREE.Vector3();
  private readonly startPosition = new THREE.Vector3();
  private readonly endPosition = new THREE.Vector3();
  private activeVehicle: Vehicle | null = null;
  private phase: ManagerPhase = "idle";
  private transitionTime = 0;
  private transitionDuration = 0;
  private exitSpot: { x: number; z: number } | null = null;
  private exitCompleted = false;
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

  get isTransitioning(): boolean {
    return this.phase === "entering" || this.phase === "exiting";
  }

  register(vehicle: Vehicle): void {
    this.vehicleList.push(vehicle);
    this.spawns.set(vehicle, {
      x: vehicle.group.position.x,
      z: vehicle.group.position.z,
      yaw: vehicle.group.rotation.y,
    });
  }

  /** Returns every registered vehicle to its spawn and cancels any sequence. */
  reset(): void {
    this.activeVehicle = null;
    this.phase = "idle";
    this.player.model.setDriving(false);
    for (const vehicle of this.vehicleList) {
      const spawn = this.spawns.get(vehicle);
      if (!spawn) continue;
      vehicle.speed = 0;
      vehicle.isOccupied = false;
      vehicle.setDoorOpen(false);
      vehicle.updateDoor(1);
      vehicle.group.position.set(spawn.x, 0, spawn.z);
      vehicle.group.rotation.y = spawn.yaw;
    }
  }

  /** Nearest unoccupied vehicle whose driver door is within interaction reach. */
  findEnterable(): Vehicle | null {
    let best: Vehicle | null = null;
    let bestDistance = Infinity;
    const playerPos = this.player.group.position;
    for (const vehicle of this.vehicleList) {
      if (vehicle.isOccupied) continue;
      vehicle.getDriverDoorWorld(this.tmpDoor);
      const dx = this.tmpDoor.x - playerPos.x;
      const dz = this.tmpDoor.z - playerPos.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= this.interactionDistance && distance < bestDistance) {
        best = vehicle;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Starts the animated walk-to-seat sequence on the given vehicle. */
  beginEnter(vehicle: Vehicle): void {
    if (this.activeVehicle || this.phase !== "idle") return;
    vehicle.isOccupied = true;
    vehicle.speed = 0;
    this.activeVehicle = vehicle;
    this.phase = "entering";
    this.transitionTime = 0;
    this.transitionDuration = 0.9;
    this.player.state = PlayerState.ENTERING_VEHICLE;
    this.player.setVisible(true);
    this.player.model.playVehicleTransition("enter");
    this.startPosition.copy(this.player.group.position).setY(0);
    vehicle.getDriverSeatWorld(this.endPosition);
    vehicle.setDoorOpen(true);
  }

  /** Starts the animated seat-to-ground sequence; returns false when not driving. */
  beginExit(): boolean {
    const vehicle = this.activeVehicle;
    if (!vehicle || this.phase !== "driving") return false;
    vehicle.speed = 0;
    this.phase = "exiting";
    this.transitionTime = 0;
    this.transitionDuration = 1.0;
    this.player.state = PlayerState.EXITING_VEHICLE;
    this.player.model.setDriving(false);
    this.player.model.playVehicleTransition("exit");
    vehicle.getDriverSeatWorld(this.startPosition);
    this.exitSpot = this.findExitSpot(vehicle);
    this.endPosition.set(this.exitSpot.x, 0, this.exitSpot.z);
    vehicle.setDoorOpen(true);
    return true;
  }

  /** Advances the active sequence; call every frame. */
  update(delta: number): void {
    const vehicle = this.activeVehicle;
    if (!vehicle) return;
    vehicle.updateDoor(delta);

    if (this.phase === "entering") {
      this.transitionTime += delta;
      const t = Math.min(1, this.transitionTime / this.transitionDuration);
      this.player.group.position.lerpVectors(this.startPosition, this.endPosition, easeInOut(t));
      this.dampPlayerFacing(vehicle, delta);
      this.player.model.updateMixerOnly(delta);
      if (t >= 1) this.completeEnter(vehicle);
    } else if (this.phase === "driving") {
      vehicle.getDriverSeatWorld(this.player.group.position);
      this.player.group.rotation.y = vehicle.yaw;
      this.player.model.setDriving(true);
      this.player.model.updateMixerOnly(delta);
    } else if (this.phase === "exiting") {
      this.transitionTime += delta;
      const t = Math.min(1, this.transitionTime / this.transitionDuration);
      this.player.group.position.lerpVectors(this.startPosition, this.endPosition, easeInOut(t));
      this.dampPlayerFacing(vehicle, delta);
      this.player.model.updateMixerOnly(delta);
      if (t >= 1) this.completeExit(vehicle);
    }
  }

  /** True once on the frame the animated exit finished; consumed by Game. */
  consumeExitCompleted(): boolean {
    const value = this.exitCompleted;
    this.exitCompleted = false;
    return value;
  }

  /**
   * Instant, non-animated exit used by the arrest/restart flows: cancels any
   * sequence, drops the player beside the car and releases it.
   */
  exit(): boolean {
    const vehicle = this.activeVehicle;
    if (!vehicle) return false;
    vehicle.speed = 0;
    vehicle.isOccupied = false;
    vehicle.setDoorOpen(false);
    vehicle.updateDoor(1);
    this.activeVehicle = null;
    this.phase = "idle";
    this.player.model.setDriving(false);
    this.player.setVisible(true);
    this.player.state = PlayerState.ON_FOOT;
    const spot = this.findExitSpot(vehicle);
    this.player.teleport(spot.x, spot.z, vehicle.yaw);
    return true;
  }

  private completeEnter(vehicle: Vehicle): void {
    vehicle.getDriverSeatWorld(this.player.group.position);
    this.player.group.rotation.y = vehicle.yaw;
    this.phase = "driving";
    this.player.state = PlayerState.IN_VEHICLE;
    this.player.model.setDriving(true);
    vehicle.setDoorOpen(false);
  }

  private completeExit(vehicle: Vehicle): void {
    vehicle.isOccupied = false;
    vehicle.setDoorOpen(false);
    this.phase = "idle";
    this.player.state = PlayerState.ON_FOOT;
    const spot = this.exitSpot ?? this.findExitSpot(vehicle);
    this.player.teleport(spot.x, spot.z, vehicle.yaw);
    this.activeVehicle = null;
    this.exitCompleted = true;
  }

  private dampPlayerFacing(vehicle: Vehicle, delta: number): void {
    const t = 1 - Math.exp(-8 * delta);
    const current = this.player.group.rotation.y;
    const twoPi = Math.PI * 2;
    let diff = ((vehicle.yaw - current + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
    this.player.group.rotation.y += diff * t;
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

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
