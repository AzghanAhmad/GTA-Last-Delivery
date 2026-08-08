export type AudioCue =
  | "missionStart"
  | "objective"
  | "steal"
  | "policeAlert"
  | "deliver"
  | "complete"
  | "failed";

/**
 * Lightweight WebAudio sound engine.
 *
 * All cues are synthesized tones (no copyrighted audio assets, nothing to
 * download), so the feature adds zero asset weight and never blocks loading.
 * Audio is strictly optional: the AudioContext is created lazily on the first
 * user gesture (pointer-lock click) and every call is wrapped so the mission
 * keeps working even if audio fails or the browser blocks autoplay.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenTimer: number | null = null;
  private sirenOn = false;

  /** Creates/resumes the AudioContext; must be called from a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  /** Plays a single synthesized cue. Safe to call before audio is unlocked. */
  cue(kind: AudioCue): void {
    if (!this.ready()) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      switch (kind) {
        case "missionStart":
          this.tone(t, 523, 0.14, "sine", 0.5);
          this.tone(t + 0.16, 659, 0.24, "sine", 0.5);
          break;
        case "objective":
          this.tone(t, 880, 0.12, "sine", 0.35);
          break;
        case "steal":
          this.sweep(t, 220, 720, 0.4, "sawtooth", 0.4);
          break;
        case "policeAlert":
          this.tone(t, 700, 0.16, "square", 0.24);
          this.tone(t + 0.2, 480, 0.16, "square", 0.24);
          break;
        case "deliver":
          this.sweep(t, 660, 990, 0.3, "triangle", 0.4);
          break;
        case "complete":
          [523, 659, 784, 1046].forEach((freq, i) => this.tone(t + i * 0.13, freq, 0.16, "triangle", 0.45));
          break;
        case "failed":
          this.sweep(t, 420, 140, 0.7, "sawtooth", 0.4);
          break;
      }
    } catch {
      /* audio is decorative; never let it break the mission */
    }
  }

  /** Starts or stops the police siren loop (two-tone wail). */
  setSiren(active: boolean): void {
    if (active === this.sirenOn) return;
    this.sirenOn = active;
    if (!this.ready()) {
      this.sirenOn = false;
      return;
    }
    if (active) this.startSiren();
    else this.stopSiren();
  }

  dispose(): void {
    this.stopSiren();
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
  }

  private ready(): boolean {
    return this.ctx !== null && this.master !== null && this.ctx.state === "running";
  }

  private startSiren(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 560;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 720;
      filter.Q.value = 1.2;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      osc.start();
      this.sirenOsc = osc;
      this.sirenGain = gain;
      let high = false;
      this.sirenTimer = window.setInterval(() => {
        if (!this.sirenOsc || !this.sirenGain) return;
        const now = ctx.currentTime;
        high = !high;
        this.sirenOsc.frequency.setTargetAtTime(high ? 860 : 560, now, 0.05);
        this.sirenGain.gain.setTargetAtTime(high ? 0.2 : 0.14, now, 0.05);
      }, 420);
    } catch {
      this.stopSiren();
    }
  }

  private stopSiren(): void {
    if (this.sirenTimer !== null) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
    }
    if (this.sirenOsc) {
      try {
        this.sirenOsc.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  private tone(
    start: number,
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private sweep(
    start: number,
    fromFreq: number,
    toFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, start);
    osc.frequency.exponentialRampToValueAtTime(toFreq, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
}
