// 3D vector, matrix, quaternion, and deterministic procedural noise utilities.

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrapAngleDeg(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

export function wrapSignedRad(rad) {
  let r = (rad + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

export function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function vAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vScale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function vDot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vCross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vLen(a) {
  return Math.hypot(a.x, a.y, a.z);
}

export function vNorm(a) {
  const len = Math.hypot(a.x, a.y, a.z);
  if (len < 1e-8) return { x: 0, y: 0, z: 1 };
  const inv = 1 / len;
  return { x: a.x * inv, y: a.y * inv, z: a.z * inv };
}

export function vLerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function quatIdentity() {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function quatFromAxisAngle(axis, rad) {
  const half = rad * 0.5;
  const s = Math.sin(half);
  const n = vNorm(axis);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(half) };
}

export function quatMul(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quatNorm(q) {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

export function quatRotateVec(q, v) {
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;
  const ix = qw * v.x + qy * v.z - qz * v.y;
  const iy = qw * v.y + qz * v.x - qx * v.z;
  const iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

export function quatBasis(q) {
  return {
    right: quatRotateVec(q, { x: 1, y: 0, z: 0 }),
    up: quatRotateVec(q, { x: 0, y: 1, z: 0 }),
    forward: quatRotateVec(q, { x: 0, y: 0, z: -1 }),
  };
}

export function eulerFromQuat(q) {
  const { forward, right, up } = quatBasis(q);
  const pitch = Math.asin(clamp(forward.y, -1, 1));
  const heading = Math.atan2(forward.x, -forward.z);
  const worldUp = { x: 0, y: 1, z: 0 };
  const flatRight = vNorm(vCross(forward, worldUp));
  const rollCos = clamp(vDot(right, flatRight), -1, 1);
  const rollSin = vDot(up, flatRight);
  const roll = Math.atan2(-rollSin, rollCos);
  return { pitch, heading, roll };
}

export function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function mat4Mul(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    const b0 = b[col * 4];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

export function mat4Perspective(fovRad, aspect, near, far) {
  const f = 1 / Math.tan(fovRad * 0.5);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function mat4LookAt(eye, target, upHint) {
  const f = vNorm(vSub(target, eye));
  const r = vNorm(vCross(f, upHint));
  const u = vCross(r, f);
  return new Float32Array([
    r.x, u.x, -f.x, 0,
    r.y, u.y, -f.y, 0,
    r.z, u.z, -f.z, 0,
    -vDot(r, eye), -vDot(u, eye), vDot(f, eye), 1,
  ]);
}

export function mat4FromPosQuatScale(pos, q, scale = 1) {
  const x = q.x;
  const y = q.y;
  const z = q.z;
  const w = q.w;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const sx = typeof scale === 'number' ? scale : scale.x;
  const sy = typeof scale === 'number' ? scale : scale.y;
  const sz = typeof scale === 'number' ? scale : scale.z;

  return new Float32Array([
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    pos.x, pos.y, pos.z, 1,
  ]);
}

export class SeededRng {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }

  next() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }
}

function hash2D(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function valueNoise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

export function fbmNoise2D(x, z, octaves = 5) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * (valueNoise2D(x * freq, z * freq) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function ridgedNoise2D(x, z, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const n = 1 - Math.abs(valueNoise2D(x * freq, z * freq) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2.11;
  }
  return sum / norm;
}
