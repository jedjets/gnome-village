// src/play/abilities-mischief.ts
// The four Mischief abilities of tier 0 and 1 (02 9.3): m_pigeon, m_sprinkler, m_peel, m_pomeranian; their "fails when", first step and
// timeline. Split out of abilities.ts (AGENTS rule 9; 03 2.6 row abilities-mischief.ts). NEW. Every landing goes through embarrass.land
// (refusals, the 15 % backfire, the cost, the cap of 3 a day, the `score` progression.ts reads), so nothing here decides the tone rules.
// m_pigeon: the nearest free pigeon (or a new one from the north edge) swoops at 6.0 to the target, 2 s later in mist of 0.6 or more; on
// arrival (creatures.ts swoopStep, through the hook registered below) `poop` lands; at a Picnic the pigeon pecks the blanket (a `peck`
// event) and the landing interrupts the stage like any other. m_sprinkler: a `sprinkler` prop (blocks, 10 s) on a lawn tile; everyone
// who is in or walks into its 3 x 3 gets `soaked` once, children skipped; WET = 1 on the 9 tiles; it sinks at t 10. m_peel: a `peel` prop
// (passable, 120 s) on a path tile; the first adult non-staff walker on it gets `trip`, and the peel goes. m_pomeranian: sendPomeranian
// (pomeranian.ts) runs Pompon's snatch; the effect lasts until he is outside again.
// TODO(S6-art): the sprinkler's spray (fx 'drop'), the peel and sprinkler props' drawing, the splat (fx 'poopDot') and the slip dust
// (fx 'dust') are events and props only; the owner picks the drawings.
import { emit } from '../core/events.ts';
import { OK, fail } from '../core/commands.ts';
import { markWetUnknown, weatherAt } from '../core/weather.ts';
import { I, KIND, Kind, OCC, WET, addProp, inB, propById, props, removeProp } from '../world/grid.ts';
import { iceState } from '../world/water.ts';
import { count, creatureById, creatures, nearestFreePigeon, setSwoopHook, spawnPigeon, startSwoop, SWOOP_FOG_DELAY, CAP_PIGEONS } from '../entities/creatures.ts';
import { canTarget, land, firstItem } from '../entities/embarrass.ts';
import { pomeranianFree, sendPomeranian } from '../entities/pomeranian.ts';
import { byId, moveOffBlocked, nowTick, visitors, type Visitor } from '../entities/visitor.ts';
import type { Effect, Handler } from './abilities.ts';

const SEC = 60;
export const SPRINKLER_T = 10 * SEC;
export const SPRINKLER_R = 1; // the 3 x 3
export const PEEL_T = 120 * SEC;
export const SNOW_SLIPPERY = 0.3; // snow at the tile from which "the ground is slippery enough"
export const MIST_PERCHED = 0.6; // mist at the pigeon from which it takes 2 s longer (02 9.3 fog)
export const PIGEON_MAX_T = 40 * SEC; // an effect whose pigeon never arrived ends here
export const DOG_SAW_IT_R = 3; // a walker's dog this close to the target sees Pompon off (02 9.3)
export const POM_EFFECT_MAX = 150 * SEC;

const STAFF = new Set(['gardener', 'vendor']);

function fx(x: number, y: number, kind: string, n: number, ids: number[] = []): void {
  emit({ kind: 'fx', tick: nowTick(), x, y, ids, params: { fx: kind, n } });
}

/* ---------- m_pigeon ---------- */

function atPicnic(v: Visitor): boolean {
  return v.st === 'picnic' || v.st === 'goPicnic';
}

// The pigeon's arrival (creatures.ts swoopStep): the poop lands on the victim; a pigeon at a Picnic pecks the blanket (the same `poop`).
setSwoopHook((c, victim) => {
  const v = byId(victim);
  if (!v) return;
  if (atPicnic(v)) emit({ kind: 'peck', tick: nowTick(), x: v.x, y: v.y, ids: [c.id, v.id], params: { picnic: 1 } });
  land('poop', v.id, 'mischief');
  fx(v.x, v.y, 'poopDot', 3, [v.id]);
});

const PIGEON_H: Handler = {
  check: (r) => {
    const v = r.visitor as Visitor;
    const t = canTarget(v);
    if (!t.ok) return fail(t.reason);
    if (!nearestFreePigeon(v.x, v.y) && count('pigeon') >= CAP_PIGEONS) return fail('reason.busy');
    return OK;
  },
  start: (e, r) => {
    const v = r.visitor as Visitor;
    const c = nearestFreePigeon(v.x, v.y) ?? spawnPigeon();
    e.until = e.startTick + PIGEON_MAX_T;
    if (!c) return;
    e.actorId = c.id;
    e.targetId = v.id;
    startSwoop(c, v.id, weatherAt(c.x, c.y).mist >= MIST_PERCHED ? SWOOP_FOG_DELAY : 0);
  },
  step: (e, now) => {
    const c = creatureById(e.actorId);
    return !c || c.st !== 'swoop' || now >= e.until;
  },
};

/* ---------- m_sprinkler ---------- */

function inside(e: Effect, v: Visitor): boolean {
  return Math.abs(Math.round(v.x) - e.x) <= e.r && Math.abs(Math.round(v.y) - e.y) <= e.r;
}

const SPRINKLER_H: Handler = {
  check: (r) => {
    const i = I(r.x, r.y);
    if (KIND[i] !== Kind.lawn) return fail('reason.lawn_only');
    if (OCC[i] !== 0) return fail('reason.taken');
    return OK;
  },
  start: (e) => {
    e.r = SPRINKLER_R;
    e.until = e.startTick + SPRINKLER_T;
    const p = addProp({ kind: 'sprinkler', x: e.x, y: e.y, w: 1, h: 1, rot: 0, placedBy: 'sim', untilTick: e.until });
    e.propId = p.id;
    moveOffBlocked([I(e.x, e.y)]); // whoever stood on the tile steps aside
    for (let y = e.y - e.r; y <= e.y + e.r; y++) for (let x = e.x - e.r; x <= e.x + e.r; x++) if (inB(x, y)) WET[I(x, y)] = 1;
    markWetUnknown();
    fx(e.x, e.y, 'drop', 18);
  },
  step: (e, now) => {
    if (now >= e.until || !propById(e.propId)) return true;
    for (const v of visitors) {
      if (v.archetype === 'child' || v.archetype === 'cameo' || e.data['s' + v.id] || !inside(e, v)) continue;
      e.data['s' + v.id] = 1; // once per person per sprinkler, whether it landed or was refused
      land('soaked', v.id, 'mischief');
    }
    return false;
  },
  end: (e) => {
    if (propById(e.propId)) removeProp(e.propId); // it sinks
  },
};

/* ---------- m_peel ---------- */

const PEEL_H: Handler = {
  check: (r) => {
    const k = KIND[I(r.x, r.y)];
    if (k !== Kind.gravel && k !== Kind.flagstone) return fail('reason.not_here');
    if (OCC[I(r.x, r.y)] !== 0) return fail('reason.taken');
    if (props.some((p) => p.kind === 'peel' && p.x === r.x && p.y === r.y)) return fail('reason.peel_here');
    if (weatherAt(r.x, r.y).snow > SNOW_SLIPPERY || iceState().on === 1) return fail('reason.slippery');
    return OK;
  },
  start: (e) => {
    e.until = e.startTick + PEEL_T;
    e.propId = addProp({ kind: 'peel', x: e.x, y: e.y, w: 1, h: 1, rot: 0, placedBy: 'sim', untilTick: e.until }).id;
  },
  step: (e, now) => {
    if (now >= e.until || !propById(e.propId)) return true;
    for (const v of visitors) {
      if (!v.path || v.archetype === 'child' || v.archetype === 'cameo' || STAFF.has(v.archetype)) continue;
      if (Math.round(v.x) !== e.x || Math.round(v.y) !== e.y) continue;
      if (!land('trip', v.id, 'mischief').ok) continue; // not them (three a day already): the peel waits for the next
      fx(e.x, e.y, 'dust', 4, [v.id]);
      return true; // the peel vanishes
    }
    return false;
  },
  end: (e) => {
    if (propById(e.propId)) removeProp(e.propId);
  },
};

/* ---------- m_pomeranian ---------- */

const POMERANIAN_H: Handler = {
  check: (r) => {
    const v = r.visitor as Visitor;
    if (!firstItem(v)) return fail('reason.no_item');
    if (creatures.some((c) => c.kind === 'dog' && !c.outside && Math.hypot(c.x - v.x, c.y - v.y) <= DOG_SAW_IT_R)) return fail('reason.dog_saw_it');
    const t = canTarget(v);
    if (!t.ok) return fail(t.reason);
    return pomeranianFree() ? OK : fail('reason.busy');
  },
  start: (e, r) => {
    const v = r.visitor as Visitor;
    e.targetId = v.id;
    e.until = e.startTick + POM_EFFECT_MAX;
    sendPomeranian(v.id);
    const c = creatures.find((x) => x.kind === 'pomeranian');
    if (c) e.actorId = c.id;
  },
  step: (e, now) => {
    const c = creatureById(e.actorId);
    return !c || c.outside || now >= e.until;
  },
};

export const MISCHIEF_HANDLERS = {
  m_pigeon: PIGEON_H,
  m_sprinkler: SPRINKLER_H,
  m_peel: PEEL_H,
  m_pomeranian: POMERANIAN_H,
} as const satisfies Partial<Record<string, Handler>>;
