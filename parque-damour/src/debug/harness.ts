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
// S5: the State group gains pairs, featured and alumni (read only); the Park group land (07 S5.6 step 5: no ability triggers an
// embarrassment yet, so the harness lands one directly, as an ability will) and setPin (the Romances sheet's pin, UI state).
// S7: the Park group gains mode (read only: MODE, PLAYER, the avatar) and avatarEnter, avatarTap and avatarLeave, which enqueue the logged
// avatar commands as the shell will (the picker, a tap on the world, the Creator button).
// S6: the State group gains effects (the live list), the Park group ability (enqueues the logged `ability` command, as the rail will) and setProgress (the points a fixture starts from).
import { T } from '../core/clock.ts';
import { seedVisual, rngN } from '../core/rng.ts';
import { SIM_DT, SP, setSpeed, simulate, tick } from '../core/loop.ts';
import { AVATAR_SIDE, applyNow, enqueue, log, replay, type AbilityId, type Hit, type Pace, type Target } from '../core/commands.ts';
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
import { alumniState, featured, pairs, setPin } from '../entities/romance.ts';
import { effects } from '../play/abilities.ts';
import { getAvatar, getMode, getPlayer, type AvatarId } from '../play/mode.ts';
import type { XY } from '../core/math.ts';
import { progressState, setProgress } from '../play/progression.ts';
import { land } from '../entities/embarrass.ts';
import { FT, qualityLevel } from './perf.ts';

export type HarnessApi = { newPark: (seed: number) => void };

export function buildHarness(api: HarnessApi) {
  const state = {
    T,
    W,
    layers: { KIND, WEAR, OCC, WATER, ICE, WET, PETALS, BEDC, PAVEDAY },
    visitors,
    creatures,
    pairs,
    featured,
    alumni: alumniState,
    effects,
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
    /** Land an embarrassment of `kind` on visitor `id` now, as the mischief side (embarrass.ts land; not a command until S6). */
    land: (kind: Parameters<typeof land>[0], id: number) => land(kind, id, 'mischief'),
    /** Enqueues the logged `ability` command for `id` (its own side) at `target`; it applies on the next step and is validated there. */
    ability: (id: AbilityId, target: Target): void => {
      enqueue({ side: id.startsWith('c_') ? 'cupid' : 'mischief', kind: 'ability', payload: { id, target } });
    },
    /** MODE, PLAYER (0 for none) and the possessed avatar, read only (register 3.9). */
    mode: () => ({ mode: getMode(), player: getPlayer(), avatar: getAvatar() }),
    /** Enqueues the logged `avatar.enter` command for `avatar` on its own side; it applies on the next step (locked: reason.locked). */
    avatarEnter: (avatar: AvatarId): void => {
      enqueue({ side: AVATAR_SIDE[avatar], kind: 'avatar.enter', payload: { avatar } });
    },
    /** Enqueues the logged `avatar.tap` for `tile` with the hit the UI would have resolved (a bare tile by default), on the possessed avatar's side. */
    avatarTap: (tile: XY, hit?: Hit): void => {
      const a = getAvatar();
      enqueue({ side: a ? AVATAR_SIDE[a] : 'mischief', kind: 'avatar.tap', payload: { tile, hit: hit ?? { kind: 'tile', id: 0, tile } } });
    },
    /** Enqueues the logged `avatar.leave` on the possessed avatar's side. */
    avatarLeave: (): void => {
      const a = getAvatar();
      enqueue({ side: a ? AVATAR_SIDE[a] : 'mischief', kind: 'avatar.leave', payload: {} });
    },
    /** The profile's points, as a fixture sets them before a run (det-s6: tier 1 on both ladders); the announced ids stay. */
    setProgress: (cp: number, mp: number): void => setProgress({ cp, mp, unlocked: progressState().unlocked }),
    setPin,
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

