// Main game loop, state machine, and deterministic ?shot= staging for browser capture.
import { FlightModel } from './flight-physics.js';
import { MissionDirector, MISSIONS } from './missions.js';
import { FlightCamera } from './camera.js';
import { FlightInput } from './input.js';
import { FlightAudio } from './audio.js';
import { FlightRenderer } from './renderer.js';
import { FlightHud } from './hud.js';
import { clamp } from './math3d.js';

const sceneCanvas = document.getElementById('scene');
const hudCanvas = document.getElementById('hud');
const statusEl = document.getElementById('status');

const renderer = new FlightRenderer(sceneCanvas);
const hud = new FlightHud(hudCanvas);
const flight = new FlightModel();
const missionDirector = new MissionDirector();
const camera = new FlightCamera();
const input = new FlightInput(hudCanvas);
const audio = new FlightAudio();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

let uiMode = 'title';
let selectedMissionIndex = 0;

function launchSortie(index, startPlaying = true) {
  selectedMissionIndex = ((index % MISSIONS.length) + MISSIONS.length) % MISSIONS.length;
  missionDirector.reset(selectedMissionIndex);
  flight.reset(missionDirector.mission.start);
  renderer.resetTrail();
  camera.snapTo(flight);
  uiMode = startPlaying ? 'playing' : 'title';
  statusEl.textContent = `${missionDirector.mission.title} started.`;
}

function stageDeterministicShot(name) {
  if (name === 'cockpit') {
    // Cockpit view aligned straight onto Kestrel Base runway approach with final ring & PAPI lights ahead
    launchSortie(0, true);
    flight.reset({
      pos: { x: 16, y: 165, z: -2260 },
      headingDeg: 1.2,
      pitchDeg: -4.2,
      rollDeg: -2.5,
      speed: 88,
      throttle: 0.44,
      fuel: 74,
      gearDown: true,
      flapsDown: true,
    });
    missionDirector.nextRingIndex = 6;
    missionDirector.ringsCleared = 6;
    missionDirector.score = 2640;
    missionDirector.bannerTimer = 0;
    camera.setMode('cockpit');
    camera.snapTo(flight);
    for (let i = 0; i < 6; i += 1) {
      flight.step(1 / 60, { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, throttlePreset: null, brake: false }, missionDirector.mission.wind, 0);
      camera.update(1 / 60, flight);
    }
  } else if (name === 'canyon') {
    // Sunset high-altitude climb toward glowing Gate 1 & cloud deck
    launchSortie(2, true);
    flight.reset({
      pos: { x: -535, y: 615, z: 160 },
      headingDeg: 13,
      pitchDeg: 9.5,
      rollDeg: 18,
      speed: 158,
      throttle: 0.96,
      fuel: 48,
      gearDown: false,
      flapsDown: false,
    });
    missionDirector.nextRingIndex = 0;
    missionDirector.ringsCleared = 0;
    missionDirector.score = 1120;
    missionDirector.bannerText = 'INTERCEPT VECTOR · CLIMB TO GATE 1';
    missionDirector.bannerTimer = 2.0;
    camera.setMode('chase');
    camera.snapTo(flight);
    for (let i = 0; i < 20; i += 1) {
      flight.step(1 / 60, { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, throttlePreset: null, brake: false }, missionDirector.mission.wind, 0);
      renderer.recordTrail(flight);
      camera.update(1 / 60, flight);
    }
  } else if (name === 'title') {
    launchSortie(1, false);
    camera.setMode('chase');
    for (let i = 0; i < 45; i += 1) {
      flight.step(1 / 60, { pitch: 0, roll: 0.08, yaw: 0, throttleDelta: 0, throttlePreset: null, brake: false }, missionDirector.mission.wind, 0);
      renderer.recordTrail(flight);
      camera.update(1 / 60, flight);
    }
  } else {
    // Cover shot ('chase'): sunlit canyon exit over coastal bay, aircraft banked toward glowing gate & runway ahead
    launchSortie(0, true);
    flight.reset({
      pos: { x: 64, y: 186, z: -1880 },
      headingDeg: 356,
      pitchDeg: -3.5,
      rollDeg: -16,
      speed: 122,
      throttle: 0.88,
      fuel: 82,
      gearDown: false,
      flapsDown: false,
    });
    missionDirector.nextRingIndex = 5;
    missionDirector.ringsCleared = 5;
    missionDirector.score = 2190;
    missionDirector.bannerTimer = 0;
    camera.setMode('chase');
    camera.snapTo(flight);
    for (let i = 0; i < 32; i += 1) {
      flight.step(1 / 60, { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, throttlePreset: null, brake: false }, missionDirector.mission.wind, 0);
      renderer.recordTrail(flight);
      camera.update(1 / 60, flight);
    }
  }
}

function resizeAll() {
  const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  renderer.resize(window.innerWidth, window.innerHeight, dpr);
  hud.resize(window.innerWidth, window.innerHeight, dpr);
}
window.addEventListener('resize', resizeAll);
resizeAll();

let shotRendered = false;
if (shotName) {
  stageDeterministicShot(shotName);
  const drawShot = () => {
    renderer.render(flight, camera, missionDirector, missionDirector.mission.timeOfDay);
    hud.render({
      flight,
      missionState: missionDirector,
      cameraMode: camera.mode,
      uiMode,
      selectedMissionIndex,
      missions: MISSIONS,
      mouseActive: false,
    });
    shotRendered = true;
  };
  drawShot();
  requestAnimationFrame(drawShot);
} else {
  launchSortie(0, false);
}

// Expose state hook for deterministic playtesting
window.__kestrel = {
  getState: () => ({
    ready: shotName ? shotRendered : true,
    uiMode,
    mission: missionDirector.mission.id,
    pos: { ...flight.pos },
    iasKnots: flight.iasKnots,
    altFeet: flight.altFeet,
    headingDeg: flight.headingDeg,
    fuel: flight.fuel,
    hull: flight.hull,
    gearDown: flight.gearDown,
    flapsDown: flight.flapsDown,
    cameraMode: camera.mode,
    score: missionDirector.score,
  }),
};

let lastTime = performance.now();
function frame(now) {
  const dt = clamp((now - lastTime) / 1000, 0.001, 0.05);
  lastTime = now;

  if (!shotName) {
    const ctrl = input.consume();
    if (ctrl.start) {
      audio.unlock();
      if (uiMode === 'title') uiMode = 'playing';
      else if (uiMode === 'debrief') launchSortie(selectedMissionIndex, true);
    }
    if (ctrl.nextMission) {
      const next = (selectedMissionIndex + 1) % MISSIONS.length;
      launchSortie(next, uiMode === 'playing');
    }
    if (ctrl.restart) {
      launchSortie(selectedMissionIndex, true);
    }
    if (ctrl.togglePause && (uiMode === 'playing' || uiMode === 'paused')) {
      uiMode = uiMode === 'playing' ? 'paused' : 'playing';
    }
    if (ctrl.cycleCamera) {
      camera.cycleMode();
    }

    if (uiMode === 'title') {
      // Gentle autopilot orbit flight in background of title menu
      flight.step(dt, { pitch: 0, roll: 0.06, yaw: 0, throttleDelta: 0, throttlePreset: null, brake: false }, missionDirector.mission.wind, 0);
      renderer.recordTrail(flight);
      camera.update(dt, flight);
    } else if (uiMode === 'playing') {
      flight.step(dt, ctrl, missionDirector.mission.wind, missionDirector.mission.turbulence);
      const evt = missionDirector.update(dt, flight);
      if (evt?.event === 'ring_cleared') audio.playRingCleared();
      if (evt?.event === 'landed') {
        audio.playTouchdown();
        uiMode = 'debrief';
        statusEl.textContent = flight.outcomeReason;
      }
      if (evt?.event === 'crashed') {
        audio.playCrash();
        uiMode = 'debrief';
        statusEl.textContent = flight.outcomeReason;
      }
      renderer.recordTrail(flight);
      camera.update(dt, flight);
    }
    audio.update(flight, uiMode !== 'playing');
  }

  renderer.render(flight, camera, missionDirector, missionDirector.mission.timeOfDay);
  hud.render({
    flight,
    missionState: missionDirector,
    cameraMode: camera.mode,
    uiMode,
    selectedMissionIndex,
    missions: MISSIONS,
    mouseActive: input.mouseActive,
  });

  if (!shotName) {
    requestAnimationFrame(frame);
  }
}

if (!shotName) {
  requestAnimationFrame(frame);
}
