// src/play/avatar-florist.ts
// a_florist (Cupid T1), 02 10.7: the actor (Violette, a `cameo` visitor with `spawnedForPlayer`, a basket of 3), the tap cascade steps 3a to 5
// with their refusals, and what a bouquet given and petals scattered do (the hook entities/act-romance.ts calls). Split out of avatar.ts (AGENTS
// rule 9; 03 2.6 row avatar-florist.ts). NEW. She enters by g_south_w with leaveAt NEVER (the JSON-safe stand-in for +Infinity, visitor.ts),
// walks at 3.0 and has no needs that matter: the cascade checks everything first and mutates last (a refusal is not logged).
// 3a a person: a child is `reason.not_children`, an empty basket `reason.basket_empty`, a person who is not in a Pair `reason.not_courting`,
// a pair apart or in a reaction the refusals of c_bouquet's own check (`reason.apart`, `reason.busy`), the bouquet's 60 s cooldown (shared
// with c_bouquet) `reason.cooldown`; else `hand`: she walks to them (30 s at most) and gives the bouquet: basket -1, affinity +0.05, two
// hearts, the cooldown, and a Cupid action on the pair (`lastCupidAt`, 02 9.1 item 7) so the stage that follows scores. 3b a flowerbed
// tile: `goPick`, `pick` 4 s (basket 3). 3c a bench: sit, until the next tap. 4 a lawn tile: `goScatter`, `scatter` 2 s, which casts
// c_petals there (charm +2, 20 s, the 30 s cooldown, the Cupid mark: abilities.ts cast, at the moment she scatters). 5 any tile: walk.
import { clamp01 } from '../core/math.ts';
import type { XY } from '../core/math.ts';
import { emit } from '../core/events.ts';
import type { ReasonKey } from '../core/commands.ts';
import { I, KIND, Kind, OCC } from '../world/grid.ts';
import { goTo } from '../entities/move.ts';
import { release, startSeat } from '../entities/act.ts';
import { BASKET, HAND_MAX_T, setFloristHook } from '../entities/act-romance.ts';
import { midOf, pairById, pairOf } from '../entities/romance.ts';
import { NEVER, byId, nowTick, spawnVisitor, visitors, type Visitor } from '../entities/visitor.ts';
import { BOUQUET_AFF, CAMEO_NAME, CUPID_HANDLERS } from './abilities-cupid.ts';
import { cast, cooldownLeft, markCupid, startCooldown } from './abilities.ts';
import { openTileNear, type Picked, type StatusKey } from './avatar-pick.ts';

export const SIT_T = 600; // s: she sits until the next tap (a finite stand-in; leaving cuts it short)

/** Violette, found (a florist the player let go and who is still in the park) or new at the south-west gate; her basket is full when she is new. */
export function floristEnter(): number | ReasonKey {
  let v = visitors.find((o) => o.archetype === 'cameo' && o.spawnedForPlayer);
  if (v) clearIntent(v);
  else {
    v = spawnVisitor('cameo', 'g_south_w', { spawnedForPlayer: true, name: CAMEO_NAME, sex: 'f', ageWord: 'grown', leaveAt: NEVER }) ?? undefined;
    if (!v) return 'reason.busy'; // cameos are never refused (03 3.11): a null would be a bug
    v.basket = BASKET;
  }
  v.leaveAt = NEVER;
  return v.id;
}

/** The previous intent dropped (02 10.3 item 2): a seat given back, no job, no route, not leaving. */
function clearIntent(v: Visitor): void {
  release(v);
  v.job = {};
  v.path = null;
  v.gateOut = null;
  v.t = 0;
}

/** The tap, after the hold check (avatar.ts): see the file header. `at` is the tick of the command. */
export function floristTap(v: Visitor, tile: XY, p: Picked, at: number): StatusKey {
  const w = p.visitor;
  if (w) {
    if (w.archetype === 'child') return 'reason.not_children';
    if (v.basket <= 0) return 'reason.basket_empty';
    const pair = pairOf(w);
    if (!pair) return 'reason.not_courting';
    const m = midOf(pair);
    const ok = CUPID_HANDLERS.c_bouquet.check({ x: m.x, y: m.y, visitor: w, pair }, at); // a member in a reaction, or apart
    if (!ok.ok) return ok.reason;
    if (cooldownLeft('cupid', 'c_bouquet', at) > 0) return 'reason.cooldown';
    clearIntent(v);
    v.st = 'hand';
    v.job = { visitorId: w.id, pairId: pair.id };
    v.t = HAND_MAX_T;
    goTo(v, w.x, w.y);
    return 'avatar.status.bouquet';
  }
  const i = I(tile.x, tile.y);
  if (KIND[i] === Kind.bed) {
    clearIntent(v);
    v.st = 'goPick';
    v.job = { kind: 'pick' };
    goTo(v, tile.x, tile.y); // a bed is blocked: goTo takes her to the open tile beside it
    return 'avatar.status.picking';
  }
  const bench = p.prop?.kind === 'bench' ? p.prop : undefined;
  if (bench) {
    clearIntent(v);
    if (startSeat(v, bench, 'goSit', 'sit', SIT_T)) return 'avatar.status.resting';
  }
  if (KIND[i] === Kind.lawn && OCC[i] === 0) {
    if (cooldownLeft('cupid', 'c_petals', at) > 0) return 'reason.cooldown';
    clearIntent(v);
    v.st = 'goScatter';
    v.job = { kind: 'scatter', tile: { x: tile.x, y: tile.y } };
    goTo(v, tile.x, tile.y);
    return 'avatar.status.petals';
  }
  const to = openTileNear(tile.x, tile.y) ?? tile;
  clearIntent(v);
  v.st = 'wander';
  v.job = { kind: 'walk' };
  goTo(v, to.x, to.y);
  return 'avatar.status.walking';
}

/* ---------- what the florist's states do beyond the walk (entities/act-romance.ts floristStep calls this) ---------- */

function fx(x: number, y: number, kind: string, n: number, ids: number[]): void {
  emit({ kind: 'fx', tick: nowTick(), x, y, ids, params: { fx: kind, n, romance: 1, tone: 0 } });
}

setFloristHook((v, what) => {
  const at = nowTick();
  if (what === 'bouquet') {
    const w = byId(v.job.visitorId ?? 0), pair = pairById(v.job.pairId ?? 0);
    if (!w || !pair) return;
    v.basket = Math.max(0, v.basket - 1);
    pair.affinity = clamp01(pair.affinity + BOUQUET_AFF);
    startCooldown('cupid', 'c_bouquet', at);
    const m = midOf(pair);
    markCupid(m.x, m.y, pair.id);
    emit({ kind: 'bouquet', tick: at, x: w.x, y: w.y, ids: [v.id, w.id] });
    fx(w.x, w.y, 'heart', 2, [v.id, w.id]);
    return;
  }
  const t = v.job.tile ?? { x: Math.round(v.x), y: Math.round(v.y) };
  cast('cupid', 'c_petals', { kind: 'tile', x: t.x, y: t.y }, at); // refused (the cap of 64 effects, say): the scatter plays and nothing lands
});
