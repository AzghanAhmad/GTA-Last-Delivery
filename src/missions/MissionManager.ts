import type { MissionObjective } from "./MissionObjective";

export type MissionPhase = "inactive" | "running" | "complete" | "failed";

export type { MissionObjective };

/**
 * Generic mission orchestrator.
 *
 * Holds the objective list and the current phase and notifies listeners on
 * every transition. It has no scene, player or police knowledge; concrete
 * missions subclass it and implement `update` to advance the objectives by
 * reading whatever systems Game feeds them each frame.
 */
export abstract class MissionManager {
  protected objectives: MissionObjective[] = [];
  protected objectiveIndex = -1;
  private phase: MissionPhase = "inactive";

  /** Fired when the active objective changes (null = no objective). */
  onObjectiveChange: ((objective: MissionObjective | null, index: number) => void) | null = null;
  /** Fired when the mission enters a new phase. */
  onPhaseChange: ((phase: MissionPhase) => void) | null = null;

  get currentPhase(): MissionPhase {
    return this.phase;
  }

  get currentObjective(): MissionObjective | null {
    if (this.objectiveIndex < 0 || this.objectiveIndex >= this.objectives.length) return null;
    return this.objectives[this.objectiveIndex];
  }

  /** Advances the mission logic; concrete missions override this. */
  abstract update(delta: number): void;

  /** Starts (or restarts) the mission at its first objective. */
  start(): void {
    this.setPhase("running");
    this.setObjective(0);
  }

  /** Silently cancels the mission back to an empty state; then call start(). */
  reset(): void {
    this.objectiveIndex = -1;
    this.phase = "inactive";
  }

  protected setObjective(index: number): void {
    this.objectiveIndex = index;
    this.onObjectiveChange?.(this.currentObjective, this.objectiveIndex);
  }

  protected setPhase(phase: MissionPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.onPhaseChange?.(phase);
  }

  protected complete(): void {
    this.setPhase("complete");
    this.onObjectiveChange?.(null, this.objectives.length);
  }

  /** Marks the mission as failed (e.g. when the player is busted). */
  fail(): void {
    this.setPhase("failed");
  }
}
