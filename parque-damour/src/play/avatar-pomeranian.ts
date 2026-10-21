// src/play/avatar-pomeranian.ts
// a_pomeranian (Mischief T1), 02 10.5: the actor (Pompon), and the tap cascade steps 3a to 5 with their refusals. Split out of avatar.ts
// (AGENTS rule 9; 03 2.6 row avatar-pomeranian.ts). NEW. Pompon is the Creature `thePomeranian()` with `driven` set (entities/pomeranian.ts runs
// his states): this file checks everything first and mutates last, like avatar-pigeon.ts (a refusal is not logged, so it must change nothing).
// He enters through the gate he waits outside (the nearest gate to him) and walks onto its first tile; one the AI is walking home is taken
// where he stands. 3a an adult, not staff, carrying an item
// (`reason.no_item` when none; `reason.big_dog` with a walker's dog within 3 tiles of him or of the person; `reason.enough_today` at 3 a day):
// `snatch` as m_pomeranian (the same run, snatch through embarrass.land, carry to the nearest gate with the victim chasing 8 s, drop; he stays,
// `shakeOff` 1 s), the 60 s cooldown of m_pomeranian (`panting` while it runs), the same points; 3b a pigeon, or crumbs with pigeons at
// them: `chase` (the pigeons within 3 scatter as he comes); 3c a child: `play`, circles round it 8 s, the child chasing; 4 a water tile:
// `goPaddle`, `paddle` 4 s at its edge, `shakeOff`; a lawn tile: `goDig`, `dig` 3 s; 5 any tile: `walk` there at 4.5.
import { DAYLEN, T } from '../core/clock.ts';
import type { ReasonKey } from '../core/commands.ts';
import type { XY } from '../core/math.ts';
import { I, KIND, Kind, OCC } from '../world/grid.ts';
import { nearestGate } from '../world/park.ts';
import { BUSY } from '../entities/brain.ts';
import { release } from '../entities/act.ts';
import { creatures, thePomeranian, type Creature } from '../entities/creatures.ts';
import { canTarget, firstItem } from '../entities/embarrass.ts';
import { DOG_SAW_IT_R } from './abilities-mischief.ts';
import { PLAY_T, POM_RUN_MAX } from '../entities/pomeranian.ts';
import { cooldownLeft, startCooldown } from './abilities.ts';
import { openTileNear, waterEdge, isWaterTile, type Picked, type StatusKey } from './avatar-pick.ts';

/** The states of an errand of m_pomeranian (pomeranian.ts): while one runs he is busy; any other state in the park is the AI walking him home. */
const ERRAND: ReadonlySet<string> = new Set(['run', 'snatch', 'carry', 'home']);

/**
 * Pompon, brought in. Outside (waiting at a gate, whatever is left of his wait) he walks onto the first tile of the gate nearest him; in the
 * park, because the player let go a moment ago and the AI is taking him home, he is taken over where he stands and waits for the next tap.
 * Only an errand of m_pomeranian (`run`, `snatch`, `carry`, `home`) is `reason.busy` (03 5.3), so that he can be taken again at once, like the
 * pigeon and the florist.
 */
export function pomEnter(): number | ReasonKey {
  const c = thePomeranian();
  if (!c.outside && (c.driven || ERRAND.has(c.st))) return 'reason.busy';
  if (c.outside) {
    const g = nearestGate(c.x, c.y);
    c.outside = false;
    c.st = 'walk';
    c.dest = { x: g.tiles[0].x, y: g.tiles[0].y };
  } else {
    c.st = 'wait';
    delete c.dest;
  }
  c.driven = true;
  c.tx = c.x;
  c.ty = c.y;
  c.t = 0;
  c.z = 0;
  c.carry = null;
  c.targetId = 0;
  c.cdUntil = 0; // the 60 s wait outside is the ability's; the avatar's own wait is the cooldown
  return c.id;
}

/** The previous intent dropped: no destination, no target, no timer, the route restarts from where he stands. */
function clearIntent(c: Creature): void {
  delete c.dest;
  c.targetId = 0;
  c.t = 0;
  c.tx = c.x;
  c.ty = c.y;
}

function go(c: Creature, st: string, to: XY): void {
  clearIntent(c);
  c.st = st;
  c.dest = { x: to.x, y: to.y };
}

/** The tap, after the hold check (avatar.ts): see the file header. `at` is the tick of the command. */
export function pomTap(c: Creature, tile: XY, p: Picked, at: number): StatusKey {
  const v = p.visitor;
  if (v && v.archetype !== 'gardener' && v.archetype !== 'vendor' && v.archetype !== 'child') {
    if (!firstItem(v)) return 'reason.no_item';
    if (creatures.some((o) => o.kind === 'dog' && !o.outside && (Math.hypot(o.x - v.x, o.y - v.y) <= DOG_SAW_IT_R || Math.hypot(o.x - c.x, o.y - c.y) <= DOG_SAW_IT_R)))
      return 'reason.big_dog';
    const t = canTarget(v);
    if (!t.ok) return t.reason;
    if (cooldownLeft('mischief', 'm_pomeranian', at) > 0) return 'avatar.status.panting';
    clearIntent(c);
    c.st = 'snatch';
    c.targetId = v.id;
    c.carry = null;
    c.cdUntil = T.abs + POM_RUN_MAX / DAYLEN; // the run's deadline, as sendPomeranian sets it
    startCooldown('mischief', 'm_pomeranian', at);
    return 'avatar.status.snatching';
  }
  if (v?.archetype === 'child') {
    clearIntent(c);
    c.st = 'play';
    c.targetId = v.id;
    c.t = PLAY_T;
    if (!BUSY[v.st]) {
      release(v);
      v.st = 'play'; // the child chases him (act.ts playStep, 02 4.3 family item 2)
      v.job = { creatureId: c.id };
      v.t = PLAY_T;
      v.path = null;
    }
    return 'avatar.status.playing';
  }
  const pg = p.creature?.kind === 'pigeon' ? p.creature : undefined;
  const crumbs = p.prop?.kind === 'crumbs' && creatures.some((o) => o.kind === 'pigeon' && o.targetId === p.prop?.id) ? p.prop : undefined;
  if (pg || crumbs) {
    go(c, 'chase', { x: (pg ?? (crumbs as NonNullable<typeof crumbs>)).x, y: (pg ?? (crumbs as NonNullable<typeof crumbs>)).y });
    if (pg) c.targetId = pg.id;
    return 'avatar.status.chasing';
  }
  if (isWaterTile(tile.x, tile.y)) {
    const edge = waterEdge(tile.x, tile.y);
    if (edge) {
      go(c, 'goPaddle', edge);
      return 'avatar.status.paddling';
    }
  }
  const i = I(tile.x, tile.y);
  if (KIND[i] === Kind.lawn && OCC[i] === 0 && openTileNear(tile.x, tile.y, 0)) {
    go(c, 'goDig', tile);
    return 'avatar.status.digging';
  }
  go(c, 'walk', openTileNear(tile.x, tile.y) ?? tile);
  return 'avatar.status.walking';
}
