/**
 * Centralized world locations.
 *
 * These are the canonical coordinates for the districts and future mission
 * anchors. Everything in the world (and later the mission) reads from this
 * single object; do not scatter these numbers across files.
 *
 * Axis convention: +X is east, +Z is south, yaw = Math.atan2(dx, dz) so a yaw
 * of 0 faces +Z.
 */
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
  /** Reserved spawn for the future Heist target vehicle. */
  TARGET_VEHICLE: WorldLocation;
  POLICE_STATION: WorldLocation;
  CITY_CENTER: WorldLocation;
  WAREHOUSE: WorldLocation;
  DOCKS: WorldLocation;
  GAS_STATION: WorldLocation;
  /** A point on the main north-south corridor used as the escape route. */
  ESCAPE_ROUTE: WorldLocation;
}

export const WORLD_LOCATIONS: WorldLocations = {
  START: { x: 0, z: -210, yaw: Math.PI },
  START_VEHICLE: { x: 55, z: -262, yaw: Math.PI / 2 },
  TARGET_VEHICLE: { x: 0, z: 235, yaw: Math.PI },
  POLICE_STATION: { x: 118, z: 40, yaw: 0 },
  CITY_CENTER: { x: 0, z: 35, yaw: 0 },
  WAREHOUSE: { x: -180, z: 215, yaw: 0 },
  DOCKS: { x: 195, z: 215, yaw: Math.PI / 2 },
  GAS_STATION: { x: -135, z: -35, yaw: 0 },
  ESCAPE_ROUTE: { x: 90, z: -150, yaw: 0 },
};
