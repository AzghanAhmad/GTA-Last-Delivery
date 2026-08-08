import * as THREE from "three";

export interface StandardParams {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  map?: THREE.Texture | null;
  bumpMap?: THREE.Texture | null;
  bumpScale?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** When set, the material is collected by the day/night system and dimmed in daylight. */
  nightGlow?: number;
  name?: string;
}

export interface NoiseOptions {
  seed: number;
  size?: number;
  /** How rough the noise is; smaller = larger blotches. */
  scale?: number;
  /** Contrast of the grayscale values (0 = flat, 1 = strong). */
  contrast?: number;
  /** Overall brightness offset in the 0..1 range. */
  bias?: number;
}

/**
 * Central PBR material and procedural-texture factory.
 *
 * All MeshStandardMaterial instances are cached by key so that repeated props
 * and facades reuse GPU materials (low VRAM, few shader variants). Procedural
 * canvas textures provide subtle surface detail (bump) and color variation for
 * walls, asphalt and concrete without shipping texture files. Anisotropy is
 * applied once from the graphics tier.
 */
export class MaterialManager {
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private maxAnisotropy = 4;

  setMaxAnisotropy(value: number): void {
    this.maxAnisotropy = value;
    for (const texture of this.textures.values()) texture.anisotropy = value;
  }

  /** Returns a cached MeshStandardMaterial, creating it on first use. */
  standard(key: string, params: StandardParams): THREE.MeshStandardMaterial {
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: params.color ?? 0xffffff,
        roughness: params.roughness ?? 0.85,
        metalness: params.metalness ?? 0.05,
        emissive: params.emissive ?? 0x000000,
        emissiveIntensity: params.emissiveIntensity ?? 1,
        map: params.map ?? null,
        bumpMap: params.bumpMap ?? null,
        bumpScale: params.bumpScale ?? 0.02,
        transparent: params.transparent ?? false,
        opacity: params.opacity ?? 1,
        side: params.side ?? THREE.FrontSide,
        name: params.name ?? key,
      });
      if (params.nightGlow != null) material.userData.nightGlow = params.nightGlow;
      this.materials.set(key, material);
    }
    return material;
  }

  /**
   * A tileable grayscale noise texture used as a cheap bump/normal stand-in for
   * walls, asphalt and concrete. `contrast` maps noise onto a soft range.
   */
  noise(options: NoiseOptions): THREE.CanvasTexture {
    const size = options.size ?? 256;
    const key = `noise:${options.seed}:${size}:${options.scale ?? 6}:${options.contrast ?? 0.3}`;
    const cached = this.textures.get(key);
    if (cached) return cached;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable for noise texture");

    const scale = options.scale ?? 6;
    const contrast = options.contrast ?? 0.3;
    const bias = options.bias ?? 0.5;
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = valueNoise(x / scale, y / scale);
        const v = Math.min(1, Math.max(0, bias + (n - 0.5) * contrast * 2));
        const byte = Math.round(v * 255);
        const i = (y * size + x) * 4;
        data[i] = byte;
        data[i + 1] = byte;
        data[i + 2] = byte;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = this.maxAnisotropy;
    this.textures.set(key, texture);
    return texture;
  }

  /**
   * A tileable mottled color texture (asphalt/concrete/plaster). The painted
   * noise is subtle so it works as an albedo map and as a color multiplier for
   * large surfaces without looking noisy.
   */
  surface(key: string, base: THREE.ColorRepresentation, seed: number, size = 256, spread = 0.12): THREE.CanvasTexture {
    const cached = this.textures.get(key);
    if (cached) return cached;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable for surface texture");

    const [r, g, b] = colorToRgb(base);
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = valueNoise(x / 9 + seed * 0.37, y / 9 + seed * 0.23);
        const m = (n - 0.5) * 2 * spread;
        const i = (y * size + x) * 4;
        data[i] = Math.round(r * (1 + m));
        data[i + 1] = Math.round(g * (1 + m));
        data[i + 2] = Math.round(b * (1 + m));
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    this.textures.set(key, texture);
    return texture;
  }
}

/** Tiny deterministic value noise used by the procedural texture generators. */
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h00 = randAt(xi, yi);
  const h10 = randAt(xi + 1, yi);
  const h01 = randAt(xi, yi + 1);
  const h11 = randAt(xi + 1, yi + 1);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  return lerp(lerp(h00, h10, u), lerp(h01, h11, u), v);
}

/** Stable hash of integer coordinates mapped to 0..1 (repeatable tiles). */
function randAt(x: number, y: number): number {
  const h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  return ((h >>> 0) % 100000) / 100000;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colorToRgb(color: THREE.ColorRepresentation): [number, number, number] {
  const c = new THREE.Color(color);
  return [c.r * 255, c.g * 255, c.b * 255];
}
