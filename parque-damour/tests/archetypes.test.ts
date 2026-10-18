// tests/archetypes.test.ts
// Locks 02 4.3 (every archetype's routine reaches each of its states), 07 S4.7 item 3 (over one seeded day, read through v.st each second:
// the jogger never sits; the artist's easel is in OCC and leaves with the artist; the child never leaves the parent by more than 8 tiles)
// / 08 2.3 archetypes.test.ts rows / 07 S4.6 step 6. The cast arrives at the start (two of each archetype the caps allow, one artist and
// one busker, four elders so two are free for chess at once), a worn lawn line gives the gardener a run to pave (02 11.1) and a rainy spell sends him under the kiosk's awning (02 4.3
// gardener item 4); then the park lives one day by itself, arrivals and all.
// The day is seed 104's. Whether the rarer states (an elder's chess, a couple's picnic, a single's read) all fall inside one day depends on
// the sim stream: with S4 part B's review fixes, 3 of seeds 101-112 show every state (102, 107, 111), and seed 101, which the first build
// used, no longer shows an elder at chess (the stream moved when a couple's second stopped standing up before the first sat down, act.ts
// seatedStep). The assertions are unchanged; a later change to the sim can need another seed (an open question in the S4 hand-back).
// S5 moved it as foreseen: a couple is now a Pair whose Stroll and Bench run as romance stages (`stroll`, `bench`) and a single may pair
// up, so seed 102 no longer shows a single on a bench or a couple on its own loop. Seeds 101-160 rescanned with the assertions unchanged:
// 104, 105, 106, 114, 115, 117, 121, 131 and 140 show every state; the day is now seed 104's (was 102).
import { describe, it, expect, beforeAll } from 'vitest';
import { SIM_DT, newPark, simulate } from '../src/core/loop.ts';
import { enqueue } from '../src/core/commands.ts';
import { clearListeners } from '../src/core/events.ts';
import { I, KIND, Kind, OCC, WEAR, props } from '../src/world/grid.ts';
import { arriveGroup, byId, visitors, type Archetype } from '../src/entities/visitor.ts';

/** The routine states of 02 4.3 each archetype must reach (the walks between them are not listed). */
const STATES: Partial<Record<Archetype, readonly string[]>> = {
  single: ['strollLoop', 'sit', 'eat', 'feed', 'read'],
  couple: ['strollLoop', 'sit', 'picnic', 'goLeave'],
  family: ['watch', 'eat', 'goLeave'],
  child: ['play'],
  elder: ['sit', 'feed', 'chess'],
  tourist: ['photo'],
  jogger: ['strollLoop', 'goLeave'],
  artist: ['paint', 'goLeave'],
  busker: ['play', 'goLeave'],
  dogwalker: ['strollLoop', 'goLeave'],
  gardener: ['strollLoop', 'pave', 'tidy', 'shelter'],
  vendor: ['serve'],
};

const seen = new Map<Archetype, Set<string>>();
let joggerSat = 0, farthestChild = 0, painted = 0, easelOk = true;

beforeAll(() => {
  clearListeners();
  newPark(104);
  for (let x = 2; x <= 7; x++) WEAR[I(x, 1)] = 4; // a desire path for the gardener: the busiest wear, the first in row order (02 11.1 item 4)
  for (let x = 2; x <= 7; x++) expect(KIND[I(x, 1)]).toBe(Kind.lawn);
  const cast: Archetype[] = [
    'single', 'single', 'couple', 'couple', 'family', 'family', 'elder', 'elder', 'elder', 'elder', 'tourist', 'tourist', 'jogger', 'jogger',
    'artist', 'busker', 'dogwalker', 'dogwalker',
  ];
  const gates = ['g_south_w', 'g_south_e', 'g_west', 'g_east', 'g_north'] as const;
  cast.forEach((a, k) => arriveGroup(a, gates[k % 5] as (typeof gates)[number]));
  for (let step = 1; step <= 21600; step++) {
    if (step === 9000) enqueue({ side: 'park', kind: 'debug.weather', payload: { kind: 'rain' } });
    if (step === 12000) enqueue({ side: 'park', kind: 'debug.weather', payload: { kind: 'fair' } });
    simulate(SIM_DT, 0);
    if (step % 60 !== 0) continue;
    for (const v of visitors) {
      let s = seen.get(v.archetype);
      if (!s) seen.set(v.archetype, (s = new Set()));
      s.add(v.st);
      if (v.archetype === 'jogger' && (v.sitPropId !== 0 || v.st === 'sit')) joggerSat++;
      if (v.archetype === 'child') {
        const p = byId(v.childOf);
        if (p) farthestChild = Math.max(farthestChild, Math.hypot(p.x - v.x, p.y - v.y));
      }
      if (v.archetype === 'artist' && v.st === 'paint') {
        painted++;
        const e = props.find((p) => p.kind === 'easel' && p.data.ownerId === v.id);
        if (!e || OCC[I(e.x, e.y)] !== e.id) easelOk = false;
      }
    }
    for (const e of props) if (e.kind === 'easel' && !byId(e.data.ownerId ?? 0)) easelOk = false; // left without it
  }
}, 120_000);

describe('every archetype reaches each of its routine states in one seeded day (02 4.3; 07 S4.7 item 3; 08 2.3)', () => {
  for (const [a, states] of Object.entries(STATES) as Array<[Archetype, readonly string[]]>)
    it(`${a}: ${states.join(', ')}`, () => {
      const s = seen.get(a) ?? new Set<string>();
      for (const st of states) expect(s.has(st), `${a} in ${st} (saw ${[...s].join(' ')})`).toBe(true);
    });
});

describe('the rules that hold all day (07 S4.7 item 3; 08 2.3)', () => {
  it('the jogger never sits', () => {
    expect(seen.get('jogger')?.size).toBeGreaterThan(0);
    expect(joggerSat).toBe(0);
  });
  it('the artist\'s easel is in OCC while the artist paints and leaves with the artist', () => {
    expect(painted).toBeGreaterThan(0);
    expect(easelOk).toBe(true);
  });
  it('the child never leaves the parent by more than 8 tiles', () => {
    expect(seen.get('child')?.size).toBeGreaterThan(0);
    expect(farthestChild).toBeLessThanOrEqual(8);
  });
});
