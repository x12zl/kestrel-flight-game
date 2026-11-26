// Aerodynamic flight physics, fuel/damage model, and runway touchdown evaluation.
import {
  clamp,
  DEG2RAD,
  eulerFromQuat,
  lerp,
  quatBasis,
  quatFromAxisAngle,
  quatIdentity,
  quatMul,
  quatNorm,
  RAD2DEG,
  vAdd,
  vDot,
  vLen,
  vNorm,
  vScale,
} from './math3d.js';
import { RUNWAYS, sampleTerrainHeight, sampleTerrainNormal, SEA_LEVEL } from './terrain.js';

export const GRAVITY = 9.81;
export const METERS_TO_FEET = 3.28084;
export const MPS_TO_KNOTS = 1.94384;
export const MPS_TO_FPM = 196.8504;

export class FlightModel {
  constructor() {
    this.reset({});
  }

  reset(opts = {}) {
    const startPos = opts.pos ?? { x: 0, y: 360, z: -1600 };
    const headingDeg = opts.headingDeg ?? 0;
    const pitchDeg = opts.pitchDeg ?? 0;
    const rollDeg = opts.rollDeg ?? 0;

    let q = quatIdentity();
    q = quatMul(q, quatFromAxisAngle({ x: 0, y: 1, z: 0 }, -headingDeg * DEG2RAD));
    q = quatMul(q, quatFromAxisAngle({ x: 1, y: 0, z: 0 }, pitchDeg * DEG2RAD));
    q = quatMul(q, quatFromAxisAngle({ x: 0, y: 0, z: -1 }, rollDeg * DEG2RAD));
    this.quat = quatNorm(q);

    this.pos = { ...startPos };
    const { forward } = quatBasis(this.quat);
    const speed = opts.speed ?? 95; // m/s (~185 kt)
    this.vel = vScale(forward, speed);

    this.throttle = opts.throttle ?? 0.68;
    this.rpm = this.throttle;
    this.fuel = opts.fuel ?? 100; // percentage 0..100
    this.hull = opts.hull ?? 100; // percentage 0..100
    this.gearDown = Boolean(opts.gearDown ?? false);
    this.flapsDown = Boolean(opts.flapsDown ?? false);
    this.airbrake = false;

    this.angVel = { pitch: 0, yaw: 0, roll: 0 };
    this.stick = { pitch: 0, roll: 0, yaw: 0 };
    this.aoaDeg = 0;
    this.gLoad = 1;
    const airDensity = Math.exp(-Math.max(0, this.pos.y) / 8800);
    this.iasKnots = speed * Math.sqrt(airDensity) * MPS_TO_KNOTS;
    this.altFeet = this.pos.y * METERS_TO_FEET;
    const groundY = Math.max(SEA_LEVEL, sampleTerrainHeight(this.pos.x, this.pos.z));
    const clearance = this.gearDown ? 1.55 : 0.9;
    this.aglFeet = Math.max(0, (this.pos.y - groundY - clearance) * METERS_TO_FEET);
    this.vsiFpm = this.vel.y * MPS_TO_FPM;
    this.headingDeg = headingDeg;
    this.pitchDeg = pitchDeg;
    this.rollDeg = rollDeg;

    this.stalling = false;
    this.lowFuel = false;
    this.terrainAlert = false;
    this.onGround = false;
    this.crashed = false;
    this.landed = false;
    this.landedRunway = null;
    this.outcomeReason = '';
    this.touchdownFpm = 0;
    this.lastImpactCooldown = 0;
    this.time = 0;
  }

  getActiveRunwayMatch() {
    for (const rw of RUNWAYS) {
      const rad = rw.headingDeg * DEG2RAD;
      const sin = Math.sin(rad);
      const cos = Math.cos(rad);
      const dx = this.pos.x - rw.centerX;
      const dz = this.pos.z - rw.centerZ;
      const along = dx * sin - dz * cos;
      const across = dx * cos + dz * sin;
      if (Math.abs(along) <= rw.length * 0.54 && Math.abs(across) <= rw.width * 0.6) {
        return { runway: rw, along, across };
      }
    }
    return null;
  }

  step(dt, controls, wind = { x: 0, y: 0, z: 0 }, turbulence = 0) {
    if (this.crashed || this.landed) return;
    const hDt = clamp(dt, 0.001, 0.05);
    this.time += hDt;
    if (this.lastImpactCooldown > 0) this.lastImpactCooldown = Math.max(0, this.lastImpactCooldown - hDt);

    // Toggleable gear / flaps / brake
    if (controls.toggleGear) this.gearDown = !this.gearDown;
    if (controls.toggleFlaps) this.flapsDown = !this.flapsDown;
    this.airbrake = Boolean(controls.brake);

    this.throttle = clamp(this.throttle + controls.throttleDelta * hDt * 0.55, 0, 1);
    if (controls.throttlePreset !== null) this.throttle = clamp(controls.throttlePreset, 0, 1);
    this.rpm = lerp(this.rpm, this.fuel > 0 ? this.throttle : 0, clamp(hDt * 2.4, 0, 1));

    // Fuel burn: idle 0.08%/s, cruise (65%) ~0.32%/s, afterburner (>85%) ~1.15%/s
    if (this.fuel > 0) {
      const abFactor = this.rpm > 0.85 ? 1 + (this.rpm - 0.85) * 14 : 1;
      const burnRate = (0.08 + 0.52 * this.rpm * this.rpm) * abFactor;
      this.fuel = Math.max(0, this.fuel - burnRate * hDt);
    }
    this.lowFuel = this.fuel < 18;

    const { forward, right, up } = quatBasis(this.quat);

    // Airspeed relative to wind
    const relVel = {
      x: this.vel.x - wind.x,
      y: this.vel.y - wind.y,
      z: this.vel.z - wind.z,
    };
    const speed = vLen(relVel);
    const velDir = speed > 1 ? vScale(relVel, 1 / speed) : forward;
    const airDensity = Math.exp(-Math.max(0, this.pos.y) / 8800);

    // Control effectiveness scales cleanly with dynamic pressure, keeping slow-speed authority
    const qDyn = clamp((speed * speed * airDensity) / (72 * 72), 0.25, 1.35);
    const pitchCmd = clamp(controls.pitch, -1, 1);
    const rollCmd = clamp(controls.roll, -1, 1);
    const yawCmd = clamp(controls.yaw, -1, 1);

    this.stick.pitch = lerp(this.stick.pitch, pitchCmd, clamp(hDt * 12, 0, 1));
    this.stick.roll = lerp(this.stick.roll, rollCmd, clamp(hDt * 12, 0, 1));
    this.stick.yaw = lerp(this.stick.yaw, yawCmd, clamp(hDt * 10, 0, 1));

    // Angle of attack in aircraft pitch plane
    const forwardSpeed = Math.max(0.1, vDot(relVel, forward));
    const upSpeed = vDot(relVel, up);
    const sideSpeed = vDot(relVel, right);
    const aoaRad = Math.atan2(-upSpeed, forwardSpeed);
    this.aoaDeg = aoaRad * RAD2DEG;

    const stallAoA = this.flapsDown ? 20 : 16;
    const stallSpeedMps = this.flapsDown ? 35 : 44;
    this.stalling = !this.onGround && (speed < stallSpeedMps || Math.abs(this.aoaDeg) > stallAoA) && speed > 5;

    // Gentle aerodynamic weathercock stability & coordinated turn yaw
    const targetPitchRate = this.stick.pitch * 1.48 * Math.min(1.15, 0.45 + qDyn * 0.75) - (this.stalling ? 0.36 : 0);
    const targetRollRate = this.stick.roll * 2.45 * Math.min(1.2, 0.48 + qDyn * 0.75);
    const bankTurnYaw = clamp(right.y, -0.8, 0.8) * 0.42;
    const targetYawRate = this.stick.yaw * 0.72 + bankTurnYaw - clamp(sideSpeed / Math.max(25, speed), -0.6, 0.6) * 0.9;

    const turbPitch = turbulence * Math.sin(this.time * 5.7) * 0.14;
    const turbRoll = turbulence * Math.cos(this.time * 4.3) * 0.22;

    this.angVel.pitch = lerp(this.angVel.pitch, targetPitchRate + turbPitch, clamp(hDt * 7.5, 0, 1));
    this.angVel.roll = lerp(this.angVel.roll, targetRollRate + turbRoll, clamp(hDt * 8.5, 0, 1));
    this.angVel.yaw = lerp(this.angVel.yaw, targetYawRate, clamp(hDt * 6.0, 0, 1));

    // Apply incremental rotation in body frame
    const dPitch = quatFromAxisAngle(right, this.angVel.pitch * hDt);
    const dRoll = quatFromAxisAngle(forward, -this.angVel.roll * hDt);
    const dYaw = quatFromAxisAngle(up, -this.angVel.yaw * hDt);
    this.quat = quatNorm(quatMul(dYaw, quatMul(dPitch, quatMul(dRoll, this.quat))));

    const basisAfter = quatBasis(this.quat);

    // Aerodynamic forces
    const maxThrustAccel = 26.5; // m/s^2 at full afterburner
    const abBoost = this.rpm > 0.85 ? 1 + (this.rpm - 0.85) * 2.2 : 1;
    const thrustMag = this.fuel > 0 ? this.rpm * maxThrustAccel * abBoost * (0.45 + 0.55 * airDensity) : 0;
    const thrustForce = vScale(basisAfter.forward, thrustMag);

    // Lift coefficient peaks near 15 deg, softens smoothly past stall
    const flapLift = this.flapsDown ? 0.42 : 0;
    const clRaw = (aoaRad * 4.2 + 0.16 + flapLift) * (this.stalling ? 0.52 : 1.0);
    const cl = clamp(clRaw, -1.1, 1.85);
    const wingAreaFactor = 0.0041;
    const liftMag = speed * speed * airDensity * wingAreaFactor * cl;
    const liftDir = vNorm(basisAfter.up);
    const liftForce = vScale(liftDir, liftMag);

    // Parasitic + induced + gear/flap/airbrake drag
    const cd0 = 0.018 + (this.gearDown ? 0.016 : 0) + (this.flapsDown ? 0.022 : 0) + (this.airbrake ? 0.055 : 0);
    const cd = cd0 + cl * cl * 0.048;
    const dragMag = speed * speed * airDensity * wingAreaFactor * cd;
    const dragForce = vScale(velDir, -dragMag);

    // Side-force damping (keeps flight feeling crisp without sloppy drift)
    const sideAfter = vDot(this.vel, basisAfter.right);
    const sideForce = vScale(basisAfter.right, -sideAfter * 1.45);

    const totalAccel = {
      x: thrustForce.x + liftForce.x + dragForce.x + sideForce.x,
      y: thrustForce.y + liftForce.y + dragForce.y + sideForce.y - GRAVITY,
      z: thrustForce.z + liftForce.z + dragForce.z + sideForce.z,
    };

    this.vel = vAdd(this.vel, vScale(totalAccel, hDt));
    // Cap top velocity cleanly around Mach 0.72 sea level (~245 m/s)
    const newSpeed = vLen(this.vel);
    if (newSpeed > 250) {
      this.vel = vScale(this.vel, 250 / newSpeed);
    }

    this.pos = vAdd(this.pos, vScale(this.vel, hDt));

    // Telemetry updates
    this.gLoad = clamp((liftMag / GRAVITY) + 0.05 * (basisAfter.up.y - 1), -3.5, 9.5);
    this.iasKnots = vLen(this.vel) * Math.sqrt(airDensity) * MPS_TO_KNOTS;
    this.altFeet = this.pos.y * METERS_TO_FEET;
    this.vsiFpm = this.vel.y * MPS_TO_FPM;

    const eul = eulerFromQuat(this.quat);
    this.headingDeg = ((eul.heading * RAD2DEG) % 360 + 360) % 360;
    this.pitchDeg = eul.pitch * RAD2DEG;
    this.rollDeg = eul.roll * RAD2DEG;

    // Ground / Runway / Ocean contact handling
    const groundY = Math.max(SEA_LEVEL, sampleTerrainHeight(this.pos.x, this.pos.z));
    const clearance = this.gearDown ? 1.55 : 0.9;
    this.aglFeet = Math.max(0, (this.pos.y - groundY - clearance) * METERS_TO_FEET);
    this.terrainAlert = !this.onGround && this.aglFeet < 180 && this.vsiFpm < -650 && !this.gearDown;

    const rwMatch = this.getActiveRunwayMatch();
    if (this.pos.y - clearance <= groundY) {
      this.resolveSurfaceContact(groundY, clearance, rwMatch, hDt);
    } else {
      this.onGround = false;
    }
  }

  resolveSurfaceContact(groundY, clearance, rwMatch, dt) {
    const isWater = sampleTerrainHeight(this.pos.x, this.pos.z) <= SEA_LEVEL + 0.25 && !rwMatch;
    const sinkFpm = -this.vel.y * MPS_TO_FPM;
    const speedKt = vLen(this.vel) * MPS_TO_KNOTS;

    if (isWater) {
      this.hull = 0;
      this.crashed = true;
      this.vel = { x: 0, y: 0, z: 0 };
      this.pos.y = SEA_LEVEL + 0.5;
      this.outcomeReason = `WATER IMPACT AT ${Math.round(speedKt)} KT (${Math.round(sinkFpm)} FPM SINK)`;
      return;
    }

    if (rwMatch) {
      const rw = rwMatch.runway;
      const upright = Math.abs(this.rollDeg) < 22 && this.pitchDeg > -14 && this.pitchDeg < 26;
      if (!this.gearDown) {
        this.hull = 0;
        this.crashed = true;
        this.pos.y = rw.elevation + 0.9;
        this.outcomeReason = `GEAR-UP BELLY IMPACT ON ${rw.name} AT ${Math.round(speedKt)} KT`;
        return;
      }
      if (!upright || sinkFpm > 1150) {
        this.hull = 0;
        this.crashed = true;
        this.pos.y = rw.elevation + clearance;
        this.outcomeReason = sinkFpm > 1150
          ? `HARD LANDING COLLAPSE ON ${rw.name} (${Math.round(sinkFpm)} FPM)`
          : `WINGTIP / NOSE STRIKE ON ${rw.name} (BANK ${Math.round(this.rollDeg)} DEG)`;
        return;
      }

      // Valid runway touchdown / rollout!
      this.pos.y = rw.elevation + clearance;
      if (this.vel.y < 0) this.vel.y = 0;
      if (!this.onGround) {
        this.touchdownFpm = Math.round(sinkFpm);
        if (sinkFpm > 580) {
          this.hull = Math.max(10, this.hull - Math.round((sinkFpm - 550) * 0.04));
        }
      }
      this.onGround = true;

      // Ground friction & braking on rollout
      const brakeDrag = (this.airbrake || this.throttle < 0.15) ? 14.5 : 3.2;
      const groundSpeed = Math.hypot(this.vel.x, this.vel.z);
      if (groundSpeed > 0.2) {
        const nextSpeed = Math.max(0, groundSpeed - brakeDrag * dt);
        const factor = nextSpeed / groundSpeed;
        this.vel.x *= factor;
        this.vel.z *= factor;
      }
      // Level wings onto runway
      this.angVel.roll *= 0.7;
      if (this.throttle < 0.25 && Math.hypot(this.vel.x, this.vel.z) < 18) {
        this.landed = true;
        this.landedRunway = rw;
        this.outcomeReason = this.touchdownFpm <= 260
          ? `GREASED TOUCHDOWN ON ${rw.name} (${this.touchdownFpm} FPM)`
          : `SAFE LANDING ON ${rw.name} (${this.touchdownFpm} FPM)`;
      }
      return;
    }

    // Off-runway terrain impact
    const normal = sampleTerrainNormal(this.pos.x, this.pos.z);
    if (sinkFpm > 500 || speedKt > 85 || !this.gearDown) {
      this.hull = 0;
      this.crashed = true;
      this.pos.y = groundY + clearance;
      this.vel = { x: 0, y: 0, z: 0 };
      this.outcomeReason = `TERRAIN COLLISION AT ${Math.round(speedKt)} KT (${Math.round(sinkFpm)} FPM SINK)`;
    } else if (this.lastImpactCooldown <= 0) {
      this.hull = Math.max(0, this.hull - 28);
      this.lastImpactCooldown = 0.6;
      this.pos.y = groundY + clearance + 1.2;
      const bounce = vDot(this.vel, normal);
      if (bounce < 0) {
        this.vel = vAdd(this.vel, vScale(normal, -1.5 * bounce));
      }
      if (this.hull <= 0) {
        this.crashed = true;
        this.outcomeReason = 'AIRFRAME LOST IN ROUGH TERRAIN';
      }
    }
  }
}
