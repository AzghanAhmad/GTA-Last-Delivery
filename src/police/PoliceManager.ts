import * as THREE from "three";
import { PlayerState, type Player } from "../player/Player";
import type { Vehicle } from "../vehicles/Vehicle";
import type { VehicleManager } from "../vehicles/VehicleManager";
import type { WantedSystem } from "./WantedSystem";
import { Police, PoliceState, TrackedTarget } from "./Police";
import type { PoliceOfficer } from "./PoliceOfficer";
import { PoliceVehicle } from "./PoliceVehicle";

export interface PoliceConfig {
  maxPolice: number;
  minSpawnDistance: number;
  maxSpawnDistance: number;
  predictionTimeMax: number;
  returnTimeout: number;
}

export const defaultPoliceConfig: PoliceConfig = {
  maxPolice: 3,
  minSpawnDistance: 20,
  maxSpawnDistance: 35,
  predictionTimeMax: 1.2,
  returnTimeout: 14,
};

/**
 * Spawns, tracks and removes police units and syncs them to the wanted level.
 *
 * Unit count follows the wanted level (up to maxPolice). Each unit steers via
 * its own PoliceAI. The shared TrackedTarget points at the player, or at the
 * player's vehicle while driving. Police that are not supposed to be active
 * (wanted dropped, or the player escaped) are sent home and removed.
 */
export class PoliceManager {
  private readonly scene: THREE.Scene;
  private readonly obstacleColliders: readonly THREE.Box3[];
  private readonly onArrest: () => void;
  readonly config: PoliceConfig;

  private readonly unitList: Police[] = [];
  private readonly trackedTarget = new TrackedTarget();
  private inPursuit = false;

  constructor(
    scene: THREE.Scene,
    obstacleColliders: readonly THREE.Box3[],
    onArrest: () => void,
    config: PoliceConfig = defaultPoliceConfig,
  ) {
    this.scene = scene;
    this.obstacleColliders = obstacleColliders;
    this.onArrest = onArrest;
    this.config = config;
  }

  get policeCount(): number {
    return this.unitList.length;
  }

  get units(): readonly Police[] {
    return this.unitList;
  }

  get isPlayerInPursuit(): boolean {
    return this.inPursuit;
  }

  reset(): void {
    for (const unit of this.unitList) {
      this.scene.remove(unit.vehicle.group);
      if (unit.officer) this.scene.remove(unit.officer.group);
    }
    this.unitList.length = 0;
    this.inPursuit = false;
  }

  /** The officer mid-standoff, if any unit is currently performing an arrest. */
  get arrestingOfficer(): PoliceOfficer | null {
    for (const unit of this.unitList) {
      if (unit.state === PoliceState.ARRESTING && unit.officer?.isArresting) {
        return unit.officer;
      }
    }
    return null;
  }

  update(delta: number, player: Player, vehicleManager: VehicleManager, wanted: WantedSystem): void {
    const activeVehicle = vehicleManager.active;
    if (player.state === PlayerState.IN_VEHICLE && activeVehicle) {
      this.trackedTarget.position.copy(activeVehicle.group.position);
      activeVehicle.getVelocity(this.trackedTarget.velocity);
    } else {
      this.trackedTarget.position.copy(player.group.position);
      this.trackedTarget.velocity.copy(player.velocity);
    }

    const colliders = this.buildColliders(activeVehicle);

    const desired = Math.min(wanted.getWantedLevel(), this.config.maxPolice);
    while (this.unitList.length < desired) {
      this.spawnUnit(wanted.getDetectionRadius());
    }
    for (let i = desired; i < this.unitList.length; i++) {
      this.unitList[i].beginReturn();
    }
    if (wanted.escaped) {
      for (const unit of this.unitList) {
        if (unit.state === PoliceState.SEARCHING) unit.beginReturn();
      }
    }

    this.inPursuit = false;
    for (const unit of this.unitList) {
      unit.setDynamicColliders(colliders);
      unit.update(delta, this.trackedTarget, wanted);
      if (unit.state === PoliceState.ALERT || unit.state === PoliceState.PURSUING) {
        this.inPursuit = true;
      }
    }

    for (let i = this.unitList.length - 1; i >= 0; i--) {
      const unit = this.unitList[i];
      if (unit.finished) {
        this.scene.remove(unit.vehicle.group);
        if (unit.officer) this.scene.remove(unit.officer.group);
        this.unitList.splice(i, 1);
      }
    }
  }

  /** Obstacles plus the player's active vehicle so police don't drive through it. */
  private buildColliders(activeVehicle: Vehicle | null): THREE.Box3[] {
    const list: THREE.Box3[] = [...this.obstacleColliders];
    if (activeVehicle) {
      activeVehicle.group.updateMatrixWorld(true);
      list.push(new THREE.Box3().setFromObject(activeVehicle.group));
    }
    return list;
  }

  private spawnUnit(detectionRadius: number): void {
    const vehicle = new PoliceVehicle();
    vehicle.setColliders(this.obstacleColliders);

    const spawn = this.findSpawnPoint();
    vehicle.group.position.set(spawn.x, 0, spawn.z);
    vehicle.group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(vehicle.group);

    const unit = new Police(
      this.scene,
      vehicle,
      this.obstacleColliders,
      detectionRadius,
      this.config.predictionTimeMax,
      this.config.returnTimeout,
      this.onArrest,
    );
    unit.spawnPoint.copy(spawn);
    unit.lastKnown.copy(this.trackedTarget.position);
    this.unitList.push(unit);
  }

  /** Finds an open spawn spot near the player, searching wider rings in a city. */
  private findSpawnPoint(): THREE.Vector3 {
    const center = this.trackedTarget.position;
    for (let ring = 0; ring < 5; ring++) {
      const min = this.config.minSpawnDistance + ring * 18;
      const max = min + 18;
      for (let attempt = 0; attempt < 10; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = min + Math.random() * (max - min);
        const x = center.x + Math.cos(angle) * dist;
        const z = center.z + Math.sin(angle) * dist;
        if (!this.isSpotBlocked(x, z)) return new THREE.Vector3(x, 0, z);
      }
    }
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (let dist = 30; dist <= 150; dist += 20) {
        const x = center.x + Math.cos(angle) * dist;
        const z = center.z + Math.sin(angle) * dist;
        if (!this.isSpotBlocked(x, z)) return new THREE.Vector3(x, 0, z);
      }
    }
    return new THREE.Vector3(center.x + 60, 0, center.z);
  }

  private isSpotBlocked(x: number, z: number): boolean {
    const probe = new THREE.Box3(
      new THREE.Vector3(x - 2.5, 0, z - 2.5),
      new THREE.Vector3(x + 2.5, 3, z + 2.5),
    );
    for (const collider of this.obstacleColliders) {
      if (probe.intersectsBox(collider)) return true;
    }
    for (const unit of this.unitList) {
      unit.vehicle.group.updateMatrixWorld(true);
      if (probe.intersectsBox(new THREE.Box3().setFromObject(unit.vehicle.group))) return true;
    }
    return false;
  }
}
