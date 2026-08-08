import * as THREE from "three";

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
  sidewalkWidth: 2.4,
  laneWidth: 3.2,
  asphaltColor: 0x15191f,
  sidewalkColor: 0x2a2e35,
  curbColor: 0x39404a,
  centerLineColor: 0xd8b84a,
  laneLineColor: 0x9aa3ad,
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
 * Renders a flat dark base, asphalt roads, sidewalks, curbs, dashed lane
 * markings and zebra crosswalks at intersections. Roads and sidewalks carry no
 * colliders (they are walkable/drivable); the rest of the city registers solid
 * geometry separately. Markings and crosswalks are InstancedMesh.
 */
export class RoadSystem {
  private readonly scene: THREE.Scene;
  private readonly config: RoadConfig;

  private readonly asphaltMat: THREE.MeshStandardMaterial;
  private readonly sidewalkMat: THREE.MeshStandardMaterial;
  private readonly curbMat: THREE.MeshStandardMaterial;
  private readonly centerLineMat: THREE.MeshStandardMaterial;
  private readonly laneLineMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, config: RoadConfig = defaultRoadConfig) {
    this.scene = scene;
    this.config = config;

    this.asphaltMat = new THREE.MeshStandardMaterial({ color: config.asphaltColor, roughness: 0.72, metalness: 0.08 });
    this.sidewalkMat = new THREE.MeshStandardMaterial({ color: config.sidewalkColor, roughness: 0.95 });
    this.curbMat = new THREE.MeshStandardMaterial({ color: config.curbColor, roughness: 0.85 });
    this.centerLineMat = new THREE.MeshStandardMaterial({ color: config.centerLineColor, roughness: 0.6 });
    this.laneLineMat = new THREE.MeshStandardMaterial({ color: config.laneLineColor, roughness: 0.6 });
  }

  build(vertical: readonly RoadLine[], horizontal: readonly RoadLine[], worldHalf: number): void {
    this.buildBase(worldHalf);
    for (const road of vertical) this.buildRoad(road, true);
    for (const road of horizontal) this.buildRoad(road, false);
    this.buildMarkings(vertical, horizontal);
    this.buildCrosswalks(vertical, horizontal);
    this.buildPatches(vertical, horizontal);
  }

  /** Dark ground so nothing shows the void between roads and at the outskirts. */
  private buildBase(worldHalf: number): void {
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(worldHalf * 2, worldHalf * 2),
      new THREE.MeshStandardMaterial({ color: 0x0b0f15, roughness: 1 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0;
    this.scene.add(base);
  }

  private buildRoad(road: RoadLine, vertical: boolean): void {
    const c = this.config;
    const length = road.to - road.from;
    const mid = (road.from + road.to) / 2;

    const roadMesh = new THREE.Mesh(new THREE.BoxGeometry(road.width, 0.1, length), this.asphaltMat);
    roadMesh.position.set(vertical ? road.coordinate : mid, 0.05, vertical ? mid : road.coordinate);
    this.scene.add(roadMesh);

    const halfGap = road.width * 0.5 + 0.16;
    for (const side of [-1, 1]) {
      const sw = c.sidewalkWidth;
      const swCenter = road.coordinate + side * (halfGap + sw * 0.5);
      const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(vertical ? sw : length, 0.1, vertical ? length : sw), this.sidewalkMat);
      sidewalk.position.set(vertical ? swCenter : mid, 0.05, vertical ? mid : swCenter);
      this.scene.add(sidewalk);

      const curbCenter = road.coordinate + side * (halfGap - 0.11);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.22 : length, 0.08, vertical ? length : 0.22), this.curbMat);
      curb.position.set(vertical ? curbCenter : mid, 0.07, vertical ? mid : curbCenter);
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
      const line = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.18 : length, 0.06, vertical ? length : 0.18), this.laneLineMat);
      line.position.set(vertical ? lineCenter : mid, 0.06, vertical ? mid : lineCenter);
      this.scene.add(line);
    }
  }

  /** Dashed center lines along every road. */
  private buildMarkings(vertical: readonly RoadLine[], horizontal: readonly RoadLine[]): void {
    const c = this.config;
    const spacing = c.dashLength + c.dashGap;

    const dashGeo = new THREE.BoxGeometry(0.2, 0.06, c.dashLength);
    const dashes: Array<{ x: number; z: number; yaw: number }> = [];

    const collect = (road: RoadLine, verticalAxis: boolean): void => {
      const length = road.to - road.from;
      const count = Math.max(0, Math.floor((length - spacing) / spacing));
      for (let i = 0; i < count; i++) {
        const along = road.from + c.dashLength / 2 + spacing / 2 + i * spacing;
        if (verticalAxis) {
          dashes.push({ x: road.coordinate, z: along, yaw: 0 });
        } else {
          dashes.push({ x: along, z: road.coordinate, yaw: Math.PI / 2 });
        }
      }
    };

    for (const road of vertical) collect(road, true);
    for (const road of horizontal) collect(road, false);

    if (dashes.length === 0) return;
    const mesh = new THREE.InstancedMesh(dashGeo, this.centerLineMat, dashes.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < dashes.length; i++) {
      const d = dashes[i];
      pos.set(d.x, 0.06, d.z);
      m.compose(pos, new THREE.Quaternion().setFromAxisAngle(up, d.yaw), new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    this.scene.add(mesh);
  }

  /** Zebra stripes at every intersection, on all four crossing arms. */
  private buildCrosswalks(vertical: readonly RoadLine[], horizontal: readonly RoadLine[]): void {
    const stripes: Array<{ x: number; z: number; yaw: number }> = [];
    let stripeLength = 26;

    for (const v of vertical) {
      for (const h of horizontal) {
        stripeLength = v.width;
        for (const side of [-1, 1]) {
          const bandZ = h.coordinate + side * (h.width * 0.5 + 1.6);
          for (let i = 0; i * 1.2 < v.width - 0.6; i++) {
            stripes.push({ x: v.coordinate - v.width * 0.5 + 0.6 + i * 1.2, z: bandZ, yaw: 0 });
          }
        }
      }
    }
    this.placeCrosswalkStripes(stripes, stripeLength);

    stripes.length = 0;
    for (const h of horizontal) {
      for (const v of vertical) {
        stripeLength = h.width;
        for (const side of [-1, 1]) {
          const bandX = v.coordinate + side * (v.width * 0.5 + 1.6);
          for (let i = 0; i * 1.2 < h.width - 0.6; i++) {
            stripes.push({ x: bandX, z: h.coordinate - h.width * 0.5 + 0.6 + i * 1.2, yaw: Math.PI / 2 });
          }
        }
      }
    }
    this.placeCrosswalkStripes(stripes, stripeLength);
  }

  private placeCrosswalkStripes(stripes: Array<{ x: number; z: number; yaw: number }>, length: number): void {
    if (stripes.length === 0) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.6, 0.07, length),
      this.laneLineMat,
      stripes.length,
    );
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < stripes.length; i++) {
      const s = stripes[i];
      pos.set(s.x, 0.07, s.z);
      m.compose(pos, new THREE.Quaternion().setFromAxisAngle(up, s.yaw), new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    this.scene.add(mesh);
  }

  /** A few darker asphalt patch quads to break up road surfaces. */
  private buildPatches(vertical: readonly RoadLine[], horizontal: readonly RoadLine[]): void {
    const patches: Array<{ x: number; z: number; yaw: number; s: number }> = [];
    const allRoads = [...vertical, ...horizontal];
    if (allRoads.length === 0) return;
    const seed = 7;
    for (let i = 0; i < 14; i++) {
      const road = allRoads[(i * 3 + seed) % allRoads.length];
      const verticalAxis = vertical.includes(road);
      const along = road.from + 20 + ((i * 37) % Math.max(1, road.to - road.from - 40));
      const across = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const offset = (across - 0.5) * (road.width - 4);
      const s = 2.4 + (i % 3) * 1.2;
      if (verticalAxis) {
        patches.push({ x: road.coordinate + offset, z: along, yaw: 0, s });
      } else {
        patches.push({ x: along, z: road.coordinate + offset, yaw: Math.PI / 2, s });
      }
    }

    const patchMat = new THREE.MeshStandardMaterial({ color: 0x10141a, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 1), patchMat, patches.length);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      pos.set(p.x, 0.055, p.z);
      m.compose(pos, new THREE.Quaternion().setFromAxisAngle(up, p.yaw), new THREE.Vector3(p.s, 1, 1));
      mesh.setMatrixAt(i, m);
    }
    this.scene.add(mesh);
  }
}
