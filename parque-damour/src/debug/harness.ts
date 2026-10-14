// src/debug/harness.ts
// window.__PD for the console, the determinism runner and screenshot assertions (03 section 13).
// Ported from GV 12223-12241 (window.__GV). ADAPT: installed only in a DEV build (`import.meta.env.DEV`), never in dist/ (03 section 13, A20);
// `#dev` in the hash sets `body.dev` (03 10.2) and does not install it. Only what section 13 lists, built from named groups spread into one
// object so a duplicate key is impossible (09 5.3 rule 4). Nothing here writes sim state except through enqueue, apply, replay, restore,
// newPark, setWeather and simulate (09 5.3 rule 1).
// Groups present in S2: State, Stepping, Commands, Picking, Save (snapshot, restore), Park (newPark, setWeather), Render, Screenshots
// (seedVisual, fxStep), Meta. Later slices add: State visitors/pairs/creatures/effects (S4-S6) and feed() (S3), Picking tap (S4), Save
// savePark/loadPark/clearAll (S3), Park callVisitor (S4), Render DBG, Audio (S8). restore drops the old scene's particles, as newPark does.
// S3 part A: this file imports play/tools.ts (and with it play/undo.ts) for their `tool` and `undo` handlers, so `apply` and `enqueue` place
// tools in the dev page (09 5.4, tools/det.mjs on det-s3) before part C's rail imports them from main.ts; no member is added (03 13).
// S3 part B: the Save group gains savePark, loadPark and clearAll (03 13): the two parque: keys through save/store.ts, nothing else.
// S4 part B: the State group gains visitors and creatures (the live lists, read only), the Park group callVisitor (it enqueues the logged
// `visitor.call` command, 03 5.1, as setWeather does).
// Park pace (owner 2026-10-14): the Park group gains setPace, which enqueues the logged `park.pace` command as setWeather does.
import { T } from '../core/clock.ts';
import { seedVisual, rngN } from '../core/rng.ts';
import { SIM_DT, SP, setSpeed, simulate, tick } from '../core/loop.ts';
import { applyNow, enqueue, log, replay, type Pace } from '../core/commands.ts';
import { drain } from '../core/events.ts';
import { W, type WeatherKind } from '../core/weather.ts';
import { BEDC, ICE, KIND, OCC, PAVEDAY, PETALS, WATER, WEAR, WET, props } from '../world/grid.ts';
import { cam, view } from '../render/camera.ts';
import { pickAt, screenOf, screenToTile } from '../render/project.ts';
import { draw, getCtx } from '../render/draw.ts';
import { clearParticles, fxStep } from '../render/effects.ts';
import { SCHEMA_VERSION } from '../save/schema.ts';
import { clearAll, loadPark, restore, savePark, snapshot, stateHash, worldHash } from '../save/store.ts';
import '../play/tools.ts';
import { visitors } from '../entities/visitor.ts';
import { creatures } from '../entities/creatures.ts';
import { FT, qualityLevel } from './perf.ts';

export type HarnessApi = { newPark: (seed: number) => void };

export function buildHarness(api: HarnessApi) {
  const state = {
    T,
    W,
    layers: { KIND, WEAR, OCC, WATER, ICE, WET, PETALS, BEDC, PAVEDAY },
    visitors,
    creatures,
    props,
    cam,
  };
  const stepping = {
    /** Run `n` fixed steps with lite 0 (the exact path), drain the events they queued, and return the tick. */
    simulate: (n = 1): number => {
      for (let i = 0; i < n; i++) simulate(SIM_DT, 0);
      drain(0);
      return tick();
    },
    tick,
    rngN,
    hash: stateHash,
    worldHash,
    setSpeed,
    SP,
  };
  const commands = { enqueue, apply: applyNow, log, replay };
  const picking = { pick: pickAt, screenOf, screenToTile };
  const save = {
    snapshot,
    /** Restore a snapshot; the particles belong to the old scene and go (03 7.8; the props builder's note). */
    restore: (s: Parameters<typeof restore>[0]): void => {
      restore(s);
      clearParticles();
    },
    /** Write parque:park-v1 and parque:profile-v1 now; false when the storage refused (a `warn` event says which key). */
    savePark,
    /** The saved park, migrated, or null; it is not restored (pass it to restore). */
    loadPark,
    /** Remove both parque: keys and put the in-memory profile back to its defaults. */
    clearAll,
  };
  const park = {
    newPark: api.newPark,
    /** Enqueues the logged `debug.weather` command; it applies on the next step. */
    setWeather: (kind: WeatherKind): void => {
      enqueue({ side: 'park', kind: 'debug.weather', payload: { kind } });
    },
    /** Enqueues the logged `visitor.call` command (the "+" on the Visitors chip, 02 12.2); a park at 30 rejects it with reason.park_full. */
    callVisitor: (): void => {
      enqueue({ side: 'park', kind: 'visitor.call', payload: { gate: null } });
    },
    /** Enqueues the logged `park.pace` command (register section 4, Park pace and Options); it applies on the next step. */
    setPace: (pace: Pace): void => {
      enqueue({ side: 'park', kind: 'park.pace', payload: { pace } });
    },
  };
  const render = {
    draw,
    pix: (x: number, y: number, w: number, h: number): number[] => {
      const d = getCtx().getImageData(x * view.dpr, y * view.dpr, w * view.dpr, h * view.dpr);
      return Array.from(d.data);
    },
    dpr: (): number => view.dpr,
    FT,
    qualityLevel,
  };
  /** seedVisual reseeds the visual stream; fxStep(dt, n) runs n steps of ambient spawning and particle motion, paused or not (08 4.1). */
  const screenshots = { seedVisual, fxStep };
  const meta = { version: 'dev', schemaVersion: SCHEMA_VERSION };
  return { ...state, ...stepping, ...commands, ...picking, ...save, ...park, ...render, ...screenshots, ...meta };
}

export type Harness = ReturnType<typeof buildHarness>;

export function installHarness(api: HarnessApi): void {
  (window as unknown as { __PD: Harness }).__PD = buildHarness(api);
}

