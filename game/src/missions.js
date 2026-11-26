// Three original sorties plus Free Flight: ring slaloms, fuel relay, high-altitude intercept, and runway landings.
import { clamp, vLen, vSub } from './math3d.js';
import { RUNWAYS, sampleTerrainHeight } from './terrain.js';

export const MISSIONS = [
  {
    id: 'canyon-slalom',
    title: 'SORTIE 01 · CANYON SLALOM',
    subtitle: 'Thread 7 canyon gates, manage throttle, land at Kestrel Base RWY 36.',
    timeOfDay: 'golden',
    wind: { x: 2.5, y: 0, z: -1.5 },
    turbulence: 0.22,
    start: {
      pos: { x: 165, y: 245, z: 1680 },
      headingDeg: 350,
      pitchDeg: -2,
      rollDeg: -8,
      speed: 108,
      throttle: 0.72,
      fuel: 100,
      gearDown: false,
      flapsDown: false,
    },
    targetRunway: 'coastal',
    rings: [
      { x: 95, y: 210, z: 1050, radius: 36, yawDeg: 348 },
      { x: -240, y: 185, z: 380, radius: 34, yawDeg: 332 },
      { x: -510, y: 175, z: -260, radius: 34, yawDeg: 356 },
      { x: -340, y: 165, z: -920, radius: 34, yawDeg: 24 },
      { x: 140, y: 180, z: -1580, radius: 36, yawDeg: 355 },
      { x: 40, y: 145, z: -2180, radius: 38, yawDeg: 358 },
      { x: 0, y: 78, z: -2680, radius: 42, yawDeg: 0 }, // Final glideslope gate into RWY 36!
    ],
  },
  {
    id: 'archipelago-relay',
    title: 'SORTIE 02 · ATOLL FUEL RELAY',
    subtitle: 'Crosswind island run. Manage eco thrust or refuel at Atoll Strip.',
    timeOfDay: 'midday',
    wind: { x: -7.5, y: 0, z: 3.5 },
    turbulence: 0.45,
    start: {
      pos: { x: 420, y: 195, z: -2100 },
      headingDeg: 132,
      pitchDeg: 0,
      rollDeg: 4,
      speed: 102,
      throttle: 0.65,
      fuel: 64,
      gearDown: false,
      flapsDown: false,
    },
    targetRunway: 'atoll',
    rings: [
      { x: 980, y: 160, z: -1680, radius: 38, yawDeg: 130 },
      { x: 1620, y: 135, z: -1240, radius: 38, yawDeg: 135 },
      { x: 2240, y: 120, z: -920, radius: 38, yawDeg: 158 },
      { x: 2020, y: 140, z: -180, radius: 38, yawDeg: 205 },
      { x: 1750, y: 110, z: -450, radius: 42, yawDeg: 90 }, // Aligned on RWY 09 glideslope
    ],
  },
  {
    id: 'altitude-intercept',
    title: 'SORTIE 03 · CLOUD DECK INTERCEPT',
    subtitle: 'Climb into thin air above clouds, intercept gates, land low on fuel.',
    timeOfDay: 'sunset',
    wind: { x: 5.0, y: 0, z: -4.0 },
    turbulence: 0.58,
    start: {
      pos: { x: -620, y: 460, z: 650 },
      headingDeg: 12,
      pitchDeg: 8,
      rollDeg: 0,
      speed: 118,
      throttle: 0.88,
      fuel: 58,
      gearDown: false,
      flapsDown: false,
    },
    targetRunway: 'coastal',
    rings: [
      { x: -480, y: 690, z: -120, radius: 40, yawDeg: 14 },
      { x: -260, y: 920, z: -850, radius: 40, yawDeg: 18 },
      { x: 80, y: 1060, z: -1620, radius: 40, yawDeg: 350 },
      { x: -60, y: 620, z: -2220, radius: 40, yawDeg: 355 },
      { x: 0, y: 120, z: -2660, radius: 44, yawDeg: 0 },
    ],
  },
  {
    id: 'free-flight',
    title: 'FREE FLIGHT · ARCHIPELAGO PATROL',
    subtitle: 'Open-sky exploration over canyons, reefs, and both active airfields.',
    timeOfDay: 'midday',
    wind: { x: 2.0, y: 0, z: -1.0 },
    turbulence: 0.15,
    start: {
      pos: { x: -120, y: 310, z: -900 },
      headingDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      speed: 105,
      throttle: 0.68,
      fuel: 100,
      gearDown: false,
      flapsDown: false,
    },
    targetRunway: 'coastal',
    rings: [],
  },
];

export class MissionDirector {
  constructor() {
    this.missionIndex = 0;
    this.reset(0);
  }

  reset(index = this.missionIndex) {
    this.missionIndex = clamp(index, 0, MISSIONS.length - 1);
    const m = MISSIONS[this.missionIndex];
    this.mission = m;
    this.rings = m.rings.map((r, i) => ({
      ...r,
      index: i,
      cleared: false,
      missed: false,
    }));
    this.nextRingIndex = 0;
    this.score = 0;
    this.ringsCleared = 0;
    this.elapsed = 0;
    this.refueled = false;
    this.bannerText = m.title;
    this.bannerTimer = 4.2;
    this.phase = m.rings.length > 0 ? 'RINGS' : 'FREE';
  }

  getTargetRunway() {
    return RUNWAYS.find((r) => r.id === this.mission.targetRunway) ?? RUNWAYS[0];
  }

  getActiveWaypoint() {
    if (this.nextRingIndex < this.rings.length) {
      const ring = this.rings[this.nextRingIndex];
      return {
        label: `RING ${this.nextRingIndex + 1}/${this.rings.length}`,
        x: ring.x,
        y: ring.y,
        z: ring.z,
        isRunway: false,
      };
    }
    const rw = this.getTargetRunway();
    return {
      label: rw.name,
      x: rw.centerX,
      y: rw.elevation + 18,
      z: rw.centerZ,
      isRunway: true,
    };
  }

  update(dt, flight) {
    this.elapsed += dt;
    if (this.bannerTimer > 0) this.bannerTimer = Math.max(0, this.bannerTimer - dt);

    // Check active ring capture & pylon graze damage
    if (this.nextRingIndex < this.rings.length) {
      const ring = this.rings[this.nextRingIndex];
      const delta = vSub(flight.pos, ring);
      const dist = vLen(delta);
      const horizDist = Math.hypot(delta.x, delta.z);
      const vertDist = Math.abs(delta.y);

      if (dist <= ring.radius + 3.5) {
        ring.cleared = true;
        this.ringsCleared += 1;
        this.nextRingIndex += 1;
        const speedBonus = Math.round(flight.iasKnots * 1.4);
        const centerBonus = Math.round(Math.max(0, ring.radius - dist) * 6);
        const gained = 250 + speedBonus + centerBonus;
        this.score += gained;
        this.bannerText = this.nextRingIndex < this.rings.length
          ? `GATE CLEARED +${gained} · NEXT RING ${this.nextRingIndex + 1}/${this.rings.length}`
          : `ALL GATES CLEARED · LOWER GEAR [G] & FLAPS [F] FOR LANDING`;
        this.bannerTimer = 3.5;
        if (this.nextRingIndex >= this.rings.length) {
          this.phase = 'APPROACH';
        }
        return { event: 'ring_cleared', gained };
      }

      // Graze check near ring rim
      if (horizDist < ring.radius + 6 && vertDist < ring.radius + 6 && dist > ring.radius - 2 && dist < ring.radius + 4) {
        // Handled smoothly without harsh instant death
      }
    }

    // Touch-and-go refuel bonus at Atoll Strip during Sortie 2 or Free Flight
    if (!this.refueled && flight.onGround && flight.landedRunway === null) {
      const match = flight.getActiveRunwayMatch();
      if (match && match.runway.hasRefuel && flight.fuel < 85) {
        this.refueled = true;
        flight.fuel = Math.min(100, flight.fuel + 35);
        this.bannerText = `FIELD REFUEL +35% AT ${match.runway.name}`;
        this.bannerTimer = 3.0;
        return { event: 'refuel' };
      }
    }

    // Terrain proximity bonus during safe low-level flight
    const terrainY = sampleTerrainHeight(flight.pos.x, flight.pos.z);
    if (!flight.onGround && flight.pos.y - terrainY < 85 && flight.iasKnots > 135) {
      this.score += dt * 12;
    }

    if (flight.landed) {
      const rw = flight.landedRunway;
      const targetMatch = rw && rw.id === this.mission.targetRunway;
      const landingBonus = flight.touchdownFpm <= 260 ? 600 : 380;
      const fuelBonus = Math.round(flight.fuel * 4);
      const hullBonus = Math.round(flight.hull * 3);
      const runwayBonus = targetMatch ? 300 : 120;
      if (this.phase !== 'COMPLETE') {
        this.score += landingBonus + fuelBonus + hullBonus + runwayBonus;
        this.phase = 'COMPLETE';
      }
      return { event: 'landed' };
    }

    if (flight.crashed) {
      this.phase = 'CRASHED';
      return { event: 'crashed' };
    }

    return null;
  }
}
