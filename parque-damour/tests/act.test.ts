// tests/act.test.ts
// Locks 03 6.3 item 4 (the act state machine: every state has a case; the `default` case sets idle and warns once) and the timers of
// 02 4.3 / 06 1.8 that act.ts runs: the kiosk serves one eater for 12 s (hunger to 0.1) and a second waits 5 s; a seat is promised when
// the walk starts and taken on arrival; the feeder drops crumbs every 10 s for 40 s; a photo takes 6 s; the artist paints 0.4 day beside
// an easel in OCC and leaves with it; the gardener lays 1.3 s per tile (GV LAY_T 4554) / 08 2.3 act.test.ts rows / 07 S4.6 step 7.
// The reaction lengths of 02 6.4 are S5's (act.ts gains the reaction states there). S4 part B review fixes: a seat listed for a visitor
// who no longer holds it (a walker that gave up its route, a sitter the remove tool stood up whose bench an undo put back) is free; a
// couple's second who reaches the seat first waits for the first (02 4.3 couple item 2); an easel the remove tool took and an undo put
// back after its artist stopped painting goes at the next planning tick (02 4.3 artist item 2; 07 S4.7 item 3).
import { describe, it, expect, beforeEach } from 'vitest';
import { PLAN_STEPS, SIM_DT, newPark, simulate } from '../src/core/loop.ts';
import { applyNow, type Result, type ToolPayload } from '../src/core/commands.ts';
import { setMode } from '../src/play/mode.ts';
import { propAt } from '../src/play/tools.ts';
import { DAYLEN, T } from '../src/core/clock.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { I, KIND, Kind, OCC, PAVEDAY, propById, props, type Prop } from '../src/world/grid.ts';
import { giveUp, moveStep } from '../src/entities/move.ts';
import {
  DOING, FEED_T, KIOSK_EAT_T, KIOSK_HUNGER, PAINT_DAYS, PHOTO_T, QUEUE_WAIT, act, dropStrayEasels, resetActWarnings, startKiosk, startSeat,
} from '../src/entities/act.ts';
import { LAY_T, SEATS, approachOf, ensureVendors, freeSeats, seatPos, setPavingState } from '../src/entities/staff.ts';
import { byId, spawnVisitor, type Visitor } from '../src/entities/visitor.ts';

const tool = (payload: ToolPayload): Result => applyNow({ side: 'park', kind: 'tool', payload });
const undo = (): Result => applyNow({ side: 'park', kind: 'undo', payload: {} });

beforeEach(() => {
  clearListeners();
  newPark(101);
});

function who(arch: Parameters<typeof spawnVisitor>[0] = 'single', x = 20, y = 33): Visitor {
  const v = spawnVisitor(arch, 'g_west') as Visitor;
  Object.assign(v, { x, y, path: null, st: 'idle', t: 0 });
  return v;
}
/** act then walk, `s` sim seconds. */
function live(v: Visitor, s: number): void {
  for (let k = 0; k < Math.round(s * 60); k++) {
    act(v, SIM_DT);
    moveStep(v, SIM_DT);
  }
}

describe('every state has a case (03 6.3 item 4; 08 2.3)', () => {
  it('DOING lists the states of 02 4.3 that act.ts runs, and none of them reaches default (no warn)', () => {
    expect([...DOING].sort()).toEqual([
      'arrive', 'chess', 'eat', 'feed', 'goBench', 'goEat', 'goKiosk', 'goLeave', 'goPicnic', 'goSit', 'idle', 'paint', 'pave', 'photo',
      'picnic', 'play', 'read', 'serve', 'shelter', 'sit', 'strollLoop', 'tidy', 'wander', 'watch',
    ]);
    const warns: GameEvent[] = [];
    on('warn', (e) => warns.push(e));
    resetActWarnings();
    for (const st of DOING) {
      const v = who();
      v.st = st;
      v.t = 1;
      act(v, SIM_DT);
    }
    expect(warns).toEqual([]);
  });

  it('default sets idle and warns once over 10 calls', () => {
    const warns: GameEvent[] = [];
    on('warn', (e) => warns.push(e));
    resetActWarnings();
    const v = who();
    for (let k = 0; k < 10; k++) {
      v.st = 'nonsense';
      act(v, SIM_DT);
      expect(v.st).toBe('idle');
    }
    expect(warns).toHaveLength(1);
    expect(warns[0]?.params).toMatchObject({ st: 'nonsense' });
  });

  it.todo('reaction lengths match 02 6.4: wipe 4, shake 3, stumble 3, flap 6, huddle 5, baffled 4, duck 5, distracted 30, lost <= 60, chase 8 then huff 3 (S5)');
});

describe('the kiosk (02 4.3 vendor and single item 3; 02 4.4)', () => {
  it('serves one eater at a time for 12 s, hunger to 0.1; a second waits 5 s, then goes elsewhere', () => {
    ensureVendors();
    const k = props.find((p) => p.kind === 'kiosk') as Prop;
    const a = who('single', 14, 40), b = who('single', 15, 40);
    a.hunger = 0.8;
    expect(startKiosk(a, k, 'goKiosk')).toBe(true);
    live(a, 4);
    expect(a.st).toBe('eat');
    expect(startKiosk(b, k, 'goKiosk')).toBe(true);
    live(b, 3);
    expect(b.st).toBe('goKiosk'); // waiting at the counter
    live(b, QUEUE_WAIT);
    expect([b.st, b.job]).toEqual(['idle', {}]);
    live(a, KIOSK_EAT_T);
    expect([a.st, a.hunger]).toEqual(['idle', KIOSK_HUNGER]);
  });
});

describe('seats (02 4.3 bench, read, feed; 02 6.6 item 3)', () => {
  it('a seat is promised when the walk starts and taken on arrival; standing up leaves it on the approach tile', () => {
    const b = props.find((p) => p.kind === 'bench') as Prop;
    const v = who('single', b.x + 4, b.y + 4);
    const sits: GameEvent[] = [];
    on('sit', (e) => sits.push(e));
    expect(startSeat(v, b, 'goBench', 'read', FEED_T)).toBe(true);
    expect(b.data.sitters).toEqual([v.id]);
    live(v, 6);
    expect([v.st, v.sitPropId]).toEqual(['read', b.id]);
    const s0 = seatPos(b, 0);
    expect([v.x, v.y]).toEqual([s0.x, s0.y]);
    expect(sits).toHaveLength(1);
    live(v, FEED_T);
    expect([v.st, v.sitPropId, b.data.sitters]).toEqual(['idle', 0, []]);
    const a = approachOf(b);
    expect([v.x, v.y]).toEqual([a?.x, a?.y]);
  });

  it('the feeder drops crumbs in front of the bench every 10 s for 40 s: four handfuls', () => {
    const b = props.find((p) => p.kind === 'bench') as Prop;
    const v = who('elder', b.x + 3, b.y + 3);
    startSeat(v, b, 'goBench', 'feed', FEED_T);
    const front = approachOf(b) as { x: number; y: number };
    let drops = 0;
    for (let k = 0; k < 60 * 60; k++) {
      act(v, SIM_DT);
      moveStep(v, SIM_DT);
      const c = props.find((p) => p.kind === 'crumbs' && p.x === front.x && p.y === front.y);
      if (c) {
        drops++;
        c.untilTick = 1; // eaten at once, so the next handful makes a new prop
        props.splice(props.indexOf(c), 1);
      }
    }
    expect(drops).toBe(FEED_T / 10);
  });
});

describe('a seat listed for someone who no longer holds it is free (02 4.3 bench; 02 6.6 item 3; 06 4: 2 seats)', () => {
  it('a walker that gave up its route (move.ts giveUp) leaves its promised seat to the next walker', () => {
    const b = propAt(31, 24) as Prop;
    const v = who('single', 20, 25), o = who('single', 21, 25), w = who('single', 22, 25);
    expect(startSeat(v, b, 'goBench', 'sit', 30)).toBe(true);
    expect([b.data.sitters, freeSeats(b)]).toEqual([[v.id], SEATS - 1]);
    giveUp(v); // after 6 blocked steps or an unreachable approach tile (02 5.4)
    expect([v.st, v.job]).toEqual(['idle', {}]);
    expect(freeSeats(b)).toBe(SEATS);
    expect(startSeat(o, b, 'goBench', 'sit', 30)).toBe(true);
    expect(startSeat(w, b, 'goBench', 'sit', 30)).toBe(true); // both seats: the given-up promise held neither
    expect(b.data.sitters).toEqual([o.id, w.id]);
    expect(freeSeats(b)).toBe(0);
  });

  it('remove on an occupied bench stands its sitters up; the undo puts the bench back with both seats free (02 8.3 "sitters stand")', () => {
    setMode('creator');
    const b = propAt(31, 24) as Prop;
    const a = who('single', 31, 25), c = who('single', 32, 25);
    for (const v of [a, c]) {
      expect(startSeat(v, b, 'goBench', 'sit', 30)).toBe(true);
      live(v, 3);
    }
    expect([a.sitPropId, c.sitPropId, b.data.sitters]).toEqual([b.id, b.id, [a.id, c.id]]);
    expect(tool({ tool: 'remove', at: { x: 31, y: 24 } }).ok).toBe(true);
    expect([a.st, a.sitPropId, c.st, c.sitPropId]).toEqual(['idle', 0, 'idle', 0]);
    expect(undo().ok).toBe(true);
    const back = propById(b.id) as Prop;
    expect(freeSeats(back)).toBe(SEATS);
    const d = who('single', 30, 26), e = who('single', 33, 26);
    expect(startSeat(d, back, 'goBench', 'sit', 30)).toBe(true);
    expect(startSeat(e, back, 'goBench', 'sit', 30)).toBe(true);
    expect(back.data.sitters).toEqual([d.id, e.id]);
  });
});

describe('a couple on one bench (02 4.3 couple item 2: both sit on one bench 30-60 s)', () => {
  it('the second, there first, stays seated until the first has sat down and stood up: one sit and one stand each', () => {
    const b = propAt(31, 24) as Prop;
    const lead = who('couple', 25, 25), second = who('couple', 31, 25);
    lead.coupleOf = second.id;
    second.coupleOf = lead.id;
    const ev: GameEvent[] = [];
    on('sit', (e) => ev.push(e));
    on('stand', (e) => ev.push(e));
    expect(startSeat(lead, b, 'goBench', 'sit', 30)).toBe(true);
    expect(startSeat(second, b, 'goBench', 'with', 0, lead.id)).toBe(true);
    let both = false;
    for (let k = 0; k < 40 * 60; k++) {
      for (const v of [lead, second]) {
        act(v, SIM_DT);
        moveStep(v, SIM_DT);
      }
      if (lead.sitPropId === b.id && second.sitPropId === b.id) both = true;
      if (lead.sitPropId === 0 && second.sitPropId === 0 && both) break;
    }
    expect(both).toBe(true);
    const of = (id: number): string[] => ev.filter((e) => e.ids?.[0] === id).map((e) => e.kind);
    expect(of(second.id)).toEqual(['sit', 'stand']);
    expect(of(lead.id)).toEqual(['sit', 'stand']);
    const standLead = ev.find((e) => e.kind === 'stand' && e.ids?.[0] === lead.id) as GameEvent;
    const standSecond = ev.find((e) => e.kind === 'stand' && e.ids?.[0] === second.id) as GameEvent;
    expect(ev.indexOf(standSecond)).toBeGreaterThan(ev.indexOf(standLead)); // the second gets up with the first, not before
  });
});

describe('tourists, artists and the gardener (02 4.3)', () => {
  it('a photo takes 6 s with a flash, then the next viewpoint is due', () => {
    const v = who('tourist');
    const fx: GameEvent[] = [];
    on('fx', (e) => fx.push(e));
    v.st = 'wander';
    v.job = { kind: 'view' };
    act(v, SIM_DT);
    expect([v.st, v.t, fx[0]?.params?.fx]).toEqual(['photo', PHOTO_T, 'flash']);
    live(v, PHOTO_T + 0.05);
    expect([v.st, v.plan]).toEqual(['idle', 1]);
  });

  it('the artist paints 0.4 day beside an easel in OCC, then leaves with it', () => {
    const v = who('artist', 6, 30);
    v.st = 'wander';
    v.job = { kind: 'easel' };
    act(v, SIM_DT);
    const e = props.find((p) => p.kind === 'easel') as Prop;
    expect([v.st, v.t, e.data.ownerId, OCC[I(e.x, e.y)]]).toEqual(['paint', PAINT_DAYS * DAYLEN, v.id, e.id]);
    live(v, PAINT_DAYS * DAYLEN);
    expect(props.some((p) => p.kind === 'easel')).toBe(false);
    expect(OCC[I(e.x, e.y)]).toBe(0);
    expect(v.st).toBe('goLeave');
  });

  it('an easel the remove tool took goes again at the next planning tick when an undo puts it back after its artist stopped painting', () => {
    setMode('creator');
    const v = who('artist', 38, 12);
    v.st = 'wander';
    v.job = { kind: 'easel' };
    act(v, SIM_DT);
    const e = props.find((p) => p.kind === 'easel') as Prop;
    expect([v.st, OCC[I(e.x, e.y)]]).toEqual(['paint', e.id]);
    dropStrayEasels();
    expect(propById(e.id)?.kind).toBe('easel'); // its artist paints at it: it stays
    expect(tool({ tool: 'remove', at: { x: e.x, y: e.y } }).ok).toBe(true);
    expect(v.st).toBe('idle'); // stood up from it (02 8.3); the artist has painted (plan 1), so it leaves next
    expect(undo().ok).toBe(true);
    expect([propById(e.id)?.kind, OCC[I(e.x, e.y)]]).toEqual(['easel', e.id]);
    for (let k = 0; k < PLAN_STEPS; k++) simulate(SIM_DT, 0);
    expect(v.st).not.toBe('paint');
    expect([propById(e.id), OCC[I(e.x, e.y)]]).toEqual([undefined, 0]);
  });

  it('an easel an undo puts back after its artist left the park goes at the next planning tick', () => {
    setMode('creator');
    const v = who('artist', 38, 12);
    v.st = 'wander';
    v.job = { kind: 'easel' };
    act(v, SIM_DT);
    const e = props.find((p) => p.kind === 'easel') as Prop;
    expect(tool({ tool: 'remove', at: { x: e.x, y: e.y } }).ok).toBe(true);
    for (let k = 0; k < 300 * 60 && byId(v.id); k++) simulate(SIM_DT, 0);
    expect(byId(v.id)).toBeUndefined();
    expect(undo().ok).toBe(true);
    expect(propById(e.id)?.kind).toBe('easel');
    for (let k = 0; k < PLAN_STEPS; k++) simulate(SIM_DT, 0);
    expect([propById(e.id), OCC[I(e.x, e.y)]]).toEqual([undefined, 0]);
  }, 30_000);

  it('the gardener lays a run at 1.3 s a tile: gravel, unworn, PAVEDAY the day', () => {
    const run = [{ x: 4, y: 30 }, { x: 5, y: 30 }, { x: 6, y: 30 }];
    for (const t of run) expect(KIND[I(t.x, t.y)]).toBe(Kind.lawn);
    setPavingState({ runsToday: 1, day: T.day, run, at: 0 });
    const g = who('gardener', 4, 30);
    g.st = 'pave';
    g.job = { kind: 'pave', left: 0 };
    act(g, SIM_DT); // at the tile: the laying starts
    live(g, LAY_T - 0.05);
    expect(KIND[I(4, 30)]).toBe(Kind.lawn);
    live(g, 0.1);
    expect([KIND[I(4, 30)], PAVEDAY[I(4, 30)]]).toEqual([Kind.gravel, T.day]);
    live(g, 3 * (LAY_T + 1));
    for (const t of run) expect([KIND[I(t.x, t.y)], PAVEDAY[I(t.x, t.y)]]).toEqual([Kind.gravel, T.day]);
    expect(g.st).toBe('idle');
  });
});
