# AGENTS.md

Instructions for humans and AI coding assistants working on this repository.

## Project purpose

"Last Delivery" is a third-person open-world action browser game set in a
small stylized neon city at night. The game contains one main mission, "The
Heist": steal a target vehicle, escape the police, and drive it to the docks.

The game is being created for a solo game development challenge. The entire
project is a fresh, original implementation.

## Technology stack

- TypeScript (strict mode)
- Three.js
- Vite (build tool / dev server)
- WebGL (rendering)
- HTML + CSS (UI shell)
- Git + GitHub (version control)
- GitHub Pages (deployment)

No other runtime dependencies should be added without strong justification.

## Challenge rules

- The project was created from scratch after the challenge began.
- A single developer (the repo owner) is the sole developer.
- AI-assisted coding may only use the permitted FREE OpenCode model.
- Paid AI models and paid AI coding services are not allowed.
- Cursor, GitHub Copilot, Claude, ChatGPT coding APIs, and any other AI
  coding service are not allowed.
- Do not copy code from existing commercial games.
- Do not use stolen, ripped, extracted, or proprietary GTA/Rockstar assets.
- Premade assets are allowed only when they are legally usable.
- The final game must be playable.
- The final source code is submitted to GitHub.
- OpenCode sessions are preserved and shared as proof.
- The project must stay suitable for a solo developer.

## Coding conventions

- TypeScript, strict mode, no `any` unless unavoidable and documented.
- Modular code; one focused concern per file. Avoid giant files.
- `main.ts` only bootstraps the app. Do not put gameplay in it.
- Reusable systems live in `src/core` and separate from mission logic.
- Use `file_path:line` references when commenting about code.
- No inline comments unless they explain non-obvious intent.
- Match the existing code style of the file being edited.
- Do not modify unrelated files.
- Do not delete existing work unless absolutely necessary.
- Do not create fake implementations that only look functional.
- If a system is incomplete, clearly state what remains.

## Folder architecture

```
src/
  core/        Game, InputManager, CameraManager, AudioManager
  player/      Player, PlayerController, PlayerAnimation
  vehicles/    Vehicle, VehicleController, VehicleManager
  police/      Police, PoliceAI, WantedSystem
  world/       City, Traffic, NPCManager
  missions/    MissionManager, HeistMission
  ui/          HUD, Minimap, MissionUI
  effects/     Rain, Fog, PostProcessing
  main.ts      Bootstrap
```

This is a starting structure, not rigid. Improve it only with a strong
technical reason, while keeping it simple for one developer.

## Performance requirements

Hardware target:

- CPU: Intel Core i5-1135G7
- RAM: 8 GB
- GPU: NVIDIA GeForce MX330
- VRAM: 2 GB

Therefore:

- Keep the world small.
- Avoid unnecessarily high-poly geometry.
- Avoid huge textures; prefer compressed/optimized textures.
- Limit simultaneous NPCs and vehicles.
- Use instancing where useful.
- Use LOD where useful.
- Avoid unnecessary post-processing.
- Avoid expensive real-time effects when possible.
- Prioritize stable performance over graphical complexity.

Target: a smooth, playable browser experience on the hardware above.

## Asset licensing rules

- No proprietary or ripped assets.
- No stolen, extracted, or GTA/Rockstar assets.
- Premade assets are allowed only when legally usable (e.g., CC0, MIT,
  open-source or explicitly licensed for reuse). Track asset sources.

## AI usage restrictions

- Only the permitted FREE OpenCode model may assist with code.
- No paid AI coding services of any kind.
- Do not use external AI services (APIs, copilots) in this repo.
- Do not download assets automatically.
- Future AI-assisted work must follow all rules in this file.

## Testing requirements

- The project must remain runnable after each major change.
- Before changing files, inspect the existing project.
- After each feature, verify with:
  - `npm run typecheck` (no TypeScript errors)
  - `npm run build` (production build succeeds)
  - `npm run dev` (dev server starts and the scene renders)
- Implement gameplay systems one feature at a time.

## Development workflow

1. Inspect the existing project before changing files.
2. Work feature-by-feature. Never implement the whole game at once.
3. Keep the scope focused on one highly polished mission.
4. Do not implement multiplayer or multiple story missions.
5. Verify typecheck/build/dev after each change.
6. Commit logical changes with concise messages.
