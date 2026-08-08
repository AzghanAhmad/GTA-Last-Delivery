/**
 * Centralized spawn configuration.
 *
 * The player and the starter vehicle spawn in the north-center district, on
 * the main E-W avenue (z = -70) near its intersection with the central N-S
 * corridor (x = 90). The player stands on the north sidewalk; the starter car
 * is parked one lane in, driver's side facing the sidewalk so the Enter prompt
 * is immediately reachable. Buildings, the NOVA tower skyline, street lights,
 * a stop sign, a crosswalk and parked cars are all visible from this spot.
 *
 * Axis convention matches WorldLocations: +X is east, +Z is south, yaw =
 * Math.atan2(dx, dz) so yaw 0 faces +Z.
 *
 * Spawn placement facts (checked against City layout):
 *   - sidewalk at z = -84.4 sits between the road curb (-83) and the nc block
 *     building zone (starts z = -88.5) -> player is not inside geometry.
 *   - the car at (70, -81.5) is inside road z = -70 (spans -83..-57), aligned
 *     with the lane, and its driver door (≈69.3, -82.4) is ~2.1 m from the
 *     player -> within VehicleManager.interactionDistance.
 */
export const PLAYER_SPAWN = { x: 70, z: -84.4, yaw: 0 } as const;

export const STARTER_VEHICLE_SPAWN = { x: 70, z: -81.5, yaw: -Math.PI / 2 } as const;
