// tests/determinism.test.ts
// Locks register 2.9 / brief 9 row 5 / 03 P1, 4.5, 5.5, 11 / 08 3.2: the same seed and the same command log give the same state hash and the
// same draw count over 3 sim days (64,800 steps); one extra command makes them differ; lite 1 and lite 3 give the same hash; a replay from a
// snapshot and a save round trip in the middle of the run both land on the same hash. Also the state hash itself (03 11).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT, newPark, setSpeed, simulate, tick } from '../src/core/loop.ts';
import { applyNow, enqueue, log, replay, type Command, type CommandInput } from '../src/core/commands.ts';
import { clearListeners, drain, watch } from '../src/core/events.ts';
import { rngN, seedVisual, vrng } from '../src/core/rng.ts';
import { restore, snapshot, stateHash, worldHash } from '../src/save/store.ts';
import { KIND, WEAR, props } from '../src/world/grid.ts';
import { idsState, nextEffectId } from '../src/core/ids.ts';
import { W } from '../src/core/weather.ts';

/** The 64,800-step runs take seconds each; vitest's default is 5 s. */
const LONG = 120_000;

type FixtureCommand = { tick: number } & CommandInput;
const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'det-s2.json'), 'utf8')) as {
  seed: number;
  steps: number;
  commands: FixtureCommand[];
  expect: { rngN: number; stateHash: number };
};

type Hook = (step: number) => void;

/** Run `steps` steps; each fixture command is enqueued while the tick is one before its own, so it applies in its tick. */
function run(opts: { lite?: number; batch?: number; extra?: FixtureCommand[]; steps?: number; hook?: Hook; from?: number } = {}): { hash: number; rngN: number; tick: number } {
  const lite = opts.lite ?? 1;
  const steps = opts.steps ?? fixture.steps;
  const cmds = [...fixture.commands, ...(opts.extra ?? [])];
  const byTick = new Map<number, FixtureCommand[]>();
  for (const c of cmds) byTick.set(c.tick, [...(byTick.get(c.tick) ?? []), c]);
  let sinceDrain = 0;
  for (let step = (opts.from ?? 0) + 1; step <= steps; step++) {
    for (const c of byTick.get(step) ?? []) enqueue({ side: c.side, kind: c.kind, payload: c.payload } as CommandInput);
    simulate(SIM_DT, lite);
    if (opts.batch && ++sinceDrain === opts.batch) {
      drain(lite);
      sinceDrain = 0;
    }
    opts.hook?.(step);
  }
  return { hash: stateHash(), rngN: rngN(), tick: tick() };
}

beforeEach(() => {
  clearListeners();
  newPark(fixture.seed);
  setSpeed(1);
});

describe('determinism over 3 sim days (brief 9 row 5; 08 3.2)', () => {
  it('the fixture is 12 commands: 6 speed and 6 debug.weather, one inside run 5\'s window, speed 0 last at 64,800', () => {
    expect(fixture.seed).toBe(101);
    expect(fixture.steps).toBe(64800);
    expect(fixture.commands).toHaveLength(12);
    expect(fixture.commands.filter((c) => c.kind === 'speed')).toHaveLength(6);
    expect(fixture.commands.filter((c) => c.kind === 'debug.weather')).toHaveLength(6);
    expect(fixture.commands.some((c) => c.tick > 20000 && c.tick <= 21000)).toBe(true); // 08 3.2 item 1
    expect(fixture.commands.at(-1)).toEqual({ tick: 64800, side: 'park', kind: 'speed', payload: { speed: 0 } });
  });

  it('runs 1 and 2: the same seed and commands give the same hash, draw count and tick; run 3: one extra setWeather differs', () => {
    const a = run();
    console.log('determinism fixture: seed ' + fixture.seed + ' steps ' + a.tick + ' rngN ' + a.rngN + ' stateHash ' + a.hash + ' (0x' + a.hash.toString(16) + ')');
    expect(a.tick).toBe(64800);
    expect(a.rngN).toBeGreaterThan(0);
    expect(a.rngN).toBe(fixture.expect.rngN);
    expect(a.hash).toBe(fixture.expect.stateHash);
    newPark(fixture.seed);
    const b = run();
    expect(b).toEqual(a);
    newPark(fixture.seed);
    const c = run({ extra: [{ tick: 30000, side: 'park', kind: 'debug.weather', payload: { kind: 'rain' } }] });
    expect(c.hash).not.toBe(a.hash);
  }, LONG);

  it('run 4: lite 3 in batches of 22 steps with a drain between gives the same hash as lite 1 (03 4.5)', () => {
    const a = run();
    newPark(fixture.seed);
    let seen = 0;
    for (const k of ['applied', 'newday', 'season', 'rejected'] as const) watch(k, () => seen++);
    const b = run({ lite: 3, batch: 22 });
    expect(b).toEqual(a);
    expect(seen).toBeGreaterThan(0);
  }, LONG);

  it('run 5: a snapshot at step 20,000 plus replay of the commands logged after it reaches the same hash at 21,000 (02 14.5; 08 3.2 item 6)', () => {
    run({ steps: 20000 });
    const snap = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
    run({ steps: 21000, from: 20000 });
    const h1 = stateHash();
    const n1 = rngN();
    const after: Command[] = log().filter((c) => c.tick > 20000).map((c) => ({ ...c }));
    expect(after.length).toBeGreaterThan(0);
    restore(snap);
    expect(tick()).toBe(20000);
    replay(after, 21000);
    expect(tick()).toBe(21000);
    expect(stateHash()).toBe(h1);
    expect(rngN()).toBe(n1);
  }, LONG);

  it('run 6: a save round trip through JSON at step 40,000 does not change the final hash', () => {
    const a = run();
    newPark(fixture.seed);
    const b = run({
      hook: (step) => {
        if (step === 40000) restore(JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>);
      },
    });
    expect(b).toEqual(a);
  }, LONG);
});

describe('state hash and snapshot (03 11, 07 S2.6 item 14)', () => {
  it('a snapshot restores to the same hash, world hash and draw count', () => {
    run({ steps: 3000 });
    const h = stateHash(), w = worldHash(), n = rngN();
    const snap = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
    expect(snap.v).toBe(1);
    expect(snap.seed).toBe(101);
    expect(snap.tick).toBe(3000);
    newPark(7);
    expect(stateHash()).not.toBe(h);
    restore(snap);
    expect(stateHash()).toBe(h);
    expect(worldHash()).toBe(w);
    expect(rngN()).toBe(n);
  });

  it('a layer byte, a prop field, the weather and the sim stream each change the hash; the visual stream and the log do not', () => {
    const base = stateHash();
    WEAR[100] = 1;
    expect(stateHash()).not.toBe(base);
    WEAR[100] = 0;
    expect(stateHash()).toBe(base);
    const p = props[0];
    if (!p) throw new Error('no props');
    p.rot = 2;
    expect(stateHash()).not.toBe(base);
    p.rot = 0;
    W.cloud += 0.01;
    expect(stateHash()).not.toBe(base);
    W.cloud -= 0.01;
    expect(stateHash()).toBe(base);
    expect(applyNow({ side: 'park', kind: 'speed', payload: { speed: 3 } }).ok).toBe(true);
    expect(log()).toHaveLength(1); // a logged command (and T.speed) ...
    expect(stateHash()).toBe(base); // ... leave the hash alone
    seedVisual(5);
    vrng();
    expect(stateHash()).toBe(base);
    simulate(SIM_DT, 0);
    expect(stateHash()).not.toBe(base); // while one step changes it
  });

  it('the id counters and the paving tally are hashed (03 11): handing out an id changes the hash', () => {
    const base = stateHash();
    nextEffectId();
    expect(stateHash()).not.toBe(base);
    const s = idsState();
    expect(stateHash()).toBe(stateHash()); // pure: hashing changes nothing
    expect(s.effect).toBe(1);
  });
  it('worldHash covers the layers and props only: the weather and the tick leave it alone', () => {
    const w = worldHash();
    simulate(SIM_DT, 0);
    expect(worldHash()).toBe(w);
    KIND[5] = 2;
    expect(worldHash()).not.toBe(w);
  });

  it('restore refuses a snapshot of another version and a damaged layer before changing anything', () => {
    const snap = snapshot();
    const h = stateHash();
    expect(() => restore({ ...snap, v: 2 as unknown as 1 })).toThrow();
    expect(() => restore({ ...snap, layers: { ...snap.layers, KIND: 'AAAA' } })).toThrow();
    expect(stateHash()).toBe(h);
  });

  it('a snapshot is plain JSON of the right size: no references, under 1 MB (brief 9 row 6)', () => {
    run({ steps: 500 });
    const text = JSON.stringify(snapshot());
    expect(text.length).toBeLessThan(1_000_000);
    expect(text.length).toBeGreaterThan(70_000); // the layers alone are about 71 KB of base64
    expect(JSON.parse(text)).toEqual(snapshot());
  });
});
