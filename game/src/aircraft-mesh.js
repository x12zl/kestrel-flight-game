// Multi-part procedural 3D Kestrel XF-9 aircraft mesh builder with animated control surfaces.

function pushTriMesh(target, verts, norms, cols, tris) {
  const base = target.positions.length / 3;
  for (let i = 0; i < verts.length; i += 1) target.positions.push(verts[i]);
  for (let i = 0; i < norms.length; i += 1) target.normals.push(norms[i]);
  for (let i = 0; i < cols.length; i += 1) target.colors.push(cols[i]);
  for (let i = 0; i < tris.length; i += 1) target.indices.push(tris[i] + base);
}

function addPrism(target, p0, p1, w0, h0, w1, h1, yOff0, yOff1, color) {
  const pts = [
    [-w0, -h0 + yOff0, p0],
    [w0, -h0 + yOff0, p0],
    [w0 * 0.72, h0 + yOff0, p0],
    [-w0 * 0.72, h0 + yOff0, p0],
    [-w1, -h1 + yOff1, p1],
    [w1, -h1 + yOff1, p1],
    [w1 * 0.72, h1 + yOff1, p1],
    [-w1 * 0.72, h1 + yOff1, p1],
  ];
  const quads = [
    [0, 1, 2, 3], // back/front cap
    [5, 4, 7, 6],
    [3, 2, 6, 7], // top
    [4, 5, 1, 0], // bottom
    [1, 5, 6, 2], // right
    [4, 0, 3, 7], // left
  ];
  const verts = [];
  const norms = [];
  const cols = [];
  const tris = [];
  let idx = 0;

  for (const q of quads) {
    const a = pts[q[0]];
    const b = pts[q[1]];
    const c = pts[q[2]];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const qi of q) {
      const p = pts[qi];
      verts.push(p[0], p[1], p[2]);
      norms.push(nx, ny, nz);
      cols.push(color[0], color[1], color[2]);
    }
    tris.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
    idx += 4;
  }
  pushTriMesh(target, verts, norms, cols, tris);
}

function addSweptPlate(target, innerX, outerX, innerZLead, innerZTrail, outerZLead, outerZTrail, yInner, yOuter, thick, color) {
  const top = [
    [innerX, yInner + thick, innerZLead],
    [outerX, yOuter + thick, outerZLead],
    [outerX, yOuter + thick, outerZTrail],
    [innerX, yInner + thick, innerZTrail],
  ];
  const bot = [
    [innerX, yInner - thick, innerZLead],
    [outerX, yOuter - thick, outerZLead],
    [outerX, yOuter - thick, outerZTrail],
    [innerX, yInner - thick, innerZTrail],
  ];
  const quads = [
    [top[0], top[3], top[2], top[1]],
    [bot[0], bot[1], bot[2], bot[3]],
    [top[0], top[1], bot[1], bot[0]], // leading edge
    [top[2], top[3], bot[3], bot[2]], // trailing edge
    [top[1], top[2], bot[2], bot[1]], // outer tip
    [top[3], top[0], bot[0], bot[3]], // root
  ];
  const verts = [];
  const norms = [];
  const cols = [];
  const tris = [];
  let idx = 0;

  for (const q of quads) {
    const a = q[0];
    const b = q[1];
    const c = q[2];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const p of q) {
      verts.push(p[0], p[1], p[2]);
      norms.push(nx, ny, nz);
      cols.push(color[0], color[1], color[2]);
    }
    tris.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
    idx += 4;
  }
  pushTriMesh(target, verts, norms, cols, tris);
}

function finalizePart(raw) {
  return {
    positions: new Float32Array(raw.positions),
    normals: new Float32Array(raw.normals),
    colors: new Float32Array(raw.colors),
    indices: new Uint32Array(raw.indices),
  };
}

export function buildKestrelAircraft() {
  const hull = { positions: [], normals: [], colors: [], indices: [] };
  const slate = [0.76, 0.80, 0.86];
  const darkSlate = [0.22, 0.25, 0.30];
  const accentOrange = [0.95, 0.42, 0.12];
  const canopyGold = [0.96, 0.72, 0.24];
  const navRed = [1.0, 0.16, 0.16];
  const navGreen = [0.16, 1.0, 0.36];

  // Fuselage sections from nose (-Z) to tail (+Z)
  addPrism(hull, -6.2, -4.4, 0.14, 0.12, 0.56, 0.44, -0.08, 0.0, darkSlate); // Radome tip
  addPrism(hull, -4.4, -1.6, 0.56, 0.44, 0.92, 0.62, 0.0, 0.06, slate); // Forward cockpit hull
  addPrism(hull, -1.6, 2.2, 0.92, 0.62, 0.96, 0.64, 0.06, 0.04, slate); // Mid fuselage
  addPrism(hull, 2.2, 4.7, 0.96, 0.64, 0.64, 0.48, 0.04, 0.02, darkSlate); // Rear engine nacelle

  // Gold-tinted bubble canopy
  addPrism(hull, -3.5, -1.9, 0.30, 0.22, 0.48, 0.42, 0.42, 0.74, canopyGold);
  addPrism(hull, -1.9, 0.4, 0.48, 0.42, 0.38, 0.28, 0.74, 0.56, canopyGold);

  // Twin side air intakes
  for (const s of [-1, 1]) {
    addPrism(hull, -1.8, 2.4, 0.24, 0.32, 0.28, 0.34, -0.04, 0.0, darkSlate);
    // Intake shoulder stripe
    addSweptPlate(hull, s * 0.78, s * 1.18, -1.8, 1.4, -1.3, 1.4, 0.15, 0.12, 0.18, accentOrange);
  }

  // Swept main wings (left & right)
  addSweptPlate(hull, -0.88, -6.2, -0.6, 2.2, 1.5, 3.0, 0.0, -0.08, 0.11, slate);
  addSweptPlate(hull, 0.88, 6.2, -0.6, 2.2, 1.5, 3.0, 0.0, -0.08, 0.11, slate);

  // Orange wing leading accents & wingtip rails
  addSweptPlate(hull, -4.9, -6.2, 1.0, 2.7, 1.5, 3.0, -0.04, -0.08, 0.12, accentOrange);
  addSweptPlate(hull, 4.9, 6.2, 1.0, 2.7, 1.5, 3.0, -0.04, -0.08, 0.12, accentOrange);
  addPrism(hull, 1.1, 3.4, 0.12, 0.12, 0.12, 0.12, -0.08, -0.08, navRed);
  // Shift wingtip nav markers precisely onto tips
  for (let i = hull.positions.length - 72; i < hull.positions.length; i += 3) hull.positions[i] -= 6.22;
  addPrism(hull, 1.1, 3.4, 0.12, 0.12, 0.12, 0.12, -0.08, -0.08, navGreen);
  for (let i = hull.positions.length - 72; i < hull.positions.length; i += 3) hull.positions[i] += 6.22;

  // Twin canted vertical stabilizers
  for (const s of [-1, 1]) {
    const baseX = s * 0.65;
    const tipX = s * 1.45;
    addSweptPlate(hull, baseX, tipX, 2.1, 4.5, 3.2, 4.9, 0.4, 2.15, 0.07, darkSlate);
    addSweptPlate(hull, baseX + s * 0.55, tipX, 2.9, 4.7, 3.2, 4.9, 1.55, 2.15, 0.08, accentOrange);
  }

  // Horizontal stabilators
  addSweptPlate(hull, -0.6, -2.9, 2.9, 4.4, 3.7, 4.8, 0.02, -0.04, 0.07, darkSlate);
  addSweptPlate(hull, 0.6, 2.9, 2.9, 4.4, 3.7, 4.8, 0.02, -0.04, 0.07, darkSlate);

  // Separate animated control surfaces & gear (flush with swept wing trailing edge)
  const leftAileron = { positions: [], normals: [], colors: [], indices: [] };
  addSweptPlate(leftAileron, -2.75, -5.65, 0.12, 0.62, 0.45, 0.96, -0.03, -0.07, 0.06, accentOrange);

  const rightAileron = { positions: [], normals: [], colors: [], indices: [] };
  addSweptPlate(rightAileron, 2.75, 5.65, 0.12, 0.62, 0.45, 0.96, -0.03, -0.07, 0.06, accentOrange);

  const flaps = { positions: [], normals: [], colors: [], indices: [] };
  addSweptPlate(flaps, -0.95, -2.68, -0.05, 0.55, 0.10, 0.60, 0.0, -0.03, 0.06, darkSlate);
  addSweptPlate(flaps, 0.95, 2.68, -0.05, 0.55, 0.10, 0.60, 0.0, -0.03, 0.06, darkSlate);

  const gear = { positions: [], normals: [], colors: [], indices: [] };
  // Nose gear + twin main gear struts and tires
  addPrism(gear, -3.4, -3.15, 0.08, 0.52, 0.08, 0.52, -0.82, -0.82, darkSlate);
  addPrism(gear, -3.55, -2.95, 0.16, 0.22, 0.16, 0.22, -1.32, -1.32, [0.09, 0.09, 0.11]);
  for (const s of [-1, 1]) {
    const gx = s * 1.45;
    const raw = { positions: [], normals: [], colors: [], indices: [] };
    addPrism(raw, 0.6, 0.85, 0.09, 0.52, 0.09, 0.52, -0.82, -0.82, darkSlate);
    addPrism(raw, 0.4, 1.05, 0.2, 0.28, 0.2, 0.28, -1.32, -1.32, [0.09, 0.09, 0.11]);
    for (let i = 0; i < raw.positions.length; i += 3) raw.positions[i] += gx;
    pushTriMesh(gear, raw.positions, raw.normals, raw.colors, raw.indices);
  }

  // Afterburner plume cone (compact nozzle glow, scaled cleanly by throttle)
  const flame = { positions: [], normals: [], colors: [], indices: [] };
  addPrism(flame, 0.0, 1.55, 0.34, 0.34, 0.04, 0.04, 0.02, 0.02, [1.0, 0.72, 0.28]);

  return {
    hull: finalizePart(hull),
    leftAileron: finalizePart(leftAileron),
    rightAileron: finalizePart(rightAileron),
    flaps: finalizePart(flaps),
    gear: finalizePart(gear),
    flame: finalizePart(flame),
  };
}

export function buildRingMesh(radius = 28, tube = 2.6, color = [0.18, 0.92, 1.0]) {
  const segs = 28;
  const sides = 8;
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i <= segs; i += 1) {
    const u = (i / segs) * Math.PI * 2;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    for (let j = 0; j <= sides; j += 1) {
      const v = (j / sides) * Math.PI * 2;
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      const r = radius + tube * cv;
      const x = r * cu;
      const y = r * su;
      const z = tube * sv;
      positions.push(x, y, z);
      normals.push(cv * cu, cv * su, sv);
      colors.push(color[0], color[1], color[2]);
    }
  }

  const stride = sides + 1;
  for (let i = 0; i < segs; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}
