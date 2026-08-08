import * as THREE from "three";
import type { HeistFailReason } from "../missions/HeistMission";

/**
 * Mission UI: the objective panel, mission clock, state banner, off-screen
 * objective arrow and the success/failed result screens.
 *
 * Renders into DOM elements that live in index.html (mission-hud, mission
 * banner, objective arrow, success/busted overlays). The arrow is a screen-edge
 * indicator: Game feeds the active objective's world position each frame and
 * MissionHUD projects it, showing a rotating arrow at the nearest screen edge
 * when the target is off camera.
 */
export class MissionHUD {
  private readonly root: HTMLElement;
  private readonly objectiveEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSub: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly successOverlay: HTMLElement;
  private readonly bustedOverlay: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly scoreTimeEl: HTMLElement;
  private readonly scoreDamageEl: HTMLElement;
  private readonly bustedTitle: HTMLElement;
  private readonly bustedSub: HTMLElement;
  private bannerTimer: number | null = null;

  private readonly proj = new THREE.Vector3();
  private readonly center = new THREE.Vector3();

  constructor(mount: HTMLElement) {
    this.root = mount;
    const objective = mount.querySelector<HTMLElement>(".mission-objective");
    const timer = mount.querySelector<HTMLElement>(".mission-timer");
    if (!objective) throw new Error("Missing .mission-objective in #mission-hud");
    this.objectiveEl = objective;
    this.timerEl = timer ?? document.createElement("span");

    this.banner = this.findOrCreate("mission-banner");
    this.bannerTitle = this.banner.querySelector<HTMLElement>(".banner-title") ?? document.createElement("div");
    this.bannerSub = this.banner.querySelector<HTMLElement>(".banner-sub") ?? document.createElement("div");
    this.arrow = this.findOrCreate("objective-arrow");

    this.successOverlay = document.getElementById("success-overlay") ?? this.findOrCreate("success-overlay");
    this.bustedOverlay = document.getElementById("busted-overlay") ?? this.findOrCreate("busted-overlay");
    this.scoreEl = this.successOverlay.querySelector<HTMLElement>(".success-score") ?? document.createElement("div");
    this.scoreTimeEl = this.successOverlay.querySelector<HTMLElement>(".success-time") ?? document.createElement("div");
    this.scoreDamageEl = this.successOverlay.querySelector<HTMLElement>(".success-damage") ?? document.createElement("div");
    this.bustedTitle = this.bustedOverlay.querySelector<HTMLElement>(".busted-title") ?? document.createElement("div");
    this.bustedSub = this.bustedOverlay.querySelector<HTMLElement>(".busted-sub") ?? document.createElement("div");
  }

  showObjective(text: string): void {
    this.objectiveEl.textContent = text;
    this.root.classList.remove("hidden");
    this.hideBanner();
  }

  hideObjective(): void {
    this.root.classList.add("hidden");
    this.hideArrow();
  }

  /** Shows the mission clock (e.g. "03:24"); pass null to hide it. */
  setTimer(seconds: number | null): void {
    if (seconds === null) {
      this.timerEl.textContent = "";
      this.timerEl.style.display = "none";
      return;
    }
    this.timerEl.style.display = "";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  /** Big transient center message for story beats; auto-hides after a while. */
  showBanner(title: string, sub = "", durationMs = 2600): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.banner.classList.add("visible");
    if (this.bannerTimer !== null) clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.hideBanner(), durationMs);
  }

  hideBanner(): void {
    if (this.bannerTimer !== null) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    this.banner.classList.remove("visible");
  }

  /** Screen-edge arrow pointing at the objective; pass null to hide it. */
  updateArrow(objective: { x: number; z: number } | null, camera: THREE.Camera): void {
    if (!objective) {
      this.hideArrow();
      return;
    }
    this.proj.set(objective.x, 0, objective.z).project(camera);
    const behind = this.proj.z > 1;
    const nx = (this.proj.x + 1) / 2;
    const ny = (1 - this.proj.y) / 2;
    if (!behind && nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
      this.hideArrow();
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 54;
    const px = clamp(nx * w, margin, w - margin);
    const py = clamp(ny * h, margin, h - margin);
    this.center.set(w / 2, h / 2, 0);
    const angle = Math.atan2(py - this.center.y, px - this.center.x);
    this.arrow.style.left = `${px}px`;
    this.arrow.style.top = `${py}px`;
    // The arrow triangle points up by default; add 90deg so it faces the target.
    this.arrow.style.transform = `translate(-50%, -50%) rotate(${angle + Math.PI / 2}rad)`;
    this.arrow.classList.add("visible");
  }

  /** Shows the completion screen with the score breakdown. */
  showSuccess(score: number, elapsedSeconds: number, timeLimit: number, damage: number): void {
    const timeBonus = Math.max(0, Math.round(timeLimit - elapsedSeconds));
    this.scoreEl.textContent = `${score} pts`;
    this.scoreTimeEl.textContent = `Time bonus  ${timeBonus}`;
    this.scoreDamageEl.textContent = `Car damage  -${Math.round(damage)}`;
    this.successOverlay.classList.remove("hidden");
  }

  /** Shows the failure screen with a reason-specific title. */
  showFailed(reason: HeistFailReason): void {
    const [title, sub] = failedText(reason);
    this.bustedTitle.textContent = title;
    this.bustedSub.textContent = sub;
    this.bustedOverlay.classList.remove("hidden");
  }

  hideResult(): void {
    this.successOverlay.classList.add("hidden");
    this.bustedOverlay.classList.add("hidden");
  }

  /** Clears every element back to its default state (used on restart). */
  reset(): void {
    this.hideObjective();
    this.hideBanner();
    this.hideArrow();
    this.hideResult();
    this.setTimer(null);
  }

  private hideArrow(): void {
    this.arrow.classList.remove("visible");
  }

  private findOrCreate(id: string): HTMLElement {
    const existing = document.getElementById(id);
    if (existing) return existing;
    const el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
    return el;
  }
}

function failedText(reason: HeistFailReason): [string, string] {
  switch (reason) {
    case "busted":
      return ["BUSTED", "The police caught you. Press R to restart"];
    case "destroyed":
      return ["WRECKED", "The Aurora GT was destroyed. Press R to restart"];
    case "timeout":
      return ["TOO LATE", "You ran out of time. Press R to restart"];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
