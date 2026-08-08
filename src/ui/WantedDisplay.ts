import type { WantedSystem } from "../police/WantedSystem";

/**
 * Wanted-level HUD element.
 *
 * Renders a row of stars under a "WANTED" label, reflecting the current
 * wanted level from the WantedSystem. Updates only when the level changes.
 */
export class WantedDisplay {
  private readonly root: HTMLElement;
  private readonly stars: HTMLElement[] = [];
  private readonly wanted: WantedSystem;
  private shownLevel = -1;

  constructor(container: HTMLElement, wanted: WantedSystem) {
    const root = container.querySelector<HTMLElement>("#wanted-display");
    if (!root) throw new Error("Missing #wanted-display in index.html");
    const starRow = root.querySelector<HTMLElement>(".wanted-stars");
    if (!starRow) throw new Error("Missing .wanted-stars in index.html");
    this.root = root;
    this.wanted = wanted;

    for (let i = 0; i < wanted.maxWantedLevel; i++) {
      const star = document.createElement("span");
      star.className = "wanted-star";
      star.textContent = "★";
      starRow.appendChild(star);
      this.stars.push(star);
    }
  }

  update(): void {
    const level = this.wanted.getWantedLevel();
    if (level === this.shownLevel) return;
    this.shownLevel = level;
    this.root.classList.toggle("active", level > 0);
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].classList.toggle("filled", i < level);
    }
  }
}
