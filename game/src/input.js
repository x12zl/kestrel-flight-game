// Unified keyboard and smooth mouse-stick flight controls.
import { clamp } from './math3d.js';

export class FlightInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pendingToggles = {
      gear: false,
      flaps: false,
      camera: false,
      pause: false,
      restart: false,
      start: false,
      nextMission: false,
    };
    this.mouseActive = false;
    this.mouseStick = { x: 0, y: 0 };
    this.wheelDelta = 0;

    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        if (code === 'KeyG') this.pendingToggles.gear = true;
        if (code === 'KeyF') this.pendingToggles.flaps = true;
        if (code === 'KeyC') this.pendingToggles.camera = true;
        if (code === 'KeyP' || code === 'Escape') this.pendingToggles.pause = true;
        if (code === 'KeyR') this.pendingToggles.restart = true;
        if (code === 'Enter' || code === 'Space') this.pendingToggles.start = true;
        if (code === 'KeyM') this.mouseActive = !this.mouseActive;
        if (code === 'Tab') {
          e.preventDefault();
          this.pendingToggles.nextMission = true;
        }
      }
      this.keys.add(code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.pendingToggles.start = true;
      if (e.button === 0) {
        this.mouseActive = true;
        this.updatePointer(e);
      }
    });

    this.canvas.addEventListener('click', () => {
      this.pendingToggles.start = true;
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.mouseActive) return;
      this.updatePointer(e);
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheelDelta += -Math.sign(e.deltaY) * 0.08;
    }, { passive: false });
  }

  updatePointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    // Center deadzone of 8% so level flight is effortless
    const applyDeadzone = (val) => {
      if (Math.abs(val) < 0.08) return 0;
      return clamp((val - Math.sign(val) * 0.08) / 0.72, -1, 1);
    };
    this.mouseStick.x = applyDeadzone(nx);
    this.mouseStick.y = applyDeadzone(ny);
  }

  consume() {
    const k = this.keys;
    let pitch = 0;
    let roll = 0;
    let yaw = 0;
    let throttleDelta = 0;
    let throttlePreset = null;

    // Flight stick: W/ArrowUp noses down (classic stick forward) or S/ArrowDown pulls up
    if (k.has('KeyS') || k.has('ArrowDown')) pitch += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) pitch -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) roll += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) roll -= 1;
    if (k.has('KeyE')) yaw += 1;
    if (k.has('KeyQ')) yaw -= 1;

    if (this.mouseActive) {
      if (Math.abs(pitch) < 0.05) pitch = this.mouseStick.y;
      if (Math.abs(roll) < 0.05) roll = this.mouseStick.x;
    }

    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Equal')) throttleDelta += 1;
    if (k.has('ControlLeft') || k.has('ControlRight') || k.has('Minus')) throttleDelta -= 1;
    if (this.wheelDelta !== 0) {
      throttleDelta += this.wheelDelta * 12;
      this.wheelDelta = 0;
    }

    if (k.has('Digit1')) throttlePreset = 0.0;
    if (k.has('Digit2')) throttlePreset = 0.45;
    if (k.has('Digit3')) throttlePreset = 0.72;
    if (k.has('Digit4')) throttlePreset = 1.0;

    const toggles = { ...this.pendingToggles };
    this.pendingToggles.gear = false;
    this.pendingToggles.flaps = false;
    this.pendingToggles.camera = false;
    this.pendingToggles.pause = false;
    this.pendingToggles.restart = false;
    this.pendingToggles.start = false;
    this.pendingToggles.nextMission = false;

    return {
      pitch: clamp(pitch, -1, 1),
      roll: clamp(roll, -1, 1),
      yaw: clamp(yaw, -1, 1),
      throttleDelta,
      throttlePreset,
      brake: k.has('KeyB'),
      toggleGear: toggles.gear,
      toggleFlaps: toggles.flaps,
      cycleCamera: toggles.camera,
      togglePause: toggles.pause,
      restart: toggles.restart,
      start: toggles.start,
      nextMission: toggles.nextMission,
    };
  }
}
