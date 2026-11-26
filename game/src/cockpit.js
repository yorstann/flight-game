// Cockpit + HUD: the dial panel is generated from a spec table (compact, so
// the dossier stays under its cap), the two glass MFDs are canvases, the rain
// is a 2D overlay whose every drop is a pure function of state.elapsed.
import { clamp } from './random.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
};
const polar = (deg, r) => [50 + r * Math.sin((deg * Math.PI) / 180), 50 - r * Math.cos((deg * Math.PI) / 180)];

function buildDial(svgId, needleId, spec) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const face = svg.querySelector('.face');
  const needle = document.getElementById(needleId);
  face.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 47, fill: '#0d1526', stroke: 'rgba(255,179,71,0.55)', 'stroke-width': 1.5 }));
  face.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 42, fill: 'none', stroke: 'rgba(255,179,71,0.25)', 'stroke-width': 6 }));
  const span = spec.max - spec.min;
  const angle = (v) => (spec.compass ? v : -120 + ((v - spec.min) / span) * 240);
  if (spec.redBelow !== undefined) {
    const [x0, y0] = polar(angle(spec.min), 44);
    const [x1, y1] = polar(angle(spec.redBelow), 44);
    face.appendChild(svgEl('path', { d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} A 44 44 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`, fill: 'none', stroke: '#ff5a4b', 'stroke-width': 3 }));
  }
  for (let v = spec.min; v <= spec.max + 0.001; v += spec.step / 5) {
    const major = Math.abs(((v - spec.min) / spec.step) - Math.round((v - spec.min) / spec.step)) < 0.001;
    const [tx0, ty0] = polar(angle(v), major ? 38 : 41);
    const [tx1, ty1] = polar(angle(v), 44);
    face.appendChild(svgEl('line', { x1: tx0.toFixed(1), y1: ty0.toFixed(1), x2: tx1.toFixed(1), y2: ty1.toFixed(1), stroke: major ? '#e8e2d2' : 'rgba(232,226,210,0.5)', 'stroke-width': major ? 1.6 : 0.8 }));
  }
  spec.labels.forEach((label, i) => {
    const v = spec.min + (i * span) / (spec.labels.length - 1);
    const [x, y] = polar(angle(v), 30);
    const t = svgEl('text', { x: x.toFixed(1), y: (y + 2.5).toFixed(1), 'font-size': 7.5, fill: '#e8e2d2', 'text-anchor': 'middle', 'font-family': 'system-ui, sans-serif', 'font-weight': 700 });
    t.textContent = label;
    face.appendChild(t);
  });
  needle.appendChild(svgEl('line', { x1: 50, y1: 56, x2: 50, y2: 16, stroke: '#ffb347', 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
  needle.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 4, fill: '#ffb347', stroke: '#0d1526', 'stroke-width': 1 }));
}
const DIALS = [
  ['dial-speed', 'nd-speed', { min: 0, max: 250, step: 50, labels: ['0', '50', '100', '150', '200', '250'] }],
  ['dial-alt', 'nd-alt', { min: 0, max: 1000, step: 200, labels: ['0', '2', '4', '6', '8', '10'] }],
  ['dial-oil', 'nd-oil', { min: 0, max: 100, step: 25, labels: ['0', '25', '50', '75', '100'] }],
  ['dial-fuel', 'nd-fuel', { min: 0, max: 100, step: 25, redBelow: 25, labels: ['0', '25', '50', '75', '100'] }],
  ['dial-heading', 'nd-heading', { min: 0, max: 360, step: 90, compass: true, labels: ['N', 'E', 'S', 'W'] }],
  ['dial-vsi', 'nd-vsi', { min: -1000, max: 1000, step: 500, labels: ['-10', '-5', '0', '5', '10'] }],
  ['dial-rpm', 'nd-rpm', { min: 0, max: 100, step: 25, labels: ['0', '25', '50', '75', '100'] }],
  ['dial-egt', 'nd-egt', { min: 0, max: 1000, step: 250, labels: ['0', '250', '500', '750', '1000'] }],
];
const dialAngle = (v, min, max) => -120 + ((clamp(v, min, max) - min) / (max - min)) * 240;
const setNeedle = (el, deg) => { if (el) el.setAttribute('transform', `rotate(${deg.toFixed(1)} 50 50)`); };

export function createCockpit(world) {
  for (const [svg, nd, spec] of DIALS) buildDial(svg, nd, spec);
  const $ = (id) => document.getElementById(id);
  const mapCtx = $('mfd-map').getContext('2d');
  const engCtx = $('mfd-eng').getContext('2d');
  const miniCtx = $('minimap').getContext('2d');
  const spdCtx = $('tape-spd').getContext('2d');
  const altCtx = $('tape-alt').getContext('2d');
  const rainCv = $('rain');
  const rainCtx = rainCv.getContext('2d');
  const rainRnd = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

  function drawMap(ctx, W, H, state) {
    ctx.fillStyle = '#06121a'; ctx.fillRect(0, 0, W, H);
    const mx = (x) => ((x + 700) / 1400) * W;
    const mz = (z) => ((z + 2800) / 5600) * H;
    ctx.fillStyle = '#0d2a1a';
    ctx.beginPath(); ctx.moveTo(mx(-340), 0); ctx.lineTo(mx(340), 0); ctx.lineTo(mx(340), H); ctx.lineTo(mx(-340), H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a6ea8'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let z = -2400; z <= 2800; z += 100) {
      const x = world.riverX(z);
      if (z === -2400) ctx.moveTo(mx(x), mz(z)); else ctx.lineTo(mx(x), mz(z));
    }
    ctx.stroke();
    ctx.fillStyle = '#e8e8e8';
    for (const s of world.strips) { ctx.fillRect(mx(s.x) - 3, mz(s.z) - 3, 6, 6); }
    for (const r of state.rings) {
      ctx.fillStyle = r.passed ? '#3a3a3a' : '#ffc93c';
      ctx.beginPath(); ctx.arc(mx(r.x), mz(r.z), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    const p = state.plane;
    ctx.save(); ctx.translate(mx(p.x), mz(p.z)); ctx.rotate(p.heading);
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#58d68d'; ctx.font = '700 9px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('MAP', 4, 11);
  }
  function drawEng(ctx, W, H, state) {
    ctx.fillStyle = '#06121a'; ctx.fillRect(0, 0, W, H);
    const rows = [
      ['RPM', state.plane.throttle * 100, '#58d68d'],
      ['FUEL', state.plane.fuel, '#58d68d'],
      ['OIL', 88, '#ffb347'],
      ['EGT', 800, '#ff8a5a'],
    ];
    ctx.font = '700 9px system-ui, sans-serif';
    rows.forEach(([lb, v, col], i) => {
      const y = 14 + i * 20;
      ctx.fillStyle = '#9fd8ff'; ctx.textAlign = 'left'; ctx.fillText(lb, 6, y);
      ctx.fillStyle = '#1a2438'; ctx.fillRect(48, y - 8, 76, 9);
      ctx.fillStyle = col; ctx.fillRect(48, y - 8, 76 * clamp(v / (lb === 'EGT' ? 1000 : 100), 0, 1), 9);
      ctx.fillStyle = '#e8e2d2'; ctx.textAlign = 'right'; ctx.fillText(String(Math.round(v)), 146, y);
    });
    ctx.fillStyle = '#58d68d'; ctx.fillText('ENG', 6, 92);
  }
  function drawTape(ctx, W, H, value, min, max, step, unit) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(8,12,24,0.78)'; ctx.fillRect(0, 0, W, H);
    const mid = H / 2, pxPer = (H * 0.8) / (max - min);
    ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'left';
    for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
      const y = mid - (v - value) * pxPer;
      if (y < 8 || y > H - 8) continue;
      ctx.strokeStyle = 'rgba(232,226,210,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(16, y); ctx.stroke();
      ctx.fillStyle = '#e8e2d2'; ctx.fillText(String(v), 20, y + 4);
    }
    ctx.fillStyle = '#ffc93c'; ctx.fillRect(0, mid - 11, W, 22);
    ctx.fillStyle = '#14100a'; ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(value)), W / 2, mid + 5);
    ctx.fillStyle = '#9aa4b5'; ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText(unit, W / 2, 12);
  }
  function drawRain(state, w, h) {
    rainCtx.clearRect(0, 0, w, h);
    if (!(state.rain || state.rainShot)) return;
    const t = state.elapsed;
    rainCtx.strokeStyle = 'rgba(200,220,255,0.5)'; rainCtx.lineWidth = 1;
    rainCtx.beginPath();
    for (let i = 0; i < 240; i++) {
      const x = rainRnd(i * 3 + 1) * w;
      const y = ((rainRnd(i * 3 + 2) + t * 0.55) % 1) * h;
      const len = 14 + rainRnd(i * 3 + 3) * 18;
      rainCtx.moveTo(x, y); rainCtx.lineTo(x - 3, y + len);
    }
    rainCtx.stroke();
    rainCtx.fillStyle = 'rgba(210,230,255,0.35)';
    for (let i = 0; i < 46; i++) {
      const x = rainRnd(i * 7 + 11) * w;
      const y = rainRnd(i * 7 + 13) * h * 0.7;
      const r = 1.5 + rainRnd(i * 7 + 17) * 2.5;
      rainCtx.beginPath(); rainCtx.arc(x, y, r, 0, Math.PI * 2); rainCtx.fill();
      rainCtx.strokeStyle = 'rgba(210,230,255,0.25)';
      rainCtx.beginPath(); rainCtx.moveTo(x, y + r); rainCtx.lineTo(x - 1, y + r + 12 + rainRnd(i) * 10); rainCtx.stroke();
    }
  }
  function objectiveText(state) {
    const m = state.mission;
    if (m.kind === 'rings' || m.kind === 'graded') return `Ring ${state.rings.filter((r) => r.passed).length}/${state.rings.length}`;
    if (m.kind === 'fires') return `Fire ${state.fires.filter((f) => f.intensity <= 0).length}/${state.fires.length} out · Tank ${Math.round(state.water)}%`;
    if (m.kind === 'zones') return `Drop ${state.zones.filter((z) => z.hit).length}/${state.zones.length} · Parcels ${state.parcels}`;
    if (m.kind === 'rescue') return state.passenger ? 'Passenger aboard — fly home' : 'Land at the Far Strip';
    return '';
  }
  function update(state, screen, cameraMode) {
    const p = state.plane;
    const inCockpit = cameraMode === 'cockpit' && screen === 'play';
    $('hud').classList.toggle('hidden', screen !== 'play' || inCockpit);
    $('cockpit').classList.toggle('hidden', !inCockpit);
    document.body.classList.toggle('cockpit-on', inCockpit);
    rainCv.style.display = inCockpit && (state.rain || state.rainShot) ? 'block' : 'none';
    if (screen === 'play') {
      $('hud-mission').textContent = state.mission.name;
      $('hud-obj').textContent = objectiveText(state);
      $('hud-score').textContent = `Score ${state.score} · ${state.credits} cr`;
      $('hud-lives').textContent = '✈'.repeat(Math.max(0, state.lives));
      $('tower').textContent = state.tower;
      $('hud-speed').textContent = `${Math.round(p.speed * 2.4)} kt`;
      $('hud-alt').textContent = `${Math.round(p.y * 3.3)} ft`;
      $('hud-fuel').textContent = `${Math.round(p.fuel)}%`;
      $('thr-fill').style.width = `${Math.round(p.throttle * 100)}%`;
      $('thr-load').textContent = state.water > 0 ? `WATER ${Math.round(state.water)}% — heavy` : state.parcels > 0 && state.missionIndex === 2 ? `LOAD ${state.parcels} parcels` : '';
      $('stall').classList.toggle('hidden', !p.stalling);
      drawMap(miniCtx, 170, 170, state);
    }
    if (inCockpit) {
      setNeedle($('nd-speed'), dialAngle(p.speed * 2.4, 0, 250));
      setNeedle($('nd-alt'), dialAngle(p.y * 3.3, 0, 1000));
      setNeedle($('nd-oil'), dialAngle(88, 0, 100));
      setNeedle($('nd-fuel'), dialAngle(p.fuel, 0, 100));
      setNeedle($('nd-heading'), ((p.heading * 180 / Math.PI) % 360 + 360) % 360);
      setNeedle($('nd-vsi'), dialAngle(p.vy * 200, -1000, 1000));
      setNeedle($('nd-rpm'), dialAngle(p.throttle * 100, 0, 100));
      setNeedle($('nd-egt'), dialAngle(800, 0, 1000));
      $('w-stall').classList.toggle('on', p.stalling);
      $('w-fuel').classList.toggle('on', p.fuel < 25);
      $('w-gear').classList.toggle('on', state.grounded);
      $('w-dmg').classList.toggle('on', state.damage > 0);
      drawMap(mapCtx, 150, 96, state);
      drawEng(engCtx, 150, 96, state);
      drawTape(spdCtx, 74, 260, p.speed * 2.4, 0, 250, 20, 'KT');
      drawTape(altCtx, 74, 260, p.y * 3.3, 0, 1000, 100, 'FT');
      const stick = $('stick-g');
      if (stick) stick.setAttribute('transform', `rotate(${(p.roll * 18).toFixed(1)} 65 215) translate(0 ${(p.pitch * 8).toFixed(1)})`);
      $('lev-thr').style.height = `${40 + p.throttle * 50}px`;
      drawRain(state, rainCv.width, rainCv.height);
    } else {
      rainCtx.clearRect(0, 0, rainCv.width, rainCv.height);
    }
  }
  return { update, resizeRain(w, h) { rainCv.width = w; rainCv.height = h; } };
}
