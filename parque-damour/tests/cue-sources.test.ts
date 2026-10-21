// tests/cue-sources.test.ts
// Locks 05 3.2 rows 4, 9, 34 and 38 where the simulation does not hand the audio a ready-made event (S8 part A fix round; 08 2.8 row 3):
// the Chat's `murmur` every 3 s with the speaker alternating (the sim emits `chat` once a stage, so cues-bind.ts reads the turns from the state, as the
// talk bubble of render/people.ts is drawn), the proposal's `ring` at the sim's own `fx` spark (8 s into the kneel, at the kneeler), `ready` when
// a cooldown runs out with a charge left or the charges come back at f = 0, and `refuse` for every refusal hud.ts toasts. The dry run of 05 8.3
// stands in for the device; the sim is never written to.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DAYLEN, T } from '../src/core/clock.ts';
import { newPark, setTick } from '../src/core/loop.ts';
import { clearListeners, type EventFn, type EventKind, type GameEvent } from '../src/core/events.ts';
import { seedVisual } from '../src/core/rng.ts';
import { resetCharges, setAbilitiesState } from '../src/play/abilities.ts';
import { resetRomance, tryForm, type Pair } from '../src/entities/romance.ts';
import { byId, resetVisitors, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';
import { CTR, cam, centreOn, setViewport } from '../src/render/camera.ts';
import { CHAT_TURN_S as BUBBLE_TURN_S } from '../src/render/people.ts';
import { auditLog, clearLog, dryCalls, dryNotes, setDryRun, setMuted } from '../src/audio/engine.ts';
import { resetGaps, setNow } from '../src/audio/limiter.ts';
import { CHAT_TURN_S, bindCues, resetCueSources, updateCueSources, type EventBus } from '../src/audio/cues-bind.ts';
import { resetAmbience, setAmbienceEnv } from '../src/audio/ambience.ts';

/** A bus that keeps the handlers, so a test can fire an event at them. */
function spyBus(): { bus: EventBus; fire: (ev: Partial<GameEvent> & { kind: EventKind }) => void } {
  const map = new Map<EventKind, EventFn[]>();
  const bus: EventBus = { watch: (k, fn) => map.set(k, [...(map.get(k) ?? []), fn]) };
  return {
    bus,
    fire: (ev) => {
      for (const fn of map.get(ev.kind) ?? []) fn({ tick: 0, ...ev } as GameEvent);
    },
  };
}
const played = (): string[] => auditLog().filter((r) => r.played).map((r) => r.id);

/** A morning of day 4, 10 ms past a talk turn's start (every pair's turns start on a multiple of 3 sim s): sec 0 opens a turn, the next opens at 2.99. */
const BASE_S = Math.ceil((3.25 * DAYLEN) / CHAT_TURN_S) * CHAT_TURN_S + 0.01;
let ms = 0;
/** The sim clock at `sec` seconds past BASE_S, and the limiter's real stamp 50 ms on: one frame of updateCueSources. */
function frame(sec: number): void {
  T.abs = (BASE_S + sec) / DAYLEN;
  ms += 50;
  setNow(ms);
  updateCueSources(0.05);
}

beforeEach(() => {
  clearListeners();
  newPark(101);
  resetVisitors();
  resetRomance();
  seedVisual(7);
  setViewport(390, 844, 1);
  cam.z = 1.3;
  centreOn(CTR, CTR);
  setMuted(false);
  setDryRun(true);
  clearLog();
  dryCalls(true);
  dryNotes(true);
  resetGaps();
  resetAmbience();
  resetCueSources();
  setAmbienceEnv(null);
  T.speed = 1;
  ms = 0;
  setNow(0);
  setTick(0);
});
afterEach(() => {
  setDryRun(false);
  setAbilitiesState(undefined, undefined);
});

/** A formed pair, her (f) and him (m), standing in place at (x, y) with their Chat on. */
function chatters(x = CTR, y = CTR, seed = 0): { a: Visitor; b: Visitor; p: Pair } {
  const a = spawnVisitor('single', 'g_west', { sex: 'f', seeks: 'm', name: 'Fleur' + seed }) as Visitor;
  const b = spawnVisitor('single', 'g_west', { sex: 'm', seeks: 'f', name: 'Marc' + seed }) as Visitor;
  Object.assign(a, { x, y, st: 'idle', path: null });
  Object.assign(b, { x: x + 1, y, st: 'idle', path: null });
  const p = tryForm(a, b, true) as Pair;
  expect(p).toBeTruthy();
  for (const v of [a, b]) Object.assign(v, { st: 'chat', path: null, x: v === a ? x : x + 1, y });
  return { a, b, p };
}
/** The first pitch of each murmur played so far: her base is 260 Hz, his 190, each within 10 %. */
const murmurPitches = (): number[] => dryNotes().filter((_n, i) => i % 4 === 0).map((n) => n.f);

describe('05 3.2 row 4: the murmur sounds every 3 s of a Chat, the speaker alternating', () => {
  it('the bubble\'s turn and the murmur\'s are one number', () => {
    expect(CHAT_TURN_S).toBe(BUBBLE_TURN_S);
    expect(CHAT_TURN_S).toBe(3);
  });

  it('30 sim seconds of Chat give a murmur at each turn, her voice and his in turn; the `chat` event itself is silent', () => {
    const s = spyBus();
    bindCues(s.bus);
    const { a, b, p } = chatters();
    s.fire({ kind: 'chat', x: CTR, y: CTR, ids: [a.id, b.id] });
    expect(played()).toEqual([]);
    for (let i = 0; i < 600; i++) frame(i * 0.05);
    expect(played().filter((id) => id === 'murmur')).toHaveLength(10); // turns at 0, 2.99, 5.99 ... 26.99
    const pitches = murmurPitches();
    // the speaker of the first turn is the one the bubble names (render/people.ts chatBubble): floor(sim s / 3 + pair id) even is the pair's a
    const aIsHer = byId(p.a)?.sex === 'f';
    const firstIsHer = (Math.floor(BASE_S / CHAT_TURN_S + p.id) % 2 === 0) === aIsHer;
    pitches.forEach((f, i) => {
      const her = (i % 2 === 0) === firstIsHer;
      if (her) expect(f).toBeGreaterThanOrEqual(260 * 0.9 - 1e-6);
      else expect(f).toBeLessThanOrEqual(190 * 1.1 + 1e-6);
    });
    expect(pitches.some((f) => f >= 234)).toBe(true);
    expect(pitches.some((f) => f <= 209)).toBe(true);
  });

  it('one murmur per turn however many frames the turn lasts, and none while the sim clock stands still (paused)', () => {
    chatters();
    for (let i = 0; i < 40; i++) frame(10 + i * 0.01); // 0.4 sim s in 40 frames: one turn
    expect(played().filter((id) => id === 'murmur')).toHaveLength(1);
    clearLog();
    for (let i = 0; i < 100; i++) frame(10.39); // paused: the sim clock does not move
    expect(played()).toEqual([]);
  });

  it('a speaker still walking to the rendezvous (a path) or a pair no longer chatting is silent; in place, it speaks', () => {
    const { a, b } = chatters();
    const walking = [{ x: 1, y: 1 }];
    Object.assign(a, { path: walking });
    Object.assign(b, { path: walking });
    for (let i = 0; i < 120; i++) frame(i * 0.05);
    expect(played()).toEqual([]);
    Object.assign(a, { path: null });
    Object.assign(b, { path: null, st: 'bench' });
    for (let i = 120; i < 240; i++) frame(i * 0.05);
    expect(played().filter((id) => id === 'murmur').length).toBeGreaterThan(0); // her turns still come: she is in place and chatting
    clearLog();
    Object.assign(a, { st: 'bench' });
    for (let i = 240; i < 480; i++) frame(i * 0.05);
    expect(played()).toEqual([]);
  });

  it('two pairs chatting at once both murmur each turn: the one the voice gate held back asks again a few frames later', () => {
    chatters(CTR, CTR, 1);
    chatters(CTR + 2, CTR + 1, 2);
    for (let i = 0; i < 300; i++) frame(i * 0.05);
    // 15 s: five turns (0, 2.99, 5.99, 8.99, 11.99), two speakers each
    expect(auditLog().filter((r) => r.played && r.id === 'murmur')).toHaveLength(10);
    expect(auditLog().some((r) => r.id === 'murmur' && !r.played && r.why === 'gated')).toBe(true);
  });

  it('a pair off screen is not heard and does not flood the log', () => {
    chatters(CTR, CTR + 400, 3);
    for (let i = 0; i < 200; i++) frame(i * 0.05);
    expect(auditLog().filter((r) => r.id === 'murmur').length).toBeLessThanOrEqual(4);
    expect(played()).toEqual([]);
  });

  it('a restore (the tick runs backward) forgets the turns, so the same turn sounds again', () => {
    chatters();
    setTick(500);
    for (let i = 0; i < 10; i++) frame(10);
    expect(played().filter((id) => id === 'murmur')).toHaveLength(1);
    ms += 5000;
    setTick(100);
    frame(10);
    expect(played().filter((id) => id === 'murmur')).toHaveLength(2);
  });
});

describe('05 3.2 row 9: the ring is the sim\'s own spark 8 s into the kneel, at the kneeler', () => {
  it('an `fx` spark of the romance sounds `ring` at its place; hearts, flashes and a spark of no romance are silent; `proposal` is silent', () => {
    const s = spyBus();
    bindCues(s.bus);
    s.fire({ kind: 'proposal', x: CTR, y: CTR, ids: [1, 2, 3] });
    s.fire({ kind: 'fx', x: CTR, y: CTR, ids: [1, 2], params: { fx: 'heart', n: 6, romance: 1, tone: 1 } });
    s.fire({ kind: 'fx', x: CTR, y: CTR, ids: [1], params: { fx: 'flash' } });
    s.fire({ kind: 'fx', x: CTR, y: CTR, ids: [1], params: { fx: 'spark', n: 3 } });
    for (let i = 0; i < 400; i++) frame(i * 0.05); // however long the walk to the kneeling spot takes, no ring comes by itself
    expect(played()).toEqual([]);
    s.fire({ kind: 'fx', x: CTR + 1, y: CTR, ids: [1, 2], params: { fx: 'spark', n: 8, romance: 1, tone: 0 } });
    expect(played()).toEqual(['ring']);
    expect(auditLog().at(-1)).toMatchObject({ id: 'ring', played: true, x: CTR + 1, y: CTR });
  });
});

/** `id` of `side` cast at tick 100: ready again `secs` later, with `charges` uses left (omitted: the ability's own count). */
const castOf = (side: 'cupid' | 'mischief', id: string, secs: number, charges?: number): void =>
  setAbilitiesState(undefined, {
    cooldowns: { park: {}, cupid: side === 'cupid' ? { [id]: 100 + secs * 60 } : {}, mischief: side === 'mischief' ? { [id]: 100 + secs * 60 } : {} },
    charges: { park: {}, cupid: side === 'cupid' && charges !== undefined ? { [id]: charges } : {}, mischief: side === 'mischief' && charges !== undefined ? { [id]: charges } : {} },
  });
const at = (tk: number): void => {
  setTick(tk);
  ms += 5000;
  setNow(ms);
  updateCueSources(0);
};

describe('05 3.2 row 34: ready is a cooldown that ran out with a use left, or the charges back at f = 0', () => {
  it('an ability without charges is ready when its cooldown reaches 0', () => {
    const s = spyBus();
    bindCues(s.bus);
    setTick(100);
    castOf('cupid', 'c_petals', 30);
    s.fire({ kind: 'cast', x: CTR, y: CTR, params: { id: 'c_petals', side: 'cupid' } });
    expect(played()).toEqual(['place', 'petals']);
    at(100 + 30 * 60 - 3);
    expect(played()).not.toContain('ready');
    at(100 + 30 * 60 + 1);
    expect(played().at(-1)).toBe('ready');
  });

  it('the single daily charge of the fireworks is spent: the cooldown running out is silent, the next dawn is ready', () => {
    const s = spyBus();
    bindCues(s.bus);
    setTick(100);
    castOf('cupid', 'c_fireworks', 360, 0);
    s.fire({ kind: 'cast', params: { id: 'c_fireworks', side: 'cupid' } });
    at(100 + 360 * 60 + 1);
    expect(played()).not.toContain('ready');
    resetCharges(); // the loop's day reset, then the frame's `newday`
    ms += 5000;
    setNow(ms);
    s.fire({ kind: 'newday', params: { day: 5 } });
    expect(played().filter((id) => id === 'ready')).toHaveLength(1);
    ms += 5000;
    setNow(ms);
    s.fire({ kind: 'newday', params: { day: 6 } });
    expect(played().filter((id) => id === 'ready')).toHaveLength(1); // the wait is over: a later dawn says nothing
  });

  it('a day that turns before the cooldown ends gives the charge back first, so the cooldown\'s end is ready', () => {
    const s = spyBus();
    bindCues(s.bus);
    setTick(100);
    castOf('mischief', 'm_flock', 180, 0);
    s.fire({ kind: 'cast', params: { id: 'm_flock', side: 'mischief' } });
    resetCharges();
    s.fire({ kind: 'newday', params: { day: 5 } });
    expect(played()).not.toContain('ready'); // still cooling
    at(100 + 180 * 60 + 1);
    expect(played().at(-1)).toBe('ready');
  });
});

describe('05 3.2 row 38: refuse sounds for every refusal hud.ts toasts', () => {
  it('a tool or an ability refused for the wrong mode refuses; an avatar command that finds the mode as asked, and a reason with no toast, do not', () => {
    const s = spyBus();
    bindCues(s.bus);
    const refuse = (params: Record<string, string>): string[] => {
      clearLog();
      ms += 5000;
      setNow(ms);
      s.fire({ kind: 'rejected', params });
      return played();
    };
    expect(refuse({ reason: 'reason.wrong_mode', kind: 'tool', side: 'park' })).toEqual(['refuse']);
    expect(refuse({ reason: 'reason.wrong_mode', kind: 'ability', side: 'cupid' })).toEqual(['refuse']);
    expect(refuse({ reason: 'reason.wrong_mode', kind: 'avatar.enter', side: 'mischief' })).toEqual([]);
    expect(refuse({ reason: 'reason.wrong_mode', kind: 'avatar.leave', side: 'mischief' })).toEqual([]);
    expect(refuse({ reason: 'reason.not_here', kind: 'avatar.tap', side: 'mischief' })).toEqual(['refuse']);
    expect(refuse({ reason: 'reason.no_charges', kind: 'ability', side: 'cupid' })).toEqual(['refuse']);
    expect(refuse({ reason: 'bad', kind: 'tool' })).toEqual([]);
    expect(refuse({ kind: 'tool' })).toEqual([]);
  });
});
