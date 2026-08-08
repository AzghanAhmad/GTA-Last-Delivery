import * as THREE from "three";
import { WorldCollision } from "./WorldCollision";
import { Environment } from "./Environment";
import { RoadSystem, type RoadLine } from "./RoadSystem";
import { BuildingSystem, type BuildingType } from "./BuildingSystem";
import { PropFactory } from "./Props";
import { StreetLightManager } from "./StreetLight";
import { Landmark } from "./Landmark";
import { PoliceStation } from "./PoliceStation";
import { GasStation } from "./GasStation";
import { WarehouseDistrict } from "./WarehouseDistrict";
import { Docks } from "./Docks";
import { DebugMarkers } from "./DebugMarkers";
import { mat, box } from "./BuildKit";
import { NeonSign } from "./NeonSign";
import { WORLD_LOCATIONS, type WorldLocations } from "./WorldLocations";

export const WORLD_HALF = 297;

interface BlockBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const VERTICAL_ROADS: RoadLine[] = [
  { coordinate: -270, width: 26, from: -283, to: 283 },
  { coordinate: -90, width: 26, from: -283, to: 283 },
  { coordinate: 90, width: 26, from: -283, to: 283 },
  { coordinate: 230, width: 22, from: -283, to: 143 },
];

const HORIZONTAL_ROADS: RoadLine[] = [
  { coordinate: -270, width: 26, from: -283, to: 283 },
  { coordinate: -70, width: 26, from: -283, to: 283 },
  { coordinate: 130, width: 26, from: -283, to: 283 },
];

const BLOCKS: Record<string, BlockBounds> = {
  nw: { minX: -257, maxX: -103, minZ: -257, maxZ: -83 },
  nc: { minX: -77, maxX: 77, minZ: -257, maxZ: -83 },
  ne: { minX: 103, maxX: 217, minZ: -257, maxZ: -83 },
  w: { minX: -257, maxX: -103, minZ: -57, maxZ: 117 },
  c: { minX: -77, maxX: 77, minZ: -57, maxZ: 117 },
  e: { minX: 103, maxX: 217, minZ: -57, maxZ: 117 },
  sw: { minX: -257, maxX: -103, minZ: 143, maxZ: 283 },
  sc: { minX: -77, maxX: 77, minZ: 143, maxZ: 283 },
  se: { minX: 103, maxX: 283, minZ: 143, maxZ: 283 },
};

const NEON_WORDS = [
  "OPEN", "24/7", "ARCADE", "BAR", "CAFE", "REPAIR", "RUSH", "NIGHT OWL",
  "VOLT", "NOVA", "MOTION", "CITYLINE", "AUTO", "DINER", "MIRAGE", "ECHO",
];

interface FillOptions {
  mix: BuildingType[];
  seed: number;
  /** Lots per side (grid x grid) inside the block; default 3 for a dense feel. */
  grid?: number;
  /** Bounds to fill within (sub-region of the block). */
  bounds?: BlockBounds;
  exclusions?: readonly BlockBounds[];
}

/**
 * The open-world city for the Heist.
 *
 * A ~600x600 grid of 9 city blocks with a deliberate road network, districts
 * (center landmark, police station, gas station, warehouse district, docks),
 * street lights, fog/night lighting and centralized collision. All solid
 * objects register with WorldCollision; coordinates live in WorldLocations.
 */
export class City {
  readonly locations: WorldLocations = WORLD_LOCATIONS;
  private readonly scene: THREE.Scene;
  private readonly collision = new WorldCollision();
  private readonly props: PropFactory;
  private readonly buildings: BuildingSystem;
  private readonly lights = new StreetLightManager();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.props = new PropFactory(scene, this.collision);
    this.buildings = new BuildingSystem(scene, this.collision);

    new Environment(scene);
    const roads = new RoadSystem(scene);
    roads.build(VERTICAL_ROADS, HORIZONTAL_ROADS, WORLD_HALF);

    this.buildWater();
    this.collision.addWorldBoundary(WORLD_HALF, 2, 10);

    this.buildDistricts();
    this.buildBlocks();
    this.buildStartPlaza();
    this.props.fence(283, -283, 283, 143, 1.8);
    this.buildStreetLights();
    this.buildTrafficSigns();

    if (import.meta.env.DEV) {
      new DebugMarkers(scene, WORLD_LOCATIONS);
    }
  }

  get colliders(): readonly THREE.Box3[] {
    return this.collision.colliders;
  }

  private buildDistricts(): void {
    const c = this.collision;
    new Landmark(this.scene, c, this.buildings, this.props, this.locations.CITY_CENTER);
    new PoliceStation(this.scene, c, this.buildings, this.props, this.locations.POLICE_STATION);
    new GasStation(this.scene, c, this.buildings, this.props, this.locations.GAS_STATION);
    new WarehouseDistrict(this.scene, c, this.buildings, this.props, this.locations.WAREHOUSE);
    new Docks(this.scene, c, this.buildings, this.props, this.locations.DOCKS);
  }

  private buildWater(): void {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0c1a2a,
      metalness: 0.75,
      roughness: 0.15,
      emissive: 0x081423,
      emissiveIntensity: 0.7,
    });

    const south = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2, 14), waterMat);
    south.rotation.x = -Math.PI / 2;
    south.position.set(0, -0.08, 290);
    this.scene.add(south);

    const east = new THREE.Mesh(new THREE.PlaneGeometry(14, WORLD_HALF * 2), waterMat);
    east.rotation.x = -Math.PI / 2;
    east.position.set(290, -0.08, 0);
    this.scene.add(east);

    this.collision.addBox(-WORLD_HALF, 283, WORLD_HALF, WORLD_HALF + 10, 8);
    this.collision.addBox(283, -WORLD_HALF, WORLD_HALF + 10, 283, 8);
  }

  private buildBlocks(): void {
    this.fillBlock(BLOCKS.nw, { mix: ["apartment", "office", "low"], seed: 11 });
    this.fillBlock(BLOCKS.nc, {
      mix: ["apartment", "low"],
      seed: 23,
      grid: 2,
      exclusions: [{ minX: -13, maxX: 13, minZ: -228, maxZ: -192 }],
    });
    this.fillBlock(BLOCKS.ne, { mix: ["office", "apartment"], seed: 37 });
    this.fillBlock(BLOCKS.w, {
      mix: ["shop", "office"],
      seed: 41,
      exclusions: [{ minX: -150, maxX: -120, minZ: -55, maxZ: -10 }],
    });
    this.fillBlock(BLOCKS.c, {
      mix: ["office", "low"],
      seed: 53,
      exclusions: [{ minX: -9, maxX: 9, minZ: 25, maxZ: 45 }],
    });
    this.fillBlock(BLOCKS.e, {
      mix: ["low", "office"],
      seed: 67,
      exclusions: [{ minX: 102, maxX: 136, minZ: 24, maxZ: 56 }],
    });
    this.fillBlock(BLOCKS.sc, {
      mix: ["office", "apartment"],
      seed: 71,
      bounds: { minX: -77, maxX: 77, minZ: 143, maxZ: 224 },
    });

    this.buildParkingLot(
      { minX: -45, maxX: 45, minZ: 218, maxZ: 262 },
      0,
      240,
      5,
      3,
      71,
    );
    this.streetParking();
  }

  private fillBlock(block: BlockBounds, options: FillOptions): void {
    const rand = mulberry32(options.seed);
    const bounds = options.bounds ?? block;
    const grid = options.grid ?? 3;
    const margin = 5.5;
    const gap = 2.8;
    const innerW = bounds.maxX - bounds.minX - margin * 2;
    const innerD = bounds.maxZ - bounds.minZ - margin * 2;
    if (innerW <= (grid - 1) * gap || innerD <= (grid - 1) * gap) return;

    const cellW = (innerW - (grid - 1) * gap) / grid;
    const cellD = (innerD - (grid - 1) * gap) / grid;

    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        if (rand() < 0.08) continue;
        const cellCenterX = bounds.minX + margin + cellW * 0.5 + i * (cellW + gap);
        const cellCenterZ = bounds.minZ + margin + cellD * 0.5 + j * (cellD + gap);

        const type = options.mix[Math.floor(rand() * options.mix.length)];
        const width = cellW * (0.7 + rand() * 0.24);
        const depth = cellD * (0.7 + rand() * 0.24);
        const height = heightFor(type, rand());
        const ox = (rand() - 0.5) * cellW * 0.2;
        const oz = (rand() - 0.5) * cellD * 0.2;
        const bx = cellCenterX + ox;
        const bz = cellCenterZ + oz;

        if (this.intersects(bx, bz, width, depth, options.exclusions ?? [])) continue;

        this.buildings.build({ type, x: bx, z: bz, width, depth, height });

        if (type === "shop") {
          const side = nearestSide(block, bx, bz);
          this.addStorefront(bx, bz, width, depth, side);
        }
        if (rand() < 0.45) {
          this.props.acUnits([
            { x: bx + (rand() - 0.5) * width * 0.4, z: bz + (rand() - 0.5) * depth * 0.4, yaw: 0 },
          ]);
        }
      }
    }

    this.addAlleyProps(bounds, options.seed, grid);
  }

  /** Storefront awning + neon sign on the road-facing side of a shop. */
  private addStorefront(bx: number, bz: number, width: number, depth: number, side: string): void {
    const colors = [0xcc3344, 0x2a6fb0, 0x3a8f5f, 0xb06a2a, 0x7a4a8a];
    const color = colors[Math.floor(Math.abs(bx + bz) % colors.length)];
    const word = NEON_WORDS[Math.floor(Math.abs(bx * 7 + bz * 13) % NEON_WORDS.length)];

    const signYaw = side === "E" ? Math.PI / 2 : side === "W" ? -Math.PI / 2 : side === "N" ? Math.PI : 0;
    const signX = side === "E" ? bx + width * 0.5 + 0.06 : side === "W" ? bx - width * 0.5 - 0.06 : bx;
    const signZ = side === "S" ? bz + depth * 0.5 + 0.06 : side === "N" ? bz - depth * 0.5 - 0.06 : bz;

    const sign = NeonSign.build({ text: word, color: 0xffffff, width: 5.5, emissiveIntensity: 1.4 });
    sign.position.set(signX, 4.8, signZ);
    sign.rotation.y = signYaw;
    this.scene.add(sign);

    const awningColor = color;
    if (side === "E" || side === "W") {
      const awning = box(1.8, 0.2, depth + 0.6, mat(awningColor, 0.5), bx + (side === "E" ? 0.9 : -0.9), 3.3, bz);
      this.scene.add(awning);
    } else {
      const awning = box(width + 0.6, 0.2, 1.8, mat(awningColor, 0.5), bx, 3.3, bz + (side === "S" ? 0.9 : -0.9));
      this.scene.add(awning);
    }
  }

  private addAlleyProps(bounds: BlockBounds, seed: number, grid: number): void {
    const rand = mulberry32(seed + 500);
    const margin = 5.5;
    const gap = 2.8;
    const innerW = bounds.maxX - bounds.minX - margin * 2;
    const innerD = bounds.maxZ - bounds.minZ - margin * 2;
    const cellW = (innerW - (grid - 1) * gap) / grid;
    const cellD = (innerD - (grid - 1) * gap) / grid;

    const gapLines = (count: number, cell: number, start: number): number[] => {
      const lines: number[] = [];
      for (let k = 1; k < count; k++) {
        lines.push(start + k * cell + (k - 0.5) * gap);
      }
      return lines;
    };
    const xLines = gapLines(grid, cellW, bounds.minX + margin);
    const zLines = gapLines(grid, cellD, bounds.minZ + margin);

    const spots: Array<{ x: number; z: number; yaw: number }> = [];
    for (const x of xLines) {
      for (const z of zLines) {
        spots.push({ x: x + (rand() - 0.5) * gap * 0.6, z: z + (rand() - 0.5) * gap * 0.6, yaw: rand() * Math.PI * 2 });
      }
    }
    if (spots.length === 0) return;

    this.props.dumpsters([spots[0]]);
    this.props.trashBags(spots.length > 1 ? spots[1].x : spots[0].x, spots.length > 1 ? spots[1].z : spots[0].z, rand() * Math.PI * 2);
    this.props.utilityBox(spots.length > 2 ? spots[2].x : spots[0].x, spots.length > 2 ? spots[2].z : spots[0].z, rand() * Math.PI * 2);
    this.props.cones(spots);
  }

  private buildParkingLot(
    pad: BlockBounds,
    centerX: number,
    centerZ: number,
    cols: number,
    rows: number,
    seed: number,
  ): void {
    const rand = mulberry32(seed + 900);
    const carColors = [0x3a4a6a, 0x7a5a3a, 0x4a6a3a, 0x6a3a3a, 0x3a5a7a, 0x888888, 0x5a3a5a];
    const spacingX = 3.2;
    const spacingZ = 5.8;

    const padMesh = box(
      pad.maxX - pad.minX,
      0.06,
      pad.maxZ - pad.minZ,
      mat(0x15191f, 0.7),
      (pad.minX + pad.maxX) / 2,
      0.05,
      (pad.minZ + pad.maxZ) / 2,
    );
    this.scene.add(padMesh);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = centerX + (c - (cols - 1) / 2) * spacingX;
        const pz = centerZ + (r - (rows - 1) / 2) * spacingZ;
        if (
          Math.abs(px - WORLD_LOCATIONS.TARGET_VEHICLE.x) < 1.6 &&
          Math.abs(pz - WORLD_LOCATIONS.TARGET_VEHICLE.z) < 1.6
        ) {
          continue;
        }
        this.props.parkCar(px, pz, Math.PI, carColors[Math.floor(rand() * carColors.length)]);
      }
    }
  }

  /** A few parked cars along roads so streets feel lived in. */
  private streetParking(): void {
    const spots: Array<[number, number, number]> = [
      [-30, -78, Math.PI],
      [0, -78, Math.PI],
      [30, -78, Math.PI],
      [84, 66, -Math.PI / 2],
      [-140, 124, 0],
      [-168, 124, 0],
    ];
    const colors = [0x3a4a6a, 0x7a5a3a, 0x4a6a3a, 0x6a3a3a, 0x3a5a7a, 0x888888];
    for (let i = 0; i < spots.length; i++) {
      const [x, z, yaw] = spots[i];
      this.props.parkCar(x, z, yaw, colors[i % colors.length]);
    }
  }

  private buildStartPlaza(): void {
    const x = this.locations.START.x;
    const z = this.locations.START.z;
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffe3b8,
      emissiveIntensity: 2,
      roughness: 0.5,
    });
    this.scene.add(box(0.18, 5.5, 0.18, mat(0x1b222e, 0.6, 0.5), x + 8, 0, z - 6));
    this.scene.add(box(0.8, 0.35, 0.5, lampMat, x + 8, 5.5, z - 6));
    const light = new THREE.PointLight(0xffd9a0, 55, 26, 2);
    light.position.set(x + 8, 5.2, z - 6);
    this.scene.add(light);
  }

  private buildStreetLights(): void {
    const step = 46;
    for (const road of VERTICAL_ROADS) {
      let side = 1;
      for (let z = road.from + 16; z <= road.to - 16; z += step) {
        side = -side;
        this.lights.add({
          x: road.coordinate + side * (road.width * 0.5 + 2.0),
          z,
          yaw: side < 0 ? 0 : Math.PI,
          withLight: this.nearCenter(road.coordinate, z),
        });
      }
    }
    for (const road of HORIZONTAL_ROADS) {
      let side = 1;
      for (let x = road.from + 16; x <= road.to - 16; x += step) {
        side = -side;
        this.lights.add({
          x,
          z: road.coordinate + side * (road.width * 0.5 + 2.0),
          yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2,
          withLight: this.nearCenter(x, road.coordinate),
        });
      }
    }
    this.lights.build(this.scene);
  }

  private nearCenter(x: number, z: number): boolean {
    const dx = x - this.locations.CITY_CENTER.x;
    const dz = z - this.locations.CITY_CENTER.z;
    return dx * dx + dz * dz < 42 * 42;
  }

  private buildTrafficSigns(): void {
    const v = [-270, -90, 90];
    const h = [-270, -70, 130];
    for (const vx of v) {
      for (const hz of h) {
        this.props.trafficSign(vx + 14, hz + 14, -Math.PI / 2, "stop");
      }
    }
    this.props.streetSign(this.locations.ESCAPE_ROUTE.x + 6, this.locations.ESCAPE_ROUTE.z, Math.PI / 2, 0x2a4a8a);
    this.props.streetSign(this.locations.DOCKS.x - 90, this.locations.DOCKS.z + 30, Math.PI, 0x2a4a8a);
    this.props.streetSign(100, -150, 0, 0x2a4a8a);
    this.props.streetSign(-160, 40, 0, 0x1f5f3f);
  }

  private intersects(bx: number, bz: number, width: number, depth: number, exclusions: readonly BlockBounds[]): boolean {
    const halfW = width * 0.5;
    const halfD = depth * 0.5;
    for (const e of exclusions) {
      if (bx + halfW > e.minX && bx - halfW < e.maxX && bz + halfD > e.minZ && bz - halfD < e.maxZ) {
        return true;
      }
    }
    return false;
  }
}

function heightFor(type: BuildingType, rand: number): number {
  switch (type) {
    case "low":
      return 4.5 + rand * 3.5;
    case "shop":
      return 6.5 + rand * 3.5;
    case "office":
      return 13 + rand * 9;
    case "apartment":
      return 15 + rand * 11;
    case "warehouse":
      return 8 + rand * 4;
    default:
      return 10;
  }
}

function nearestSide(block: BlockBounds, x: number, z: number): string {
  const east = block.maxX - x;
  const west = x - block.minX;
  const south = block.maxZ - z;
  const north = z - block.minZ;
  const min = Math.min(east, west, south, north);
  if (min === east) return "E";
  if (min === west) return "W";
  if (min === south) return "S";
  return "N";
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
