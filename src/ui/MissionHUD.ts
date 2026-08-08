/**
 * Mission HUD: a compact objective panel at the top of the screen.
 *
 * Shows a "THE HEIST" title with the current task line underneath. The success
 * screen is a separate overlay handled by Game, mirroring the busted overlay.
 */
export class MissionHUD {
  private readonly root: HTMLElement;
  private readonly objectiveEl: HTMLElement;

  constructor(mount: HTMLElement) {
    this.root = mount;
    const objective = mount.querySelector<HTMLElement>(".mission-objective");
    if (!objective) throw new Error("Missing .mission-objective in #mission-hud");
    this.objectiveEl = objective;
  }

  showObjective(text: string): void {
    this.objectiveEl.textContent = text;
    this.root.classList.remove("hidden");
  }

  hideObjective(): void {
    this.root.classList.add("hidden");
  }
}
