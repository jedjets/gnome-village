// src/audio/music-switch.ts
// The switch between motif B and motif C (05 5.4; 07 S8.6 step 7): when it may happen and what it schedules. Pure arithmetic on times,
// no AudioContext: music.ts applies the plan to the motif gains and the music room and logs it. A leaf of music.ts (it imports nothing).
// The rules: the clock's wanted motif is read once per bar of the playing motif; a change waits for the playing motif's next phrase start T
// (B every 4 bars, C every 2); the incoming motif starts its first bar at T, the outgoing keeps scheduling until T + 2 s, each motif has its
// own gain into musicBus (linear ramps over [T, T + 2 s], the room return from the outgoing reverb knob to the incoming one); one switch at a
// time; a switch never touches musicBus. NEW.
import type { MotifId } from './music-state.ts';

export const XFADE_S = 2; // register 3.13 and section 4: ADVISED, the owner may change it (05 9 open point 1)
/** A phrase = the unit a switch and a variant change wait for (05 5.1 item 6): B 4 bars (12 melody notes), C 2 bars (a sung bar and its answer). */
export const PHRASE_BARS: Record<MotifId, number> = { B: 4, C: 2 };

/** A switch under way: `from` plays until `end`, `to` has played since `t`. */
export interface Xfade { from: MotifId; to: MotifId; t: number; end: number }

/** Bar `bar` (counted from the motif's start, 0 first) is a phrase start of `id`. */
export function isPhraseStart(id: MotifId, bar: number): boolean {
  return bar % PHRASE_BARS[id] === 0;
}
/** The decision of one bar-build of the playing motif: switch now (at this bar's start) when the clock wants the other motif, this bar is a phrase start and no switch is running. */
export function shouldSwitch(playing: MotifId, wanted: MotifId, bar: number, busy: boolean): boolean {
  return !busy && wanted !== playing && isPhraseStart(playing, bar);
}
export function startXfade(from: MotifId, to: MotifId, t: number): Xfade {
  return { from, to, t, end: t + XFADE_S };
}

/** One parameter ramp of a switch, on the audio clock: a motif's gain into musicBus, or the music room's return. */
export interface Ramp { target: 'gain' | 'room'; motif: MotifId; from: number; to: number; t0: number; t1: number }
/**
 * The three ramps of a switch (05 5.4 item 4c and 4d): the incoming gain 0 to 1 and the outgoing 1 to 0 over [T, T + 2 s], linear, and the room
 * return from the outgoing motif's reverb knob to the incoming one's over the same time (C 0.30 and B 0.45 at the gate values).
 */
export function rampPlan(x: Xfade, roomFrom: number, roomTo: number): Ramp[] {
  return [
    { target: 'gain', motif: x.to, from: 0, to: 1, t0: x.t, t1: x.end },
    { target: 'gain', motif: x.from, from: 1, to: 0, t0: x.t, t1: x.end },
    { target: 'room', motif: x.to, from: roomFrom, to: roomTo, t0: x.t, t1: x.end },
  ];
}
