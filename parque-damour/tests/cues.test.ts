// tests/cues.test.ts
// Locks 05 3.2 and 3.3 (the 38 cue ids with recipe, gain, gap, soft flag, scope, threshold), 05 2.5 (the voice factors 1.19 and 0.84, the floor),
// 05 5.7 (the ducks), 05 8.2 item 2 and 08 2.8 rows 3 and 4: the registry equals 06 section 17 in order, no gain above 0.060, every trigger is
// bound on the bus and sounds its cue (with the dry run of 05 8.3: tone() and grain() record, no device), and a 3-day seeded run emits the
// events the table names. The two recipes each of kiss and splat of 07 S8.6 step 13 are in cues-alts.ts. No AudioContext is needed.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T } from '../src/core/clock.ts';
import { SIM_DT, newPark, setSpeed, setTick, simulate } from '../src/core/loop.ts';
import { enqueue, type CommandInput } from '../src/core/commands.ts';
import { clearListeners, drain, watch, type EventFn, type EventKind, type GameEvent } from '../src/core/events.ts';
import { rngN, seedVisual } from '../src/core/rng.ts';
import { bindProgression, setProgress } from '../src/play/progression.ts';
import { spawnVisitor } from '../src/entities/visitor.ts';
import { CTR, cam, centreOn, setViewport } from '../src/render/camera.ts';
import { auditLog, clearLog, dryCalls, dryNotes, setDryRun, setLogSink, setMuted, type LogRow } from '../src/audio/engine.ts';
import { resetGaps, setNow } from '../src/audio/limiter.ts';
import { CUES, CUE_IDS, cue, type CueDef, type CueId } from '../src/audio/cues.ts';
import { ALTS, ALT_GAIN, ALT_PICK, playAlt } from '../src/audio/cues-alts.ts';
import { EMB_CUE, bindCues, resetCueSources, updateCueSources, type EventBus } from '../src/audio/cues-bind.ts';
import { resetAmbience, setAmbienceEnv, updateAmbience } from '../src/audio/ambience.ts';
import { resetBirds, updateBirds } from '../src/audio/birds.ts';
import { stateHash } from '../src/save/store.ts';
import { ghost } from '../src/play/tools.ts';

const ORDER: CueId[] = [
  'step_gravel', 'step_lawn', 'bench_creak', 'murmur', 'laugh', 'sigh', 'gasp', 'kiss', 'ring', 'happily',
  'parted', 'bouquet', 'coo', 'flutter', 'splat', 'yap', 'snatch', 'wasp', 'sprinkler', 'slip',
  'mime', 'rival_hmm', 'foghorn', 'fireworks', 'clink', 'bell_bike', 'gate_hinge', 'fountain', 'plip', 'hush',
  'lamp_hum', 'petals', 'sunbeam', 'ready', 'unlock', 'ui_tap', 'place', 'refuse',
];

/** 05 3.2: id, gain, gap (ms; 0 = none), soft, scope, thresh (0.02 positioned, 0 unpositioned). */
const TABLE: ReadonlyArray<readonly [CueId, number, number, boolean, 'kind' | 'actor', number]> = [
  ['step_gravel', 0.012, 70, false, 'actor', 0.02], ['step_lawn', 0.008, 70, false, 'actor', 0.02], ['bench_creak', 0.012, 450, false, 'kind', 0.02],
  ['murmur', 0.017, 700, true, 'actor', 0.02], ['laugh', 0.022, 450, true, 'actor', 0.02], ['sigh', 0.02, 600, true, 'actor', 0.02],
  ['gasp', 0.026, 500, true, 'actor', 0.02], ['kiss', 0.018, 2000, true, 'kind', 0.02], ['ring', 0.02, 3000, true, 'kind', 0.02],
  ['happily', 0.03, 4000, true, 'kind', 0.02], ['parted', 0.028, 4000, true, 'kind', 0.02], ['bouquet', 0.018, 900, true, 'kind', 0.02],
  ['coo', 0.016, 900, false, 'kind', 0.02], ['flutter', 0.014, 180, false, 'kind', 0.02], ['splat', 0.03, 300, false, 'kind', 0.02],
  ['yap', 0.02, 900, false, 'actor', 0.02], ['snatch', 0.024, 600, false, 'kind', 0.02], ['wasp', 0.01, 400, false, 'kind', 0.02],
  ['sprinkler', 0.012, 900, false, 'kind', 0.02], ['slip', 0.03, 450, false, 'kind', 0.02], ['mime', 0.012, 1200, true, 'kind', 0.02],
  ['rival_hmm', 0.018, 1500, true, 'kind', 0.02], ['foghorn', 0.022, 20000, false, 'kind', 0.02], ['fireworks', 0.04, 350, false, 'kind', 0.02],
  ['clink', 0.01, 700, false, 'kind', 0.02], ['bell_bike', 0.012, 6000, false, 'kind', 0.02], ['gate_hinge', 0.01, 1200, false, 'kind', 0.02],
  ['fountain', 0.0045, 0, false, 'kind', 0.02], ['plip', 0.0032, 0, false, 'kind', 0.02], ['hush', 0, 0, false, 'kind', 0],
  ['lamp_hum', 0.01, 3000, false, 'kind', 0.02], ['petals', 0.012, 1500, true, 'kind', 0.02], ['sunbeam', 0.014, 3000, true, 'kind', 0.02],
  ['ready', 0.014, 500, false, 'kind', 0], ['unlock', 0.03, 4000, true, 'kind', 0], ['ui_tap', 0.01, 60, false, 'kind', 0],
  ['place', 0.022, 120, false, 'kind', 0.02], ['refuse', 0.016, 400, false, 'kind', 0],
];

/** Notes per recipe at a = 1 as 05 3.2 and 7.5 item 1 give them: [tones, grains]. */
const NOTES: Partial<Record<CueId, readonly [number, number]>> = {
  step_gravel: [0, 2], step_lawn: [2, 0], bench_creak: [3, 0], murmur: [4, 0], laugh: [3, 0], sigh: [1, 0], gasp: [2, 0], ring: [2, 0],
  happily: [5, 0], parted: [2, 0], bouquet: [2, 0], coo: [2, 0], flutter: [0, 6], yap: [2, 0], snatch: [1, 1], wasp: [2, 0], sprinkler: [2, 6],
  slip: [3, 0], mime: [1, 0], rival_hmm: [2, 0], foghorn: [2, 0], fireworks: [2, 3], clink: [2, 0], bell_bike: [2, 0], gate_hinge: [2, 0],
  fountain: [1, 0], plip: [1, 0], hush: [0, 0], lamp_hum: [2, 0], petals: [5, 0], sunbeam: [3, 0], ready: [2, 0], unlock: [5, 0], ui_tap: [1, 0],
  place: [2, 0], refuse: [2, 0],
};

let now = 0;
const tick = (ms = 5000): void => {
  now += ms;
  setNow(now);
};
const played = (): string[] => auditLog().filter((r) => r.played && r.id !== 'fountain').map((r) => r.id); // the fountain's burbles are the ambience's

beforeEach(() => {
  clearListeners();
  newPark(101);
  seedVisual(7);
  setViewport(390, 844, 1);
  cam.z = 1.3;
  centreOn(CTR, CTR);
  setMuted(false);
  setDryRun(true);
  clearLog();
  dryCalls(true);
  resetGaps();
  resetAmbience();
  resetCueSources();
  setAmbienceEnv(null);
  T.speed = 1;
  now = 0;
  setNow(0);
});
afterEach(() => {
  setDryRun(false);
  setLogSink(null);
});

describe('the registry of 05 3.2 (08 2.8 rows 3 and 4)', () => {
  it('holds exactly the 38 ids of 05 3.2, in its order', () => {
    expect(Object.keys(CUES)).toEqual(ORDER);
    expect(CUE_IDS).toEqual(ORDER);
    expect(CUE_IDS).toHaveLength(38);
    for (const id of CUE_IDS) expect(CUES[id].id).toBe(id);
  });

  it('every row has the gain, gap, soft flag, scope and threshold of the table', () => {
    expect(TABLE.map((r) => r[0])).toEqual(ORDER);
    for (const [id, gain, gap, soft, scope, thresh] of TABLE) {
      const d = CUES[id];
      expect([d.gain, d.gap, d.soft, d.scope, d.thresh], id).toEqual([gain, gap, soft, scope, thresh]);
    }
    expect(CUE_IDS.filter((id) => CUES[id].unscaled)).toEqual(['foghorn']);
    expect([CUES.happily.floor, CUES.parted.floor, CUES.foghorn.floor]).toEqual([0.4, 0.4, 0.6]);
    expect(CUE_IDS.filter((id) => CUES[id].floor !== undefined)).toEqual(['happily', 'parted', 'foghorn']);
  });

  it('equals 06 section 17 in order, with its gap, soft flag and scope', () => {
    const md = readFileSync(join(import.meta.dirname, '..', 'docs', '06-Content-Tables.md'), 'utf8');
    const sec = md.slice(md.indexOf('## 17. Cues'), md.indexOf('## 18.'));
    const rows = [...sec.matchAll(/^\| (\d+) \| `(\w+)` \|(.*)\|$/gm)].map((m) => ({ n: Number(m[1]), id: m[2] as string, cells: (m[3] as string).split('|').map((c) => c.trim()) }));
    expect(rows.map((r) => r.id)).toEqual(ORDER);
    for (const r of rows) {
      const d = CUES[r.id as CueId];
      // cells: trigger | positioned | soft | scope | gap (hush has a short row)
      if (r.id === 'hush') continue;
      const [soft, scope, gap] = r.cells.slice(-3);
      expect(soft, r.id).toBe(d.soft ? 'yes' : 'no');
      expect(scope, r.id).toBe(d.scope);
      expect(gap as string, r.id).toMatch(d.gap > 0 ? new RegExp('^' + d.gap + '( unscaled)?$') : /^none/);
    }
  });

  it('no gain above 0.060, none below 0.003 (hush has no tone), no gap under 60 ms except the two the ambience paces, no sawtooth or square', () => {
    for (const id of CUE_IDS) {
      const d = CUES[id];
      expect(d.gain, id).toBeLessThanOrEqual(0.06);
      if (id !== 'hush') expect(d.gain, id).toBeGreaterThanOrEqual(0.003);
      if (!['fountain', 'plip', 'hush'].includes(id)) expect(d.gap, id).toBeGreaterThanOrEqual(60);
    }
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'audio', 'cues.ts'), 'utf8') + readFileSync(join(import.meta.dirname, '..', 'src', 'audio', 'cues-alts.ts'), 'utf8');
    expect(src).not.toMatch(/sawtooth|'square'/);
  });

  it('every actor-scoped row is a voice or a step cue', () => {
    expect(CUE_IDS.filter((id) => CUES[id].scope === 'actor')).toEqual(['step_gravel', 'step_lawn', 'murmur', 'laugh', 'sigh', 'gasp', 'yap']);
  });

  it('the ducks of 05 5.7: -6 dB for 0.6 s on laugh, gasp, kiss, ring, happily, parted, unlock; mime -18 on both buses; fireworks -3 for 0.3 s', () => {
    const ducked = CUE_IDS.filter((id) => CUES[id].duck);
    expect(ducked.sort()).toEqual(['fireworks', 'gasp', 'happily', 'kiss', 'laugh', 'mime', 'parted', 'ring', 'unlock'].sort());
    for (const id of ['laugh', 'gasp', 'kiss', 'ring', 'happily', 'parted', 'unlock'] as const) expect(CUES[id].duck, id).toEqual({ db: -6, hold: 0.6 });
    expect(CUES.mime.duck).toEqual({ db: -18, hold: 0.6, amb: true });
    expect(CUES.fireworks.duck).toEqual({ db: -3, hold: 0.3 });
  });

  it('every recipe schedules the notes of its row (the dry run counts them) and none is louder than its row', () => {
    const play = (id: CueId, p = {}): CueDef => {
      dryCalls(true);
      CUES[id].play(0, 0, 1, 0, p);
      return CUES[id];
    };
    for (const id of CUE_IDS) {
      const d = play(id, { voice: 'f' });
      const [t, g] = NOTES[id] ?? [NaN, NaN];
      if (id === 'kiss' || id === 'splat') continue; // the pick: two alternatives, checked below
      const c = dryCalls();
      expect([c.tone, c.grain], id).toEqual([t, g]);
      for (const n of dryNotes()) {
        expect(n.gain, id).toBeLessThanOrEqual(d.gain + 1e-12);
        expect(n.gain, id).toBeGreaterThan(0);
      }
    }
  });

  it('the voice factors: f x1.19, m x0.84, a child x1.3 on the laugh, the yap x1.25 for the pomeranian', () => {
    const first = (id: CueId, p: object): number => {
      dryNotes(true);
      CUES[id].play(0, 0, 1, 0, p);
      return (dryNotes()[0] as { f: number }).f;
    };
    expect(first('laugh', { voice: 'f' })).toBeCloseTo(523 * 1.19, 9);
    expect(first('laugh', { voice: 'm' })).toBeCloseTo(523 * 0.84, 9);
    expect(first('laugh', { voice: 'f', child: true })).toBeCloseTo(523 * 1.3, 9);
    expect(first('laugh', {})).toBe(523);
    expect(first('gasp', { voice: 'm' })).toBeCloseTo(330 * 0.84, 9);
    expect(first('sigh', { voice: 'f' })).toBeCloseTo(392 * 1.19, 9);
    expect(first('rival_hmm', { voice: 'm' })).toBeCloseTo(196 * 0.84, 9);
    expect(first('yap', { pitch: 1.25 })).toBeCloseTo(640 * 1.25, 9);
    const m = first('murmur', { voice: 'm' }), f = first('murmur', { voice: 'f' });
    expect(m).toBeGreaterThanOrEqual(190 * 0.9);
    expect(m).toBeLessThanOrEqual(190 * 1.1);
    expect(f).toBeGreaterThanOrEqual(260 * 0.9);
    expect(f).toBeLessThanOrEqual(260 * 1.1);
  });
});

describe('the two recipes each of kiss and splat (07 S8.6 step 13; register row "Cue recipes kiss and splat")', () => {
  it('each alternative makes sound at the row\'s gain or under, and the registry plays the pick', () => {
    for (const id of ['kiss', 'splat'] as const) {
      expect(['A', 'B']).toContain(ALT_PICK[id]);
      expect(ALT_GAIN[id]).toBe(CUES[id].gain);
      for (const alt of ['A', 'B'] as const) {
        dryCalls(true);
        ALTS[id][alt](ALT_GAIN[id], 0, 0, 0);
        const c = dryCalls();
        expect(c.tone + c.grain, id + alt).toBeGreaterThan(0);
        for (const n of dryNotes()) expect(n.gain, id + alt).toBeLessThanOrEqual(ALT_GAIN[id] + 1e-12);
      }
      dryCalls(true);
      CUES[id].play(0, 0, 1, 0, {});
      const reg = dryNotes().map((n) => n.f);
      dryCalls(true);
      ALTS[id][ALT_PICK[id]](ALT_GAIN[id], 0, 0, 0);
      expect(reg, id).toEqual(dryNotes().map((n) => n.f));
    }
  });

  it('kiss A is the 05 recipe (a 784 blip, then 1046 to 880), kiss B two tines of motif B (C6 and E6 with the 2.76 clang)', () => {
    dryNotes(true);
    ALTS.kiss.A(0.018, 0, 0, 0);
    expect(dryNotes().map((n) => n.f)).toEqual([784, 1046]);
    dryNotes(true);
    ALTS.kiss.B(0.018, 0, 0, 0);
    expect(dryNotes().map((n) => Math.round(n.f))).toEqual([1047, Math.round(1047 * 2.76), 1319, Math.round(1319 * 2.76)]);
  });

  it('splat A is the 05 recipe (170 to 60 and a grain), splat B a bloop 523 to 196 with its octave partial and a wet grain', () => {
    dryNotes(true);
    ALTS.splat.A(0.03, 0, 0, 0);
    expect(dryNotes().map((n) => [n.k, n.f, n.to])).toEqual([['tone', 170, 60], ['grain', 1100, undefined]]);
    dryNotes(true);
    ALTS.splat.B(0.03, 0, 0, 0);
    expect(dryNotes().map((n) => [n.k, n.f, n.to])).toEqual([['tone', 523, 196], ['tone', 1046, 392], ['grain', 900, undefined]]);
  });

  it('the Sound check button plays an alternative at a tile and logs it; a muted or inaudible press does nothing', () => {
    expect(playAlt('kiss', 'B', CTR, CTR)).toBe(true);
    expect(auditLog().at(-1)?.id).toBe('kiss B');
    expect(playAlt('splat', 'A', 400, 400)).toBe(false); // far off screen: inaudible
    setMuted(true);
    expect(playAlt('splat', 'A', CTR, CTR)).toBe(false);
  });
});

/** A bus that keeps the handlers, so a test can fire an event at them. */
function spyBus(): { bus: EventBus; kinds: EventKind[]; fire: (ev: Partial<GameEvent> & { kind: EventKind }) => void } {
  const map = new Map<EventKind, EventFn[]>();
  const bus: EventBus = { watch: (k, fn) => map.set(k, [...(map.get(k) ?? []), fn]) };
  return {
    bus,
    kinds: [],
    fire: (ev) => {
      for (const fn of map.get(ev.kind) ?? []) fn({ tick: 0, ...ev } as GameEvent);
    },
  };
}
const TRIGGERS: EventKind[] = [
  'sit', 'stand', 'chat', 'laugh', 'stage', 'linger', 'embarrassed', 'watch', 'proposal', 'happily', 'parted', 'bouquet', 'peck', 'scatter',
  'fly', 'swoop', 'bark', 'snatch', 'wall', 'eat', 'arrive', 'leave', 'lampsLit', 'cast', 'unlock', 'rejected', 'applied', 'step', 'cue',
];

describe('bindCues: every trigger of 05 3.2 on the event bus', () => {
  it('subscribes the 29 event kinds the table names', () => {
    const seen: EventKind[] = [];
    bindCues({ watch: (k) => seen.push(k) });
    expect([...new Set(seen)].sort()).toEqual([...TRIGGERS].sort());
  });

  it('a bench sits and creaks, a table does not; a chat murmurs in the speaker\'s voice, alternating', () => {
    const s = spyBus();
    bindCues(s.bus);
    s.fire({ kind: 'sit', x: CTR, y: CTR, ids: [1], params: { prop: 'bench' } });
    s.fire({ kind: 'sit', x: CTR, y: CTR, ids: [1], params: { prop: 'table' } });
    expect(played()).toEqual(['bench_creak']);
    const f = spawnVisitor('single', 'g_north', { sex: 'f', name: 'Fleur' }), m = spawnVisitor('single', 'g_north', { sex: 'm', name: 'Marc' });
    for (const v of [f, m]) Object.assign(v as object, { x: CTR, y: CTR });
    clearLog();
    dryNotes(true);
    tick();
    s.fire({ kind: 'chat', x: CTR, y: CTR, ids: [f?.id ?? 0, m?.id ?? 0] });
    tick(200);
    s.fire({ kind: 'chat', x: CTR, y: CTR, ids: [f?.id ?? 0, m?.id ?? 0] });
    const murmurs = dryNotes().filter((_n, i) => i % 4 === 0).map((n) => n.f);
    expect(played()).toEqual(['murmur', 'murmur']);
    expect(murmurs[0]).toBeGreaterThanOrEqual(260 * 0.9); // her base
    expect(murmurs[1]).toBeLessThanOrEqual(190 * 1.1); // then his
  });

  it('a backfire laughs on both members, the second 0.4 s after the first, with no gasp', () => {
    const s = spyBus();
    bindCues(s.bus);
    const a = spawnVisitor('single', 'g_north', { sex: 'f', name: 'A' }), b = spawnVisitor('single', 'g_north', { sex: 'm', name: 'B' });
    for (const v of [a, b]) Object.assign(v as object, { x: CTR, y: CTR });
    s.fire({ kind: 'backfired', ids: [a?.id ?? 0, b?.id ?? 0] });
    s.fire({ kind: 'laugh', x: CTR, y: CTR, ids: [a?.id ?? 0, b?.id ?? 0] });
    expect(played()).toEqual(['laugh']);
    for (let i = 0; i < 12; i++) {
      tick(50);
      updateAmbience(0.05);
    }
    expect(played()).toEqual(['laugh', 'laugh']);
    expect(played()).not.toContain('gasp');
  });

  it('a landed embarrassment gasps and sounds its kind; one not landed is silent (05 3.3 item 4)', () => {
    const s = spyBus();
    bindCues(s.bus);
    const v = spawnVisitor('single', 'g_north', { sex: 'f', name: 'V' }) as { id: number };
    expect(EMB_CUE).toEqual({
      poop: 'splat', soaked: 'sprinkler', trip: 'slip', snatched: 'snatch', wasp: 'wasp', rival: 'rival_hmm', mime: 'mime',
      drenched: 'plip', fog: 'foghorn', flock: 'flutter',
    });
    s.fire({ kind: 'embarrassed', x: CTR, y: CTR, ids: [v.id], params: { kind: 'poop' } });
    expect(played()).toEqual([]);
    for (const kind of ['poop', 'soaked', 'trip', 'snatched', 'wasp', 'rival', 'mime', 'fog']) {
      clearLog();
      tick(30000);
      s.fire({ kind: 'embarrassed', x: CTR, y: CTR, ids: [v.id], params: { kind, landed: 1 } });
      expect(played(), kind).toEqual(['gasp', EMB_CUE[kind]]);
    }
    clearLog();
    tick(30000);
    s.fire({ kind: 'embarrassed', x: CTR, y: CTR, ids: [v.id], params: { kind: 'drenched', landed: 1 } });
    expect(played()).toEqual(['gasp', 'plip', 'plip', 'plip', 'plip', 'plip', 'plip']);
    clearLog();
    tick(30000);
    s.fire({ kind: 'embarrassed', x: CTR, y: CTR, ids: [v.id], params: { kind: 'flock', landed: 1 } });
    for (let i = 0; i < 60; i++) {
      tick(1000);
      updateAmbience(0.05);
    }
    expect(played().filter((id) => id === 'flutter').length).toBeGreaterThanOrEqual(1);
  });

  it('stages: Notice sighs, Kiss kisses, the rest are silent; linger sighs; the proposal rings 8 sim seconds later', () => {
    const s = spyBus();
    bindCues(s.bus);
    s.fire({ kind: 'stage', x: CTR, y: CTR, ids: [1, 2, 3], params: { stage: '@stage.notice' } });
    tick();
    s.fire({ kind: 'stage', x: CTR, y: CTR, ids: [1, 2, 3], params: { stage: '@stage.chat' } });
    tick();
    s.fire({ kind: 'stage', x: CTR, y: CTR, ids: [1, 2, 3], params: { stage: '@stage.kiss' } });
    tick();
    s.fire({ kind: 'linger', x: CTR, y: CTR, ids: [1, 2, 3] });
    expect(played()).toEqual(['sigh', 'kiss', 'sigh']);
    setTick(1000);
    s.fire({ kind: 'proposal', x: CTR, y: CTR, ids: [1, 2, 3] });
    updateCueSources(0);
    expect(played()).not.toContain('ring');
    setTick(1000 + 479);
    updateCueSources(0);
    expect(played()).not.toContain('ring');
    setTick(1000 + 480);
    updateCueSources(0);
    expect(played().at(-1)).toBe('ring');
  });

  it('Happily chords and fires three bursts at the pair (d = 0, 0.9, 1.7 s); Parted and the bouquet sound where they happen', () => {
    const s = spyBus();
    bindCues(s.bus);
    s.fire({ kind: 'happily', x: CTR, y: CTR, ids: [1, 2, 3] });
    for (let i = 0; i < 50; i++) {
      tick(50);
      updateAmbience(0.05);
    }
    expect(played()).toEqual(['happily', 'fireworks', 'fireworks', 'fireworks']);
    clearLog();
    tick(30000);
    s.fire({ kind: 'parted', x: CTR, y: CTR, ids: [1, 2, 3] });
    tick();
    const r = spawnVisitor('single', 'g_north', { sex: 'f', name: 'R' }) as { id: number };
    Object.assign(r, { x: CTR + 1, y: CTR });
    s.fire({ kind: 'bouquet', x: 0, y: 0, ids: [99, r.id] });
    expect(played()).toEqual(['parted', 'bouquet']);
    expect(auditLog().at(-1)?.x).toBe(CTR + 1); // at the receiver, not at the event's own tile
  });

  it('the creatures: peck coos, scatter and fly flutter, the dog barks, the pomeranian\'s snatch yaps at x1.25 and its drop does not', () => {
    const s = spyBus();
    bindCues(s.bus);
    const at = { x: CTR, y: CTR };
    s.fire({ kind: 'peck', ...at, ids: [1] });
    tick();
    s.fire({ kind: 'scatter', ...at, ids: [1] });
    tick();
    s.fire({ kind: 'bark', ...at, ids: [7] });
    tick();
    dryNotes(true);
    s.fire({ kind: 'snatch', ...at, ids: [8, 2], params: { item: 'hat' } });
    expect((dryNotes()[0] as { f: number }).f).toBeCloseTo(640 * 1.25, 9);
    tick();
    s.fire({ kind: 'snatch', ...at, ids: [8, 2], params: { drop: 1 } });
    expect(played()).toEqual(['coo', 'flutter', 'yap', 'yap']);
  });

  it('the rest: wall mimes, eat clinks at a kiosk, arrive and leave hinge, unlock chimes, a refusal refuses (not a wrong mode)', () => {
    const s = spyBus();
    bindCues(s.bus);
    const at = { x: CTR, y: CTR };
    s.fire({ kind: 'wall', ...at });
    s.fire({ kind: 'eat', ...at, params: { at: 'kiosk' } });
    s.fire({ kind: 'eat', ...at, params: { at: 'table' } });
    s.fire({ kind: 'arrive', ...at });
    tick();
    s.fire({ kind: 'leave', ...at });
    s.fire({ kind: 'unlock', params: { id: 'c_bouquet' } });
    s.fire({ kind: 'rejected', params: { reason: 'reason.not_here' } });
    s.fire({ kind: 'rejected', params: { reason: 'reason.wrong_mode' } });
    expect(played()).toEqual(['mime', 'clink', 'gate_hinge', 'gate_hinge', 'unlock', 'refuse']);
    expect(auditLog().filter((r) => r.id === 'unlock' || r.id === 'refuse').every((r) => Number.isNaN(r.x) && r.a === 1)).toBe(true); // unpositioned
  });

  it('a cast sounds place and its own cue; the generic cue event carries a cue id', () => {
    const s = spyBus();
    bindCues(s.bus);
    const at = { x: CTR, y: CTR };
    s.fire({ kind: 'cast', ...at, params: { id: 'c_petals', side: 'cupid' } });
    tick(3000);
    s.fire({ kind: 'cast', ...at, params: { id: 'c_sunbeam', side: 'cupid' } });
    tick(3000);
    s.fire({ kind: 'cast', ...at, params: { id: 'm_sprinkler', side: 'mischief' } });
    tick(3000);
    s.fire({ kind: 'cast', ...at, params: { id: 'c_umbrella', side: 'cupid' } });
    tick(3000);
    s.fire({ kind: 'cue', ...at, params: { id: 'ring' } });
    expect(played()).toEqual(['place', 'petals', 'place', 'sunbeam', 'place', 'sprinkler', 'place', 'ring']);
  });

  it('the lamps coming on hum, staggered, at most six', () => {
    const s = spyBus();
    bindCues(s.bus);
    s.fire({ kind: 'lampsLit' });
    for (let i = 0; i < 300; i++) {
      tick(50);
      updateAmbience(0.05);
    }
    const hums = auditLog().filter((r) => r.id === 'lamp_hum');
    expect(hums.length).toBeGreaterThan(0);
    expect(hums.length).toBeLessThanOrEqual(6);
    expect(hums.filter((r) => r.played).length).toBeGreaterThanOrEqual(1);
  });

  it('a tool command that applied sounds place at its tile (the log\'s tile, not the event\'s)', () => {
    clearListeners();
    bindCues();
    let tile = { x: 0, y: 0 };
    for (let y = 8; y < 40 && !tile.x; y++) for (let x = 8; x < 40 && !tile.x; x++) if (ghost('tree', { x, y }).ok) tile = { x, y };
    expect(tile.x).toBeGreaterThan(0);
    enqueue({ side: 'park', kind: 'tool', payload: { tool: 'tree', at: tile } });
    simulate(SIM_DT, 0);
    simulate(SIM_DT, 0);
    drain(0);
    const place = auditLog().find((r) => r.id === 'place');
    expect(place?.played).toBe(true);
    expect([place?.x, place?.y]).toEqual([tile.x, tile.y]);
  });

  it('footsteps: a visitor that walks a stride sounds a step, gravel on gravel and flagstone, lawn elsewhere; a jump of 3 tiles is no walking', () => {
    setSpeed(1);
    for (let i = 0; i < 4; i++) spawnVisitor('single', 'g_north', { sex: i % 2 ? 'f' : 'm', name: 'W' + i });
    updateCueSources(0);
    let ms = 0;
    for (let s = 0; s < 1800; s++) {
      simulate(SIM_DT, 0);
      if (s % 3 === 0) {
        ms += 50;
        setNow(ms);
        updateCueSources(0.05);
      }
    }
    const steps = auditLog().filter((r) => r.played && r.id.startsWith('step_'));
    expect(steps.length).toBeGreaterThan(5);
    // a spawn or a gate is a jump, not walking
    resetCueSources();
    clearLog();
    const v = spawnVisitor('single', 'g_south_w', { sex: 'f', name: 'J' }) as { x: number; y: number };
    updateCueSources(0);
    v.x += 5;
    updateCueSources(0);
    expect(auditLog().filter((r) => r.id.startsWith('step_'))).toEqual([]);
  });
});

describe('a 3-day seeded run emits the events 05 3.2 names (05 8.2 item 2)', () => {
  it('the determinism fixture det-s7 emits every bound event kind except the ones whose emitters come later', () => {
    const fx = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'det-s7.json'), 'utf8')) as {
      seed: number; steps: number; progress?: { cp: number; mp: number }; commands: Array<{ tick: number } & CommandInput>;
    };
    clearListeners();
    bindProgression();
    const seen = new Set<string>();
    for (const k of TRIGGERS) watch(k, () => seen.add(k));
    newPark(fx.seed);
    setSpeed(1);
    setProgress({ cp: fx.progress?.cp ?? 0, mp: fx.progress?.mp ?? 0 });
    const by = new Map<number, Array<{ tick: number } & CommandInput>>();
    for (const c of fx.commands) by.set(c.tick, [...(by.get(c.tick) ?? []), c]);
    for (let st = 1; st <= fx.steps; st++) {
      for (const c of by.get(st) ?? []) enqueue({ side: c.side, kind: c.kind, payload: c.payload } as CommandInput);
      simulate(SIM_DT, 1);
      if (st % 8 === 0) drain(1);
    }
    // the sim emits these in the fixture's 3 days
    for (const k of ['sit', 'stand', 'chat', 'stage', 'linger', 'embarrassed', 'proposal', 'happily', 'bouquet', 'peck', 'scatter', 'fly', 'bark', 'snatch', 'eat', 'arrive', 'leave', 'lampsLit', 'cast', 'rejected', 'applied', 'step'])
      expect(seen.has(k), k).toBe(true);
    // bound and waiting for their emitters: `laugh` (a backfire), `parted` (a Parted ending) are rare, `watch` and `cue` are S10's, `swoop` and `wall` the avatars', `unlock` a tier
    const later = TRIGGERS.filter((k) => !seen.has(k)).sort();
    expect(later.every((k) => ['laugh', 'parted', 'watch', 'cue', 'swoop', 'wall', 'unlock'].includes(k)), later.join()).toBe(true);
  }, 120_000);
});

describe('cue() keeps the log of 05 8.3', () => {
  it('records id, place, audibility, played and why', () => {
    const rows: LogRow[] = [];
    setLogSink((r) => rows.push(r));
    tick();
    expect(cue('place', CTR, CTR)).toBe(true);
    expect(cue('place', CTR, CTR)).toBe(false); // 120 ms gap
    expect(cue('place', 900, 900)).toBe(false); // off the screen
    setMuted(true);
    expect(cue('place', CTR, CTR)).toBe(false);
    expect(rows.map((r) => [r.id, r.played, r.why])).toEqual([['place', true, 'ok'], ['place', false, 'gated'], ['place', false, 'inaudible'], ['place', false, 'muted']]);
    expect(rows[0]?.a).toBeGreaterThan(0.9);
    expect(auditLog().length).toBeLessThanOrEqual(200);
  });
});

describe('the dry run of 05 8.3 and the determinism of sound (07 S8.7 item 1)', () => {
  it('a 3-day run at 8x with sound on and dryRun(true) ends with rngN and the state hash of the silent run, and 200 rows in the log', () => {
    const fx = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'det-s6.json'), 'utf8')) as {
      seed: number; steps: number; progress?: { cp: number; mp: number }; commands: Array<{ tick: number } & CommandInput>;
    };
    const by = new Map<number, Array<{ tick: number } & CommandInput>>();
    for (const c of fx.commands) by.set(c.tick, [...(by.get(c.tick) ?? []), c]);
    const play = (sound: boolean): { rngN: number; hash: number; played: Set<string>; rows: number; tones: number } => {
      clearListeners();
      bindProgression();
      newPark(fx.seed);
      setProgress({ cp: fx.progress?.cp ?? 0, mp: fx.progress?.mp ?? 0 });
      setSpeed(8);
      const seen = new Set<string>();
      setLogSink((r: LogRow) => r.played && seen.add(r.id.startsWith('bird:') ? 'bird' : r.id));
      setDryRun(sound);
      clearLog();
      dryCalls(true);
      resetGaps();
      resetAmbience();
      resetBirds();
      resetCueSources();
      if (sound) bindCues();
      seedVisual(1);
      setViewport(390, 844, 1);
      cam.z = 0.8;
      centreOn(CTR, CTR);
      let t = 0;
      for (let step = 1; step <= fx.steps; step++) {
        for (const c of by.get(step) ?? []) enqueue({ side: c.side, kind: c.kind, payload: c.payload } as CommandInput);
        simulate(SIM_DT, 3);
        if (step % 8 !== 0) continue;
        drain(3); // a frame at 8x: eight steps
        if (!sound) continue;
        t += 1000 / 60;
        setNow(t);
        updateCueSources(1 / 60);
        updateAmbience(1 / 60);
        updateBirds(1 / 60);
      }
      const out = { rngN: rngN(), hash: stateHash(), played: seen, rows: auditLog().length, tones: dryCalls().tone + dryCalls().grain };
      setDryRun(false);
      setLogSink(null);
      return out;
    };
    const silent = play(false);
    const loud = play(true);
    expect(loud.rngN).toBe(silent.rngN);
    expect(loud.hash).toBe(silent.hash);
    expect(loud.rows).toBe(200);
    expect(silent.rows).toBe(0);
    expect(loud.tones).toBeGreaterThan(1000);
    // over the three days the park sounded its water, its birds and its pigeons, and the cues of the people in it
    for (const id of ['fountain', 'bird', 'coo', 'bench_creak', 'murmur', 'place']) expect(loud.played.has(id), id).toBe(true);
    expect([...loud.played].some((id) => id.startsWith('step_'))).toBe(true);
  }, 240_000);
});
