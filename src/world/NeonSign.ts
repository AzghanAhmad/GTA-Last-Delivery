import * as THREE from "three";

export interface NeonSignOptions {
  text: string;
  /** Hex color of the neon glow. */
  color: number;
  /** World width of the sign plane; height is derived from the text aspect. */
  width: number;
  height?: number;
  font?: string;
  background?: number | null;
  emissiveIntensity?: number;
}

/**
 * Reusable neon sign built from a canvas texture.
 *
 * The text is rendered with a soft glow onto a transparent canvas and used as
 * an emissive map, so the sign is bright and cheap (no lights). Uses fictional
 * text only. `build` returns a mesh; callers place it against facades or on
 * poles.
 */
export class NeonSign {
  static build(options: NeonSignOptions): THREE.Mesh {
    const font = options.font ?? "bold 64px system-ui, Arial, sans-serif";
    const texture = renderText(options.text, font, options.color, options.background ?? null);

    const aspect = options.height
      ? options.width / options.height
      : texture.image.width / texture.image.height;
    const material = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: options.color,
      emissiveMap: texture,
      emissiveIntensity: options.emissiveIntensity ?? 1.6,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.userData.nightGlow = options.emissiveIntensity ?? 1.6;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(options.width, options.width / aspect), material);
    return mesh;
  }

  /** Builds a billboard (sprite) version that always faces the camera. */
  static buildSprite(options: NeonSignOptions): THREE.Sprite {
    const font = options.font ?? "bold 64px system-ui, Arial, sans-serif";
    const texture = renderText(options.text, font, options.color, options.background ?? null);

    const material = new THREE.SpriteMaterial({
      color: 0xffffff,
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(options.width, options.width * 0.24, 1);
    return sprite;
  }
}

function renderText(text: string, font: string, color: number, background: number | null): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for neon sign");

  canvas.width = 512;
  canvas.height = 128;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (background != null) {
    ctx.fillStyle = "#" + background.toString(16).padStart(6, "0");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glowColor = "#" + color.toString(16).padStart(6, "0");

  const textWidth = ctx.measureText(text).width;
  const scale = Math.min(1, (canvas.width - 24) / textWidth);
  ctx.font = `bold ${Math.round(64 * scale)}px system-ui, Arial, sans-serif`;

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 28;
  ctx.fillStyle = glowColor;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
