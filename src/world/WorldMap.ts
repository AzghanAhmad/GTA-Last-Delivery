import { PLAYER_SPAWN } from "./SpawnConfig";
import { WORLD_LOCATIONS } from "./WorldLocations";
import type { RoadLine } from "./RoadSystem";

/** Extent of the playable map in world units (± this value). */
export const WORLD_HALF = 297;

/** Road corridors that define the street grid; also used by City. */
export const VERTICAL_ROADS: readonly RoadLine[] = [
  { coordinate: -270, width: 26, from: -283, to: 283 },
  { coordinate: -90, width: 26, from: -283, to: 283 },
  { coordinate: 90, width: 26, from: -283, to: 283 },
  { coordinate: 230, width: 22, from: -283, to: 143 },
];

export const HORIZONTAL_ROADS: readonly RoadLine[] = [
  { coordinate: -270, width: 26, from: -283, to: 283 },
  { coordinate: -70, width: 26, from: -283, to: 283 },
  { coordinate: 130, width: 26, from: -283, to: 283 },
];

export type MarkerKind = "spawn" | "landmark" | "police" | "gas" | "warehouse" | "docks";

export interface MapMarker {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: MarkerKind;
}

/** Major named locations shown on the minimap and the full map. */
export const MAP_MARKERS: readonly MapMarker[] = [
  { id: "spawn", label: "Spawn", x: PLAYER_SPAWN.x, z: PLAYER_SPAWN.z, kind: "spawn" },
  { id: "landmark", label: "Nova Tower", x: WORLD_LOCATIONS.CITY_CENTER.x, z: WORLD_LOCATIONS.CITY_CENTER.z, kind: "landmark" },
  { id: "police", label: "Police Station", x: WORLD_LOCATIONS.POLICE_STATION.x, z: WORLD_LOCATIONS.POLICE_STATION.z, kind: "police" },
  { id: "gas", label: "Gas Station", x: WORLD_LOCATIONS.GAS_STATION.x, z: WORLD_LOCATIONS.GAS_STATION.z, kind: "gas" },
  { id: "warehouse", label: "Warehouse District", x: WORLD_LOCATIONS.WAREHOUSE.x, z: WORLD_LOCATIONS.WAREHOUSE.z, kind: "warehouse" },
  { id: "docks", label: "Docks", x: WORLD_LOCATIONS.DOCKS.x, z: WORLD_LOCATIONS.DOCKS.z, kind: "docks" },
];

export const MARKER_COLORS: Record<MarkerKind, string> = {
  spawn: "#4ade80",
  landmark: "#f5c542",
  police: "#4f8cff",
  gas: "#ff9f43",
  warehouse: "#b06ad8",
  docks: "#2dd4bf",
};

/** Half the map extent in world units; both axes span [-WORLD_EXTENT, WORLD_EXTENT]. */
export const WORLD_EXTENT = 300;

/**
 * Reusable world -> map coordinate conversion.
 *
 * Both the minimap and the full map render the SAME static city canvas and use
 * this projection, so a world position always lands on the same map pixel
 * wherever it is drawn. All actors (player, vehicle, police, mission markers)
 * must go through this class rather than inventing their own coordinates.
 */
export class MapProjection {
  /** Canvas size in pixels (square). */
  readonly size: number;
  readonly pxPerMeter: number;

  constructor(size = 1024) {
    this.size = size;
    this.pxPerMeter = size / (WORLD_EXTENT * 2);
  }

  /** World (x, z) -> canvas pixels, y down = south, x right = east. */
  toPx(x: number, z: number): { x: number; y: number } {
    return {
      x: (x + WORLD_EXTENT) * this.pxPerMeter,
      y: (z + WORLD_EXTENT) * this.pxPerMeter,
    };
  }

  /** Canvas pixels -> world (x, z). */
  fromPx(px: number, py: number): { x: number; z: number } {
    return {
      x: px / this.pxPerMeter - WORLD_EXTENT,
      z: py / this.pxPerMeter - WORLD_EXTENT,
    };
  }
}

/**
 * The 2D map data for the HUD.
 *
 * Builds one precomputed city map (roads + district fills + marker dots) as a
 * Canvas2D image once; the minimap crops it around the player and the full map
 * scales it to fill the screen. No 3D world is rendered for the map, keeping
 * it cheap on the target GPU.
 */
export class WorldMap {
  readonly staticCanvas: HTMLCanvasElement;
  readonly projection: MapProjection;

  constructor(size = 1024) {
    this.staticCanvas = buildStaticMap(size);
    this.projection = new MapProjection(size);
  }
}

function buildStaticMap(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for city map");
  const projection = new MapProjection(size);

  ctx.fillStyle = "#0b111a";
  ctx.fillRect(0, 0, size, size);

  // City block fill so the map reads as built-up districts, not empty void.
  ctx.fillStyle = "rgba(38, 48, 66, 0.85)";
  for (const block of cityBlocks()) {
    const p1 = projection.toPx(block.minX, block.minZ);
    const p2 = projection.toPx(block.maxX, block.maxZ);
    ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
  }

  // Road corridors.
  for (const road of VERTICAL_ROADS) drawRoad(ctx, road, true, projection);
  for (const road of HORIZONTAL_ROADS) drawRoad(ctx, road, false, projection);

  // Water on the south and east fringes.
  drawWater(ctx, projection);

  // Major location dots (scale with the map; labels are drawn by the overlay).
  for (const marker of MAP_MARKERS) {
    const p = projection.toPx(marker.x, marker.z);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(3.5, size * 0.007), 0, Math.PI * 2);
    ctx.fillStyle = MARKER_COLORS[marker.kind];
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = MARKER_COLORS[marker.kind];
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(1, size * 0.0018);
    ctx.stroke();
  }

  return canvas;
}

function drawRoad(ctx: CanvasRenderingContext2D, road: RoadLine, vertical: boolean, projection: MapProjection): void {
  const a = projection.toPx(vertical ? road.coordinate - road.width * 0.5 : road.from, vertical ? road.from : road.coordinate - road.width * 0.5);
  const b = projection.toPx(vertical ? road.coordinate + road.width * 0.5 : road.to, vertical ? road.to : road.coordinate + road.width * 0.5);
  ctx.fillStyle = "#232a35";
  ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));

  // Center lane marker.
  const c1 = projection.toPx(road.coordinate, road.from);
  const c2 = projection.toPx(road.coordinate, road.to);
  ctx.strokeStyle = "#4c5a6c";
  ctx.lineWidth = Math.max(1.5, projection.size * 0.0024);
  ctx.setLineDash([projection.size * 0.012, projection.size * 0.012]);
  ctx.beginPath();
  ctx.moveTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWater(ctx: CanvasRenderingContext2D, projection: MapProjection): void {
  const edge = WORLD_HALF;
  const p = projection.toPx(edge, edge);
  ctx.fillStyle = "#16304a";
  const thickness = (WORLD_EXTENT - WORLD_HALF) * projection.pxPerMeter;
  ctx.fillRect(0, p.y, projection.size, thickness + 2); // south band
  ctx.fillRect(p.x, 0, thickness + 2, projection.size); // east band
}

interface BlockBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** The nine city blocks, kept in sync with City.ts for the map background. */
function cityBlocks(): readonly BlockBounds[] {
  return [
    { minX: -257, maxX: -103, minZ: -257, maxZ: -83 },
    { minX: -77, maxX: 77, minZ: -257, maxZ: -83 },
    { minX: 103, maxX: 217, minZ: -257, maxZ: -83 },
    { minX: -257, maxX: -103, minZ: -57, maxZ: 117 },
    { minX: -77, maxX: 77, minZ: -57, maxZ: 117 },
    { minX: 103, maxX: 217, minZ: -57, maxZ: 117 },
    { minX: -257, maxX: -103, minZ: 143, maxZ: 283 },
    { minX: -77, maxX: 77, minZ: 143, maxZ: 283 },
    { minX: 103, maxX: 283, minZ: 143, maxZ: 283 },
  ];
}
