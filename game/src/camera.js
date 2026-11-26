// Spring-damped chase camera, cockpit view, and cinematic orbit view that never fight the pilot.
import { clamp, lerp, quatBasis, vAdd, vLerp, vNorm, vScale, vSub } from './math3d.js';
import { sampleTerrainHeight, SEA_LEVEL } from './terrain.js';

export const CAMERA_MODES = ['chase', 'cockpit', 'orbit'];

export class FlightCamera {
  constructor() {
    this.modeIndex = 0;
    this.pos = { x: 0, y: 365, z: -1580 };
    this.target = { x: 0, y: 360, z: -1620 };
    this.up = { x: 0, y: 1, z: 0 };
    this.fovDeg = 62;
    this.orbitAngle = 0.55;
    this.shake = 0;
  }

  get mode() {
    return CAMERA_MODES[this.modeIndex];
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    return this.mode;
  }

  setMode(name) {
    const idx = CAMERA_MODES.indexOf(name);
    if (idx !== -1) this.modeIndex = idx;
  }

  snapTo(flight) {
    const { forward, up } = quatBasis(flight.quat);
    if (this.mode === 'cockpit') {
      this.pos = vAdd(flight.pos, vAdd(vScale(forward, 2.2), vScale(up, 0.88)));
      this.target = vAdd(this.pos, vScale(forward, 120));
      this.up = up;
      return;
    }
    this.pos = vAdd(flight.pos, vAdd(vScale(forward, -21), vScale(up, 5.2)));
    this.target = vAdd(flight.pos, vScale(forward, 18));
    this.up = { x: 0, y: 1, z: 0 };
  }

  update(dt, flight) {
    const hDt = clamp(dt, 0.001, 0.05);
    const { forward, up, right } = quatBasis(flight.quat);
    const speedRatio = clamp(flight.iasKnots / 260, 0, 1.3);

    // Subtle cockpit buffet when stalling or on afterburner
    const targetShake = flight.stalling ? 0.35 : flight.rpm > 0.88 ? 0.12 : 0;
    this.shake = lerp(this.shake, targetShake, clamp(hDt * 8, 0, 1));
    const jitter = this.shake > 0.01
      ? vScale(right, Math.sin(flight.time * 47) * this.shake * 0.25)
      : { x: 0, y: 0, z: 0 };

    if (this.mode === 'cockpit') {
      this.pos = vAdd(flight.pos, vAdd(vScale(forward, 2.2), vScale(up, 0.88)));
      this.pos = vAdd(this.pos, jitter);
      this.target = vAdd(this.pos, vScale(forward, 140));
      this.up = vNorm(vLerp(this.up, up, clamp(hDt * 18, 0, 1)));
      this.fovDeg = lerp(this.fovDeg, 68 + speedRatio * 7, clamp(hDt * 5, 0, 1));
      return;
    }

    if (this.mode === 'orbit' || flight.crashed || flight.landed) {
      this.orbitAngle += hDt * 0.32;
      const dist = flight.crashed ? 28 : 23;
      const desired = {
        x: flight.pos.x + Math.sin(this.orbitAngle) * dist,
        y: flight.pos.y + 7.5,
        z: flight.pos.z + Math.cos(this.orbitAngle) * dist,
      };
      const floorY = Math.max(SEA_LEVEL, sampleTerrainHeight(desired.x, desired.z)) + 3.5;
      desired.y = Math.max(desired.y, floorY);
      this.pos = vLerp(this.pos, desired, clamp(hDt * 4.5, 0, 1));
      this.target = vLerp(this.target, flight.pos, clamp(hDt * 8, 0, 1));
      this.up = vLerp(this.up, { x: 0, y: 1, z: 0 }, clamp(hDt * 6, 0, 1));
      this.fovDeg = lerp(this.fovDeg, 56, clamp(hDt * 4, 0, 1));
      return;
    }

    // Chase view: velocity-blended trailing vector keeps horizon readable during rolls
    const velSpeed = Math.hypot(flight.vel.x, flight.vel.y, flight.vel.z);
    const velDir = velSpeed > 10 ? vScale(flight.vel, 1 / velSpeed) : forward;
    const chaseForward = vNorm(vLerp(forward, velDir, 0.45));

    const worldUp = { x: 0, y: 1, z: 0 };
    const blendedUp = vNorm(vLerp(worldUp, up, 0.38));

    const trailDist = 20.5 + speedRatio * 4.0;
    const liftHeight = 4.9 + clamp(flight.angVel.pitch * -1.2, -1.5, 2.2);
    let desiredPos = vSub(flight.pos, vScale(chaseForward, trailDist));
    desiredPos = vAdd(desiredPos, vScale(blendedUp, liftHeight));

    const minFloor = Math.max(SEA_LEVEL, sampleTerrainHeight(desiredPos.x, desiredPos.z)) + 2.8;
    if (desiredPos.y < minFloor) desiredPos.y = minFloor;

    const desiredTarget = vAdd(flight.pos, vScale(chaseForward, 18));
    this.pos = vLerp(this.pos, vAdd(desiredPos, jitter), clamp(hDt * 9.5, 0, 1));
    this.target = vLerp(this.target, desiredTarget, clamp(hDt * 14, 0, 1));
    this.up = vNorm(vLerp(this.up, blendedUp, clamp(hDt * 6.5, 0, 1)));
    this.fovDeg = lerp(this.fovDeg, 60 + speedRatio * 12, clamp(hDt * 5, 0, 1));
  }
}
