import type { Player } from "./Player";

/**
 * Procedural placeholder animation for the primitive player body.
 *
 * Swings the limbs based on horizontal speed and poses the body while
 * airborne. This is a temporary stand-in; the hooks on Player expose the
 * pivots a real animation rig will attach to later.
 */
export class PlayerAnimation {
  private readonly player: Player;
  private time = 0;

  constructor(player: Player) {
    this.player = player;
  }

  update(delta: number): void {
    this.time += delta;
    const p = this.player;
    const stride = 0.6;

    if (!p.isGrounded) {
      p.legLeftPivot.rotation.x = 0.4;
      p.legRightPivot.rotation.x = -0.2;
      p.armLeftPivot.rotation.x = -0.3;
      p.armRightPivot.rotation.x = 0.3;
      return;
    }

    if (p.horizontalSpeed > 0.2) {
      const swing = Math.sin(this.time * (5 + p.horizontalSpeed * 1.1)) * stride;
      p.legLeftPivot.rotation.x = swing;
      p.legRightPivot.rotation.x = -swing;
      p.armLeftPivot.rotation.x = -swing * 0.7;
      p.armRightPivot.rotation.x = swing * 0.7;
    } else {
      p.legLeftPivot.rotation.x = 0;
      p.legRightPivot.rotation.x = 0;
      p.armLeftPivot.rotation.x = 0;
      p.armRightPivot.rotation.x = 0;
    }
  }
}
