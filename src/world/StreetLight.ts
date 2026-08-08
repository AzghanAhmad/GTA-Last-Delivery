import * as THREE from "three";
import { MaterialManager } from "../core/MaterialManager";

export type StreetLightKind = "orange" | "white";

export interface StreetLightDef {
  x: number;
  z: number;
  /** Heading; the lamp arm extends +X in local space. */
  yaw: number;
  /** Sodium orange on main roads, cooler white in residential/industrial. */
  kind: StreetLightKind;
  /** Whether this light casts a real PointLight (use sparingly). */
  withLight: boolean;
}

/**
 * Street lights built as instanced meshes (poles + lamp heads) so a whole
 * street stays at a handful of draw calls. Two lamp kinds are supported and
 * each head gets a soft additive glow disc underneath that feeds the bloom
 * pass. Only a small, explicit subset also gets a real PointLight to keep the
 * light count low on modest GPUs.
 */
export class StreetLightManager {
  private readonly defs: StreetLightDef[] = [];

  add(def: StreetLightDef): void {
    this.defs.push(def);
  }

  get count(): number {
    return this.defs.length;
  }

  build(scene: THREE.Scene, materials = new MaterialManager()): void {
    if (this.defs.length === 0) return;

    const poleMat = materials.standard("streetPoleMat", {
      color: 0x1b222e,
      roughness: 0.45,
      metalness: 0.65,
    });
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, this.defs.length);
    poles.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const orangeDefs = this.defs.filter((d) => d.kind === "orange");
    const whiteDefs = this.defs.filter((d) => d.kind === "white");

    const orangeHeadMat = materials.standard("streetHeadOrangeMat", {
      color: 0xffd8a0,
      emissive: 0xffa848,
      emissiveIntensity: 2.5,
    });
    orangeHeadMat.userData.nightGlow = 2.5;
    const whiteHeadMat = materials.standard("streetHeadWhiteMat", {
      color: 0xfff2d8,
      emissive: 0xffe8c8,
      emissiveIntensity: 2.2,
    });
    whiteHeadMat.userData.nightGlow = 2.2;

    const headGeo = new THREE.BoxGeometry(0.95, 0.2, 0.28);
    const orangeHeads = new THREE.InstancedMesh(headGeo, orangeHeadMat, orangeDefs.length);
    const whiteHeads = new THREE.InstancedMesh(headGeo, whiteHeadMat, whiteDefs.length);
    orangeHeads.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    whiteHeads.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const discGeo = new THREE.PlaneGeometry(2.6, 2.6);
    const glowTexture = buildGlowTexture();
    const orangeDiscMat = new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: 0xffa040,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const whiteDiscMat = new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: 0xffe8c8,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orangeDiscs = new THREE.InstancedMesh(discGeo, orangeDiscMat, orangeDefs.length);
    const whiteDiscs = new THREE.InstancedMesh(discGeo, whiteDiscMat, whiteDefs.length);
    orangeDiscs.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    whiteDiscs.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    orangeDiscs.renderOrder = 3;
    whiteDiscs.renderOrder = 3;

    const m = new THREE.Matrix4();
    const rotation = new THREE.Matrix4();
    const offset = new THREE.Matrix4().makeTranslation(0.62, 0, 0);
    const pos = new THREE.Vector3();
    const down = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

    const place = (def: StreetLightDef, poleIndex: number, headIndex: number, kind: StreetLightKind): void => {
      rotation.makeRotationY(def.yaw);
      pos.set(def.x, 2.6, def.z);
      m.copy(rotation);
      m.setPosition(pos);
      poles.setMatrixAt(poleIndex, m);

      pos.set(def.x, 4.95, def.z);
      m.copy(rotation).multiply(offset);
      m.setPosition(pos);
      const headMesh = kind === "orange" ? orangeHeads : whiteHeads;
      headMesh.setMatrixAt(headIndex, m);

      pos.set(def.x, 4.32, def.z);
      m.copy(rotation).multiply(offset).multiply(down);
      m.setPosition(pos);
      const discMesh = kind === "orange" ? orangeDiscs : whiteDiscs;
      discMesh.setMatrixAt(headIndex, m);
    };

    let orangeHead = 0;
    let whiteHead = 0;
    for (let i = 0; i < this.defs.length; i++) {
      const def = this.defs[i];
      const isOrange = def.kind === "orange";
      const headIndex = isOrange ? orangeHead : whiteHead;
      place(def, i, headIndex, def.kind);
      if (isOrange) orangeHead++;
      else whiteHead++;

      if (def.withLight) {
        const color = isOrange ? 0xffa848 : 0xfff0d8;
        const intensity = isOrange ? 42 : 38;
        const light = new THREE.PointLight(color, intensity, 26, 2);
        light.userData.nightLight = intensity;
        light.position.set(def.x + Math.cos(def.yaw) * 0.5, 4.6, def.z + Math.sin(def.yaw) * 0.5);
        scene.add(light);
      }
    }

    scene.add(poles, orangeHeads, whiteHeads, orangeDiscs, whiteDiscs);
  }
}

function buildGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for lamp glow");
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}
