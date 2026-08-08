# Asset placement guide

This folder is the single source for external game assets. Assets are **never
downloaded automatically** — the developer places legally licensed files here.

## Current status

The graphics pipeline (`docs/GRAPHICS_PIPELINE.md`) is fully **procedural**:
buildings, roads, street lights, vegetation, water and the sky all generate
their geometry and canvas textures in code (`src/core/MaterialManager.ts`).
No external asset downloads are needed yet, and the folder contains only
`.gitkeep` placeholders. `ASSET_LICENSES.md` (repo root) will track any
external asset added in the future.

## How the loader finds assets

`src/world/AssetManager.ts` indexes every `.glb` / `.gltf` and image file under
`src/assets/` at build time (Vite `import.meta.glob`). Each file becomes an
asset id equal to its path **without** the `src/assets/` prefix and file
extension.

Example: `src/assets/vehicles/supercar.glb` → asset id `vehicles/supercar`.

To load it in code:

```ts
const gltf = await assets.loadModel("vehicles/supercar");
```

No URLs are invented. Adding or removing a file is enough to register it.

## Folder layout

| Folder | Contents | Asset id prefix |
| --- | --- | --- |
| `models/` | General-purpose GLB/GLTF models | `models/` |
| `characters/` | Humanoid rigs with animations | `characters/` |
| `vehicles/` | Cars, trucks, bikes (GLB, +Z forward) | `vehicles/` |
| `buildings/` | Modular building pieces (GLB) | `buildings/` |
| `props/` | Street props (GLB) | `props/` |
| `materials/` | Material libraries, .mtl, JSON | `materials/` |
| `textures/` | PBR maps (albedo/normal/roughness/AO/emissive) | `textures/` |
| `environment/` | Sky/HDRI/fog assets | `environment/` |

## Required formats

- **Models:** GLTF binary (`.glb`) preferred, plain `.gltf` (with sidecar
  `.bin` + `.png/.jpg` in the same folder) accepted. Draco-compressed `.glb`
  files are supported; place the decoder files in `public/draco/` and point
  `AssetManager` at them (default decoder path is `"/draco/"`).
- **Textures:** `.png`, `.jpg`, `.webp`. Keep them compressed/optimized
  (256–1024 px, JPEG/WebP where possible) for the 2 GB VRAM target.
- **Sky/HDRI:** equirectangular `.hdr` or `.png`.

## Model conventions

So gameplay code can drive the visuals, models should use these node/material
names where relevant (all optional; the loader falls back gracefully):

- **Characters:** root faces +Z; a `Hips` root bone; clips named `idle`,
  `walk`, `run`, `sprint`, `jump`, `fall`, `land`, `enter_vehicle`,
  `exit_vehicle`, `sit_driving`. Missing clips fall back to the procedural
  poses. The character is scaled to ~1.8 m on load.
- **Vehicles:** root faces +Z (forward axis); wheels named
  `wheel_FL`, `wheel_FR` (steer + spin) and `wheel_RL`, `wheel_RR` (spin);
  materials named `headlight_L`, `headlight_R`, `taillight_L`, `taillight_R`;
  a driver door pivot named `driverDoor` (or any node whose name contains
  `driverDoor`) that the enter/exit flow swings open/closed about +Y.

## Licensing requirements

Every external asset must be legally usable for this game and documented in
`ASSET_LICENSES.md` (see repo root). Acceptable sources include CC0/CC-BY
libraries such as:

- Poly Haven (https://polyhaven.com)
- Quaternius (https://quaternius.com)
- Kenney (https://kenney.nl)
- other clearly licensed free assets

**Never** place ripped/proprietary assets here (GTA/Rockstar, extracted game
files, unlicensed Sketchfab downloads, etc.).
