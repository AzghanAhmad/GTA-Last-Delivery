import { MissionManager } from "./MissionManager";
import { WORLD_LOCATIONS } from "../world/WorldLocations";

export interface HeistUpdateContext {
  /** True while the player drives the heist target vehicle. */
  inTargetVehicle: boolean;
  /** Horizontal distance from the active vehicle to the docks delivery point. */
  docksDistance: number;
}

/** How close (in meters) the target car must get to the docks to deliver. */
export const DOCKS_DELIVERY_RADIUS = 13;

/**
 * "The Heist" — the game's single mission.
 *
 * Phase one: steal the Aurora GT from the parking lot (entering it is the
 * crime). Phase two: shake the police and deliver the car to the docks. Game
 * reads the objective/phase callbacks to raise the wanted level on the steal
 * and to show the success screen on completion.
 */
export class HeistMission extends MissionManager {
  readonly targetX = WORLD_LOCATIONS.TARGET_VEHICLE.x;
  readonly targetZ = WORLD_LOCATIONS.TARGET_VEHICLE.z;
  readonly docksX = WORLD_LOCATIONS.DOCKS.x;
  readonly docksZ = WORLD_LOCATIONS.DOCKS.z;
  /** Wanted level applied the moment the target car is stolen. */
  readonly heistWantedLevel = 2;

  private context: HeistUpdateContext = { inTargetVehicle: false, docksDistance: Infinity };

  constructor() {
    super();
    this.objectives = [
      {
        id: "steal",
        title: "Steal the Aurora GT from the parking lot",
        x: this.targetX,
        z: this.targetZ,
        radius: 20,
      },
      {
        id: "deliver",
        title: "Deliver the Aurora GT to the docks",
        x: this.docksX,
        z: this.docksZ,
        radius: DOCKS_DELIVERY_RADIUS,
      },
    ];
  }

  /** Feeds the current game state so `update` can make decisions. */
  setContext(context: HeistUpdateContext): void {
    this.context = context;
  }

  get isTargetDelivered(): boolean {
    return this.context.inTargetVehicle && this.context.docksDistance <= DOCKS_DELIVERY_RADIUS;
  }

  update(delta: number): void {
    void delta;
    if (this.currentPhase !== "running") return;
    if (this.objectiveIndex === 0) {
      if (this.context.inTargetVehicle) this.setObjective(1);
    } else if (this.objectiveIndex === 1 && this.isTargetDelivered) {
      this.complete();
    }
  }
}
