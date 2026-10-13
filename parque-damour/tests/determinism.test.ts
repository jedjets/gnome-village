// tests/determinism.test.ts
// Locks register 2.9 / brief 9 row 5 / 03 P1, 4.5, 5.5, 11 / 08 3.2: the same seed and the same command log give the same state hash and the
// same draw count over 3 sim days (64,800 steps); one extra command makes them differ; lite 1 and lite 3 give the same hash; a replay from a
// snapshot and a save round trip in the middle of the run both land on the same hash. Also the state hash itself (03 11).
// Two fixtures run the six runs of 08 3.2: det-s2 (S2: speed and weather only; it must keep rngN 912 and stateHash 2925709919, which proves
// a later slice changed no S2 path) and det-s3 (S3 part A: det-s2 plus park tools and an undo, 08 3.2 item 1; its bench, stroke and undo
// fall inside run 5's window, so the replay reproduces an undo, 03 5.6 item 4).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT, newPark, setSpeed, simulate, tick } from '../src/core/loop.ts';
import { applyNow, enqueue, log, replay, type Command, type CommandInput } from '../src/core/commands.ts';
import { clearListeners, drain, on, watch } from '../src/core/events.ts';
import { rngN, seedVisual, vrng } from '../src/core/rng.ts';
import { restore, snapshot, stateHash, worldHash } from '../src/save/store.ts';
import { I, KIND, Kind, WEAR, props } from '../src/world/grid.ts';
import { idsState, nextEffectId } from '../src/core/ids.ts';
import { W } from '../src/core/weather.ts';
import '../src/play/tools.ts'; // registers the `tool` and `undo` handlers (S3)

/** The 64,800-step runs take seconds each; vitest's default is 5 s. */
const LONG = 120_000;

type FixtureCommand = { tick: number } & CommandInput;
type Fixture = { seed: number; steps: number; commands: FixtureCommand[]; expect: { rngN: number; stateHash: number } };
const load = (name: string): Fixture => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', name + '.json'), 'utf8')) as Fixture;
const FIXTURES = { 'det-s2': load('det-s2'), 'det-s3': load('det-s3') } as const;
const fixture = FIXTURES['det-s2']; // the state-hash tests below run on det-s2's park

type Hook = (step: number) => void;

/** The kind of the prop whose footprint covers (x, y). */
function propKindAt(x: number, y: number): string | undefined {
  return props.find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)?.kind;
}

/** A park command's tool, or its kind. */
const toolName = (c: FixtureCommand): string => (c.kind === 'tool' ? c.payload.tool : c.kind);

/** Run `steps` steps; each fixture command is enqueued while the tick is one before its own, so it applies in its tick. */
function run(
  fx: Fixture,
  opts: { lite?: number; batch?: number; extra?: FixtureCommand[]; steps?: number; hook?: Hook; from?: number } = {},
): { hash: number; rngN: number; tick: number } {
  const lite = opts.lite ?? 1;
  const steps = opts.steps ?? fx.steps;
  const cmds = [...fx.commands, ...(opts.extra ?? [])];
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

describe('the fixtures (08 3.2 item 1)', () => {
  it('det-s2 is 12 commands: 6 speed and 6 debug.weather, one inside run 5\'s window, speed 0 last at 64,800', () => {
    expect(fixture.seed).toBe(101);
    expect(fixture.steps).toBe(64800);
    expect(fixture.commands).toHaveLength(12);
    expect(fixture.commands.filter((c) => c.kind === 'speed')).toHaveLength(6);
    expect(fixture.commands.filter((c) => c.kind === 'debug.weather')).toHaveLength(6);
    expect(fixture.commands.some((c) => c.tick > 20000 && c.tick <= 21000)).toBe(true); // 08 3.2 item 1
    expect(fixture.commands.at(-1)).toEqual({ tick: 64800, side: 'park', kind: 'speed', payload: { speed: 0 } });
    expect(fixture.expect).toEqual({ rngN: 912, stateHash: 2925709919 }); // S2's values: no later slice may move them
  });

  it('det-s3 is det-s2 plus 7 park commands: a bench, a 3-centre stroke and an undo inside run 5\'s window, a tree and a bandstand before 40,000', () => {
    const s3 = FIXTURES['det-s3'];
    expect([s3.seed, s3.steps]).toEqual([fixture.seed, fixture.steps]);
    expect(s3.commands.filter((c) => c.kind !== 'tool' && c.kind !== 'undo')).toEqual(fixture.commands);
    const park = s3.commands.filter((c) => c.kind === 'tool' || c.kind === 'undo');
    expect(park.map(toolName)).toEqual(['bench', 'path', 'path', 'path', 'undo', 'tree', 'bandstand']);
    // run 5 replays tools and an undo whose entry was recorded after its snapshot (03 5.6 item 4); all before run 6's round trip
    expect(park.filter((c) => c.tick > 20000 && c.tick <= 21000).map(toolName)).toEqual(['bench', 'path', 'path', 'path', 'undo']);
    expect(park.every((c) => c.tick > 20000 && c.tick < 40000)).toBe(true);
    expect(new Set(park.filter((c) => c.kind === 'tool' && c.payload.tool === 'path').map((c) => (c.payload as { stroke: number }).stroke)).size).toBe(1);
    expect(s3.commands.at(-1)).toEqual({ tick: 64800, side: 'park', kind: 'speed', payload: { speed: 0 } });
  });

  it('det-s3\'s park commands all apply: the bench, tree and bandstand stand and the undo took the whole stroke back', () => {
    const s3 = FIXTURES['det-s3'];
    const rejected: string[] = [];
    on('rejected', (e) => rejected.push(String(e.params?.reason)));
    run(s3, { steps: 24001 });
    expect(rejected).toEqual([]);
    expect([propKindAt(5, 40), propKindAt(30, 41), propKindAt(2, 3), propKindAt(4, 5)]).toEqual(['bench', 'tree', 'bandstand', 'bandstand']);
    for (const [x, y] of [[2, 12], [3, 12], [4, 12], [5, 12], [6, 12], [4, 11], [4, 13]] as const) expect(KIND[I(x, y)]).toBe(Kind.lawn);
    expect(log().filter((c) => c.kind === 'tool' || c.kind === 'undo')).toHaveLength(7);
  }, LONG);
});

for (const name of ['det-s2', 'det-s3'] as const) {
  const fx = FIXTURES[name];
  describe(`determinism over 3 sim days, ${name} (brief 9 row 5; 08 3.2)`, () => {
    it('runs 1 and 2: the same seed and commands give the same hash, draw count and tick; run 3: one extra setWeather differs', () => {
      const a = run(fx);
      console.log(name + ': seed ' + fx.seed + ' steps ' + a.tick + ' rngN ' + a.rngN + ' stateHash ' + a.hash + ' (0x' + a.hash.toString(16) + ')');
      expect(a.tick).toBe(64800);
      expect(a.rngN).toBeGreaterThan(0);
      expect(a.rngN).toBe(fx.expect.rngN);
      expect(a.hash).toBe(fx.expect.stateHash);
      newPark(fx.seed);
      const b = run(fx);
      expect(b).toEqual(a);
      newPark(fx.seed);
      const c = run(fx, { extra: [{ tick: 30000, side: 'park', kind: 'debug.weather', payload: { kind: 'rain' } }] });
      expect(c.hash).not.toBe(a.hash);
    }, LONG);

    it('run 4: lite 3 in batches of 22 steps with a drain between gives the same hash as lite 1 (03 4.5)', () => {
      const a = run(fx);
      newPark(fx.seed);
      let seen = 0;
      for (const k of ['applied', 'newday', 'season', 'rejected'] as const) watch(k, () => seen++);
      const b = run(fx, { lite: 3, batch: 22 });
      expect(b).toEqual(a);
      expect(seen).toBeGreaterThan(0);
    }, LONG);

    it('run 5: a snapshot at step 20,000 plus replay of the commands logged after it reaches the same hash at 21,000 (02 14.5; 08 3.2 item 6)', () => {
      run(fx, { steps: 20000 });
      const snap = JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>;
      run(fx, { steps: 21000, from: 20000 });
      const h1 = stateHash();
      const n1 = rngN();
      const after: Command[] = log().filter((c) => c.tick > 20000).map((c) => ({ ...c }));
      expect(after.length).toBeGreaterThan(0);
      if (name === 'det-s3') expect(after.filter((c) => c.kind === 'tool' || c.kind === 'undo').map((c) => c.kind)).toEqual(['tool', 'tool', 'tool', 'tool', 'undo']);
      const rejected: string[] = [];
      on('rejected', (e) => rejected.push(String(e.params?.reason)));
      restore(snap);
      expect(tick()).toBe(20000);
      replay(after, 21000);
      expect(tick()).toBe(21000);
      expect(rejected).toEqual([]); // every replayed command applies again, the undo included
      expect(stateHash()).toBe(h1);
      expect(rngN()).toBe(n1);
    }, LONG);

    it('run 6: a save round trip through JSON at step 40,000 does not change the final hash', () => {
      const a = run(fx);
      newPark(fx.seed);
      const b = run(fx, {
        hook: (step) => {
          if (step === 40000) restore(JSON.parse(JSON.stringify(snapshot())) as ReturnType<typeof snapshot>);
        },
      });
      expect(b).toEqual(a);
    }, LONG);
  });
}

describe('state hash and snapshot (03 11, 07 S2.6 item 14)', () => {
  it('a snapshot restores to the same hash, world hash and draw count', () => {
    run(fixture, { steps: 3000 });
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
    run(fixture, { steps: 500 });
    const text = JSON.stringify(snapshot());
    expect(text.length).toBeLessThan(1_000_000);
    expect(text.length).toBeGreaterThan(70_000); // the layers alone are about 71 KB of base64
    expect(JSON.parse(text)).toEqual(snapshot());
  });
});
