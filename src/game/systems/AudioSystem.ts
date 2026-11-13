import type { Settings } from './SaveSystem';
export class AudioSystem {
  private context?: AudioContext;
  private musicGain?: GainNode;
  private oscillators: OscillatorNode[] = [];
  private mode = 'menu';
  constructor(public settings: Settings) {}
  unlock() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
      if (!this.musicGain) {
        const gain = this.context.createGain();
        gain.connect(this.context.destination);
        this.musicGain = gain;
        for (const hz of [55, 82.41, 110.1]) {
          const o = this.context.createOscillator();
          o.type = 'sine';
          o.frequency.value = hz;
          o.connect(gain);
          o.start();
          this.oscillators.push(o);
        }
        this.setMode(this.mode);
        this.refresh();
      }
    } catch {
      /* Audio is optional. */
    }
  }
  setMode(mode: string) {
    this.mode = mode;
    const frequencies = mode === 'zombie' ? [43.65, 65.4, 87.3] : [55, 82.41, 110.1];
    if (this.context)
      this.oscillators.forEach((o, i) =>
        o.frequency.setTargetAtTime(frequencies[i], this.context!.currentTime, 0.8),
      );
  }
  refresh() {
    if (this.context && this.musicGain)
      this.musicGain.gain.setTargetAtTime(
        this.settings.muted ? 0 : this.settings.master * this.settings.music * 0.055,
        this.context.currentTime,
        0.15,
      );
  }
  play(
    kind:
      | 'step'
      | 'door'
      | 'pickup'
      | 'alert'
      | 'damage'
      | 'victory'
      | 'defeat'
      | 'click'
      | 'groan'
      | 'throw',
  ) {
    try {
      if (!this.context || this.settings.muted) return;
      const ctx = this.context,
        g = ctx.createGain(),
        o = ctx.createOscillator();
      const freq = {
        step: 90,
        door: 140,
        pickup: 760,
        alert: 590,
        damage: 70,
        victory: 520,
        defeat: 160,
        click: 460,
        groan: 42,
        throw: 210,
      }[kind];
      o.type = ['alert', 'damage', 'groan'].includes(kind) ? 'sawtooth' : 'sine';
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(
        Math.max(20, freq * (kind === 'victory' ? 2 : kind === 'pickup' ? 1.6 : 0.5)),
        ctx.currentTime + 0.18,
      );
      g.gain.setValueAtTime(
        this.settings.master * this.settings.sfx * (kind === 'step' ? 0.035 : 0.14),
        ctx.currentTime,
      );
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.23);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    } catch {
      /* Never block gameplay. */
    }
  }
}
