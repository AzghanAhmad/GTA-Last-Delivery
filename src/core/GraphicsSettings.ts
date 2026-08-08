export type QualityTier = "low" | "medium" | "high";

export interface GraphicsConfig {
  /** Cap for devicePixelRatio (before render scale). */
  pixelRatioCap: number;
  /** Internal render scale; < 1 renders at a lower resolution. */
  renderScale: number;
  /** Resolution of the directional shadow map. */
  shadowMapSize: number;
  /** Half-width of the shadow camera around the player. */
  shadowDistance: number;
  shadowBias: number;
  shadowNormalBias: number;
  /** Multiplier applied to vegetation/instanced prop counts. */
  vegetationDensity: number;
  maxAnisotropy: number;
  /** Far plane for the main fog; shorter hides the world edge on low tiers. */
  fogFar: number;
  /** Distance at which building facade windows swap to their cheap LOD. */
  lodBias: number;
}

const LOW: GraphicsConfig = {
  pixelRatioCap: 1,
  renderScale: 0.72,
  shadowMapSize: 1024,
  shadowDistance: 45,
  shadowBias: -0.0006,
  shadowNormalBias: 0.025,
  vegetationDensity: 0.5,
  maxAnisotropy: 2,
  fogFar: 260,
  lodBias: 60,
};

const MEDIUM: GraphicsConfig = {
  pixelRatioCap: 1.5,
  renderScale: 1,
  shadowMapSize: 2048,
  shadowDistance: 85,
  shadowBias: -0.0005,
  shadowNormalBias: 0.03,
  vegetationDensity: 1,
  maxAnisotropy: 4,
  fogFar: 380,
  lodBias: 95,
};

const HIGH: GraphicsConfig = {
  pixelRatioCap: 2,
  renderScale: 1,
  shadowMapSize: 2048,
  shadowDistance: 130,
  shadowBias: -0.0004,
  shadowNormalBias: 0.035,
  vegetationDensity: 1.2,
  maxAnisotropy: 8,
  fogFar: 420,
  lodBias: 140,
};

const TIERS: Record<QualityTier, GraphicsConfig> = { low: LOW, medium: MEDIUM, high: HIGH };

/**
 * Simple graphics quality tier with an automatically detected default.
 *
 * The target hardware (NVIDIA MX330, 2 GB VRAM) maps to MEDIUM. Detection uses
 * the WebGL renderer string; the tier can be overridden by the caller so a
 * settings menu can be added later without touching the detection logic.
 */
export class GraphicsSettings {
  readonly tier: QualityTier;
  readonly config: GraphicsConfig;

  constructor(tier?: QualityTier) {
    this.tier = tier ?? detectTier();
    this.config = TIERS[this.tier];
  }

  static tiers(): readonly QualityTier[] {
    return ["low", "medium", "high"];
  }

  get pixelRatio(): number {
    return this.config.pixelRatioCap * this.config.renderScale;
  }

  get shadows(): boolean {
    return this.config.shadowMapSize > 0;
  }

  /** Fog far distance relative to the MEDIUM baseline. */
  get fogScale(): number {
    return this.config.fogFar / MEDIUM.fogFar;
  }
}

function detectTier(): QualityTier {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return "low";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "") || "";
    const s = name.toLowerCase();
    if (s.includes("swiftshader") || s.includes("llvmpipe") || s.includes("angle (google")) return "low";
    if (s.includes("mx") || s.includes("intel") || s.includes("hd graphics") || s.includes("gt ") || s.includes("gtx 10")) {
      return "medium";
    }
    if (s.includes("rtx") || s.includes("rx 6") || s.includes("rx 7") || s.includes("gtx 16") || s.includes("gtx 20")) {
      return "high";
    }
    return "medium";
  } catch {
    return "medium";
  }
}
