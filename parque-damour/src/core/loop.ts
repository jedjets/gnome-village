// src/core/loop.ts
// The conductor: fixed-step simulate() and the requestAnimationFrame frame() with the speed dial, nsMax, wall budget and lite bits.
// Ported from GV 12013-12096 (SP, simulate, SIM_DT, simAcc, frame). Verdict: PORT of the frame shape; ADAPT of the step.
// Changes: simulate runs the phases of 03 4.2 (commands first, then clock, weather, ice; the water solver, surface rebuild, flora, critters,
// particles and breeding of GV 12026-12039 are dropped); the lite bits only ever drop frame-side events (03 4.5, A12), they change no sim
// value; particles step on the frame, not here (A11); speed 0-8 (GV 1-20). A paused frame applies pending `speed` commands only (03 4.6),
// or the speed command that unpauses could never run; every other command waits for the first step, so live order equals replay order.
// Dropped from the range: 12026-12031 (water, slump, surface), 12033-12037 (materials, index, gnomes, flora, critters, parts), 12039 (breeding).
// This is the one module allowed to read the wall clock (07 0.7 item 6). Frame listeners are registered by main.ts (03 2.1: L4 imports L0-L3).
// Phases 5 to 10 and 12 are kept in order as empty calls: S4 to S6 fill them (listed in the S2 hand-back).
import { clamp } from './math.ts';
import { T, isNewDay, stepClock, syncClock } from './clock.ts';
import { forceWeather, stepWeather, stepWet } from './weather.ts';
import { OK, applyPending, clearPending, registerHandler, resetCommands, setStepper, setTickSource } from './commands.ts';
import { clearEvents, drain, markStep } from './events.ts';
import { genPark } from '../world/gen.ts';
import { props } from '../world/grid.ts';
import { stepIce } from '../world/water.ts';
import { decayWear } from '../world/wear.ts';
import { charmDirty, markCharmDirty, rebuildCharm } from '../world/charm.ts';
import { setMode } from '../play/mode.ts';

export const SIM_DT = 1 / 60;
/** Milliseconds spent per sim phase since boot (GV 12014; the names are the phases of 03 4.2). */
export const SP: Record<string, number> = { cmd: 0, time: 0, weather: 0, day: 0, abilities: 0, arrivals: 0, visitors: 0, creatures: 0, romance: 0, wear: 0, plan: 0, charm: 0 };

export type FrameFn = (dtr: number, steps: number) => void;
/** Called at the end of every frame with the ms spent in the sim steps, in the frame listeners, and in all, and the rAF timestamp (GV ftNote 12057). */
export type FrameEndFn = (simMs: number, restMs: number, totalMs: number, ts: number) => void;

let tickN = 0;
let simAcc = 0;
let last = 0;
let nowMs = 0;
let running = false;
const frameFns: FrameFn[] = [];
const endFns: FrameEndFn[] = [];

/** Integer steps since the park began (saved). */
export function tick(): number {
  return tickN;
}

/** The rAF timestamp of the current frame in ms: the one real-time stamp audio and the perf overlay may read (03 2.3). */
export function now(): number {
  return nowMs;
}

/**
 * Put the step count at `n` (a new park or a restore): the clock is set without events, and the queued commands and events, which belong
 * to the old timeline, are dropped.
 */
export function setTick(n: number): void {
  tickN = n;
  simAcc = 0;
  syncClock(tickN);
  clearPending();
  clearEvents();
}

/**
 * Start a park from `seed`: the world, creator mode with no possessed actor, an empty command log, tick 0. Every state object is rebuilt
 * through its module's factory (09 4 row 7); MODE and PLAYER are saved and hashed, so a park.new issued in avatar mode must not carry over.
 */
export function newPark(seed: number): void {
  genPark(seed);
  setMode('creator');
  resetCommands();
  setTick(0);
}

/** One fixed step (03 4.2). `lite` is accepted for the frame's calls but changes nothing here: it only trims events at drain (03 4.5). */
export function simulate(dt: number, _lite: number): void {
  let t = performance.now();
  const lap = (k: string): void => {
    const n = performance.now();
    SP[k] = (SP[k] ?? 0) + n - t;
    t = n;
  };
  tickN++; // 1 tick
  applyPending(tickN); // 2 commands, in (tick, side, seq) order
  lap('cmd');
  if (tickN === 0) {
    markStep(); // a park.new in this step restarted the park at tick 0: this step is its beginning, nothing more runs
    return;
  }
  const lamps0 = T.lamps;
  stepClock(tickN); // 3 time: emits newday, season and lampsLit
  if (T.lamps !== lamps0) markCharmDirty(); // a lamp counts for charm only while lit (03 4.2 phase 13, 6.7)
  lap('time');
  stepWeather(dt, tickN); // 4 weather, the WET layer, ice
  stepWet(dt);
  stepIce(dt);
  lap('weather');
  if (isNewDay()) {
    /* 5 day reset: abilities.resetCharges, embarrass.resetDay, names.stepRegularReturns, the progression tally (S4, S5, S6) */
  }
  lap('day');
  /* 6 stepAbilities (S6) */
  lap('abilities');
  /* 7 stepArrivals (S4) */
  lap('arrivals');
  /* 8 stepVisitors (S4) */
  lap('visitors');
  /* 9 stepCreatures (S4) */
  lap('creatures');
  /* 10 stepRomance (S5) */
  lap('romance');
  if (tickN % 60 === 0) decayWear(); // 11 wear: once per sim second, counted in whole steps so no float sum drifts
  lap('wear');
  /* 12 the 1.2 s planning tick (S4) */
  lap('plan');
  if (charmDirty()) rebuildCharm(props, T.lamps); // 13 charm
  lap('charm');
  markStep();
}

/** 0 pauses; 1-8 is the dial (register 3.2). */
export function setSpeed(v: number): void {
  T.speed = v <= 0 ? 0 : clamp(Math.round(v), 1, 8);
  simAcc = 0; // a change of dial, a pause from a command in the middle of a frame included, starts the accumulator over
}

/** Steps a frame may run at this speed (GV 12082): clamp(ceil(speed * 2.2) + 4, 8, 48). */
export function nsMax(speed: number): number {
  return clamp(Math.ceil(speed * 2.2) + 4, 8, 48);
}
/** The wall-clock budget of a frame's steps in ms (GV 12082): 26 above 6x, 13 above 3x, else 9. */
export function budgetMs(speed: number): number {
  return speed > 6 ? 26 : speed > 3 ? 13 : 9;
}
/** The lite bits a frame passes (GV 12083): 3 above 6x, else 1. */
export function liteFor(speed: number): number {
  return speed > 6 ? 3 : 1;
}

export function onFrame(fn: FrameFn): void {
  frameFns.push(fn);
}
export function onFrameEnd(fn: FrameEndFn): void {
  endFns.push(fn);
}

export function start(): void {
  if (running) return;
  running = true;
  requestAnimationFrame(frame);
}

function frame(ts: number): void {
  requestAnimationFrame(frame); // first, so a thrown error never stops the loop (03 4.1 item 1)
  if (!last) last = ts;
  const dtr = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  nowMs = ts;
  const f0 = performance.now();
  simAcc += dtr * T.speed;
  let ns = 0;
  const nm = nsMax(T.speed);
  const tBudget = f0 + budgetMs(T.speed);
  const lite = liteFor(T.speed);
  while (simAcc >= SIM_DT && ns < nm) {
    simulate(SIM_DT, lite);
    simAcc -= SIM_DT;
    ns++;
    if (ns >= 8 && performance.now() > tBudget) break;
  }
  if (ns >= nm || simAcc > SIM_DT * nm) simAcc = 0; // a long stall drops steps rather than racing to catch up (GV 12086)
  if (T.speed === 0) applyPending(tickN + 1, 'speed'); // paused: only `speed` applies, so the dial can unpause; the rest wait for the step (03 4.6)
  const f1 = performance.now();
  drain(lite); // 03 4.1 item 6
  for (const fn of frameFns) fn(dtr, ns);
  const f2 = performance.now();
  for (const fn of endFns) fn(f1 - f0, f2 - f1, f2 - f0, ts);
}

/* What the S2 commands do. The module that owns a kind registers it (commands.ts), and this file owns these three. */
setTickSource(tick);
setStepper(() => simulate(SIM_DT, 0));
registerHandler('speed', (c) => {
  setSpeed(c.payload.speed);
  return OK;
});
registerHandler('park.new', (c) => {
  newPark(c.payload.seed);
  return OK;
});
registerHandler('debug.weather', (c) => {
  forceWeather(c.payload.kind);
  return OK;
});
