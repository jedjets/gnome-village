// tests/tools.test.ts
// Locks the park tools: register 3.7 (the sixteen ids), 02 8.2-8.4 and 06 3 (classes, footprints, ranked reasons, caps, margins, repeat
// taps), 03 5.1, 5.3, 5.4 (the payloads, the side and mode rules, the reason keys) and 03 2.6 (ghost is pure). 08 2.5 tools.test.ts rows.
// Every case runs on the starter park of seed 101 (02 2.5); a sim test asserts keys, never sentences (08 1.3 item 4).
import { describe, it, expect, beforeEach } from 'vitest';
import { SIM_DT, newPark, simulate } from '../src/core/loop.ts';
import { applyNow, enqueue, log, type Result, type ToolPayload } from '../src/core/commands.ts';
import { clearListeners, on, type GameEvent } from '../src/core/events.ts';
import { rngN } from '../src/core/rng.ts';
import { idsState } from '../src/core/ids.ts';
import { stateHash, worldHash } from '../src/save/store.ts';
import { BEDC, I, KIND, Kind, OCC, WATER, WEAR, addProp, layersState, markBlockDirty, propById, props } from '../src/world/grid.ts';
import { setMode } from '../src/play/mode.ts';
import {
  CAP_BANDSTANDS, CAP_KIOSKS, CAP_PROPS_SOFT, CAP_RUN_TILES, TOOLS, TOOL_IDS, ghost, propAt, servingTile, toolById, type ToolId,
} from '../src/play/tools.ts';

const tool = (payload: ToolPayload): Result => applyNow({ side: 'park', kind: 'tool', payload });
const reasonOf = (r: Result): string => (r.ok ? 'ok' : r.reason);
const at = (x: number, y: number): { x: number; y: number } => ({ x, y });
const row = (x0: number, x1: number, y: number): Array<{ x: number; y: number }> => {
  const out = [];
  for (let x = x0; x <= x1; x++) out.push({ x, y });
  return out;
};
/** Make a w x h block of pond tiles (a test fixture, not a tool). */
function water(x0: number, y0: number, w: number, h: number): void {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      KIND[I(x, y)] = Kind.pond;
      WATER[I(x, y)] = 0.6;
    }
  markBlockDirty();
}

/** One valid command per tool on the starter park of seed 101 (02 2.5): (5,5) and (3,3) are open lawn, (20,10) is the outer loop's gravel,
 * (31,12) is a pond tile with a 3-tile north-south crossing, (31,24) is a starter bench. */
const VALID: Record<Exclude<ToolId, 'hand'>, ToolPayload> = {
  path: { tool: 'path', at: at(5, 5), size: 1, stroke: 1 },
  lawn: { tool: 'lawn', at: at(20, 10), size: 1, stroke: 2 },
  bed: { tool: 'bed', at: at(5, 5) },
  hedge: { tool: 'hedge', tiles: row(5, 7, 5) },
  tree: { tool: 'tree', at: at(5, 5) },
  pond: { tool: 'pond', at: at(5, 5), size: 1, stroke: 3 },
  canal: { tool: 'canal', tiles: [at(5, 5), at(5, 6)] },
  bridge: { tool: 'bridge', at: at(31, 12) },
  bench: { tool: 'bench', at: at(5, 5) },
  picnic: { tool: 'picnic', at: at(5, 5) },
  lamp: { tool: 'lamp', at: at(5, 5) },
  fountain: { tool: 'fountain', at: at(3, 3) },
  kiosk: { tool: 'kiosk', at: at(3, 3) },
  bandstand: { tool: 'bandstand', at: at(3, 3) },
  remove: { tool: 'remove', at: at(31, 24) },
};

beforeEach(() => {
  clearListeners();
  newPark(101);
  setMode('creator');
});

describe('the sixteen tools (register 3.7; 06 3.1; 08 2.5 "the 16 ids exist and each places")', () => {
  it('TOOLS holds the register ids in order, with class, footprint, keys, icon and swatch', () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      'hand', 'path', 'lawn', 'bed', 'hedge', 'tree', 'pond', 'canal', 'bridge', 'bench', 'picnic', 'lamp', 'fountain', 'kiosk', 'bandstand', 'remove',
    ]);
    expect(TOOL_IDS).toHaveLength(16);
    const cls = Object.fromEntries(TOOLS.map((t) => [t.id, t.class]));
    expect(cls).toEqual({
      hand: 'none', path: 'brush', lawn: 'brush', bed: 'stamp1', hedge: 'run', tree: 'stamp1', pond: 'brush', canal: 'run', bridge: 'stampBig',
      bench: 'stamp1', picnic: 'stampBig', lamp: 'stamp1', fountain: 'stampBig', kiosk: 'stampBig', bandstand: 'stampBig', remove: 'stamp1',
    });
    expect(toolById('bandstand').footprint).toEqual({ kind: 'rect', w: 3, h: 3 });
    expect(toolById('picnic').footprint).toEqual({ kind: 'rect', w: 2, h: 2 });
    expect(toolById('bridge').footprint).toEqual({ kind: 'span', max: 4 });
    expect(toolById('hedge').footprint).toEqual({ kind: 'run', max: 14 });
    expect(toolById('path').footprint).toEqual({ kind: 'disc', sizes: [1, 2, 3] });
    for (const t of TOOLS) {
      expect(t.labelKey).toBe(`tool.${t.id}.label`);
      expect(t.hintKey).toBe(`tool.${t.id}.hint`);
      expect(t.icon).toBe('');
      expect(t.col).toBe('--moss');
    }
  });

  it('one valid command per tool (all but hand) changes stateHash and worldHash and is logged', () => {
    for (const id of TOOL_IDS) {
      if (id === 'hand') continue;
      newPark(101);
      const h = stateHash(), w = worldHash();
      expect(reasonOf(tool(VALID[id])), id).toBe('ok');
      expect(stateHash(), id).not.toBe(h);
      expect(worldHash(), id).not.toBe(w);
      expect(log().at(-1)?.kind).toBe('tool');
    }
  });

  it('each tool writes what 02 8.3 says', () => {
    tool(VALID.path);
    expect(KIND[I(5, 5)]).toBe(Kind.gravel);
    expect(reasonOf(tool(VALID.lawn))).toBe('ok');
    expect(KIND[I(20, 10)]).toBe(Kind.lawn);
    newPark(101);
    tool(VALID.pond);
    expect([KIND[I(5, 5)], WATER[I(5, 5)]]).toEqual([Kind.pond, Math.fround(0.6)]);
    newPark(101);
    tool(VALID.canal);
    expect([KIND[I(5, 6)], WATER[I(5, 6)]]).toEqual([Kind.canal, Math.fround(0.6)]);
    newPark(101);
    tool(VALID.tree);
    const tree = propAt(5, 5);
    expect([tree?.kind, tree?.placedBy, KIND[I(5, 5)], OCC[I(5, 5)]]).toEqual(['tree', 'player', Kind.mulch, tree?.id]);
    newPark(101);
    tool(VALID.picnic);
    const pic = propAt(6, 6);
    expect([pic?.kind, pic?.w, pic?.h, pic?.passable, OCC[I(5, 5)]]).toEqual(['picnic', 2, 2, true, 0]);
    newPark(101);
    tool(VALID.hedge);
    expect(row(5, 7, 5).map((t) => propAt(t.x, t.y)?.kind)).toEqual(['hedge', 'hedge', 'hedge']);
    newPark(101);
    tool(VALID.bandstand);
    expect(OCC[I(5, 5)]).toBe(propAt(3, 3)?.id);
    expect(propAt(3, 3)?.kind).toBe('bandstand');
  });

  it('the lawn brush also restores worn grass (register 3.7 "restores grass")', () => {
    WEAR[I(5, 5)] = 2;
    expect(reasonOf(tool({ tool: 'lawn', at: at(5, 5), size: 1, stroke: 9 }))).toBe('ok');
    expect(WEAR[I(5, 5)]).toBe(0);
    expect(reasonOf(tool({ tool: 'lawn', at: at(5, 5), size: 1, stroke: 9 }))).toBe('reason.not_here');
  });
});

describe('ranked reasons, first match wins (02 8.4; 06 3.2; 03 5.4 tools block; GV 5972-5975)', () => {
  it('one case per land key', () => {
    expect(reasonOf(tool({ tool: 'bench', at: at(-1, 5) }))).toBe('reason.outside');
    expect(reasonOf(tool({ tool: 'bench', at: at(12, 47) }))).toBe('reason.gateway');
    expect(reasonOf(tool({ tool: 'bench', at: at(31, 12) }))).toBe('reason.on_water');
    expect(reasonOf(tool({ tool: 'lamp', at: at(31, 24) }))).toBe('reason.taken');
    expect(reasonOf(tool({ tool: 'bench', at: at(19, 19) }))).toBe('reason.on_flowers');
    expect(reasonOf(tool({ tool: 'fountain', at: at(0, 5) }))).toBe('reason.near_railings');
    expect(reasonOf(tool({ tool: 'picnic', at: at(20, 9) }))).toBe('reason.lawn_only');
    expect(reasonOf(tool({ tool: 'bed', at: at(20, 9) }))).toBe('reason.not_here');
    expect(reasonOf(tool({ tool: 'bandstand', at: at(3, 3) }))).toBe('ok');
    expect(reasonOf(tool({ tool: 'bandstand', at: at(3, 8) }))).toBe('reason.has_bandstand');
    expect(reasonOf(tool({ tool: 'kiosk', at: at(10, 3) }))).toBe('ok');
    expect(reasonOf(tool({ tool: 'kiosk', at: at(14, 3) }))).toBe('ok');
    expect(reasonOf(tool({ tool: 'kiosk', at: at(3, 13) }))).toBe('reason.enough_kiosks');
  });

  it('a footprint failing two checks reports the earlier one', () => {
    expect(reasonOf(tool({ tool: 'fountain', at: at(-1, -1) }))).toBe('reason.outside'); // outside (1) and on the boundary (6)
    expect(reasonOf(tool({ tool: 'bench', at: at(34, 11) }))).toBe('reason.on_water'); // the bridge's water (3) and its prop (4)
    expect(reasonOf(tool({ tool: 'picnic', at: at(11, 46) }))).toBe('reason.gateway'); // a gate tile (2) and gravel (7)
    expect(reasonOf(tool({ tool: 'fountain', at: at(18, 18) }))).toBe('reason.on_flowers'); // a bed (5) beside the loop's gravel
    expect(reasonOf(tool({ tool: 'bandstand', at: at(22, 22) }))).toBe('reason.taken'); // the fountain (4) on flagstone
  });

  it('a pond or canal never touches the boundary ring (02 8.3: 1 <= x, y <= 46)', () => {
    expect(reasonOf(tool({ tool: 'pond', at: at(0, 5), size: 1, stroke: 4 }))).toBe('reason.not_here');
    expect(reasonOf(tool({ tool: 'canal', tiles: [at(5, 47)] }))).toBe('reason.not_here');
    expect(reasonOf(tool({ tool: 'path', at: at(0, 5), size: 1, stroke: 5 }))).toBe('ok'); // path and lawn may (09 2.5), gates excepted
    expect(reasonOf(tool({ tool: 'path', at: at(0, 23), size: 1, stroke: 6 }))).toBe('reason.gateway');
  });
});

describe('bridge reasons and spans (02 8.3 bridge row, 8.4 water list; world/water.ts findCrossing)', () => {
  it('a land tile is reason.not_on_water; 5 wide is reason.too_wide', () => {
    expect(reasonOf(tool({ tool: 'bridge', at: at(5, 5) }))).toBe('reason.not_on_water');
    water(2, 2, 5, 5);
    expect(reasonOf(tool({ tool: 'bridge', at: at(4, 4) }))).toBe('reason.too_wide');
    expect(reasonOf(tool({ tool: 'bridge', at: at(-1, 4) }))).toBe('reason.outside');
  });

  it('1 to 4 wide places with span equal to the width; a second bridge on it is reason.taken', () => {
    for (let wdt = 1; wdt <= 4; wdt++) {
      newPark(101);
      water(1, 3, 6, wdt); // 6 wide east-west (more than 4), wdt tall north-south
      expect(reasonOf(tool({ tool: 'bridge', at: at(3, 3) })), 'width ' + wdt).toBe('ok');
      const b = props.at(-1);
      expect([b?.kind, b?.data.span, b?.data.dir, b?.w, b?.h, b?.x, b?.y, b?.passable]).toEqual(['bridge', wdt, 0, 1, wdt, 3, 3, true]);
      expect(reasonOf(tool({ tool: 'bridge', at: at(3, 3) }))).toBe('reason.taken');
    }
  });

  it.todo('a visitor on the span is reason.someone_on_it (needs visitors: S4 entities/visitor.ts someoneOn; 07 S4)');
});

describe('runs (02 8.2 run row; GV pbTap 5991-5997)', () => {
  it('a tap off the last tile\'s row and column is reason.straight_line', () => {
    expect(ghost('hedge', at(7, 7), { run: [at(5, 5)] }).reason).toBe('reason.straight_line');
    expect(reasonOf(tool({ tool: 'hedge', tiles: [at(5, 5), at(7, 7)] }))).toBe('reason.straight_line');
    expect(reasonOf(tool({ tool: 'canal', tiles: [at(5, 5), at(5, 8), at(6, 9)] }))).toBe('reason.straight_line');
  });

  it('14 tiles place; a 15th is reason.run_too_long', () => {
    expect(CAP_RUN_TILES).toBe(14);
    expect(reasonOf(tool({ tool: 'hedge', tiles: row(1, 15, 5) }))).toBe('reason.run_too_long');
    expect(reasonOf(tool({ tool: 'hedge', tiles: [at(1, 5), at(15, 5)] }))).toBe('reason.run_too_long'); // taps: the segment counts
    const n = props.length;
    expect(reasonOf(tool({ tool: 'hedge', tiles: [at(1, 5), at(14, 5)] }))).toBe('ok');
    expect(props.length).toBe(n + 14);
    expect(row(1, 14, 5).every((t) => propAt(t.x, t.y)?.kind === 'hedge')).toBe(true);
  });

  it('the ghost grows the run by the straight segment and keeps every tile once', () => {
    const g = ghost('canal', at(5, 8), { run: [at(5, 5)] });
    expect(g).toEqual({ ok: true, tiles: [at(5, 5), at(5, 6), at(5, 7), at(5, 8)] });
    const back = ghost('canal', at(5, 4), { run: g.tiles });
    expect(back.tiles).toEqual([at(5, 5), at(5, 6), at(5, 7), at(5, 8), at(5, 4)]);
  });
});

describe('brushes (02 8.2 brush row; GV paintTile 11118-11126)', () => {
  it('a size-3 path stroke half on the pond changes only the dry tiles and returns ok', () => {
    const before = layersState();
    expect(reasonOf(tool({ tool: 'path', at: at(31, 14), size: 3, stroke: 7 }))).toBe('ok');
    let changed = 0;
    for (let i = 0; i < KIND.length; i++) if (KIND[i] !== before.KIND[i]) changed++;
    expect(changed).toBe(9); // the 13-tile disc of radius 2 less its 4 pond tiles
    for (const [x, y] of [[31, 12], [30, 13], [31, 13], [32, 13]] as const) expect(KIND[I(x, y)]).toBe(Kind.pond);
    expect(KIND[I(29, 14)]).toBe(Kind.gravel);
    expect(KIND[I(31, 16)]).toBe(Kind.gravel);
  });

  it('a stroke that changes nothing reports its centre tile\'s reason', () => {
    expect(reasonOf(tool({ tool: 'path', at: at(31, 12), size: 1, stroke: 8 }))).toBe('reason.on_water');
    expect(reasonOf(tool({ tool: 'path', at: at(20, 9), size: 1, stroke: 8 }))).toBe('reason.not_here');
    expect(reasonOf(tool({ tool: 'pond', at: at(31, 24), size: 1, stroke: 8 }))).toBe('reason.taken');
    expect(reasonOf(tool({ tool: 'path', at: at(-3, 5), size: 3, stroke: 8 }))).toBe('reason.outside'); // a centre off the park paints nothing
  });

  it('the disc has radius size - 1: 1, 5 and 13 tiles', () => {
    expect(ghost('path', at(5, 5), { size: 1 }).tiles).toHaveLength(1);
    expect(ghost('path', at(5, 5), { size: 2 }).tiles).toHaveLength(5);
    expect(ghost('path', at(5, 5), { size: 3 }).tiles).toHaveLength(13);
    expect(ghost('path', at(5, 5), { size: 4 }).reason).toBe('reason.not_here');
  });
});

describe('repeat taps (02 8.3 bed, bench and tree rows)', () => {
  it('bed on a bed cycles rose -> lavender -> marigold -> white -> rose', () => {
    const seen: number[] = [];
    for (let k = 0; k < 5; k++) {
      expect(reasonOf(tool({ tool: 'bed', at: at(5, 5) }))).toBe('ok');
      seen.push(BEDC[I(5, 5)] as number);
    }
    expect(KIND[I(5, 5)]).toBe(Kind.bed);
    expect(seen).toEqual([0, 1, 2, 3, 0]);
  });

  it('bench on a bench turns it 0 -> 1 -> 2 -> 3 -> 0', () => {
    const seen: number[] = [];
    for (let k = 0; k < 5; k++) {
      expect(reasonOf(tool({ tool: 'bench', at: at(5, 5) }))).toBe('ok');
      seen.push(propAt(5, 5)?.rot ?? -1);
    }
    expect(seen).toEqual([0, 1, 2, 3, 0]);
    expect(props.filter((p) => p.kind === 'bench' && p.placedBy === 'player')).toHaveLength(1);
  });

  it('tree on a tree removes it, with no confirm (02 15 open point 2)', () => {
    tool({ tool: 'tree', at: at(5, 5) });
    expect(propAt(5, 5)?.kind).toBe('tree');
    expect(reasonOf(tool({ tool: 'tree', at: at(5, 5) }))).toBe('ok');
    expect(propAt(5, 5)).toBeUndefined();
    expect(OCC[I(5, 5)]).toBe(0);
    expect(reasonOf(tool({ tool: 'tree', at: at(9, 2) }))).toBe('ok'); // a starter tree goes too
    expect(propAt(9, 2)).toBeUndefined();
  });

  it('tree species cycle plane -> chestnut -> lime per placement', () => {
    const species: number[] = [];
    for (const x of [3, 5, 7, 9]) {
      tool({ tool: 'tree', at: at(x, 5) });
      species.push(propAt(x, 5)?.data.species ?? -1);
    }
    expect(species).toEqual([0, 1, 2, 0]);
  });
});

describe('caps and margins (02 8.3 fountain, kiosk and bandstand rows; 03 3.11 soft cap 600)', () => {
  it('a 2nd bandstand, a 4th kiosk, a fountain touching the boundary', () => {
    expect([CAP_BANDSTANDS, CAP_KIOSKS, CAP_PROPS_SOFT]).toEqual([1, 3, 600]);
    expect(reasonOf(tool({ tool: 'bandstand', at: at(3, 3) }))).toBe('ok');
    expect(reasonOf(tool({ tool: 'bandstand', at: at(3, 13) }))).toBe('reason.has_bandstand');
    expect(reasonOf(tool({ tool: 'kiosk', at: at(3, 8) }))).toBe('ok'); // the starter kiosk is the first
    expect(reasonOf(tool({ tool: 'kiosk', at: at(10, 3) }))).toBe('ok');
    expect(reasonOf(tool({ tool: 'kiosk', at: at(3, 17) }))).toBe('reason.enough_kiosks');
    expect(reasonOf(tool({ tool: 'fountain', at: at(1, 0) }))).toBe('reason.near_railings');
    expect(reasonOf(tool({ tool: 'fountain', at: at(46, 30) }))).toBe('reason.near_railings');
    expect(reasonOf(tool({ tool: 'fountain', at: at(45, 33) }))).toBe('ok');
  });

  it('the 601st prop is reason.park_full_props; the 600th places', () => {
    while (props.length < CAP_PROPS_SOFT - 1) addProp({ kind: 'crumbs', x: 40, y: 40, w: 1, h: 1, rot: 0, placedBy: 'sim' });
    expect(reasonOf(tool({ tool: 'lamp', at: at(5, 5) }))).toBe('ok');
    expect(props.length).toBe(600);
    expect(reasonOf(tool({ tool: 'lamp', at: at(7, 5) }))).toBe('reason.park_full_props');
    expect(reasonOf(tool({ tool: 'hedge', tiles: [at(7, 7)] }))).toBe('reason.park_full_props');
    expect(reasonOf(tool({ tool: 'bed', at: at(7, 5) }))).toBe('ok'); // a bed is a tile kind, not a prop
  });
});

describe('kiosk and remove side effects (02 8.3 kiosk and remove rows)', () => {
  it('a kiosk brings two tables on its east side and serves from the tile south of its south-west tile', () => {
    expect(reasonOf(tool({ tool: 'kiosk', at: at(3, 3) }))).toBe('ok');
    const k = propAt(3, 3);
    expect(k?.kind).toBe('kiosk');
    const t1 = propAt(5, 3), t2 = propAt(5, 4);
    expect([t1?.kind, t2?.kind]).toEqual(['table', 'table']);
    expect(k?.data.tableIds).toEqual([t1?.id, t2?.id]);
    expect(servingTile(k as NonNullable<typeof k>)).toEqual(at(3, 5));
  });

  it('a table goes only where a table may stand ("when free")', () => {
    tool({ tool: 'lamp', at: at(5, 3) });
    tool({ tool: 'kiosk', at: at(3, 3) });
    const k = propAt(3, 3);
    expect(k?.data.tableIds).toEqual([propAt(5, 4)?.id]);
    expect(propAt(5, 3)?.kind).toBe('lamp');
  });

  it('remove on a kiosk takes its tables; remove on a table takes it off its kiosk\'s list', () => {
    tool({ tool: 'kiosk', at: at(3, 3) });
    const n = props.length;
    expect(reasonOf(tool({ tool: 'remove', at: at(4, 4) }))).toBe('ok');
    expect(props.length).toBe(n - 3);
    for (const [x, y] of [[3, 3], [4, 4], [5, 3], [5, 4]] as const) expect(OCC[I(x, y)]).toBe(0);
    const kiosk = propById(8);
    expect(kiosk?.kind).toBe('kiosk'); // the starter kiosk, tables 9 and 10
    expect(reasonOf(tool({ tool: 'remove', at: at(16, 44) }))).toBe('ok');
    expect(kiosk?.data.tableIds).toEqual([10]);
  });

  it('remove on an empty tile is reason.not_here; outside is reason.outside; a passable prop goes too', () => {
    expect(reasonOf(tool({ tool: 'remove', at: at(5, 5) }))).toBe('reason.not_here');
    expect(reasonOf(tool({ tool: 'remove', at: at(48, 5) }))).toBe('reason.outside');
    expect(reasonOf(tool({ tool: 'remove', at: at(34, 12) }))).toBe('ok'); // the starter bridge
    expect(props.some((p) => p.kind === 'bridge')).toBe(false);
  });

  it.todo('placing a kiosk spawns one vendor; remove on it sends the vendor away (needs staff: S4 entities/staff.ts vendorArrive, vendorLeave; 07 S4)');
  it.todo('remove on a bench stands its sitters up (needs visitors: S4 entities/visitor.ts standUpFrom; 07 S4)');
  it.todo('remove on a bridge with someone on it is reason.someone_on_it (needs visitors: S4 entities/visitor.ts someoneOn; 07 S4)');
});

describe('ghost is pure (03 2.6 tools.ts; 08 2.5)', () => {
  it('twice on the same input gives equal results and changes no layer, prop, id or rng draw', () => {
    tool({ tool: 'tree', at: at(5, 5) });
    const layers = JSON.stringify(Object.values(layersState()).map((a) => Array.from(a as ArrayLike<number>)));
    const propsJson = JSON.stringify(props);
    const ids = JSON.stringify(idsState());
    const n = rngN(), h = stateHash();
    const cases: Array<[ToolId, { x: number; y: number }, { size?: number; run?: Array<{ x: number; y: number }> }]> = [
      ['hand', at(5, 5), {}], ['path', at(31, 14), { size: 3 }], ['lawn', at(20, 10), { size: 2 }], ['pond', at(5, 8), { size: 3 }],
      ['bed', at(19, 19), {}], ['tree', at(5, 5), {}], ['bench', at(31, 24), {}], ['lamp', at(7, 7), {}], ['remove', at(4, 4), {}],
      ['picnic', at(6, 7), {}], ['fountain', at(0, 5), {}], ['kiosk', at(3, 10), {}], ['bandstand', at(3, 3), {}], ['bridge', at(31, 12), {}],
      ['hedge', at(9, 7), { run: [at(7, 7)] }], ['canal', at(8, 8), { run: [at(7, 7)] }],
    ];
    for (const [id, a, o] of cases) expect(ghost(id, a, o), id).toEqual(ghost(id, a, o));
    expect(JSON.stringify(Object.values(layersState()).map((a) => Array.from(a as ArrayLike<number>)))).toBe(layers);
    expect(JSON.stringify(props)).toBe(propsJson);
    expect(JSON.stringify(idsState())).toBe(ids);
    expect(rngN()).toBe(n);
    expect(stateHash()).toBe(h);
  });
});

describe('tool commands go through the command rules (03 5.2-5.4)', () => {
  it('in avatar mode a tool is reason.not_in_avatar; a rejection emits `rejected` with the key and changes nothing', () => {
    const seen: GameEvent[] = [];
    on('rejected', (e) => seen.push(e));
    const h = stateHash(); // in creator mode (MODE is hashed, 03 11)
    setMode('avatar', 'a_pigeon', 1);
    expect(reasonOf(tool(VALID.bench))).toBe('reason.not_in_avatar');
    setMode('creator');
    expect(reasonOf(tool({ tool: 'bench', at: at(19, 19) }))).toBe('reason.on_flowers');
    expect(seen.map((e) => e.params?.reason)).toEqual(['reason.not_in_avatar', 'reason.on_flowers']);
    expect(stateHash()).toBe(h);
    expect(log()).toHaveLength(0);
  });

  it('applyTool checks again: a tile taken between enqueue and apply is rejected', () => {
    enqueue({ side: 'park', kind: 'tool', payload: { tool: 'bench', at: at(5, 5) } }); // applies on the next step
    expect(reasonOf(tool({ tool: 'lamp', at: at(5, 5) }))).toBe('ok'); // the tile is taken first
    const seen: GameEvent[] = [];
    on('rejected', (e) => seen.push(e));
    simulate(SIM_DT, 1);
    expect(seen.map((e) => e.params?.reason)).toEqual(['reason.taken']);
    expect(propAt(5, 5)?.kind).toBe('lamp');
  });
});
