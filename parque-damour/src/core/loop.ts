// src/core/loop.ts
// The conductor: fixed-step simulate() and the requestAnimationFrame frame() with the speed dial, nsMax, wall budget and lite bits.
// Ported from GV 12013-12096 (SP, simulate, SIM_DT, simAcc, frame). PORT of the frame shape; S0 steps only the clock.
// This is the one module allowed to call performance.now (07 0.7 item 6). Frame listeners are registered by main.ts (03 2.1: L4 imports L0-L3 only).
// TODO(S2): phases 2-13 of 03 4.2 inside simulate; events.drain, particles, audio, camera follow and perf in frame (03 4.1).
import { clamp } from './math.ts';
import { T, stepClock } from './clock.ts';

export const SIM_DT = 1 / 60;
/** Milliseconds spent per sim phase since boot (GV 12014). */
export const SP: Record<string, number> = { time: 0 };

export type FrameFn = (dtr: number, steps: number) => void;

let tickN = 0;
let simAcc = 0;
let last = 0;
let running = false;
const frameFns: FrameFn[] = [];

/** Integer steps since the park began (saved). */
export function tick(): number {
  return tickN;
}

/** Restart the step count for a new park (or set it from a save). */
export function setTick(n: number): void {
  tickN = n;
  simAcc = 0;
  stepClock(tickN);
}

/** One fixed step. `lite` bits only ever drop frame-side work, never sim state (03 4.5). */
export function simulate(_dt: number, _lite: number): void {
  const t0 = performance.now();
  tickN++;
  stepClock(tickN);
  SP.time = (SP.time ?? 0) + performance.now() - t0;
}

/** 0 pauses; 1-8 is the dial (register 3.2). */
export function setSpeed(v: number): void {
  T.speed = v <= 0 ? 0 : clamp(Math.round(v), 1, 8);
  if (T.speed > 0) simAcc = 0;
}

export function onFrame(fn: FrameFn): void {
  frameFns.push(fn);
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
  const f0 = performance.now();
  simAcc += dtr * T.speed;
  let ns = 0;
  const nsMax = clamp(Math.ceil(T.speed * 2.2) + 4, 8, 48);
  const tBudget = f0 + (T.speed > 6 ? 26 : T.speed > 3 ? 13 : 9);
  const lite = T.speed > 6 ? 3 : 1;
  while (simAcc >= SIM_DT && ns < nsMax) {
    simulate(SIM_DT, lite);
    simAcc -= SIM_DT;
    ns++;
    if (ns >= 8 && performance.now() > tBudget) break;
  }
  if (ns >= nsMax || simAcc > SIM_DT * nsMax) simAcc = 0; // a long stall drops steps rather than racing to catch up (GV 12086)
  for (const fn of frameFns) fn(dtr, ns);
}
