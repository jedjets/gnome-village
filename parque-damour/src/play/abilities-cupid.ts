// src/play/abilities-cupid.ts
// The four Cupid abilities of tier 0 and 1 (02 9.2): c_petals, c_bouquet, c_musician, c_sunbeam; their "fails when", first step and timeline.
// Split out of abilities.ts (AGENTS rule 9; 03 2.6 row abilities-cupid.ts). NEW. A handler is {check, start, step, end}; abilities.ts owns
// the registry, the cooldown and the effect list, and calls these.
// c_petals: PETALS = 1 on the 3 x 3 for 19 s, then it eases to 0.19 over the 20th second and the effect ends: the charm (+2 while PETALS >
// 0.2, charm.ts) is on for exactly the 20 s of the register, and from then the layer fades at 1/40 per s (06 1.8 PETALS_FADE) like every
// petal, in stepPetals, which abilities.ts runs before the effects so a held tile stays at 1. c_bouquet: Violette (a `cameo`, 06 6.3)
// appears on an open tile 3 tiles from the pair, walks at 3.0 to the member nearer the tap (the tapped person, else the initiator), hands
// the bouquet 3 s after the cast (affinity +0.05, 2 hearts), waits 3 s, walks 3 tiles off and vanishes (about 7 s in all). c_musician: a
// busker with `spawnedForPlayer` comes in at the nearest gate (6 tiles from the tile when that gate is more than 20 away), walks to the tile
// (the nearest shelter within 6 when the rain there is above 0.6), plays 90 s (act.ts: +3 charm within 8 while it plays, romance.ts) and
// leaves; the effect lasts as long as the busker does. c_sunbeam: a weather override of r 3 for 60 s (02 3.5; needs.ts adds the comfort,
// charm.ts the +1), removed with the effect; while snow is falling (above 0.3) the WET of its 7 x 7 dries twice as fast (02 9.2 interaction:
// the normal fall of weather.ts stepWet plus one more of the same size each step).
// S6 art (register section 4 "S6 art and S5 poses", picked by Claude on the owner's delegation, 2026-10-20): the petal burst (fx 'petal' x 24)
// is the sparkle flurry of render/fx-play.ts, the flower seller (Violette) carries her basket and the bouquet (render/figure-look.ts, figure-props.ts),
// the busker stands with his cap and coins (render/people.ts). TODO(S9): the sunbeam's pick is recorded only, "2 dappled shaft": the soft pool
// with leaf shadows dappling it, three pale shafts slanting down into it and a few drifting motes (scratch/s6-options-light.ts buildSunbeam,
// SunV 2); its drawing is S9's light pass, so here it stays data (the override, the comfort, the charm) and 12 `spark` dots.
import { DAYLEN, T } from '../core/clock.ts';
import { clamp01 } from '../core/math.ts';
import { emit } from '../core/events.ts';
import { OK, fail } from '../core/commands.ts';
import { OVERRIDE_TARGETS, CAP_OVERRIDES, W, WET_FALL, addOverride, overrides, removeOverride, weatherAt } from '../core/weather.ts';
import { BLOCK, I, KIND, Kind, N, NC, PETALS, WATER, WET, inB, rebuildBlock } from '../world/grid.ts';
import { nearestGate } from '../world/park.ts';
import { goTo } from '../entities/move.ts';
import { startWalk } from '../entities/act.ts';
import { facilities, nearestTile, tileXY } from '../entities/staff.ts';
import { CAP_PEOPLE, byId, nowTick, people, removeVisitor, spawnVisitor, visitors } from '../entities/visitor.ts';
import { REACTION_STATES } from '../entities/romance-stages.ts';
import { R_TOGETHER, pairById } from '../entities/romance.ts';
import type { Effect, Handler } from './abilities.ts';

const SEC = 60;
export const PETALS_FADE = 1 / 40; // per sim second (06 1.8)
export const PETALS_HOLD_T = 19 * SEC; // PETALS stays 1 for 19 s ...
export const PETALS_T = 20 * SEC; // ... eases to PETALS_END over the 20th, and the charm ends with it
export const PETALS_END = 0.19; // just under charm.ts PETALS_MIN (0.2)
export const BOUQUET_AFF = 0.05;
export const BOUQUET_HAND_T = 3 * SEC; // the cameo hands the bouquet 3 s after the cast (02 9.2: t about 2-4)
export const BOUQUET_STAY_T = 3 * SEC; // and waits this long before it walks off
export const BOUQUET_AWAY = 3; // tiles it walks off
export const BOUQUET_GAP = 3; // tiles from the pair it appears
export const BOUQUET_MAX_T = 30 * SEC; // a member who walks on for good (she walks at 3.0 too) is not reached: she gives up
export const CAMEO_NAME = 'Violette'; // 06 6.3
export const MUSICIAN_PLAY_S = 90;
export const MUSICIAN_FAR = 20; // a gate further than this: the busker appears 6 tiles from the tile
export const MUSICIAN_NEAR = 6;
export const MUSICIAN_RAIN = 0.6;
export const MUSICIAN_SHELTER_R = 6;
export const MUSICIAN_BUSKER_R = 8;
export const SUNBEAM_T = 60 * SEC;
export const SUNBEAM_R = 3;
export const SUNBEAM_SNOW = 0.3; // "under snow" (02 9.2 gives no number): snow above this, the figure m_peel calls slippery

/* ---------- small helpers ---------- */

function open(x: number, y: number): boolean {
  rebuildBlock();
  return inB(x, y) && BLOCK[I(x, y)] === 0;
}

/** An open tile on the Chebyshev ring `d0` .. `d0 + 3` round (cx, cy): the eight compass directions, nearest ring first. Null when none. */
function openRing(cx: number, cy: number, d0: number): { x: number; y: number } | null {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;
  for (let d = d0; d <= d0 + 3; d++)
    for (const [dx, dy] of dirs) {
      const x = Math.round(cx + dx * d), y = Math.round(cy + dy * d);
      if (open(x, y)) return { x, y };
    }
  return null;
}

function fx(x: number, y: number, kind: string, n: number, ids: number[] = [], romance = 0): void {
  emit({ kind: 'fx', tick: nowTick(), x, y, ids, params: { fx: kind, n, ...(romance ? { romance, tone: 0 } : {}) } });
}

/* ---------- c_petals ---------- */

let petalsAny = false;
/** A restore or a cast: some tile may carry petals, so the fade pass looks (it clears the flag when it finds none). */
export function petalsDirty(): void {
  petalsAny = true;
}

/** Every petal fades 1/40 per sim second (06 1.8); one pass over the layer, only while any is left. */
export function stepPetals(dt: number): void {
  if (!petalsAny) return;
  let any = false;
  const f = PETALS_FADE * dt;
  for (let i = 0; i < NC; i++) {
    const v = PETALS[i] as number;
    if (v <= 0) continue;
    const n = v - f;
    PETALS[i] = n > 0 ? n : 0;
    if (n > 0) any = true;
  }
  petalsAny = any;
}

function petalTiles(e: Effect): number[] {
  const out: number[] = [];
  for (let y = Math.max(0, e.y - e.r); y <= Math.min(N - 1, e.y + e.r); y++)
    for (let x = Math.max(0, e.x - e.r); x <= Math.min(N - 1, e.x + e.r); x++) out.push(I(x, y));
  return out;
}

function setPetals(e: Effect, v: number): void {
  for (const i of petalTiles(e)) PETALS[i] = v;
}

const PETALS_H: Handler = {
  check: (r) => {
    const i = I(r.x, r.y);
    return KIND[i] === Kind.pond || KIND[i] === Kind.canal || (WATER[i] as number) > 0 ? fail('reason.on_water') : OK;
  },
  start: (e) => {
    e.until = e.startTick + PETALS_T;
    setPetals(e, 1);
    petalsDirty();
    fx(e.x, e.y, 'petal', 24);
  },
  step: (e, now) => {
    const t = now - e.startTick;
    if (t >= PETALS_T) return true;
    if (t <= PETALS_HOLD_T) setPetals(e, 1);
    else setPetals(e, 1 - ((1 - PETALS_END) * (t - PETALS_HOLD_T)) / (PETALS_T - PETALS_HOLD_T));
    return false;
  },
  end: (e) => {
    for (const i of petalTiles(e)) PETALS[i] = Math.min(PETALS[i] as number, PETALS_END); // the charm stops; the fade takes the rest
    petalsDirty();
  },
};

/* ---------- c_bouquet ---------- */

const BOUQUET_H: Handler = {
  check: (r) => {
    const p = r.pair;
    const a = p ? byId(p.a) : undefined, b = p ? byId(p.b) : undefined;
    if (!p || !a || !b) return fail('reason.not_courting');
    if (REACTION_STATES[a.st] || REACTION_STATES[b.st] || a.st === 'laugh' || b.st === 'laugh') return fail('reason.busy');
    if (Math.hypot(a.x - b.x, a.y - b.y) > R_TOGETHER) return fail('reason.apart');
    return OK;
  },
  start: (e, r) => {
    const p = r.pair as NonNullable<typeof r.pair>;
    const tapped = r.visitor && (r.visitor.id === p.a || r.visitor.id === p.b) ? r.visitor : null;
    const member = tapped ?? (byId(p.a) as NonNullable<ReturnType<typeof byId>>);
    e.pairId = p.id;
    e.targetId = member.id;
    e.until = e.startTick + BOUQUET_MAX_T;
    const at = openRing(r.x, r.y, BOUQUET_GAP) ?? { x: Math.round(member.x), y: Math.round(member.y) };
    const v = spawnVisitor('cameo', nearestGate(at.x, at.y).id, { at, name: CAMEO_NAME, sex: 'f', ageWord: 'grown' });
    if (!v) return; // cameos are never refused (03 3.11): a null would be a bug, and the effect ends at its first step
    e.actorId = v.id;
    startWalk(v, 'wander', { kind: 'bouquet' }, member.x, member.y);
  },
  step: (e, now) => {
    const cam = byId(e.actorId), who = byId(e.targetId);
    if (!cam || !who || now >= e.until) return true; // the cameo or the member is gone, or she never caught up
    const t = now - e.startTick;
    const near = Math.hypot(cam.x - who.x, cam.y - who.y);
    if (e.phase === 0) {
      if (t % 30 === 0 && near > 1.1) goTo(cam, who.x, who.y); // the member may have moved
      if (t < BOUQUET_HAND_T || near > 1.6) return false;
      e.phase = 1;
      e.data.handed = now;
      const p = pairById(e.pairId);
      if (p) p.affinity = clamp01(p.affinity + BOUQUET_AFF);
      emit({ kind: 'bouquet', tick: now, x: who.x, y: who.y, ids: [cam.id, who.id] });
      fx(who.x, who.y, 'heart', 2, [cam.id, who.id], 1);
      return false;
    }
    if (e.phase === 1) {
      if (now - (e.data.handed ?? now) < BOUQUET_STAY_T) return false;
      e.phase = 2;
      e.data.left = now;
      const d = near || 1;
      goTo(cam, cam.x + ((cam.x - who.x) / d) * BOUQUET_AWAY, cam.y + ((cam.y - who.y) / d) * BOUQUET_AWAY); // 3 tiles away from them
      return false;
    }
    return !cam.path || now - (e.data.left ?? now) >= 2 * SEC;
  },
  end: (e) => {
    const cam = byId(e.actorId);
    if (cam && cam.archetype === 'cameo') removeVisitor(cam.id); // it vanishes
  },
};

/* ---------- c_musician ---------- */

const MUSICIAN_H: Handler = {
  check: (r) => {
    rebuildBlock();
    if (BLOCK[I(r.x, r.y)] === 1) return fail('reason.not_here');
    if (people() >= CAP_PEOPLE) return fail('reason.park_full');
    if (visitors.some((v) => v.archetype === 'busker' && v.st === 'play' && Math.hypot(v.x - r.x, v.y - r.y) <= MUSICIAN_BUSKER_R)) return fail('reason.busker_near');
    return OK;
  },
  start: (e, r) => {
    let dest = { x: r.x, y: r.y };
    if (weatherAt(r.x, r.y).rain > MUSICIAN_RAIN) {
      const i = nearestTile(facilities().shelter, r.x, r.y, MUSICIAN_SHELTER_R);
      if (i >= 0) dest = tileXY(i); // rain above 0.6: from the nearest shelter within 6
    }
    const g = nearestGate(r.x, r.y);
    const far = Math.max(Math.abs(g.tiles[0].x - r.x), Math.abs(g.tiles[0].y - r.y)) > MUSICIAN_FAR;
    const at = far ? openRing(r.x, r.y, MUSICIAN_NEAR) : null;
    const v = spawnVisitor('busker', g.id, { spawnedForPlayer: true, leaveAt: T.abs + (MUSICIAN_PLAY_S + 120) / DAYLEN, ...(at ? { at } : {}) });
    e.x = dest.x;
    e.y = dest.y;
    e.until = e.startTick + (MUSICIAN_PLAY_S + 150) * SEC; // the walk, the 90 s, the way out
    if (!v) return;
    e.actorId = v.id;
    startWalk(v, 'wander', { kind: 'busk' }, dest.x, dest.y);
  },
  step: (e, now) => {
    const v = byId(e.actorId);
    if (!v || now >= e.until) return true;
    if (v.st === 'play') e.phase = 1;
    return e.phase === 1 && v.st !== 'play';
  },
};

/* ---------- c_sunbeam ---------- */

const SUNBEAM_H: Handler = {
  check: () => (overrides().length >= CAP_OVERRIDES ? fail('reason.too_many_effects') : OK),
  start: (e) => {
    e.r = SUNBEAM_R;
    e.until = e.startTick + SUNBEAM_T;
    e.overrideId = addOverride({ kind: 'sunbeam', x: e.x, y: e.y, r: SUNBEAM_R, until: e.until - 1, targets: OVERRIDE_TARGETS.sunbeam });
    fx(e.x, e.y, 'spark', 12);
  },
  step: (e, now) => {
    if (now >= e.until) return true;
    if (W.snow > SUNBEAM_SNOW) {
      const fall = WET_FALL / SEC; // stepWet has taken one fall off these tiles this step (no rain inside the sunbeam): this is the second
      for (let y = e.y - e.r; y <= e.y + e.r; y++)
        for (let x = e.x - e.r; x <= e.x + e.r; x++) {
          if (!inB(x, y)) continue;
          const v = WET[I(x, y)] as number;
          if (v > 0) WET[I(x, y)] = v > fall ? v - fall : 0;
        }
    }
    return false;
  },
  end: (e) => {
    if (e.overrideId) removeOverride(e.overrideId);
  },
};

export const CUPID_HANDLERS = {
  c_petals: PETALS_H,
  c_bouquet: BOUQUET_H,
  c_musician: MUSICIAN_H,
  c_sunbeam: SUNBEAM_H,
} as const satisfies Partial<Record<string, Handler>>;
