import * as THREE from "three";
import { InputManager } from "./InputManager";
import { CameraManager } from "./CameraManager";
import { Player, PlayerState } from "../player/Player";
import { PlayerController } from "../player/PlayerController";
import { PlayerAnimation } from "../player/PlayerAnimation";
import { Vehicle, SEDAN_CONFIG } from "../vehicles/Vehicle";
import { VehicleController } from "../vehicles/VehicleController";
import { VehicleManager } from "../vehicles/VehicleManager";
import { InteractionPrompt } from "../ui/InteractionPrompt";
import { WantedDisplay } from "../ui/WantedDisplay";
import { DebugOverlay } from "../ui/DebugOverlay";
import { WantedSystem } from "../police/WantedSystem";
import { PoliceManager } from "../police/PoliceManager";
import { City } from "../world/City";

/**
 * Core game bootstrap.
 *
 * Owns the renderer, scene, camera, input and the render loop, and wires the
 * gameplay modules together. The full City is built at construction; the
 * player spawns at the START plaza with a test vehicle nearby. The wanted/
 * police loop is live (driven by the WantedSystem and PoliceManager) with
 * debug hotkeys F1-F3 to raise/lower the wanted level.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly container: HTMLElement;
  private readonly clock: THREE.Clock;
  private readonly input: InputManager;
  private readonly cameraManager: CameraManager;
  private readonly player: Player;
  private readonly playerController: PlayerController;
  private readonly playerAnimation: PlayerAnimation;
  private readonly vehicleManager: VehicleManager;
  private readonly vehicleController: VehicleController;
  private readonly prompt: InteractionPrompt;
  private readonly wanted: WantedSystem;
  private readonly policeManager: PoliceManager;
  private readonly wantedDisplay: WantedDisplay;
  private readonly debugOverlay: DebugOverlay;
  private readonly obstacleColliders: readonly THREE.Box3[];

  private animationId = 0;
  private running = false;
  private noticeTimer = 0;
  private introTimer = 2.2;

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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

    const city = new City(this.scene);
    this.obstacleColliders = city.colliders;

    this.player = new Player();
    this.player.teleport(city.locations.START.x, city.locations.START.z, city.locations.START.yaw);
    this.scene.add(this.player.group);

    // Cinematic establishing shot: elevated, pulled back over the START plaza,
    // framing the player and the road to the north (with the starter vehicle).
    const start = city.locations.START;
    this.camera.position.set(start.x + 6, 9, start.z + 18);
    this.camera.lookAt(start.x + 26, 1.5, start.z - 50);

    this.cameraManager = new CameraManager(this.camera, this.input);

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

    this.playerController = new PlayerController(this.input, this.player, this.cameraManager);
    this.playerAnimation = new PlayerAnimation(this.player);
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
    overlay.addEventListener("click", () => this.input.requestPointerLock());
  }

  private bindResize(): void {
    window.addEventListener("resize", () => this.onResize());
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  private update(delta: number): void {
    if (this.player.state === PlayerState.IN_VEHICLE) {
      this.vehicleController.update(delta);
      if (this.input.wasPressed("E")) {
        this.vehicleManager.exit();
        this.cameraManager.setMode("player");
        this.refreshPlayerColliders();
      }
    } else {
      this.playerController.update(delta);
      this.playerAnimation.update(delta);
      if (this.input.wasPressed("E")) {
        const vehicle = this.vehicleManager.findEnterable();
        if (vehicle) {
          this.vehicleManager.enter(vehicle);
          this.cameraManager.setMode("vehicle", vehicle.group);
        }
      }
    }

    const cameraTarget =
      this.player.state === PlayerState.IN_VEHICLE
        ? this.vehicleManager.active?.group
        : this.player.group;
    // Hold the establishing shot until the player engages (or the intro elapses).
    if (this.input.locked) this.introTimer = 0;
    if (this.introTimer > 0) {
      this.introTimer -= delta;
    } else if (cameraTarget) {
      this.cameraManager.update(delta, cameraTarget);
    }

    this.handleDebugKeys();

    this.wanted.update(delta, this.policeManager.isPlayerInPursuit);
    this.policeManager.update(delta, this.player, this.vehicleManager, this.wanted);
    this.wantedDisplay.update();
    if (import.meta.env.DEV) this.debugOverlay.update({ frameTimeMs: delta * 1000 });

    this.updatePrompt(delta);
    this.input.endFrame();
  }

  /** Dev-only helpers: F1/F2/F3 adjust the wanted level, F4 toggles the debug overlay. */
  private handleDebugKeys(): void {
    if (!import.meta.env.DEV) return;
    if (this.input.wasPressed("F1")) this.wanted.raiseWantedLevel(1);
    if (this.input.wasPressed("F2")) this.wanted.lowerWantedLevel(1);
    if (this.input.wasPressed("F3")) this.wanted.setWantedLevel(this.wanted.maxWantedLevel);
    if (this.input.wasPressed("F4")) this.debugOverlay.toggleVisible();
  }

  /** Police reached the player: force-exit the vehicle and make them stand down. */
  private handleArrest(): void {
    if (this.player.state === PlayerState.IN_VEHICLE) this.vehicleManager.exit();
    this.player.teleport(this.player.group.position.x, this.player.group.position.z, this.player.group.rotation.y);
    this.cameraManager.setMode("player");
    this.wanted.clearWantedLevel();
    this.policeManager.reset();
    this.refreshPlayerColliders();
    this.showNotice("BUSTED! The police stand down...");
  }

  private showNotice(text: string): void {
    this.prompt.show(text);
    this.noticeTimer = 2.5;
  }

  private updatePrompt(delta: number): void {
    if (this.noticeTimer > 0) {
      this.noticeTimer -= delta;
      if (this.noticeTimer <= 0) this.prompt.hide();
      return;
    }
    if (this.player.state === PlayerState.IN_VEHICLE) {
      this.prompt.show("Press E to exit vehicle");
      return;
    }
    if (this.vehicleManager.findEnterable()) {
      this.prompt.show("Press E to enter vehicle");
      return;
    }
    this.prompt.hide();
  }

  dispose(): void {
    this.stop();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
