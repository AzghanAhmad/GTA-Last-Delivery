import * as THREE from "three";
import type { Player } from "../player/Player";
import type { VehicleManager } from "../vehicles/VehicleManager";
import type { Environment } from "../world/Environment";
import type { GraphicsSettings } from "../core/GraphicsSettings";

export interface PerfHUDRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  player: Player;
  vehicleManager: VehicleManager;
  environment: Environment;
  settings: GraphicsSettings;
}

/**
 * Performance + diagnostics HUD.
 *
 * F4 toggles a compact FPS/frame-time/draw-call readout; F5 runs a quick
 * "test pass" that validates world build state (finite positions, object and
 * draw-call counts, quality tier, fog/bloom/day-night settings) and prints the
 * results to both the panel and the console. Dev-only diagnostics, kept out of
 * the shipped UI.
 */
export class PerfHUD {
  private readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly results: HTMLElement;
  private readonly refs: PerfHUDRefs;
  private updateAccum = 0;

  constructor(container: HTMLElement, refs: PerfHUDRefs) {
    this.refs = refs;

    this.root = document.createElement("div");
    this.root.id = "perf-hud";
    this.root.style.cssText = [
      "position:absolute",
      "top:12px",
      "right:12px",
      "font:11px/1.5 ui-monospace,Consolas,monospace",
      "color:#9fd8ff",
      "background:rgba(6,12,20,0.72)",
      "border:1px solid rgba(120,180,255,0.25)",
      "border-radius:6px",
      "padding:8px 10px",
      "pointer-events:none",
      "white-space:pre",
      "z-index:40",
    ].join(";");
    this.panel = document.createElement("div");
    this.results = document.createElement("div");
    this.results.style.cssText = "color:#ffe08a;margin-top:6px;padding-top:6px;border-top:1px dashed rgba(255,224,138,0.4)";
    this.root.appendChild(this.panel);
    this.root.appendChild(this.results);
    container.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.classList.contains("hidden");
  }

  toggleVisible(): void {
    this.root.classList.toggle("hidden");
  }

  update(delta: number): void {
    if (this.root.classList.contains("hidden")) return;
    this.updateAccum += delta;
    if (this.updateAccum < 0.25) return;
    this.updateAccum = 0;

    const info = this.rendererInfo();
    const { settings, environment } = this.refs;
    this.panel.textContent = [
      `fps  ${Math.round(1 / Math.max(delta, 1e-4))}`,
      `frame ${(delta * 1000).toFixed(1)} ms`,
      `draws ${info.calls}`,
      `tris  ${(info.triangles / 1000).toFixed(0)}k`,
      `objs  ${this.refs.scene.children.length}`,
      `quality ${settings.tier}`,
      `lod   ${settings.config.lodBias}`,
      `fog   ${this.fogDistance().toFixed(0)}m`,
      `bloom ${environment.postFX ? "on" : "off"}`,
      `mode  ${environment.dayMode ? "day" : "night"}`,
      `pixel ${settings.pixelRatio}`,
    ].join("\n");
  }

  /** F5: quick health pass over the world, printed to the panel and console. */
  runChecks(): void {
    const lines: string[] = [];
    const fail = (msg: string): void => {
      lines.push(`FAIL ${msg}`);
    };
    const ok = (msg: string): void => {
      lines.push(`ok   ${msg}`);
    };

    const finite = (label: string, v: number): void => {
      if (!Number.isFinite(v)) fail(`${label} not finite`);
    };
    const pos = this.refs.player.group.position;
    const cam = this.refs.camera.position;
    finite("player.x", pos.x);
    finite("player.z", pos.z);
    finite("camera.x", cam.x);
    finite("camera.z", cam.z);
    const vehicle = this.refs.vehicleManager.active;
    if (vehicle) {
      finite("vehicle.x", vehicle.group.position.x);
      finite("vehicle.z", vehicle.group.position.z);
    }

    const info = this.rendererInfo();
    ok(`objects ${this.refs.scene.children.length} / draws ${info.calls} / tris ${info.triangles}`);
    if (info.calls > 800) fail(`draw calls high (${info.calls})`);
    if (info.triangles > 3_000_000) fail(`triangle count high (${info.triangles})`);

    const { settings, environment } = this.refs;
    ok(`quality ${settings.tier} (pixel ${settings.pixelRatio}, lod ${settings.config.lodBias}, shadows ${settings.shadows ? "on" : "off"})`);
    ok(`fog ${this.fogDistance().toFixed(0)}m, bloom ${environment.postFX ? "on" : "off"}, ${environment.dayMode ? "day" : "night"}`);

    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (memory) ok(`js heap ${(memory.usedJSHeapSize / 1048576).toFixed(1)} MB`);
    else ok("heap n/a (non-Chromium)");

    const text = `[Last Delivery] test pass\n${lines.join("\n")}`;
    console.info(text);
    this.results.textContent = lines.join("\n");
    
    if (this.root.classList.contains("hidden")) this.toggleVisible();
  }

  private rendererInfo(): { calls: number; triangles: number } {
    return {
      calls: this.refs.renderer.info.render.calls,
      triangles: this.refs.renderer.info.render.triangles,
    };
  }

  private fogDistance(): number {
    const fog = this.refs.scene.fog;
    return fog instanceof THREE.Fog ? fog.far : 0;
  }
}
