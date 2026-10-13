// src/play/undo.ts
// Inverse records per park command, grouped by stroke, 10 deep; the `undo` command that applies them (02 8.5, 03 5.6).
// Ported from GV 11086-11116 (undoStack, beginStroke, undoStroke, showUndo). Verdict: ADAPT.
// Changes: an entry holds the inverse records of its commands (the previous KIND, WEAR, WATER, OCC and BEDC of every touched tile and the
// props added, removed or changed) instead of whole typed-array snapshots (GV 11087-11090, about 135 KB each), and the records hold values,
// never references (notes 20 11.4); a stroke is the brush commands sharing a stroke id (GV began an entry on each pointerdown, 11091); the
// undo is a logged command (03 5.6 item 4) and "Undone" is toasted by the shell from the `applied` event (no toast here, 03 5.4); a removed
// prop comes back under its old id (ids.ts reserve), a placed one hands its id back (ids.ts unallocPropId); the stack is never saved, so a
// load (store.ts restore) empties it (register 3.11; owner 2026-10-13), and a new park clears it (03 5.6 item 5).
// Dropped from the range: 11087-11090 (snapshotWorld), 11099-11111 (u.fallen: collapsed builds), 11112-11113 (initWater, setMaterials,
// rebuildSurface, the gnomes' ground heights), 11114's toast and 11116's DOM (the rail reads canUndo and depth).
// Three fields beyond 03 5.6 item 2: `recycled` (which added ids came from the free queue, so the undo hands each back where it came from),
// `propsChanged` (copies of props a command changed in place: a bench turned, a kiosk's table list) and `treeTurn` (the tree cycle of
// tools.ts before a planting, so an undone tree hands its species back; 02 8.3).
// A replay that starts from a snapshot reproduces only the undos of entries recorded after that snapshot: the restore empties the stack, so
// an undo of an earlier entry is `reason.nothing_to_undo` there (03 5.5 item 2, 5.6 item 4, 08 3.2 run 5; owner 2026-10-13).
import type { PropId } from '../core/ids.ts';
import { reclaimPropId, releasePropId, unallocPropId } from '../core/ids.ts';
import { OK, fail, onResetCommands, onRestoreCommands, registerHandler } from '../core/commands.ts';
import { BEDC, BLOCK, KIND, OCC, WATER, WEAR, markBlockDirty, propById, putProp, rebuildBlock, removeProp, type Prop } from '../world/grid.ts';
import { syncIce } from '../world/water.ts';
import { markCharmDirty } from '../world/charm.ts';
import { vendorLeave, vendorReturn, type VendorRecord } from '../entities/staff.ts';
import { moveOffBlocked, standUpFrom } from '../entities/visitor.ts';

/** Undo depth (register 3.7, 06 1.4 UNDO_DEPTH; GV 11091). */
export const UNDO_DEPTH = 10;

/** One touched tile as it was before the command. */
export type TileBefore = { i: number; KIND: number; WEAR: number; WATER: number; OCC: number; BEDC: number };

/** What one applied tool command changed, as values (03 5.6 item 2). */
export type Inverse = {
  tiles: TileBefore[];
  propsAdded: PropId[]; // in the order they were added
  recycled: PropId[]; // the ids of propsAdded that nextPropId took from the free queue
  propsRemoved: Prop[]; // copies, in the order they were removed; their ids are reserved (ids.ts) while the entry is on the stack
  propsChanged: Prop[]; // copies as they were before the command
  vendorRemoved: VendorRecord | null; // a removed kiosk's vendor (S4)
  treeTurn: number | null; // the tree cycle before the command when it planted a tree (tools.ts), else null
  strokeId: number; // the brush stroke, 0 for every other tool
};

type Entry = { strokeId: number; invs: Inverse[] };

let stack: Entry[] = [];
const revertHooks: Array<(inv: Inverse) => void> = [];

/** An empty inverse for a command of stroke `strokeId` (0: not a brush stroke). */
export function newInverse(strokeId: number): Inverse {
  return { tiles: [], propsAdded: [], recycled: [], propsRemoved: [], propsChanged: [], vendorRemoved: null, treeTurn: null, strokeId };
}

/** A module that keeps its own sim state in an inverse puts it back here (tools.ts: the tree cycle); this file never imports tools.ts. */
export function onRevert(fn: (inv: Inverse) => void): void {
  revertHooks.push(fn);
}

/** Note tile `i` as it is now, once per inverse: the first value is the one before the command. */
export function keepTile(inv: Inverse, i: number): void {
  if (inv.tiles.some((t) => t.i === i)) return;
  inv.tiles.push({ i, KIND: KIND[i] as number, WEAR: WEAR[i] as number, WATER: WATER[i] as number, OCC: OCC[i] as number, BEDC: BEDC[i] as number });
}

/** The entry is gone from the stack for good: the ids its removals reserved join the free queue (03 5.6 item 3). */
function release(e: Entry): void {
  for (const inv of e.invs) for (const p of inv.propsRemoved) releasePropId(p.id);
}

/**
 * Push the inverse of an applied command (03 5.6 item 2). A brush command whose stroke id equals the top entry's joins it, so one pointer
 * stroke is one entry (GV beginStroke 11091); every other command is its own entry. The eleventh entry pushes the oldest off the bottom.
 */
export function record(inv: Inverse, strokeId: number): void {
  const top = stack[stack.length - 1];
  if (strokeId !== 0 && top && top.strokeId === strokeId) {
    top.invs.push(inv);
    return;
  }
  stack.push({ strokeId, invs: [inv] });
  while (stack.length > UNDO_DEPTH) release(stack.shift() as Entry);
}

export function canUndo(): boolean {
  return stack.length > 0;
}

export function depth(): number {
  return stack.length;
}

/** Take the top entry off the stack: its inverses in the order they were recorded, or null when the stack is empty. */
export function undoTop(): Inverse[] | null {
  const e = stack.pop();
  return e ? e.invs : null;
}

/**
 * Empty the stack (a new park, 03 5.6 item 5; `avatar.enter` in S7). With `releaseIds` (the default) the ids its entries reserved join the
 * free queue; a caller whose ids state was just replaced (a restore, S3 part B) passes false.
 */
export function clearUndo(releaseIds = true): void {
  if (releaseIds) for (const e of stack) release(e);
  stack = [];
}

/**
 * After a tool or an undo changed the world: BLOCK, the water bodies and the render caches (markBlockDirty bumps the world version they
 * key on) and the charm field follow; the ice layer too when `kinds` says a tile's KIND or WATER changed (water.ts syncIce); and whoever
 * stands on a tile that became blocked moves off it (GV openNear 1559).
 */
export function settle(touched: readonly number[], kinds: boolean): void {
  markBlockDirty();
  rebuildBlock();
  markCharmDirty();
  if (kinds) syncIce();
  const blocked = touched.filter((i) => BLOCK[i] === 1);
  if (blocked.length > 0) moveOffBlocked(blocked);
}

/** Apply one inverse (03 5.6 item 3): take the added props away, put the removed ones back under their ids, undo the changes, then the tiles. */
function revert(inv: Inverse, touched: number[]): boolean {
  let kinds = false;
  for (let k = inv.propsAdded.length - 1; k >= 0; k--) {
    const id = inv.propsAdded[k] as PropId;
    const p = propById(id);
    if (!p) continue;
    standUpFrom(id);
    if (p.kind === 'kiosk') vendorLeave(id);
    removeProp(id, 'keep');
    unallocPropId(id, inv.recycled.includes(id));
  }
  for (let k = inv.propsRemoved.length - 1; k >= 0; k--) {
    const p = inv.propsRemoved[k] as Prop;
    if (!reclaimPropId(p.id) || !putProp(p)) continue; // the reservation guarantees both (ids.ts); a broken one skips the prop
    if (p.kind === 'kiosk') vendorReturn(p.id, inv.vendorRemoved);
  }
  for (const c of inv.propsChanged) {
    const p = propById(c.id);
    if (p) Object.assign(p, JSON.parse(JSON.stringify(c)) as Prop);
  }
  for (let k = inv.tiles.length - 1; k >= 0; k--) {
    const t = inv.tiles[k] as TileBefore;
    if (KIND[t.i] !== t.KIND || WATER[t.i] !== t.WATER) kinds = true;
    KIND[t.i] = t.KIND;
    WEAR[t.i] = t.WEAR;
    WATER[t.i] = t.WATER;
    OCC[t.i] = t.OCC;
    BEDC[t.i] = t.BEDC;
    touched.push(t.i);
  }
  for (const fn of revertHooks) fn(inv);
  return kinds;
}

/* The `undo` command (03 5.6 items 3 and 4): side and mode were checked by commands.ts (03 5.3). */
registerHandler('undo', () => {
  const invs = undoTop();
  if (!invs) return fail('reason.nothing_to_undo');
  const touched: number[] = [];
  let kinds = false;
  for (let k = invs.length - 1; k >= 0; k--) if (revert(invs[k] as Inverse, touched)) kinds = true;
  settle(touched, kinds);
  return OK;
});

onResetCommands(() => clearUndo());

/*
 * A restore loads another world, so the entries recorded against the old one go: one of them could remove a prop it never placed, because
 * the restored world may have handed the same PropId to another prop. The snapshot brought its own ids state, so the ids it holds reserved
 * stay reserved (false): the round trip keeps the state hash (08 2.6 row 1, 08 3.2 run 6). Those ids no longer belong to any entry and are
 * never released, so a restored park hands out other PropIds than the live one would: a known limitation the owner kept on 2026-10-13
 * (03 section 17; tests/save.test.ts pins it with it.fails).
 */
onRestoreCommands(() => clearUndo(false));
