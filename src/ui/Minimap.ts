import { WorldMap } from "../world/WorldMap";

export interface MinimapActor {
  x: number;
  z: number;
  yaw: number;
  color: string;
  /** True when the actor is a vehicle (square instead of arrow). */
  vehicle: boolean;
  /** When true, draw as a diamond (mission objective). */
  objective?: boolean;
  /** When set, draw a world-radius circle around the point (delivery zone). */
  radius?: number;
}

/**
 * Circular player-centered minimap drawn on a 2D canvas.
 *
 * Every frame the static city map canvas (WorldMap) is cropped around the
 * player's world position and rotated so "up" on screen equals the player's
 * forward heading, then the player arrow is drawn dead center. The radius is
 * a fixed world-space distance, so the scale never changes no matter where the
 * player goes.
 *
 * Rendering cost is one small canvas crop + a few arrows per frame; the actual
 * city map itself is a precomputed image, so there is no 3D scene involved.
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** World-space radius (in meters) shown around the player. */
  private readonly worldRadius = 52;
  private dpr: number;

  private readonly container: HTMLElement;

  constructor(
    container: HTMLElement,
    private readonly worldMap: WorldMap,
  ) {
    this.container = container;
    this.canvas = document.createElement("canvas");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = container.clientWidth || 176;
    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable for minimap");
    this.ctx = ctx;
    container.appendChild(this.canvas);
  }

  /** Keeps the backing store crisp when the container is resized. */
  resize(): void {
    const size = this.container.clientWidth || this.canvas.width / this.dpr;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(size * this.dpr);
    this.canvas.height = Math.round(size * this.dpr);
  }

  /** Redraws the minimap for the current frame. */
  update(actor: MinimapActor, extraActors: readonly MinimapActor[]): void {
    const size = this.canvas.width;
    const ctx = this.ctx;
    const pxPerMeter = size / (this.worldRadius * 2);

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw the city map crop centered on the player.
    const srcRadius = this.worldRadius * this.worldMap.projection.pxPerMeter;
    const playerPx = this.worldMap.projection.toPx(actor.x, actor.z);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    // Rotate the crop so the player's forward always points up on screen.
    ctx.rotate(actor.yaw - Math.PI);
    ctx.scale(pxPerMeter / this.worldMap.projection.pxPerMeter, pxPerMeter / this.worldMap.projection.pxPerMeter);
    ctx.drawImage(
      this.worldMap.staticCanvas,
      playerPx.x - srcRadius,
      playerPx.y - srcRadius,
      srcRadius * 2,
      srcRadius * 2,
      -size / 2,
      -size / 2,
      size,
      size,
    );
    ctx.restore();

    // Extra actors (police, parked cars) positioned relative to the player,
    // transformed with the same rotation that the map crop received above.
    const cos = Math.cos(actor.yaw);
    const sin = Math.sin(actor.yaw);
    for (const a of extraActors) {
      const dx = a.x - actor.x;
      const dz = a.z - actor.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.worldRadius) continue;
      const rx = -dx * cos + dz * sin;
      const ry = -dx * sin - dz * cos;
      this.drawActorMarker(ctx, size / 2 + rx * pxPerMeter, size / 2 + ry * pxPerMeter, a.yaw - actor.yaw, a.color, a.vehicle, pxPerMeter, a.objective ?? false, a.radius);
    }

    // Player arrow, always dead center and pointing "up".
    this.drawActorMarker(ctx, size / 2, size / 2, 0, actor.color, actor.vehicle, pxPerMeter, actor.objective ?? false, actor.radius);
    ctx.restore();

    // Rounded vignette rim.
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - this.dpr, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120, 160, 210, 0.35)";
    ctx.lineWidth = this.dpr * 2;
    ctx.stroke();
  }

  private drawActorMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    yaw: number,
    color: string,
    vehicle: boolean,
    pxPerMeter: number,
    objective = false,
    radius: number | null = null,
  ): void {
    const r = Math.max(3.5, pxPerMeter * 1.35);
    ctx.save();
    ctx.translate(x, y);
    if (radius) {
      const rr = Math.max(2, radius * pxPerMeter);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.rotate(-yaw);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(12, 18, 28, 0.9)";
    ctx.lineWidth = 1.5;
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
      ctx.beginPath();
      ctx.rect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
      ctx.fill();
      ctx.stroke();
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
}
