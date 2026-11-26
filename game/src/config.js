// Meridian Sky Courier — valley edition. One deep valley runs north to the sea:
// Mount Meridian stands at its head, a river winds down its floor, patchwork
// fields line the banks, pine forest climbs the walls. The jet flies THROUGH
// the valley, low and close, never above a flat map.
export const CFG = {
  seed: 1,
  waterLevel: -1.5,
  valleyHalf: 340,        // valley floor half-width
  wallStart: 420,         // where the side walls begin to rise
  wallTop: 1050,          // where the walls crest
  mountain: { x: 0, z: -2350, r: 720, peak: 520, snow: 250 },
  seaZ: 1650,             // south of here the valley opens to the sea
  plane: {
    maxSpeed: 96, cruise: 46, takeoff: 26,
    accel: 44, drag: 5, speedDrag: 0.05,
    turnRate: 0.85, pitchRate: 1.15, maxRoll: 0.95, maxPitch: 0.5,
    fuelDrain: 0.75, fuelMax: 100, stallSpeed: 22,
  },
  rings: { radius: 13, score: 150, fuelScore: 50, fuelGain: 60 },
  storm: { radius: 26 },
  fire: { count: 3, score: 250 },
  supply: { parcels: 4, zones: 4 },
  grades: { perfect: 400, good: 200, rough: 50 },
  shop: { tankCost: [150, 250], tankMax: [100, 125, 150] },
  lives: 3,
};
