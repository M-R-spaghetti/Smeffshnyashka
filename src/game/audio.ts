// Procedural Web Audio API synthesizer for tactile Soviet urbex & workshop SFX

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(m: boolean) {
    this.muted = m;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private jitter(base: number, pct = 0.08): number {
    return base * (1 + (Math.random() * 2 - 1) * pct);
  }

  playClick() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(this.jitter(640), now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.045);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  playFlashlightToggle(on: boolean) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(on ? 980 : 620, now);
    osc.frequency.exponentialRampToValueAtTime(on ? 1480 : 310, now + 0.03);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playFootstep(onGlass = false) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = Math.floor(ctx.sampleRate * (onGlass ? 0.09 : 0.045));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = onGlass ? 'highpass' : 'lowpass';
    filter.frequency.setValueAtTime(this.jitter(onGlass ? 2600 : 320), now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(onGlass ? 0.14 : 0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (onGlass ? 0.09 : 0.045));

    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(now);
  }

  playLockTick() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.jitter(1420), now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.035);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  playDoorOpen() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.16);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playAlertPulse() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.linearRampToValueAtTime(760, now + 0.12);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playBustedSiren() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.24].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(620, now + offset);
      osc.frequency.linearRampToValueAtTime(340, now + offset + 0.22);
      gain.gain.setValueAtTime(0.11, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.23);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.24);
    });
  }

  playScrewRatchet() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(this.jitter(340 + i * 70), now + i * 0.032);
      gain.gain.setValueAtTime(0.055, now + i * 0.032);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.032 + 0.025);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.032);
      osc.stop(now + i * 0.032 + 0.028);
    }
  }

  playSnip(precious: boolean, combo = 1) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Metallic wire snap
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = precious ? 'triangle' : 'sawtooth';
    const baseFreq = precious ? Math.min(1800, 880 + combo * 65) : 190;
    osc.frequency.setValueAtTime(this.jitter(baseFreq), now);
    osc.frequency.exponentialRampToValueAtTime(precious ? baseFreq * 1.45 : 110, now + 0.08);
    gain.gain.setValueAtTime(precious ? 0.1 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    if (precious) {
      // Subtle golden chime overtone
      const chime = ctx.createOscillator();
      const cGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(baseFreq * 2, now + 0.02);
      cGain.gain.setValueAtTime(0.05, now + 0.02);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      chime.connect(cGain).connect(ctx.destination);
      chime.start(now + 0.02);
      chime.stop(now + 0.17);
    }
  }

  playBeerGulp() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Cap pop
    const pop = ctx.createOscillator();
    const pGain = ctx.createGain();
    pop.type = 'sine';
    pop.frequency.setValueAtTime(280, now);
    pop.frequency.exponentialRampToValueAtTime(920, now + 0.05);
    pGain.gain.setValueAtTime(0.11, now);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    pop.connect(pGain).connect(ctx.destination);
    pop.start(now);
    pop.stop(now + 0.07);

    // Gulp notes
    [0.1, 0.22].forEach((offset) => {
      const g = ctx.createOscillator();
      const gg = ctx.createGain();
      g.type = 'sine';
      g.frequency.setValueAtTime(210, now + offset);
      g.frequency.exponentialRampToValueAtTime(340, now + offset + 0.08);
      gg.gain.setValueAtTime(0.08, now + offset);
      gg.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.09);
      g.connect(gg).connect(ctx.destination);
      g.start(now + offset);
      g.stop(now + offset + 0.1);
    });
  }

  playCashPayout() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.075);
      gain.gain.setValueAtTime(0.09, now + idx * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.075 + 0.24);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.075);
      osc.stop(now + idx * 0.075 + 0.25);
    });
  }
}

export const soundEngine = new SoundEngine();
