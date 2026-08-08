import * as THREE from "three";
import type { WorldCollision } from "./WorldCollision";

export type BuildingType = "low" | "shop" | "office" | "apartment" | "warehouse" | "police" | "landmark";

export interface BuildingSpec {
  type: BuildingType;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  yaw?: number;
}

interface FacadeOptions {
  cols: number;
  rows: number;
  seed: number;
  wallColor: string;
  litChance: number;
  warmChance: number;
  groundGlass: boolean;
  smallWindows: boolean;
}

interface TypeStyle {
  wallColor: string;
  litChance: number;
  warmChance: number;
  groundGlass: boolean;
  smallWindows: boolean;
  emissiveIntensity: number;
  variants: number;
}

const TYPE_STYLES: Record<BuildingType, TypeStyle> = {
  low: { wallColor: "#1a2026", litChance: 0.22, warmChance: 0.5, groundGlass: false, smallWindows: true, emissiveIntensity: 0.5, variants: 2 },
  shop: { wallColor: "#1c2229", litChance: 0.3, warmChance: 0.7, groundGlass: true, smallWindows: false, emissiveIntensity: 0.7, variants: 2 },
  office: { wallColor: "#141a22", litChance: 0.18, warmChance: 0.3, groundGlass: false, smallWindows: false, emissiveIntensity: 0.45, variants: 2 },
  apartment: { wallColor: "#1e242c", litChance: 0.34, warmChance: 0.75, groundGlass: false, smallWindows: false, emissiveIntensity: 0.6, variants: 3 },
  warehouse: { wallColor: "#151d24", litChance: 0.08, warmChance: 0.4, groundGlass: false, smallWindows: true, emissiveIntensity: 0.35, variants: 1 },
  police: { wallColor: "#242b35", litChance: 0.25, warmChance: 0.6, groundGlass: false, smallWindows: false, emissiveIntensity: 0.5, variants: 1 },
  landmark: { wallColor: "#1d2430", litChance: 0.4, warmChance: 0.5, groundGlass: false, smallWindows: true, emissiveIntensity: 0.7, variants: 1 },
};

/**
 * Modular building system.
 *
 * Facades are procedural canvas textures (dark walls + a grid of dark, dim,
 * warm-lit or cool-lit windows) shared per building type, so a whole district
 * costs only a few draw calls and textures. Buildings are simple boxes with a
 * shared roof material; variation comes from footprint, height, texture
 * variant and the per-district additions (awnings, signs, rooftop props).
 */
export class BuildingSystem {
  private readonly scene: THREE.Scene;
  private readonly collision: WorldCollision;
  private readonly facadeCache = new Map<string, THREE.MeshStandardMaterial>();
  readonly roofMaterial = new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.95 });

  constructor(scene: THREE.Scene, collision: WorldCollision) {
    this.scene = scene;
    this.collision = collision;
  }

  /** Builds a single building box, registers its collision and returns it. */
  build(spec: BuildingSpec): THREE.Group {
    const group = new THREE.Group();
    const variant = Math.abs(Math.round(spec.x + spec.z)) % this.style(spec.type).variants;
    const facade = this.facadeMaterial(spec.type, variant);

    const geometry = new THREE.BoxGeometry(spec.width, spec.height, spec.depth);
    const materials: THREE.Material[] = [facade, facade, this.roofMaterial, this.roofMaterial, facade, facade];
    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.y = spec.height * 0.5;
    group.add(mesh);

    group.position.set(spec.x, 0, spec.z);
    if (spec.yaw) group.rotation.y = spec.yaw;
    this.scene.add(group);

    this.collision.addBox(
      spec.x - spec.width * 0.5,
      spec.z - spec.depth * 0.5,
      spec.x + spec.width * 0.5,
      spec.z + spec.depth * 0.5,
      spec.height,
    );
    return group;
  }

  /** Shared facade material for a type, so districts can reuse the look. */
  facadeMaterial(type: BuildingType, variant = 0): THREE.MeshStandardMaterial {
    const key = `${type}:${variant}`;
    let material = this.facadeCache.get(key);
    if (!material) {
      const style = this.style(type);
      const texture = makeFacade({
        cols: 8,
        rows: 13,
        seed: type.length * 31 + variant * 17,
        wallColor: style.wallColor,
        litChance: style.litChance,
        warmChance: style.warmChance,
        groundGlass: style.groundGlass,
        smallWindows: style.smallWindows,
      });
      material = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: 0xffffff,
        emissiveMap: texture,
        emissiveIntensity: style.emissiveIntensity,
        roughness: 0.78,
        metalness: 0.08,
      });
      this.facadeCache.set(key, material);
    }
    return material;
  }

  private style(type: BuildingType): TypeStyle {
    return TYPE_STYLES[type];
  }
}

function makeFacade(options: FacadeOptions): THREE.CanvasTexture {
  const W = 256;
  const H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for facade");

  const rand = mulberry32(options.seed);

  ctx.fillStyle = options.wallColor;
  ctx.fillRect(0, 0, W, H);

  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(255,255,255,0.05)");
  shade.addColorStop(0.7, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  const parapetH = 42;
  const baseH = options.groundGlass ? 78 : 52;
  const gridTop = H - baseH;
  const gridBottom = parapetH;
  const usable = gridTop - gridBottom;

  const gap = options.smallWindows ? 5 : 4;
  const cellW = (W - (options.cols + 1) * gap) / options.cols;
  const cellH = (usable - (options.rows + 1) * gap) / options.rows;

  for (let r = 0; r < options.rows; r++) {
    for (let c = 0; c < options.cols; c++) {
      const x = gap + c * (cellW + gap);
      const y = gridBottom + gap + r * (cellH + gap);
      const roll = rand();
      let fill: string;
      if (roll < options.litChance) {
        const warm = rand() < options.warmChance;
        const bright = rand() < 0.5;
        if (warm) fill = bright ? "#ffcf8f" : "#e8a86a";
        else fill = bright ? "#cfe6ff" : "#7f9ec9";
      } else if (roll < options.litChance + 0.12) {
        fill = "#1d2a33";
      } else {
        fill = "#0b0f14";
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, cellW, cellH);

      if (fill !== "#0b0f14" && fill !== "#1d2a33") {
        ctx.fillStyle = "rgba(255,220,150,0.25)";
        ctx.fillRect(x, y, cellW, 2);
      }
    }
  }

  ctx.fillStyle = "#0a0d11";
  ctx.fillRect(0, 0, W, parapetH);
  ctx.fillStyle = "#1d2126";
  ctx.fillRect(0, parapetH - 6, W, 6);

  ctx.fillStyle = "#0a0d11";
  ctx.fillRect(0, gridTop, W, baseH);

  if (options.groundGlass) {
    const storeW = W - 28;
    const storeH = baseH - 16;
    const sx = (W - storeW) / 2;
    const sy = gridTop + 8;
    ctx.fillStyle = "#e8b46a";
    ctx.fillRect(sx, sy, storeW, storeH);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    for (let x = sx + 8; x < sx + storeW - 8; x += 22) {
      ctx.fillRect(x, sy, 6, storeH);
    }
    ctx.fillStyle = "#101418";
    ctx.fillRect(W * 0.5 - 9, sy, 18, storeH);
  } else {
    ctx.fillStyle = "#0d1014";
    ctx.fillRect(W * 0.5 - 12, gridTop + 8, 24, baseH - 8);
    ctx.fillStyle = "#1c2229";
    ctx.fillRect(W * 0.5 - 12, gridTop + 8, 24, 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
