# Last Delivery

A third-person open-world action browser game set in a small stylized neon
city at night. Built with TypeScript, Three.js, and Vite, running directly in
a modern desktop browser.

> Development status: **foundation + core gameplay + visuals**. The engine
> bootstrap, player controller, vehicle system, police/wanted loop and the
> procedural night-city rendering (bloom, PBR materials, LOD) are in place.
> The mission, HUD and remaining atmosphere are still pending.

## Description

The player navigates a rainy neon city at night. The game contains a single
main mission, **The Heist**: steal a target vehicle, escape the police, and
drive it to the docks to escape the city.

The visual identity is a cinematic, rain-soaked neon city at night: emissive
signs, controlled bloom, fog, rain particles, wet roads, headlights, and
police lights — built to run smoothly on modest hardware.

## Technology stack

- TypeScript (strict mode)
- Three.js (WebGL rendering)
- Vite (build tool / dev server)
- HTML + CSS (UI shell)
- Git + GitHub (version control)
- GitHub Pages (deployment)

## Controls

| Input | Action |
| --- | --- |
| `WASD` | Move / drive |
| Mouse | Third-person camera |
| `Shift` | Sprint |
| `Space` | Jump / handbrake |
| `E` | Enter / exit vehicle |
| `W` | Accelerate |
| `S` | Brake / reverse |
| `L` | Toggle day / night |
| `R` | Restart after being arrested |
| `F1` / `F2` | Raise / lower wanted level (dev only) |
| `F3` | Set wanted level to max (dev only) |
| `F4` | Toggle performance HUD (dev only) |
| `F5` | Run a renderer/health test pass (dev only) |
| `F6` | Toggle debug status overlay (dev only) |

## Core features (planned)

- Third-person character: WASD movement, mouse camera, sprint, jump,
  animations, collision, health
- Drivable vehicles: acceleration, steering, braking/reverse, handbrake,
  enter/exit, third-person camera, collision, damage, headlights
- Police: AI vehicles, detection, chase, sirens, wanted level, search, arrest
- Wanted system with escalating levels (investigation, chase, aggressive pursuit)
- Small open-world city: roads, sidewalks, buildings, street/traffic lights,
  parked vehicles, pedestrians, light traffic, shops, alleys, parking area, docks
- Single main mission "The Heist" with objectives, markers, progress,
  failure/restart/completion
- UI: health, wanted stars, mission objective, minimap, speedometer,
  interaction prompts, mission complete / game over screens
- Atmosphere: nighttime, rain, fog, neon signs, headlights, police lights,
  wet roads, particles, cinematic camera effects

## Development status

Current milestones — **Project foundation**, **Player controller**,
**Vehicle system** and **Police & wanted system**:

- [x] Vite + TypeScript project initialized
- [x] Three.js bootstrap (renderer, scene, camera, lighting, render loop)
- [x] Folder architecture for core, player, vehicles, police, world,
      missions, ui, effects
- [x] AGENTS.md with project rules for humans and AI assistants
- [x] Third-person player controller: WASD movement, camera-relative
      movement, sprint, jump, gravity, ground + obstacle collision,
      procedural placeholder body
- [x] Third-person camera: mouse orbit (Pointer Lock), smoothing,
      configurable distance/pitch, camera never enters the player
- [x] Drivable vehicles: arcade physics (accelerate/brake/reverse/steer,
      handbrake), W/S throttle, A/D steer, Space handbrake, enter/exit with
      E, driver-side exit, vehicle third-person camera, rotating/steering
      wheels, headlights and brake lights, lightweight OBB collision,
      low-poly placeholder car
- [x] Police & wanted system: wanted levels 0-3 with detection radius and
      gradual decay, police AI units that spawn per level, chase with
      intercept prediction, lose-and-search, return home, roof light bars,
      officer that leaves the cruiser and arrests the player (busted
      sequence, restart with `R`); in dev, raise/lower with `F1`/`F2`,
      max with `F3`; `F4` toggles the debug overlay
- [x] World / city: nine blocks with districts (landmark tower, police
      station, gas station, warehouse district, docks), procedural
      buildings, neon signs, street lights, water, world-fixed night/day
      sky (toggle with `L`), collision
- [x] Graphics pipeline: ACES tone mapping + bloom post-FX (`F4` toggles,
      `F5` runs a health test), PBR shared materials with procedural
      canvas textures (`src/core/MaterialManager.ts`), detailed facades +
      distance LOD (`BuildingManager`), textured roads/sidewalks/curbs +
      instanced markings/manholes (`RoadSystem`), two lamp kinds with glow
      halos (`StreetLight`), instanced street trees (`Vegetation`), animated
      procedural water, camera wall-avoidance, and low/medium/high quality
      tiers (`GraphicsSettings`) — see `docs/GRAPHICS_PIPELINE.md`
- [ ] Mission "The Heist"
- [ ] UI (HUD, minimap, etc.)
- [ ] Atmosphere / effects (rain, particles, wet roads, headlights)

Implemented so far: foundation, player controller, vehicle system,
police/wanted system, and the procedural night-city visuals.

## How to install

Requires [Node.js](https://nodejs.org/) (18+ recommended).

```bash
npm install
```

## How to run locally

Development server (with hot reload):

```bash
npm run dev
```

Open the printed local URL (default `http://localhost:5173`) in a browser.

Production build:

```bash
npm run build
npm run preview
```

Type-checking without emitting files:

```bash
npm run typecheck
```

## Challenge compliance notes

- Original, from-scratch implementation created after the challenge began.
- No code copied from commercial games.
- No proprietary, ripped, or extracted assets.
- Premade assets, if ever used, are legally usable and tracked.
- AI-assisted coding uses only the permitted FREE OpenCode model.
- OpenCode sessions are preserved as proof of the development process.
- Scope is kept to a single polished mission for one solo developer.
