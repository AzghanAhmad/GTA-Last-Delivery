/**
 * Centralized world locations.
 *
 * These are the canonical coordinates for the districts and future mission
 * anchors. Everything in the world (and later the mission) reads from this
 * single object; do not scatter these numbers across files.
 *
 * Axis convention: +X is east, +Z is south, yaw = Math.atan2(dx, dz) so a yaw
 * of 0 faces +Z.
 *
 * START / START_VEHICLE mirror SpawnConfig, the single source of truth for
 * where the player and the starter car begin.
 */
import { PLAYER_SPAWN, STARTER_VEHICLE_SPAWN } from "./SpawnConfig";

export interface WorldLocation {
  x: number;
  z: number;
  yaw: number;
}

export interface WorldLocations {
  /** Player's initial safe area (north-center block). */
  START: WorldLocation;
  /** Where the player's first drivable car is parked. */
  START_VEHICLE: WorldLocation;
  /** The Blackout Job target vehicle: parked inside the warehouse compound. */
  TARGET_VEHICLE: WorldLocation;
  POLICE_STATION: WorldLocation;
  CITY_CENTER: WorldLocation;
  WAREHOUSE: WorldLocation;
  DOCKS: WorldLocation;
  GAS_STATION: WorldLocation;
  /** A point on the main north-south corridor used as the escape route. */
  ESCAPE_ROUTE: WorldLocation;
  /** Where the target car must be delivered (on the dock surface). */
  DELIVERY_ZONE: WorldLocation;
  /** On-foot getaway point near the delivery zone. */
  EXTRACTION: WorldLocation;
}

export const WORLD_LOCATIONS: WorldLocations = {
  START: { x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, yaw: PLAYER_SPAWN.yaw },
  START_VEHICLE: { x: STARTER_VEHICLE_SPAWN.x, z: STARTER_VEHICLE_SPAWN.z, yaw: STARTER_VEHICLE_SPAWN.yaw },
  // Facing north so the driver heads straight out through the warehouse gate.
  TARGET_VEHICLE: { x: -165, z: 205, yaw: Math.PI },
  POLICE_STATION: { x: 118, z: 40, yaw: 0 },
  CITY_CENTER: { x: 0, z: 35, yaw: 0 },
  WAREHOUSE: { x: -180, z: 215, yaw: 0 },
  DOCKS: { x: 195, z: 215, yaw: Math.PI / 2 },
  GAS_STATION: { x: -135, z: -35, yaw: 0 },
  ESCAPE_ROUTE: { x: 90, z: -150, yaw: 0 },
  // On the dock surface, clear of containers/crates; extraction is a short
  // walk east along the quay.
  DELIVERY_ZONE: { x: 195, z: 262, yaw: 0 },
  EXTRACTION: { x: 255, z: 272, yaw: 0 },
};
