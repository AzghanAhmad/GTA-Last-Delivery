/**
 * Minimal reusable interaction prompt overlay.
 *
 * Displays a single centered line at the bottom of the screen (e.g. "Press E
 * to enter vehicle"). A full HUD will replace this later, but the interaction
 * concept is kept reusable for future enter/NPC/pickup interactions.
 */
export class InteractionPrompt {
  private readonly element: HTMLElement;

  constructor(container: HTMLElement) {
    const element = container.querySelector<HTMLElement>("#interaction-prompt");
    if (!element) throw new Error("Missing #interaction-prompt in index.html");
    this.element = element;
  }

  show(text: string): void {
    this.element.textContent = text;
    this.element.classList.remove("hidden");
  }

  hide(): void {
    this.element.classList.add("hidden");
  }
}
