export interface WantedConfig {
  maxWantedLevel: number;
  /** Detection/pursuit range per level (index 0 is unused). */
  detectionRadius: readonly number[];
  /** Seconds out of pursuit before the player is considered to have escaped. */
  escapeTime: number;
  /** How long police search after losing the player before giving up. */
  searchDuration: number;
  /** Delay after escaping before the wanted level starts to decay. */
  wantedDecayDelay: number;
  /** Seconds between each wanted-level step down during decay. */
  wantedDecayInterval: number;
  arrestDistance: number;
  /** How long police must stay close to the player before arresting. */
  arrestDuration: number;
}

export const defaultWantedConfig: WantedConfig = {
  maxWantedLevel: 3,
  detectionRadius: [0, 45, 60, 80],
  escapeTime: 5,
  searchDuration: 6,
  wantedDecayDelay: 4,
  wantedDecayInterval: 5,
  arrestDistance: 3,
  arrestDuration: 1.2,
};

/**
 * Wanted level state machine.
 *
 * Levels are 0..maxWantedLevel. The level only rises through the public API
 * (the final mission will call raiseWantedLevel). Decay is gradual: once the
 * player is out of pursuit long enough to "escape", a delay elapses and then
 * the level steps down on an interval. While actively pursued, decay never
 * runs. `escaped` stays true until the level reaches zero or the player is
 * re-detected, so police units know when to stop searching and return.
 */
export class WantedSystem {
  readonly config: WantedConfig;
  escaped = false;

  private level = 0;
  private escapeTimer = 0;
  private decayDelayTimer = 0;
  private decayTimer = 0;

  constructor(config: WantedConfig = defaultWantedConfig) {
    this.config = config;
  }

  raiseWantedLevel(amount: number): void {
    this.setWantedLevel(this.level + amount);
  }

  lowerWantedLevel(amount: number): void {
    this.setWantedLevel(this.level - amount);
  }

  setWantedLevel(level: number): void {
    this.level = Math.min(Math.max(level, 0), this.config.maxWantedLevel);
    if (this.level === 0) this.reset();
  }

  clearWantedLevel(): void {
    this.setWantedLevel(0);
  }

  getWantedLevel(): number {
    return this.level;
  }

  get maxWantedLevel(): number {
    return this.config.maxWantedLevel;
  }

  isWanted(): boolean {
    return this.level > 0;
  }

  getDetectionRadius(): number {
    const radius = this.config.detectionRadius[this.level];
    return radius ?? 0;
  }

  update(delta: number, inPursuit: boolean): void {
    if (this.level === 0) {
      this.reset();
      return;
    }

    if (inPursuit) {
      this.escapeTimer = 0;
      this.decayDelayTimer = 0;
      this.decayTimer = 0;
      this.escaped = false;
      return;
    }

    this.escapeTimer += delta;
    if (this.escapeTimer < this.config.escapeTime) return;
    this.escaped = true;

    this.decayDelayTimer += delta;
    if (this.decayDelayTimer < this.config.wantedDecayDelay) return;

    this.decayTimer += delta;
    if (this.decayTimer >= this.config.wantedDecayInterval) {
      this.decayTimer = 0;
      this.lowerWantedLevel(1);
    }
  }

  private reset(): void {
    this.escapeTimer = 0;
    this.decayDelayTimer = 0;
    this.decayTimer = 0;
    this.escaped = false;
  }
}
