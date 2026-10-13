// tests/brain.test.ts
// Locks 02 5.2 (the decide ladder: rung 0 busy, 1 the reaction, 2 shelter, 3 leave, 4 eat, 5 rest, 7 the routine, 8 wander; children
// follow the parent on rungs 2-3), 02 5.3 (BUSY, CAN_INTERRUPT), 02 4.3 (a couple leaves by one gate; staff never leave; a jogger never
// sits) and 03 4.4 (the cadence, GV 5696) / 08 2.3 brain.test.ts rows / 07 S4.6 step 6. Rung 6 (the romance step) is S5's.
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark } from '../src/core/loop.ts';
import { T } from '../src/core/clock.ts';
import { W } from '../src/core/weather.ts';
import { props, propById, removeProp, addProp, type Prop } from '../src/world/grid.ts';
import { GATES } from '../src/world/park.ts';
import { BUSY, CAN_INTERRUPT, REACTION, decide } from '../src/entities/brain.ts';
import { ensureVendors, servingTile } from '../src/entities/staff.ts';
import { DECIDE_MAX, DECIDE_MIN, NEVER, arriveGroup, decideCadence, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';

beforeEach(() => {
  newPark(101);
});

/** A single standing at (x, y), arrived, with its needs set and its visit not over. */
function at(x: number, y: number, arch: 'single' | 'jogger' | 'gardener' | 'elder' = 'single'): Visitor {
  const v = spawnVisitor(arch, 'g_west') as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0, hunger: 0.3, energy: 0.8, comfort: 0.7 });
  if (arch !== 'gardener') v.leaveAt = T.abs + 0.3;
  return v;
}

const kiosk = (): Prop => props.find((p) => p.kind === 'kiosk') as Prop;

describe('the sets (02 5.3; GV 4558-4566)', () => {
  it('BUSY holds the reaction states and the listed states; CAN_INTERRUPT exactly 02 5.3\'s eight', () => {
    for (const st of ['eat', 'sit', 'read', 'feed', 'chat', 'bench', 'stroll', 'picnic', 'kiss', 'proposal', 'boat', 'photo', 'paint', 'play',
      'pave', 'tidy', 'serve', 'shelter', 'chase', 'goLeave', 'laugh', ...Object.values(REACTION).map((r) => r[0])])
      expect(BUSY[st], st).toBe(true);
    expect(Object.keys(CAN_INTERRUPT).sort()).toEqual(['goBench', 'goEat', 'goKiosk', 'goSit', 'idle', 'strollLoop', 'wander', 'watch'].sort());
    for (const st of Object.keys(CAN_INTERRUPT)) expect(BUSY[st], st).toBeUndefined();
  });
  it('the reactions of 02 6.4: wipe 4, shake 3, stumble 3, chase 8, flap 6, huddle 5, distracted 30, baffled 4, lost 60, duck 5', () => {
    expect(REACTION).toEqual({
      poop: ['wipe', 4], soaked: ['shake', 3], trip: ['stumble', 3], snatched: ['chase', 8], wasp: ['flap', 6],
      drenched: ['huddle', 5], rival: ['distracted', 30], mime: ['baffled', 4], fog: ['lost', 60], flock: ['duck', 5],
    });
  });
});

describe('the decide ladder (02 5.2; 08 2.3)', () => {
  it('rung 0 busy returns without deciding', () => {
    const v = at(10, 10);
    v.st = 'eat';
    v.job = { propId: 7 };
    v.hunger = 0.9;
    decide(v);
    expect([v.st, v.job]).toEqual(['eat', { propId: 7 }]);
  });

  it('rung 1 reaction beats shelter: pendingEmb poop, rain 0.9, comfort 0.1 gives wipe and clears pendingEmb', () => {
    const v = at(10, 10);
    W.rain = 0.9;
    v.comfort = 0.1;
    v.pendingEmb = 'poop';
    decide(v);
    expect([v.st, v.t, v.pendingEmb]).toEqual(['wipe', 4, null]);
  });

  it('rung 2 shelter beats leave: rain 0.9, comfort 0.2, leaveAt passed, a kiosk within 20 gives shelter', () => {
    const k = kiosk();
    const v = at(k.x + 4, k.y - 6);
    W.rain = 0.9;
    v.comfort = 0.2;
    v.leaveAt = T.abs - 0.01;
    decide(v);
    expect(v.st).toBe('shelter');
    const t = v.job.tile as { x: number; y: number };
    expect(Math.hypot(t.x - v.x, t.y - v.y)).toBeLessThanOrEqual(20);
  });

  it('rung 2 with no shelter within 20 sends the visitor home', () => {
    for (const p of props.slice()) if (p.kind === 'tree' || p.kind === 'kiosk' || p.kind === 'bandstand') removeProp(p.id);
    const v = at(40, 5);
    W.rain = 0.9;
    v.comfort = 0.2;
    decide(v);
    expect(v.st).toBe('goLeave');
  });

  it('rung 3 leave fires at leaveAt or comfort < 0.1, by the nearest gate', () => {
    const v = at(20, 44);
    v.leaveAt = T.abs;
    decide(v);
    expect([v.st, v.gateOut]).toEqual(['goLeave', 'g_south_w']);
    const o = at(44, 20);
    o.comfort = 0.05;
    decide(o);
    expect([o.st, o.gateOut]).toEqual(['goLeave', 'g_east']);
  });

  it('rung 4 eat beats rest: hunger 0.7, energy 0.1, a kiosk and a bench near give goEat to the kiosk', () => {
    ensureVendors();
    const k = kiosk();
    const s = servingTile(k);
    const v = at(s.x + 3, s.y - 3);
    v.hunger = 0.7;
    v.energy = 0.1;
    decide(v);
    expect([v.st, v.job.propId]).toEqual(['goEat', k.id]);
  });

  it('rung 4 without a kiosk within 30 is a snack on the nearest free bench; without a vendor the kiosk does not serve', () => {
    const v = at(30, 5);
    v.hunger = 0.7;
    decide(v); // the starter kiosk has no vendor before the first planning tick
    expect([v.st, v.job.kind, propById(v.job.propId ?? 0)?.kind]).toEqual(['goSit', 'snack', 'bench']);
  });

  it('rung 5 rest needs energy < 0.25 and a free bench within 15', () => {
    for (const p of props.slice()) if (p.kind === 'bench') removeProp(p.id);
    const b = addProp({ kind: 'bench', x: 5, y: 30, w: 1, h: 1, rot: 0, placedBy: 'player' });
    const v = at(15, 30);
    v.energy = 0.2;
    decide(v);
    expect([v.st, v.job.kind, v.job.propId]).toEqual(['goSit', 'rest', b.id]);
    const far = at(21, 30); // 16 tiles away
    far.energy = 0.2;
    decide(far);
    expect(far.st).not.toBe('goSit');
  });

  it('a jogger never sits: no rest, no bench snack (07 S4.7 item 3)', () => {
    const j = at(30, 5, 'jogger');
    j.energy = 0.1;
    j.hunger = 0.7;
    decide(j);
    expect(j.st).not.toBe('goSit');
    expect(j.sitPropId).toBe(0);
  });

  it.todo('rung 6 romance beats the routine (needs pairs: S5 entities/romance.ts romanceStep; 07 S5)');
  it.todo('rung 6 waits for comfort 0.35 and retryT (needs pairs: S5; 07 S5)');

  it('rung 7 starts the routine and keeps an activity in progress; rung 8 wanders when the routine gives nothing', () => {
    const v = at(23, 30);
    decide(v);
    const st = v.st;
    expect(['strollLoop', 'goBench', 'goKiosk', 'wander']).toContain(st);
    const job = JSON.stringify(v.job);
    for (let k = 0; k < 20; k++) decide(v);
    expect([v.st, JSON.stringify(v.job)]).toEqual([st, job]); // re-deciding every 0.5-1.3 s does not flip it
    const tourist = spawnVisitor('tourist', 'g_west') as Visitor;
    Object.assign(tourist, { x: 23, y: 33, path: null, st: 'idle', t: 0, plan: 3 }); // its three viewpoints are done
    decide(tourist);
    expect([tourist.st, tourist.job.kind]).toEqual(['wander', 'wander']);
    expect(Math.hypot(tourist.ptx - 23, tourist.pty - 33)).toBeLessThanOrEqual(6 * Math.SQRT2 + 0.5);
  });

  it('an idle between activities waits its 2-5 s out (02 4.3)', () => {
    const v = at(23, 30);
    v.t = 3;
    decide(v);
    expect([v.st, v.t]).toEqual(['idle', 3]);
  });
});

describe('children, couples and staff (02 5.2 last line, 4.3)', () => {
  it('a child follows its parent on rungs 2-3: the parent\'s gate when it leaves, its shelter when it shelters', () => {
    const [p, c] = arriveGroup('family', 'g_north') as [Visitor, Visitor];
    for (const v of [p, c]) Object.assign(v, { x: 40, y: 26, path: null, st: 'idle', t: 0 });
    p.leaveAt = T.abs;
    decide(p);
    expect([p.st, p.gateOut]).toEqual(['goLeave', 'g_east']);
    decide(c);
    expect([c.st, c.gateOut]).toEqual(['goLeave', 'g_east']);
    newPark(101);
    const [p2, c2] = arriveGroup('family', 'g_north') as [Visitor, Visitor];
    for (const v of [p2, c2]) Object.assign(v, { x: 16, y: 40, path: null, st: 'idle', t: 0, comfort: 0.2 });
    W.rain = 0.9;
    decide(p2);
    expect(p2.st).toBe('shelter');
    decide(c2);
    expect([c2.st, c2.job.tile]).toEqual(['shelter', p2.job.tile]);
  });

  it('a couple leaves together by one gate (02 4.3 couple item 4)', () => {
    const [f, m] = arriveGroup('couple', 'g_north') as [Visitor, Visitor];
    for (const v of [f, m]) Object.assign(v, { x: 30, y: 30, path: null, st: 'idle', t: 0 });
    f.comfort = 0.05;
    decide(f);
    expect([f.st, m.st, f.gateOut]).toEqual(['goLeave', 'goLeave', m.gateOut]);
  });

  it('the gardener never leaves: comfort 0 and an old visit change nothing; a vendor serves', () => {
    const g = at(20, 20, 'gardener');
    expect(g.leaveAt).toBe(NEVER);
    g.comfort = 0;
    decide(g);
    expect(g.st).not.toBe('goLeave');
    ensureVendors();
    const v = props.find((p) => p.kind === 'kiosk')?.data.vendorId ?? 0;
    expect(v).toBeGreaterThan(0);
  });
});

describe('the decide cadence (03 4.4; GV 5696; 08 2.3)', () => {
  it('1000 cadences draw decideT in [0.5, 1.3]', () => {
    expect([DECIDE_MIN, DECIDE_MAX]).toEqual([0.5, 1.3]);
    const v = at(23, 30);
    for (let k = 0; k < 1000; k++) {
      v.decideT = 0;
      decideCadence(v, SIM_DT, decide, BUSY);
      expect(v.decideT).toBeGreaterThanOrEqual(0.5);
      expect(v.decideT).toBeLessThan(1.3);
    }
  });
  it('the gates of 02 2.4 are the ones the leave rung picks from', () => {
    expect(GATES.map((g) => g.id)).toEqual(['g_south_w', 'g_south_e', 'g_west', 'g_east', 'g_north']);
  });
});
