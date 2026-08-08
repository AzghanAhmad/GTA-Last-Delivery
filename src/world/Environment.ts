import * as THREE from "three";

export interface EnvironmentConfig {
  fogNear: number;
  fogFar: number;
  fogColor: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  moonColor: number;
  moonIntensity: number;
}

export const defaultEnvironmentConfig: EnvironmentConfig = {
  fogNear: 35,
  fogFar: 380,
  fogColor: 0x0a1420,
  hemisphereSky: 0x4a5c7a,
  hemisphereGround: 0x14161e,
  hemisphereIntensity: 0.95,
  moonColor: 0x9db4ff,
  moonIntensity: 0.85,
};

/**
 * Night sky, fog and base lighting for the city.
 *
 * The sky is a cheap backside sphere with a canvas gradient + a moon disc
 * (one draw call). A hemisphere light gives a subtle blue fill and a cool
 * directional light acts as moonlight. No shadows and no expensive dynamic
 * lights here; accent lights are added per-district.
 */
export class Environment {
  constructor(scene: THREE.Scene, config: EnvironmentConfig = defaultEnvironmentConfig) {
    scene.background = buildSky();
    scene.fog = new THREE.Fog(config.fogColor, config.fogNear, config.fogFar);

    const hemisphere = new THREE.HemisphereLight(
      config.hemisphereSky,
      config.hemisphereGround,
      config.hemisphereIntensity,
    );
    scene.add(hemisphere);

    const moon = new THREE.DirectionalLight(config.moonColor, config.moonIntensity);
    moon.position.set(-70, 130, -90);
    scene.add(moon);
  }
}

function buildSky(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for sky");

  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#0d1730");
  gradient.addColorStop(0.55, "#141f3a");
  gradient.addColorStop(0.82, "#242e4e");
  gradient.addColorStop(1, "#343a60");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const moonX = 200;
  const moonY = 40;
  const glow = ctx.createRadialGradient(moonX, moonY, 2, moonX, moonY, 34);
  glow.addColorStop(0, "rgba(200, 220, 255, 0.9)");
  glow.addColorStop(0.25, "rgba(160, 185, 235, 0.45)");
  glow.addColorStop(1, "rgba(160, 185, 235, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#eef4ff";
  ctx.beginPath();
  ctx.arc(moonX, moonY, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(210, 220, 240, 0.55)";
  ctx.beginPath();
  ctx.arc(moonX - 3, moonY - 2, 3, 0, Math.PI * 2);
  ctx.arc(moonX + 3, moonY + 2, 2, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(220, 230, 255, ${0.25 + Math.random() * 0.6})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 150, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
