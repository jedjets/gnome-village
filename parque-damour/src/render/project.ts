// src/render/project.ts
// World to screen, screen to tile, and the hit test with the priority people > creatures > props > tile (03 7.1 items 2 and 6, 8.2).
// Ported from GV 6382-6384 (sxOf, syOf, screenOf; sxOf and syOf live in camera.ts with the rest of the projection and are re-exported
// here) and 11231-11250 (tapSelect: 34 px people, 30 px creatures, the 4 px bias, the head offsets).
// Verdict: PORT. Changes: no SEAS term (flat ground); screenToTile is the closed-form inverse of 03 7.1 item 6 (GV walked the painter
// order nearest-first with ptInQuad, 6423-6442), rounding to the nearest tile centre because tile (x, y) spans x +- 0.5 (GV 6419);
// pickAt ranks people, then creatures, then props, then the tile (03 8.2; GV let an animal win when nearer than the biased gnome), takes
// the people and creature lists as arguments (render/people.ts pickPeople and pickCreatures from S4 on: every visitor, every creature in
// the park), adds props (OCC, then a passable prop, then the 0.75-tile box of GV 5658 around a multi-tile footprint) and the tile, and
// answers none off the canvas. S4 part C, the people branch: a person is picked where it is drawn, at its seat's height `e` when it sits
// (GV's gnomes never sat raised; a crew's drawn _sx/_sy at 11234 is the same idea), its head point 8z above that.
// Dropped from the range: projectVerts and ptInQuad (6417-6443, 09 section 3), the drawn crew positions _sx/_sy, the hutch and rider
// skips, the flyer box and the select and follow side effects of tapSelect (11234-11250; card.ts selects, camera.ts follows).
import type { XY } from '../core/math.ts';
import { I, N, OCC, inB, props } from '../world/grid.ts';
import { APRON } from '../world/park.ts';
import { cam, view, rotInto, screenToWorld, sxOf, syOf } from './camera.ts';

export { sxOf, syOf };

/** World point (x, y) at height e (EH units) to screen (GV 6384). Allocates its result; screenInto does not. */
export function screenOf(x: number, y: number, e = 0): XY {
  return screenInto(x, y, e, { x: 0, y: 0 });
}
/** screenOf written into `out` (for per-frame loops). */
export function screenInto(x: number, y: number, e: number, out: XY): XY {
  rotInto(x, y, out);
  const rx = out.x, ry = out.y;
  out.x = sxOf(rx, ry);
  out.y = syOf(rx, ry, e);
  return out;
}

const W0: XY = { x: 0, y: 0 };

/**
 * The tile under a screen point (03 7.1 item 6): the closed-form inverse, invRot, then the nearest tile centre. Null outside the park,
 * or, with allowApron (gate outside tiles, avatar flight), outside the park plus the 8-tile apron.
 */
export function screenToTile(sx: number, sy: number, allowApron = false): XY | null {
  const w = screenToWorld(sx, sy, W0);
  const x = Math.floor(w.x + 0.5), y = Math.floor(w.y + 0.5);
  if (inB(x, y)) return { x, y };
  if (allowApron && x >= -APRON && y >= -APRON && x < N + APRON && y < N + APRON) return { x, y };
  return null;
}

export type Hit = { kind: 'visitor' | 'creature' | 'prop' | 'tile' | 'none'; id: number; tile: XY | null };

/** What pickAt needs of a person: the Visitor record's id and ground point, and `e`, the seat's height in EH units a sitter is drawn at. */
export type PickPerson = { readonly id: number; readonly x: number; readonly y: number; readonly e?: number };
/** What pickAt needs of a creature (the S4 Creature record has these fields); z is a pigeon's flight height in EH units. */
export type PickCreature = {
  readonly id: number;
  readonly kind: 'pigeon' | 'dog' | 'pomeranian';
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

/** The hit radii, the person bias and head offset in px at zoom 1, and the prop box in tiles (GV 11234-11240, 5658; 03 8.2). */
export const PICK_PERSON_PX = 34;
export const PICK_PERSON_BIAS = 4;
export const PICK_HEAD = 8;
export const PICK_CREATURE_PX = 30;
export const PICK_CREATURE_HEAD = { pigeon: 3, dog: 6, pomeranian: 5 } as const;
export const PICK_PROP_BOX = 0.75;

const NO_PEOPLE: readonly PickPerson[] = [];
const NO_CREATURES: readonly PickCreature[] = [];
const P0: XY = { x: 0, y: 0 };

/**
 * What a tap at (sx, sy) touches (03 8.2), first match wins:
 * 1 the nearest person whose head point screenOf(x, y, e).y - 8z is within 34 px after the 4 px bias (e the seat's height, 0 standing);
 * 2 the nearest creature within 30 px of its head point (pigeon 3, dog 6, pomeranian 5 px x z; a pigeon is drawn at its flight z);
 * 3 the prop in OCC on the tapped tile, else a passable prop covering it (the smallest, then the lower id), else the nearest
 *   multi-tile prop with a footprint tile centre within 0.75 tile of the tap on both axes;
 * 4 the park tile; 5 none (off the canvas, or on the apron clear of any footprint box).
 * main.ts passes render/people.ts pickPeople() and pickCreatures(); with no lists only props and tiles are picked.
 */
export function pickAt(
  sx: number,
  sy: number,
  people: readonly PickPerson[] = NO_PEOPLE,
  creatures: readonly PickCreature[] = NO_CREATURES,
): Hit {
  if (!(sx >= 0 && sy >= 0 && sx < view.cw && sy < view.chh)) return { kind: 'none', id: 0, tile: null };
  const z = cam.z;
  const tile = screenToTile(sx, sy);
  let found = false, best = 0, bd = Infinity;
  for (const v of people) {
    screenInto(v.x, v.y, v.e ?? 0, P0);
    const d = Math.hypot(P0.x - sx, P0.y - PICK_HEAD * z - sy) - PICK_PERSON_BIAS;
    if (d < bd && d < PICK_PERSON_PX) {
      bd = d;
      best = v.id;
      found = true;
    }
  }
  if (found) return { kind: 'visitor', id: best, tile };
  for (const c of creatures) {
    screenInto(c.x, c.y, c.kind === 'pigeon' ? c.z : 0, P0);
    const d = Math.hypot(P0.x - sx, P0.y - PICK_CREATURE_HEAD[c.kind] * z - sy);
    if (d < bd && d < PICK_CREATURE_PX) {
      bd = d;
      best = c.id;
      found = true;
    }
  }
  if (found) return { kind: 'creature', id: best, tile };
  const prop = propAt(sx, sy, tile);
  if (prop) return { kind: 'prop', id: prop, tile };
  if (tile) return { kind: 'tile', id: 0, tile };
  return { kind: 'none', id: 0, tile: null };
}

/** The prop id a tap touches, or 0 (03 8.2 item 3). */
function propAt(sx: number, sy: number, tile: XY | null): number {
  if (tile) {
    const occ = OCC[I(tile.x, tile.y)] ?? 0;
    if (occ) return occ;
    let id = 0, area = Infinity;
    for (const p of props) {
      if (!p.passable || tile.x < p.x || tile.y < p.y || tile.x >= p.x + p.w || tile.y >= p.y + p.h) continue;
      const a = p.w * p.h;
      if (a < area || (a === area && p.id < id)) {
        area = a;
        id = p.id;
      }
    }
    if (id) return id;
  }
  // a tap just beside a big footprint still takes it: the 0.75-tile box around each footprint tile centre (GV 5658)
  const w = screenToWorld(sx, sy, W0);
  let id = 0, bd = Infinity;
  for (const p of props) {
    if (p.w * p.h < 2) continue;
    const dx = Math.abs(w.x - Math.min(Math.max(w.x, p.x), p.x + p.w - 1));
    const dy = Math.abs(w.y - Math.min(Math.max(w.y, p.y), p.y + p.h - 1));
    if (dx >= PICK_PROP_BOX || dy >= PICK_PROP_BOX) continue;
    const d = Math.max(dx, dy);
    if (d < bd || (d === bd && p.id < id)) {
      bd = d;
      id = p.id;
    }
  }
  return id;
}
