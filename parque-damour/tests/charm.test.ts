// tests/charm.test.ts
// The charm field of 03 6.7, 02 6.3 and 06 9 (08 2.2 charm.test.ts rows; 07 S5.7 item 2 "charmAt ... returns { total: 3, player: 1 }").
import { describe, it, expect, beforeEach } from 'vitest';
import { I, KIND, Kind, PETALS, addProp, clearLayers, props, type Prop } from '../src/world/grid.ts';
import {
  CHARM_CAP, addSource, charmAt, charmDirty, clearCharmSources, markCharmDirty, rebuildCharm, removeSource, setLiveSources, setPairCharm,
} from '../src/world/charm.ts';
import { T } from '../src/core/clock.ts';
import { addOverride, resetWeather } from '../src/core/weather.ts';

function emptyPark(): void {
  clearLayers();
  props.length = 0;
  clearCharmSources();
  setLiveSources(() => {});
  resetWeather();
  T.abs = 0.5;
}
function prop(kind: Prop['kind'], x: number, y: number, w: number, h: number, placedBy: Prop['placedBy']): Prop {
  return addProp({ kind, x, y, w, h, rot: 0, placedBy });
}
function bed(x: number, y: number): void {
  KIND[I(x, y)] = Kind.bed;
}

beforeEach(emptyPark);

describe('charm.ts the done-when of 03 6.7 (07 S5.7 item 2)', () => {
  it('a tile 2 from a player bed and 4 from a gen fountain reads { total: 3, player: 1 }', () => {
    bed(10, 20); // outside the starter park's bed clusters: the player's (assumption S5-A1)
    prop('fountain', 14, 20, 2, 2, 'gen');
    rebuildCharm(props, false);
    expect(charmAt(12, 20)).toEqual({ total: 3, player: 1 });
  });
  it('a starter bed (19..20, 19..20) is gen charm, never player charm', () => {
    bed(19, 19);
    rebuildCharm(props, false);
    expect(charmAt(21, 21)).toEqual({ total: 1, player: 0 });
  });
});

describe('charm.ts each static source counts once per tile (08 2.2)', () => {
  it('two beds within 3 give +1; a fountain within 5 and a bandstand within 4 give 4', () => {
    bed(10, 20);
    bed(11, 21);
    rebuildCharm(props, false);
    expect(charmAt(12, 22).total).toBe(1);
    emptyPark();
    prop('fountain', 20, 20, 2, 2, 'gen');
    prop('bandstand', 26, 20, 3, 3, 'gen');
    rebuildCharm(props, false);
    expect(charmAt(24, 21).total).toBe(4);
  });
  it('the reaches are exact: a fountain at 5 counts and at 6 does not; a bandstand at 4 and 5; a bed at 3 and 4', () => {
    prop('fountain', 20, 20, 2, 2, 'gen');
    rebuildCharm(props, false);
    expect(charmAt(26, 20).total).toBe(2); // 5 east of x 21
    expect(charmAt(27, 20).total).toBe(0);
    emptyPark();
    prop('bandstand', 20, 20, 3, 3, 'gen');
    rebuildCharm(props, false);
    expect(charmAt(26, 21).total).toBe(2);
    expect(charmAt(27, 21).total).toBe(0);
    emptyPark();
    bed(20, 20);
    rebuildCharm(props, false);
    expect(charmAt(23, 20).total).toBe(1);
    expect(charmAt(24, 20).total).toBe(0);
  });
});

describe('charm.ts the cap is 6 for both numbers (08 2.2)', () => {
  it('bed + fountain + bandstand + lit lamp + busker (+9 raw): total 6, player 6', () => {
    bed(10, 20);
    prop('fountain', 12, 20, 2, 2, 'player');
    prop('bandstand', 12, 23, 3, 3, 'player');
    prop('lamp', 11, 21, 1, 1, 'player');
    setLiveSources((out) => out.push({ kind: 'busker', x: 11, y: 21, r: 8, amount: 3, player: true, until: 0 }));
    rebuildCharm(props, true);
    expect(charmAt(11, 21)).toEqual({ total: CHARM_CAP, player: CHARM_CAP });
  });
});

describe('charm.ts lamps count only when lit (08 2.2)', () => {
  it('the same lamp differs by 1 between unlit and lit; the rebuild clears the dirty flag', () => {
    prop('lamp', 20, 20, 1, 1, 'gen');
    rebuildCharm(props, false);
    const day = charmAt(21, 21).total;
    markCharmDirty();
    expect(charmDirty()).toBe(true);
    rebuildCharm(props, true);
    expect(charmDirty()).toBe(false);
    expect(charmAt(21, 21).total - day).toBe(1);
  });
});

describe('charm.ts river view is never player charm (08 2.2)', () => {
  it('a tile at y 5 reads total >= 1 and player 0; at y 6 the river gives 0', () => {
    rebuildCharm(props, false);
    expect(charmAt(20, 5)).toEqual({ total: 1, player: 0 });
    expect(charmAt(20, 6)).toEqual({ total: 0, player: 0 });
  });
});

describe('charm.ts dynamic sources at query time (03 6.7 item 4)', () => {
  it('petals above 0.2 give +2 player; a sunbeam +1 player; an added source until its end; a pair bonus needs the pairId', () => {
    rebuildCharm(props, false);
    PETALS[I(20, 20)] = 0.5;
    expect(charmAt(20, 20)).toEqual({ total: 2, player: 2 });
    PETALS[I(20, 20)] = 0.1;
    expect(charmAt(20, 20).total).toBe(0);
    addOverride({ kind: 'sunbeam', x: 20, y: 20, r: 3, until: 9, targets: {} });
    expect(charmAt(20, 20)).toEqual({ total: 1, player: 1 });
    const id = addSource({ kind: 'busker', x: 30, y: 30, r: 8, amount: 3, player: false, until: 0.6 });
    expect(id).toBeGreaterThan(0);
    expect(charmAt(25, 25)).toEqual({ total: 3, player: 0 });
    T.abs = 0.7;
    expect(charmAt(25, 25).total).toBe(0); // past its end
    removeSource(id);
    setPairCharm(4, 'boat', 0.9);
    expect(charmAt(40, 40, 4).total - charmAt(40, 40).total).toBe(4);
  });
});
