// Procedural coastal canyon & archipelago terrain, runways, landmarks, and cloud decks.
import { clamp, fbmNoise2D, lerp, ridgedNoise2D, SeededRng, smoothstep } from './math3d.js';

export const WORLD_RADIUS = 7200;
export const SEA_LEVEL = 0;

// Two hand-carved airfields flattened cleanly into the terrain heightfield:
// 1) Kestrel Coastal Airfield (Main Base, Runway 09/27 oriented East-West along -Z approach)
// 2) Windward Atoll Forward Strip (Runway 36/18 oriented North-South)
export const RUNWAYS = [
  {
    id: 'coastal',
    name: 'KESTREL COASTAL BASE (RWY 36)',
    centerX: 0,
    centerZ: -3200,
    headingDeg: 0, // Aircraft lands heading North (-Z)
    elevation: 18,
    length: 760,
    width: 48,
    hasTower: true,
    hasRefuel: true,
  },
  {
    id: 'atoll',
    name: 'WINDWARD ATOLL STRIP (RWY 09)',
    centerX: 2550,
    centerZ: -450,
    headingDeg: 90, // Oriented East-West (+X)
    elevation: 10,
    length: 600,
    width: 42,
    hasTower: false,
    hasRefuel: true,
  },
];

function runwayMask(x, z, rw) {
  const rad = (rw.headingDeg * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const dx = x - rw.centerX;
  const dz = z - rw.centerZ;
  // Local coords: along runway axis and across runway width
  const along = dx * sin - dz * cos;
  const across = dx * cos + dz * sin;
  const halfL = rw.length * 0.5 + 140;
  const halfW = rw.width * 0.5 + 95;
  const u = Math.max(Math.abs(along) - halfL, 0);
  const v = Math.max(Math.abs(across) - halfW, 0);
  const dist = Math.hypot(u, v);
  return 1 - smoothstep(0, 260, dist);
}

function canyonCarve(x, z) {
  // Winding alpine canyon running from south (+Z) into the coastal bay near z = -2200
  const spineX = Math.sin(z * 0.00145) * 620 + Math.cos(z * 0.0007) * 260;
  const dist = Math.abs(x - spineX);
  const active = smoothstep(-2900, -1600, z) * (1 - smoothstep(2600, 4200, z));
  const carve = (1 - smoothstep(140, 620, dist)) * active;
  return carve;
}

export function sampleTerrainHeight(x, z) {
  // Base continental shelf vs eastern archipelago sea
  const westMountainMass = smoothstep(1200, -2400, x) * 0.85 + 0.15;
  const islandMask = Math.exp(-((x - 2550) ** 2 + (z + 450) ** 2) / (920 * 920))
    + 0.7 * Math.exp(-((x - 1900) ** 2 + (z - 1650) ** 2) / (720 * 720))
    + 0.65 * Math.exp(-((x - 3200) ** 2 + (z + 2300) ** 2) / (800 * 800));

  const ridge = ridgedNoise2D(x * 0.00042 + 4.1, z * 0.00042 - 2.3, 4);
  const hills = fbmNoise2D(x * 0.00095 - 1.7, z * 0.00095 + 3.4, 4);

  let h = -45 + westMountainMass * (ridge * 680 + hills * 140);
  h += islandMask * (95 + ridge * 190);

  // Coastal harbor bay around Kestrel Base (x ~ 0, z ~ -3200)
  const baseBay = Math.exp(-((x - 0) ** 2 + (z + 3200) ** 2) / (1050 * 1050));
  h = lerp(h, 24, baseBay * 0.85);

  // Carve dramatic canyon river gorge
  const canyon = canyonCarve(x, z);
  h = lerp(h, -18 + hills * 14, canyon * 0.92);

  // Outer ocean dropoff
  const edge = Math.hypot(x, z) / WORLD_RADIUS;
  const oceanDrop = smoothstep(0.78, 1.0, edge);
  h = lerp(h, -60, oceanDrop);

  // Flatten runways and approach corridors cleanly
  for (const rw of RUNWAYS) {
    const mask = runwayMask(x, z, rw);
    if (mask > 0.001) {
      h = lerp(h, rw.elevation, mask);
    }
  }

  return h;
}

export function sampleTerrainNormal(x, z) {
  const eps = 6;
  const hL = sampleTerrainHeight(x - eps, z);
  const hR = sampleTerrainHeight(x + eps, z);
  const hD = sampleTerrainHeight(x, z - eps);
  const hU = sampleTerrainHeight(x, z + eps);
  const nx = hL - hR;
  const ny = eps * 2;
  const nz = hD - hU;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

function createBoxGeometry(cx, cy, cz, sx, sy, sz, color) {
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const corners = [
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], // front
    [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], // back
  ];
  const faces = [
    { idx: [0, 1, 2, 3], n: [0, 0, 1] },
    { idx: [4, 5, 6, 7], n: [0, 0, -1] },
    { idx: [3, 2, 7, 6], n: [0, 1, 0] },
    { idx: [5, 4, 1, 0], n: [0, -1, 0] },
    { idx: [1, 4, 7, 2], n: [1, 0, 0] },
    { idx: [5, 0, 3, 6], n: [-1, 0, 0] },
  ];
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vertOffset = 0;

  for (const face of faces) {
    for (const ci of face.idx) {
      const c = corners[ci];
      positions.push(cx + c[0], cy + c[1], cz + c[2]);
      normals.push(face.n[0], face.n[1], face.n[2]);
      colors.push(color[0], color[1], color[2]);
    }
    indices.push(vertOffset, vertOffset + 1, vertOffset + 2, vertOffset, vertOffset + 2, vertOffset + 3);
    vertOffset += 4;
  }
  return { positions, normals, colors, indices };
}

function appendGeometry(target, part) {
  const base = target.positions.length / 3;
  for (let i = 0; i < part.positions.length; i += 1) target.positions.push(part.positions[i]);
  for (let i = 0; i < part.normals.length; i += 1) target.normals.push(part.normals[i]);
  for (let i = 0; i < part.colors.length; i += 1) target.colors.push(part.colors[i]);
  for (let i = 0; i < part.indices.length; i += 1) target.indices.push(part.indices[i] + base);
}

export function buildTerrainMesh(gridSize = 192) {
  const half = WORLD_RADIUS;
  const count = gridSize + 1;
  const positions = new Float32Array(count * count * 3);
  const normals = new Float32Array(count * count * 3);
  const heights = new Float32Array(count * count);

  for (let iz = 0; iz < count; iz += 1) {
    const z = lerp(-half, half, iz / gridSize);
    for (let ix = 0; ix < count; ix += 1) {
      const x = lerp(-half, half, ix / gridSize);
      const y = sampleTerrainHeight(x, z);
      const n = sampleTerrainNormal(x, z);
      const idx = iz * count + ix;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      normals[idx * 3] = n.x;
      normals[idx * 3 + 1] = n.y;
      normals[idx * 3 + 2] = n.z;
      heights[idx] = y;
    }
  }

  const indices = new Uint32Array(gridSize * gridSize * 6);
  let ptr = 0;
  for (let iz = 0; iz < gridSize; iz += 1) {
    for (let ix = 0; ix < gridSize; ix += 1) {
      const a = iz * count + ix;
      const b = a + 1;
      const c = a + count;
      const d = c + 1;
      indices[ptr++] = a;
      indices[ptr++] = c;
      indices[ptr++] = b;
      indices[ptr++] = b;
      indices[ptr++] = c;
      indices[ptr++] = d;
    }
  }

  return { positions, normals, heights, indices };
}

export function buildRunwayMeshes() {
  const geo = { positions: [], normals: [], colors: [], indices: [] };

  for (const rw of RUNWAYS) {
    const rad = (rw.headingDeg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const toWorld = (across, up, along) => [
      rw.centerX + across * cos + along * sin,
      rw.elevation + up,
      rw.centerZ + across * sin - along * cos,
    ];

    const addOrientedSlab = (across, up, along, sx, sy, sz, color) => {
      const box = createBoxGeometry(0, 0, 0, sx, sy, sz, color);
      const base = geo.positions.length / 3;
      for (let i = 0; i < box.positions.length; i += 3) {
        const lx = box.positions[i] + across;
        const ly = box.positions[i + 1] + up;
        const lz = box.positions[i + 2] + along;
        const [wx, wy, wz] = toWorld(lx, ly, -lz);
        geo.positions.push(wx, wy, wz);
      }
      for (let i = 0; i < box.normals.length; i += 3) {
        const nx = box.normals[i];
        const ny = box.normals[i + 1];
        const nz = -box.normals[i + 2];
        geo.normals.push(nx * cos + nz * sin, ny, nx * sin - nz * cos);
      }
      for (let i = 0; i < box.colors.length; i += 1) geo.colors.push(box.colors[i]);
      for (let i = 0; i < box.indices.length; i += 1) geo.indices.push(box.indices[i] + base);
    };

    // Main asphalt apron + runway deck
    addOrientedSlab(0, 0.15, 0, rw.width, 0.35, rw.length, [0.15, 0.17, 0.21]);
    // Concrete shoulder strips
    addOrientedSlab(-rw.width * 0.5 - 2, 0.12, 0, 4, 0.26, rw.length, [0.34, 0.36, 0.38]);
    addOrientedSlab(rw.width * 0.5 + 2, 0.12, 0, 4, 0.26, rw.length, [0.34, 0.36, 0.38]);

    // Dashed centerline stripes
    const stripeCount = Math.floor((rw.length - 120) / 48);
    for (let i = 0; i < stripeCount; i += 1) {
      const zPos = -rw.length * 0.5 + 75 + i * 48;
      addOrientedSlab(0, 0.36, zPos, 1.8, 0.08, 22, [0.94, 0.95, 0.96]);
    }

    // Threshold piano keys at both ends
    for (const endSign of [-1, 1]) {
      const endZ = endSign * (rw.length * 0.5 - 28);
      for (let k = -3; k <= 3; k += 1) {
        if (k === 0) continue;
        addOrientedSlab(k * 5.2, 0.37, endZ, 2.5, 0.08, 28, [0.96, 0.96, 0.97]);
      }
      // Aiming point blocks
      addOrientedSlab(-10, 0.37, endZ - endSign * 85, 4.5, 0.08, 32, [0.95, 0.95, 0.96]);
      addOrientedSlab(10, 0.37, endZ - endSign * 85, 4.5, 0.08, 32, [0.95, 0.95, 0.96]);
    }

    // Glowing runway edge beacons + PAPI lights at approach end
    for (let i = -5; i <= 5; i += 1) {
      const zPos = (i / 5) * (rw.length * 0.48);
      const isEnd = Math.abs(i) === 5;
      const edgeColor = isEnd ? [0.2, 1.0, 0.45] : [1.0, 0.82, 0.32];
      addOrientedSlab(-rw.width * 0.5 - 1.5, 0.9, zPos, 1.8, 1.4, 1.8, edgeColor);
      addOrientedSlab(rw.width * 0.5 + 1.5, 0.9, zPos, 1.8, 1.4, 1.8, edgeColor);
    }

    // Approach PAPI light boxes (4 boxes on port side of touchdown zone)
    for (let p = 0; p < 4; p += 1) {
      const papiColor = p < 2 ? [1.0, 0.24, 0.18] : [0.98, 0.98, 0.94];
      addOrientedSlab(-rw.width * 0.5 - 12 - p * 5.5, 1.3, -rw.length * 0.5 + 115, 2.8, 1.6, 2.8, papiColor);
    }

    // Control tower and hangar beside the strip
    if (rw.hasTower) {
      addOrientedSlab(rw.width * 0.5 + 48, 13, 30, 14, 26, 14, [0.76, 0.78, 0.82]);
      addOrientedSlab(rw.width * 0.5 + 48, 28.5, 30, 19, 5, 19, [0.18, 0.55, 0.72]);
      addOrientedSlab(rw.width * 0.5 + 48, 32, 30, 21, 2, 21, [0.28, 0.31, 0.36]);
      addOrientedSlab(rw.width * 0.5 + 62, 9, -60, 34, 18, 46, [0.46, 0.51, 0.56]);
      addOrientedSlab(rw.width * 0.5 + 62, 18.5, -60, 36, 2.2, 48, [0.75, 0.34, 0.18]);
    } else {
      addOrientedSlab(rw.width * 0.5 + 34, 6, 0, 20, 12, 26, [0.68, 0.65, 0.58]);
      addOrientedSlab(rw.width * 0.5 + 34, 12.6, 0, 22, 1.8, 28, [0.18, 0.48, 0.54]);
    }
  }

  return {
    positions: new Float32Array(geo.positions),
    normals: new Float32Array(geo.normals),
    colors: new Float32Array(geo.colors),
    indices: new Uint32Array(geo.indices),
  };
}

export function buildCloudField(seed = 17) {
  const rng = new SeededRng(seed);
  const geo = { positions: [], normals: [], colors: [], indices: [] };
  const clusterCount = 46;

  for (let i = 0; i < clusterCount; i += 1) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(550, WORLD_RADIUS * 0.82);
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const cy = rng.range(620, 1250);
    const puffs = Math.floor(rng.range(3, 6));
    for (let p = 0; p < puffs; p += 1) {
      const px = cx + rng.range(-180, 180);
      const py = cy + rng.range(-35, 45);
      const pz = cz + rng.range(-180, 180);
      const sx = rng.range(180, 360);
      const sy = rng.range(42, 85);
      const sz = rng.range(160, 330);
      const shade = rng.range(0.92, 0.99);
      appendGeometry(geo, createBoxGeometry(px, py, pz, sx, sy, sz, [shade, shade * 0.99, 1.0]));
    }
  }

  return {
    positions: new Float32Array(geo.positions),
    normals: new Float32Array(geo.normals),
    colors: new Float32Array(geo.colors),
    indices: new Uint32Array(geo.indices),
  };
}
