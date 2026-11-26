// Lit glass cockpit instruments, pitch ladder, airspeed/altitude/heading tapes, mini-radar, and overlays.
import { clamp, DEG2RAD, RAD2DEG, wrapAngleDeg } from './math3d.js';
import { RUNWAYS } from './terrain.js';

const HUD_GREEN = '#58ff9c';
const HUD_AMBER = '#ffb84d';
const HUD_RED = '#ff4f5e';
const HUD_CYAN = '#4ee8ff';

export class FlightHud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(width, height, dpr) {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = width;
    this.height = height;
  }

  render(state) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const { flight, missionState, cameraMode, uiMode, selectedMissionIndex, missions, mouseActive } = state;

    if (cameraMode === 'cockpit') {
      this.drawCockpitFrame(ctx, w, h, flight);
    }

    if (uiMode !== 'title') {
      this.drawPitchLadder(ctx, w, h, flight);
      this.drawSpeedAndAltTapes(ctx, w, h, flight);
    }
    this.drawHeadingTape(ctx, w, h, flight, missionState);
    this.drawMissionHeader(ctx, w, h, flight, missionState);
    this.drawBottomInstruments(ctx, w, h, flight, missionState, cameraMode, mouseActive);

    if (flight.stalling || flight.terrainAlert || flight.lowFuel) {
      this.drawAlerts(ctx, w, h, flight);
    }

    if (uiMode === 'title') {
      this.drawTitleOverlay(ctx, w, h, selectedMissionIndex, missions);
    } else if (uiMode === 'paused') {
      this.drawPauseOverlay(ctx, w, h);
    } else if (uiMode === 'debrief') {
      this.drawDebriefOverlay(ctx, w, h, flight, missionState);
    }
  }

  drawCockpitFrame(ctx, w, h, flight) {
    ctx.save();
    // Canopy bow & side rails
    ctx.strokeStyle = 'rgba(18, 25, 36, 0.94)';
    ctx.lineWidth = Math.max(14, w * 0.016);
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.78);
    ctx.quadraticCurveTo(w * 0.16, h * 0.07, w * 0.5, h * 0.05);
    ctx.quadraticCurveTo(w * 0.84, h * 0.07, w * 0.92, h * 0.78);
    ctx.stroke();

    // Inner metallic canopy highlight
    ctx.strokeStyle = 'rgba(110, 145, 180, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.095, h * 0.77);
    ctx.quadraticCurveTo(w * 0.17, h * 0.09, w * 0.5, h * 0.07);
    ctx.quadraticCurveTo(w * 0.83, h * 0.09, w * 0.905, h * 0.77);
    ctx.stroke();

    // HUD combiner glass frame
    ctx.fillStyle = 'rgba(78, 232, 255, 0.04)';
    ctx.strokeStyle = 'rgba(130, 195, 225, 0.42)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(w * 0.34, h * 0.13, w * 0.32, h * 0.44, 16);
    ctx.fill();
    ctx.stroke();

    // Lower cockpit dashboard glare shield
    const dashY = h * 0.72;
    const grad = ctx.createLinearGradient(0, dashY, 0, h);
    grad.addColorStop(0, '#131a24');
    grad.addColorStop(1, '#090d14');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, dashY + 40);
    ctx.quadraticCurveTo(w * 0.5, dashY - 26, w, dashY + 40);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#33465d';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Subtle stick pitch deflection indicator on cockpit center post
    ctx.fillStyle = flight.stalling ? HUD_RED : HUD_GREEN;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`AOA ${flight.aoaDeg.toFixed(1)}°`, w * 0.5, dashY + 8);
    ctx.restore();
  }

  drawPitchLadder(ctx, w, h, flight) {
    const cx = w * 0.5;
    const cy = h * 0.44;
    const pxPerDeg = h * 0.009;
    const rollRad = flight.rollDeg * DEG2RAD;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 170, cy - 145, 340, 290);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(-rollRad);

    ctx.strokeStyle = HUD_GREEN;
    ctx.fillStyle = HUD_GREEN;
    ctx.font = 'bold 11px monospace';
    ctx.lineWidth = 1.6;

    for (let deg = -40; deg <= 40; deg += 10) {
      const y = (flight.pitchDeg - deg) * pxPerDeg;
      if (Math.abs(y) > 155) continue;
      if (deg === 0) {
        // Horizon line
        ctx.beginPath();
        ctx.moveTo(-125, y);
        ctx.lineTo(-28, y);
        ctx.moveTo(28, y);
        ctx.lineTo(125, y);
        ctx.stroke();
      } else {
        const half = 62;
        if (deg < 0) ctx.setLineDash([6, 5]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(-half, y);
        ctx.lineTo(-22, y);
        ctx.lineTo(-22, y + (deg > 0 ? 7 : -7));
        ctx.moveTo(half, y);
        ctx.lineTo(22, y);
        ctx.lineTo(22, y + (deg > 0 ? 7 : -7));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = 'right';
        ctx.fillText(`${deg}`, -half - 6, y + 4);
        ctx.textAlign = 'left';
        ctx.fillText(`${deg}`, half + 6, y + 4);
      }
    }
    ctx.restore();

    // Fixed boresight reticle + bank scale arc
    ctx.save();
    ctx.strokeStyle = HUD_GREEN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy);
    ctx.lineTo(cx - 6, cy);
    ctx.lineTo(cx, cy + 6);
    ctx.lineTo(cx + 6, cy);
    ctx.lineTo(cx + 18, cy);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 132, -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.stroke();
    ctx.restore();
  }

  drawHeadingTape(ctx, w, h, flight, missionState) {
    const cx = w * 0.5;
    const topY = 26;
    const tapeW = 310;
    const hdg = wrapAngleDeg(flight.headingDeg);
    const wp = missionState.getActiveWaypoint();
    const dx = wp.x - flight.pos.x;
    const dz = wp.z - flight.pos.z;
    const wpBearing = wrapAngleDeg(Math.atan2(dx, -dz) * RAD2DEG);
    const wpDistKm = Math.hypot(dx, dz) / 1000;

    ctx.save();
    ctx.fillStyle = 'rgba(8, 17, 29, 0.58)';
    ctx.strokeStyle = 'rgba(88, 255, 156, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(cx - tapeW * 0.5 - 10, topY - 12, tapeW + 20, 42, 6);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - tapeW * 0.5, topY - 10, tapeW, 38);
    ctx.clip();

    const pxPerDeg = 3.4;
    ctx.strokeStyle = HUD_GREEN;
    ctx.fillStyle = HUD_GREEN;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';

    const startDeg = Math.floor((hdg - 50) / 5) * 5;
    for (let d = startDeg; d <= hdg + 50; d += 5) {
      const diff = d - hdg;
      const x = cx + diff * pxPerDeg;
      const normD = wrapAngleDeg(d);
      const major = normD % 15 === 0;
      ctx.beginPath();
      ctx.moveTo(x, topY + 20);
      ctx.lineTo(x, topY + (major ? 10 : 15));
      ctx.stroke();
      if (major) {
        const label = normD === 0 ? 'N' : normD === 90 ? 'E' : normD === 180 ? 'S' : normD === 270 ? 'W' : String(normD).padStart(3, '0');
        ctx.fillText(label, x, topY + 7);
      }
    }

    // Waypoint bearing diamond
    let wpDiff = wpBearing - hdg;
    while (wpDiff > 180) wpDiff -= 360;
    while (wpDiff < -180) wpDiff += 360;
    const wpX = clamp(cx + wpDiff * pxPerDeg, cx - tapeW * 0.46, cx + tapeW * 0.46);
    ctx.fillStyle = HUD_CYAN;
    ctx.beginPath();
    ctx.moveTo(wpX, topY + 21);
    ctx.lineTo(wpX - 6, topY + 27);
    ctx.lineTo(wpX + 6, topY + 27);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Digital HDG readout box
    ctx.fillStyle = '#07141f';
    ctx.strokeStyle = HUD_GREEN;
    ctx.fillRect(cx - 28, topY + 24, 56, 20);
    ctx.strokeRect(cx - 28, topY + 24, 56, 20);
    ctx.fillStyle = HUD_GREEN;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`HDG ${String(Math.round(hdg)).padStart(3, '0')}`, cx, topY + 38);

    // Waypoint distance tag
    ctx.fillStyle = HUD_CYAN;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`${wp.label} · ${wpDistKm.toFixed(1)} KM · BRG ${String(Math.round(wpBearing)).padStart(3, '0')}°`, cx, topY + 60);
    ctx.restore();
  }

  drawSpeedAndAltTapes(ctx, w, h, flight) {
    const cy = h * 0.44;
    const tapeH = 220;
    const leftX = w * 0.5 - 235;
    const rightX = w * 0.5 + 235;

    const drawTape = (x, value, unit, alignRight, stepVal, dangerBelow) => {
      ctx.save();
      const boxW = 74;
      const boxX = alignRight ? x - boxW : x;
      ctx.fillStyle = 'rgba(8, 17, 29, 0.55)';
      ctx.strokeStyle = 'rgba(88, 255, 156, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(boxX, cy - tapeH * 0.5, boxW, tapeH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.rect(boxX, cy - tapeH * 0.5 + 4, boxW, tapeH - 8);
      ctx.clip();

      const pxPerUnit = 90 / stepVal;
      const baseTick = Math.floor((value - stepVal * 2) / stepVal) * stepVal;
      ctx.font = '11px monospace';
      for (let v = baseTick; v <= value + stepVal * 2; v += stepVal) {
        if (v < 0) continue;
        const y = cy - (v - value) * pxPerUnit;
        ctx.strokeStyle = v <= dangerBelow ? HUD_RED : HUD_GREEN;
        ctx.fillStyle = v <= dangerBelow ? HUD_RED : HUD_GREEN;
        ctx.beginPath();
        if (alignRight) {
          ctx.moveTo(x - 12, y);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.textAlign = 'right';
          ctx.fillText(`${v}`, x - 16, y + 4);
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x + 12, y);
          ctx.stroke();
          ctx.textAlign = 'left';
          ctx.fillText(`${v}`, x + 16, y + 4);
        }
      }
      ctx.restore();

      // Current readout caret box
      const readY = cy - 14;
      ctx.fillStyle = '#07141f';
      ctx.strokeStyle = value <= dangerBelow ? HUD_RED : HUD_GREEN;
      ctx.lineWidth = 1.8;
      ctx.fillRect(boxX - 4, readY, boxW + 8, 28);
      ctx.strokeRect(boxX - 4, readY, boxW + 8, 28);
      ctx.fillStyle = value <= dangerBelow ? HUD_RED : HUD_GREEN;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(value)}`, boxX + boxW * 0.5, cy + 5);

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = 'rgba(200, 238, 255, 0.85)';
      ctx.fillText(unit, boxX + boxW * 0.5, cy - tapeH * 0.5 - 8);
      ctx.restore();
    };

    drawTape(leftX, flight.iasKnots, 'IAS KT', true, 40, 88);
    drawTape(rightX, flight.altFeet, 'ALT FT', false, 200, 120);

    // AGL radar altimeter under ALT tape
    ctx.save();
    ctx.fillStyle = flight.aglFeet < 180 ? HUD_AMBER : HUD_GREEN;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`AGL ${Math.round(flight.aglFeet)} FT`, rightX, cy + tapeH * 0.5 + 18);
    ctx.fillText(`VSI ${flight.vsiFpm >= 0 ? '+' : ''}${Math.round(flight.vsiFpm)} FPM`, rightX, cy + tapeH * 0.5 + 34);
    ctx.restore();
  }

  drawMissionHeader(ctx, w, h, flight, missionState) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 17, 29, 0.65)';
    ctx.strokeStyle = 'rgba(78, 232, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(16, 16, 260, 68, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = HUD_CYAN;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(missionState.mission.title, 28, 36);

    ctx.fillStyle = '#dceeff';
    ctx.font = '12px monospace';
    const gatesTotal = missionState.rings.length;
    const gateLabel = gatesTotal > 0 ? `GATES ${missionState.ringsCleared}/${gatesTotal}` : 'OPEN PATROL';
    ctx.fillText(`${gateLabel} · SCORE ${Math.round(missionState.score)}`, 28, 56);

    const mm = String(Math.floor(missionState.elapsed / 60)).padStart(2, '0');
    const ss = String(Math.floor(missionState.elapsed % 60)).padStart(2, '0');
    ctx.fillStyle = '#9bb6cc';
    ctx.font = '11px monospace';
    ctx.fillText(`TIME ${mm}:${ss} · ${missionState.phase}`, 28, 74);

    if (missionState.bannerTimer > 0) {
      ctx.fillStyle = 'rgba(7, 18, 30, 0.78)';
      ctx.strokeStyle = HUD_AMBER;
      ctx.beginPath();
      ctx.roundRect(w * 0.5 - 230, 96, 460, 28, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = HUD_AMBER;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(missionState.bannerText, w * 0.5, 114);
    }
    ctx.restore();
  }

  drawBottomInstruments(ctx, w, h, flight, missionState, cameraMode, mouseActive) {
    const panelW = Math.min(w - 32, 760);
    const panelH = 122;
    const px = (w - panelW) * 0.5;
    const py = h - panelH - 12;

    ctx.save();
    ctx.fillStyle = cameraMode === 'cockpit' ? 'rgba(10, 16, 24, 0.92)' : 'rgba(9, 17, 28, 0.78)';
    ctx.strokeStyle = 'rgba(90, 150, 195, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(px, py, panelW, panelH, 12);
    ctx.fill();
    ctx.stroke();

    // 1) Artificial Horizon Attitude Ball
    const gyroX = px + 68;
    const gyroY = py + 61;
    const gyroR = 44;
    this.drawAttitudeBall(ctx, gyroX, gyroY, gyroR, flight);

    // 2) Throttle / RPM & Fuel Gauges
    const gX = px + 140;
    this.drawBarGauge(ctx, gX, py + 22, 145, 14, flight.rpm, 'THRUST / RPM', `${Math.round(flight.rpm * 100)}%${flight.rpm > 0.85 ? ' AB' : ''}`, flight.rpm > 0.85 ? HUD_CYAN : HUD_GREEN);
    this.drawBarGauge(ctx, gX, py + 54, 145, 14, flight.fuel / 100, 'FUEL REMAINING', `${Math.round(flight.fuel)}%`, flight.lowFuel ? HUD_RED : HUD_AMBER);
    this.drawBarGauge(ctx, gX, py + 86, 145, 14, flight.hull / 100, 'HULL INTEGRITY', `${Math.round(flight.hull)}%`, flight.hull < 40 ? HUD_RED : HUD_GREEN);

    // 3) G-Load & Systems Annunciators
    const sysX = px + 314;
    ctx.fillStyle = '#9bb6cc';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`G-LOAD  ${flight.gLoad.toFixed(1)}G`, sysX, py + 28);
    ctx.fillText(`AOA     ${flight.aoaDeg.toFixed(1)}°`, sysX, py + 48);
    ctx.fillText(`CAM [C] ${cameraMode.toUpperCase()}`, sysX, py + 68);
    ctx.fillText(`STK [M] ${mouseActive ? 'MOUSE' : 'KEYS'}`, sysX, py + 88);

    const drawPill = (x, y, label, active, color) => {
      ctx.fillStyle = active ? color : 'rgba(40, 56, 72, 0.55)';
      ctx.beginPath();
      ctx.roundRect(x, y, 62, 18, 4);
      ctx.fill();
      ctx.fillStyle = active ? '#071018' : '#738b9e';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + 31, y + 13);
    };
    drawPill(sysX, py + 95, 'GEAR [G]', flight.gearDown, HUD_GREEN);
    drawPill(sysX + 70, py + 95, 'FLAPS [F]', flight.flapsDown, HUD_CYAN);
    drawPill(sysX + 140, py + 95, 'BRK [B]', flight.airbrake, HUD_AMBER);

    // 4) Circular Navigation Radar
    const radX = px + panelW - 72;
    const radY = py + 61;
    this.drawRadar(ctx, radX, radY, 47, flight, missionState);
    ctx.restore();
  }

  drawAttitudeBall(ctx, cx, cy, r, flight) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(-flight.rollDeg * DEG2RAD);
    const pitchShift = clamp(flight.pitchDeg * 1.1, -r, r);

    ctx.fillStyle = '#1f6bb8';
    ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 1.5 + pitchShift);
    ctx.fillStyle = '#734929';
    ctx.fillRect(-r * 1.5, pitchShift, r * 3, r * 2);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, pitchShift);
    ctx.lineTo(r, pitchShift);
    ctx.stroke();
    ctx.restore();

    // Bezel & center wings marker
    ctx.save();
    ctx.strokeStyle = '#5f7d99';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = HUD_AMBER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.lineTo(cx, cy + 5);
    ctx.lineTo(cx + 5, cy);
    ctx.lineTo(cx + 14, cy);
    ctx.stroke();
    ctx.restore();
  }

  drawBarGauge(ctx, x, y, w, h, frac, label, readout, color) {
    ctx.save();
    ctx.fillStyle = '#9db6cc';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y - 3);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.fillText(readout, x + w, y - 3);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * clamp(frac, 0, 1)), h - 2);
    ctx.strokeStyle = 'rgba(130, 175, 210, 0.35)';
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  drawRadar(ctx, cx, cy, r, flight, missionState) {
    ctx.save();
    ctx.fillStyle = '#06151c';
    ctx.strokeStyle = HUD_GREEN;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Range ring
    ctx.strokeStyle = 'rgba(88, 255, 156, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    const rangeM = 3600;
    const hdgRad = flight.headingDeg * DEG2RAD;
    const cosH = Math.cos(hdgRad);
    const sinH = Math.sin(hdgRad);
    const toRadar = (wx, wz) => {
      const dx = wx - flight.pos.x;
      const dz = wz - flight.pos.z;
      // Rotate into aircraft heading-up frame
      const rx = dx * cosH + dz * sinH;
      const ry = -dx * sinH + dz * cosH;
      const sx = (rx / rangeM) * r;
      const sy = (ry / rangeM) * r;
      const d = Math.hypot(sx, sy);
      if (d > r - 4) {
        const s = (r - 4) / d;
        return [cx + sx * s, cy + sy * s];
      }
      return [cx + sx, cy + sy];
    };

    // Plot runways
    for (const rw of RUNWAYS) {
      const [rx, ry] = toRadar(rw.centerX, rw.centerZ);
      ctx.fillStyle = '#d7e6f2';
      ctx.fillRect(rx - 3, ry - 3, 6, 6);
    }

    // Plot rings
    for (const ring of missionState.rings) {
      if (ring.cleared) continue;
      const [rx, ry] = toRadar(ring.x, ring.z);
      ctx.fillStyle = ring.index === missionState.nextRingIndex ? HUD_CYAN : HUD_AMBER;
      ctx.beginPath();
      ctx.arc(rx, ry, ring.index === missionState.nextRingIndex ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Own aircraft triangle
    ctx.fillStyle = HUD_GREEN;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawAlerts(ctx, w, h, flight) {
    const messages = [];
    if (flight.terrainAlert) messages.push('PULL UP · TERRAIN');
    if (flight.stalling) messages.push('STALL · LOWER NOSE / ADD POWER');
    if (flight.lowFuel) messages.push('BINGO FUEL · CONSERVE THROTTLE');

    ctx.save();
    ctx.fillStyle = 'rgba(130, 12, 24, 0.82)';
    ctx.strokeStyle = HUD_RED;
    ctx.lineWidth = 2;
    const boxW = 320;
    ctx.beginPath();
    ctx.roundRect(w * 0.5 - boxW * 0.5, h * 0.61, boxW, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(messages[0], w * 0.5, h * 0.61 + 18);
    ctx.restore();
  }

  drawTitleOverlay(ctx, w, h, selectedIndex, missions) {
    ctx.save();
    const boxW = Math.min(w - 40, 525);
    const boxH = 316;
    const bx = 22;
    const by = h * 0.5 - boxH * 0.5 - 12;

    ctx.fillStyle = 'rgba(7, 15, 26, 0.86)';
    ctx.strokeStyle = HUD_CYAN;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = HUD_CYAN;
    ctx.font = 'bold 21px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('KESTREL · WINDWARD SORTIE', bx + 20, by + 38);

    ctx.fillStyle = '#a8c2d8';
    ctx.font = '11px monospace';
    ctx.fillText('Select sortie [TAB] · Launch [SPACE / ENTER / CLICK]:', bx + 20, by + 62);

    missions.forEach((m, idx) => {
      const y = by + 78 + idx * 44;
      const active = idx === selectedIndex;
      ctx.fillStyle = active ? 'rgba(78, 232, 255, 0.18)' : 'rgba(255, 255, 255, 0.04)';
      ctx.strokeStyle = active ? HUD_CYAN : 'rgba(130, 175, 210, 0.25)';
      ctx.beginPath();
      ctx.roundRect(bx + 18, y, boxW - 36, 38, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = active ? '#ffffff' : '#9eb6c9';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`${active ? '▶ ' : '  '}${m.title}`, bx + 26, y + 16);
      ctx.fillStyle = '#8aa4ba';
      ctx.font = '10px monospace';
      ctx.fillText(m.subtitle, bx + 36, y + 31);
    });

    ctx.fillStyle = HUD_GREEN;
    ctx.font = '10px monospace';
    ctx.fillText('W/S Pitch · A/D Roll · Q/E Yaw · Shift/Ctrl Thrust · G Gear · F Flaps · C Cam', bx + 20, by + boxH - 16);
    ctx.restore();
  }

  drawPauseOverlay(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 12, 22, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = HUD_CYAN;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SORTIE PAUSED', w * 0.5, h * 0.44);
    ctx.fillStyle = '#dbeaff';
    ctx.font = '13px monospace';
    ctx.fillText('Press [P] to Resume · [R] Restart · [TAB] Cycle Sortie', w * 0.5, h * 0.51);
    ctx.restore();
  }

  drawDebriefOverlay(ctx, w, h, flight, missionState) {
    ctx.save();
    const boxW = Math.min(w - 40, 520);
    const boxH = 225;
    const bx = w * 0.5 - boxW * 0.5;
    const by = h * 0.5 - boxH * 0.5 - 24;

    ctx.fillStyle = 'rgba(8, 16, 28, 0.88)';
    ctx.strokeStyle = flight.landed ? HUD_GREEN : HUD_RED;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = flight.landed ? HUD_GREEN : HUD_RED;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(flight.landed ? 'SORTIE COMPLETE · SAFE LANDING' : 'AIRFRAME LOST · CRASH DEBRIEF', w * 0.5, by + 38);

    ctx.fillStyle = '#e6f2ff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(flight.outcomeReason, w * 0.5, by + 68);

    ctx.fillStyle = '#a9c4d9';
    ctx.font = '12px monospace';
    ctx.fillText(`GATES CLEARED: ${missionState.ringsCleared}/${missionState.rings.length}   ·   TOTAL SCORE: ${Math.round(missionState.score)}`, w * 0.5, by + 104);
    ctx.fillText(`REMAINING FUEL: ${Math.round(flight.fuel)}%   ·   HULL: ${Math.round(flight.hull)}%`, w * 0.5, by + 128);
    if (flight.landed) {
      ctx.fillText(`TOUCHDOWN VERTICAL SPEED: -${flight.touchdownFpm} FPM`, w * 0.5, by + 152);
    }

    ctx.fillStyle = HUD_CYAN;
    ctx.font = 'bold 13px monospace';
    ctx.fillText('PRESS [R] OR [SPACE] TO RETRY · [TAB] NEXT SORTIE', w * 0.5, by + 194);
    ctx.restore();
  }
}
