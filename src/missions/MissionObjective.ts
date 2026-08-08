/**
 * A world-space mission objective.
 *
 * Shared by the HUD (title line), the 3D beacon + arrow (anchor, label, color)
 * and both maps (anchor, ring). Logic never reads these coordinates — the
 * mission state machine advances from live context, so the objectives here are
 * purely the player-facing presentation of the current state.
 */
export interface MissionObjective {
  /** Stable id so listeners can style specific objectives (e.g. delivery zone). */
  id: string;
  /** Player-facing task shown in the HUD and on the map. */
  title: string;
  /** World anchor for the beacon, arrow and map marker. */
  x: number;
  z: number;
  /** Informational radius around the anchor; used for markers, not logic. */
  radius: number;
  /** Short label shown above the in-world beacon. */
  label: string;
  /** Beacon + map accent color (0xRRGGBB). */
  color: number;
  /** When set, a flat ground ring of this radius marks a delivery zone. */
  ring?: number;
}
