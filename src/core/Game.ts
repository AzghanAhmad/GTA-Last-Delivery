import * as THREE from "three";
import { InputManager } from "./InputManager";
import { CameraManager } from "./CameraManager";
import { AudioManager } from "./AudioManager";
import { CinematicController, type CinematicKind } from "./CinematicController";
import { Player, PlayerState } from "../player/Player";
import { PlayerController } from "../player/PlayerController";
import { Vehicle, SEDAN_CONFIG } from "../vehicles/Vehicle";
import { VehicleController } from "../vehicles/VehicleController";
import { VehicleManager } from "../vehicles/VehicleManager";
import { InteractionPrompt } from "../ui/InteractionPrompt";
import { WantedDisplay } from "../ui/WantedDisplay";
import { DebugOverlay } from "../ui/DebugOverlay";
import { WantedSystem } from "../police/WantedSystem";
import { PoliceManager } from "../police/PoliceManager";
import { City } from "../world/City";
import { WORLD_LOCATIONS } from "../world/WorldLocations";
import { HeistMission, HEIST_TIME_LIMIT } from "../missions/HeistMission";
import { MissionState } from "../missions/MissionState";
import type { MissionObjective } from "../missions/MissionManager";
import { MissionMarker } from "../missions/MissionMarker";
import { MissionHUD } from "../ui/MissionHUD";
import { GraphicsSettings } from "./GraphicsSettings";
import { PerfHUD } from "../ui/PerfHUD";
import { WorldMap } from "../world/WorldMap";
import { Minimap, type MinimapActor } from "../ui/Minimap";
import { MapOverlay, type OverlayActor } from "../ui/MapOverlay";
import { ControlsPanel } from "../ui/ControlsPanel";

/**
 * Core game bootstrap.
 *
 * Owns the renderer, scene, camera, input and the render loop, and wires the
 * gameplay modules together. The full City is built at construction; the
 * player spawns at the START plaza with a starter car nearby and the Heist
 * target parked in the warehouse compound. The single mission ("The Blackout
 * Job") drives the state machine; Game reacts to its state changes to raise
 * the wanted level, play short camera cuts (steal / deliver / complete),
 * trigger audio and update the HUD, maps and objective markers.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly container: HTMLElement;
  private readonly clock: THREE.Clock;
  private readonly input: InputManager;
  private readonly cameraManager: CameraManager;
  private readonly audio: AudioManager;
  private readonly cinematic: CinematicController;
  private readonly player: Player;
  private readonly playerController: PlayerController;
  private readonly vehicleManager: VehicleManager;
  private readonly vehicleController: VehicleController;
  /** The Heist target car, parked inside the warehouse compound. */
  private readonly targetVehicle: Vehicle;
  private readonly mission: HeistMission;
  private readonly missionMarker: MissionMarker;
  private readonly missionHUD: MissionHUD;
  private readonly prompt: InteractionPrompt;
  private readonly wanted: WantedSystem;
  private readonly policeManager: PoliceManager;
  private readonly wantedDisplay: WantedDisplay;
  private readonly debugOverlay: DebugOverlay;
  private readonly city: City;
  private readonly obstacleColliders: readonly THREE.Box3[];
  private readonly settings: GraphicsSettings;
  private readonly perfHUD: PerfHUD;
  private readonly worldMap: WorldMap;
  private readonly minimap: Minimap;
  private readonly mapOverlay: MapOverlay;
  private readonly controlsPanel: ControlsPanel;

  private animationId = 0;
  private running = false;
  private noticeTimer = 0;
  private introTimer = 2.2;
  private arrested = false;
  private missionComplete = false;
  /** True while the full map is open; gameplay (and the 3D render) is paused. */
  private paused = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    this.settings = new GraphicsSettings();
    const g = this.settings.config;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(this.settings.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1622);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );

    this.input = new InputManager(this.renderer.domElement);

    this.city = new City(this.scene, this.renderer);
    const city = this.city;
    this.obstacleColliders = city.colliders;

    city.materials.setMaxAnisotropy(g.maxAnisotropy);
    city.buildings.setLodBias(g.lodBias);
    city.environment.setFogScale(this.settings.fogScale);
    city.environment.configureShadows(g.shadowMapSize, g.shadowDistance, g.shadowBias, g.shadowNormalBias);
    // The scene is fully built now; let the day mode dim the neon night glow.
    city.environment.refreshMode();

    // The player spawns mid-city on the main avenue (WORLD_LOCATIONS.START
    // mirrors the canonical PLAYER_SPAWN in SpawnConfig), next to the starter car.
    this.player = new Player();
    this.player.teleport(city.locations.START.x, city.locations.START.z, city.locations.START.yaw);
    this.scene.add(this.player.group);

    // Cinematic establishing shot: elevated and pulled back over the spawn,
    // framing the player and starter car in the foreground with the lit
    // downtown skyline (Nova Tower) down the road to the south.
    const start = city.locations.START;
    this.camera.position.set(start.x - 4, 8, start.z + 14);
    this.camera.lookAt(start.x - 2, 1.4, start.z - 60);

    this.cameraManager = new CameraManager(this.camera, this.input, {}, city.colliders);

    const testVehicle = new Vehicle(SEDAN_CONFIG);
    testVehicle.setColliders(city.colliders);
    testVehicle.group.position.set(
      city.locations.START_VEHICLE.x,
      0,
      city.locations.START_VEHICLE.z,
    );
    testVehicle.group.rotation.y = city.locations.START_VEHICLE.yaw;
    this.scene.add(testVehicle.group);

    this.vehicleManager = new VehicleManager(this.player, city.colliders);
    this.vehicleManager.register(testVehicle);
    this.vehicleController = new VehicleController(this.input, testVehicle);

    // The Heist target: a fast prototype car parked in the warehouse compound,
    // headlights on so it reads as the mark in the dark district.
    this.targetVehicle = Vehicle.supercar();
    this.targetVehicle.setColliders(city.colliders);
    this.targetVehicle.group.position.set(
      WORLD_LOCATIONS.TARGET_VEHICLE.x,
      0,
      WORLD_LOCATIONS.TARGET_VEHICLE.z,
    );
    this.targetVehicle.group.rotation.y = WORLD_LOCATIONS.TARGET_VEHICLE.yaw;
    this.targetVehicle.setHeadlights(true);
    this.scene.add(this.targetVehicle.group);
    this.vehicleManager.register(this.targetVehicle);

    this.playerController = new PlayerController(this.input, this.player, this.cameraManager);
    this.prompt = new InteractionPrompt(container);

    this.wanted = new WantedSystem();
    this.policeManager = new PoliceManager(this.scene, this.obstacleColliders, () =>
      this.handleArrest(),
    );
    this.wantedDisplay = new WantedDisplay(container, this.wanted);
    this.debugOverlay = new DebugOverlay(
      container,
      this.player,
      this.vehicleManager,
      this.policeManager,
      this.wanted,
      this.renderer,
      this.scene,
      this.camera,
    );
    this.perfHUD = new PerfHUD(container, {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      player: this.player,
      vehicleManager: this.vehicleManager,
      environment: this.city.environment,
      settings: this.settings,
    });

    this.worldMap = new WorldMap();
    this.minimap = new Minimap(this.hudMount("minimap"), this.worldMap);
    this.controlsPanel = new ControlsPanel(this.hudMount("controls-panel"));
    this.mapOverlay = new MapOverlay(this.hudMount("map-overlay"), this.worldMap);

    this.audio = new AudioManager();
    this.cinematic = new CinematicController();

    // "The Blackout Job" runs from the first frame; the beacon, HUD and map
    // markers follow the state machine, and Game reacts to state changes.
    this.mission = new HeistMission();
    this.missionHUD = new MissionHUD(this.hudMount("mission-hud"));
    this.missionMarker = new MissionMarker(this.scene, 0xffd23e);
    this.mission.onObjectiveChange = (objective) => this.onMissionObjective(objective);
    this.mission.onStateChange = (state) => this.onMissionState(state);
    this.mission.start();

    this.refreshPlayerColliders();
    this.setupOverlay();
    this.bindResize();

    if (import.meta.env.DEV) {
      console.log("[Last Delivery] initialized", {
        renderer: `${this.renderer.domElement.width}x${this.renderer.domElement.height}`,
        sceneObjects: this.scene.children.length,
        player: this.player.group.position.toArray(),
        vehicle: testVehicle.group.position.toArray(),
        camera: this.camera.position.toArray(),
      });
    }
  }

  /** Blocks the walking player with obstacles and parked vehicles. */
  private refreshPlayerColliders(): void {
    const boxes: THREE.Box3[] = [...this.obstacleColliders];
    for (const vehicle of this.vehicleManager.vehicles) {
      vehicle.group.updateMatrixWorld(true);
      boxes.push(new THREE.Box3().setFromObject(vehicle.group));
    }
    this.player.setColliders(boxes);
  }

  private setupOverlay(): void {
    const overlay = this.container.querySelector("#pointer-lock-overlay");
    if (!overlay) return;
    this.input.onLockChange = (locked) => {
      overlay.classList.toggle("hidden", locked);
    };
    overlay.addEventListener("click", () => {
      this.audio.unlock();
      this.input.requestPointerLock();
    });
  }

  private bindResize(): void {
    window.addEventListener("resize", () => this.onResize());
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.city.environment.resize(window.innerWidth, window.innerHeight);
    this.minimap.resize();
    if (this.mapOverlay.isMapOpen) this.mapOverlay.resize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animationId);
  }

  private loop(): void {
    this.animationId = requestAnimationFrame(() => this.loop());
    const rawDelta = Math.min(this.clock.getDelta(), 0.05);
    this.handleMapKeys();
    if (!this.paused) {
      // Cinematic cuts slow the world but the camera runs in real time.
      const gameplayDelta = rawDelta * this.cinematic.timeScale;
      this.update(gameplayDelta, rawDelta);
      this.city.environment.render(this.camera);
    } else {
      // True pause: freeze gameplay and the 3D render; keep the map actors live.
      this.mapOverlay.render(this.collectOverlayActors());
    }
    this.input.endFrame();
  }

  private update(worldDelta: number, cameraDelta: number): void {
    const state = this.player.state;
    if (state === PlayerState.IN_VEHICLE) {
      this.vehicleController.update(worldDelta);
      if (this.input.wasPressed("E")) {
        const vehicle = this.vehicleManager.active;
        if (vehicle) vehicle.setHeadlights(false);
        this.vehicleManager.beginExit();
        if (vehicle) this.cameraManager.setMode("vehicle", vehicle.group);
      }
    } else if (state === PlayerState.ON_FOOT) {
      this.playerController.update(worldDelta);
      if (this.input.wasPressed("E")) {
        const vehicle = this.vehicleManager.findEnterable();
        if (vehicle) {
          this.vehicleManager.beginEnter(vehicle);
          vehicle.setHeadlights(true);
          this.cameraManager.setMode("vehicle", vehicle.group);
        }
      }
    }

    this.vehicleManager.update(worldDelta);
    if (this.vehicleManager.consumeExitCompleted()) {
      this.cameraManager.setMode("player");
      this.refreshPlayerColliders();
    }

    // Mission time runs in real seconds (not slow-motion) so the clock and the
    // time bonus stay fair during cinematic cuts.
    this.updateMission(cameraDelta);

    const inVehicleFlow = state !== PlayerState.ON_FOOT;
    const cameraTarget = inVehicleFlow
      ? this.vehicleManager.active?.group ?? this.player.group
      : this.player.group;
    // Hold the establishing shot until the player engages (or the intro elapses).
    if (this.input.locked) this.introTimer = 0;
    if (this.introTimer > 0) {
      this.introTimer -= cameraDelta;
    } else if (this.cinematic.active) {
      this.updateCinematicCamera(cameraDelta);
    } else if (this.policeManager.arrestingOfficer || this.arrested) {
      this.updateArrestCamera(cameraDelta);
    } else if (cameraTarget) {
      this.cameraManager.update(worldDelta, cameraTarget);
    }

    // Day/night cycle (L) and the post-mission restart (R).
    this.city.environment.update(this.camera.position);
    this.city.updateVisuals(this.camera.position, worldDelta);
    if (this.input.wasPressed("KeyL")) this.city.environment.toggleDayNight();
    if (this.input.wasPressed("KeyR") && this.canRestart()) this.restart();

    this.handleDebugKeys();

    this.wanted.update(worldDelta, this.policeManager.isPlayerInPursuit);
    this.policeManager.update(worldDelta, this.player, this.vehicleManager, this.wanted);
    this.audio.setSiren(this.wanted.isWanted());
    this.wantedDisplay.update();
    if (import.meta.env.DEV) {
      this.debugOverlay.update({ frameTimeMs: worldDelta * 1000 });
      this.perfHUD.update(worldDelta);
    }

    this.updateHUD();
    this.updatePrompt(worldDelta);
  }

  /** Feeds the heist with current state, advances it, and animates the beacon. */
  private updateMission(delta: number): void {
    const active = this.vehicleManager.active;
    const inVehicle = this.player.state === PlayerState.IN_VEHICLE;
    const pos = inVehicle && active ? active.group.position : this.player.group.position;
    const inTarget = active === this.targetVehicle;

    let nearestPolice = Infinity;
    for (const unit of this.policeManager.units) {
      const dx = unit.vehicle.group.position.x - pos.x;
      const dz = unit.vehicle.group.position.z - pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance < nearestPolice) nearestPolice = distance;
    }

    this.mission.setContext({
      playerX: pos.x,
      playerZ: pos.z,
      inTargetVehicle: inTarget,
      target: {
        x: this.targetVehicle.group.position.x,
        z: this.targetVehicle.group.position.z,
        speed: this.targetVehicle.speed,
        damage: this.targetVehicle.damage,
      },
      nearestPoliceDistance: nearestPolice,
      noPursuit: !this.wanted.isWanted(),
    });
    this.mission.update(delta);
    this.missionMarker.update(delta);
  }

  /** Reacts to mission state beats: banners, wanted level, audio and camera cuts. */
  private onMissionState(state: MissionState): void {
    switch (state) {
      case MissionState.INTRO:
        this.audio.cue("missionStart");
        this.missionHUD.showBanner("THE BLACKOUT JOB", "Steal the Aurora GT and deliver it to the docks");
        break;
      case MissionState.STEAL_TARGET:
        this.audio.cue("steal");
        this.wanted.setWantedLevel(this.mission.heistWantedLevel);
        this.missionHUD.showBanner("STEAL THE AURORA GT", "Get in and go");
        this.playCinematic("steal");
        break;
      case MissionState.DELIVER_VEHICLE:
        this.audio.cue("deliver");
        this.wanted.clearWantedLevel();
        this.missionHUD.showBanner("DELIVERY", "The Aurora GT is home");
        this.playCinematic("deliver");
        break;
      case MissionState.MISSION_COMPLETE:
        this.missionComplete = true;
        this.wanted.clearWantedLevel();
        this.policeManager.reset();
        this.audio.cue("complete");
        this.missionHUD.showBanner("PAYDAY", "", 2000);
        this.showSuccess();
        this.playCinematic("complete");
        break;
      case MissionState.MISSION_FAILED:
        this.audio.cue("failed");
        this.audio.setSiren(false);
        this.missionHUD.showFailed(this.mission.failReason ?? "busted");
        break;
      default:
        break;
    }
  }

  /** Repositions the beacon, updates the HUD and plays the objective chime. */
  private onMissionObjective(objective: MissionObjective | null): void {
    if (!objective || this.mission.currentPhase !== "running") {
      this.missionMarker.setObjective(null);
      this.missionHUD.hideObjective();
      return;
    }
    this.missionMarker.setObjective(objective);
    this.missionHUD.showObjective(objective.title);
    this.audio.cue("objective");
  }

  /** Starts a short camera cut following the relevant subject. */
  private playCinematic(kind: CinematicKind): void {
    const subject = kind === "complete" ? this.player.group : this.targetVehicle.group;
    const follow = () => ({
      x: subject.position.x,
      z: subject.position.z,
      yaw: subject.rotation.y,
    });
    const [duration, timeScale] =
      kind === "steal" ? [1.6, 0.5] : kind === "deliver" ? [2.1, 0.4] : [1.8, 0.6];
    const look = new THREE.Vector3(subject.position.x, 1.4, subject.position.z);
    this.cinematic.play(kind, duration, timeScale, this.camera.position.clone(), look, follow);
  }

  private updateCinematicCamera(delta: number): void {
    const pose = this.cinematic.update(delta);
    if (pose) {
      this.camera.position.copy(pose.position);
      this.camera.lookAt(pose.lookAt);
    }
    // The cut just ended this frame (or never started); re-base the orbit so
    // the normal camera resumes from the shot's final pose without a snap.
    if (!this.cinematic.active) this.cameraManager.syncFromCamera();
  }

  /** M toggles the full map; ESC closes it. Works from inside pointer lock too. */
  private handleMapKeys(): void {
    if (this.input.wasPressed("KeyM")) {
      if (this.mapOverlay.isMapOpen) {
        this.mapOverlay.close();
      } else {
        this.openMap();
      }
    } else if (this.input.wasPressed("Escape") && this.mapOverlay.isMapOpen) {
      this.mapOverlay.close();
    }
  }

  private openMap(): void {
    this.paused = true;
    this.mapOverlay.open(() => {
      this.paused = false;
    });
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Live HUD: controls hints, minimap, mission clock and the objective arrow. */
  private updateHUD(): void {
    const inVehicle = this.player.state === PlayerState.IN_VEHICLE;
    const active = this.vehicleManager.active;
    this.controlsPanel.setMode(inVehicle ? "vehicle" : "foot");

    const pos = inVehicle && active ? active.group.position : this.player.group.position;
    const yaw = inVehicle && active ? active.yaw : this.player.group.rotation.y;
    this.minimap.update(
      { x: pos.x, z: pos.z, yaw, color: inVehicle ? "#ffd97a" : "#9fd0ff", vehicle: inVehicle },
      this.collectMinimapExtras(inVehicle),
    );

    const running = this.mission.currentPhase === "running";
    this.missionHUD.setTimer(
      running ? Math.max(0, HEIST_TIME_LIMIT - this.mission.elapsedSeconds) : null,
    );
    const objective = running ? this.mission.currentObjective : null;
    this.missionHUD.updateArrow(objective ? { x: objective.x, z: objective.z } : null, this.camera);
  }

  /** Other things worth seeing on the minimap: your cars and any police units. */
  private collectMinimapExtras(skipActiveVehicle: boolean): MinimapActor[] {
    const actors: MinimapActor[] = [];
    const active = this.vehicleManager.active;
    for (const vehicle of this.vehicleManager.vehicles) {
      if (skipActiveVehicle && vehicle === active) continue;
      actors.push({
        x: vehicle.group.position.x,
        z: vehicle.group.position.z,
        yaw: vehicle.yaw,
        color: "#8fa8c8",
        vehicle: true,
      });
    }
    if (this.wanted.isWanted()) {
      for (const unit of this.policeManager.units) {
        actors.push({
          x: unit.vehicle.group.position.x,
          z: unit.vehicle.group.position.z,
          yaw: unit.vehicle.yaw,
          color: "#4f8cff",
          vehicle: true,
        });
      }
    }
    const objective = this.missionObjectiveActor();
    if (objective) actors.push(objective);
    return actors;
  }

  /** Everything drawn on the full map: player, vehicles and police. */
  private collectOverlayActors(): OverlayActor[] {
    const actors: OverlayActor[] = [
      {
        x: this.player.group.position.x,
        z: this.player.group.position.z,
        yaw: this.player.group.rotation.y,
        color: "#9fd0ff",
        vehicle: false,
      },
    ];
    for (const vehicle of this.vehicleManager.vehicles) {
      actors.push({
        x: vehicle.group.position.x,
        z: vehicle.group.position.z,
        yaw: vehicle.yaw,
        color: "#8fa8c8",
        vehicle: true,
      });
    }
    if (this.wanted.isWanted()) {
      for (const unit of this.policeManager.units) {
        actors.push({
          x: unit.vehicle.group.position.x,
          z: unit.vehicle.group.position.z,
          yaw: unit.vehicle.yaw,
          color: "#4f8cff",
          vehicle: true,
        });
      }
    }
    const objective = this.missionObjectiveActor();
    if (objective) actors.push(objective);
    return actors;
  }

  /** The active mission objective as a map actor, or null while none is active. */
  private missionObjectiveActor(): MinimapActor | null {
    if (this.mission.currentPhase !== "running") return null;
    const objective = this.mission.currentObjective;
    if (!objective) return null;
    const teal = objective.id === "docks" || objective.id === "deliverZone" || objective.id === "extraction";
    return {
      x: objective.x,
      z: objective.z,
      yaw: 0,
      color: teal ? "#5cf0c8" : "#ffd23e",
      vehicle: false,
      objective: true,
      radius: objective.ring,
    };
  }

  /** Finds a HUD mount, creating a hidden fallback so Game never crashes. */
  private hudMount(id: string): HTMLElement {
    const existing = document.getElementById(id);
    if (existing) return existing;
    const fallback = document.createElement("div");
    fallback.id = id;
    document.body.appendChild(fallback);
    return fallback;
  }

  /** Dev-only helpers: F1-F3 wanted level, F4 perf HUD, F5 test pass, F6 debug overlay. */
  private handleDebugKeys(): void {
    if (!import.meta.env.DEV) return;
    if (this.input.wasPressed("F1")) this.wanted.raiseWantedLevel(1);
    if (this.input.wasPressed("F2")) this.wanted.lowerWantedLevel(1);
    if (this.input.wasPressed("F3")) this.wanted.setWantedLevel(this.wanted.maxWantedLevel);
    if (this.input.wasPressed("F4")) this.perfHUD.toggleVisible();
    if (this.input.wasPressed("F5")) this.perfHUD.runChecks();
    if (this.input.wasPressed("F6")) this.debugOverlay.toggleVisible();
  }

  /** Officer reached the player: force-exit the vehicle and start the bust sequence. */
  private handleArrest(): void {
    if (this.arrested) return;
    const vehicle = this.vehicleManager.active;
    if (vehicle) vehicle.setHeadlights(false);
    this.vehicleManager.exit();
    this.arrested = true;
    this.wanted.clearWantedLevel();
    this.mission.fail("busted");
    this.refreshPlayerColliders();
  }

  /** Slow push-in on the player during the bust so the officer stays in frame. */
  private updateArrestCamera(delta: number): void {
    const target = this.player.group.position;
    const t = 1 - Math.exp(-3.5 * delta);
    this.camera.position.x += (target.x + 3.4 - this.camera.position.x) * t;
    this.camera.position.y += (target.y + 2.0 - this.camera.position.y) * t;
    this.camera.position.z += (target.z + 3.6 - this.camera.position.z) * t;
    this.camera.lookAt(target.x, target.y + 1.3, target.z);
  }

  private showSuccess(): void {
    const score = this.mission.getScore();
    this.missionHUD.showSuccess(score, this.mission.elapsedSeconds, HEIST_TIME_LIMIT, this.targetVehicle.damage);
  }

  /** True when the player may press R to restart (mission over, not during arrest-cam). */
  private canRestart(): boolean {
    if (this.arrested || this.missionComplete) return true;
    if (this.cinematic.active) return false;
    const phase = this.mission.currentPhase;
    return phase === "failed" || phase === "complete";
  }

  /** Soft reset: back to the START plaza with a fresh establishing shot. */
  private restart(): void {
    this.arrested = false;
    this.missionComplete = false;
    this.cinematic.cancel();
    this.audio.setSiren(false);
    this.missionHUD.reset();
    this.wanted.clearWantedLevel();
    this.policeManager.reset();
    this.vehicleManager.reset();
    this.vehicleManager.exit();
    this.targetVehicle.resetDamage();
    this.targetVehicle.setHeadlights(true);
    this.mission.reset();
    this.mission.start();
    this.player.setVisible(true);
    this.player.state = PlayerState.ON_FOOT;
    const start = this.city.locations.START;
    this.player.teleport(start.x, start.z, start.yaw);
    this.camera.position.set(start.x - 4, 8, start.z + 14);
    this.camera.lookAt(start.x - 2, 1.4, start.z - 60);
    this.cameraManager.reset();
    this.introTimer = 2.2;
    this.paused = false;
    if (this.mapOverlay.isMapOpen) this.mapOverlay.close();
    this.refreshPlayerColliders();
  }

  private updatePrompt(delta: number): void {
    if (this.arrested || this.missionComplete || this.mission.currentPhase === "failed") {
      this.prompt.hide();
      return;
    }
    if (this.cinematic.active) {
      this.prompt.hide();
      return;
    }
    if (this.noticeTimer > 0) {
      this.noticeTimer -= delta;
      if (this.noticeTimer <= 0) this.prompt.hide();
      return;
    }
    if (this.player.state === PlayerState.IN_VEHICLE) {
      this.prompt.show("Press E to exit vehicle");
      return;
    }
    if (this.player.state === PlayerState.ON_FOOT) {
      if (this.vehicleManager.findEnterable()) {
        this.prompt.show("Press E to enter vehicle");
        return;
      }
    }
    this.prompt.hide();
  }

  dispose(): void {
    this.stop();
    this.audio.dispose();
    this.missionMarker.dispose();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
