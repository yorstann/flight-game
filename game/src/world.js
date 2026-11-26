// Meridian Sky Courier — valley edition: world, missions and flight model.
// The valley runs north (-Z) to Mount Meridian and south (+Z) to the sea.
// All placement is seeded; nothing reads Math.random or the wall clock.
import { CFG } from './config.js';
import { mulberry32, hash2, fbm, clamp, lerp, sstep, TAU } from './random.js';

const FIELD_COLORS = [
  [0.28, 0.50, 0.18], [0.36, 0.58, 0.22], [0.78, 0.62, 0.22],
  [0.62, 0.54, 0.26], [0.46, 0.38, 0.22], [0.55, 0.66, 0.30],
];

export function createWorld(seed = CFG.seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const M = CFG.mountain;

  // --- terrain -------------------------------------------------------------
  const riverX = (z) => 90 * Math.sin(z * 0.0011) + 40 * Math.sin(z * 0.0027 + 1.7);
  const strips = [
    { name: 'Meridian Field', x: 0, z: 1250, heading: 0, len: 150, wid: 28, y: 0 },
    { name: 'North Field', x: 0, z: -1850, heading: 0, len: 150, wid: 28, y: 0 },
    { name: 'Far Strip', x: -560, z: -700, heading: Math.PI / 2, len: 130, wid: 24, y: 0 },
  ];
  function baseHeight(x, z) {
    let h = 4 * fbm(x * 0.004, z * 0.004, seed) + 2 * fbm(x * 0.02, z * 0.02, seed + 9);
    const d = Math.abs(x);
    h += sstep(CFG.wallStart, CFG.wallTop, d) * (230 + 110 * fbm(x * 0.002, z * 0.002, seed + 31));
    const md = Math.hypot(x - M.x, z - M.z);
    const m = Math.max(0, 1 - md / M.r);
    h += M.peak * Math.pow(m, 1.2) + (40 * fbm(x * 0.01, z * 0.01, seed + 47) + 30 * fbm(x * 0.008, z * 0.008, seed + 55)) * m;
    const dd = Math.abs(x - riverX(z));
    if (dd < 42 && z > -1500) h = lerp(h, -4.5, sstep(42, 10, dd));
    if (z > 1400) h = lerp(h, -6, sstep(1400, 1520, z));
    return h;
  }
  for (const s of strips) s.y = baseHeight(s.x, s.z);
  function terrainHeight(x, z) {
    let h = baseHeight(x, z);
    for (const s of strips) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < 150) h = lerp(s.y, h, sstep(55, 150, d));
    }
    return h;
  }
  function slopeAt(x, z) {
    const e = 8;
    const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
    const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }
  function terrainColor(x, z, h) {
    const sl = slopeAt(x, z);
    if (h > M.snow - 48) {
      const j = 34 * fbm(x * 0.01, z * 0.01, seed + 61) - 17;
      const t = sstep(M.snow - 48 + j, M.snow + 5 + j, h);
      return [lerp(0.5, 0.95, t), lerp(0.48, 0.96, t), lerp(0.46, 0.98, t)];
    }
    if (sl > 0.5) {
      const n = 0.85 + 0.3 * fbm(x * 0.05, z * 0.05, seed + 5);
      return [0.42 * n, 0.38 * n, 0.34 * n];
    }
    if (h < CFG.waterLevel + 0.4) return [0.15, 0.19, 0.17];
    const dd = Math.abs(x - riverX(z));
    if (dd < 46) return [0.76, 0.68, 0.47];
    if (fbm(x * 0.006, z * 0.006, seed + 77) > 0.22 && Math.abs(x) > 300) return [0.20, 0.32, 0.16];
    const cx = Math.floor(x / 95), cz = Math.floor(z / 95);
    const ci = Math.abs(Math.floor(hash2(cx, cz, seed + 3) * 6)) % 6;
    const c = FIELD_COLORS[ci];
    const edge = Math.min(x - cx * 95, (cx + 1) * 95 - x, z - cz * 95, (cz + 1) * 95 - z);
    const k = edge < 4 ? 0.72 : 1;
    const v = 0.92 + 0.16 * fbm(x * 0.03, z * 0.03, seed + 11);
    return [c[0] * k * v, c[1] * k * v, c[2] * k * v];
  }

  // --- fixed world contents (seeded placement) ------------------------------
  const ringDefs = [
    [60, 55, 950], [-120, 60, 550], [100, 65, 100],
    [-80, 60, -350], [120, 70, -900], [0, 75, -1500],
  ];
  const fuelDefs = [[-40, 55, 750], [60, 60, -150], [-60, 65, -1200]];
  const stormDefs = [[-200, 110, 300], [180, 120, -600], [-150, 100, -1400]];
  const fireDefs = [[150, 400], [-180, -300], [80, -1100]];
  const zoneDefs = [[0, 700], [-100, 0], [120, -700], [0, -1400]];
  const villageDefs = [[140, 850], [-160, 150], [100, -1000]];
  const trees = [];
  for (let i = 0; i < 220; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * (380 + rng() * 560);
    const z = -2200 + rng() * 3800;
    const h = terrainHeight(x, z);
    if (h > 4 && h < 200) trees.push({ x, z, y: h, s: 0.8 + rng() * 0.9, r: rng() * TAU });
  }
  const houses = [];
  for (const [vx, vz] of villageDefs) {
    for (let i = 0; i < 7; i++) {
      const x = vx + (rng() - 0.5) * 130, z = vz + (rng() - 0.5) * 110;
      const h = terrainHeight(x, z);
      if (h > 0 && h < 30) houses.push({ x, z, y: h, w: 10 + rng() * 6, d: 9 + rng() * 5, hgt: 6 + rng() * 4, r: rng() * TAU, roof: rng() });
    }
  }
  const clouds = [];
  for (let i = 0; i < 20; i++) {
    clouds.push({ x: (rng() - 0.5) * 3200, y: 320 + rng() * 160, z: -2400 + rng() * 4200, s: 200 + rng() * 150, drift: 2 + rng() * 4 });
  }

  // --- missions --------------------------------------------------------------
  const MISSIONS = [
    { name: 'Golden Hour Run', sub: 'Thread the valley rings, land at North Field', time: 'golden', rain: false, dest: 1, kind: 'rings' },
    { name: 'Fire Bomber', sub: 'Scoop the sea, douse 3 wildfires, land at North Field', time: 'golden', rain: false, dest: 1, kind: 'fires' },
    { name: 'Supply Drop', sub: 'Drop 4 parcels on the valley markers, land at North Field', time: 'golden', rain: false, dest: 1, kind: 'zones' },
    { name: 'Crosswind Courier', sub: 'Dusk run with a crosswind — land soft for a grade', time: 'dusk', rain: false, dest: 1, kind: 'graded' },
    { name: 'Night Mail & Rescue', sub: 'Land at the Far Strip, bring the hiker home', time: 'night', rain: true, dest: 0, kind: 'rescue' },
  ];

  // --- state -----------------------------------------------------------------
  const state = {
    elapsed: 0, screen: 'panel-title',
    plane: { x: 0, y: 6, z: 1250, heading: 0, pitch: 0, roll: 0, speed: 0, throttle: 0.7, fuel: 100, vy: 0, stalling: false, invulnerable: 0 },
    score: 0, credits: 0, lives: CFG.lives, missionsDone: 0, missionIndex: 0, mission: MISSIONS[0],
    rings: [], fuelRings: [], storms: [], fires: [], zones: [], parcels: 0, lastSupply: null,
    strips, // exposed on state so the __game hook (and its checks) can find the strips
    water: 0, lastGrade: null, passenger: false, grounded: true, groundedStrip: strips[0],
    combo: 0, damage: 0, upgrades: { tank: 0, engine: 0, handling: 0 },
    tower: 'Meridian Tower: cleared for takeoff, runway 09', rain: false, rainShot: false,
    timeOfDay: 'golden', blobs: [], drops: [], wind: 0, airTime: 0,
  };
  function freshObjectives() {
    state.rings = ringDefs.map(([x, y, z]) => ({ x, y, z, passed: false }));
    state.fuelRings = fuelDefs.map(([x, y, z]) => ({ x, y, z, passed: false }));
    state.storms = stormDefs.map(([x, y, z], i) => ({ x, y, z, i }));
    state.fires = fireDefs.map(([x, z]) => ({ x, z, y: terrainHeight(x, z), intensity: 100 }));
    state.zones = zoneDefs.map(([x, z]) => ({ x, z, y: terrainHeight(x, z), hit: false }));
    state.parcels = CFG.supply.parcels;
    state.water = 0; state.lastSupply = null; state.lastGrade = null; state.passenger = false;
    state.blobs = []; state.drops = []; state.combo = 0; state.damage = 0;
  }
  function placeAtHome() {
    const s = strips[0];
    Object.assign(state.plane, { x: s.x, y: s.y + 1, z: s.z, heading: 0, pitch: 0, roll: 0, speed: 0, throttle: 0.7, fuel: fuelMax(), vy: 0, stalling: false, invulnerable: 0 });
    state.grounded = true; state.groundedStrip = s; state.airTime = 0;
  }
  function fuelMax() { return CFG.shop.tankMax[state.upgrades.tank]; }
  function startMission(i, credits) {
    state.missionIndex = i; state.mission = MISSIONS[i];
    state.timeOfDay = MISSIONS[i].time; state.rain = MISSIONS[i].rain;
    if (typeof credits === 'number') state.credits = credits;
    freshObjectives(); placeAtHome();
    state.tower = `Meridian Tower: ${MISSIONS[i].name} — ${MISSIONS[i].sub}`;
    return true;
  }
  function buyUpgrade(kind) {
    if (kind === 'tank') {
      const lv = state.upgrades.tank;
      if (lv >= 2) return false;
      const cost = CFG.shop.tankCost[lv];
      if (state.credits < cost) return false;
      state.credits -= cost; state.upgrades.tank = lv + 1;
      state.plane.fuel = fuelMax();
      return true;
    }
    if (kind === 'engine' || kind === 'handling') {
      const lv = state.upgrades[kind];
      if (lv >= 2) return false;
      const cost = kind === 'engine' ? 200 : 180;
      if (state.credits < cost) return false;
      state.credits -= cost; state.upgrades[kind] = lv + 1;
      return true;
    }
    return false;
  }

  // --- helpers ---------------------------------------------------------------
  const dist3 = (ax, ay, az, bx, by, bz) => Math.hypot(ax - bx, ay - by, az - bz);
  function stripAt(x, z) {
    for (const s of strips) {
      const dx = x - s.x, dz = z - s.z;
      const along = dx * Math.sin(s.heading) + dz * Math.cos(s.heading);
      const cross = dx * Math.cos(s.heading) - dz * Math.sin(s.heading);
      if (Math.abs(along) < s.len / 2 + 8 && Math.abs(cross) < s.wid / 2 + 6) return { strip: s, along, cross };
    }
    return null;
  }
  function objectivesDone() {
    const m = state.mission;
    if (m.kind === 'rings' || m.kind === 'graded') return state.rings.every((r) => r.passed);
    if (m.kind === 'fires') return state.fires.every((f) => f.intensity <= 0);
    if (m.kind === 'zones') return state.zones.every((z) => z.hit);
    if (m.kind === 'rescue') return state.passenger;
    return false;
  }
  function completeMission() {
    state.missionsDone += 1;
    state.score += 200; state.credits = state.score;
    state.tower = `Meridian Tower: ${state.mission.name} complete — well flown.`;
  }
  function gradeLanding(speed, roll, cross) {
    const label = speed <= 40 && Math.abs(roll) < 0.2 && Math.abs(cross) < 8 ? 'PERFECT'
      : speed <= 52 && Math.abs(roll) < 0.4 ? 'GOOD' : 'ROUGH';
    state.lastGrade = { label, points: CFG.grades[label.toLowerCase()] };
    state.score += state.lastGrade.points; state.credits = state.score;
    return label;
  }
  function loseLife(why) {
    if (state.plane.invulnerable > 0) return;
    state.lives -= 1; state.damage = 0;
    state.tower = `Meridian Tower: ${why} — ${state.lives > 0 ? 'aircraft lost, respawning' : 'no aircraft left'}`;
    if (state.lives <= 0) { state.screen = 'panel-over'; return; }
    const s = strips[0];
    Object.assign(state.plane, { x: s.x, y: 120, z: s.z + 100, heading: 0, pitch: 0, roll: 0, speed: 45, throttle: 0.7, vy: 0, invulnerable: 4 });
    state.grounded = false; state.groundedStrip = null; state.airTime = 0;
  }
  function landAt(hit) {
    const p = state.plane;
    const hard = Math.abs(p.vy) > 7 || p.speed > 55;
    p.y = hit.strip.y + 0.8; p.vy = 0; p.pitch = 0; p.roll = 0;
    state.grounded = true; state.groundedStrip = hit.strip;
    state.plane.fuel = fuelMax(); state.damage = 0;
    if (hard) { state.damage = 1; state.tower = 'Meridian Tower: rough touchdown — check the airframe'; }
    const dest = state.mission.dest;
    if (hit.strip === strips[dest] && objectivesDone()) {
      if (state.mission.kind === 'graded') gradeLanding(p.speed, p.roll, hit.cross);
      completeMission();
      state.screen = 'panel-mission';
      return;
    }
    if (state.mission.kind === 'rescue' && hit.strip === strips[2] && !state.passenger) {
      state.passenger = true;
      state.tower = 'Meridian Tower: hiker aboard — bring them home to Meridian Field';
    }
  }
  function drop() {
    const p = state.plane;
    if (state.missionIndex === 1 && state.water > 0) {
      state.blobs.push({ x: p.x, y: p.y - 2, z: p.z, vx: Math.sin(p.heading) * p.speed * 0.3, vy: 0, vz: -Math.cos(p.heading) * p.speed * 0.3, t: 0 });
      state.water = Math.max(0, state.water - 25);
      return;
    }
    if (state.missionIndex === 2 && state.parcels > 0) {
      state.drops.push({ x: p.x, y: p.y - 2, z: p.z, vx: Math.sin(p.heading) * p.speed * 0.6, vy: 0, vz: -Math.cos(p.heading) * p.speed * 0.6, t: 0, chute: false });
      state.parcels -= 1;
    }
  }

  // --- per-frame update --------------------------------------------------------
  function update(dt, input) {
    const p = state.plane;
    if (p.invulnerable > 0) p.invulnerable -= dt;
    // A plane placed well above the ground (teleport, respawn) is airborne even
    // if the grounded flag was left set — otherwise it can never pitch or land.
    // A grounded plane placed under the terrain has crashed.
    if (state.grounded && p.y > terrainHeight(p.x, p.z) + 3) {
      state.grounded = false; state.groundedStrip = null; state.airTime = 0;
    } else if (state.grounded && p.y < terrainHeight(p.x, p.z) - 1) {
      loseLife('terrain impact'); return;
    }
    state.wind = state.missionIndex === 3 ? 5 * Math.sin(state.elapsed * 0.23) : 0;
    if (state.grounded) {
      p.throttle = clamp(p.throttle + (input.throttleUp ? dt * 0.9 : 0) - (input.throttleDown ? dt * 0.9 : 0), 0, 1);
      const weight = 1 + state.water / 100 * 0.3 + state.parcels * 0.02;
      p.speed = clamp(p.speed + (p.throttle * CFG.plane.accel - CFG.plane.drag - p.speed * CFG.plane.speedDrag) / weight * dt, 0, CFG.plane.maxSpeed);
      if (input.left) p.heading -= 0.25 * dt * (p.speed > 5 ? 1 : 0);
      if (input.right) p.heading += 0.25 * dt * (p.speed > 5 ? 1 : 0);
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += -Math.cos(p.heading) * p.speed * dt;
      if (p.speed > CFG.plane.takeoff) { state.grounded = false; state.groundedStrip = null; state.airTime = 0; state.tower = 'Meridian Tower: airborne — have a good flight'; }
      return;
    }
    state.airTime += dt;
    // throttle + speed
    p.throttle = clamp(p.throttle + (input.throttleUp ? dt * 0.9 : 0) - (input.throttleDown ? dt * 0.9 : 0), 0, 1);
    const weight = 1 + state.water / 100 * 0.3 + state.parcels * 0.02 + (state.passenger ? 0.05 : 0);
    const engine = 1 + state.upgrades.engine * 0.09;
    p.speed = clamp(p.speed + ((p.throttle * CFG.plane.accel * engine - CFG.plane.drag - p.speed * CFG.plane.speedDrag) / weight) * dt, 0, CFG.plane.maxSpeed);
    // bank / pitch
    const handling = 1 + state.upgrades.handling * 0.15;
    if (input.left) p.roll = Math.max(-CFG.plane.maxRoll, p.roll - 1.7 * handling * dt);
    else if (input.right) p.roll = Math.min(CFG.plane.maxRoll, p.roll + 1.7 * handling * dt);
    else p.roll *= Math.max(0, 1 - 2.2 * dt);
    if (input.up) p.pitch = Math.min(CFG.plane.maxPitch, p.pitch + CFG.plane.pitchRate * dt);
    else if (input.down) p.pitch = Math.max(-0.35, p.pitch - CFG.plane.pitchRate * dt);
    else p.pitch += (0.02 - p.pitch) * Math.min(1, 1.8 * dt);
    p.heading += p.roll * CFG.plane.turnRate * dt * (0.4 + p.speed / 60);
    // stall
    p.stalling = p.speed < CFG.plane.stallSpeed && p.pitch > 0.12;
    const sink = p.speed < 30 ? 2.5 : 0.5 + (1 - p.throttle) * 2.0;
    p.vy = p.speed * Math.sin(p.pitch) - sink - (p.stalling ? 9 : 0);
    p.x += Math.sin(p.heading) * p.speed * dt + state.wind * dt;
    p.z += -Math.cos(p.heading) * p.speed * dt;
    p.y += p.vy * dt;
    // fuel
    if (p.fuel > 0) {
      p.fuel = Math.max(0, p.fuel - CFG.plane.fuelDrain * (0.5 + p.throttle * 0.7) * dt);
      if (p.fuel === 0) p.throttle = 0;
    }
    // rings
    for (const r of state.rings) {
      if (!r.passed && dist3(p.x, p.y, p.z, r.x, r.y, r.z) < CFG.rings.radius + 1) {
        r.passed = true; state.combo = Math.min(5, state.combo + 1);
        const pts = CFG.rings.score * state.combo;
        state.score += pts; state.credits = state.score;
        state.tower = `Meridian Tower: ring ${state.rings.filter((x) => x.passed).length}/6 — +${pts}`;
      }
    }
    for (const r of state.fuelRings) {
      if (!r.passed && dist3(p.x, p.y, p.z, r.x, r.y, r.z) < CFG.rings.radius + 1) {
        r.passed = true; p.fuel = Math.min(fuelMax(), p.fuel + CFG.rings.fuelGain);
        state.score += CFG.rings.fuelScore; state.credits = state.score;
        state.tower = 'Meridian Tower: fuel topped up';
      }
    }
    // storms
    for (const s of state.storms) {
      const sx = s.x + 30 * Math.sin(state.elapsed * 0.05 + s.i * 2.1);
      if (dist3(p.x, p.y, p.z, sx, s.y, s.z) < CFG.storm.radius) { loseLife('storm cell — aircraft lost'); return; }
    }
    // water scoop
    const gy = terrainHeight(p.x, p.z);
    if (state.missionIndex === 1 && gy < CFG.waterLevel && p.y < 8 && p.speed > 25 && state.water < 100) {
      state.water = Math.min(100, state.water + 45 * dt);
    }
    // ground / water contact: a low pass over a strip is a landing (guarded so a
    // fresh takeoff does not instantly re-land); anything else is a crash.
    const hit = stripAt(p.x, p.z);
    if (hit && p.y - hit.strip.y < 5.5 && p.speed < 52 && p.vy < 0.5 && state.airTime > 0.8) { landAt(hit); return; }
    if (p.y <= gy + 0.5) {
      if (gy < CFG.waterLevel) { loseLife('ditched in the water'); return; }
      loseLife('terrain impact'); return;
    }
    // falling blobs and parcels
    for (const b of state.blobs) {
      b.t += dt; b.vy -= 20 * dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
      b.vx *= Math.max(0, 1 - 0.4 * dt); b.vz *= Math.max(0, 1 - 0.4 * dt);
      if (b.y <= terrainHeight(b.x, b.z)) {
        b.dead = true;
        for (const f of state.fires) {
          if (f.intensity > 0 && Math.hypot(b.x - f.x, b.z - f.z) < 30) {
            f.intensity = Math.max(0, f.intensity - 45);
            if (f.intensity === 0) { state.score += CFG.fire.score; state.credits = state.score; state.tower = 'Meridian Tower: fire out — +250'; }
          }
        }
      }
    }
    state.blobs = state.blobs.filter((b) => !b.dead);
    for (const d of state.drops) {
      d.t += dt;
      if (d.t > 0.6) d.chute = true;
      d.vy = d.chute ? Math.max(d.vy - 12 * dt, -9) : d.vy - 12 * dt;
      d.x += d.vx * dt; d.z += d.vz * dt; d.y += d.vy * dt;
      d.vx *= Math.max(0, 1 - 0.8 * dt); d.vz *= Math.max(0, 1 - 0.8 * dt);
      if (d.y <= terrainHeight(d.x, d.z)) {
        d.dead = true;
        for (const z of state.zones) {
          if (!z.hit) {
            const dist = Math.hypot(d.x - z.x, d.z - z.z);
            if (dist < 22) {
              z.hit = true;
              const pts = Math.max(50, Math.round(300 - dist * 6));
              state.lastSupply = { points: pts, dist: Math.round(dist) };
              state.score += pts; state.credits = state.score;
              state.tower = `Meridian Tower: parcel on the marker — +${pts}`;
            }
          }
        }
      }
    }
    state.drops = state.drops.filter((d) => !d.dead);
  }

  freshObjectives();
  placeAtHome();
  return {
    state, strips, trees, houses, clouds, riverX, terrainHeight, terrainColor,
    slopeAt, startMission, buyUpgrade, fuelMax, drop, update, MISSIONS,
  };
}
