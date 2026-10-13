// tests/caps.test.ts
// Locks register 3.3 and 03 3.11 (the people part: 30 people in the park, cameos excluded, enforced in spawnVisitor and callVisitor;
// reason.park_full at 30, GV addVillager 4489) / 08 2.3 caps.test.ts row / 07 S4.6 step 1. Pigeons and dogs are part B (creatures.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { newPark } from '../src/core/loop.ts';
import { rngN } from '../src/core/rng.ts';
import { CAP_PEOPLE, arriveGroup, callVisitor, people, spawnVisitor, visitors } from '../src/entities/visitor.ts';

beforeEach(() => {
  newPark(101);
});

/** Fill the park with singles to `n` people. */
function fill(n: number): void {
  while (people() < n) spawnVisitor('single', 'g_south_e');
}

describe('30 people, cameos excluded (register 3.3; 03 3.11; 08 2.3)', () => {
  it('force-spawning 35 singles leaves 30 in the park: the extra five are refused', () => {
    expect(CAP_PEOPLE).toBe(30);
    const got = Array.from({ length: 35 }, () => spawnVisitor('single', 'g_west'));
    expect(got.filter((v) => v !== null)).toHaveLength(30);
    expect(got.slice(30).every((v) => v === null)).toBe(true);
    expect(people()).toBe(30);
  });
  it('a refused spawn changes nothing and draws nothing', () => {
    fill(30);
    const n0 = rngN(), len = visitors.length;
    expect(spawnVisitor('elder', 'g_north')).toBeNull();
    expect(rngN()).toBe(n0);
    expect(visitors).toHaveLength(len);
  });
  it('cameos never count and are never refused; staff count', () => {
    fill(29);
    expect(spawnVisitor('gardener', 'g_west')?.name).toBe('Gustave');
    expect(people()).toBe(30);
    expect(spawnVisitor('vendor', 'g_west')).toBeNull();
    for (let k = 0; k < 3; k++) expect(spawnVisitor('cameo', 'g_north', { name: 'Violette', sex: 'f' })).not.toBeNull();
    expect(people()).toBe(30);
    expect(visitors).toHaveLength(33);
  });
  it('callVisitor at 30 is reason.park_full and draws nothing (02 12.2; GV 4489)', () => {
    fill(30);
    const n0 = rngN();
    expect(callVisitor()).toEqual({ ok: false, reason: 'reason.park_full' });
    expect(callVisitor('g_north')).toEqual({ ok: false, reason: 'reason.park_full' });
    expect(rngN()).toBe(n0);
    expect(people()).toBe(30);
  });
  it('a group of two with room for one comes as a single; a tourist comes alone; at 30 nobody comes', () => {
    for (const a of ['couple', 'family', 'tourist'] as const) {
      newPark(101);
      fill(29);
      const g = arriveGroup(a, 'g_south_w');
      expect(g, a).toHaveLength(1);
      expect(g[0]?.archetype, a).toBe(a === 'tourist' ? 'tourist' : 'single');
      expect(people()).toBe(30);
      expect(arriveGroup('single', 'g_south_w')).toEqual([]);
    }
  });
  it('callVisitor never takes the park past 30', () => {
    for (let k = 0; k < 60; k++) callVisitor();
    expect(people()).toBe(30);
  });
});
