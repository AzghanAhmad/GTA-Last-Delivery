# Graphics pipeline

How the neon night city is rendered, materialed, and kept fast on the target
hardware (Intel i5-1135G7 / 8 GB / GeForce MX330 / 2 GB VRAM).

Everything in the visual pipeline is **procedural** — there are no downloaded
textures or models, so no asset licensing risk. All textures are generated on
`CanvasTexture`s at startup.

## Rendering

- **Renderer:** `WebGLRenderer` with ACES filmic tone mapping, SRGB output,
  PCFSoft shadow maps, and a device-pixel-ratio cap from the graphics tier.
  Set up in `src/core/Game.ts`.
- **Post-processing:** `EffectComposer` with `RenderPass` +
  `UnrealBloomPass` + `OutputPass`, owned by `Environment`
  (`src/world/Environment.ts`). Bloom is what makes the neon signs, lamp glow
  discs and headlights pop at night. `F4` toggles it (dev), `F5` runs a quick
  renderer/health test pass.
- **Sky:** a world-fixed backside sphere that follows the camera. Night and
  day are two equirectangular canvas textures (procedural stars, moon,
  sun, clouds) swapped on `L`.

## Lighting and day/night

- `HemisphereLight` + two `DirectionalLight`s (moon for night, sun for day).
- The active directional light casts PCFSoft shadows in a box that follows the
  player (`Environment.configureShadows` reads the tier's shadow map size,
  distance and bias).
- Materials tagged `userData.nightGlow` and point lights tagged
  `userData.nightLight` are collected once and dimmed during the day, so the
  city does not stay neon-bright at noon.
- Fog (`THREE.Fog`) is tuned per day/night and scaled by the graphics tier
  (`setFogScale`), pulling the view in on weaker hardware.

## Materials

- `src/core/MaterialManager.ts` caches every `MeshStandardMaterial` and
  procedural texture by key, applies the tier's max anisotropy once, and
  exposes two texture generators:
  - `surface()` — tileable mottled albedo (asphalt, concrete, plaster).
  - `noise()` — greyscale bump/mask noise.
- Shared materials mean far more draw calls share state (fewer state changes).

## World systems

- **Buildings** (`src/world/BuildingManager.ts`): procedural facades with
  window grids, glass, ground-floor storefronts, balconies, fire escapes and
  roof details. Geometry is merged per building into a few draw calls. Each
  building also has a cheap far shell; `updateLOD` swaps detail in/out by
  distance (`lodBias` from the graphics tier).
- **Roads** (`src/world/RoadSystem.ts`): PBR asphalt with bump map, concrete
  sidewalks, raised curbs, dashed center/lane lines, zebra crosswalks, asphalt
  patches, manhole covers and drain gutters. Lines, crosswalks, manholes and
  gutters are `InstancedMesh`.
- **Street lights** (`src/world/StreetLight.ts`): instanced poles + lamp heads
  in two kinds (sodium orange on main roads, cool white elsewhere). Each head
  gets a soft additive glow disc that feeds bloom; only a small explicit
  subset also gets a real `PointLight`.
- **Vegetation** (`src/world/Vegetation.ts`): instanced low-poly trees and
  bushes on sidewalks, density scaled by the tier.
- **Water** (`src/world/City.ts`): procedural surface texture with a slow UV
  drift animated in `City.updateVisuals`.

## Performance budget

| Concern | Approach |
| --- | --- |
| Draw calls | Instancing (markings, manholes, gutters, lights, trees), merged building geometry, shared cached materials |
| Geometry | Low-poly boxes/spheres; per-building window grids merged, not per-window meshes |
| Texture memory | 256 px procedural canvases, shared/repeated, anisotropy capped by tier |
| Lights | 1 hemisphere + 1 active directional shadow + a handful of point lights |
| LOD | Building far shells swap by distance; fog far plane shortens on `low` |
| Post | Bloom is a single pass; `F4` disables it entirely |

Tiers live in `src/core/GraphicsSettings.ts`:

| Setting | low | medium | high |
| --- | --- | --- | --- |
| pixel ratio | 0.72 | 1.5 | 2.0 |
| shadow map | 1024 | 2048 | 2048 |
| shadow distance | 45 | 85 | 130 |
| fog far | 260 | 380 | 420 |
| building LOD | 60 | 95 | 140 |

## Dev diagnostics

- `F4` — toggle the performance HUD (FPS, frame time, draw calls, triangles,
  objects, quality, LOD, fog, bloom, day/night).
- `F5` — run a test pass: checks for non-finite positions, high draw-call /
  triangle counts, and prints the current settings to the panel + console.
- `F6` — toggle the one-line debug status overlay.

All three are dev-only (`import.meta.env.DEV`).
