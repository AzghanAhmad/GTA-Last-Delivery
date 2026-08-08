import * as THREE from "three";
import type { WorldCollision } from "./WorldCollision";
import { MaterialManager } from "../core/MaterialManager";

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

interface TypeStyle {
  facadeColor: number;
  facadeSeed: number;
  roughness: number;
  windowTint: number;
  litChance: number;
  cellW: number;
  cellH: number;
  winW: number;
  winH: number;
  groundH: number;
  balconies: boolean;
  fireEscape: boolean;
  groundStyle: "storefront" | "lobby" | "doors" | "plain";
}

const TYPE_STYLES: Record<BuildingType, TypeStyle> = {
  low: {
    facadeColor: 0x8f969e, facadeSeed: 11, roughness: 0.85,
    windowTint: 0xffcf8f, litChance: 0.3, cellW: 2.9, cellH: 2.7, winW: 1.1, winH: 1.2,
    groundH: 2.4, balconies: false, fireEscape: false, groundStyle: "plain",
  },
  shop: {
    facadeColor: 0x87909a, facadeSeed: 23, roughness: 0.82,
    windowTint: 0xffd9a0, litChance: 0.42, cellW: 2.9, cellH: 2.8, winW: 1.3, winH: 1.5,
    groundH: 3.1, balconies: false, fireEscape: false, groundStyle: "storefront",
  },
  office: {
    facadeColor: 0x66748a, facadeSeed: 37, roughness: 0.78,
    windowTint: 0xbfd4ff, litChance: 0.22, cellW: 2.6, cellH: 2.7, winW: 2.0, winH: 1.7,
    groundH: 2.6, balconies: false, fireEscape: true, groundStyle: "lobby",
  },
  apartment: {
    facadeColor: 0x9a8b7c, facadeSeed: 41, roughness: 0.86,
    windowTint: 0xffcf8f, litChance: 0.45, cellW: 2.8, cellH: 2.8, winW: 1.4, winH: 1.7,
    groundH: 2.6, balconies: true, fireEscape: true, groundStyle: "lobby",
  },
  warehouse: {
    facadeColor: 0x6e767e, facadeSeed: 53, roughness: 0.9,
    windowTint: 0x8fb0c8, litChance: 0.06, cellW: 6, cellH: 4, winW: 1.2, winH: 1.1,
    groundH: 4.2, balconies: false, fireEscape: false, groundStyle: "doors",
  },
  police: {
    facadeColor: 0x7b8590, facadeSeed: 67, roughness: 0.8,
    windowTint: 0xcfe0ff, litChance: 0.3, cellW: 2.6, cellH: 2.7, winW: 1.6, winH: 1.5,
    groundH: 2.6, balconies: false, fireEscape: false, groundStyle: "lobby",
  },
  landmark: {
    facadeColor: 0x768295, facadeSeed: 71, roughness: 0.75,
    windowTint: 0x9fd8ff, litChance: 0.4, cellW: 2.6, cellH: 2.6, winW: 1.8, winH: 1.6,
    groundH: 2.8, balconies: false, fireEscape: false, groundStyle: "lobby",
  },
};

interface LodEntry {
  detail: THREE.Object3D;
  far: THREE.Object3D;
}

/**
 * Modular building visual system.
 *
 * Buildings are generated from a small palette of parametric styles (facade
 * color/texture, window grids, glass, ground-floor treatments, balconies, fire
 * escapes, roof details) rather than blank boxes. Geometry is merged per
 * building into a handful of draw calls with shared materials. Each building
 * also gets a low-detail shell for distance rendering; `updateLOD` swaps them
 * based on camera distance. Modular GLTF pieces can replace the procedural
 * detail via `setDetailPieces` without touching collision or layout.
 */
export class BuildingManager {
  private readonly scene: THREE.Scene;
  private readonly collision: WorldCollision;
  private readonly materials: MaterialManager;
  private readonly lodList: LodEntry[] = [];
  readonly roofMaterial: THREE.MeshStandardMaterial;
  private lodBias = 95;

  constructor(scene: THREE.Scene, collision: WorldCollision, materials = new MaterialManager()) {
    this.scene = scene;
    this.collision = collision;
    this.materials = materials;
    this.setLodBias(95);
    this.roofMaterial = materials.standard("buildingRoof", {
      color: 0x161a20,
      roughness: 0.95,
      metalness: 0.05,
    });
  }

  /** Shared facade material per type+variant, so districts reuse the look. */
  facadeMaterial(type: BuildingType, variant = 0): THREE.MeshStandardMaterial {
    const key = `facade:${type}:${variant}`;
    const style = TYPE_STYLES[type];
    const seed = style.facadeSeed + variant * 131;
    const map = this.materials.surface(key, style.facadeColor, seed, 256, 0.06);
    map.repeat.set(8, 8);
    const bump = this.materials.noise({ seed, size: 256, scale: 6, contrast: 0.18 });
    bump.repeat.set(8, 8);
    return this.materials.standard(key, {
      color: 0xffffff,
      roughness: style.roughness,
      metalness: 0.08,
      map,
      bumpMap: bump,
      bumpScale: 0.015,
    });
  }

  /** Builds one building, registers its collision and returns the group. */
  build(spec: BuildingSpec): THREE.Group {
    const style = TYPE_STYLES[spec.type];
    const variant = Math.abs(Math.round(spec.x + spec.z)) % 3;
    const facadeMat = this.facadeMaterial(spec.type, variant);
    const glassMat = this.windowGlassMaterial();
    const glowMat = this.windowGlowMaterial(spec.type);
    const trimMat = this.trimMaterial();

    const group = new THREE.Group();
    const detail = new THREE.Group();
    const far = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width, spec.height, spec.depth),
      facadeMat,
    );
    far.position.y = spec.height * 0.5;
    far.castShadow = false;
    detail.name = "detail";
    far.name = "far";

    const hw = spec.width * 0.5;
    const hd = spec.depth * 0.5;

    const walls = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.depth), facadeMat);
    walls.position.y = spec.height * 0.5;
    walls.castShadow = true;
    walls.receiveShadow = true;
    detail.add(walls);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width + 0.3, 0.45, spec.depth + 0.3),
      this.roofMaterial,
    );
    roof.position.y = spec.height + 0.22;
    detail.add(roof);

    const quadBuilder = new QuadBuilder();
    const glassBuilder = new QuadBuilder();
    const glowBuilder = new QuadBuilder();
    const trimBuilder = new QuadBuilder();
    const seed = hash(spec.x, spec.z);

    const parapet = 0.8;
    const gridBottom = style.groundH;
    const gridTop = spec.height - parapet;
    const available = gridTop - gridBottom;

    const sides = this.windowSides(spec, hw, hd);
    for (const side of sides) {
      const cols = Math.max(0, Math.floor((side.length - 2) / style.cellW));
      const rows = Math.max(0, Math.floor((available - 2) / style.cellH));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const along = side.start + (side.length - cols * style.cellW) / 2 + style.cellW * (c + 0.5);
          const wy = gridBottom + (available - rows * style.cellH) / 2 + style.cellH * (r + 0.5);
          const lit = rand01(seed + r * 31 + c * 17 + side.idx * 101) < style.litChance;
          this.addWindow(side, along, wy, style, glassBuilder, glowBuilder, trimBuilder, lit);
        }
      }
    }

    this.buildGround(spec, style, hw, hd, glassBuilder, trimBuilder, seed);

    if (style.balconies) this.buildBalconies(spec, style, hw, hd, trimBuilder, gridBottom, gridTop);
    if (style.fireEscape) this.buildFireEscape(spec, hw, hd, spec.height, trimBuilder, seed);
    this.buildRoofDetails(spec, hw, hd, trimBuilder, seed);

    if (glassBuilder.vertexCount > 0) {
      const glass = new THREE.Mesh(glassBuilder.geometry(), glassMat);
      detail.add(glass);
    }
    if (glowBuilder.vertexCount > 0) {
      const glow = new THREE.Mesh(glowBuilder.geometry(), glowMat);
      detail.add(glow);
    }
    if (trimBuilder.vertexCount > 0) {
      const trim = new THREE.Mesh(trimBuilder.geometry(), trimMat);
      trim.castShadow = true;
      detail.add(trim);
    }
    void quadBuilder;

    group.add(detail, far);
    group.position.set(spec.x, 0, spec.z);
    if (spec.yaw) group.rotation.y = spec.yaw;
    this.scene.add(group);

    this.collision.addBox(
      spec.x - hw,
      spec.z - hd,
      spec.x + hw,
      spec.z + hd,
      spec.height,
    );

    this.lodList.push({ detail, far });
    return group;
  }

  /** Swaps the procedural detail group for externally built GLTF pieces. */
  setDetailPieces(group: THREE.Group, pieces: THREE.Object3D): void {
    const detail = group.getObjectByName("detail");
    if (!detail) return;
    pieces.traverse((object) => {
      object.frustumCulled = true;
      if ((object as THREE.Mesh).isMesh) {
        (object as THREE.Mesh).castShadow = true;
        (object as THREE.Mesh).receiveShadow = true;
      }
    });
    detail.add(pieces);
  }

  /** Sets the distance at which building details swap to the far shell (from graphics settings). */
  setLodBias(distance: number): void {
    this.lodBias = distance;
  }

  /** Distance-based detail switching; call each frame with the camera position. */
  updateLOD(cameraPosition: THREE.Vector3, maxDetailDistance = this.lodBias): void {
    const threshold = maxDetailDistance * maxDetailDistance;
    for (const entry of this.lodList) {
      const dx = entry.detail.position.x - cameraPosition.x;
      const dz = entry.detail.position.z - cameraPosition.z;
      const farMode = dx * dx + dz * dz > threshold;
      if (entry.detail.visible === farMode) {
        entry.detail.visible = !farMode;
        entry.far.visible = farMode;
      }
    }
  }

  private windowGlassMaterial(): THREE.MeshStandardMaterial {
    return this.materials.standard("buildingGlass", {
      color: 0x101a26,
      metalness: 0.85,
      roughness: 0.16,
      transparent: true,
      opacity: 0.9,
    });
  }

  private windowGlowMaterial(type: BuildingType): THREE.MeshStandardMaterial {
    const style = TYPE_STYLES[type];
    return this.materials.standard(`buildingWindowGlow:${type}`, {
      color: 0xffffff,
      emissive: style.windowTint,
      emissiveIntensity: 1.7,
      roughness: 0.7,
      nightGlow: 1.7,
    });
  }

  private trimMaterial(): THREE.MeshStandardMaterial {
    return this.materials.standard("buildingTrim", {
      color: 0x1b2129,
      roughness: 0.6,
      metalness: 0.45,
    });
  }

  private addWindow(
    side: WindowSide,
    along: number,
    wy: number,
    style: TypeStyle,
    glass: QuadBuilder,
    glow: QuadBuilder,
    trim: QuadBuilder,
    lit: boolean,
  ): void {
    const w = style.winW;
    const h = style.winH;
    const inset = 0.02;
    if (side.axis === "x") {
      glass.quad(along, wy, side.faceZ * (side.depth + inset), w, h, 0, 0, side.faceZ);
      if (lit) glow.quad(along, wy, side.faceZ * (side.depth + inset + 0.04), w, h, 0, 0, side.faceZ);
      trim.quad(along, wy - h * 0.5 - 0.06, side.faceZ * (side.depth + inset - 0.02), w + 0.18, 0.08, 0, 0, side.faceZ);
    } else {
      glass.quad(side.faceX * (side.depth + inset), wy, along, w, h, side.faceX, 0, 0);
      if (lit) glow.quad(side.faceX * (side.depth + inset + 0.04), wy, along, w, h, side.faceX, 0, 0);
      trim.quad(side.faceX * (side.depth + inset - 0.02), wy - h * 0.5 - 0.06, along, w + 0.18, 0.08, side.faceX, 0, 0);
    }
  }

  private buildGround(
    spec: BuildingSpec,
    style: TypeStyle,
    hw: number,
    hd: number,
    glass: QuadBuilder,
    trim: QuadBuilder,
    seed: number,
  ): void {
    const gy = style.groundH;
    if (style.groundStyle === "storefront") {
      for (const side of this.windowSides(spec, hw, hd)) {
        const length = side.length - 1.2;
        const start = side.start + 0.6;
        const doorSide = Math.abs(seed) % 2 === 0 ? -1 : 1;
        const doorAt = side.start + side.length / 2;
        const doorW = 1.8;
        const bandTop = gy - 0.5;
        const bandH = bandTop - 0.4;
        const glassW = length - doorW;
        const glassStart = doorAt > start + length / 2 ? start : start + doorW;
        if (side.axis === "x") {
          glass.quad(doorAt + (glassStart - doorAt + glassW / 2), bandTop - bandH / 2, side.faceZ * (hd + 0.02), glassW, bandH, 0, 0, side.faceZ);
          glass.quad(doorAt, bandTop - 1.9 / 2, side.faceZ * (hd + 0.02), doorW, 1.9, 0, 0, side.faceZ);
          trim.quad(doorAt, 1.4, side.faceZ * (hd + 0.05), doorW + 0.2, 2.8, 0, 0, side.faceZ);
        } else {
          glass.quad(side.faceX * (hd + 0.02), bandTop - bandH / 2, doorAt + (glassStart - doorAt + glassW / 2), glassW, bandH, side.faceX, 0, 0);
          glass.quad(side.faceX * (hd + 0.02), bandTop - 1.9 / 2, doorAt, doorW, 1.9, side.faceX, 0, 0);
          trim.quad(side.faceX * (hd + 0.05), 1.4, doorAt, doorW + 0.2, 2.8, side.faceX, 0, 0);
        }
        void doorSide;
      }
    } else if (style.groundStyle === "doors") {
      for (const side of this.windowSides(spec, hw, hd)) {
        const doorW = 3.4;
        const doorH = style.groundH - 0.3;
        const count = Math.max(1, Math.floor(side.length / 5));
        for (let i = 0; i < count; i++) {
          const along = side.start + side.length * ((i + 0.5) / count);
          if (side.axis === "x") {
            trim.quad(along, doorH / 2, side.faceZ * (hd + 0.02), doorW, doorH, 0, 0, side.faceZ);
          } else {
            trim.quad(side.faceX * (hd + 0.02), doorH / 2, along, doorW, doorH, side.faceX, 0, 0);
          }
        }
      }
    } else if (style.groundStyle === "lobby") {
      const side = this.windowSides(spec, hw, hd)[Math.abs(seed) % 4];
      const doorW = 2.2;
      if (side.axis === "x") {
        trim.quad(side.start + side.length / 2, 1.5, side.faceZ * (hd + 0.04), doorW + 0.3, 3.0, 0, 0, side.faceZ);
        glass.quad(side.start + side.length / 2, 1.5, side.faceZ * (hd + 0.02), doorW, 3.0, 0, 0, side.faceZ);
      } else {
        trim.quad(side.faceX * (hd + 0.04), 1.5, side.start + side.length / 2, doorW + 0.3, 3.0, side.faceX, 0, 0);
        glass.quad(side.faceX * (hd + 0.02), 1.5, side.start + side.length / 2, doorW, 3.0, side.faceX, 0, 0);
      }
    }
    // Base band along every side so walls meet the ground cleanly.
    for (const side of this.windowSides(spec, hw, hd)) {
      if (side.axis === "x") {
        trim.quad(side.start + side.length / 2, 0.35, side.faceZ * (hd + 0.04), side.length, 0.7, 0, 0, side.faceZ);
      } else {
        trim.quad(side.faceX * (hd + 0.04), 0.35, side.start + side.length / 2, side.length, 0.7, side.faceX, 0, 0);
      }
    }
  }

  private buildBalconies(
    spec: BuildingSpec,
    style: TypeStyle,
    hw: number,
    hd: number,
    trim: QuadBuilder,
    gridBottom: number,
    gridTop: number,
  ): void {
    const balconyDepth = 0.55;
    const floors = Math.max(0, Math.floor((gridTop - gridBottom) / style.cellH));
    for (const side of this.windowSides(spec, hw, hd)) {
      const depth = side.depth;
      for (let f = 1; f < floors; f++) {
        const y = gridBottom + style.cellH * f - 0.15;
        if (side.axis === "x") {
          const zOut = side.faceZ * (depth + balconyDepth);
          trim.quad(side.start + side.length / 2, y, zOut, side.length, 0.08, 0, 0, side.faceZ);
          trim.quad(side.start + side.length / 2, y + 0.35, zOut, side.length, 0.06, 0, 0, side.faceZ);
        } else {
          const xOut = side.faceX * (depth + balconyDepth);
          trim.quad(xOut, y, side.start + side.length / 2, side.length, 0.08, side.faceX, 0, 0);
          trim.quad(xOut, y + 0.35, side.start + side.length / 2, side.length, 0.06, side.faceX, 0, 0);
        }
      }
    }
  }

  private buildFireEscape(
    spec: BuildingSpec,
    hw: number,
    hd: number,
    height: number,
    trim: QuadBuilder,
    seed: number,
  ): void {
    const sideIndex = Math.abs(seed) % 2 === 0 ? 1 : 2;
    const sides = this.windowSides(spec, hw, hd);
    const side = sides[sideIndex];
    const along = side.start + side.length * 0.22;
    const steps = Math.floor((height - 2) / 2.2);
    for (let i = 0; i <= steps; i++) {
      const y = 1.6 + i * 2.2;
      if (side.axis === "x") {
        trim.quad(along, y, side.faceZ * (hd + 0.06), 1.1, 0.05, 0, 0, side.faceZ);
      } else {
        trim.quad(side.faceX * (hd + 0.06), y, along, 1.1, 0.05, side.faceX, 0, 0);
      }
    }
  }

  private buildRoofDetails(
    spec: BuildingSpec,
    hw: number,
    hd: number,
    trim: QuadBuilder,
    seed: number,
  ): void {
    const roofY = spec.height + 0.5;
    const rand = mulberry32(seed + 7);
    const count = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const x = -hw + 1 + rand() * (spec.width - 2);
      const z = -hd + 1 + rand() * (spec.depth - 2);
      trim.box(x, roofY + 0.35, z, 0.9, 0.7, 0.9);
    }
    const vents = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < vents; i++) {
      const x = -hw + 1.5 + rand() * (spec.width - 3);
      const z = -hd + 1.5 + rand() * (spec.depth - 3);
      trim.box(x, roofY + 0.8, z, 0.4, 1.6, 0.4);
    }
  }

  private windowSides(spec: BuildingSpec, hw: number, hd: number): WindowSide[] {
    return [
      { idx: 0, axis: "x", faceZ: 1, depth: hd, start: -hw, length: spec.width },
      { idx: 1, axis: "x", faceZ: -1, depth: hd, start: -hw, length: spec.width },
      { idx: 2, axis: "z", faceX: 1, depth: hw, start: -hd, length: spec.depth },
      { idx: 3, axis: "z", faceX: -1, depth: hw, start: -hd, length: spec.depth },
    ];
  }
}

interface WindowSideBase {
  idx: number;
  /** Offset from the building center to the facade plane. */
  depth: number;
  /** Start coordinate of the wall along the perpendicular axis. */
  start: number;
  length: number;
}

interface WindowSideX extends WindowSideBase {
  axis: "x";
  /** Face normal component along Z (1 or -1). */
  faceZ: number;
}

interface WindowSideZ extends WindowSideBase {
  axis: "z";
  /** Face normal component along X (1 or -1). */
  faceX: number;
}

type WindowSide = WindowSideX | WindowSideZ;

/** Accumulates boxes/quads into a single BufferGeometry. */
class QuadBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];
  vertexCount = 0;

  /** A plane quad facing (nx,ny,nz), centered at (cx,cy,cz). */
  quad(cx: number, cy: number, cz: number, w: number, h: number, nx: number, ny: number, nz: number): void {
    const ax = Math.abs(nx);
    const az = Math.abs(nz);
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let ux = 0;
    let uy = 0;
    let uz = 0;
    if (az === 1) {
      rx = 1;
      rz = 0;
      ux = 0;
      uy = 1;
    } else if (ax === 1) {
      rz = 1;
      uy = 1;
    } else {
      rx = 1;
      uz = 1;
    }
    const hw = w * 0.5;
    const hh = h * 0.5;
    const corners: ReadonlyArray<[number, number, number]> = [
      [cx - rx * hw - ux * hh, cy - ry * hw - uy * hh, cz - rz * hw - uz * hh],
      [cx + rx * hw - ux * hh, cy + ry * hw - uy * hh, cz + rz * hw - uz * hh],
      [cx + rx * hw + ux * hh, cy + ry * hw + uy * hh, cz + rz * hw + uz * hh],
      [cx - rx * hw + ux * hh, cy - ry * hw + uy * hh, cz - rz * hw + uz * hh],
    ];
    const base = this.vertexCount;
    for (const [vx, vy, vz] of corners) {
      this.positions.push(vx, vy, vz);
      this.normals.push(nx, ny, nz);
    }
    this.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vertexCount += 4;
  }

  /** An axis-aligned box centered at (cx,cy,cz). */
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number): void {
    const hw = w * 0.5;
    const hh = h * 0.5;
    const hd = d * 0.5;
    this.quad(cx, cy, cz + hd, w, h, 0, 0, 1);
    this.quad(cx, cy, cz - hd, w, h, 0, 0, -1);
    this.quad(cx + hw, cy, cz, d, h, 1, 0, 0);
    this.quad(cx - hw, cy, cz, d, h, -1, 0, 0);
    this.quad(cx, cy + hh, cz, w, d, 0, 1, 0);
    this.quad(cx, cy - hh, cz, w, d, 0, -1, 0);
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function hash(x: number, z: number): number {
  return Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
}

function rand01(seed: number): number {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) | 0;
  s = Math.imul(s ^ (s >>> 13), 0x45d9f3b) | 0;
  return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
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
