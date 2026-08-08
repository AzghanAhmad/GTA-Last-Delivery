import type { InputManager } from "../core/InputManager";
import type { Vehicle } from "./Vehicle";

/**
 * Converts raw input into vehicle controls.
 *
 * W/S drive forward/reverse-brake, A/D steer relative to the vehicle's own
 * heading (the camera orbits independently), Space is the handbrake.
 */
export class VehicleController {
  private readonly input: InputManager;
  private readonly vehicle: Vehicle;

  constructor(input: InputManager, vehicle: Vehicle) {
    this.input = input;
    this.vehicle = vehicle;
  }

  update(delta: number): void {
    const throttle = (this.input.isDown("KeyW") ? 1 : 0) - (this.input.isDown("KeyS") ? 1 : 0);
    const steer = (this.input.isDown("KeyA") ? 1 : 0) - (this.input.isDown("KeyD") ? 1 : 0);
    const handbrake = this.input.isDown("Space");

    // Drain Space edge presses while driving so they don't trigger a jump on return to foot.
    this.input.wasPressed("Space");

    this.vehicle.update(delta, { throttle, steer, handbrake });
  }
}
