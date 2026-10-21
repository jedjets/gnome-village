// src/play/avatar-pigeon.ts
// a_pigeon (Mischief T0), 02 10.4: the actor, and the tap cascade steps 3a to 5 with their refusals. Split out of avatar.ts (AGENTS rule 9;
// 03 2.6 row avatar-pigeon.ts). NEW. The pigeon is a Creature with `driven` set (entities/creatures.ts): this file gives its orders by setting
// st, tx, ty and the target fields and creatures.ts runs them with the states it already has, so the cascade checks everything first and
// mutates last (a refusal is a rejected command, not logged, so it must leave nothing changed: 03 5.2 item 3, a replay skips it).
// 3a a person (adult, not staff): `swoop` (creatures.ts startSwoop; the `poop` lands on arrival through the hook abilities-mischief.ts
// registered, at a Picnic as a peck of the blanket, 2 s late in mist of 0.6), the 25 s cooldown of m_pigeon (`ruffled` while it runs), the same
// points as m_pigeon (embarrass.land scores the paired victim 1 MP); a child is `reason.not_children`, a person with 3 today
// `reason.enough_today`. 3b crumbs: `peck` 4 s (a walk or a flight to them). 3c lamp, bench, fountain, bandstand, tree: `perch`, until the
// next tap. 4 a water tile: `flyDrink` to the standing tile at its edge, `drink` 3 s. 5 any tile: fly there and land. A dog (or the pomeranian)
// within 2 tiles of a pigeon on the ground: `reason.startled` (creatures.ts also puts it in `startled` for 2 s when one comes near).
import { weatherAt } from '../core/weather.ts';
import type { XY } from '../core/math.ts';
import { R_STARTLE } from '../entities/creatures-threats.ts';
import { creatures, spawnPigeon, startSwoop, SWOOP_FOG_DELAY, type Creature } from '../entities/creatures.ts';
import { EMB_CAP_DAY } from '../entities/embarrass.ts';
import { cooldownLeft, startCooldown } from './abilities.ts';
import { MIST_PERCHED } from './abilities-mischief.ts';
import type { ReasonKey } from '../core/commands.ts';
import { isWaterTile, openTileNear, waterEdge, type Picked, type StatusKey } from './avatar-pick.ts';

export const R_DOG_STARTLES = R_STARTLE; // tiles (02 10.4 refusals): the same 2 that put the possessed pigeon into `startled` (creatures.ts)
const PERCHES: ReadonlySet<string> = new Set(['lamp', 'bench', 'fountain', 'bandstand', 'tree']);

/** The pigeon the player takes: the first on the list that is not mid-swoop (the lowest id), else any; a new one from the north edge when there is none. */
export function pigeonEnter(): number | ReasonKey {
  const pigeons = creatures.filter((c) => c.kind === 'pigeon');
  const c = pigeons.find((p) => p.st !== 'swoop') ?? pigeons[0] ?? spawnPigeon();
  if (!c) return 'reason.busy';
  c.driven = true;
  if (c.st === 'walk' || c.st === 'idle') {
    c.st = 'wait'; // it stops where it stands; a bird in the air lands first, one pecking or perched stays at it
    c.targetId = 0;
    c.tx = c.x;
    c.ty = c.y;
  }
  return c.id;
}

/** The previous intent dropped (02 10.3 item 2): no crumbs, no perch, no victim, no fog perch, no timer. */
function clearIntent(c: Creature): void {
  c.targetId = 0;
  c.perchPropId = 0;
  c.ownerId = 0;
  c.cdUntil = 0;
  c.t = 0;
}

function fly(c: Creature, st: 'fly' | 'flyDrink' | 'walk', to: XY): void {
  clearIntent(c);
  c.st = st;
  c.tx = to.x;
  c.ty = to.y;
}

/** The tap, after the hold check (avatar.ts): see the file header. `at` is the tick of the command. */
export function pigeonTap(c: Creature, tile: XY, p: Picked, at: number): StatusKey {
  if (c.z < 0.5 && creatures.some((o) => !o.outside && (o.kind === 'dog' || o.kind === 'pomeranian') && Math.hypot(o.x - c.x, o.y - c.y) <= R_DOG_STARTLES))
    return 'reason.startled';
  const v = p.visitor;
  if (v && v.archetype !== 'gardener' && v.archetype !== 'vendor') {
    if (v.archetype === 'child') return 'reason.not_children';
    if (v.embToday >= EMB_CAP_DAY) return 'reason.enough_today';
    if (cooldownLeft('mischief', 'm_pigeon', at) > 0) return 'avatar.status.ruffled';
    clearIntent(c);
    startSwoop(c, v.id, weatherAt(c.x, c.y).mist >= MIST_PERCHED ? SWOOP_FOG_DELAY : 0);
    startCooldown('mischief', 'm_pigeon', at);
    return 'avatar.status.swooping';
  }
  const prop = p.prop;
  if (prop?.kind === 'crumbs') {
    fly(c, c.z < 0.1 && Math.hypot(prop.x - c.x, prop.y - c.y) <= 3 ? 'walk' : 'fly', { x: prop.x, y: prop.y }); // nextPigeon's rule: walk when close
    c.targetId = prop.id; // land() pecks them when it arrives within 0.5 of them (creatures.ts targetCrumbs)
    return 'avatar.status.pecking';
  }
  if (prop && PERCHES.has(prop.kind)) {
    fly(c, 'fly', { x: prop.x + (prop.w - 1) / 2, y: prop.y + (prop.h - 1) / 2 });
    c.perchPropId = prop.id;
    return 'avatar.status.perching';
  }
  if (isWaterTile(tile.x, tile.y)) {
    const edge = waterEdge(tile.x, tile.y);
    if (edge) {
      fly(c, 'flyDrink', edge);
      return 'avatar.status.drinking';
    }
  }
  fly(c, 'fly', openTileNear(tile.x, tile.y) ?? tile);
  return 'avatar.status.flying';
}
