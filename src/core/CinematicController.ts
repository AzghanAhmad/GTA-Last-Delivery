import * as THREE from "three";

export type CinematicKind = "steal" | "deliver" | "complete";

export interface CinematicFollow {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Short, non-interrupting camera cuts used for mission beats (1-2s each).
 *
 * A cut tracks a moving subject (the target car): the shot's end pose is
 * recomputed every frame from the follow state, so the player keeps control
 * and the camera stays glued to the action. `timeScale` lets Game slow the
 * world (e.g. the delivery beat) while the shot itself runs in real time. When
 * a shot ends Game calls CameraManager.syncFromCamera() so the normal third-
 * person orbit resumes smoothly instead of snapping.
 */
export class CinematicController {
  private shot: {
    kind: CinematicKind;
    duration: number;
    timer: number;
    timeScale: number;
    startPos: THREE.Vector3;
    startLook: THREE.Vector3;
    follow: () => CinematicFollow;
  } | null = null;

  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly endPos = new THREE.Vector3();
  private readonly endLook = new THREE.Vector3();

  get active(): boolean {
    return this.shot !== null;
  }

  /** World speed multiplier while a shot is active (1 when idle). */
  get timeScale(): number {
    return this.shot?.timeScale ?? 1;
  }

  /**
   * Starts a shot. `startPos`/`startLook` are captured now so the cut eases out
   * of the current view; the end pose follows `follow()` live every frame.
   */
  play(
    kind: CinematicKind,
    duration: number,
    timeScale: number,
    startPos: THREE.Vector3,
    startLook: THREE.Vector3,
    follow: () => CinematicFollow,
  ): void {
    this.shot = {
      kind,
      duration,
      timer: 0,
      timeScale,
      startPos: startPos.clone(),
      startLook: startLook.clone(),
      follow,
    };
  }

  /** Forces the current shot to end immediately (used on restart). */
  cancel(): void {
    this.shot = null;
  }

  /**
   * Advances the shot; returns the camera pose to use this frame, or null when
   * the shot has finished (consumers should then sync the orbit camera).
   */
  update(delta: number): { position: THREE.Vector3; lookAt: THREE.Vector3 } | null {
    const shot = this.shot;
    if (!shot) return null;
    shot.timer += delta;
    const t = Math.min(1, shot.timer / shot.duration);
    const s = easeInOut(t);
    this.computeEndPose(shot);
    this.pos.lerpVectors(shot.startPos, this.endPos, s);
    this.look.lerpVectors(shot.startLook, this.endLook, s);
    if (t >= 1) {
      this.shot = null;
      return { position: this.pos, lookAt: this.look };
    }
    return { position: this.pos, lookAt: this.look };
  }

  private computeEndPose(shot: NonNullable<CinematicController["shot"]>): void {
    const follow = shot.follow();
    const cy = Math.cos(follow.yaw);
    const sy = Math.sin(follow.yaw);
    const world = (lx: number, lz: number): [number, number] => [lx * cy + lz * sy, -lx * sy + lz * cy];

    let ox = 0;
    let oz = 0;
    let oy = 1.8;
    switch (shot.kind) {
      case "steal":
        [ox, oz] = world(-3.2, -2.6);
        oy = 2.0;
        break;
      case "deliver":
        [ox, oz] = world(0, 4.4);
        oy = 2.6;
        break;
      case "complete":
        [ox, oz] = world(0, -6.8);
        oy = 4.8;
        break;
    }
    this.endPos.set(follow.x + ox, oy, follow.z + oz);
    this.endLook.set(follow.x, 0.9, follow.z);
  }
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
