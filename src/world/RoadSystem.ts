import * as THREE from "three";
import { MaterialManager } from "../core/MaterialManager";

export interface RoadConfig {
  mainRoadWidth: number;
  sideRoadWidth: number;
  sidewalkWidth: number;
  laneWidth: number;
  asphaltColor: number;
  sidewalkColor: number;
  curbColor: number;
  centerLineColor: number;
  laneLineColor: number;
  dashLength: number;
  dashGap: number;
}

export const defaultRoadConfig: RoadConfig = {
  mainRoadWidth: 26,
  sideRoadWidth: 22,
  sidewalkWidth: 2.6,
  laneWidth: 3.2,
  asphaltColor: 0x2a2d31,
  sidewalkColor: 0x6d6f74,
  curbColor: 0x52545a,
  centerLineColor: 0xd8b84a,
  laneLineColor: 0xc9ccd2,
  dashLength: 3,
  dashGap: 3,
};

/** A road segment running along one axis. */
export interface RoadLine {
  /** Center coordinate (x for a vertical road, z for a horizontal one). */
  coordinate: number;
  width: number;
  /** Start/end along the road's own axis. */
  from: number;
  to: number;
}

/**
 * Road network builder.
 *
 * Roads use a PBR asphalt material (procedural color + bump maps, repeated
 * along the segment) with concrete sidewalks, raised curbs, dashed lane
 * markings, zebra crosswalks, manhole covers and subtle drain gutters. All
 * road surfaces stay walkable/drivable (no colliders). Markings, crosswalks,
 * manholes and gutters are InstancedMesh for a low draw-call budget.
 */
export class RoadSystem {
  private readonly scene: THREE.Scene;
  private readonly config: RoadConfig;
  private readonly materials: MaterialManager;

  private readonly asphaltMat: THREE.MeshStandardMaterial;
  private readonly sidewalkMat: THREE.MeshStandardMaterial;
  private readonly curbMat: THREE.MeshStandardMaterial;
  private readonly centerLineMat: THREE.MeshStandardMaterial;
  private readonly laneLineMat: THREE.MeshStandardMaterial;
  private readonly gutterMat: THREE.MeshStandardMaterial;
  private readonly manholeMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, config: RoadConfig = defaultRoadConfig, materials = new MaterialManager()) {
    this.scene = scene;
    this.config = config;
    this.materials = materials;

    const asphaltMap = materials.surface("roadAsphalt", config.asphaltColor, 31, 256, 0.14);
    asphaltMap.repeat.set(4, 60);
    const asphaltBump = materials.noise({ seed: 32, size: 256, scale: 5, contrast: 0.3, bias: 0.5 });
    asphaltBump.repeat.set(4, 60);
    this.asphaltMat = materials.standard("roadAsphaltMat", {
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.02,
      map: asphaltMap,
      bumpMap: asphaltBump,
      bumpScale: 0.03,
    });

    const sidewalkMap = materials.surface("roadSidewalk", config.sidewalkColor, 44, 256, 0.09);
    sidewalkMap.repeat.set(6, 60);
    this.sidewalkMat = materials.standard("roadSidewalkMat", {
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.01,
      map: sidewalkMap,
      bumpMap: materials.noise({ seed: 45, size: 256, scale: 6, contrast: 0.2 }),
      bumpScale: 0.02,
    });

    this.curbMat = materials.standard("roadCurbMat", {
      color: config.curbColor,
      roughness: 0.85,
      metalness: 0.03,
    });
    this.centerLineMat = materials.standard("roadCenterLineMat", {
      color: config.centerLineColor,
      roughness: 0.55,
      metalness: 0,
    });
    this.laneLineMat = materials.standard("roadLaneLineMat", {
      color: config.laneLineColor,
      roughness: 0.55,
      metalness: 0,
    });
    this.gutterMat = materials.standard("roadGutterMat", {
      color: 0x1b1e22,
      roughness: 0.95,
      metalness: 0.05,
    });
    this.manholeMat = materials.standard("roadManholeMat", {
      color: 0x20242a,
      roughness: 0.8,
      metalness: 0.5,
    });
  }

  build(vertical: readonly RoadLine[], horizontal: readonly RoadLine[], worldHalf: number): void {
    this.buildBase(worldHalf);
    for (const road of vertical) this.buildRoad(road, true);
    for (const road of horizontal) this.buildRoad(road, false);
    this.buildMarkings(vertical, horizontal);
    this.buildCrosswalks(vertical, horizontal);
    this.buildPatches(vertical, horizontal);
    this.buildManholes(vertical, horizontal);
    this.buildGutters(vertical, horizontal);
  }

  /** Dark ground so nothing shows the void between roads and at the outskirts. */
  private buildBase(worldHalf: number): void {
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(worldHalf * 2, worldHalf * 2),
      this.materials.standard("roadBase", { color: 0x0b0f15, roughness: 1 }),
    );
    base.rotation.x = -Math.PI / 2;
    // Sits just below the road/sidewalk slabs so their tops line up at y=0,
    // matching the height the player and vehicles rest at.
    base.position.y = -0.04;
    this.scene.add(base);
  }

  private buildRoad(road: RoadLine, vertical: boolean): void {
    const c = this.config;
    const length = road.to - road.from;
    const mid = (road.from + road.to) / 2;

    const roadMesh = new THREE.Mesh(new THREE.BoxGeometry(road.width, 0.1, length), this.asphaltMat);
    roadMesh.position.set(vertical ? road.coordinate : mid, -0.05, vertical ? mid : road.coordinate);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    const halfGap = road.width * 0.5 + 0.14;
    for (const side of [-1, 1]) {
      const sw = c.sidewalkWidth;
      const swCenter = road.coordinate + side * (halfGap + sw * 0.5);
      const sidewalk = new THREE.Mesh(
        new THREE.BoxGeometry(vertical ? sw : length, 0.12, vertical ? length : sw),
        this.sidewalkMat,
      );
      sidewalk.position.set(vertical ? swCenter : mid, -0.06, vertical ? mid : swCenter);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);

      const curbCenter = road.coordinate + side * (halfGap - 0.12);
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(vertical ? 0.24 : length, 0.08, vertical ? length : 0.24),
        this.curbMat,
      );
      curb.position.set(vertical ? curbCenter : mid, 0.04, vertical ? mid : curbCenter);
      this.scene.add(curb);
    }

    const isMain = road.width >= this.config.mainRoadWidth - 0.1;
    if (isMain) this.buildEdgeLines(road, vertical);
  }

  private buildEdgeLines(road: RoadLine, vertical: boolean): void {
    const length = road.to - road.from;
    const mid = (road.from + road.to) / 2;
    const offset = road.width * 0.5 - 0.95;
    for (const side of [-1, 1]) {
      const lineCenter = road.coordinate + side * offset;
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(vertical ? 0.18 : length, 0.02, vertical ? length : 0.18),
        this.laneLineMat,
      );
      line.position.set(vertical ? lineCenter : mid, 0.01, vertical ? mid : lineCenter);
      this.scene.add(line);
    }
  }

  /** Dashed center lines along every road. */
  private buildMarkings(vertical: readonly RoadLine[], horizontal: readonly RoadLine[]): void {
    const c = this.config;
    const spacing = c.dashLength + c.dashGap;

    const dashGeo = new THREE.BoxGeometry(0.2, 0.02, c.dashLength);
    const dashes: Array<{ x: number; z: number; yaw: number }> = [];

    const collect = (road: RoadLine, verticalAxis: boolean): void => {
      const length = road.to - road.from;
      const count = Math.max(0, Math.floor((length - spacing) / spacing));
      for (let i = 0; i < count; i++) {
        const along = road.from + c.dashLength / 2 + spacing / 2 + i * spacing;
        if (verticalAxis) dashes.push({ x: road.coordinate, z: along, yaw: 0 });
        else dashes.push({ x: along, z: road.coordinate, yaw: Math.PI / 2 });
      }
    };

    for (const road of vertical) collect(road, true);
    for (const road of horizontal) collect(road, false);

    if (dashes.length === 0) return;
    const mesh = new THREE.InstancedMesh(dashGeo, this.centerLineMat, dashes.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.placeInstances(mesh, dashes);
    this.scene.add(mesh);
  }

  /** Zebra stripes at every intersection, on all four crossing arms. */
  private buildCrosswalks(vertical: readonly RoadLine[], horizontal: readonly RoadLine[]): void {
    const stripes: Array<{ x: number; z: number; yaw: number }> = [];

    for (const v of vertical) {
      for (const h of horizontal) {
        for (const side of [-1, 1]) {
          const bandZ = h.coordinate + side * (h.width * 0.5 + 1.7);
          for (let i = 0; i * 1.25 < v.width - 0.6; i++) {
            stripes.push({ x: v.coordinate - v.width * 0.5 + 0.6 + i * 1.25, z: bandZ, yaw: 0 });
          }
        }
        this.placeCrosswalkStripes(stripes, v.width);
        stripes.length = 0;
      }
    }

    for (const h of horizontal) {
      for (const v of vertical) {
        for (const side of [-1, 1]) {
          const bandX = v.coordinate + side * (v.width * 0.5 + 1.7);
          for (let i = 0; i * 1.25 < h.width - 0.6; i++) {
            stripes.push({ x: bandX, z: h.coordinate - h.width * 0.5 + 0.6 + i * 1.25, yaw: Math.PI / 2 });
          }
        }
        this.placeCrosswalkStripes(stripes, h.width);
        stripes.length = 0;
      }
    }
  }

  private placeCrosswalkStripes(stripes: Array<{ x: number; z: number; yaw: number }>, length: number): void {
    if (stripes.length === 0) return;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.02, length), this.laneLineMat, stripes.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.placeInstances(mesh, stripes);
    this.scene.add(mesh);
  }

  /** A few darker asphalt patch quads to break up road surfaces. */
  private buildPatches(vertical: readonly RoadLine[], horizontal: readonly RoadLine[]): void {
    const patches: Array<{ x: number; z: number; yaw: number; s: number }> = [];
    const allRoads = [...vertical, ...horizontal];
    if (allRoads.length === 0) return;
    for (let i = 0; i < 16; i++) {
      const road = allRoads[(i * 3 + 7) % allRoads.length];
      const verticalAxis = vertical.includes(road);
      const along = road.from + 20 + ((i * 37) % Math.max(1, road.to - road.from - 40));
      const offset = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * (road.width - 4) - (road.width - 4) / 2;
      const s = 2.4 + (i % 3) * 1.2;
      if (verticalAxis) patches.push({ x: road.coordinate + offset, z: along, yaw: 0, s });
      else patches.push({ x: along, z: road.coordinate + offset, yaw: Math.PI / 2, s });
    }

    const patchMat = this.materials.standard("roadPatch", { color: 0x14171b, roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 1), patchMat, patches.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      pos.set(p.x, 0.01, p.z);
      m.compose(pos, new THREE.Quaternion().setFromAxisAngle(up, p.yaw), new THREE.Vector3(p.s, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    this.scene.add(mesh);
  }

  /** Manhole covers along each road to add believable surface detail. */
  private buildManholes(vertical: readonly RoadLine[], horizontal: readonly RoadLine[]): void {
    const spots: Array<{ x: number; z: number }> = [];
    const collect = (road: RoadLine, verticalAxis: boolean): void => {
      const step = 34;
      for (let along = road.from + 22; along < road.to - 18; along += step) {
        const across = ((along * 31) % (road.width - 3)) - (road.width - 3) / 2;
        if (verticalAxis) spots.push({ x: road.coordinate + across, z: along });
        else spots.push({ x: along, z: road.coordinate + across });
      }
    };
    for (const road of vertical) collect(road, true);
    for (const road of horizontal) collect(road, false);
    if (spots.length === 0) return;

    const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.02, 12);
    const mesh = new THREE.InstancedMesh(geo, this.manholeMat, spots.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < spots.length; i++) {
      pos.set(spots[i].x, 0.01, spots[i].z);
      m.compose(pos, new THREE.Quaternion(), one);
      mesh.setMatrixAt(i, m);
    }
    this.scene.add(mesh);
  }

  /** Dark drain gutters hugging the curbs. */
  private buildGutters(vertical: readonly RoadLine[], horizontal: readonly RoadLine[]): void {
    const spots: Array<{ x: number; z: number; yaw: number }> = [];
    for (const road of vertical) {
      const mid = (road.from + road.to) / 2;
      const offset = road.width * 0.5 - 0.35;
      for (const side of [-1, 1]) {
        spots.push({ x: road.coordinate + side * offset, z: mid, yaw: 0 });
      }
    }
    for (const road of horizontal) {
      const mid = (road.from + road.to) / 2;
      const offset = road.width * 0.5 - 0.35;
      for (const side of [-1, 1]) {
        spots.push({ x: mid, z: road.coordinate + side * offset, yaw: Math.PI / 2 });
      }
    }
    if (spots.length === 0) return;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), this.gutterMat, spots.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.placeInstances(mesh, spots);
    this.scene.add(mesh);
  }

  private placeInstances(mesh: THREE.InstancedMesh, items: ReadonlyArray<{ x: number; z: number; yaw: number }>): void {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      pos.set(item.x, 0.01, item.z);
      m.compose(pos, new THREE.Quaternion().setFromAxisAngle(up, item.yaw), one);
      mesh.setMatrixAt(i, m);
    }
  }
}
