// src/core/rng.ts
// Two mulberry32 streams with a draw counter: rng() decides what happens in the sim, vrng() decides only how it looks.
// Ported from GV 583-598 (mulberry32, rng, rnd, rint, pick, chance, vrng, vrnd, vrint, vpick, vchance). PORT.
// Added: seedSim, seedVisual, simState, setSimState, visState, setVisState so a save and a test can read and restore both streams (03 2.3, 3.10).
// save/store.ts stores simState(), rngN() and visState() in the snapshot; the determinism test reads rngN().

type Stream = { a: number };

/** One draw of mulberry32 on a mutable 32-bit state (GV 588-589). */
function next(s: Stream): number {
  s.a = (s.a + 0x6d2b79f5) | 0;
  let t = Math.imul(s.a ^ (s.a >>> 15), 1 | s.a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A standalone generator for lookup tables (GV 588; used by math.noise2). */
export function mulberry32(seed: number): () => number {
  const s: Stream = { a: seed | 0 };
  return () => next(s);
}

const sim: Stream = { a: 1 };
const vis: Stream = { a: 7 };
let drawN = 0;

/* ---------- the sim stream: every decision that changes state ---------- */
export function seedSim(seed: number): void {
  sim.a = seed | 0;
  drawN = 0;
}
export function rng(): number {
  drawN++;
  return next(sim);
}
export function rnd(a = 1, b?: number): number {
  return b === undefined ? rng() * a : a + rng() * (b - a);
}
export function rint(a: number, b: number): number {
  return Math.floor(rnd(a, b + 1));
}
export function pick<T>(arr: readonly T[]): T {
  return arr[(rng() * arr.length) | 0] as T;
}
export function chance(p: number): boolean {
  return rng() < p;
}
/** Draws made on the sim stream since the last seed: where two runs part, this tells. */
export function rngN(): number {
  return drawN;
}
export function simState(): number {
  return sim.a;
}
export function setSimState(state: number, n: number): void {
  sim.a = state | 0;
  drawN = n;
}

/* ---------- the visual stream: particles, sky, sound; never the sim ---------- */
export function seedVisual(seed: number): void {
  vis.a = seed | 0;
}
export function visState(): number {
  return vis.a;
}
export function setVisState(state: number): void {
  vis.a = state | 0;
}
export function vrng(): number {
  return next(vis);
}
export function vrnd(a = 1, b?: number): number {
  return b === undefined ? vrng() * a : a + vrng() * (b - a);
}
export function vrint(a: number, b: number): number {
  return Math.floor(vrnd(a, b + 1));
}
export function vpick<T>(arr: readonly T[]): T {
  return arr[(vrng() * arr.length) | 0] as T;
}
export function vchance(p: number): boolean {
  return vrng() < p;
}
