// Deterministic screenshot staging: each ?shot= scene sets the plane pose,
// mission state and a FROZEN elapsed, so the frame is byte-identical on every
// shoot. Nothing here reads real time or Math.random.
export function stageShot(world, name) {
  const s = world.state;
  s.shotCam = null;
  s.rainShot = false;
  if (name === 'start') {
    world.startMission(0, 0);
    Object.assign(s.plane, { x: 60, y: 62, z: 1050, heading: 0, pitch: 0.02, roll: 0, speed: 46, throttle: 0.75, vy: 0 });
    s.grounded = false; s.groundedStrip = null;
    s.elapsed = 14; s.screen = 'play';
    return { camera: 'chase' };
  }
  if (name === 'play') {
    world.startMission(2, 0);
    Object.assign(s.plane, { x: 20, y: 95, z: 900, heading: 0, pitch: 0.02, roll: 0, speed: 40, throttle: 0.7, vy: 0 });
    s.grounded = false; s.groundedStrip = null;
    s.drops = [{ x: 20, y: 78, z: 840, vx: 0, vy: -4, vz: -24, t: 0.8, chute: true }];
    s.elapsed = 18; s.screen = 'play';
    return { camera: 'chase' };
  }
  if (name === 'night') {
    world.startMission(0, 0);
    s.rings.forEach((r) => { r.passed = true; });
    Object.assign(s.plane, { x: 40, y: 58, z: 200, heading: 0, pitch: 0.02, roll: 0, speed: 46, throttle: 0.75, vy: 0 });
    s.grounded = false; s.groundedStrip = null;
    s.rainShot = true; s.elapsed = 22; s.screen = 'play';
    s.tower = 'Meridian Tower: Golden Hour Run complete — ring 6/6';
    return { camera: 'cockpit' };
  }
  if (name === 'end') {
    world.startMission(0, 0);
    s.missionsDone = 3; s.score = 1500; s.credits = 1500;
    Object.assign(s.plane, { x: -20, y: 155, z: -1070, heading: 0, pitch: 0.02, roll: 0, speed: 50, throttle: 0.75, vy: 0 });
    s.grounded = false; s.groundedStrip = null;
    s.elapsed = 26; s.screen = 'panel-over';
    s.shotCam = { eye: [30, 175, -1000], at: [-20, 150, -1150] };
    return { camera: 'chase', dockLeft: true };
  }
  return null;
}
