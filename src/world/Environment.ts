import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export interface EnvironmentConfig {
  fogNear: number;
  fogFar: number;
  fogColor: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  /** Constant base fill so nothing reads as pure black, even in deep night. */
  ambientColor: number;
  ambientIntensity: number;
  moonColor: number;
  moonIntensity: number;
  dayFogColor: number;
  dayFogNear: number;
  dayFogFar: number;
  dayHemisphereSky: number;
  dayHemisphereGround: number;
  dayHemisphereIntensity: number;
  dayAmbientColor: number;
  dayAmbientIntensity: number;
  sunColor: number;
  sunIntensity: number;
  /** Emissive glow multiplier applied to tagged night-glow materials during the day. */
  dayGlowFactor: number;
  /** Intensity multiplier applied to tagged night point lights during the day. */
  dayLightFactor: number;
  /** Tone mapping exposure (ACES filmic), tuned separately per mode. */
  nightExposure: number;
  dayExposure: number;
  /** Bloom pass settings; neon night relies on these. */
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
}

export const defaultEnvironmentConfig: EnvironmentConfig = {
  fogNear: 60,
  fogFar: 470,
  fogColor: 0x182433,
  hemisphereSky: 0x4a5c7a,
  hemisphereGround: 0x1b2030,
  hemisphereIntensity: 1.45,
  ambientColor: 0x2a3a55,
  ambientIntensity: 0.7,
  moonColor: 0x9db4ff,
  moonIntensity: 1.75,
  dayFogColor: 0xbfd3e6,
  dayFogNear: 180,
  dayFogFar: 820,
  dayHemisphereSky: 0xa8c8ee,
  dayHemisphereGround: 0x5a6a70,
  dayHemisphereIntensity: 1.9,
  dayAmbientColor: 0xffffff,
  dayAmbientIntensity: 0.4,
  sunColor: 0xfff2cc,
  sunIntensity: 2.6,
  dayGlowFactor: 0.12,
  dayLightFactor: 0.15,
  nightExposure: 1.45,
  dayExposure: 1.05,
  bloomStrength: 0.62,
  bloomRadius: 0.72,
  bloomThreshold: 0.68,
};

/**
 * Night/day sky, fog and base lighting for the city.
 *
 * The sky is a world-fixed backside sphere that follows the camera, so the
 * stars and moon never appear to move with the view (one draw call, two
 * equirectangular canvas textures swapped on demand). A hemisphere light and
 * two directional lights (moon/sun) provide base lighting; the L key toggles
 * day and night. Materials tagged with `userData.nightGlow` and point lights
 * tagged with `userData.nightLight` are collected once and dimmed during the
 * day so the city does not stay neon-bright at noon.
 */
export class Environment {
  readonly config: EnvironmentConfig;
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly skyDome: THREE.Mesh;
  private readonly skyMaterial: THREE.MeshBasicMaterial;
  private readonly nightTexture: THREE.Texture;
  private readonly dayTexture: THREE.Texture;
  private readonly fog: THREE.Fog;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly moon: THREE.DirectionalLight;
  private readonly sun: THREE.DirectionalLight;
  private isDay = true;
  private glowMaterials: THREE.MeshStandardMaterial[] | null = null;
  private nightLights: THREE.PointLight[] | null = null;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private postFXEnabled = true;
  private fogScale = 1;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, config: EnvironmentConfig = defaultEnvironmentConfig) {
    this.config = config;
    this.scene = scene;
    this.renderer = renderer;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = config.dayExposure;

    this.nightTexture = buildNightSky();
    this.dayTexture = buildDaySky();
    this.skyMaterial = new THREE.MeshBasicMaterial({
      map: this.dayTexture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), this.skyMaterial);
    this.skyDome.renderOrder = -1;
    this.skyDome.name = "skyDome";
    scene.add(this.skyDome);

    // The game starts in daylight; the L key toggles into the neon night.
    this.fog = new THREE.Fog(config.dayFogColor, config.dayFogNear, config.dayFogFar);
    scene.fog = this.fog;

    this.hemisphere = new THREE.HemisphereLight(
      config.dayHemisphereSky,
      config.dayHemisphereGround,
      config.dayHemisphereIntensity,
    );
    scene.add(this.hemisphere);

    this.ambient = new THREE.AmbientLight(config.dayAmbientColor, config.dayAmbientIntensity);
    scene.add(this.ambient);

    this.moon = new THREE.DirectionalLight(config.moonColor, 0);
    this.moon.position.set(-70, 130, -90);
    scene.add(this.moon);

    this.sun = new THREE.DirectionalLight(config.sunColor, config.sunIntensity);
    this.sun.position.set(120, 200, 80);
    scene.add(this.sun);

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      config.bloomStrength,
      config.bloomRadius,
      config.bloomThreshold,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  /** Renders the scene, running the bloom pass when post-FX is enabled. */
  render(camera: THREE.Camera): void {
    if (this.postFXEnabled) {
      this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, camera);
    }
  }

  /** F4: toggles the bloom post-processing on and off. */
  togglePostFX(): boolean {
    this.postFXEnabled = !this.postFXEnabled;
    return this.postFXEnabled;
  }

  get postFX(): boolean {
    return this.postFXEnabled;
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  /** Graphics-quality hook: pulls fog in when running on weaker hardware. */
  setFogScale(scale: number): void {
    this.fogScale = scale;
    this.applyFog();
  }

  /** Configures the sun/moon shadow maps to follow the player. */
  configureShadows(mapSize: number, distance: number, bias: number, normalBias: number): void {
    const configure = (light: THREE.DirectionalLight): void => {
      light.castShadow = mapSize > 0;
      light.shadow.mapSize.set(mapSize, mapSize);
      light.shadow.camera.left = -distance;
      light.shadow.camera.right = distance;
      light.shadow.camera.top = distance;
      light.shadow.camera.bottom = -distance;
      light.shadow.camera.near = 10;
      light.shadow.camera.far = 430;
      light.shadow.bias = bias;
      light.shadow.normalBias = normalBias;
      light.shadow.camera.updateProjectionMatrix();
      light.shadow.updateMatrices(light);
    };
    configure(this.moon);
    configure(this.sun);
    this.scene.add(this.moon.target);
    this.scene.add(this.sun.target);
  }

  get dayMode(): boolean {
    return this.isDay;
  }

  /** Keeps the sky dome centered on the camera and shadows following the player. */
  update(cameraPosition: THREE.Vector3): void {
    this.skyDome.position.copy(cameraPosition);
    if (this.moon.target.position.equals(cameraPosition)) return;
    this.moon.position.set(cameraPosition.x - 70, 130, cameraPosition.z - 90);
    this.moon.target.position.copy(cameraPosition);
    this.sun.position.set(cameraPosition.x + 120, 200, cameraPosition.z + 80);
    this.sun.target.position.copy(cameraPosition);
  }

  toggleDayNight(): void {
    this.setDayMode(!this.isDay);
  }

  setDayMode(day: boolean): void {
    if (this.isDay === day) return;
    this.isDay = day;
    this.applyMode();
  }

  private applyMode(): void {
    const c = this.config;
    if (this.isDay) {
      this.skyMaterial.map = this.dayTexture;
      this.fog.color.set(c.dayFogColor);
      this.hemisphere.color.set(c.dayHemisphereSky);
      this.hemisphere.groundColor.set(c.dayHemisphereGround);
      this.hemisphere.intensity = c.dayHemisphereIntensity;
      this.ambient.color.set(c.dayAmbientColor);
      this.ambient.intensity = c.dayAmbientIntensity;
      this.moon.intensity = 0;
      this.sun.intensity = c.sunIntensity;
      this.renderer.toneMappingExposure = c.dayExposure;
    } else {
      this.skyMaterial.map = this.nightTexture;
      this.fog.color.set(c.fogColor);
      this.hemisphere.color.set(c.hemisphereSky);
      this.hemisphere.groundColor.set(c.hemisphereGround);
      this.hemisphere.intensity = c.hemisphereIntensity;
      this.ambient.color.set(c.ambientColor);
      this.ambient.intensity = c.ambientIntensity;
      this.moon.intensity = c.moonIntensity;
      this.sun.intensity = 0;
      this.renderer.toneMappingExposure = c.nightExposure;
    }
    this.applyFog();
    this.skyMaterial.needsUpdate = true;

    this.collectEmissives();
    this.applyEmissives();
  }

  /**
   * Re-collects tagged emissives and re-applies the current mode's dimming.
   * Call once after the whole city has been built, since the constructor runs
   * before most of the world exists.
   */
  refreshMode(): void {
    this.collectEmissives();
    this.applyEmissives();
  }

  private applyEmissives(): void {
    const c = this.config;
    const glowFactor = this.isDay ? c.dayGlowFactor : 1;
    for (const material of this.glowMaterials ?? []) {
      material.emissiveIntensity = material.userData.nightGlow * glowFactor;
    }
    const lightFactor = this.isDay ? c.dayLightFactor : 1;
    for (const light of this.nightLights ?? []) {
      light.intensity = light.userData.nightLight * lightFactor;
    }
  }

  private applyFog(): void {
    const c = this.config;
    if (this.isDay) {
      this.fog.near = c.dayFogNear * this.fogScale;
      this.fog.far = c.dayFogFar * this.fogScale;
    } else {
      this.fog.near = c.fogNear * this.fogScale;
      this.fog.far = c.fogFar * this.fogScale;
    }
  }

  /** Collects tagged emissive materials and point lights. */
  private collectEmissives(): void {
    const materials = new Set<THREE.MeshStandardMaterial>();
    const lights = new Set<THREE.PointLight>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          if (material.userData.nightGlow != null) {
            materials.add(material as THREE.MeshStandardMaterial);
          }
        }
      } else if (object instanceof THREE.PointLight) {
        if (object.userData.nightLight != null) lights.add(object);
      }
    });
    this.glowMaterials = [...materials];
    this.nightLights = [...lights];
  }
}

function buildNightSky(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for night sky");

  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#070b18");
  gradient.addColorStop(0.45, "#0d1730");
  gradient.addColorStop(0.75, "#141f3a");
  gradient.addColorStop(0.92, "#242e4e");
  gradient.addColorStop(1, "#343a60");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);

  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(220, 230, 255, ${0.2 + Math.random() * 0.55})`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 380, 1.4, 1.4);
  }

  const moonX = 820;
  const moonY = 120;
  const glow = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 90);
  glow.addColorStop(0, "rgba(205, 222, 255, 0.95)");
  glow.addColorStop(0.2, "rgba(170, 195, 245, 0.4)");
  glow.addColorStop(1, "rgba(170, 195, 245, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 90, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#eef4ff";
  ctx.beginPath();
  ctx.arc(moonX, moonY, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(210, 220, 240, 0.5)";
  ctx.beginPath();
  ctx.arc(moonX - 9, moonY - 6, 8, 0, Math.PI * 2);
  ctx.arc(moonX + 9, moonY + 7, 6, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildDaySky(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for day sky");

  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#2a6fdb");
  gradient.addColorStop(0.55, "#7fb2ea");
  gradient.addColorStop(0.8, "#c6ddf2");
  gradient.addColorStop(0.95, "#dbe8f4");
  gradient.addColorStop(1, "#dfeaf4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);

  const sunX = 300;
  const sunY = 120;
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 120);
  glow.addColorStop(0, "rgba(255, 250, 235, 1)");
  glow.addColorStop(0.15, "rgba(255, 244, 200, 0.7)");
  glow.addColorStop(1, "rgba(255, 244, 200, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 120, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fffbe8";
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  for (const [cx, cy, r] of [
    [700, 200, 40],
    [760, 195, 46],
    [820, 205, 34],
    [300, 330, 50],
    [360, 325, 60],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
