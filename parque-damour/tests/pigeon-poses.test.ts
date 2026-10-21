// tests/pigeon-poses.test.ts
// Locks the possessed pigeon's four own poses (S7 follow-up, owner 2026-10-22; 02 10.4; 04 7.4; render/creatures-poses.ts): `wait`, `poop`,
// `startled` and `drink` are drawn as themselves instead of the walk, the walk, the scatter and the peck they used to borrow; each cycle is a
// plain function of the sim clock or the state's timer (no random numbers, nothing stored); the poop lets a bead fall, the startle puts its alarm
// ticks over the head, the drink ripples round the beak at the bottom of the dip; the sprite of people.ts keeps them in its 8 frames. The
// drawing runs on the recording context of tests/draw-stub.ts (node has no canvas).
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POOP_T } from '../src/entities/creatures.ts';
import { drawPigeonOf, drawPigeonState, pigeonStateOf, type PigeonState } from '../src/render/creatures.ts';
import { DRINK_CYCLE_S, POSE_STATES, STARTLED_CYCLE_S, WAIT_CYCLE_S, drawPigeonPose, drinkFace, pigeonCycle } from '../src/render/creatures-poses.ts';
import { I, WATER } from '../src/world/grid.ts';
import { penOf, recorder, stubPath2D, type Rec } from './draw-stub.ts';

beforeAll(stubPath2D);

const draw = (st: PigeonState, u: number, z = 3.4): Rec => {
  const rec = recorder();
  drawPigeonState({ pen: penOf(rec, z), warm: 0 }, { x: 60, y: 60 }, 1, st, u, 0.18 * 26 * z);
  return rec;
};

describe('the possessed pigeon\'s states are drawn as their own poses (render/creatures.ts pigeonStateOf)', () => {
  it('wait, poop, startled and drink stand for themselves; flyDrink is still the flight; the five of the sim and anything unknown as before', () => {
    expect([...POSE_STATES].sort()).toEqual(['drink', 'poop', 'startled', 'wait']);
    for (const st of ['wait', 'poop', 'startled', 'drink', 'peck', 'perch', 'fly', 'scatter', 'walk']) expect(pigeonStateOf(st), st).toBe(st);
    expect(pigeonStateOf('flyDrink')).toBe('fly');
    for (const st of ['idle', 'swoop', 'carry', '']) expect(pigeonStateOf(st), st).toBe('walk');
  });
});

describe('pigeonCycle: where a pose is in its cycle, from the sim clock or the state\'s timer', () => {
  it('-1 for every other state; the poop is the beat\'s progress (0 as it begins, 1 as it ends); the others turn on the clock', () => {
    for (const st of ['walk', 'peck', 'perch', 'fly', 'scatter', 'flyDrink', 'swoop', 'idle']) expect(pigeonCycle(st, 1, 1, 5), st).toBe(-1);
    expect(pigeonCycle('poop', 1, POOP_T, 99)).toBe(0);
    expect(pigeonCycle('poop', 1, POOP_T / 2, 99)).toBeCloseTo(0.5, 9);
    expect(pigeonCycle('poop', 1, 0, 99)).toBe(1);
    expect(pigeonCycle('poop', 1, -1, 99)).toBe(1);
    expect(pigeonCycle('wait', 0, 0, WAIT_CYCLE_S / 4)).toBeCloseTo(0.25, 9);
    expect(pigeonCycle('wait', 3, 0, 0)).not.toBe(pigeonCycle('wait', 4, 0, 0)); // a flock does not look about together
    expect(pigeonCycle('startled', 1, 0, STARTLED_CYCLE_S / 2)).toBeCloseTo(0.5, 9);
    expect(pigeonCycle('drink', 1, 0, DRINK_CYCLE_S * 1.25)).toBeCloseTo(0.25, 9);
    for (const st of ['wait', 'poop', 'startled', 'drink'])
      for (let i = 0; i < 40; i++) {
        const u = pigeonCycle(st, i, i * 0.0125, i * 0.37);
        expect(u, st).toBeGreaterThanOrEqual(0);
        expect(u, st).toBeLessThan(1 + 1e-9);
      }
  });
});

describe('the four poses draw something of their own', () => {
  it('each is not what it borrowed before: its recorded drawing differs from the walk, the walk, the scatter and the peck', () => {
    const today: Record<string, PigeonState> = { wait: 'walk', poop: 'walk', startled: 'scatter', drink: 'peck' };
    for (const st of ['wait', 'poop', 'startled', 'drink'] as const) {
      const now = draw(st, 0.3), then = draw(today[st] as PigeonState, 0.3);
      expect(now.total(), st).toBeGreaterThan(8);
      expect(JSON.stringify([now.calls, now.fills]), st).not.toBe(JSON.stringify([then.calls, then.fills]));
    }
  });
  it('the poop lets a bead fall and fade: a circle more than the wait draws, and the bead\'s colour at the beat\'s end is not its colour at the start', () => {
    expect(draw('poop', 0.5).calls.arc ?? 0).toBeGreaterThan(draw('wait', 0.5).calls.arc ?? 0);
    expect(JSON.stringify(draw('poop', 0).fills)).not.toBe(JSON.stringify(draw('poop', 1).fills));
  });
  it('the startle puts alarm ticks over the head (two strokes more than the wait draws) and the drink ripples only while the beak is down', () => {
    expect(draw('startled', 0.2).calls.stroke ?? 0).toBeGreaterThanOrEqual((draw('wait', 0.2).calls.stroke ?? 0) + 2);
    const down = draw('drink', 0.2), up = draw('drink', 0.8);
    expect(down.calls.ellipse ?? 0).toBeGreaterThan(up.calls.ellipse ?? 0); // two ripple rings at the bottom of the dip, none as the head lifts
  });
  it('a pigeon too small to see (under 1.6 px) draws nothing, and the wait looks about over its cycle (the head moves)', () => {
    const rec = recorder();
    drawPigeonState({ pen: penOf(rec), warm: 0 }, { x: 10, y: 10 }, 1, 'wait', 0.2, 1.2);
    expect(rec.total()).toBe(0);
    expect(JSON.stringify(draw('wait', 0.1).calls)).toBe(JSON.stringify(draw('wait', 0.6).calls)); // the same strokes...
    const a = recorder(), b = recorder();
    drawPigeonPose({ pen: penOf(a), warm: 0 }, { x: 60, y: 60 }, 1, 'wait', 0.25, 16);
    drawPigeonPose({ pen: penOf(b), warm: 0 }, { x: 60, y: 60 }, 1, 'wait', 0.75, 16);
    expect(a.total()).toBe(b.total()); // ... so the sway is a shift of the head, not another drawing
  });
  it('drawPigeonOf (the unsprited path) takes the cycle from the state and its timer; people.ts keeps the poses in its eight sprite frames', () => {
    for (const st of ['wait', 'poop', 'startled', 'drink']) {
      const rec = recorder();
      drawPigeonOf({ pen: penOf(rec), warm: 0 }, { x: 60, y: 60 }, st, 1, 7, 12.3, POOP_T / 2);
      expect(rec.total(), st).toBeGreaterThan(8);
    }
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'render', 'people.ts'), 'utf8');
    expect(src).toMatch(/const cyc = pigeonCycle\(st, cr\.id, cr\.t, tSim\(\)\)/);
    expect(src).toMatch(/cyc >= 0 \? frameOf\(cyc, BEAST_FRAMES\)/);
  });
});

describe('drinkFace: the drinking pigeon turns to the pond on screen (render/people.ts; a look only, nothing is written)', () => {
  it('water on one side of it turns it that way, water on the opposite side the other way, none within two tiles leaves it 0', () => {
    WATER.fill(0);
    try {
      expect(drinkFace(20, 20)).toBe(0);
      WATER[I(22, 20)] = 0.6;
      const east = drinkFace(20, 20);
      expect(east).not.toBe(0);
      WATER.fill(0);
      WATER[I(18, 20)] = 0.6;
      expect(drinkFace(20, 20)).toBe(-east);
      WATER.fill(0);
      WATER[I(24, 20)] = 0.6; // three tiles off: too far to drink from
      expect(drinkFace(20, 20)).toBe(0);
      WATER[I(21, 21)] = 0.6; // the nearer of two wins
      WATER[I(18, 20)] = 0.6;
      expect(drinkFace(20, 20)).toBe(drinkFace(20.5, 20.5));
    } finally {
      WATER.fill(0);
    }
  });
});
