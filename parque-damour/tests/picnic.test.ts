// tests/picnic.test.ts
// Locks the starter picnic spots (S6, owner 2026-10-19, "Continue" to the recommendation; register section 4 "Starter picnic spots"; 02 2.5,
// 6.2 stage 5): Happily was rare (1 of 200 Calm seeds in 3 days) because the Picnic stage needs a picnic spot within 10 tiles of the pair and
// only the kiosk's tables were one. With the two 2 x 2 blankets at (14,21) and (34,24) a clear majority of parks see a Picnic stage and
// Happily is no longer a one-in-two-hundred event. The counts come from tests/fixtures/picnic-scan.json, the recorded scan of seeds 1 to 200
// over 3 sim days on both paces (the S5 park's numbers beside them); the first Lively seeds are run again here and must match their rows.
// PD_SCAN=1 runs all 400 (about 9 minutes), the way the fixture was made.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT, newPark, setSpeed, simulate } from '../src/core/loop.ts';
import { STEPS_PER_DAY } from '../src/core/clock.ts';
import { applyNow } from '../src/core/commands.ts';
import { clearListeners, on } from '../src/core/events.ts';
import { pairById } from '../src/entities/romance.ts';

type Pace = 'calm' | 'lively';
/** [seed, pairs formed, completions of stages 1 to 7, Happily events, step of the first Picnic completion or -1, step of the first Happily or -1] */
type Row = [number, number, number[], number, number, number];
type Summary = { picnicSeeds: number; picnicStages: number; kissStages: number; proposalStages: number; happilySeeds: number; happilyEvents: number };
const FX = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'picnic-scan.json'), 'utf8')) as {
  before: Record<Pace, Summary>;
  after: Record<Pace, Summary>;
  calm: Row[];
  lively: Row[];
};

function summary(rows: readonly Row[]): Summary {
  return {
    picnicSeeds: rows.filter((r) => r[4] >= 0).length,
    picnicStages: rows.reduce((n, r) => n + (r[2][4] as number), 0),
    kissStages: rows.reduce((n, r) => n + (r[2][5] as number), 0),
    proposalStages: rows.reduce((n, r) => n + (r[2][6] as number), 0),
    happilySeeds: rows.filter((r) => r[3] > 0).length,
    happilyEvents: rows.reduce((n, r) => n + r[3], 0),
  };
}

/** The scan's procedure: a new park, the pace at tick 1, nothing else, 3 sim days at 1x, counting the stage and Happily events. */
function scanSeed(seed: number, pace: Pace): Row {
  clearListeners();
  newPark(seed);
  setSpeed(1);
  applyNow({ side: 'park', kind: 'park.pace', payload: { pace } });
  const done = [0, 0, 0, 0, 0, 0, 0, 0];
  let formed = 0, happily = 0, firstPicnic = -1, firstHappily = -1, step = 0;
  on('formed', () => formed++);
  on('stage', (e) => {
    const p = pairById(e.ids?.[2] ?? 0);
    if (!p) return;
    done[p.stage] = (done[p.stage] ?? 0) + 1;
    if (p.stage === 5 && firstPicnic < 0) firstPicnic = step;
  });
  on('happily', () => {
    happily++;
    if (firstHappily < 0) firstHappily = step;
  });
  for (step = 1; step <= 3 * STEPS_PER_DAY; step++) simulate(SIM_DT, 1);
  return [seed, formed, done.slice(1), happily, firstPicnic, firstHappily];
}

beforeEach(() => {
  clearListeners();
});

describe('the starter picnic spots bring the Picnic stage and Happily (register section 4; 02 6.2 stage 5)', () => {
  it('the recorded scan of seeds 1 to 200 has 200 rows per pace and sums to the recorded totals', () => {
    expect(FX.calm.map((r) => r[0])).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(FX.lively.map((r) => r[0])).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(summary(FX.calm)).toEqual(FX.after.calm);
    expect(summary(FX.lively)).toEqual(FX.after.lively);
  });

  it('a clear majority of parks see a Picnic stage in 3 days: Calm 176 of 200, Lively 183 of 200 (before: 136 and 151)', () => {
    expect(FX.before.calm.picnicSeeds).toBe(136);
    expect(FX.before.lively.picnicSeeds).toBe(151);
    expect(FX.after.calm.picnicSeeds).toBe(176);
    expect(FX.after.lively.picnicSeeds).toBe(183);
    for (const pace of ['calm', 'lively'] as const) {
      expect(FX.after[pace].picnicSeeds).toBeGreaterThan(FX.before[pace].picnicSeeds);
      expect(FX.after[pace].picnicSeeds / 200).toBeGreaterThan(0.85); // a clear majority
      expect(FX.after[pace].picnicStages).toBeGreaterThan(FX.before[pace].picnicStages * 1.4);
    }
  });

  it('Happily is no longer rare: 17 of 200 Calm seeds and 26 of 200 Lively seeds in 3 days, up from 1 and 1', () => {
    expect([FX.before.calm.happilySeeds, FX.before.lively.happilySeeds]).toEqual([1, 1]);
    expect([FX.after.calm.happilySeeds, FX.after.lively.happilySeeds]).toEqual([17, 26]);
    expect(FX.after.calm.happilyEvents).toBeGreaterThanOrEqual(15 * FX.before.calm.happilyEvents);
    expect(FX.after.lively.happilyEvents).toBeGreaterThanOrEqual(25 * FX.before.lively.happilyEvents);
    expect(FX.calm.filter((r) => r[3] > 0).map((r) => r[0])).toContain(1); // the seed romance.test.ts keeps as S_HAPPILY
  });

  it('seeds 1 to 8 on Lively, run again, give the recorded rows (the scan is the sim\'s own, deterministic)', () => {
    for (let seed = 1; seed <= 8; seed++) expect(scanSeed(seed, 'lively'), 'seed ' + seed).toEqual(FX.lively[seed - 1]);
  }, 300_000);

  it.runIf(process.env.PD_SCAN === '1')('PD_SCAN=1: all 400 scans run again and give the recorded rows', () => {
    for (const pace of ['calm', 'lively'] as const)
      for (let seed = 1; seed <= 200; seed++) expect(scanSeed(seed, pace), pace + ' seed ' + seed).toEqual(FX[pace][seed - 1]);
  }, 3_600_000);
});
