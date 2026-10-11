// src/audio/limiter.ts
// Ported from GV 6130–6137 (AGAP, aOK).
// Verdict: PORT. Changes: exported as gate(key, baseMs, soft, unscaled) (03 2.8); the speed clamp is 1–8, not 1–20 (register 20);
//   `unscaled` keeps real time for the foghorn and the bells (05 2.4 item 2); the audioOn/muted test moved out to cues.cue(),
//   which also tests audibility BEFORE calling here (05 2.4 item 3, review §8), so an inaudible cue never stamps a gap;
//   canPass/stamp split the test from the stamp so an actor cue can pass its own gate and the shared 'voice' gate together.
// Dropped from the range: nothing.
// Real time: `now` is the frame timestamp the conductor hands over through setNow(ms) (05 2.4 item 1); this module never reads
//   the wall clock itself. Until S8 wires loop.ts, the board's own rAF loop feeds it.
import { clamp } from '../core/math.ts';
import { T } from '../core/clock.ts';

const GAP = new Map<string, number>();
let nowMs = 0;

/** The current real-time stamp in ms (the rAF timestamp), set once per frame by the conductor. */
export function setNow(ms: number): void {
  nowMs = ms;
}
export function now(): number {
  return nowMs;
}

/** The gap a key must respect right now (GV 6133–6134 with the 1–8 clamp). Paused (speed 0) counts as 1×. */
export function gapMs(baseMs: number, soft = false, unscaled = false): number {
  const sp = clamp(T.speed || 1, 1, 8);
  const scale = unscaled ? 1 : soft ? 1 + (sp - 1) * 0.45 : sp;
  return Math.round(baseMs * scale * 1e6) / 1e6; // 100 x 4.15 is 415, not 415.00000000000006
}

/** True when `key` may sound now; does not stamp. */
export function canPass(key: string, baseMs: number, soft = false, unscaled = false): boolean {
  return nowMs - (GAP.get(key) ?? -1e9) >= gapMs(baseMs, soft, unscaled);
}

/** Record that `key` sounded now. */
export function stamp(key: string): void {
  GAP.set(key, nowMs);
}

/** GV aOK 6131–6137: pass and stamp, or refuse. */
export function gate(key: string, baseMs: number, soft = false, unscaled = false): boolean {
  if (!canPass(key, baseMs, soft, unscaled)) return false;
  stamp(key);
  return true;
}

/** The last stamp of a key, or undefined when it never sounded (tests, harness). */
export function lastStamp(key: string): number | undefined {
  return GAP.get(key);
}

export function resetGaps(): void {
  GAP.clear();
}
