// src/play/avatar-pick.ts
// What a tap on the world means to the avatar cascades, shared by avatar-pigeon.ts, avatar-pomeranian.ts and avatar-florist.ts (split out of
// avatar.ts at the 600-line rule, AGENTS rule 9; 03 2.6 row avatar-pick.ts). The hit the UI resolved at tap time is re-validated here (03 5.2
// item 4): the id must still exist and the tapped tile be within the cascade radius, 1.2 tiles of a person or creature, the 0.75-tile box of a
// prop (GV playerTap 5658); otherwise the cascade falls through to its tile steps. Also the small tile searches the tile steps need, none of
// which draws: the nearest open tile, and the standing tile at the edge of a water tile.
// Ported from GV 5654-5662 (playerTap: the 0.75 `near` box and the nearest thing to the tap). ADAPT: one resolved hit instead of a scan of
// the trees, rocks and bushes; the people radius is the sim's 1.2 tiles for the UI's 34 px.
import type { Hit, ReasonKey } from '../core/commands.ts';
import type { XY } from '../core/math.ts';
import { BLOCK, I, WATER, inB, propById, rebuildBlock, type Prop } from '../world/grid.ts';
import { creatureById, type Creature } from '../entities/creatures.ts';
import { byId, type Visitor } from '../entities/visitor.ts';

/** A cascade's answer (06 12): an `avatar.status.<status>` key the shell toasts as "{name}: {what}", or a refusal `reason.<key>`. */
export type StatusKey = `avatar.status.${string}` | ReasonKey;
export const isRefusal = (s: StatusKey): s is ReasonKey => s.startsWith('reason.');

export const R_PERSON = 1.2; // tiles (03 5.2 item 4)
export const R_PROP = 0.75;

/** The one interactable a tap resolved to, as the sim re-validated it: at most one of the three. */
export type Picked = { visitor?: Visitor; creature?: Creature; prop?: Prop };

/** `hit` against the tapped `tile`; `selfVisitor` and `selfCreature` are the actor's own id in its list (0 if none), never a candidate. */
export function pickHit(hit: Hit | undefined, tile: XY, selfVisitor: number, selfCreature: number): Picked {
  if (!hit || typeof hit !== 'object' || typeof hit.id !== 'number') return {};
  switch (hit.kind) {
    case 'visitor': {
      const v = hit.id === selfVisitor ? undefined : byId(hit.id);
      return v && Math.hypot(v.x - tile.x, v.y - tile.y) <= R_PERSON ? { visitor: v } : {};
    }
    case 'creature': {
      const c = hit.id === selfCreature ? undefined : creatureById(hit.id);
      return c && !c.outside && Math.hypot(c.x - tile.x, c.y - tile.y) <= R_PERSON ? { creature: c } : {};
    }
    case 'prop': {
      const p = propById(hit.id);
      const inBox = !!p && tile.x >= p.x - R_PROP && tile.x <= p.x + p.w - 1 + R_PROP && tile.y >= p.y - R_PROP && tile.y <= p.y + p.h - 1 + R_PROP;
      return p && inBox ? { prop: p } : {};
    }
    default:
      return {};
  }
}

/** True for a tile of water (pond or canal: the WATER layer, 0 under a bridge, 02 2.2). */
export function isWaterTile(x: number, y: number): boolean {
  return inB(x, y) && (WATER[I(x, y)] as number) > 0;
}

function openAt(x: number, y: number): boolean {
  return inB(x, y) && BLOCK[I(x, y)] === 0;
}

/** The open tile nearest (x, y) within `r` (itself first), or null; scanned in a fixed order, so no draw. */
export function openTileNear(x: number, y: number, r = 3): XY | null {
  rebuildBlock();
  let best: XY | null = null, bd = Infinity;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx, ty = y + dy, d = dx * dx + dy * dy;
      if (d < bd && openAt(tx, ty)) {
        bd = d;
        best = { x: tx, y: ty };
      }
    }
  return best;
}

/** The open tile with water beside it (4 neighbours) nearest the water tile (x, y) within 4: where a bird or a dog stands to drink or paddle. */
export function waterEdge(x: number, y: number): XY | null {
  rebuildBlock();
  let best: XY | null = null, bd = Infinity;
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const tx = x + dx, ty = y + dy, d = dx * dx + dy * dy;
      if (d >= bd || !openAt(tx, ty)) continue;
      if (isWaterTile(tx + 1, ty) || isWaterTile(tx - 1, ty) || isWaterTile(tx, ty + 1) || isWaterTile(tx, ty - 1)) {
        bd = d;
        best = { x: tx, y: ty };
      }
    }
  return best;
}
