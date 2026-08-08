import { MissionManager } from "./MissionManager";
import { MissionState } from "./MissionState";
import { WORLD_LOCATIONS } from "../world/WorldLocations";

/** Live state of the target car, fed to the mission each frame. */
export interface HeistTargetInfo {
  x: number;
  z: number;
  speed: number;
  damage: number;
}

/** Everything the mission needs to decide; Game gathers and pushes it each frame. */
export interface HeistUpdateContext {
  /** Player position (the driven vehicle's position while in a vehicle). */
  playerX: number;
  playerZ: number;
  /** True while the player drives the target car. */
  inTargetVehicle: boolean;
  /** The target car's live state, or null when it has not been created yet. */
  target: HeistTargetInfo | null;
  /** Distance to the nearest active police unit; Infinity when none. */
  nearestPoliceDistance: number;
  /** True when there is no active pursuit (wanted level 0). */
  noPursuit: boolean;
}

export type HeistFailReason = "busted" | "destroyed" | "timeout";

/** Hard time limit in seconds; running out fails the job. */
export const HEIST_TIME_LIMIT = 8 * 60;
/** How close the target car must get to the delivery zone to hand it over. */
export const DELIVERY_RADIUS = 13;
/** Radius around the warehouse centre that counts as "inside the district". */
const WAREHOUSE_RADIUS = 60;
/** Distance from the warehouse centre that counts as "escaped the district". */
const ESCAPE_DISTANCE = 120;
/** Approach radius used to split "drive to the docks" from "enter the zone". */
const DOCKS_APPROACH = 110;
/** Radius around the extraction point that completes the job. */
const EXTRACTION_RADIUS = 18;

/** Anchor for the "leave the compound" marker, at the open east gate. */
const WAREHOUSE_EXIT = {
  x: WORLD_LOCATIONS.WAREHOUSE.x + 62,
  z: WORLD_LOCATIONS.WAREHOUSE.z,
};

/**
 * "The Blackout Job" — the game's single mission.
 *
 * A linear state machine: get to the warehouse district, find and steal the
 * Aurora GT, escape the compound, survive/shake the police on the drive to the
 * docks, deliver the car, then walk to the extraction point. Game reacts to
 * `onStateChange` for camera cuts, audio, wanted level and UI; the mission
 * itself only reads the context fed by Game and advances its own state. Fails
 * on arrest (called externally), target destruction or time out.
 */
export class HeistMission extends MissionManager {
  /** Wanted level applied the moment the target car is stolen. */
  readonly heistWantedLevel = 2;

  private context: HeistUpdateContext = {
    playerX: 0,
    playerZ: 0,
    inTargetVehicle: false,
    target: null,
    nearestPoliceDistance: Infinity,
    noPursuit: true,
  };

  private stateValue = MissionState.MISSION_RESTARTING;
  private stateTimer = 0;
  private elapsed = 0;
  private failReasonValue: HeistFailReason | null = null;

  /** Fired whenever the mission state changes (including into terminal states). */
  onStateChange: ((state: MissionState) => void) | null = null;

  constructor() {
    super();
    // Objective order is fixed; see applyObjectiveForState for the mapping.
    this.objectives = [
      {
        id: "warehouse",
        title: "Get to the warehouse district",
        x: WORLD_LOCATIONS.WAREHOUSE.x,
        z: WORLD_LOCATIONS.WAREHOUSE.z,
        radius: WAREHOUSE_RADIUS,
        label: "WAREHOUSE",
        color: 0xffd23e,
      },
      {
        id: "findTarget",
        title: "Find the Aurora GT in the compound",
        x: WORLD_LOCATIONS.TARGET_VEHICLE.x,
        z: WORLD_LOCATIONS.TARGET_VEHICLE.z,
        radius: 28,
        label: "AURORA GT",
        color: 0xffd23e,
      },
      {
        id: "escape",
        title: "Get the Aurora GT out of the compound",
        x: WAREHOUSE_EXIT.x,
        z: WAREHOUSE_EXIT.z,
        radius: 40,
        label: "EXIT",
        color: 0xffd23e,
      },
      {
        id: "docks",
        title: "Shake the police and reach the docks",
        x: WORLD_LOCATIONS.DELIVERY_ZONE.x,
        z: WORLD_LOCATIONS.DELIVERY_ZONE.z,
        radius: DOCKS_APPROACH,
        label: "DOCKS",
        color: 0x5cf0c8,
      },
      {
        id: "deliverZone",
        title: "Drive the Aurora GT into the delivery zone",
        x: WORLD_LOCATIONS.DELIVERY_ZONE.x,
        z: WORLD_LOCATIONS.DELIVERY_ZONE.z,
        radius: DELIVERY_RADIUS,
        label: "DELIVER",
        color: 0x5cf0c8,
        ring: DELIVERY_RADIUS,
      },
      {
        id: "extraction",
        title: "Get out of the car and reach the extraction point",
        x: WORLD_LOCATIONS.EXTRACTION.x,
        z: WORLD_LOCATIONS.EXTRACTION.z,
        radius: EXTRACTION_RADIUS,
        label: "EXIT",
        color: 0x5cf0c8,
      },
    ];
  }

  get state(): MissionState {
    return this.stateValue;
  }

  get failReason(): HeistFailReason | null {
    return this.failReasonValue;
  }

  /** Seconds since the job started (INTRO), used for the HUD clock and score. */
  get elapsedSeconds(): number {
    return this.elapsed;
  }

  /** Feeds the current game state so `update` can make decisions. */
  setContext(context: HeistUpdateContext): void {
    this.context = context;
  }

  /** Final score: delivery + extraction, a time bonus, minus car damage. */
  getScore(): number {
    const timeBonus = Math.max(0, Math.round(HEIST_TIME_LIMIT - this.elapsed));
    const damage = Math.round(this.context.target?.damage ?? 0);
    return 1100 + timeBonus - damage;
  }

  /** Starts (or restarts) the mission at the INTRO state. */
  start(): void {
    this.elapsed = 0;
    this.failReasonValue = null;
    this.setPhase("running");
    this.enterState(MissionState.INTRO, 2.6);
  }

  /** Cancels the mission back to an empty state; then call start(). */
  reset(): void {
    this.failReasonValue = null;
    this.elapsed = 0;
    this.stateTimer = 0;
    this.stateValue = MissionState.MISSION_RESTARTING;
    this.setObjective(-1);
    super.reset();
  }

  /** Marks the mission failed with a reason; safe to call at any time. */
  fail(reason?: HeistFailReason): void {
    if (this.stateValue === MissionState.MISSION_COMPLETE || this.stateValue === MissionState.MISSION_FAILED) {
      return;
    }
    this.failReasonValue = reason ?? "busted";
    this.enterState(MissionState.MISSION_FAILED);
    this.setObjective(-1);
    this.setPhase("failed");
  }

  update(delta: number): void {
    if (this.currentPhase !== "running") return;
    this.elapsed += delta;

    if (this.elapsed > HEIST_TIME_LIMIT) {
      this.fail("timeout");
      return;
    }
    const target = this.context.target;
    if (target && target.damage >= 100 && this.damageCanFail()) {
      this.fail("destroyed");
      return;
    }

    switch (this.stateValue) {
      case MissionState.INTRO:
        this.tick(delta, 2.6, () => this.enterState(MissionState.GO_TO_WAREHOUSE));
        break;
      case MissionState.GO_TO_WAREHOUSE:
        if (this.withinPlayer(WORLD_LOCATIONS.WAREHOUSE, WAREHOUSE_RADIUS)) {
          this.enterState(MissionState.REACH_WAREHOUSE);
        }
        break;
      case MissionState.REACH_WAREHOUSE:
        // Entering the car is the crime; once inside, the theft beat plays.
        if (this.context.inTargetVehicle) this.enterState(MissionState.STEAL_TARGET, 1.8);
        break;
      case MissionState.STEAL_TARGET:
        this.tick(delta, 1.8, () => this.enterState(MissionState.ESCAPE_WAREHOUSE));
        break;
      case MissionState.ESCAPE_WAREHOUSE:
        if (
          this.context.inTargetVehicle &&
          this.distancePlayerTo(WORLD_LOCATIONS.WAREHOUSE) > ESCAPE_DISTANCE
        ) {
          this.enterState(MissionState.POLICE_CHASE);
        }
        break;
      case MissionState.POLICE_CHASE:
        if (target && this.within(target, WORLD_LOCATIONS.DELIVERY_ZONE, DOCKS_APPROACH)) {
          this.enterState(MissionState.REACH_DOCKS);
        }
        break;
      case MissionState.REACH_DOCKS:
        if (target && this.within(target, WORLD_LOCATIONS.DELIVERY_ZONE, DELIVERY_RADIUS)) {
          this.enterState(MissionState.DELIVER_VEHICLE, 2.2);
        }
        break;
      case MissionState.DELIVER_VEHICLE:
        this.tick(delta, 2.2, () => this.enterState(MissionState.FINAL_ESCAPE));
        break;
      case MissionState.FINAL_ESCAPE:
        if (
          !this.context.inTargetVehicle &&
          this.withinPlayer(WORLD_LOCATIONS.EXTRACTION, EXTRACTION_RADIUS)
        ) {
          this.completeMission();
        }
        break;
      default:
        break;
    }
  }

  private tick(delta: number, duration: number, onDone: () => void): void {
    this.stateTimer += delta;
    if (this.stateTimer >= duration) onDone();
  }

  private completeMission(): void {
    this.enterState(MissionState.MISSION_COMPLETE);
    this.setObjective(-1);
    this.complete();
  }

  private enterState(state: MissionState, _timer = 0): void {
    void _timer;
    this.stateValue = state;
    this.stateTimer = 0;
    this.applyObjectiveForState(state);
    this.onStateChange?.(state);
  }

  private applyObjectiveForState(state: MissionState): void {
    const index = stateObjectiveIndex(state);
    this.setObjective(index);
  }

  private damageCanFail(): boolean {
    return (
      this.stateValue === MissionState.ESCAPE_WAREHOUSE ||
      this.stateValue === MissionState.POLICE_CHASE ||
      this.stateValue === MissionState.REACH_DOCKS
    );
  }

  private withinPlayer(location: { x: number; z: number }, radius: number): boolean {
    return this.distancePlayerTo(location) <= radius;
  }

  private within(point: { x: number; z: number }, location: { x: number; z: number }, radius: number): boolean {
    const dx = point.x - location.x;
    const dz = point.z - location.z;
    return dx * dx + dz * dz <= radius * radius;
  }

  private distancePlayerTo(location: { x: number; z: number }): number {
    const dx = this.context.playerX - location.x;
    const dz = this.context.playerZ - location.z;
    return Math.hypot(dx, dz);
  }
}

function stateObjectiveIndex(state: MissionState): number {
  switch (state) {
    case MissionState.GO_TO_WAREHOUSE:
      return 0;
    case MissionState.REACH_WAREHOUSE:
      return 1;
    case MissionState.ESCAPE_WAREHOUSE:
      return 2;
    case MissionState.POLICE_CHASE:
      return 3;
    case MissionState.REACH_DOCKS:
      return 4;
    case MissionState.FINAL_ESCAPE:
      return 5;
    default:
      return -1;
  }
}
