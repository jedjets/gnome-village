// tests/camera.test.ts
// Locks 03 7.1: the iso constants, fitCam on the park plus apron, clampCam, the projection and its inverse; and 02 8.2's brush row: the
// line a drag fills between two samples (owner 2026-10-13).
import { describe, it, expect } from 'vitest';
import {
  TW, TH, EH, VANCH, CTR, ZMIN, ZMAX, cam, view, setViewport, setAngle, fitCam, clampCam, turn, apronBox, rotXY, invRot, centreOn, lineTiles,
} from '../src/render/camera.ts';
import { screenOf, screenToTile, sxOf, syOf } from '../src/render/project.ts';

describe('iso constants (register 3.1)', () => {
  it('TW 26, TH 13, EH 26, VANCH 0.46, CTR 23.5, zoom 0.30-3.0', () => {
    expect([TW, TH, EH, VANCH, CTR, ZMIN, ZMAX]).toEqual([26, 13, 26, 0.46, 23.5, 0.3, 3.0]);
  });
});

describe('fitCam (03 7.1 item 4)', () => {
  it('the apron box at angle 0 is 64 x 64 tiles projected at zoom 1', () => {
    setAngle(0);
    const b = apronBox();
    expect(b.b - b.a).toBeCloseTo(64 * TW, 6);
    expect(b.d - b.c).toBeCloseTo(64 * TH, 6);
    expect((b.a + b.b) / 2).toBeCloseTo(0, 6);
    expect((b.c + b.d) / 2).toBeCloseTo(0, 6);
  });
  it('on a 390 x 844 phone the fit zoom clamps to the floor 0.30 and centres on the park', () => {
    setViewport(390, 844, 2);
    setAngle(0);
    cam.angT = 0;
    fitCam();
    expect(cam.z).toBeCloseTo(0.3, 9);
    expect(cam.fitZ).toBeCloseTo(0.3, 9);
    expect(cam.ox).toBeCloseTo(0, 6);
    expect(cam.oy).toBeCloseTo(0, 6);
    const c = screenOf(CTR, CTR);
    expect(c.x).toBeCloseTo(195, 6);
    expect(c.y).toBeCloseTo(844 * VANCH, 6);
  });
  it('on a 1280 x 800 desktop the height rules: z = 800 * 0.58 / 832', () => {
    setViewport(1280, 800, 1);
    setAngle(0);
    fitCam();
    expect(cam.z).toBeCloseTo((800 * 0.58) / (64 * TH), 9);
  });
  it('an eighth turn shrinks the box by root 2 in both axes; the fit still keeps the park centred', () => {
    setViewport(390, 844, 2);
    setAngle(Math.PI / 4);
    fitCam();
    const b = apronBox();
    expect(b.b - b.a).toBeCloseTo((64 * TW) / Math.SQRT2, 6);
    expect(b.d - b.c).toBeCloseTo((64 * TH) / Math.SQRT2, 6);
    const c = screenOf(CTR, CTR);
    expect(c.x).toBeCloseTo(195, 6);
  });
});

describe('clampCam and turn', () => {
  it('zoom is clamped to [0.30, 3.0] and the pan to the apron limit', () => {
    setViewport(390, 844, 2);
    cam.z = 10;
    clampCam();
    expect(cam.z).toBe(3);
    cam.z = 0.01;
    clampCam();
    expect(cam.z).toBe(0.3);
    cam.ox = 1e6;
    cam.oy = -1e6;
    clampCam();
    const lim = Math.max(240, 64 * TW * cam.z * 0.56);
    expect(cam.ox).toBeCloseTo(lim, 6);
    expect(cam.oy).toBeCloseTo(-lim, 6);
  });
  it('turn asks for the next quarter in either direction', () => {
    cam.angT = 0;
    turn(1);
    expect(cam.angT).toBeCloseTo(Math.PI / 2, 9);
    turn(1);
    expect(cam.angT).toBeCloseTo(Math.PI, 9);
    turn(-1);
    turn(-1);
    turn(-1);
    expect(cam.angT).toBeCloseTo(-Math.PI / 2, 9);
  });
});

describe('projection and its inverse (03 7.1 items 2 and 6)', () => {
  it('sxOf and syOf follow the formulas at zoom 1 with no offset', () => {
    setViewport(390, 844, 2);
    setAngle(0);
    cam.z = 1;
    cam.ox = 0;
    cam.oy = 0;
    expect(sxOf(10, 4)).toBeCloseTo(195 + 6 * 13, 9);
    expect(syOf(10, 4, 0)).toBeCloseTo(844 * 0.46 + (14 - 47) * 6.5, 9);
    expect(syOf(10, 4, 1)).toBeCloseTo(844 * 0.46 + (14 - 47) * 6.5 - 26, 9);
  });
  it('rotXY and invRot are inverses', () => {
    setAngle(0.7);
    const r = rotXY(3, 40);
    const w = invRot(r.x, r.y);
    expect(w.x).toBeCloseTo(3, 9);
    expect(w.y).toBeCloseTo(40, 9);
  });
  it('screenToTile(screenOf(x, y)) returns the tile at three angles and two zooms', () => {
    setViewport(390, 844, 2);
    for (const ang of [0, Math.PI / 2, 0.7]) {
      setAngle(ang);
      for (const z of [0.3, 1.6]) {
        cam.z = z;
        centreOn(CTR, CTR);
        for (const [x, y] of [[0, 0], [47, 47], [12, 30], [23, 23], [47, 0]] as const) {
          const s = screenOf(x, y);
          expect(screenToTile(s.x, s.y)).toEqual({ x, y });
        }
      }
    }
  });
  it('outside the park is null unless the apron is allowed', () => {
    setViewport(390, 844, 2);
    setAngle(0);
    cam.z = 1;
    centreOn(CTR, CTR);
    const s = screenOf(-3, 10);
    expect(screenToTile(s.x, s.y)).toBeNull();
    expect(screenToTile(s.x, s.y, true)).toEqual({ x: -3, y: 10 });
    const far = screenOf(-20, 10);
    expect(screenToTile(far.x, far.y, true)).toBeNull();
  });
  it('view holds the viewport the tests set', () => {
    setViewport(390, 844, 2);
    expect(view).toEqual({ cw: 390, chh: 844, dpr: 2 });
  });
});

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('lineTiles: a brush drag fills its gaps (02 8.2 brush row; owner 2026-10-13)', () => {
  it('a row, a column and a diagonal: every centre after the start, in order, the end included', () => {
    expect(lineTiles({ x: 2, y: 5 }, { x: 6, y: 5 })).toEqual([3, 4, 5, 6].map((x) => ({ x, y: 5 })));
    expect(lineTiles({ x: 4, y: 9 }, { x: 4, y: 6 })).toEqual([8, 7, 6].map((y) => ({ x: 4, y })));
    expect(lineTiles({ x: 0, y: 0 }, { x: 3, y: -3 })).toEqual([1, 2, 3].map((k) => ({ x: k, y: -k })));
  });
  it('a shallow line in Bresenham order: (0, 0) to (6, 2)', () => {
    expect(lineTiles({ x: 0, y: 0 }, { x: 6, y: 2 })).toEqual([
      { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 2 }, { x: 6, y: 2 },
    ]);
  });
  it('in every octant: max(|dx|, |dy|) centres, each an 8-neighbour of the one before, ending on b; none when a is b', () => {
    expect(lineTiles({ x: 7, y: 7 }, { x: 7, y: 7 })).toEqual([]);
    const a = { x: 20, y: 20 };
    for (let dx = -9; dx <= 9; dx++)
      for (let dy = -9; dy <= 9; dy++) {
        const b = { x: a.x + dx, y: a.y + dy }, line = lineTiles(a, b);
        expect(line.length).toBe(Math.max(Math.abs(dx), Math.abs(dy)));
        let prev = a;
        for (const c of line) {
          expect(cheb(prev, c)).toBe(1);
          prev = c;
        }
        if (line.length) expect(line[line.length - 1]).toEqual(b);
      }
  });
});
