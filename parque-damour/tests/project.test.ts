// tests/project.test.ts
// Locks 03 7.1 and 08 2.9 (project.test.ts rows): the iso constants, fitCam on the 64 x 64 box, screenToTile(screenOf(x, y)) at four
// angles and three zooms, the apron allowance; and the camera that feeds the projection: quarter turns and the pinch pin the world
// point (GV 12142-12147, 11183-11204, 11308-11316), follow (GV 11292-11301), Fit (GV 12151-12153), the gestures of 03 8.1.
import { describe, it, expect, beforeEach } from 'vitest';
import { mulberry32 } from '../src/core/rng.ts';
import {
  BOX, CTR, EH, TH, TW, VANCH, ZMAX, ZMIN, ZOOM_START, cam, centreOn, clampCam, fitCam, fitToggle, focusY, follow, followStep, followed,
  keepCentre, pinching, screenToWorld, setAngle, setFollowLookup, setViewport, setupInput, stepCamera, turn, turnStep, view, viewCentreTile,
  type InputHandlers, type ToolClass,
} from '../src/render/camera.ts';
import { screenInto, screenOf, screenToTile } from '../src/render/project.ts';
import type { XY } from '../src/core/math.ts';

const QUARTERS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

function reset(z = ZOOM_START, ang = 0): void {
  setViewport(390, 844, 2);
  follow(null);
  setFollowLookup(() => false);
  cam.turnKeep = null;
  cam.free = false;
  setAngle(ang);
  cam.angT = ang;
  cam.z = z;
  centreOn(CTR, CTR);
}

describe('iso constants and fitCam (register 3.1; 03 7.1 items 1, 4, 5; 08 2.9)', () => {
  it('TW 26, TH 13, EH 26, VANCH 0.46, CTR 23.5, zoom 0.30 to 3.0, start zoom 1.3, a 64-tile box', () => {
    expect([TW, TH, EH, VANCH, CTR, ZMIN, ZMAX, ZOOM_START, BOX]).toEqual([26, 13, 26, 0.46, 23.5, 0.3, 3.0, 1.3, 64]);
  });
  it('fitCam keeps the zoom in [0.30, 3.0] and the park centre (23.5, 23.5) at the view anchor, at every quarter and viewport', () => {
    for (const [w, h] of [[390, 844], [1280, 800], [2560, 1600], [120, 160]] as const) {
      for (const a of [...QUARTERS, 0.7]) {
        setViewport(w, h, 2);
        setAngle(a);
        fitCam();
        expect(cam.z).toBeGreaterThanOrEqual(0.3);
        expect(cam.z).toBeLessThanOrEqual(3.0);
        const c = screenOf(CTR, CTR);
        expect(c.x).toBeCloseTo(w / 2, 6);
        expect(c.y).toBeCloseTo(h * VANCH, 6);
      }
    }
  });
  it('at 1280 x 800 the whole 64-tile box fits: every apron corner lands on the canvas', () => {
    setViewport(1280, 800, 1);
    for (const a of QUARTERS) {
      setAngle(a);
      fitCam();
      for (const [x, y] of [[-8.5, -8.5], [55.5, -8.5], [55.5, 55.5], [-8.5, 55.5]] as const) {
        const s = screenOf(x, y);
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(1280);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(800);
      }
    }
  });
  it('clampCam: the pan limit is max(240, 64 * TW * z * 0.56) px (the 64-tile box keeps it above 240 even at z 0.30)', () => {
    reset(2.4);
    cam.ox = 1e6;
    cam.oy = -1e6;
    clampCam();
    expect(cam.ox).toBeCloseTo(64 * 26 * 2.4 * 0.56, 9);
    expect(cam.oy).toBeCloseTo(-64 * 26 * 2.4 * 0.56, 9);
    reset(0.3);
    cam.ox = -1e6;
    clampCam();
    expect(cam.ox).toBeCloseTo(-279.552, 9);
  });
});

describe('screenToTile inverts screenOf (03 7.1 items 2 and 6; 08 2.9)', () => {
  it('at angles 0, pi/2, pi, 3pi/2 and zooms 0.30, 1.3, 2.4: 50 random tiles come back exactly', () => {
    const r = mulberry32(2029);
    for (const a of QUARTERS) {
      for (const z of [0.3, 1.3, 2.4]) {
        reset(z, a);
        cam.ox += (r() - 0.5) * 200; // a panned view, inside the clamp
        cam.oy += (r() - 0.5) * 200;
        clampCam();
        for (let k = 0; k < 50; k++) {
          const x = Math.floor(r() * 48), y = Math.floor(r() * 48);
          const s = screenOf(x, y);
          expect(screenToTile(s.x, s.y)).toEqual({ x, y });
        }
      }
    }
  });
  it('any point inside a tile picks that tile; the shared edge splits at the half', () => {
    const r = mulberry32(77);
    for (const a of [...QUARTERS, 0.7]) {
      for (const z of [0.3, 1.3, 2.4]) {
        reset(z, a);
        for (let k = 0; k < 50; k++) {
          const x = Math.floor(r() * 48), y = Math.floor(r() * 48);
          const fx = (r() - 0.5) * 0.98, fy = (r() - 0.5) * 0.98;
          const s = screenOf(x + fx, y + fy);
          expect(screenToTile(s.x, s.y)).toEqual({ x, y });
        }
      }
    }
    reset(1.3, 0);
    const lo = screenOf(10.499, 10), hi = screenOf(10.501, 10);
    expect(screenToTile(lo.x, lo.y)).toEqual({ x: 10, y: 10 });
    expect(screenToTile(hi.x, hi.y)).toEqual({ x: 11, y: 10 });
  });
  it('screenToWorld is the exact inverse of screenOf at any angle', () => {
    const r = mulberry32(5);
    for (const a of [0.3, 1.9, 4.1]) {
      reset(1.7, a);
      for (let k = 0; k < 20; k++) {
        const x = -8 + r() * 63, y = -8 + r() * 63;
        const s = screenOf(x, y);
        const w = screenToWorld(s.x, s.y);
        expect(w.x).toBeCloseTo(x, 9);
        expect(w.y).toBeCloseTo(y, 9);
      }
    }
  });
  it('outside the park is null; allowApron reaches 8 tiles beyond the boundary and no further', () => {
    for (const a of QUARTERS) {
      reset(0.3, a);
      for (const [x, y] of [[-1, 10], [48, 3], [20, -8], [55, 55], [-8, -8]] as const) {
        const s = screenOf(x, y);
        expect(screenToTile(s.x, s.y)).toBeNull();
        expect(screenToTile(s.x, s.y, true)).toEqual({ x, y });
      }
      for (const [x, y] of [[-9, 10], [56, 3], [20, -9]] as const) {
        const s = screenOf(x, y);
        expect(screenToTile(s.x, s.y, true)).toBeNull();
      }
    }
  });
  it('a height lifts the point by e * EH * z px; screenInto writes the same values without allocating', () => {
    reset(1.3, 0.4);
    const g = screenOf(12, 30), h = screenOf(12, 30, 0.9);
    expect(h.x).toBeCloseTo(g.x, 9);
    expect(g.y - h.y).toBeCloseTo(0.9 * 26 * 1.3, 9);
    const out: XY = { x: 0, y: 0 };
    expect(screenInto(12, 30, 0.9, out)).toBe(out);
    expect(out).toEqual(h);
  });
});

describe('quarter turns, Fit and the view centre (03 8.1 item 7; GV 6349-6356, 12142-12154, 10785)', () => {
  beforeEach(() => reset());
  it('turnStep eases a button turn by 1 - 0.0008^dt and snaps below 0.0015 rad', () => {
    turn(1);
    expect(cam.angT).toBeCloseTo(Math.PI / 2, 12);
    turnStep(1 / 60);
    expect(cam.ang).toBeCloseTo((Math.PI / 2) * (1 - Math.pow(0.0008, 1 / 60)), 12);
    cam.ang = cam.angT - 0.001;
    turnStep(1 / 60);
    expect(cam.ang).toBe(cam.angT);
  });
  it('a quarter turn pivots on the world point under the view anchor and keeps it there', () => {
    centreOn(10, 30);
    turn(1);
    for (let i = 0; i < 240; i++) {
      stepCamera(1 / 60);
      const p = screenOf(10, 30);
      expect(p.x).toBeCloseTo(195, 6);
      expect(p.y).toBeCloseTo(844 * VANCH, 6);
    }
    expect(cam.ang).toBe(Math.PI / 2);
    expect(cam.turnKeep).toBeNull();
    turn(-1);
    turn(-1);
    expect(cam.angT).toBeCloseTo(-Math.PI / 2, 12);
  });
  it('Fit: from a moved camera the whole box, from the fit view the start view (zoom 1.3 on the fountain)', () => {
    cam.free = true;
    follow({ kind: 'point', x: 5, y: 5 });
    expect(fitToggle()).toBe('whole');
    expect(cam.free).toBe(false);
    expect(cam.follow).toBe(0);
    expect(cam.z).toBeCloseTo(0.3, 9);
    expect(fitToggle()).toBe('start');
    expect(cam.free).toBe(true);
    expect(cam.z).toBe(1.3);
    const c = screenOf(CTR, CTR);
    expect(c.x).toBeCloseTo(195, 9);
    expect(c.y).toBeCloseTo(844 * VANCH, 9);
  });
  it('viewCentreTile is the tile under (cw/2, 0.45 * chh), clamped into the park', () => {
    for (const a of QUARTERS) {
      reset(1.3, a);
      centreOn(31, 12);
      const t = viewCentreTile();
      expect(screenToTile(195, 844 * 0.45)).toEqual(t);
      expect(Math.abs(t.x - 31) + Math.abs(t.y - 12)).toBeLessThanOrEqual(1);
    }
    reset(1.3, 0);
    centreOn(-6, -6);
    expect(viewCentreTile()).toEqual({ x: 0, y: 0 });
  });
});

describe('follow (GV 11280-11301; 09 row camera.ts: the FollowTarget union)', () => {
  beforeEach(() => reset());
  it('eases the target to (cw/2, focusY()) by k = 1 - 0.02^dt; with no DOM the band is chh * 0.46', () => {
    expect(focusY()).toBeCloseTo(844 * 0.46, 9);
    follow({ kind: 'point', x: 14, y: 33 });
    expect(cam.follow).toBe(-1);
    expect(cam.free).toBe(true);
    const p0 = screenOf(14, 33);
    followStep(1 / 60);
    const p1 = screenOf(14, 33);
    const k = 1 - Math.pow(0.02, 1 / 60);
    expect(p1.x - p0.x).toBeCloseTo((195 - p0.x) * k, 6);
    for (let i = 0; i < 240; i++) followStep(1 / 60);
    const p = screenOf(14, 33);
    expect(p.x).toBeCloseTo(195, 3);
    expect(p.y).toBeCloseTo(focusY(), 3);
  });
  it('a visitor or creature is found through the lookup, at its height; gone means the follow ends', () => {
    let alive = true;
    setFollowLookup((kind, id, out) => {
      if (kind !== 'creature' || id !== 7 || !alive) return false;
      out.x = 30;
      out.y = 20;
      out.e = 1.5;
      return true;
    });
    follow({ kind: 'creature', id: 7 });
    expect(cam.follow).toBe(7);
    for (let i = 0; i < 300; i++) followStep(1 / 60);
    const p = screenOf(30, 20, 1.5);
    expect(p.x).toBeCloseTo(195, 3);
    expect(p.y).toBeCloseTo(focusY(), 3);
    alive = false;
    followStep(1 / 60);
    expect(cam.follow).toBe(0);
    expect(followed()).toBeNull();
    follow({ kind: 'visitor', id: 3 });
    followStep(1 / 60);
    expect(cam.follow).toBe(0);
  });
  it('cam.follow = 0 written elsewhere (Fit, New) ends the follow on the next step', () => {
    follow({ kind: 'point', x: 1, y: 1 });
    cam.follow = 0;
    const ox = cam.ox;
    followStep(1 / 60);
    expect(cam.ox).toBe(ox);
    expect(followed()).toBeNull();
  });
  it('following drops a turn pivot (the follow keeps the subject centred instead)', () => {
    turn(1);
    expect(cam.turnKeep).not.toBeNull();
    follow({ kind: 'point', x: 20, y: 20 });
    expect(cam.turnKeep).toBeNull();
    cam.turnKeep = { x: 1, y: 1, pinch: false };
    keepCentre();
    expect(cam.turnKeep).toBeNull();
  });
});

type Listener = (e: unknown) => void;
function fakeCanvas(left = 0, top = 0) {
  const ls = new Map<string, Listener>();
  const el = {
    addEventListener: (type: string, fn: Listener) => void ls.set(type, fn),
    setPointerCapture: () => undefined,
    getBoundingClientRect: () => ({ left, top, width: 390, height: 844 }),
  };
  const fire = (type: string, id: number, x: number, y: number, t: number): void =>
    ls.get(type)?.({ pointerId: id, clientX: x + left, clientY: y + top, timeStamp: t });
  let prevented = 0;
  const wheel = (deltaY: number): void => ls.get('wheel')?.({ deltaY, preventDefault: () => void prevented++ });
  return { el: el as unknown as HTMLCanvasElement, fire, wheel, prevented: () => prevented, has: (t: string) => ls.has(t) };
}
function wire(cls: ToolClass, left = 0, top = 0) {
  const taps: XY[] = [], paints: XY[] = [];
  let strokes = 0;
  const h: InputHandlers = {
    onTap: (sx, sy) => void taps.push({ x: sx, y: sy }),
    toolClass: () => cls,
    onStrokeStart: () => void strokes++,
    onPaint: (t) => void paints.push(t),
  };
  const c = fakeCanvas(left, top);
  setupInput(c.el, h);
  return { ...c, taps, paints, strokes: () => strokes };
}

/** A finger on the circle of radius 50 around (195, 400). */
const at = (a: number): XY => ({ x: 195 + 50 * Math.cos(a), y: 400 + 50 * Math.sin(a) });

describe('gestures (03 8.1; GV 11168-11230)', () => {
  beforeEach(() => reset());
  it('a tap is under 9 px and under 420 ms, in canvas coordinates; a long press, a drag or a cancel is not', () => {
    const c = wire('hand', 10, 20);
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel']) expect(c.has(t)).toBe(true);
    c.fire('pointerdown', 1, 100, 200, 1000);
    c.fire('pointermove', 1, 104, 203, 1100);
    c.fire('pointerup', 1, 104, 203, 1300);
    expect(c.taps).toEqual([{ x: 100, y: 200 }]);
    c.fire('pointerdown', 1, 100, 200, 2000);
    c.fire('pointerup', 1, 100, 200, 2420);
    c.fire('pointerdown', 1, 100, 200, 3000);
    c.fire('pointercancel', 1, 100, 200, 3050);
    expect(c.taps).toHaveLength(1);
  });
  it('the hand pans 1:1, frees the camera and drops the follow; the moved finger is no tap', () => {
    const c = wire('hand');
    follow({ kind: 'point', x: 5, y: 5 });
    const ox = cam.ox, oy = cam.oy;
    c.fire('pointerdown', 1, 100, 200, 0);
    c.fire('pointermove', 1, 106, 200, 10);
    c.fire('pointermove', 1, 112, 195, 20);
    c.fire('pointerup', 1, 112, 195, 30);
    expect(cam.ox - ox).toBeCloseTo(12, 9);
    expect(cam.oy - oy).toBeCloseTo(-5, 9);
    expect(cam.free).toBe(true);
    expect(cam.follow).toBe(0);
    expect(c.taps).toHaveLength(0);
  });
  it('a brush paints on down, then after 0.14 s, then every 0.10 s; it never taps or pans', () => {
    const c = wire('brush');
    const s = screenOf(20, 20), ox = cam.ox;
    c.fire('pointerdown', 1, s.x, s.y, 1000);
    expect(c.strokes()).toBe(1);
    expect(c.paints).toEqual([{ x: 20, y: 20 }]);
    for (const t of [1050, 1139]) c.fire('pointermove', 1, s.x + 1, s.y, t);
    expect(c.paints).toHaveLength(1);
    c.fire('pointermove', 1, s.x + 2, s.y, 1140);
    expect(c.paints).toHaveLength(2);
    c.fire('pointermove', 1, s.x + 2, s.y, 1239);
    expect(c.paints).toHaveLength(2);
    c.fire('pointermove', 1, s.x + 3, s.y, 1240);
    expect(c.paints).toHaveLength(3);
    c.fire('pointerup', 1, s.x + 3, s.y, 1250);
    expect(c.taps).toHaveLength(0);
    expect(cam.ox).toBe(ox);
  });
  it('a fast brush drag fills its gaps: a sample over one tile from the last painted centre paints the line to it (owner 2026-10-13)', () => {
    const c = wire('brush');
    const s0 = screenOf(10, 20), s1 = screenOf(16, 22), s2 = screenOf(17, 22), s3 = screenOf(17, 20);
    c.fire('pointerdown', 1, s0.x, s0.y, 1000);
    c.fire('pointermove', 1, s1.x, s1.y, 1140); // 6 tiles on in one sample: (11, 20) .. (16, 22) in Bresenham order
    expect(c.paints).toEqual([
      { x: 10, y: 20 }, { x: 11, y: 20 }, { x: 12, y: 21 }, { x: 13, y: 21 }, { x: 14, y: 21 }, { x: 15, y: 22 }, { x: 16, y: 22 },
    ]);
    c.fire('pointermove', 1, s2.x, s2.y, 1240); // a neighbour: the sample alone
    expect(c.paints.slice(7)).toEqual([{ x: 17, y: 22 }]);
    c.fire('pointermove', 1, s3.x, s3.y, 1340); // two tiles north: the tile between, then the sample
    expect(c.paints.slice(8)).toEqual([{ x: 17, y: 21 }, { x: 17, y: 20 }]);
    c.fire('pointerup', 1, s3.x, s3.y, 1350);
    expect(c.strokes()).toBe(1);
    // a new gesture starts its line afresh: no line from the last stroke's centre
    const s4 = screenOf(30, 30);
    c.fire('pointerdown', 1, s4.x, s4.y, 2000);
    expect(c.paints.slice(10)).toEqual([{ x: 30, y: 30 }]);
    c.fire('pointerup', 1, s4.x, s4.y, 2010);
  });
  it('a stamp or ability tool waits for the tap and never pans or paints', () => {
    const c = wire('other');
    const ox = cam.ox;
    c.fire('pointerdown', 1, 150, 300, 0);
    c.fire('pointermove', 1, 152, 301, 50);
    c.fire('pointerup', 1, 152, 301, 100);
    expect(c.taps).toEqual([{ x: 150, y: 300 }]);
    expect(c.paints).toHaveLength(0);
    expect(cam.ox).toBe(ox);
  });
  it('a pinch zooms by the finger distance within [0.30, 3.0] and keeps the ground under the fingers', () => {
    const c = wire('hand');
    c.fire('pointerdown', 1, 145, 400, 0);
    c.fire('pointerdown', 2, 245, 400, 10);
    expect(pinching()).toBe(true);
    const w = screenToWorld(195, 400);
    c.fire('pointermove', 2, 295, 400, 20); // distance 100 -> 150, midpoint 195 -> 220
    expect(cam.z).toBeCloseTo(1.3 * 1.5, 9);
    const p = screenOf(w.x, w.y);
    expect(p.x).toBeCloseTo(220, 6);
    expect(p.y).toBeCloseTo(400, 6);
    c.fire('pointermove', 2, 1145, 400, 30); // far apart: clamped to 3.0
    expect(cam.z).toBe(3);
    c.fire('pointermove', 2, 155, 400, 40); // 10 px apart: clamped to 0.30
    expect(cam.z).toBe(0.3);
    c.fire('pointerup', 2, 155, 400, 50);
    c.fire('pointerup', 1, 145, 400, 60);
    expect(pinching()).toBe(false);
    expect(c.taps).toHaveLength(0);
  });
  it('a twist turns the park only past the 0.06 rad dead zone, without a jump, and the pinned point holds through the ease', () => {
    const c = wire('hand');
    const p1 = at(Math.PI), p2 = at(0);
    c.fire('pointerdown', 1, p1.x, p1.y, 0);
    c.fire('pointerdown', 2, p2.x, p2.y, 5);
    const w = screenToWorld(195, 400);
    const twist = (a: number, t: number): void => {
      const q1 = at(Math.PI + a), q2 = at(a);
      c.fire('pointermove', 1, q1.x, q1.y, t);
      c.fire('pointermove', 2, q2.x, q2.y, t + 1);
    };
    twist(0.02, 10);
    twist(0.04, 20);
    expect(cam.angT).toBe(0); // inside the dead zone
    twist(0.07, 30); // past it: the target starts from here, no jump
    expect(cam.angT).toBeCloseTo(0, 9);
    twist(0.57, 40);
    expect(cam.angT).toBeCloseTo(0.5, 9);
    for (let i = 0; i < 10; i++) stepCamera(1 / 60); // pinch easing 1 - 0.00002^dt
    c.fire('pointerup', 2, 0, 0, 50);
    c.fire('pointerup', 1, 0, 0, 51);
    for (let i = 0; i < 120; i++) stepCamera(1 / 60);
    expect(cam.ang).toBe(cam.angT);
    const p = screenOf(w.x, w.y);
    expect(p.x).toBeCloseTo(195, 6);
    expect(p.y).toBeCloseTo(400, 6);
    expect(cam.turnKeep).toBeNull();
  });
  it('the wheel zooms x1.12 in and x0.89 out, keeps the follow and prevents the page scroll', () => {
    const c = wire('hand');
    follow({ kind: 'point', x: 5, y: 5 });
    c.wheel(-1);
    expect(cam.z).toBeCloseTo(1.3 * 1.12, 12);
    c.wheel(1);
    expect(cam.z).toBeCloseTo(1.3 * 1.12 * 0.89, 12);
    expect(cam.follow).toBe(-1);
    expect(c.prevented()).toBe(2);
    expect(view.cw).toBe(390);
  });
});
