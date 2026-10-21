// tests/water.test.ts
// Locks 02 8.3 (the bridge crossing), 3.3 (ice timing) / 08 2.2 / 07 S2.6 item 12: static water bodies, findCrossing, stepIce.
// The world/wear tests (07 S2.6 item 13) are in tests/wear.test.ts.
import { describe, it, expect, beforeEach } from 'vitest';
import { I, ICE, KIND, Kind, N, WATER, addProp, clearLayers } from '../src/world/grid.ts';
import { genPark } from '../src/world/gen.ts';
import { ICE_OFF_T, ICE_ON_T, bodyAt, findCrossing, iceState, resetIce, setIceState, stepIce, syncIce, waterBodies } from '../src/world/water.ts';
import { W } from '../src/core/weather.ts';
import { resetIds } from '../src/core/ids.ts';

const DT = 1 / 60;

/** Sim seconds of ice timing at the current snow. */
function snowFor(seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) stepIce(DT);
}
const frozen = (): number => ICE.reduce((n, v) => n + v, 0);

function lake(x0: number, y0: number, w: number, h: number, kind: Kind = Kind.canal): void {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      KIND[I(x, y)] = kind;
      WATER[I(x, y)] = 0.6;
    }
}

beforeEach(() => {
  clearLayers();
  resetIds();
  resetIce();
  W.snow = 0;
});

describe('world/water findCrossing (02 8.3)', () => {
  for (const span of [1, 2, 3, 4]) {
    it(`a canal ${span} wide is crossed by a bridge of ${span}, with land at both ends`, () => {
      lake(10, 5, span, 30); // a long canal running north-south: the short way over it is east-west
      const c = findCrossing(10, 20);
      expect(c).toMatchObject({ dir: 1, x: 10, y: 20, span });
      expect(c?.tiles).toHaveLength(span);
      expect(c?.tiles.every((t) => KIND[I(t.x, t.y)] === Kind.canal)).toBe(true);
      expect(KIND[I(9, 20)]).toBe(Kind.lawn);
      expect(KIND[I(10 + span, 20)]).toBe(Kind.lawn);
      // from any tile of the canal the answer is the same span
      expect(findCrossing(10 + span - 1, 7)).toMatchObject({ dir: 1, span });
    });
  }
  it('a canal running east-west is crossed north to south', () => {
    lake(5, 10, 30, 2);
    expect(findCrossing(20, 11)).toMatchObject({ dir: 0, x: 20, y: 10, span: 2 });
  });
  it('the shorter way wins and a tie goes north to south', () => {
    lake(10, 10, 3, 2); // 3 wide, 2 tall
    expect(findCrossing(11, 10)).toMatchObject({ dir: 0, span: 2 });
    clearLayers();
    lake(10, 10, 2, 2);
    expect(findCrossing(10, 10)).toMatchObject({ dir: 0, span: 2 });
  });
  it('refuses a body 5 wide in both directions', () => {
    lake(10, 10, 5, 5);
    expect(findCrossing(12, 12)).toBeNull();
    clearLayers();
    lake(10, 5, 5, 30);
    expect(findCrossing(12, 20)).toBeNull();
  });
  it('refuses water that runs to the edge of the park (no land at one end) and a tile that is not water', () => {
    lake(0, 5, 1, 6); // a strip on the west edge, 6 tall: east-west has no land beyond x = 0, north-south is too long
    expect(findCrossing(0, 8)).toBeNull();
    expect(findCrossing(20, 20)).toBeNull();
    expect(findCrossing(-1, 5)).toBeNull();
    expect(findCrossing(N, 5)).toBeNull();
  });
  it('the starter park: the neck is crossed north to south over 2 tiles', () => {
    genPark(101);
    expect(findCrossing(34, 12)).toMatchObject({ dir: 0, x: 34, y: 11, span: 2 });
    expect(findCrossing(34, 11)?.tiles).toEqual([{ x: 34, y: 11 }, { x: 34, y: 12 }]);
  });
});

describe('world/water bodies (03 2.4)', () => {
  it('counts 4-connected pond and canal tiles as one body, and a lone pond tile as a body of 1', () => {
    lake(10, 10, 3, 4, Kind.pond);
    lake(30, 30, 1, 1, Kind.pond);
    lake(13, 10, 1, 2, Kind.canal); // touches the pond: one mixed body
    lake(20, 20, 2, 2, Kind.canal);
    const bodies = waterBodies();
    expect(bodies.map((b) => [b.size, b.kind])).toEqual([[14, 'mixed'], [4, 'canal'], [1, 'pond']]);
    expect(bodyAt(11, 11)?.size).toBe(14);
    expect(bodyAt(30, 30)?.size).toBe(1);
    expect(bodyAt(5, 5)).toBeNull();
    expect(bodyAt(-1, 5)).toBeNull();
  });
  it('diagonal neighbours are separate bodies', () => {
    lake(10, 10, 1, 1);
    lake(11, 11, 1, 1);
    expect(waterBodies()).toHaveLength(2);
  });
  it('the starter pond is one body of at least 12 tiles; painting water changes the answer', () => {
    genPark(101);
    expect(waterBodies()).toHaveLength(1);
    expect(waterBodies()[0]?.size).toBeGreaterThanOrEqual(12);
    addProp({ kind: 'bench', x: 5, y: 5, w: 1, h: 1, rot: 0, placedBy: 'player' }); // any prop change makes the cache look again
    expect(waterBodies()).toHaveLength(1);
    KIND[I(5, 40)] = Kind.pond;
    addProp({ kind: 'bench', x: 6, y: 5, w: 1, h: 1, rot: 0, placedBy: 'player' }); // a tool dirties the world as it paints
    expect(waterBodies()).toHaveLength(2);
  });
});

describe('world/water ice (02 3.3 snow row)', () => {
  beforeEach(() => {
    genPark(101);
  });

  it('60 s of snow above 0.3 freezes every pond tile; 59 s does not', () => {
    expect(ICE_ON_T).toBe(60);
    W.snow = 0.8;
    snowFor(59);
    expect(frozen()).toBe(0);
    snowFor(1);
    expect(frozen()).toBe(waterBodies()[0]?.size);
    for (const i of waterBodies()[0]?.tiles ?? []) expect(ICE[i]).toBe(1);
    expect(ICE[I(5, 5)]).toBe(0);
  });
  it('it thaws after 120 s without snow, not at 119', () => {
    expect(ICE_OFF_T).toBe(120);
    W.snow = 0.8;
    snowFor(60);
    W.snow = 0.2;
    snowFor(119);
    expect(frozen()).toBeGreaterThan(0);
    snowFor(1);
    expect(frozen()).toBe(0);
  });
  it('snow that stops before 60 s starts the count again; snow at 0.3 or less counts as none', () => {
    W.snow = 0.8;
    snowFor(50);
    W.snow = 0.3;
    snowFor(1);
    W.snow = 0.8;
    snowFor(50);
    expect(frozen()).toBe(0);
    snowFor(10);
    expect(frozen()).toBeGreaterThan(0);
  });
  it('snow in the middle of a thaw restarts the dry count', () => {
    W.snow = 0.8;
    snowFor(60);
    W.snow = 0;
    snowFor(100);
    W.snow = 0.8;
    snowFor(1);
    W.snow = 0;
    snowFor(100);
    expect(frozen()).toBeGreaterThan(0);
  });
  it('the timers round-trip through the state and syncIce repaints new water', () => {
    W.snow = 0.8;
    snowFor(60);
    const s = JSON.parse(JSON.stringify(iceState())) as ReturnType<typeof iceState>;
    expect(s.on).toBe(1);
    resetIce();
    setIceState(s);
    KIND[I(5, 40)] = Kind.canal;
    syncIce();
    expect(ICE[I(5, 40)]).toBe(1);
  });
});
