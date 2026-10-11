// src/debug/harness.ts
// window.__PD for the console, the determinism runner and screenshot assertions (03 section 13).
// Ported from GV 12223-12241 (window.__GV). ADAPT: installed only in DEV or under a #debug hash, and only what section 13 lists.
// TODO(S2): hash(), commands, save, weather, audio groups.
import { T } from '../core/clock.ts';
import { rngN } from '../core/rng.ts';
import { SIM_DT, simulate, tick, setSpeed } from '../core/loop.ts';
import { KIND, WEAR, OCC, WATER, ICE, WET, PETALS, BEDC } from '../world/grid.ts';
import { cam, view, fitCam } from '../render/camera.ts';
import { screenOf, screenToTile } from '../render/project.ts';
import { draw } from '../render/draw.ts';

export type HarnessApi = { newPark: (seed: number) => void };

export function installHarness(api: HarnessApi): void {
  const pd = {
    T,
    cam,
    view,
    layers: { KIND, WEAR, OCC, WATER, ICE, WET, PETALS, BEDC },
    getClock: () => ({ ...T }),
    simulate: (n = 1): number => {
      for (let i = 0; i < n; i++) simulate(SIM_DT, 0);
      return tick();
    },
    tick,
    rngN,
    setSpeed,
    draw,
    fitCam,
    screenOf,
    screenToTile,
    newPark: api.newPark,
  };
  (window as unknown as { __PD: typeof pd }).__PD = pd;
}
