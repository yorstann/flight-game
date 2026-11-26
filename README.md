# Meridian Sky Courier — valley edition

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/yorstann/flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/yorstann/flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A 3D flight game built from scratch in hand-rolled WebGL — no libraries, no network. One deep valley runs north to Mount Meridian and south to the sea: a winding river, patchwork farmland, pine forests on the walls, villages on the floor. The jet flies **through** the valley, low and close, never above a flat map.

## Five missions

1. **Golden Hour Run** — thread 6 gold rings down the valley, land at North Field.
2. **Fire Bomber** — scoop water low over the sea, douse 3 wildfires, land at North Field. Water weight makes the jet heavier.
3. **Supply Drop** — drop 4 parcels on the valley markers (accuracy scoring), land at North Field.
4. **Crosswind Courier** — a dusk run with a crosswind and a **graded landing** (PERFECT / GOOD / ROUGH).
5. **Night Mail & Rescue** — night rain: land at the remote Far Strip, pick up the hiker, bring them home.

## Systems

- Weight and stall: water and cargo change how the jet climbs; slow + nose-up stalls.
- Credits and upgrades between missions: bigger tank, engine tune, handling.
- Cockpit camera (C): a full POV cockpit — six live dials, two glass MFDs (map + engine), throttle and flap levers, yoke, pedals, rain on the canopy.
- Tower radio, minimap, graded landings, damage and lives.

## Controls

Arrows steer · Shift / Ctrl throttle · B drop water or parcel · C cockpit · P pause · M sound · Space start / advance.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Screenshots are staged deterministically with `?shot=start|play|night|end&seed=1`.
