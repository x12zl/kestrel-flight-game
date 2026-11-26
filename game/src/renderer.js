// WebGL2 3D renderer: atmospheric sky, multi-biome terrain, ocean waves, aircraft, rings, and contrails.
import {
  clamp,
  DEG2RAD,
  mat4FromPosQuatScale,
  mat4Identity,
  mat4LookAt,
  mat4Mul,
  mat4Perspective,
  quatBasis,
  quatFromAxisAngle,
  quatMul,
  vAdd,
  vNorm,
  vScale,
} from './math3d.js';
import { buildCloudField, buildRunwayMeshes, buildTerrainMesh, WORLD_RADIUS } from './terrain.js';
import { buildKestrelAircraft, buildRingMesh } from './aircraft-mesh.js';

const LIGHTING_THEMES = {
  golden: {
    sunDir: vNorm({ x: 0.58, y: 0.34, z: -0.74 }),
    sunColor: [1.0, 0.86, 0.66],
    skyZenith: [0.11, 0.28, 0.56],
    skyHorizon: [0.76, 0.62, 0.52],
    fogColor: [0.68, 0.63, 0.62],
  },
  midday: {
    sunDir: vNorm({ x: 0.42, y: 0.72, z: -0.55 }),
    sunColor: [1.0, 0.96, 0.88],
    skyZenith: [0.09, 0.34, 0.72],
    skyHorizon: [0.58, 0.78, 0.92],
    fogColor: [0.56, 0.74, 0.88],
  },
  sunset: {
    sunDir: vNorm({ x: -0.52, y: 0.22, z: -0.82 }),
    sunColor: [1.0, 0.58, 0.34],
    skyZenith: [0.09, 0.14, 0.34],
    skyHorizon: [0.82, 0.44, 0.34],
    fogColor: [0.64, 0.45, 0.44],
  },
};

const SKY_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos, 0.9999, 1.0);
}`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform mat4 uInvViewProj;
uniform vec3 uSunDir;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSunColor;
out vec4 outColor;
void main() {
  vec4 farPt = uInvViewProj * vec4(vUv, 1.0, 1.0);
  vec4 nearPt = uInvViewProj * vec4(vUv, -1.0, 1.0);
  vec3 dir = normalize(farPt.xyz / farPt.w - nearPt.xyz / nearPt.w);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(h, 0.52));
  float sunAmt = max(dot(dir, uSunDir), 0.0);
  sky += uSunColor * pow(sunAmt, 12.0) * 0.38;
  sky += uSunColor * smoothstep(0.9985, 0.9997, sunAmt) * 1.4;
  if (dir.y < 0.0) {
    sky = mix(uSkyHorizon, vec3(0.06, 0.16, 0.26), clamp(-dir.y * 4.0, 0.0, 1.0));
  }
  outColor = vec4(sky, 1.0);
}`;

const TERRAIN_VS = `#version 300 es
in vec3 aPos;
in vec3 aNorm;
uniform mat4 uViewProj;
out vec3 vWorldPos;
out vec3 vNorm;
void main() {
  vWorldPos = aPos;
  vNorm = aNorm;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const TERRAIN_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform vec3 uSkyHorizon;
out vec4 outColor;

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
    mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec3 n = normalize(vNorm);
  float h = vWorldPos.y;
  float slope = 1.0 - n.y;
  float detail = (smoothNoise(vWorldPos.xz * 0.028) * 0.65 + smoothNoise(vWorldPos.xz * 0.095) * 0.35 - 0.5) * 0.09;
  float strata = sin(h * 0.24 + smoothNoise(vWorldPos.xz * 0.015) * 3.0) * 0.03;

  // Multi-biome ground palette: wet sand -> lush meadow -> pine forest -> granite cliff -> snow cap
  vec3 sand = vec3(0.76, 0.70, 0.54);
  vec3 grass = vec3(0.20, 0.43, 0.22);
  vec3 forest = vec3(0.10, 0.27, 0.16);
  vec3 rock = vec3(0.38, 0.36, 0.37);
  vec3 snow = vec3(0.92, 0.95, 0.98);

  vec3 base = grass;
  base = mix(sand, grass, smoothstep(2.0, 16.0, h));
  base = mix(base, forest, smoothstep(75.0, 185.0, h));
  base = mix(base, rock, smoothstep(240.0, 410.0, h));
  base = mix(base, snow, smoothstep(420.0, 560.0, h) * (1.0 - smoothstep(0.28, 0.55, slope)));
  // Sheer canyon cliffs always expose granite rock with subtle strata
  base = mix(base, rock * (0.85 + strata), smoothstep(0.22, 0.50, slope));
  base += detail;

  float diff = max(dot(n, uSunDir), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 lit = base * (uSunColor * diff * 0.95 + uSkyHorizon * hemi * 0.42 + vec3(0.08, 0.11, 0.14));

  float dist = length(vWorldPos - uCameraPos);
  float fog = 1.0 - exp(-pow(dist / 5800.0, 1.55));
  vec3 col = mix(lit, uFogColor, clamp(fog, 0.0, 1.0));
  outColor = vec4(col, 1.0);
}`;

const WATER_VS = `#version 300 es
in vec3 aPos;
uniform mat4 uViewProj;
out vec3 vWorldPos;
void main() {
  vWorldPos = aPos;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const WATER_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform float uTime;
out vec4 outColor;

void main() {
  vec2 p = vWorldPos.xz * 0.045;
  float w1 = sin(p.x * 1.4 + uTime * 1.8) * cos(p.y * 1.1 - uTime * 1.3);
  float w2 = sin(p.x * 3.1 - uTime * 2.4 + p.y * 2.7);
  vec3 n = normalize(vec3((w1 + w2 * 0.5) * 0.08, 1.0, (w2 - w1 * 0.6) * 0.08));

  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.4);
  vec3 deep = vec3(0.03, 0.17, 0.28);
  vec3 shallow = vec3(0.06, 0.34, 0.42);
  vec3 waterCol = mix(deep, shallow, clamp(0.4 + 0.3 * w1, 0.0, 1.0));
  vec3 reflCol = mix(uSkyHorizon, uSkyZenith, 0.35);
  vec3 col = mix(waterCol, reflCol, clamp(fresnel * 0.82, 0.05, 0.88));

  vec3 halfVec = normalize(uSunDir + viewDir);
  float spec = pow(max(dot(n, halfVec), 0.0), 96.0);
  col += uSunColor * spec * 1.15;

  float dist = length(vWorldPos - uCameraPos);
  float fog = 1.0 - exp(-pow(dist / 5800.0, 1.55));
  outColor = vec4(mix(col, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
}`;

const MESH_VS = `#version 300 es
in vec3 aPos;
in vec3 aNorm;
in vec3 aCol;
uniform mat4 uModel;
uniform mat4 uViewProj;
out vec3 vWorldPos;
out vec3 vNorm;
out vec3 vCol;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNorm = mat3(uModel) * aNorm;
  vCol = aCol;
  gl_Position = uViewProj * wp;
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNorm;
in vec3 vCol;
uniform vec3 uCameraPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform vec3 uTint;
uniform float uEmissive;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNorm);
  float diff = max(dot(n, uSunDir), 0.0);
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  vec3 halfVec = normalize(uSunDir + viewDir);
  float spec = pow(max(dot(n, halfVec), 0.0), 36.0) * 0.35;
  vec3 base = vCol * uTint;
  vec3 lit = base * (uSunColor * diff * 0.92 + vec3(0.32, 0.36, 0.42)) + uSunColor * spec;
  lit = mix(lit, base, clamp(uEmissive, 0.0, 1.0));
  float dist = length(vWorldPos - uCameraPos);
  float fog = 1.0 - exp(-pow(dist / 6400.0, 1.55));
  outColor = vec4(mix(lit, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
}`;

function compileProgram(gl, vsSrc, fsSrc) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'Shader compile error');
    }
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'Program link error');
  }
  return prog;
}

function invertMat4(m) {
  const out = new Float32Array(16);
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return mat4Identity();
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export class FlightRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;

    this.skyProg = compileProgram(gl, SKY_VS, SKY_FS);
    this.terrainProg = compileProgram(gl, TERRAIN_VS, TERRAIN_FS);
    this.waterProg = compileProgram(gl, WATER_VS, WATER_FS);
    this.meshProg = compileProgram(gl, MESH_VS, MESH_FS);

    this.skyVao = this.createQuadVao();
    this.terrainVao = this.uploadTerrainMesh(buildTerrainMesh(192));
    this.waterVao = this.uploadWaterMesh();
    this.runwayVao = this.uploadColorMesh(buildRunwayMeshes());
    this.cloudVao = this.uploadColorMesh(buildCloudField(23));
    this.ringVao = this.uploadColorMesh(buildRingMesh(1.0, 0.085, [1.0, 1.0, 1.0]));

    const jet = buildKestrelAircraft();
    this.aircraftVaos = {
      hull: this.uploadColorMesh(jet.hull),
      leftAileron: this.uploadColorMesh(jet.leftAileron),
      rightAileron: this.uploadColorMesh(jet.rightAileron),
      flaps: this.uploadColorMesh(jet.flaps),
      gear: this.uploadColorMesh(jet.gear),
      flame: this.uploadColorMesh(jet.flame),
    };

    // Contrail ribbon geometry updated dynamically
    this.trailPoints = [];
    this.trailVao = gl.createVertexArray();
    this.trailVbo = gl.createBuffer();
    this.trailNormVbo = gl.createBuffer();
    this.trailColVbo = gl.createBuffer();
    this.trailIdxVbo = gl.createBuffer();
  }

  createQuadVao() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.skyProg, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  uploadTerrainMesh(mesh) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.terrainProg, 'aPos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    const normBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    const normLoc = gl.getAttribLocation(this.terrainProg, 'aNorm');
    gl.enableVertexAttribArray(normLoc);
    gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: mesh.indices.length };
  }

  uploadWaterMesh() {
    const gl = this.gl;
    const s = WORLD_RADIUS * 1.4;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s,
    ]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.waterProg, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 2, 1, 0, 3, 2]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: 6 };
  }

  uploadColorMesh(mesh) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const bindAttr = (name, data) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(this.meshProg, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      }
    };
    bindAttr('aPos', mesh.positions);
    bindAttr('aNorm', mesh.normals);
    bindAttr('aCol', mesh.colors);

    const idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: mesh.indices.length };
  }

  resize(width, height, dpr) {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  recordTrail(flight) {
    if (flight.iasKnots < 90 || flight.crashed) return;
    const { right, up } = quatBasis(flight.quat);
    const pL = vAdd(flight.pos, vAdd(vScale(right, -6.15), vScale(up, -0.06)));
    const pR = vAdd(flight.pos, vAdd(vScale(right, 6.15), vScale(up, -0.06)));
    this.trailPoints.push({ l: pL, r: pR, t: flight.time });
    if (this.trailPoints.length > 34) this.trailPoints.shift();
  }

  resetTrail() {
    this.trailPoints = [];
  }

  drawColorMesh(meshHandle, modelMat, viewProj, camPos, theme, tint = [1, 1, 1], emissive = 0) {
    const gl = this.gl;
    gl.useProgram(this.meshProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProg, 'uModel'), false, modelMat);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProg, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uCameraPos'), [camPos.x, camPos.y, camPos.z]);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uSunDir'), [theme.sunDir.x, theme.sunDir.y, theme.sunDir.z]);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uSunColor'), theme.sunColor);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uFogColor'), theme.fogColor);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uTint'), tint);
    gl.uniform1f(gl.getUniformLocation(this.meshProg, 'uEmissive'), emissive);
    gl.bindVertexArray(meshHandle.vao);
    gl.drawElements(gl.TRIANGLES, meshHandle.count, gl.UNSIGNED_INT, 0);
  }

  render(flight, camera, missionState, timeOfDay = 'golden') {
    const gl = this.gl;
    const theme = LIGHTING_THEMES[timeOfDay] ?? LIGHTING_THEMES.golden;
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const proj = mat4Perspective(camera.fovDeg * DEG2RAD, aspect, 0.8, 13000);
    const view = mat4LookAt(camera.pos, camera.target, camera.up);
    const viewProj = mat4Mul(proj, view);
    const invViewProj = invertMat4(viewProj);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(theme.fogColor[0], theme.fogColor[1], theme.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1. Sky Dome
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.skyProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.skyProg, 'uInvViewProj'), false, invViewProj);
    gl.uniform3fv(gl.getUniformLocation(this.skyProg, 'uSunDir'), [theme.sunDir.x, theme.sunDir.y, theme.sunDir.z]);
    gl.uniform3fv(gl.getUniformLocation(this.skyProg, 'uSkyZenith'), theme.skyZenith);
    gl.uniform3fv(gl.getUniformLocation(this.skyProg, 'uSkyHorizon'), theme.skyHorizon);
    gl.uniform3fv(gl.getUniformLocation(this.skyProg, 'uSunColor'), theme.sunColor);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);

    // 2. Water Plane
    gl.useProgram(this.waterProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.waterProg, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.waterProg, 'uCameraPos'), [camera.pos.x, camera.pos.y, camera.pos.z]);
    gl.uniform3fv(gl.getUniformLocation(this.waterProg, 'uSunDir'), [theme.sunDir.x, theme.sunDir.y, theme.sunDir.z]);
    gl.uniform3fv(gl.getUniformLocation(this.waterProg, 'uSunColor'), theme.sunColor);
    gl.uniform3fv(gl.getUniformLocation(this.waterProg, 'uFogColor'), theme.fogColor);
    gl.uniform3fv(gl.getUniformLocation(this.waterProg, 'uSkyZenith'), theme.skyZenith);
    gl.uniform3fv(gl.getUniformLocation(this.waterProg, 'uSkyHorizon'), theme.skyHorizon);
    gl.uniform1f(gl.getUniformLocation(this.waterProg, 'uTime'), flight.time);
    gl.bindVertexArray(this.waterVao.vao);
    gl.drawElements(gl.TRIANGLES, this.waterVao.count, gl.UNSIGNED_SHORT, 0);

    // 3. Terrain
    gl.useProgram(this.terrainProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.terrainProg, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uCameraPos'), [camera.pos.x, camera.pos.y, camera.pos.z]);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uSunDir'), [theme.sunDir.x, theme.sunDir.y, theme.sunDir.z]);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uSunColor'), theme.sunColor);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uFogColor'), theme.fogColor);
    gl.uniform3fv(gl.getUniformLocation(this.terrainProg, 'uSkyHorizon'), theme.skyHorizon);
    gl.bindVertexArray(this.terrainVao.vao);
    gl.drawElements(gl.TRIANGLES, this.terrainVao.count, gl.UNSIGNED_INT, 0);

    // 4. Runways & Clouds
    const identity = mat4Identity();
    this.drawColorMesh(this.runwayVao, identity, viewProj, camera.pos, theme, [1, 1, 1], 0.14);
    this.drawColorMesh(this.cloudVao, identity, viewProj, camera.pos, theme, [1, 1, 1], 0.25);

    // 5. Mission Rings
    gl.disable(gl.CULL_FACE);
    for (const ring of missionState.rings) {
      if (ring.cleared) continue;
      const isNext = ring.index === missionState.nextRingIndex;
      const qRing = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, -ring.yawDeg * DEG2RAD);
      const pulse = isNext ? 1.0 + Math.sin(flight.time * 4.5) * 0.04 : 0.92;
      const ringMat = mat4FromPosQuatScale(ring, qRing, ring.radius * pulse);
      const tint = isNext ? [0.22, 0.95, 1.0] : [1.0, 0.65, 0.18];
      this.drawColorMesh(this.ringVao, ringMat, viewProj, camera.pos, theme, tint, isNext ? 0.85 : 0.55);
    }
    gl.enable(gl.CULL_FACE);

    // 6. Kestrel Aircraft (skip hull in cockpit view so canopy view stays unobstructed)
    if (camera.mode !== 'cockpit') {
      const baseMat = mat4FromPosQuatScale(flight.pos, flight.quat, 1.0);
      this.drawColorMesh(this.aircraftVaos.hull, baseMat, viewProj, camera.pos, theme, [1, 1, 1], 0.0);

      // Animated ailerons & flaps
      const aileronDeflect = clamp(flight.stick.roll * 0.45, -0.5, 0.5);
      const hingeMat = (offsetZ, angleX) => {
        const localQ = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, angleX);
        const worldQ = quatMul(flight.quat, localQ);
        const basis = quatBasis(flight.quat);
        const p = vAdd(flight.pos, vScale(basis.forward, -offsetZ));
        return mat4FromPosQuatScale(p, worldQ, 1.0);
      };
      this.drawColorMesh(this.aircraftVaos.leftAileron, hingeMat(2.25, -aileronDeflect), viewProj, camera.pos, theme);
      this.drawColorMesh(this.aircraftVaos.rightAileron, hingeMat(2.25, aileronDeflect), viewProj, camera.pos, theme);
      this.drawColorMesh(this.aircraftVaos.flaps, hingeMat(2.15, flight.flapsDown ? 0.52 : 0.0), viewProj, camera.pos, theme);

      if (flight.gearDown) {
        this.drawColorMesh(this.aircraftVaos.gear, baseMat, viewProj, camera.pos, theme);
      }

      // Dynamic engine afterburner plume
      if (flight.fuel > 0 && flight.rpm > 0.15) {
        const basis = quatBasis(flight.quat);
        const flamePos = vAdd(flight.pos, vScale(basis.forward, -4.55));
        const flameLen = 0.35 + flight.rpm * 0.62 + (flight.rpm > 0.85 ? 0.35 : 0);
        const flameMat = mat4FromPosQuatScale(flamePos, flight.quat, {
          x: 0.72 + flight.rpm * 0.25,
          y: 0.72 + flight.rpm * 0.25,
          z: flameLen,
        });
        const flameTint = flight.rpm > 0.85 ? [0.55, 0.88, 1.0] : [1.0, 0.65, 0.20];
        this.drawColorMesh(this.aircraftVaos.flame, flameMat, viewProj, camera.pos, theme, flameTint, 0.98);
      }
    }

    // 7. Wingtip Contrail Ribbons
    this.drawContrails(viewProj, theme);
  }

  drawContrails(viewProj, theme) {
    if (this.trailPoints.length < 2) return;
    const gl = this.gl;
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];

    for (const side of ['l', 'r']) {
      const base = positions.length / 3;
      for (let i = 0; i < this.trailPoints.length; i += 1) {
        const pt = this.trailPoints[i][side];
        const alpha = i / (this.trailPoints.length - 1);
        const w = 0.085 * alpha;
        positions.push(pt.x - w, pt.y, pt.z, pt.x + w, pt.y, pt.z);
        normals.push(0, 1, 0, 0, 1, 0);
        const c = 0.52 + 0.45 * alpha;
        colors.push(c * 0.85, c * 0.93, c, c * 0.85, c * 0.93, c);
        if (i < this.trailPoints.length - 1) {
          const row = base + i * 2;
          indices.push(row, row + 1, row + 2, row + 1, row + 3, row + 2);
        }
      }
    }

    gl.useProgram(this.meshProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProg, 'uModel'), false, mat4Identity());
    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProg, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uFogColor'), theme.fogColor);
    gl.uniform3fv(gl.getUniformLocation(this.meshProg, 'uTint'), [1, 1, 1]);
    gl.uniform1f(gl.getUniformLocation(this.meshProg, 'uEmissive'), 0.92);

    gl.bindVertexArray(this.trailVao);
    const upload = (vbo, name, arr) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
      const loc = gl.getAttribLocation(this.meshProg, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      }
    };
    upload(this.trailVbo, 'aPos', positions);
    upload(this.trailNormVbo, 'aNorm', normals);
    upload(this.trailColVbo, 'aCol', colors);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.trailIdxVbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.DYNAMIC_DRAW);

    gl.disable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
    gl.enable(gl.CULL_FACE);
  }
}
