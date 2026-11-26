// Hand-rolled WebGL1 renderer: valley terrain, animated water, sky dome,
// PCF shadow map, merged-geometry jet/trees/houses, rings, fires, clouds.
// No libraries, no network. Deterministic: every animated value is a pure
// function of state.elapsed (frozen in shot mode).
import { CFG } from './config.js';
import { clamp, lerp, sstep } from './random.js';

const VERT_LIT = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uProj, uView, uShadow, uModel; uniform vec3 uSunDir, uSunCol, uAmb; uniform float uEmissive;
varying vec3 vCol; varying vec3 vNor; varying vec3 vWorld; varying vec4 vShadow;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz; vNor = aNor; vCol = aCol;
  vShadow = uShadow * w;
  gl_Position = uProj * uView * w;
}`;
const FRAG_LIT = `
precision mediump float;
uniform vec3 uSunDir, uSunCol, uAmb, uFogCol, uCam; uniform float uEmissive, uFogK;
uniform sampler2D uShadowTex;
varying vec3 vCol; varying vec3 vNor; varying vec3 vWorld; varying vec4 vShadow;
float shadow(){
  vec3 sc = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
  float s = 0.0; vec2 t = vec2(1.0 / 512.0);
  for (int i = -1; i <= 0; i++) for (int j = -1; j <= 0; j++) {
    float d = texture2D(uShadowTex, sc.xy + vec2(float(i), float(j)) * t).r;
    s += sc.z - 0.002 > d ? 0.25 : 1.0;
  }
  return s * 0.25;
}
void main(){
  vec3 n = normalize(vNor);
  float diff = max(dot(n, uSunDir), 0.0);
  vec3 h = normalize(uSunDir + normalize(uCam - vWorld));
  float spec = pow(max(dot(n, h), 0.0), 60.0) * 0.18;
  float sh = shadow();
  vec3 lit = vCol * (uAmb + uSunCol * diff * sh) + uSunCol * spec * sh;
  lit = mix(lit, vCol * 1.15, uEmissive);
  vec3 c = 1.0 - exp(-lit * 1.25);
  c = pow(c, vec3(0.85));
  float d = distance(uCam, vWorld);
  float f = 1.0 - exp(-pow(d * uFogK, 2.0));
  gl_FragColor = vec4(mix(c, uFogCol, f), 1.0);
}`;
const VERT_DEPTH = `
attribute vec3 aPos; uniform mat4 uMVP;
void main(){ gl_Position = uMVP * vec4(aPos, 1.0); }`;
const FRAG_DEPTH = `
precision mediump float;
void main(){ gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`;
const VERT_WATER = `
attribute vec3 aPos; uniform mat4 uProj, uView; uniform float uTime;
varying vec3 vWorld; varying float vWave;
void main(){
  vec3 p = aPos;
  float w = sin(p.x * 0.05 + uTime * 1.4) * 0.35 + sin(p.z * 0.07 - uTime * 1.1) * 0.3 + sin((p.x + p.z) * 0.03 + uTime * 0.7) * 0.4;
  p.y += w; vWave = w; vWorld = p;
  gl_Position = uProj * uView * vec4(p, 1.0);
}`;
const FRAG_WATER = `
precision mediump float;
uniform vec3 uSunDir, uSunCol, uFogCol, uCam, uDeep, uShallow; uniform float uTime, uFogK;
varying vec3 vWorld; varying float vWave;
void main(){
  vec3 v = normalize(uCam - vWorld);
  float fres = pow(1.0 - max(v.y, 0.0), 3.0);
  vec3 col = mix(uDeep, uShallow, clamp(vWave * 0.5 + 0.5, 0.0, 1.0));
  col = mix(col, vec3(0.95, 0.85, 0.65), fres * 0.55);
  vec3 h = normalize(uSunDir + v);
  float g = pow(max(dot(vec3(0.0, 1.0, 0.0), h), 0.0), 90.0);
  col += uSunCol * g * 1.4;
  vec3 c = 1.0 - exp(-col * 1.3);
  float d = distance(uCam, vWorld);
  float f = 1.0 - exp(-pow(d * uFogK, 2.0));
  gl_FragColor = vec4(mix(pow(c, vec3(0.85)), uFogCol, f), 1.0);
}`;
const VERT_SKY = `
attribute vec3 aPos; uniform mat4 uProj, uView;
varying vec3 vDir;
void main(){
  vDir = aPos;
  vec4 p = uProj * uView * vec4(aPos, 1.0);
  gl_Position = p.xyww;
}`;
const FRAG_SKY = `
precision mediump float;
uniform vec3 uZen, uHor, uSunDir, uSunCol; uniform float uNight, uTime;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uHor, uZen, pow(t, 1.5));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(s, 350.0) * 1.6 + pow(s, 24.0) * 0.6 + pow(s, 6.0) * 0.18);
  if (uNight > 0.5) {
    vec2 sp = d.xz / (0.25 + abs(d.y));
    float st = step(0.9985, hash(floor(sp * 90.0)));
    col += vec3(st * 0.7);
  }
  col = 1.0 - exp(-col * 1.15);
  gl_FragColor = vec4(pow(col, vec3(0.85)), 1.0);
}`;
const VERT_BILL = `
attribute vec3 aPos; attribute vec2 aUv; uniform mat4 uProj, uView; uniform vec3 uRight, uUp, uCenter; uniform float uScale; uniform vec2 uSquash;
varying vec2 vUv;
void main(){
  vec3 p = uCenter + uRight * (aUv.x * uScale * uSquash.x) + uUp * (aUv.y * uScale * uSquash.y);
  vUv = aUv;
  gl_Position = uProj * uView * vec4(p, 1.0);
}`;
const FRAG_CLOUD = `
precision mediump float;
uniform vec3 uFogCol; uniform float uAlpha, uTime; uniform vec2 uSeed;
varying vec2 vUv;
void main(){
  float r = length(vUv);
  float a = smoothstep(1.0, 0.25, r) * uAlpha;
  float n = 0.75 + 0.25 * sin(vUv.x * 9.0 + uTime * 0.2 + uSeed.x * 7.0);
  gl_FragColor = vec4(uFogCol * n, a);
}`;
const FRAG_FIRE = `
precision mediump float;
uniform float uTime; uniform vec2 uSeed;
varying vec2 vUv;
void main(){
  float r = length(vUv * vec2(1.0, 1.35));
  float flick = 0.8 + 0.2 * sin(uTime * 9.0 + uSeed.x * 20.0 + vUv.y * 6.0);
  float a = smoothstep(1.0, 0.1, r) * flick;
  vec3 col = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.75, 0.2), clamp(1.0 - r, 0.0, 1.0));
  gl_FragColor = vec4(col * 1.6, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
function mesh(gl, pos, nor, col, idx) {
  const m = { n: idx.length };
  const mk = (arr, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return { b, size }; };
  m.pos = mk(pos, 3); m.nor = mk(nor, 3); m.col = mk(col, 3);
  m.idx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  return m;
}
function bindMesh(gl, prog, m) {
  const bind = (attr, name) => {
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, attr.b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, attr.size, gl.FLOAT, false, 0, 0);
  };
  bind(m.pos, 'aPos'); bind(m.nor, 'aNor'); bind(m.col, 'aCol');
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
}
function mat4persp(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function mat4look(eye, at, up) {
  let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
}
function mat4mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function mat4ortho(l, r, b, t, n, f) {
  return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1];
}

// ---- geometry builders ------------------------------------------------------
class MB {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  v(x, y, z, nx, ny, nz, r, g, b) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  // axis-aligned box, rotated around Y by rot
  box(cx, cy, cz, sx, sy, sz, col, rot = 0) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const rotP = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces = [
      [[hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [-hx, -hy, hz], [0, 0, 1]],
      [[-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz], [0, 0, -1]],
      [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz], [1, 0, 0]],
      [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz], [-1, 0, 0]],
      [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [0, 1, 0]],
      [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [0, -1, 0]],
    ];
    for (const f of faces) {
      const [r, g, b] = col;
      const n = [f[4][0] * cs + f[4][2] * sn, f[4][1], -f[4][0] * sn + f[4][2] * cs];
      const idx = f.slice(0, 4).map((v) => { const q = rotP(v[0], v[1], v[2]); return this.v(q[0], q[1], q[2], n[0], n[1], n[2], r, g, b); });
      this.quad(idx[0], idx[1], idx[2], idx[3]);
    }
  }
  // flat swept wing: a thin box sheared back along -Z as |x| grows
  wing(cx, cy, cz, span, chord, th, sweep, col) {
    const [r, g, b] = col;
    const hw = span / 2, hc = chord / 2;
    const pts = [
      [-hw, -th / 2, -hc + sweep], [hw, -th / 2, -hc + sweep], [hw, -th / 2, hc + sweep * 0.4], [-hw, -th / 2, hc + sweep * 0.4],
      [-hw, th / 2, -hc + sweep], [hw, th / 2, -hc + sweep], [hw, th / 2, hc + sweep * 0.4], [-hw, th / 2, hc + sweep * 0.4],
    ];
    const idx = pts.map((v) => this.v(cx + v[0], cy + v[1], cz + v[2], 0, 1, 0, r, g, b));
    this.quad(idx[4], idx[5], idx[6], idx[7]);
    this.quad(idx[0], idx[3], idx[2], idx[1]);
    this.quad(idx[1], idx[2], idx[6], idx[5]);
    this.quad(idx[0], idx[4], idx[7], idx[3]);
    this.quad(idx[3], idx[7], idx[6], idx[2]);
    this.quad(idx[0], idx[1], idx[5], idx[4]);
  }
  // cone with apex (ax,ay,az), base centre (bx,by,bz), radius, sides
  cone(ax, ay, az, bx, by, bz, rad, sides, col) {
    const [r, g, b] = col;
    const apex = this.v(ax, ay, az, 0, 1, 0, r, g, b);
    const base = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const x = bx + Math.cos(a) * rad, z = bz + Math.sin(a) * rad;
      const nx = Math.cos(a), nz = Math.sin(a);
      base.push(this.v(x, by, z, nx * 0.7, 0.5, nz * 0.7, r * 0.9, g * 0.9, b * 0.9));
    }
    for (let i = 0; i < sides; i++) this.tri(apex, base[(i + 1) % sides], base[i]);
  }
  // gable-roof house: box + roof prism
  house(x, y, z, w, d, h, rot, roofCol, wallCol) {
    this.box(x, y + h / 2, z, w, h, d, wallCol, rot);
    const [r, g, b] = roofCol;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const rp = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
    const hw = w / 2 + 0.6, hd = d / 2 + 0.6, rh = h + 3.2;
    const ridge = [rp(-hw, rh, 0), rp(hw, rh, 0)];
    const e1 = [rp(-hw, h, -hd), rp(-hw, h, hd), rp(hw, h, hd), rp(hw, h, -hd)];
    const ridgeIdx = ridge.map((v) => this.v(v[0], v[1], v[2], 0, 1, 0, r, g, b));
    const eIdx = e1.map((v) => this.v(v[0], v[1], v[2], 0, 1, 0, r, g, b));
    this.quad(eIdx[0], ridgeIdx[0], ridgeIdx[1], eIdx[3]);
    this.quad(eIdx[1], eIdx[2], ridgeIdx[1], ridgeIdx[0]);
    this.tri(eIdx[0], eIdx[1], ridgeIdx[0]);
    this.tri(eIdx[3], ridgeIdx[1], eIdx[2]);
  }
  torus(cx, cy, cz, R, tube, col, seg = 16, rad = 5) {
    const [r, g, b] = col;
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= rad; j++) {
        const b2 = (j / rad) * Math.PI * 2;
        const cb = Math.cos(b2), sb = Math.sin(b2);
        const x = cx + (R + tube * cb) * ca, y = cy + tube * sb, z = cz + (R + tube * cb) * sa;
        idx.push(this.v(x, y, z, cb * ca, sb, cb * sa, r, g, b));
      }
    }
    for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j, b2 = (i + 1) * (rad + 1) + j;
      this.quad(a, b2, b2 + 1, a + 1);
    }
  }
  build(gl) { return mesh(gl, this.p, this.n, this.c, this.i); }
}

// ---- the renderer -----------------------------------------------------------
const DAY = {
  golden: { sunDir: [0.55, 0.30, 0.45], sunCol: [1.0, 0.66, 0.34], amb: [0.40, 0.37, 0.36], zen: [0.25, 0.38, 0.75], hor: [1.2, 0.5, 0.1], fog: [1.0, 0.68, 0.42], fogK: 0.00017, deep: [0.05, 0.22, 0.30], shallow: [0.20, 0.55, 0.55], night: 0 },
  dusk: { sunDir: [-0.7, 0.2, -0.4], sunCol: [1.0, 0.5, 0.28], amb: [0.28, 0.26, 0.32], zen: [0.22, 0.28, 0.55], hor: [0.95, 0.45, 0.25], fog: [0.85, 0.55, 0.38], fogK: 0.00024, deep: [0.05, 0.16, 0.24], shallow: [0.25, 0.4, 0.45], night: 0 },
  night: { sunDir: [0.4, 0.65, -0.3], sunCol: [0.5, 0.62, 0.9], amb: [0.16, 0.18, 0.26], zen: [0.03, 0.05, 0.14], hor: [0.12, 0.14, 0.28], fog: [0.10, 0.12, 0.24], fogK: 0.0003, deep: [0.03, 0.08, 0.14], shallow: [0.08, 0.16, 0.22], night: 1 },
};

export function createRenderer(canvas, world) {
  const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('no WebGL');
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const litProg = program(gl, VERT_LIT, FRAG_LIT);
  const depthProg = program(gl, VERT_DEPTH, FRAG_DEPTH);
  const waterProg = program(gl, VERT_WATER, FRAG_WATER);
  const skyProg = program(gl, VERT_SKY, FRAG_SKY);
  const cloudProg = program(gl, VERT_BILL, FRAG_CLOUD);
  const fireProg = program(gl, VERT_BILL, FRAG_FIRE);

  const U = (p, n) => gl.getUniformLocation(p, n);
  const uni = {};
  for (const p of [litProg, depthProg, waterProg, skyProg, cloudProg, fireProg]) {
    uni[p === litProg ? 'lit' : p === depthProg ? 'depth' : p === waterProg ? 'water' : p === skyProg ? 'sky' : p === cloudProg ? 'cloud' : 'fire'] = p;
  }
  const LU = {};
  for (const n of ['uProj', 'uView', 'uShadow', 'uModel', 'uSunDir', 'uSunCol', 'uAmb', 'uEmissive', 'uFogCol', 'uCam', 'uFogK', 'uShadowTex']) LU[n] = U(litProg, n);
  const WU = {};
  for (const n of ['uProj', 'uView', 'uTime', 'uSunDir', 'uSunCol', 'uFogCol', 'uCam', 'uDeep', 'uShallow', 'uFogK']) WU[n] = U(waterProg, n);
  const SU = {};
  for (const n of ['uProj', 'uView', 'uZen', 'uHor', 'uSunDir', 'uSunCol', 'uNight', 'uTime']) SU[n] = U(skyProg, n);

  // ---- terrain mesh ---------------------------------------------------------
  const GX = 140, GZ = 160, X0 = -2200, X1 = 2200, Z0 = -2800, Z1 = 2800;
  const tp = [], tn = [], tc = [], ti = [];
  const hAt = (i, j) => world.terrainHeight(X0 + (i / GX) * (X1 - X0), Z0 + (j / GZ) * (Z1 - Z0));
  const HG = [];
  for (let j = 0; j <= GZ; j++) { HG.push([]); for (let i = 0; i <= GX; i++) HG[j].push(hAt(i, j)); }
  for (let j = 0; j <= GZ; j++) {
    for (let i = 0; i <= GX; i++) {
      const x = X0 + (i / GX) * (X1 - X0), z = Z0 + (j / GZ) * (Z1 - Z0), h = HG[j][i];
      const hx = (HG[j][Math.min(i + 1, GX)] - HG[j][Math.max(i - 1, 0)]) / (2 * (X1 - X0) / GX);
      const hz = (HG[Math.min(j + 1, GZ)][i] - HG[Math.max(j - 1, 0)][i]) / (2 * (Z1 - Z0) / GZ);
      const il = 1 / Math.hypot(hx, 1, hz);
      tp.push(x, h, z); tn.push(-hx * il, il, -hz * il);
      const c = world.terrainColor(x, z, h); tc.push(c[0], c[1], c[2]);
    }
  }
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
    const a = j * (GX + 1) + i, b = a + 1, c = a + GX + 1, d = c + 1;
    ti.push(a, c, b, b, c, d);
  }
  const terrain = mesh(gl, tp, tn, tc, ti);

  // ---- water: sea plane + river ribbon --------------------------------------
  const wp = [], wn = [], wc = [], wi = [];
  const wv = (x, z, k) => { wp.push(x, CFG.waterLevel, z); wn.push(0, 1, 0); wc.push(0.1, 0.4, 0.45); return k; };
  let vk = 0;
  for (let j = 0; j <= 12; j++) for (let i = 0; i <= 20; i++) {
    wv(-2200 + (i / 20) * 4400, 1400 + (j / 12) * 1600, vk++);
  }
  for (let j = 0; j < 12; j++) for (let i = 0; i < 20; i++) {
    const a = j * 21 + i, b = a + 1, c = a + 21, d = c + 1;
    wi.push(a, b, c, b, d, c);
  }
  const riverBase = 21 * 13;
  for (let j = 0; j <= 78; j++) {
    const z = -1500 + (j / 78) * 2950;
    const rx = world.riverX(z);
    wv(rx - 36, z, riverBase + j * 2); wv(rx + 36, z, riverBase + j * 2 + 1);
  }
  for (let j = 0; j < 78; j++) {
    const a = riverBase + j * 2, b = a + 1, c = a + 2, d = a + 3;
    wi.push(a, c, b, b, c, d);
  }
  const water = mesh(gl, wp, wn, wc, wi);

  // ---- sky dome ---------------------------------------------------------------
  const sp = [], sn = [], sc = [], si = [];
  const SLAT = 10, SLON = 18;
  for (let j = 0; j <= SLAT; j++) {
    const th = (j / SLAT) * Math.PI;
    for (let i = 0; i <= SLON; i++) {
      const ph = (i / SLON) * Math.PI * 2;
      sp.push(Math.sin(th) * Math.cos(ph) * 8000, Math.cos(th) * 8000, Math.sin(th) * Math.sin(ph) * 8000);
      sn.push(0, 1, 0); sc.push(1, 1, 1);
    }
  }
  for (let j = 0; j < SLAT; j++) for (let i = 0; i < SLON; i++) {
    const a = j * (SLON + 1) + i, b = a + 1, c = a + SLON + 1, d = c + 1;
    si.push(a, b, c, b, d, c);
  }
  const sky = mesh(gl, sp, sn, sc, si);

  // ---- jet ----------------------------------------------------------------------
  const jb = new MB();
  const JET = [0.38, 0.40, 0.44], DARK = [0.45, 0.47, 0.50], CAN = [0.25, 0.42, 0.62];
  jb.box(0, 0, 0.4, 1.15, 1.0, 4.6, JET);
  jb.box(0, 0.15, -2.6, 0.7, 0.6, 1.6, JET); // nose taper block
  jb.box(0, 0.1, -3.35, 0.5, 0.42, 0.8, JET); // nose tip, stepped
  jb.box(0, 0.08, -3.75, 0.28, 0.26, 0.5, JET); // nose point
  jb.box(0, 0.66, -1.2, 0.95, 0.62, 1.9, CAN); // canopy, wider and taller
  jb.box(0, 0.88, -1.3, 0.55, 0.3, 1.1, CAN); // canopy crown
  jb.box(0, 0.55, 0.6, 0.5, 0.35, 2.4, DARK); // spine
  jb.wing(0, -0.1, 0.7, 6.8, 1.7, 0.16, 0.9, [0.32, 0.35, 0.40]); // main wing, darker than fuselage
  jb.wing(0, 0.05, 2.3, 3.4, 1.0, 0.14, 0.5, JET); // stabilators
  jb.box(-0.55, 0.55, 2.2, 0.14, 0.9, 1.2, [0.60, 0.62, 0.65]); // left fin
  jb.box(0.55, 0.55, 2.2, 0.14, 0.9, 1.2, [0.60, 0.62, 0.65]); // right fin
  jb.box(-0.62, -0.1, 0.9, 0.5, 0.5, 2.6, DARK); // left intake
  jb.box(0.62, -0.1, 0.9, 0.5, 0.5, 2.6, DARK); // right intake
  jb.box(-3.4, -0.1, 0.9, 0.5, 0.5, 1.1, JET); // left tip tank
  jb.box(3.4, -0.1, 0.9, 0.5, 0.5, 1.1, JET); // right tip tank
  const jet = jb.build(gl);
  const gb = new MB();
  gb.box(-0.62, -0.1, 2.75, 0.55, 0.55, 0.2, [0.95, 0.5, 0.12]);
  gb.box(0.62, -0.1, 2.75, 0.55, 0.55, 0.2, [0.95, 0.5, 0.12]);
  const jetGlow = gb.build(gl);
  // zone markers: flat orange annulus on the valley floor
  const zb = new MB();
  const zoneMeshes = [];
  for (const z of world.state.zones) {
    const m2 = new MB();
    const N = 16;
    const inner = [], outer = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      inner.push(m2.v(z.x + Math.cos(a) * 17, z.y + 0.6, z.z + Math.sin(a) * 17, 0, 1, 0, 1.0, 0.55, 0.15));
      outer.push(m2.v(z.x + Math.cos(a) * 22, z.y + 0.6, z.z + Math.sin(a) * 22, 0, 1, 0, 1.0, 0.55, 0.15));
    }
    for (let i = 0; i < N; i++) m2.quad(inner[i], outer[i], outer[i + 1], inner[i + 1]);
    zoneMeshes.push(m2.build(gl));
  }

  // ---- trees + houses (merged) ----------------------------------------------------
  const tb = new MB();
  for (const t of world.trees) {
    tb.box(t.x, t.y + 1.2, t.z, 1.4, 2.4, 1.4, [0.32, 0.22, 0.14], t.r);
    tb.cone(t.x, t.y + 5.2 * t.s, t.z, t.x, t.y + 2.2, t.z, 3.2 * t.s, 6, [0.16, 0.3, 0.14]);
    tb.cone(t.x, t.y + 7.6 * t.s, t.z, t.x, t.y + 4.6, t.z, 2.2 * t.s, 6, [0.2, 0.36, 0.16]);
  }
  const treesMesh = tb.build(gl);
  const hb = new MB();
  for (const h of world.houses) {
    hb.house(h.x, h.y, h.z, h.w, h.d, h.hgt, h.r, h.roof > 0.5 ? [0.55, 0.25, 0.16] : [0.6, 0.3, 0.18], [0.82, 0.78, 0.68]);
  }
  const housesMesh = hb.build(gl);

  // ---- strips -----------------------------------------------------------------------
  const sb = new MB();
  for (const s of world.strips) {
    const [r, g, b] = [0.16, 0.16, 0.18];
    const cs = Math.cos(s.heading), sn2 = Math.sin(s.heading);
    const corner = (a, c) => [s.x + a * cs + c * sn2, s.y + 0.3, s.z - a * sn2 + c * cs];
    const mk = (a, c, col) => { const q = corner(a, c); return sb.v(q[0], q[1], q[2], 0, 1, 0, col[0], col[1], col[2]); };
    const i0 = mk(-s.len / 2, -s.wid / 2, [r, g, b]), i1 = mk(s.len / 2, -s.wid / 2, [r, g, b]);
    const i2 = mk(s.len / 2, s.wid / 2, [r, g, b]), i3 = mk(-s.len / 2, s.wid / 2, [r, g, b]);
    sb.quad(i0, i1, i2, i3);
    for (let d = -s.len / 2 + 12; d < s.len / 2 - 8; d += 24) {
      const a0 = mk(d, -1.2, [0.9, 0.9, 0.85]), a1 = mk(d + 10, -1.2, [0.9, 0.9, 0.85]);
      const a2 = mk(d + 10, 1.2, [0.9, 0.9, 0.85]), a3 = mk(d, 1.2, [0.9, 0.9, 0.85]);
      sb.quad(a0, a1, a2, a3);
    }
  }
  const stripsMesh = sb.build(gl);
  const lb = new MB();
  for (const s of world.strips) {
    for (let d = -s.len / 2 + 6; d <= s.len / 2 - 6; d += 18) {
      for (const side of [-1, 1]) {
        const a = d, c = side * (s.wid / 2 + 2);
        const cs = Math.cos(s.heading), sn2 = Math.sin(s.heading);
        const x = s.x + a * cs + c * sn2, z = s.z - a * sn2 + c * cs;
        lb.box(x, s.y + 0.8, z, 1.2, 1.2, 1.2, [1.0, 0.8, 0.3]);
      }
    }
  }
  const lightsMesh = lb.build(gl);

  // ---- rings -------------------------------------------------------------------------
  const ringMeshes = [];
  for (const r of world.state.rings) {
    const rb = new MB();
    rb.torus(r.x, r.y, r.z, CFG.rings.radius, 0.9, [1.0, 0.75, 0.15]);
    ringMeshes.push(rb.build(gl));
  }
  const fuelMeshes = [];
  for (const r of world.state.fuelRings) {
    const rb = new MB();
    rb.torus(r.x, r.y, r.z, CFG.rings.radius, 0.9, [0.3, 0.9, 0.45]);
    fuelMeshes.push(rb.build(gl));
  }

  // ---- billboards: one unit quad --------------------------------------------------------
  const bp = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const bu = [-1, -1, 1, -1, 1, 1, -1, 1];
  const bi = [0, 1, 2, 0, 2, 3];
  const bn = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  const bc = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const bill = mesh(gl, bp, bn, bc, bi);
  const billUv = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, billUv);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bu), gl.STATIC_DRAW);

  const pb = new MB();
  pb.box(0, 0, 0, 3, 3, 3, [0.72, 0.58, 0.3]);
  const parcelMesh = pb.build(gl);
  const cb = new MB();
  cb.cone(0, 3, 0, 0, -1, 0, 4.5, 8, [1.0, 0.48, 0.18]);
  const chuteMesh = cb.build(gl);
  const bb = new MB();
  bb.box(0, 0, 0, 3, 3, 3, [0.25, 0.55, 0.95]);
  const blobMesh = bb.build(gl);
  const transMat = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

  // ---- shadow map -----------------------------------------------------------------------
  const SH = 512;
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SH, SH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const shadowFb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTex, 0);
  const shadowRb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, shadowRb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SH, SH);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shadowRb);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  let mode = 'chase';
  let W = 1280, H = 720;
  const renderer = {
    get cameraMode() { return mode; },
    set cameraMode(v) { mode = v === 'cockpit' ? 'cockpit' : 'chase'; },
    resize(w, h) { W = w; H = h; canvas.width = w; canvas.height = h; },
    render(state, screen) { draw(state, screen); },
  };

  function drawLit(m, proj, view, shadowMat, day, cam, emissive) {
    gl.useProgram(litProg);
    gl.uniformMatrix4fv(LU.uProj, false, proj);
    gl.uniformMatrix4fv(LU.uView, false, view);
    gl.uniformMatrix4fv(LU.uShadow, false, shadowMat);
    gl.uniformMatrix4fv(LU.uModel, false, IDENTITY);
    gl.uniform3fv(LU.uSunDir, norm3(day.sunDir));
    gl.uniform3fv(LU.uSunCol, day.sunCol);
    gl.uniform3fv(LU.uAmb, day.amb);
    gl.uniform3fv(LU.uFogCol, day.fog);
    gl.uniform3fv(LU.uCam, cam);
    gl.uniform1f(LU.uFogK, day.fogK);
    gl.uniform1f(LU.uEmissive, emissive);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(LU.uShadowTex, 0);
    bindMesh(gl, litProg, m);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
  }
  function drawDepth(m, mvp, model) {
    gl.useProgram(depthProg);
    gl.uniformMatrix4fv(U(depthProg, 'uMVP'), false, model ? mat4mul(mvp, model) : mvp);
    const loc = gl.getAttribLocation(depthProg, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos.b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
  }
  function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

  function draw(state, screen) {
    const day = DAY[state.timeOfDay] || DAY.golden;
    const p = state.plane;
    const t = state.elapsed;
    gl.viewport(0, 0, W, H);
    // camera
    const fwd = [Math.sin(p.heading) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.heading) * Math.cos(p.pitch)];
    const right = [-fwd[2], 0, fwd[0]];
    let eye, at;
    if (state.shotCam) { eye = state.shotCam.eye; at = state.shotCam.at; }
    else if (screen === 'panel-title') {
      eye = [350 * Math.sin(t * 0.02), 150, 700];
      at = [0, 80, -2000];
    } else if (mode === 'cockpit') {
      eye = [p.x + fwd[0] * 0.6, p.y + 1.1, p.z + fwd[2] * 0.6];
      at = [p.x + fwd[0] * 60, p.y + 1.1 + fwd[1] * 60, p.z + fwd[2] * 60];
    } else {
      eye = [p.x - fwd[0] * 13 + right[0] * 4.0, p.y + 4.6 - fwd[1] * 13, p.z - fwd[2] * 13 + right[2] * 4.0];
      at = [p.x + fwd[0] * 40, p.y + 1.5 + fwd[1] * 40, p.z + fwd[2] * 40];
    }
    const view = mat4look(eye, at, [0, 1, 0]);
    const proj = mat4persp(1.05, W / H, 0.5, 9000);
    const cam = eye;
    // shadow pass: sun camera follows the plane
    const sunDir = norm3(day.sunDir);
    const sunEye = [p.x + sunDir[0] * 900, p.y + sunDir[1] * 900, p.z + sunDir[2] * 900];
    const sunView = mat4look(sunEye, [p.x, p.y, p.z], [0, 1, 0]);
    const sunProj = mat4ortho(-450, 450, -450, 450, 1, 2200);
    const lightMvp = mat4mul(sunProj, sunView);
    const bias = [0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1];
    const shadowMat = mat4mul(bias, lightMvp);
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFb);
    gl.viewport(0, 0, SH, SH);
    gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawDepth(terrain, lightMvp);
    drawDepth(jet, lightMvp, jetTransform(p));
    drawDepth(treesMesh, lightMvp);
    drawDepth(housesMesh, lightMvp);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    // sky
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(skyProg);
    gl.uniformMatrix4fv(SU.uProj, false, proj);
    const skyView = mat4look([0, 0, 0], [eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]].map((v) => -v), [0, 1, 0]);
    gl.uniformMatrix4fv(SU.uView, false, skyView);
    gl.uniform3fv(SU.uZen, day.zen); gl.uniform3fv(SU.uHor, day.hor);
    gl.uniform3fv(SU.uSunDir, sunDir); gl.uniform3fv(SU.uSunCol, day.sunCol);
    gl.uniform1f(SU.uNight, day.night); gl.uniform1f(SU.uTime, t);
    bindMesh(gl, skyProg, sky);
    gl.drawElements(gl.TRIANGLES, sky.n, gl.UNSIGNED_SHORT, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    // opaque
    drawLit(terrain, proj, view, shadowMat, day, cam, 0);
    drawLit(stripsMesh, proj, view, shadowMat, day, cam, 0);
    drawLit(housesMesh, proj, view, shadowMat, day, cam, 0);
    drawLit(treesMesh, proj, view, shadowMat, day, cam, 0);
    drawLit(lightsMesh, proj, view, shadowMat, day, cam, 0.9);
    state.rings.forEach((r, i) => { if (!r.passed) drawLit(ringMeshes[i], proj, view, shadowMat, day, cam, 0.55); });
    state.fuelRings.forEach((r, i) => { if (!r.passed) drawLit(fuelMeshes[i], proj, view, shadowMat, day, cam, 0.55); });
    state.zones.forEach((z, i) => { if (!z.hit) drawLit(zoneMeshes[i], proj, view, shadowMat, day, cam, 0.5); });
    for (const d of state.drops) {
      drawLitTransformed(parcelMesh, transMat(d.x, d.y, d.z), proj, view, shadowMat, day, cam, 0);
      if (d.chute) drawLitTransformed(chuteMesh, transMat(d.x, d.y + 5, d.z), proj, view, shadowMat, day, cam, 0.25);
    }
    for (const b of state.blobs) {
      drawLitTransformed(blobMesh, transMat(b.x, b.y, b.z), proj, view, shadowMat, day, cam, 0.2);
    }
    if (mode !== 'cockpit' || screen === 'panel-title') {
      // jet model: nose toward -Z in local space; heading 0 = -Z, so rotate by heading
      const jetMvp = jetTransform(p);
      drawLitTransformed(jet, jetMvp, proj, view, shadowMat, day, cam, 0);
      drawLitTransformed(jetGlow, jetMvp, proj, view, shadowMat, day, cam, 0.95);
    }
    // water
    gl.useProgram(waterProg);
    gl.uniformMatrix4fv(WU.uProj, false, proj);
    gl.uniformMatrix4fv(WU.uView, false, view);
    gl.uniform1f(WU.uTime, t);
    gl.uniform3fv(WU.uSunDir, sunDir); gl.uniform3fv(WU.uSunCol, day.sunCol);
    gl.uniform3fv(WU.uFogCol, day.fog); gl.uniform3fv(WU.uCam, cam);
    gl.uniform3fv(WU.uDeep, day.deep); gl.uniform3fv(WU.uShallow, day.shallow);
    gl.uniform1f(WU.uFogK, day.fogK);
    bindMesh(gl, waterProg, water);
    gl.drawElements(gl.TRIANGLES, water.n, gl.UNSIGNED_SHORT, 0);
    // billboards: fires, smoke, clouds
    const up = [0, 1, 0];
    const camRight = norm3([view[0], view[4], view[8]]);
    drawBillboards(state, proj, view, camRight, up, day, t);
  }
  function jetTransform(p) {
    // R = Ry(-heading) * Rx(pitch) * Rz(-roll); nose local -Z, +X right wing.
    const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const cr = Math.cos(p.roll), sr = Math.sin(p.roll);
    return [
      ch * cr + sh * sp * sr, -cp * sr, sh * cr - ch * sp * sr, 0,
      ch * sr - sh * sp * cr, cp * cr, sh * sr + ch * sp * cr, 0,
      -sh * cp, -sp, ch * cp, 0,
      p.x, p.y, p.z, 1,
    ];
  }
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function drawLitTransformed(m, model, proj, view, shadowMat, day, cam, emissive) {
    gl.useProgram(litProg);
    gl.uniformMatrix4fv(LU.uProj, false, proj);
    gl.uniformMatrix4fv(LU.uView, false, view);
    gl.uniformMatrix4fv(LU.uShadow, false, shadowMat);
    gl.uniformMatrix4fv(LU.uModel, false, model);
    gl.uniform3fv(LU.uSunDir, norm3(day.sunDir));
    gl.uniform3fv(LU.uSunCol, day.sunCol);
    gl.uniform3fv(LU.uAmb, day.amb);
    gl.uniform3fv(LU.uFogCol, day.fog);
    gl.uniform3fv(LU.uCam, cam);
    gl.uniform1f(LU.uFogK, day.fogK);
    gl.uniform1f(LU.uEmissive, emissive);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(LU.uShadowTex, 0);
    bindMesh(gl, litProg, m);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
  }
  function drawBillboards(state, proj, view, camRight, up, day, t) {
    // fires: flame quad + smoke quad per live fire
    gl.depthMask(false);
    gl.useProgram(fireProg);
    gl.uniformMatrix4fv(U(fireProg, 'uProj'), false, proj);
    gl.uniformMatrix4fv(U(fireProg, 'uView'), false, view);
    gl.uniform3fv(U(fireProg, 'uRight'), camRight);
    gl.uniform3fv(U(fireProg, 'uUp'), up);
    gl.uniform1f(U(fireProg, 'uTime'), t);
    gl.uniform2fv(U(fireProg, 'uSquash'), [1.0, 1.35]);
    bindBill(fireProg);
    for (const f of state.fires) {
      if (f.intensity <= 0) continue;
      const s = 8 + f.intensity * 0.12;
      gl.uniform3fv(U(fireProg, 'uCenter'), [f.x, f.y + 4, f.z]);
      gl.uniform1f(U(fireProg, 'uScale'), s);
      gl.uniform2fv(U(fireProg, 'uSeed'), [f.x * 0.01, f.z * 0.01]);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    // clouds
    gl.useProgram(cloudProg);
    gl.uniformMatrix4fv(U(cloudProg, 'uProj'), false, proj);
    gl.uniformMatrix4fv(U(cloudProg, 'uView'), false, view);
    gl.uniform3fv(U(cloudProg, 'uRight'), camRight);
    gl.uniform3fv(U(cloudProg, 'uUp'), up);
    gl.uniform3fv(U(cloudProg, 'uFogCol'), day.fog);
    gl.uniform1f(U(cloudProg, 'uAlpha'), day.night ? 0.2 : 0.18);
    gl.uniform1f(U(cloudProg, 'uTime'), t);
    gl.uniform2fv(U(cloudProg, 'uSquash'), [1.8, 0.55]);
    bindBill(cloudProg);
    for (const c of world.clouds) {
      const x = c.x + c.drift * t;
      gl.uniform3fv(U(cloudProg, 'uCenter'), [x, c.y, c.z]);
      gl.uniform1f(U(cloudProg, 'uScale'), c.s);
      gl.uniform2fv(U(cloudProg, 'uSeed'), [c.x * 0.001, c.z * 0.001]);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.depthMask(true);
  }
  function bindBill(prog) {
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, bill.pos.b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    const uvLoc = gl.getAttribLocation(prog, 'aUv');
    gl.bindBuffer(gl.ARRAY_BUFFER, billUv);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bill.idx);
  }
  return renderer;
}
