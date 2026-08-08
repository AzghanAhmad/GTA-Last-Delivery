import * as THREE from "three";
import type { InputManager } from "../core/InputManager";
import type { CameraManager } from "../core/CameraManager";
import { PlayerState, type Player } from "./Player";

/**
 * Turns raw input into camera-relative player movement.
 *
 * W/S map to the camera forward axis and A/D to the camera right axis, so
 * movement follows the current view. The camera only provides direction;
 * the player rotates itself toward the movement direction.
 */
export class PlayerController {
  private readonly input: InputManager;
  private readonly player: Player;
  private readonly camera: CameraManager;

  private readonly moveDirection = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(input: InputManager, player: Player, camera: CameraManager) {
    this.input = input;
    this.player = player;
    this.camera = camera;
  }

  update(delta: number): void {
    if (this.player.state === PlayerState.IN_VEHICLE) return;

    const axisX = (this.input.isDown("KeyD") ? 1 : 0) - (this.input.isDown("KeyA") ? 1 : 0);
    const axisZ = (this.input.isDown("KeyW") ? 1 : 0) - (this.input.isDown("KeyS") ? 1 : 0);

    this.moveDirection.set(0, 0, 0);
    if (axisX !== 0 || axisZ !== 0) {
      this.camera.getForward(this.forward);
      this.right.set(this.forward.z, 0, -this.forward.x);
      this.moveDirection.addScaledVector(this.forward, axisZ).addScaledVector(this.right, axisX);
      this.moveDirection.normalize();
    }

    const sprint = this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight");

    if (this.input.wasPressed("Space")) {
      this.player.jump();
    }

    this.player.update(delta, this.moveDirection, sprint);
  }
}
