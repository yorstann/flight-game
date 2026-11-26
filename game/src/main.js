// Meridian Sky Courier — valley edition: boot, game loop, screens, the
// window.__game hook the playtest and the screenshots drive.
import { createWorld } from './world.js';
import { createRenderer } from './render.js';
import { createCockpit } from './cockpit.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) || 1;
const shotName = params.get('shot');
const canvas = document.getElementById('gl');

const world = createWorld(seed);
const state = world.state;
const renderer = createRenderer(canvas, world);
const cockpit = createCockpit(world);
const input = createInput();
const audio = createAudio();

const $ = (id) => document.getElementById(id);
function showScreen(name) {
  for (const id of ['panel-title', 'panel-mission', 'panel-pause', 'panel-over']) {
    $(id).classList.toggle('hidden', id !== name && name !== 'play' ? true : id !== name);
  }
  if (name === 'panel-mission') {
    $('mission-title').textContent = state.missionIndex >= 4 ? 'ALL MISSIONS COMPLETE' : 'MISSION COMPLETE';
    $('mission-sub').textContent = `${state.mission.name} — ${state.mission.sub}`;
    $('m-score').textContent = state.score;
    $('m-done').textContent = `${state.missionsDone}/5`;
    $('m-credits').textContent = state.credits;
    $('shop-tank').textContent = state.upgrades.tank >= 2 ? 'MAXED' : `${world.fuelMax()} → ${[125, 150][state.upgrades.tank]} fuel · ${[150, 250][state.upgrades.tank]} cr`;
    $('shop-eng').textContent = state.upgrades.engine >= 2 ? 'MAXED' : `+9% thrust · 200 cr`;
    $('shop-han').textContent = state.upgrades.handling >= 2 ? 'MAXED' : `+15% roll · 180 cr`;
  }
  if (name === 'panel-over') {
    $('o-score').textContent = state.score;
    $('o-done').textContent = `${state.missionsDone}/5`;
  }
}
function fullReset() {
  state.score = 0; state.credits = 0; state.lives = 3; state.missionsDone = 0;
  world.startMission(0, 0);
  state.screen = 'play';
}
function nextMission() {
  if (state.missionIndex >= 4) { fullReset(); return; }
  world.startMission(state.missionIndex + 1, state.credits);
  state.screen = 'play';
}
function onKey(code, key) {
  if (code === 'Space') {
    audio.start();
    if (state.screen === 'panel-title') { state.screen = 'play'; }
    else if (state.screen === 'panel-mission') nextMission();
    else if (state.screen === 'panel-over') fullReset();
  } else if (code === 'KeyP') {
    if (state.screen === 'play') state.screen = 'panel-pause';
    else if (state.screen === 'panel-pause') state.screen = 'play';
  } else if (code === 'KeyM') {
    audio.toggleMute();
  } else if (code === 'KeyC') {
    if (state.screen === 'play') renderer.cameraMode = renderer.cameraMode === 'cockpit' ? 'chase' : 'cockpit';
  } else if (code === 'KeyB') {
    if (state.screen === 'play') world.drop();
  } else if (state.screen === 'panel-mission') {
    if (code === 'Digit1') world.buyUpgrade('tank');
    else if (code === 'Digit2') world.buyUpgrade('engine');
    else if (code === 'Digit3') world.buyUpgrade('handling');
  }
  showScreen(state.screen);
}

let shotFrozen = false;
let shotFrames = 0;
if (shotName) {
  const staged = stageShot(world, shotName);
  if (staged) {
    renderer.cameraMode = staged.camera;
    if (staged.dockLeft) $('panel-over').classList.add('left');
    shotFrozen = true;
    showScreen(state.screen);
  }
}
window.__shotReady = false;
window.__game = {
  get screen() { return state.screen; },
  world, renderer, onKey,
};

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.resize(w, h);
  cockpit.resizeRain(w, h);
}
window.addEventListener('resize', resize);
resize();
showScreen(state.screen);

let last = performance.now();
let lastScore = 0;
function frame(now) {
  const rawDt = Math.max(0, (now - last) / 1000);
  last = now;
  if (!shotFrozen) {
    // Fixed-timestep substeps: the game must run at real-time speed even when
    // the renderer is slow (headless / weak GPU), where a single clamped dt
    // would slow the whole simulation to a crawl. Physics stays stable at
    // 1/60s per step; the substep count is capped so one frame stays bounded.
    const STEP = 1 / 60;
    let acc = Math.min(rawDt, 1.0);
    let n = 0;
    while (acc >= STEP && n < 60) {
      state.elapsed += STEP;
      if (state.screen === 'play') {
        world.update(STEP, input);
        if (state.score > lastScore) { audio.ring(); lastScore = state.score; }
        audio.setEngine(state.plane.throttle, state.plane.speed);
      }
      acc -= STEP; n += 1;
    }
    showScreen(state.screen);
  }
  renderer.render(state, state.screen);
  cockpit.update(state, state.screen, renderer.cameraMode);
  if (shotFrozen) {
    shotFrames += 1;
    if (shotFrames >= 2) window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
