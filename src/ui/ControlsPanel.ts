export interface ControlBinding {
  keys: string;
  label: string;
}

interface ControlsConfig {
  title: string;
  bindings: ControlBinding[];
}

const FOOT_CONTROLS: ControlsConfig = {
  title: "On Foot",
  bindings: [
    { keys: "W A S D", label: "Move" },
    { keys: "Shift", label: "Sprint" },
    { keys: "Space", label: "Jump" },
    { keys: "E", label: "Enter vehicle" },
  ],
};

const VEHICLE_CONTROLS: ControlsConfig = {
  title: "Driving",
  bindings: [
    { keys: "W A S D", label: "Drive" },
    { keys: "Space", label: "Handbrake" },
    { keys: "E", label: "Exit vehicle" },
  ],
};

/**
 * Compact HUD panel listing the current mode's controls.
 *
 * Swaps between foot and vehicle layouts so the hints always match what the
 * player can actually do. Renders statically and only re-renders when the mode
 * changes (not every frame).
 */
export class ControlsPanel {
  private readonly root: HTMLElement;
  private current: "foot" | "vehicle" | null = null;

  constructor(mount: HTMLElement) {
    this.root = mount;
    this.setMode("foot");
  }

  setMode(mode: "foot" | "vehicle"): void {
    if (this.current === mode) return;
    this.current = mode;
    const config = mode === "foot" ? FOOT_CONTROLS : VEHICLE_CONTROLS;

    this.root.innerHTML = "";
    const title = document.createElement("div");
    title.className = "controls-title";
    title.textContent = config.title;
    this.root.appendChild(title);

    for (const binding of config.bindings) {
      const row = document.createElement("div");
      row.className = "controls-row";
      const keys = document.createElement("span");
      keys.className = "controls-keys";
      keys.textContent = binding.keys;
      const label = document.createElement("span");
      label.className = "controls-label";
      label.textContent = binding.label;
      row.appendChild(keys);
      row.appendChild(label);
      this.root.appendChild(row);
    }
  }
}
