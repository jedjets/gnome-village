// tests/determinism.test.ts
// Locks register 2.9 / brief 9 row 5 / 03 P1, 4.5, 5.5, 11 / 08 3.2: the same seed and the same command log give the same state hash and the
// same draw count over 3 sim days (64,800 steps); one extra command makes them differ; lite 1 and lite 3 give the same hash; a replay from a
// snapshot and a save round trip in the middle of the run both land on the same hash. Also the state hash itself (03 11).
// Three fixtures run the six runs of 08 3.2: det-s2 (S2: speed and weather only), det-s3 (S3 part A: det-s2 plus park tools and an
// undo, 08 3.2 item 1; its bench, stroke and undo fall inside run 5's window, so the replay reproduces an undo, 03 5.6 item 4) and det-s4
// (S4 part B: det-s3 plus 22 visitor.call commands that fill the park to 30 people by midday of day 1, 07 S4.7 item 1). S4 part B turned
// the arrivals on, so det-s2 and det-s3 changed by design and were re-recorded (07 S4.7 item 1), and the stage's review fixes moved all
// three once more (each fixture's note holds the old and the new values); det-s2 still proves that no later slice moves an S4 path. Runs 4 and 6 compare against run 1's numbers, kept per
// fixture, instead of running the same 64,800 steps again (the file's time budget, 08 3.2 item 8).
// Park pace (owner 2026-10-14, register section 4 "Park pace and Options"): det-s4l is det-s4 with `park.pace` lively at tick 1, as the
// shell sends a new player's pace, so the six runs cover a Lively park (its pace saved, restored and hashed). The three fixtures before
// it hold no pace command: their parks are calm, which hashes as nothing, so their values did not move.
// S5 (the romance core): pairs forming change the sim by design, so the four fixtures were re-recorded once (the sanctioned S5 re-record;
// each fixture's note holds the old and the new values), and det-s5 is det-s4l plus a picnic blanket, a bed and a lamp by the fountain
// (charm and a picnic spot) at ticks 4,000 to 4,200: a full Lively park where couples arrive as Pairs and singles pair up over 3 days.
// Run 1 now also checks that every fixture forms pairs and completes stages.
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
import { CAP_PEOPLE, arrivalsState, people } from '../src/entities/visitor.ts';

/** The 64,800-step runs take seconds each; vitest's default is 5 s. */
const LONG = 120_000;

type FixtureCommand = { tick: number } & CommandInput;
type Fixture = { seed: number; steps: number; commands: FixtureCommand[]; expect: { rngN: number; stateHash: number } };
const load = (name: string): Fixture => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', name + '.json'), 'utf8')) as Fixture;
const FIXTURES = {
  'det-s2': load('det-s2'), 'det-s3': load('det-s3'), 'det-s4': load('det-s4'), 'det-s4l': load('det-s4l'), 'det-s5': load('det-s5'),
} as const;
const fixture = FIXTURES['det-s2']; // the state-hash tests below run on det-s2's park

type Hook = (step: number) => void;

/**
 * det-s2's values since the starter picnic spots (S6, owner 2026-10-19: two 2 x 2 blankets in the starter park, re-recorded once; see the
 * test that reads it). Before them, since S5, the romance core: rngN 26992, stateHash 854600468.
 */
const DET_S2_PICNIC = { rngN: 28155, stateHash: 4191156501 };

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
    // S2 recorded rngN 912, stateHash 2925709919; S4 part B re-recorded them, the arrivals on (07 S4.7 item 1): rngN 27245, stateHash
    // 3065084456, then rngN 27599, stateHash 3808997934 after the stage's review fixes (a couple's second waits seated for the first,
    // act.ts seatedStep). S5 re-recorded them once, the sanctioned re-record of the romance core (pairs forming change the sim: the
    // couples' Pairs, the formation rolls, the stages, the charm conversion; see the fixture's note). S6 re-recorded all five once more for the
    // starter picnic spots (rngN 26992, stateHash 854600468 before them; see the fixture's note). No later slice may move these.
    expect(fixture.expect).toEqual(DET_S2_PICNIC);
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

  it('det-s4 is det-s3 plus 24 visitor.call commands between ticks 2,400 and 3,240 (07 S4.7 item 1; S6: 22 on the 40-tick grid and 2 at 3,220 and 3,230)', () => {
    const s3 = FIXTURES['det-s3'], s4 = FIXTURES['det-s4'];
    expect([s4.seed, s4.steps]).toEqual([s3.seed, s3.steps]);
    expect(s4.commands.filter((c) => c.kind !== 'visitor.call')).toEqual(s3.commands);
    const calls = s4.commands.filter((c) => c.kind === 'visitor.call');
    // S6 (the starter picnic spots moved the sim): on the new park the 22 calls of the grid filled the Calm park to exactly 30 and none was
    // refused, which run 1's `rejected` check needs; two more at 3,220 and 3,230, with the park full, are refused (reason.park_full)
    expect(calls).toHaveLength(24);
    expect(calls.filter((c) => c.tick % 40 === 0)).toHaveLength(22);
    expect(calls.filter((c) => c.tick === 3220 || c.tick === 3230)).toHaveLength(2);
    expect(calls.every((c) => c.tick >= 2400 && c.tick <= 3240 && c.side === 'park')).toBe(true);
    expect(s4.commands.at(-1)).toEqual({ tick: 64800, side: 'park', kind: 'speed', payload: { speed: 0 } });
  });

  it('det-s4l is det-s4 plus park.pace lively at tick 1, its first command (register section 4, Park pace and Options)', () => {
    const s4 = FIXTURES['det-s4'], s4l = FIXTURES['det-s4l'];
    expect([s4l.seed, s4l.steps]).toEqual([s4.seed, s4.steps]);
    expect(s4l.commands[0]).toEqual({ tick: 1, side: 'park', kind: 'park.pace', payload: { pace: 'lively' } });
    expect(s4l.commands.slice(1)).toEqual(s4.commands);
    expect(s4l.expect).not.toEqual(s4.expect); // a Lively park is another park
  });

  it('det-s5 is det-s4l plus a picnic blanket, a bed and a lamp by the fountain at ticks 4,000 to 4,200 (S5: pairs forming)', () => {
    const s4l = FIXTURES['det-s4l'], s5 = FIXTURES['det-s5'];
    expect([s5.seed, s5.steps]).toEqual([s4l.seed, s4l.steps]);
    const extra = s5.commands.filter((c) => c.tick >= 4000 && c.tick <= 4200);
    expect(extra.map(toolName)).toEqual(['picnic', 'bed', 'lamp']);
    expect(s5.commands.filter((c) => !extra.includes(c))).toEqual(s4l.commands);
  });

});

/** Run 1's numbers per fixture, kept for runs 4 and 6 (the same steps from the same seed and log give the same numbers: runs 1 and 2). */
const RUN1 = new Map<string, { hash: number; rngN: number; tick: number }>();
function run1(name: keyof typeof FIXTURES): { hash: number; rngN: number; tick: number } {
  const got = RUN1.get(name);
  if (got) return got;
  newPark(FIXTURES[name].seed);
  const a = run(FIXTURES[name]);
  RUN1.set(name, a);
  return a;
}

for (const name of ['det-s2', 'det-s3', 'det-s4', 'det-s4l', 'det-s5'] as const) {
  const fx = FIXTURES[name];
  describe(`determinism over 3 sim days, ${name} (brief 9 row 5; 08 3.2)`, () => {
    it('runs 1 and 2: the same seed and commands give the same hash, draw count and tick; run 3: one extra setWeather differs', () => {
      // run 1 also watches the park fill: det-s4 reaches 30 people by midday of day 1 (f 0.45, tick 3,240) and never more; its calls past
      // 30 are reason.park_full and nothing else is refused (07 S4.7 item 1)
      const rejected: string[] = [];
      on('rejected', (e) => rejected.push(String(e.params?.reason)));
      // S5: every fixture now has pairs forming (07 S5.7 item 1): couples arrive as Pairs and singles pair up and climb the stages
      let formed = 0, stages = 0;
      on('formed', () => formed++);
      on('stage', () => stages++);
      let most = 0, atMidday = 0;
      const a = run(fx, {
        hook: (step) => {
          most = Math.max(most, people());
          if (step === 3240) atMidday = people();
        },
      });
      expect(formed).toBeGreaterThan(0);
      expect(stages).toBeGreaterThan(0);
      if (name === 'det-s4' || name === 'det-s4l' || name === 'det-s5') {
        expect([atMidday, most]).toEqual([CAP_PEOPLE, CAP_PEOPLE]);
        expect(rejected.length).toBeGreaterThan(0);
        expect(new Set(rejected)).toEqual(new Set(['reason.park_full']));
      } else expect(most).toBeLessThanOrEqual(CAP_PEOPLE);
      expect(arrivalsState().pace).toBe(name === 'det-s4l' || name === 'det-s5' ? 'lively' : 'calm'); // det-s4l and det-s5 send a pace
      console.log(name + ': seed ' + fx.seed + ' steps ' + a.tick + ' rngN ' + a.rngN + ' stateHash ' + a.hash + ' (0x' + a.hash.toString(16) + ') formed ' + formed + ' stages ' + stages);
      expect(a.tick).toBe(64800);
      expect(a.rngN).toBeGreaterThan(0);
      expect(a.rngN).toBe(fx.expect.rngN);
      expect(a.hash).toBe(fx.expect.stateHash);
      RUN1.set(name, a);
      newPark(fx.seed);
      const b = run(fx);
      expect(b).toEqual(a);
      newPark(fx.seed);
      // S6: 'mist', not 'rain': on the new park det-s5's own weather is already rain at tick 30,000, so a forced rain there changed nothing
      // that outlived the snow the fixture forces at 33,000; mist is not the weather at that tick in any fixture
      const c = run(fx, { extra: [{ tick: 30000, side: 'park', kind: 'debug.weather', payload: { kind: 'mist' } }] });
      expect(c.hash).not.toBe(a.hash);
    }, LONG);

    it('run 4: lite 3 in batches of 22 steps with a drain between gives the same hash as lite 1 (03 4.5)', () => {
      const a = run1(name);
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
      if (name !== 'det-s2') expect(after.filter((c) => c.kind === 'tool' || c.kind === 'undo').map((c) => c.kind)).toEqual(['tool', 'tool', 'tool', 'tool', 'undo']);
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
      const a = run1(name);
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
