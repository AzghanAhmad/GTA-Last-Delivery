/**
 * Keyboard, mouse and Pointer Lock state for the whole game.
 *
 * Keyboard state is keyed by KeyboardEvent.code (e.g. "KeyW", "Space") so it
 * is independent of keyboard layout. Mouse deltas only accumulate while the
 * pointer is locked. Call endFrame() once per frame to clear per-frame input.
 */
export class InputManager {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly canvas: HTMLCanvasElement;

  private deltaMouseX = 0;
  private deltaMouseY = 0;
  private pointerLocked = false;
  private lockChangeHandler: (locked: boolean) => void = () => {};

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.held.has(event.code)) {
      this.pressed.add(event.code);
    }
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.deltaMouseX += event.movementX;
    this.deltaMouseY += event.movementY;
  };

  private readonly onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    this.lockChangeHandler(this.pointerLocked);
  };

  private readonly onPointerLockError = (): void => {
    this.pointerLocked = false;
    this.lockChangeHandler(false);
  };

  private readonly onCanvasClick = (): void => {
    this.requestPointerLock();
  };

  private readonly onBlur = (): void => {
    this.held.clear();
    this.pressed.clear();
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("pointerlockerror", this.onPointerLockError);
    canvas.addEventListener("click", this.onCanvasClick);
  }

  set onLockChange(handler: (locked: boolean) => void) {
    this.lockChangeHandler = handler;
  }

  get locked(): boolean {
    return this.pointerLocked;
  }

  get mouseDeltaX(): number {
    return this.deltaMouseX;
  }

  get mouseDeltaY(): number {
    return this.deltaMouseY;
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True once per key press; the press is consumed so it only fires once. */
  wasPressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  /** Clears per-frame state (mouse deltas). Call once at the end of each frame. */
  endFrame(): void {
    this.deltaMouseX = 0;
    this.deltaMouseY = 0;
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    this.canvas.requestPointerLock();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("pointerlockerror", this.onPointerLockError);
    this.canvas.removeEventListener("click", this.onCanvasClick);
  }
}
