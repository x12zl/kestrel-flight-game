// Procedural Web Audio engine: jet turbine, afterburner roar, wind rush, warnings, and SFX.
import { clamp } from './math3d.js';

export class FlightAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.afterburnerGain = null;
    this.lastBeepAt = 0;
  }

  unlock() {
    if (this.ready || this.muted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      const now = this.ctx.currentTime;

      // Turbine core oscillator
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(75, now);

      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.setValueAtTime(340, now);

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.0, now);

      this.engineOsc.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();

      // White noise buffer for aerodynamic wind & afterburner roar
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;

      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.setValueAtTime(600, now);
      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0.0, now);
      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);
      windSrc.start();

      const abSrc = this.ctx.createBufferSource();
      abSrc.buffer = buf;
      abSrc.loop = true;
      const abFilter = this.ctx.createBiquadFilter();
      abFilter.type = 'lowpass';
      abFilter.frequency.setValueAtTime(220, now);
      this.afterburnerGain = this.ctx.createGain();
      this.afterburnerGain.gain.setValueAtTime(0.0, now);
      abSrc.connect(abFilter);
      abFilter.connect(this.afterburnerGain);
      this.afterburnerGain.connect(this.ctx.destination);
      abSrc.start();

      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  update(flight, paused) {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (paused || flight.crashed || flight.landed) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      this.windGain.gain.setTargetAtTime(0, now, 0.08);
      this.afterburnerGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    const rpm = clamp(flight.rpm, 0, 1);
    const speedRatio = clamp(flight.iasKnots / 300, 0, 1.2);
    this.engineOsc.frequency.setTargetAtTime(58 + rpm * 135, now, 0.06);
    this.engineGain.gain.setTargetAtTime(0.025 + rpm * 0.055, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(320 + speedRatio * 1400, now, 0.08);
    this.windGain.gain.setTargetAtTime(0.015 + speedRatio * 0.06, now, 0.08);
    const abLevel = rpm > 0.85 ? (rpm - 0.85) * 0.65 : 0;
    this.afterburnerGain.gain.setTargetAtTime(abLevel, now, 0.08);

    // Warning chime for stall or low terrain
    if ((flight.stalling || flight.terrainAlert) && now - this.lastBeepAt > 0.55) {
      this.lastBeepAt = now;
      this.playTone(flight.terrainAlert ? 920 : 640, 0.14, 'square', 0.05);
    }
  }

  playTone(freq, duration, type = 'sine', volume = 0.08) {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playRingCleared() {
    this.playTone(660, 0.12, 'triangle', 0.09);
    setTimeout(() => this.playTone(990, 0.18, 'triangle', 0.08), 80);
  }

  playTouchdown() {
    this.playTone(140, 0.22, 'sawtooth', 0.09);
  }

  playCrash() {
    this.playTone(75, 0.45, 'sawtooth', 0.14);
  }
}
