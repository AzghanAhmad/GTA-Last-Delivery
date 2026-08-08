import { MapProjection, MAP_MARKERS, MARKER_COLORS } from "../world/WorldMap";

export interface OverlayActor {
  x: number;
  z: number;
  yaw: number;
  color: string;
  vehicle: boolean;
  /** When true, draw as a diamond (mission objective). */
  objective?: boolean;
  /** When set, draw a world-radius circle around the point (delivery zone). */
  radius?: number;
}

interface MarkerHit {
  id: string;
  label: string;
  kind: string;
  px: number;
  py: number;
}

/**
 * Full-city map overlay.
 *
 * Opens a panel that renders the entire world using the same WorldMap city
 * image and the same MapProjection as the minimap, so a world position always
 * lands on the exact same map pixel in both. All named locations are labeled,
 * the player (and any tracked vehicles/police) are drawn live, and hovering a
 * location shows a tooltip. The overlay pauses the game while open.
 *
 * Close paths: ESC, the M key, the close button, or clicking outside the panel.
 */
export class MapOverlay {
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly bgCanvas: HTMLCanvasElement;
  private readonly bgCtx: CanvasRenderingContext2D;
  private readonly fgCanvas: HTMLCanvasElement;
  private readonly fgCtx: CanvasRenderingContext2D;
  private readonly tooltip: HTMLElement;
  private readonly legend: HTMLElement;
  private projection: MapProjection;
  private isOpen = false;
  private onClose: (() => void) | null = null;
  private hovered: MarkerHit | null = null;

  constructor(
    mount: HTMLElement,
    private readonly worldMap: import("../world/WorldMap").WorldMap,
  ) {
    this.root = mount;

    this.panel = document.createElement("div");
    this.panel.className = "map-panel";
    this.root.appendChild(this.panel);

    const closeBtn = document.createElement("button");
    closeBtn.className = "map-close";
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Close map");
    this.panel.appendChild(closeBtn);

    this.bgCanvas = document.createElement("canvas");
    this.bgCanvas.className = "map-bg";
    this.fgCanvas = document.createElement("canvas");
    this.fgCanvas.className = "map-fg";
    this.panel.appendChild(this.bgCanvas);
    this.panel.appendChild(this.fgCanvas);

    this.tooltip = document.createElement("div");
    this.tooltip.className = "map-tooltip";
    this.panel.appendChild(this.tooltip);

    this.legend = document.createElement("div");
    this.legend.className = "map-legend";
    this.panel.appendChild(this.legend);
    this.buildLegend();

    const bg = this.bgCanvas.getContext("2d");
    const fg = this.fgCanvas.getContext("2d");
    if (!bg || !fg) throw new Error("Canvas 2D context unavailable for map overlay");
    this.bgCtx = bg;
    this.fgCtx = fg;

    this.projection = new MapProjection(1024);

    closeBtn.addEventListener("click", () => this.close());
    this.root.addEventListener("click", (event) => {
      if (event.target === this.root) this.close();
    });
    this.fgCanvas.addEventListener("mousemove", (event) => this.onMouseMove(event));
    this.fgCanvas.addEventListener("mouseleave", () => {
      this.hovered = null;
      this.tooltip.classList.remove("visible");
    });
  }

  /** Shows the overlay and pauses gameplay. */
  open(onClose: () => void): void {
    this.onClose = onClose;
    this.isOpen = true;
    this.root.classList.add("open");
    this.resize();
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove("open");
    this.tooltip.classList.remove("visible");
    this.hovered = null;
    this.onClose?.();
  }

  get isMapOpen(): boolean {
    return this.isOpen;
  }

  /** Re-measures the panel and redraws the static map + labels. */
  resize(): void {
    const css = this.panel.clientWidth;
    if (css === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = css;
    for (const canvas of [this.bgCanvas, this.fgCanvas]) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    }
    // Projection works in CSS pixels; both canvases scale drawing by `dpr`.
    this.projection = new MapProjection(size);
    this.drawBackground();
  }

  /** Draws actors (player/vehicle/police) for the current frame. */
  render(actors: readonly OverlayActor[] = []): void {
    if (!this.isOpen) return;
    const ctx = this.fgCtx;
    const dpr = this.fgCanvas.width / (this.fgCanvas.clientWidth || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.fgCanvas.clientWidth, this.fgCanvas.clientHeight);

    const size = this.fgCanvas.clientWidth;
    for (const actor of actors) {
      const p = this.projection.toPx(actor.x, actor.z);
      this.drawActor(p.x, p.y, actor.yaw, actor.color, actor.vehicle, actor.objective ?? false, actor.radius);
    }

    if (this.hovered) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.hovered.px, this.hovered.py, 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Compass "N" so the map reads as north-up.
    ctx.fillStyle = "rgba(220, 230, 250, 0.9)";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", size * 0.5, 18);
    ctx.fillStyle = "rgba(220, 230, 250, 0.5)";
    ctx.beginPath();
    ctx.moveTo(size * 0.5, 24);
    ctx.lineTo(size * 0.5 - 4, 33);
    ctx.lineTo(size * 0.5 + 4, 33);
    ctx.closePath();
    ctx.fill();
  }

  private drawActor(px: number, py: number, yaw: number, color: string, vehicle: boolean, objective = false, radius: number | null = null): void {
    const ctx = this.fgCtx;
    const r = 10;
    ctx.save();
    ctx.translate(px, py);
    if (radius) {
      const rr = Math.max(3, radius * this.projection.pxPerMeter);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.rotate(-yaw);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(10, 16, 26, 0.95)";
    ctx.lineWidth = 2;
    if (objective) {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.5);
      ctx.lineTo(r * 1.5, 0);
      ctx.lineTo(0, r * 1.5);
      ctx.lineTo(-r * 1.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (vehicle) {
      ctx.fillRect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
      ctx.strokeRect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.6);
      ctx.lineTo(r, r);
      ctx.lineTo(0, r * 0.35);
      ctx.lineTo(-r, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private onMouseMove(event: MouseEvent): void {
    const rect = this.fgCanvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;

    let best: MarkerHit | null = null;
    let bestDist = 26;
    for (const marker of MAP_MARKERS) {
      const p = this.projection.toPx(marker.x, marker.z);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestDist) {
        bestDist = d;
        best = { id: marker.id, label: marker.label, kind: marker.kind, px: p.x, py: p.y };
      }
    }
    this.hovered = best;
    if (best) {
      this.tooltip.textContent = best.label;
      this.tooltip.style.left = `${px + 14}px`;
      this.tooltip.style.top = `${py - 6}px`;
      this.tooltip.classList.add("visible");
    } else {
      this.tooltip.classList.remove("visible");
    }
    this.render();
  }

  private drawBackground(): void {
    const ctx = this.bgCtx;
    const dpr = this.bgCanvas.width / (this.bgCanvas.clientWidth || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = this.bgCanvas.clientWidth;
    ctx.fillStyle = "#0b111a";
    ctx.fillRect(0, 0, size, size);

    const mapCanvas = this.worldMap.staticCanvas;
    ctx.drawImage(mapCanvas, 0, 0, size, size);

    // Labels for every named location, drawn crisp at the panel's resolution.
    for (const marker of MAP_MARKERS) {
      const p = this.projection.toPx(marker.x, marker.z);
      const color = MARKER_COLORS[marker.kind];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(10, 16, 26, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(230, 238, 250, 0.95)";
      ctx.fillText(marker.label, p.x + 11, p.y);
    }
  }

  private buildLegend(): void {
    const items: Array<[string, string]> = [
      ["Spawn", "spawn"],
      ["Landmark", "landmark"],
      ["Police", "police"],
      ["Gas", "gas"],
      ["Warehouse", "warehouse"],
      ["Docks", "docks"],
    ];
    for (const [label, kind] of items) {
      const item = document.createElement("span");
      item.className = "map-legend-item";
      const dot = document.createElement("span");
      dot.className = "map-legend-dot";
      dot.style.background = MARKER_COLORS[kind as keyof typeof MARKER_COLORS];
      item.appendChild(dot);
      item.appendChild(document.createTextNode(label));
      this.legend.appendChild(item);
    }
    const hint = document.createElement("span");
    hint.className = "map-legend-hint";
    hint.textContent = "ESC / M to close";
    this.legend.appendChild(hint);
  }
}
