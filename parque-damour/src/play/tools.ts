// src/play/tools.ts
// The 16 park tools: the TOOLS table, ghost() (pure validation with the ranked reasons) and applyTool() (the commit with its undo inverse)
// (register 3.7; 02 8.2-8.4; 03 2.6, 5.1, 5.4, 5.6; 06 3).
// Ported from GV 11118-11126 (paintTile: the disc of radius brush - 1 and its guards), 5840-5989 (pbGhost: { ok, tiles, msg }), 5972-5975
// (the reasons ranked over every footprint tile, first match wins), 5991-5997 (pbTap: a run of tiles, cap 14), 6005-6017 (pbPlace: only
// an ok ghost commits).
// Verdict: ADAPT. Changes: the ghost returns a 03 5.4 reason key and no `mk` closure (the commit is applyTool, which runs the ghost again);
// the brush writes a tile kind (gravel, lawn, pond) per tile with no falloff (GV's smoothstep only weighted a height change); GV's
// border guard (11123) becomes the gate rule for path and lawn and the 1-46 rule for pond and canal (02 8.3, 09 2.5); the OCC guard
// (11126) is kept and also covers passable props; a run adds the straight segment from its last tile per tap instead of toggling
// flagstones; caps, margins and the repeat taps of 02 8.3.
// Dropped from the range: 11127-11155 (raise, lower, spring, rock, sapling and berry branches), 11158-11162 (setMaterials, markSea,
// checkFoundations), 5841-5954 (home, fence, step path, flagstone, hearth, steps, trap, log, rope and stone bridges, dam, wheel and lantern
// ghosts), 5959-5971 (garden, hive, well, fold, kennel, stable and cart rules), 5973-5975's sea, rock and slope reasons, 5978-5988 (the
// build constructors), 5998-6003 (pbPick, pbClear), 6006-6017's project staging, 6018-6035 (pbStop, pbStatus).
// The kiosk's vendor, the sitters of a removed bench, the someone-on-it test and openNear are calls into entities/staff.ts and
// entities/visitor.ts that S4 fills (no-ops now).
import type { XY } from '../core/math.ts';
import { propIdRecycles } from '../core/ids.ts';
import { OK, fail, registerHandler, type ReasonKey, type Result, type ToolPayload } from '../core/commands.ts';
import { BEDC, I, KIND, Kind, N, OCC, WATER, WEAR, addProp, inB, propById, props, removeProp, type Prop, type PropData, type PropKind } from '../world/grid.ts';
import { isBoundary, isGateTile } from '../world/park.ts';
import { findCrossing } from '../world/water.ts';
import { vendorArrive, vendorLeave } from '../entities/staff.ts';
import { someoneOn, standUpFrom } from '../entities/visitor.ts';
import { keepTile, newInverse, record, settle, type Inverse } from './undo.ts';

/* ---------- the table (register 3.7, 06 3.1) ---------- */

export const TOOL_IDS = [
  'hand', 'path', 'lawn', 'bed', 'hedge', 'tree', 'pond', 'canal', 'bridge', 'bench', 'picnic', 'lamp', 'fountain', 'kiosk', 'bandstand', 'remove',
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/** 02 8.2: brushes paint at once, 1 x 1 stamps place on the tap, big stamps and runs show a ghost and place on Place; `hand` places nothing. */
export type ToolClass = 'brush' | 'stamp1' | 'stampBig' | 'run' | 'none';
export type Footprint =
  | { kind: 'none' }
  | { kind: 'disc'; sizes: readonly number[] } // radius size - 1 round the tapped centre
  | { kind: 'rect'; w: number; h: number } // `at` is the north-west tile
  | { kind: 'span'; max: number } // 1 x span over water, found by the tool
  | { kind: 'run'; max: number }; // 1 x n tiles in straight segments

export type ToolDef = {
  id: ToolId;
  class: ToolClass;
  footprint: Footprint;
  labelKey: string; // tool.<id>.label
  hintKey: string; // tool.<id>.hint
  icon: string; // the inline 17 x 17 SVG of the rail (GV 11029-11037): part C fills the set after its options page
  col: string; // the swatch colour token (tokens.css)
};

export const CAP_PROPS_SOFT = 600; // 06 1.4, 03 3.11
export const CAP_KIOSKS = 3;
export const CAP_BANDSTANDS = 1;
export const CAP_RUN_TILES = 14; // GV pbTap 5994
export const BRUSH_SIZES: readonly number[] = [1, 2, 3];
const WATER_DEPTH = 0.6; // 06 1.1

const DISC: Footprint = { kind: 'disc', sizes: BRUSH_SIZES };
const RUN: Footprint = { kind: 'run', max: CAP_RUN_TILES };
const rect = (w: number, h: number): Footprint => ({ kind: 'rect', w, h });

function def(id: ToolId, cls: ToolClass, fp: Footprint): ToolDef {
  return { id, class: cls, footprint: fp, labelKey: `tool.${id}.label`, hintKey: `tool.${id}.hint`, icon: '', col: '--moss' };
}

/** The sixteen tools in the register's order (register 3.7; 06 3.1). */
export const TOOLS: readonly ToolDef[] = [
  def('hand', 'none', { kind: 'none' }),
  def('path', 'brush', DISC),
  def('lawn', 'brush', DISC),
  def('bed', 'stamp1', rect(1, 1)),
  def('hedge', 'run', RUN),
  def('tree', 'stamp1', rect(1, 1)),
  def('pond', 'brush', DISC),
  def('canal', 'run', RUN),
  def('bridge', 'stampBig', { kind: 'span', max: 4 }),
  def('bench', 'stamp1', rect(1, 1)),
  def('picnic', 'stampBig', rect(2, 2)),
  def('lamp', 'stamp1', rect(1, 1)),
  def('fountain', 'stampBig', rect(2, 2)),
  def('kiosk', 'stampBig', rect(2, 2)),
  def('bandstand', 'stampBig', rect(3, 3)),
  def('remove', 'stamp1', rect(1, 1)),
];
const BY_ID = new Map<string, ToolDef>(TOOLS.map((t) => [t.id, t]));

export function toolById(id: ToolId): ToolDef {
  const t = BY_ID.get(id);
  if (!t) throw new Error('unknown tool ' + id);
  return t;
}

/* ---------- the land checks (02 8.4; 06 3.2) ---------- */

/** The Valid tiles column of 02 8.3 for one land tool, with the checks that apply to it. */
type Rule = {
  kinds: readonly number[];
  inner?: boolean; // only 1 <= x, y <= 46 (pond, canal)
  margin?: boolean; // check 6: no footprint tile on the boundary row or column (fountain, kiosk, bandstand)
  bedOk?: boolean; // check 5 does not apply (lawn, bed)
  lawnOnly?: boolean; // check 7 reports reason.lawn_only (picnic)
};
const { lawn: LA, gravel: GR, flagstone: FL, bed: BE, mulch: MU } = Kind;
const RULES: Readonly<Partial<Record<ToolId, Rule>>> = {
  path: { kinds: [LA, MU, FL] },
  lawn: { kinds: [GR, FL, MU, BE], bedOk: true },
  bed: { kinds: [LA, MU], bedOk: true },
  hedge: { kinds: [LA, GR, FL, MU] },
  tree: { kinds: [LA, MU] },
  pond: { kinds: [LA, GR, FL, MU], inner: true },
  canal: { kinds: [LA, GR, FL, MU], inner: true },
  bench: { kinds: [LA, GR, FL, MU] },
  picnic: { kinds: [LA], lawnOnly: true },
  lamp: { kinds: [LA, GR, FL, MU] },
  fountain: { kinds: [LA, GR, FL], margin: true },
  kiosk: { kinds: [LA, GR, FL], margin: true },
  bandstand: { kinds: [LA, GR, FL], margin: true },
};
/** A kiosk's table goes where a lamp could (02 8.3: "when free"). */
const TABLE_RULE: Rule = { kinds: [LA, GR, FL, MU] };
const RANK_KEYS: readonly ReasonKey[] = ['reason.not_here', 'reason.outside', 'reason.gateway', 'reason.on_water', 'reason.taken', 'reason.on_flowers', 'reason.near_railings'];

function isTile(t: unknown): t is XY {
  const o = t as XY | null;
  return typeof o === 'object' && o !== null && Number.isInteger(o.x) && Number.isInteger(o.y);
}

/** Every tile of a w x h footprint at the north-west tile (x, y), off-park tiles included (x and y checked apart: notes 11 11.8). */
export function footprint(x: number, y: number, w: number, h: number): XY[] {
  const out: XY[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy });
  return out;
}

/** The prop standing on (x, y): the one in OCC, else a passable one whose footprint covers it (a picnic, a bridge), in list order. */
export function propAt(x: number, y: number): Prop | undefined {
  if (!inB(x, y)) return undefined;
  const o = OCC[I(x, y)] as number;
  if (o !== 0) return propById(o);
  for (const p of props) if (p.passable && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return p;
  return undefined;
}

function kindOk(tool: ToolId, rule: Rule, x: number, y: number): boolean {
  if (rule.inner && (x < 1 || y < 1 || x > N - 2 || y > N - 2)) return false;
  const k = KIND[I(x, y)] as number;
  if (rule.kinds.includes(k)) return true;
  return tool === 'lawn' && k === Kind.lawn && (WEAR[I(x, y)] as number) > 0; // the lawn brush restores worn grass (register 3.7)
}

/** The first of checks 1-7 that tile (x, y) fails for a land tool, or 0 when it passes them all (06 3.2). */
function tileRank(tool: ToolId, rule: Rule, x: number, y: number): number {
  if (!inB(x, y)) return 1;
  if (isGateTile(x, y) !== null) return 2;
  if ((WATER[I(x, y)] as number) > 0) return 3;
  if (propAt(x, y)) return 4;
  if (KIND[I(x, y)] === Kind.bed && !rule.bedOk) return 5;
  if (rule.margin && isBoundary(x, y)) return 6;
  return kindOk(tool, rule, x, y) ? 0 : 7;
}

function rankReason(rule: Rule, rank: number): ReasonKey {
  if (rank === 7) return rule.lawnOnly ? 'reason.lawn_only' : 'reason.not_here';
  return RANK_KEYS[rank] ?? 'reason.not_here';
}

/** The reason of the earliest check any tile fails, or null (GV 5972-5975: the flags over every tile, then the first in order). */
function worstOf(tool: ToolId, rule: Rule, tiles: readonly XY[]): ReasonKey | null {
  let best = 0;
  for (const t of tiles) {
    const r = tileRank(tool, rule, t.x, t.y);
    if (r !== 0 && (best === 0 || r < best)) best = r;
  }
  return best === 0 ? null : rankReason(rule, best);
}

function countKind(kind: PropKind): number {
  let n = 0;
  for (const p of props) if (p.kind === kind) n++;
  return n;
}

/* ---------- ghost (pure) ---------- */

export type GhostOpts = { size?: number; run?: readonly XY[] };
/** What a tool would do at a tile: `tiles` are the tiles it would write (or the ones that fail), `reason` the ranked reason when not ok. */
export type Ghost = { ok: boolean; tiles: XY[]; reason?: ReasonKey };

const no = (reason: ReasonKey, tiles: XY[]): Ghost => ({ ok: false, tiles, reason });

/** The repeat taps of 02 8.3: a bed on a bed changes colour, a bench on a bench turns, a tree on a tree goes. */
function repeatOf(tool: ToolId, at: XY): 'cycle' | 'turn' | 'fell' | null {
  if (tool === 'bed' && KIND[I(at.x, at.y)] === Kind.bed) return 'cycle';
  const p = propAt(at.x, at.y);
  if (tool === 'bench' && p?.kind === 'bench') return 'turn';
  if (tool === 'tree' && p?.kind === 'tree') return 'fell';
  return null;
}

function brushGhost(tool: ToolId, at: XY, size: number): Ghost {
  const rule = RULES[tool] as Rule;
  if (!BRUSH_SIZES.includes(size)) return no('reason.not_here', [at]);
  if (!inB(at.x, at.y)) return no('reason.outside', [at]); // GV 11119: a centre off the park paints nothing
  const r = size - 1;
  const tiles: XY[] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (Math.hypot(dx, dy) > r + 0.01) continue;
      const x = at.x + dx, y = at.y + dy;
      if (tileRank(tool, rule, x, y) === 0) tiles.push({ x, y }); // an invalid tile is skipped silently (02 8.2)
    }
  if (tiles.length > 0) return { ok: true, tiles };
  return no(rankReason(rule, tileRank(tool, rule, at.x, at.y)), [at]); // nothing would change: the centre tile's reason
}

function stampGhost(tool: ToolId, at: XY): Ghost {
  const tiles = [at];
  if (!inB(at.x, at.y)) return no('reason.outside', tiles);
  if (repeatOf(tool, at)) return { ok: true, tiles };
  const why = worstOf(tool, RULES[tool] as Rule, tiles);
  if (why) return no(why, tiles);
  if (tool !== 'bed' && props.length >= CAP_PROPS_SOFT) return no('reason.park_full_props', tiles);
  return { ok: true, tiles };
}

function removeGhost(at: XY): Ghost {
  if (!inB(at.x, at.y)) return no('reason.outside', [at]);
  const p = propAt(at.x, at.y);
  if (!p) return no('reason.not_here', [at]);
  const foot = footprint(p.x, p.y, p.w, p.h);
  if (p.kind === 'bridge' && someoneOn(foot)) return no('reason.someone_on_it', foot);
  return { ok: true, tiles: foot };
}

const BIG: Readonly<Record<'picnic' | 'fountain' | 'kiosk' | 'bandstand', readonly [number, number]>> = {
  picnic: [2, 2],
  fountain: [2, 2],
  kiosk: [2, 2],
  bandstand: [3, 3],
};

function bigGhost(tool: 'picnic' | 'fountain' | 'kiosk' | 'bandstand', at: XY): Ghost {
  const [w, h] = BIG[tool];
  const tiles = footprint(at.x, at.y, w, h);
  const why = worstOf(tool, RULES[tool] as Rule, tiles);
  if (why) return no(why, tiles);
  if (tool === 'bandstand' && countKind('bandstand') >= CAP_BANDSTANDS) return no('reason.has_bandstand', tiles);
  if (tool === 'kiosk' && countKind('kiosk') >= CAP_KIOSKS) return no('reason.enough_kiosks', tiles);
  if (props.length >= CAP_PROPS_SOFT) return no('reason.park_full_props', tiles);
  return { ok: true, tiles };
}

/** The water stamp (02 8.4): outside, then tap the water, then someone on it, then too wide; a bridge already there is `taken`. */
function bridgeGhost(at: XY): Ghost {
  if (!inB(at.x, at.y)) return no('reason.outside', [at]);
  const k = KIND[I(at.x, at.y)];
  if (k !== Kind.pond && k !== Kind.canal) return no('reason.not_on_water', [at]);
  const c = findCrossing(at.x, at.y);
  if (c && someoneOn(c.tiles)) return no('reason.someone_on_it', c.tiles);
  if (!c) return no('reason.too_wide', [at]);
  if (c.tiles.some((t) => propAt(t.x, t.y))) return no('reason.taken', c.tiles);
  if (props.length >= CAP_PROPS_SOFT) return no('reason.park_full_props', c.tiles);
  return { ok: true, tiles: c.tiles };
}

/** The tiles from `a` (not included) to `b` (included) along the row or column they share. */
function segment(a: XY, b: XY): XY[] {
  const out: XY[] = [];
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
  for (let x = a.x + dx, y = a.y + dy, n = Math.abs(b.x - a.x) + Math.abs(b.y - a.y); n > 0; n--, x += dx, y += dy) out.push({ x, y });
  return out;
}

/** A run with a new tap (02 8.2): the tap must share a row or column with the run's last tile and adds the straight segment to it. */
function runGhost(tool: 'hedge' | 'canal', at: XY, run: readonly XY[]): Ghost {
  const last = run[run.length - 1];
  const inLine = !last || at.x === last.x || at.y === last.y;
  let tiles: XY[];
  if (!last) tiles = [at];
  else if (!inLine) tiles = [...run, at];
  else tiles = [...run, ...segment(last, at).filter((t) => !run.some((r) => r.x === t.x && r.y === t.y))];
  const why = worstOf(tool, RULES[tool] as Rule, tiles);
  if (why) return no(why, tiles);
  if (!inLine) return no('reason.straight_line', tiles);
  if (tiles.length > CAP_RUN_TILES) return no('reason.run_too_long', tiles);
  if (tool === 'hedge' && props.length + tiles.length > CAP_PROPS_SOFT) return no('reason.park_full_props', tiles);
  return { ok: true, tiles };
}

/**
 * What `tool` would do at `at`, without changing anything: no layer, prop, id or rng() draw (03 2.6). `opts.size` is the brush size,
 * `opts.run` the run so far. Big stamps take `at` as their north-west tile; the bridge takes a water tile and finds its own crossing.
 */
export function ghost(tool: ToolId, at: XY, opts: GhostOpts = {}): Ghost {
  if (!isTile(at)) return no('reason.not_here', []);
  switch (tool) {
    case 'hand':
      return no('reason.not_here', []); // the hand selects and pans; it places nothing
    case 'path':
    case 'lawn':
    case 'pond':
      return brushGhost(tool, at, opts.size ?? 1);
    case 'bed':
    case 'tree':
    case 'bench':
    case 'lamp':
      return stampGhost(tool, at);
    case 'remove':
      return removeGhost(at);
    case 'picnic':
    case 'fountain':
    case 'kiosk':
    case 'bandstand':
      return bigGhost(tool, at);
    case 'bridge':
      return bridgeGhost(at);
    case 'hedge':
    case 'canal':
      return runGhost(tool, at, (opts.run ?? []).filter(isTile));
  }
  return no('reason.not_here', []);
}

/** The tile a kiosk serves from: the one south of its south-west tile (02 8.3; the tool places kiosks serving south, rot 0). */
export function servingTile(kiosk: Pick<Prop, 'x' | 'y' | 'h'>): XY {
  return { x: kiosk.x, y: kiosk.y + kiosk.h };
}

/** The species of the next tree the tool plants: plane, chestnut, lime in turn, counted from the player's trees standing (02 8.3). */
export function nextSpecies(): 0 | 1 | 2 {
  let n = 0;
  for (const p of props) if (p.kind === 'tree' && p.placedBy === 'player') n++;
  return (n % 3) as 0 | 1 | 2;
}

/* ---------- applyTool ---------- */

function clone(p: Prop): Prop {
  return JSON.parse(JSON.stringify(p)) as Prop;
}

/** Add a player prop and note it in the inverse, with whether its id was a recycled one (ids.ts unallocPropId). */
function place(kind: PropKind, x: number, y: number, w: number, h: number, inv: Inverse, data?: PropData): Prop {
  const recycled = propIdRecycles();
  const p = addProp({ kind, x, y, w, h, rot: 0, placedBy: 'player', data });
  inv.propsAdded.push(p.id);
  if (recycled) inv.recycled.push(p.id);
  return p;
}

/** Take a prop away (03 5.6 item 2): its footprint and a copy go into the inverse, its sitters stand, its id is reserved for the undo. */
function take(p: Prop, inv: Inverse): void {
  for (const t of footprint(p.x, p.y, p.w, p.h)) if (inB(t.x, t.y)) keepTile(inv, I(t.x, t.y));
  inv.propsRemoved.push(clone(p));
  standUpFrom(p.id);
  removeProp(p.id, 'reserve');
}

function paint(tool: 'path' | 'lawn' | 'pond', at: XY, size: number, inv: Inverse): ReasonKey | null {
  const g = ghost(tool, at, { size });
  if (!g.ok) return g.reason ?? 'reason.not_here';
  for (const t of g.tiles) {
    const i = I(t.x, t.y);
    keepTile(inv, i);
    if (tool === 'pond') {
      KIND[i] = Kind.pond;
      WATER[i] = WATER_DEPTH;
    } else {
      KIND[i] = tool === 'path' ? Kind.gravel : Kind.lawn;
      WEAR[i] = 0;
    }
  }
  return null;
}

function stamp(tool: 'bed' | 'tree' | 'bench' | 'lamp', at: XY, inv: Inverse): ReasonKey | null {
  const g = ghost(tool, at);
  if (!g.ok) return g.reason ?? 'reason.not_here';
  const i = I(at.x, at.y);
  const again = repeatOf(tool, at);
  keepTile(inv, i);
  if (tool === 'bed') {
    BEDC[i] = again ? ((BEDC[i] as number) + 1) % 4 : 0; // rose, lavender, marigold, white, rose; a new bed is rose
    KIND[i] = Kind.bed;
  } else if (again === 'turn') {
    const b = propAt(at.x, at.y) as Prop;
    inv.propsChanged.push(clone(b));
    b.rot = ((b.rot + 1) % 4) as 0 | 1 | 2 | 3;
  } else if (again === 'fell') {
    take(propAt(at.x, at.y) as Prop, inv);
  } else if (tool === 'tree') {
    const species = nextSpecies();
    KIND[i] = Kind.mulch;
    place('tree', at.x, at.y, 1, 1, inv, { species });
  } else {
    place(tool, at.x, at.y, 1, 1, inv);
  }
  return null;
}

/** `remove` (02 8.3): the prop on the tile goes; a kiosk takes its tables and its vendor; a table leaves its kiosk's list. */
function removeAt(at: XY, inv: Inverse): ReasonKey | null {
  const g = ghost('remove', at);
  if (!g.ok) return g.reason ?? 'reason.not_here';
  const p = propAt(at.x, at.y) as Prop;
  if (p.kind === 'kiosk') {
    inv.vendorRemoved = vendorLeave(p.id);
    take(p, inv);
    for (const id of p.data.tableIds ?? []) {
      const t = propById(id);
      if (t?.kind === 'table') take(t, inv);
    }
    return null;
  }
  if (p.kind === 'table') {
    const k = props.find((q) => q.kind === 'kiosk' && (q.data.tableIds ?? []).includes(p.id));
    if (k) {
      inv.propsChanged.push(clone(k));
      k.data.tableIds = (k.data.tableIds ?? []).filter((id) => id !== p.id);
    }
  }
  take(p, inv);
  return null;
}

function big(tool: 'picnic' | 'fountain' | 'kiosk' | 'bandstand', at: XY, inv: Inverse): ReasonKey | null {
  const g = ghost(tool, at);
  if (!g.ok) return g.reason ?? 'reason.not_here';
  for (const t of g.tiles) keepTile(inv, I(t.x, t.y));
  const [w, h] = BIG[tool];
  const p = place(tool, at.x, at.y, w, h, inv);
  if (tool !== 'kiosk') return null;
  const tables: number[] = [];
  for (let y = at.y; y < at.y + h; y++) {
    const x = at.x + w; // the column east of the kiosk (02 8.3)
    if (props.length >= CAP_PROPS_SOFT || tileRank('kiosk', TABLE_RULE, x, y) !== 0) continue;
    keepTile(inv, I(x, y));
    tables.push(place('table', x, y, 1, 1, inv).id);
  }
  p.data.tableIds = tables;
  vendorArrive(p.id);
  return null;
}

function bridge(at: XY, inv: Inverse): ReasonKey | null {
  const g = ghost('bridge', at);
  if (!g.ok) return g.reason ?? 'reason.not_here';
  const c = findCrossing(at.x, at.y);
  if (!c) return 'reason.too_wide';
  for (const t of c.tiles) keepTile(inv, I(t.x, t.y));
  place('bridge', c.x, c.y, c.dir === 1 ? c.span : 1, c.dir === 0 ? c.span : 1, inv, { span: c.span, dir: c.dir });
  return null;
}

/** A finished run (03 5.1: the run's tiles, or its taps): folded through the run ghost, so each tap is checked as the rail checked it. */
function runTool(tool: 'hedge' | 'canal', list: unknown, inv: Inverse): ReasonKey | null {
  if (!Array.isArray(list) || list.length === 0 || !list.every(isTile)) return 'reason.not_here';
  let run: XY[] = [];
  for (const t of list) {
    const g = ghost(tool, t, { run });
    if (!g.ok) return g.reason ?? 'reason.not_here';
    run = g.tiles;
  }
  for (const t of run) {
    const i = I(t.x, t.y);
    keepTile(inv, i);
    if (tool === 'canal') {
      KIND[i] = Kind.canal;
      WATER[i] = WATER_DEPTH;
    } else place('hedge', t.x, t.y, 1, 1, inv);
  }
  return null;
}

/**
 * Apply a tool command (03 5.1): check it again with the ghost (the world may have changed since it was enqueued), change KIND, WEAR,
 * WATER, OCC, BEDC and the props, record the inverse for the undo (03 5.6 item 2), then BLOCK, the charm field, the water bodies and the
 * ice follow (undo.settle). A rejected command changes nothing.
 */
export function applyTool(p: ToolPayload): Result {
  const inv = newInverse(0);
  let why: ReasonKey | null;
  switch (p.tool) {
    case 'path':
    case 'lawn':
    case 'pond':
      inv.strokeId = Number.isFinite(p.stroke) ? p.stroke : 0;
      why = isTile(p.at) ? paint(p.tool, p.at, p.size, inv) : 'reason.not_here';
      break;
    case 'bed':
    case 'tree':
    case 'bench':
    case 'lamp':
      why = isTile(p.at) ? stamp(p.tool, p.at, inv) : 'reason.not_here';
      break;
    case 'remove':
      why = isTile(p.at) ? removeAt(p.at, inv) : 'reason.not_here';
      break;
    case 'picnic':
    case 'fountain':
    case 'kiosk':
    case 'bandstand':
      why = isTile(p.at) ? big(p.tool, p.at, inv) : 'reason.not_here';
      break;
    case 'bridge':
      why = isTile(p.at) ? bridge(p.at, inv) : 'reason.not_here';
      break;
    case 'hedge':
    case 'canal':
      why = runTool(p.tool, p.tiles, inv);
      break;
    default:
      why = 'reason.not_here'; // `hand` is not a command (03 5.1), and an unknown tool places nothing
  }
  if (why) return fail(why);
  record(inv, inv.strokeId);
  settle(
    inv.tiles.map((t) => t.i),
    p.tool === 'pond' || p.tool === 'canal',
  );
  return OK;
}

/* The `tool` command (03 5.1): side and mode were checked by commands.ts (03 5.3). */
registerHandler('tool', (c) => applyTool(c.payload));
