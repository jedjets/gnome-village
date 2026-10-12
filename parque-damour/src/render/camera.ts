// src/render/camera.ts
// Camera state, the viewport, the projection the gestures pin with, rotation about the park centre, quarter turns, Fit, the pan clamp,
// the gestures and camera follow (03 7.1, 8.1, 8.3). Taps and paints go to the handlers; nothing here reads or writes sim state.
// Ported from GV 6331-6358 (cam, resize, setAngle, rotXY, invRot, rotVec, turnStep), 6382-6383 (sxOf, syOf), 6400-6416 (fitCam,
// clampCam), 11164-11230 (ptrs, setupInput), 11280-11322 (followAlive, focusY, followStep, screenCentreWorld, keepCentre, centreOn),
// 12142-12154 (quarter turns, Fit).
// Verdict: PORT. Changes: CTR 23.5 (GV 35.5); the fit box is the park plus the 8-tile apron, 64 x 64 tiles (GV landBox 6385 fitted
// land); the zoom floor is the register's 0.30 in fitCam, clampCam and the pinch (GV min(0.30, fitZ * 0.85) at 6410 and 11198); syOf has
// no SEAS term (flat ground, e = 0); screen to world is the closed form of 03 7.1 item 6, so a pinch and a quarter turn pin the exact
// world point under the fingers or the view centre (GV pinned a tile centre and fell back to a plain zoom off the land, 11206); taps and
// paints go to InputHandlers by tool class (03 8.1 items 2 and 5): a brush paints on down and never taps, and pointercancel never taps;
// the tap clock and the drag-paint throttle use each event's own timeStamp (GV read the wall clock at 11173 and counted paintCool down
// in the frame, 12075); follow takes the FollowTarget union and a lookup (GV duck-typed 11292); the pivot is released once the angle
// equals its target, so the final sub-0.0015 rad snap is pinned too (GV released it one frame early, 11315: a hop of up to half a
// pixel); focusY measures the DOM on a 0.35 s cadence (review 13); cam.follow is the followed id (0 none, -1 a point); Fit's second
// press returns to the start view of 04 5.1 (zoom 1.3 on the fountain) where GV used its own start zoom clamp(max(fitZ * 2.6, 1.15),
// 0.9, 1.6) (12152).
// Dropped from the range: landBox 6385-6399 (the land test), the fitZ * 0.85 floor (6410), tileOrder and the coarse lattice 6359-6381
// (order.ts sorts drawables), projectVerts and the quad walk 6417-6443 (09 section 3), pinchWorld (dead, 11166), the spring tool and the
// terrain stroke (11176, 11212), tapSelect and the flyer box (11231-11250; project.ts pickAt), the flyer, boat and rabbit heights of
// followStep (11294-11296), the toasts of Fit (the rail toasts through t()).
import { clamp, TAU, type XY } from '../core/math.ts';
import { N } from '../world/grid.ts';
import { APRON } from '../world/park.ts';

export const TW = 26;
export const TH = 13;
export const EH = 26;
export const VANCH = 0.46;
export const CTR = (N - 1) / 2; // 23.5
export const ZMIN = 0.3;
export const ZMAX = 3.0;
/** The default zoom: a new park opens here, centred on the fountain at (23.5, 23.5) (04 5.1). */
export const ZOOM_START = 1.3;
/** Tiles along each side of the fit box: the park plus the apron (register 3.1, 03 7.1 item 4). */
export const BOX = N + 2 * APRON; // 64

/** The world point a turn or a pinch keeps still on screen; sx, sy default to the view anchor (cw/2, chh * VANCH) (GV 11313). */
export type TurnKeep = { x: number; y: number; sx?: number; sy?: number; pinch: boolean };
export type Cam = {
  ox: number;
  oy: number;
  z: number;
  fitZ: number;
  ang: number;
  angT: number;
  follow: number; // the followed id while following (-1 for a point), 0 none; set through follow()
  free: boolean; // true once the player has moved the camera (or it follows something)
  turnKeep: TurnKeep | null;
};
export const cam: Cam = { ox: 0, oy: 0, z: 0.8, fitZ: 0.8, ang: 0, angT: 0, follow: 0, free: false, turnKeep: null };

/** CSS pixel size of the canvas and the capped device pixel ratio (GV 6331, 6336). */
export const view = { cw: 390, chh: 844, dpr: 1 };

let rotC = 1;
let rotS = 0;

/* Gesture state (GV 11165-11166) and the cached follow band; module state of the render side only. */
type Pinch = {
  d: number; // finger distance at the start
  z: number; // zoom at the start
  mx: number;
  my: number;
  a0: number; // finger angle at the start
  ang0: number; // camera angle at the start
  twist: number; // radians the fingers have turned through, summed (the dead zone test)
  lastDa: number;
  live: boolean; // past the dead zone
  base: number; // the twist at which it went live, so the turn starts without a jump
};
type Down = { x: number; y: number; t: number; moved: number; cls: 'hand' | 'brush' | 'other' };
const ptrs = new Map<number, XY>();
let dragging = false;
let pinch: Pinch | null = null;
let down: Down | null = null;
let paintNext = 0; // event time in ms from which the next drag paint may land
let originX = 0; // canvas client offset, read once per gesture
let originY = 0;
const wired = new WeakSet<HTMLCanvasElement>();
let bandY = 0;
let bandAge = Infinity; // frame seconds since focusY last measured the DOM

export function setAngle(a: number): void {
  cam.ang = a;
  rotC = Math.cos(a);
  rotS = Math.sin(a);
}

/** World to rotated world, about the park centre (GV 6346). */
export function rotXY(x: number, y: number): XY {
  const dx = x - CTR, dy = y - CTR;
  return { x: CTR + dx * rotC - dy * rotS, y: CTR + dx * rotS + dy * rotC };
}
/** Same as rotXY without allocating: writes into `out` and returns it. */
export function rotInto(x: number, y: number, out: XY): XY {
  const dx = x - CTR, dy = y - CTR;
  out.x = CTR + dx * rotC - dy * rotS;
  out.y = CTR + dx * rotS + dy * rotC;
  return out;
}
/** Rotated world back to world (GV 6347). */
export function invRot(rx: number, ry: number): XY {
  const dx = rx - CTR, dy = ry - CTR;
  return { x: CTR + dx * rotC + dy * rotS, y: CTR - dx * rotS + dy * rotC };
}
export function rotVec(gx: number, gy: number): XY {
  return { x: gx * rotC - gy * rotS, y: gx * rotS + gy * rotC };
}

/** Screen x of a rotated world point (GV 6382; 03 7.1 item 2). */
export function sxOf(rx: number, ry: number): number {
  return view.cw / 2 + (rx - ry) * (TW / 2) * cam.z + cam.ox;
}
/** Screen y of a rotated world point at height e in EH units; the ground is flat, so no SEAS term (GV 6383; 03 7.1 item 2). */
export function syOf(rx: number, ry: number, e = 0): number {
  return view.chh * VANCH + (rx + ry - (N - 1)) * (TH / 2) * cam.z - e * EH * cam.z + cam.oy;
}

/**
 * The world point on the ground under a screen point: the closed-form inverse of sxOf and syOf (03 7.1 item 6). Defined for every
 * screen point; writes into `out` when given, so a hit test allocates nothing.
 */
export function screenToWorld(sx: number, sy: number, out: XY = { x: 0, y: 0 }): XY {
  const u = (sx - view.cw / 2 - cam.ox) / ((TW / 2) * cam.z);
  const v = (sy - view.chh * VANCH - cam.oy) / ((TH / 2) * cam.z) + (N - 1);
  const dx = (u + v) / 2 - CTR, dy = (v - u) / 2 - CTR;
  out.x = CTR + dx * rotC + dy * rotS;
  out.y = CTR - dx * rotS + dy * rotC;
  return out;
}

/** Ease the angle toward the target: a button turn over half a second, a finger twist within a tenth (GV 6349-6356). */
export function turnStep(dt: number): void {
  const d = cam.angT - cam.ang;
  if (Math.abs(d) < 0.0015) {
    if (d !== 0) setAngle(cam.angT);
    return;
  }
  setAngle(cam.ang + d * (1 - Math.pow(pinch ? 0.00002 : 0.0008, dt)));
}

/** Ask for the next quarter turn and keep what is in the middle of the screen in the middle (GV 12142-12147). */
export function turn(dir: -1 | 1): void {
  const mid = viewCentreWorld();
  const q = Math.PI / 2, cur = cam.angT;
  cam.angT = dir > 0 ? Math.floor(cur / q + 1e-4 + 1) * q : Math.ceil(cur / q - 1e-4 - 1) * q;
  cam.turnKeep = { x: mid.x, y: mid.y, pinch: false };
}

export function setViewport(cw: number, chh: number, dpr: number): void {
  view.cw = cw;
  view.chh = chh;
  view.dpr = dpr;
  bandAge = Infinity;
}

let boundCanvas: HTMLCanvasElement | null = null;

/**
 * Size the canvas (the one given, else the one bound by an earlier call or by setupInput) to the window at a dpr capped at 2, then refit
 * an unmoved camera or clamp a moved one (GV 6335-6340).
 */
export function resize(canvas?: HTMLCanvasElement): void {
  if (canvas) boundCanvas = canvas;
  setViewport(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
  if (boundCanvas) {
    boundCanvas.width = Math.round(view.cw * view.dpr);
    boundCanvas.height = Math.round(view.chh * view.dpr);
  }
  if (!cam.free) fitCam();
  else clampCam();
}

/** Screen-space box (zoom 1, no offset) of the park plus apron rotated by the current angle (03 7.1 item 4; GV landBox 6385). */
export function apronBox(): { a: number; b: number; c: number; d: number } {
  const lo = -APRON - 0.5, hi = N + APRON - 0.5;
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let k = 0; k < 4; k++) {
    const x = k === 1 || k === 2 ? hi : lo, y = k >= 2 ? hi : lo;
    const dx = x - CTR, dy = y - CTR;
    const rx = CTR + dx * rotC - dy * rotS, ry = CTR + dx * rotS + dy * rotC;
    const u = (rx - ry) * (TW / 2);
    const v = (rx + ry - (N - 1)) * (TH / 2);
    if (u < a) a = u;
    if (u > b) b = u;
    if (v < c) c = v;
    if (v > d) d = v;
  }
  return { a, b, c, d };
}

/**
 * Frame the park plus apron and centre on the park (GV 6400-6408 with the 64 x 64 box and the floor 0.30); then, when the box is shorter
 * than the screen below it, lower it until its near corner sits 12 px above the highest bottom overlay (the rail), so the sky and the
 * skyline fill the top instead of an empty city haze filling the bottom (a deviation from 03 7.1 item 4's centring; S2 hand-back).
 */
export function fitCam(): void {
  const L = apronBox();
  const availW = Math.max(120, view.cw - 18), availH = Math.max(160, view.chh * 0.58);
  cam.z = clamp(Math.min((availW * 1.16) / Math.max(1, L.b - L.a), availH / Math.max(1, L.d - L.c)), ZMIN, ZMAX);
  cam.ox = -((L.a + L.b) / 2) * cam.z;
  cam.oy = -((L.c + L.d) / 2) * cam.z;
  const bot = bandEdges().bot, near = view.chh * VANCH + L.d * cam.z + cam.oy;
  if (bot < view.chh && near < bot - 12) cam.oy += bot - 12 - near;
  cam.fitZ = cam.z;
  clampCam();
}

/** Keep the zoom in [0.30, 3.0] and the pan within max(240, 64 * TW * z * 0.56) px (GV 6409-6414; 03 7.1 item 5). */
export function clampCam(): void {
  cam.z = clamp(cam.z, ZMIN, ZMAX);
  const lim = Math.max(240, BOX * TW * cam.z * 0.56);
  cam.ox = clamp(cam.ox, -lim, lim);
  cam.oy = clamp(cam.oy, -lim, lim);
}

/** Put world (x, y) on the ground at the view anchor (cw/2, chh * VANCH) (GV 11317-11321). */
export function centreOn(x: number, y: number): void {
  pinAt(x, y, view.cw / 2, view.chh * VANCH);
}

/** Pan so world (x, y) on the ground lands on screen (sx, sy), then clamp. */
function pinAt(x: number, y: number, sx: number, sy: number): void {
  const dx = x - CTR, dy = y - CTR;
  const rx = CTR + dx * rotC - dy * rotS, ry = CTR + dx * rotS + dy * rotC;
  cam.ox = sx - view.cw / 2 - (rx - ry) * (TW / 2) * cam.z;
  cam.oy = sy - view.chh * VANCH - (rx + ry - (N - 1)) * (TH / 2) * cam.z;
  clampCam();
}

/** Hold the turn's pivot (or the pinch's world point) still on screen while the angle eases (GV 11308-11316). */
export function keepCentre(): void {
  const m = cam.turnKeep;
  if (!m) return;
  if (cam.follow !== 0) {
    cam.turnKeep = null;
    return;
  }
  pinAt(m.x, m.y, m.sx ?? view.cw / 2, m.sy ?? view.chh * VANCH);
  if (cam.ang === cam.angT && !(m.pinch && pinch)) cam.turnKeep = null; // after the final snap, so the snap is pinned too
}

/** Fit (GV 12151-12153): from a moved camera, the whole park and apron; from the fit view, back to the start view of 04 5.1. */
export function fitToggle(): 'whole' | 'start' {
  if (cam.free) {
    follow(null);
    cam.free = false;
    fitCam();
    return 'whole';
  }
  cam.z = ZOOM_START;
  cam.free = true;
  centreOn(CTR, CTR);
  return 'start';
}

/* ---------- follow (GV 11280-11303) ---------- */

/** What the camera can follow: a visitor or a creature by id, or a fixed point such as an event's place (09 row camera.ts). */
export type FollowTarget = { kind: 'visitor' | 'creature'; id: number } | { kind: 'point'; x: number; y: number };
/** Where a followed actor is drawn: ground point and height in EH units (a flying pigeon's z). */
export type FollowPos = { x: number; y: number; e: number };
/** Finds a visitor or creature by id and writes its position into `out`; false when it is gone (GV followAlive 11280). */
export type FollowLookup = (kind: 'visitor' | 'creature', id: number, out: FollowPos) => boolean;

let followTarget: FollowTarget | null = null;
let lookup: FollowLookup = () => false;
const fpos: FollowPos = { x: 0, y: 0, e: 0 };

/** Install the actor lookup (S4 wires the visitor and creature lists); until then only points can be followed. */
export function setFollowLookup(fn: FollowLookup): void {
  lookup = fn;
}

/** Follow a target, or stop following with null. Following frees the camera from the fit view (GV selectGnome 10869). */
export function follow(target: FollowTarget | null): void {
  followTarget = target;
  if (!target) {
    cam.follow = 0;
    return;
  }
  cam.follow = target.kind === 'point' ? -1 : target.id;
  cam.free = true;
  cam.turnKeep = null;
}

/** The current follow target, or null (a write of cam.follow = 0 elsewhere ends it on the next followStep). */
export function followed(): FollowTarget | null {
  return cam.follow === 0 ? null : followTarget;
}

function resolve(t: FollowTarget, out: FollowPos): boolean {
  if (t.kind === 'point') {
    out.x = t.x;
    out.y = t.y;
    out.e = 0;
    return true;
  }
  return lookup(t.kind, t.id, out);
}

/** Ease the followed thing to the middle of the clear band of the screen, k = 1 - 0.02^dt (GV 11292-11301). */
export function followStep(dt: number): void {
  bandAge += dt;
  const t = followTarget;
  if (cam.follow === 0 || !t || !resolve(t, fpos)) {
    follow(null);
    return;
  }
  const dx = fpos.x - CTR, dy = fpos.y - CTR;
  const rx = CTR + dx * rotC - dy * rotS, ry = CTR + dx * rotS + dy * rotC;
  const k = 1 - Math.pow(0.02, dt);
  cam.ox += (view.cw / 2 - sxOf(rx, ry)) * k;
  cam.oy += (focusY() - syOf(rx, ry, fpos.e)) * k;
  clampCam();
}

const BAND_TOP = ['hudClock', 'hudR', 'feed'] as const;
const BAND_BOTTOM = ['card', 'hint', 'census', 'romances', 'progress', 'evlog', 'picker', 'options', 'snd', 'rail'] as const;

/**
 * The screen y a followed subject sits at: the clear band between the top chips and feed line and the highest bottom overlay showing,
 * 0.46 of the way down, clamped to [100, chh / 2] (GV 11282-11290). Measured at most every 0.35 s of frame time (review 13).
 */
export function focusY(): number {
  if (bandAge >= 0.35) {
    bandY = measureBand();
    bandAge = 0;
  }
  return bandY;
}

function measureBand(): number {
  const { top, bot } = bandEdges();
  return clamp(top + (bot - top) * 0.46, 100, view.chh * 0.5);
}
/** The bottom of the top chips and feed line, and the top of the highest bottom overlay showing (chh when none is laid out yet). */
function bandEdges(): { top: number; bot: number } {
  let top = 0, bot = view.chh;
  if (typeof document !== 'undefined') {
    for (const id of BAND_TOP) {
      const el = document.getElementById(id);
      if (!el || el.hidden || (id === 'feed' && !el.classList.contains('on'))) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0) top = Math.max(top, r.bottom);
    }
    for (const id of BAND_BOTTOM) {
      const el = document.getElementById(id);
      if (!el || (id !== 'rail' && !el.classList.contains('on'))) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top > top + 60) bot = Math.min(bot, r.top);
    }
  }
  return { top, bot };
}

/** The world point a quarter turn pivots on: the followed thing, else the ground under the view anchor (GV screenCentreWorld 11303). */
export function viewCentreWorld(): XY {
  const t = followed();
  if (t && resolve(t, fpos)) return { x: fpos.x, y: fpos.y };
  return screenToWorld(view.cw / 2, view.chh * VANCH);
}

/** The park tile under screen point (cw/2, 0.45 * chh), clamped into the park so callers may index the layers (GV midG 10785; 05 2.6). */
export function viewCentreTile(): XY {
  const w = screenToWorld(view.cw / 2, view.chh * 0.45);
  return { x: clamp(Math.floor(w.x + 0.5), 0, N - 1), y: clamp(Math.floor(w.y + 0.5), 0, N - 1) };
}

/** Per frame, in GV's order (12089-12090): turnStep, keepCentre, followStep. */
export function stepCamera(dt: number): void {
  turnStep(dt);
  keepCentre();
  followStep(dt);
}

/* ---------- gestures (GV 11164-11230; 03 8.1) ---------- */

/** What the armed tool does with one finger (03 8.1 item 2): pan, paint tiles, or wait for the tap. */
export type ToolClass = 'hand' | 'brush' | 'other';
export type InputHandlers = {
  /** All pointers up after under 9 px of travel and under 420 ms (GV 11223). Never called for a brush, which painted on down. */
  onTap: (sx: number, sy: number) => void;
  /** Read on every first pointerdown; 'hand' when absent. */
  toolClass?: () => ToolClass;
  /** A brush stroke begins on a park tile (one undo group, 03 5.6). */
  onStrokeStart?: () => void;
  /** Paint one park tile: at once on down, then after 0.14 s, then every 0.10 s while the finger drags (GV 11176, 11212-11215). */
  onPaint?: (tile: XY) => void;
};

/** The tap thresholds and the drag-paint throttle (GV 11223, 11176, 11215). */
export const TAP_PX = 9;
export const TAP_MS = 420;
export const PAINT_FIRST_MS = 140;
export const PAINT_EVERY_MS = 100;
/** Twist past this many radians before the fingers turn the park (GV 11201). */
export const TWIST_DEAD = 0.06;

type PtrEvent = { pointerId: number; clientX: number; clientY: number; timeStamp: number };
const tileScratch: XY = { x: 0, y: 0 };

/** A pointer's position in canvas CSS px. */
function pos(e: PtrEvent): XY {
  return { x: e.clientX - originX, y: e.clientY - originY };
}

/** The park tile under a screen point, or null outside the park (the same rounding as project.ts screenToTile). */
function parkTileAt(sx: number, sy: number): XY | null {
  const w = screenToWorld(sx, sy, tileScratch);
  const x = Math.floor(w.x + 0.5), y = Math.floor(w.y + 0.5);
  return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
}

/** Wire pointer and wheel input on the canvas (GV setupInput 11168-11230; 03 8.1). Installing twice on one canvas is a no-op. */
export function setupInput(canvas: HTMLCanvasElement, h: InputHandlers): void {
  if (wired.has(canvas)) return;
  wired.add(canvas);
  if (!boundCanvas) boundCanvas = canvas;

  canvas.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // a synthetic or already-released pointer cannot be captured; the gesture still works
      }
      if (ptrs.size === 0) {
        const r = canvas.getBoundingClientRect();
        originX = r.left;
        originY = r.top;
      }
      const p = pos(e);
      ptrs.set(e.pointerId, p);
      if (ptrs.size === 1) {
        const cls = h.toolClass ? h.toolClass() : 'hand';
        down = { x: p.x, y: p.y, t: e.timeStamp, moved: 0, cls };
        if (cls === 'hand') dragging = true;
        else if (cls === 'brush') {
          const t = parkTileAt(p.x, p.y);
          if (t) {
            h.onStrokeStart?.();
            h.onPaint?.(t);
          }
          paintNext = e.timeStamp + PAINT_FIRST_MS;
        }
      } else if (ptrs.size === 2) {
        dragging = false;
        const [a, b] = [...ptrs.values()] as [XY, XY];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const a0 = Math.atan2(b.y - a.y, b.x - a.x);
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx, my, a0, ang0: cam.ang, twist: 0, lastDa: 0, live: false, base: 0 };
        cam.angT = cam.ang;
        // the ground under the fingers stays under the fingers through the whole gesture (GV 11183-11184)
        const w = screenToWorld(mx, my);
        cam.turnKeep = { x: w.x, y: w.y, sx: mx, sy: my, pinch: true };
      }
    },
    { passive: true },
  );

  canvas.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      const prev = ptrs.get(e.pointerId);
      if (!prev) return;
      const cur = pos(e);
      ptrs.set(e.pointerId, cur);
      if (down) down.moved += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      if (ptrs.size >= 2 && pinch) {
        const [a, b] = [...ptrs.values()] as [XY, XY];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const z1 = clamp((pinch.z * d) / Math.max(1, pinch.d), ZMIN, ZMAX);
        let da = Math.atan2(b.y - a.y, b.x - a.x) - pinch.a0;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        pinch.twist += Math.abs(da - pinch.lastDa);
        pinch.lastDa = da;
        if (!pinch.live && (pinch.twist > TWIST_DEAD || Math.abs(da) > TWIST_DEAD)) {
          pinch.live = true; // past the dead zone
          pinch.base = da;
        }
        // the fingers set a target; the park eases after it each frame, so fingertip jitter never reaches the picture
        if (pinch.live) cam.angT = pinch.ang0 + da - pinch.base;
        cam.z = z1;
        follow(null);
        cam.free = true;
        if (cam.turnKeep && cam.turnKeep.pinch) {
          cam.turnKeep.sx = mx;
          cam.turnKeep.sy = my;
          keepCentre();
        }
        clampCam();
        return;
      }
      if (dragging) {
        follow(null);
        cam.free = true;
        cam.ox += cur.x - prev.x;
        cam.oy += cur.y - prev.y;
        clampCam();
      } else if (down && down.cls === 'brush' && ptrs.size === 1 && e.timeStamp >= paintNext) {
        const t = parkTileAt(cur.x, cur.y);
        if (t) h.onPaint?.(t);
        paintNext = e.timeStamp + PAINT_EVERY_MS;
      }
    },
    { passive: true },
  );

  const up = (e: PointerEvent, cancelled: boolean): void => {
    if (!ptrs.delete(e.pointerId)) return;
    if (ptrs.size < 2) {
      pinch = null;
      if (cam.turnKeep && cam.turnKeep.pinch && cam.ang === cam.angT) cam.turnKeep = null;
    }
    if (ptrs.size === 0) {
      const d = down;
      if (!cancelled && d && d.cls !== 'brush' && d.moved < TAP_PX && e.timeStamp - d.t < TAP_MS) h.onTap(d.x, d.y);
      dragging = false;
      down = null;
    }
  };
  canvas.addEventListener('pointerup', (e: PointerEvent) => up(e, false), { passive: true });
  canvas.addEventListener('pointercancel', (e: PointerEvent) => up(e, true), { passive: true });
  // the wheel zooms and keeps the follow; a drag drops it (GV 11229 vs 11206; 09 row camera.ts)
  canvas.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      cam.z *= e.deltaY < 0 ? 1.12 : 0.89;
      cam.free = true;
      clampCam();
    },
    { passive: false },
  );
}

/** True while two fingers are down (turnStep eases faster then). */
export function pinching(): boolean {
  return pinch !== null;
}
