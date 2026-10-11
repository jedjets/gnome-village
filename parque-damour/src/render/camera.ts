// src/render/camera.ts
// Camera state, the viewport, rotation about the park centre, quarter turns, Fit and the pan clamp (03 7.1).
// Ported from GV 6331-6358 (cam, resize, setAngle, rotXY, invRot, rotVec, turnStep), 6400-6416 (fitCam, clampCam),
// 12142-12148 (quarter turns). PORT; the fit box is the park plus the 8-tile apron, the zoom floor is the register's 0.30.
// TODO(S2): setupInput (gestures, GV 11168-11230), followStep, keepCentre, centreOn with turnKeep (GV 11280-11322).
import { clamp, type XY } from '../core/math.ts';
import { N } from '../world/grid.ts';
import { APRON } from '../world/park.ts';

export const TW = 26;
export const TH = 13;
export const EH = 26;
export const VANCH = 0.46;
export const CTR = (N - 1) / 2; // 23.5
export const ZMIN = 0.3;
export const ZMAX = 3.0;

export type Cam = {
  ox: number;
  oy: number;
  z: number;
  fitZ: number;
  ang: number;
  angT: number;
  follow: number; // id of the followed actor, 0 none
  free: boolean; // true once the player has moved the camera
};
export const cam: Cam = { ox: 0, oy: 0, z: 0.8, fitZ: 0.8, ang: 0, angT: 0, follow: 0, free: false };

/** CSS pixel size of the canvas and the capped device pixel ratio (GV 6331, 6336). */
export const view = { cw: 390, chh: 844, dpr: 1 };

let rotC = 1;
let rotS = 0;

export function setAngle(a: number): void {
  cam.ang = a;
  rotC = Math.cos(a);
  rotS = Math.sin(a);
}

/** World to rotated world, about the park centre (GV 6345). */
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
export function invRot(rx: number, ry: number): XY {
  const dx = rx - CTR, dy = ry - CTR;
  return { x: CTR + dx * rotC + dy * rotS, y: CTR - dx * rotS + dy * rotC };
}
export function rotVec(gx: number, gy: number): XY {
  return { x: gx * rotC - gy * rotS, y: gx * rotS + gy * rotC };
}

/** Ease the angle toward the target: a button turn over half a second, a pinch within a tenth (GV 6350-6356). */
export function turnStep(dt: number, pinch = false): void {
  const d = cam.angT - cam.ang;
  if (Math.abs(d) < 0.0015) {
    if (d !== 0) setAngle(cam.angT);
    return;
  }
  setAngle(cam.ang + d * (1 - Math.pow(pinch ? 0.00002 : 0.0008, dt)));
}

/** Ask for the next quarter turn (GV 12142-12147). */
export function turn(dir: -1 | 1): void {
  const q = Math.PI / 2, cur = cam.angT;
  cam.angT = dir > 0 ? Math.floor(cur / q + 1e-4 + 1) * q : Math.ceil(cur / q - 1e-4 - 1) * q;
}

export function setViewport(cw: number, chh: number, dpr: number): void {
  view.cw = cw;
  view.chh = chh;
  view.dpr = dpr;
}

/** Size the canvas to the window at a dpr capped at 2 (GV 6335-6340). */
export function resize(canvas: HTMLCanvasElement): void {
  setViewport(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.round(view.cw * view.dpr);
  canvas.height = Math.round(view.chh * view.dpr);
  if (!cam.free) fitCam();
  else clampCam();
}

/** Screen-space box (zoom 1, no offset) of the park plus apron rotated by the current angle (03 7.1 item 4). */
export function apronBox(): { a: number; b: number; c: number; d: number } {
  const lo = -APRON - 0.5, hi = N + APRON - 0.5;
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const [x, y] of [[lo, lo], [hi, lo], [hi, hi], [lo, hi]] as const) {
    const r = rotXY(x, y);
    const u = (r.x - r.y) * (TW / 2);
    const v = (r.x + r.y - (N - 1)) * (TH / 2);
    if (u < a) a = u;
    if (u > b) b = u;
    if (v < c) c = v;
    if (v > d) d = v;
  }
  return { a, b, c, d };
}

/** Frame the park plus apron and centre on the park (GV 6400-6409 with the apron box). */
export function fitCam(): void {
  const L = apronBox();
  const availW = Math.max(120, view.cw - 18), availH = Math.max(160, view.chh * 0.58);
  cam.z = clamp(Math.min((availW * 1.16) / Math.max(1, L.b - L.a), availH / Math.max(1, L.d - L.c)), ZMIN, ZMAX);
  cam.ox = -((L.a + L.b) / 2) * cam.z;
  cam.oy = -((L.c + L.d) / 2) * cam.z;
  cam.fitZ = cam.z;
  clampCam();
}

/** Keep the zoom in range and the pan within the apron box (GV 6411-6415). */
export function clampCam(): void {
  cam.z = clamp(cam.z, ZMIN, ZMAX);
  const lim = Math.max(240, (N + 2 * APRON) * TW * cam.z * 0.56);
  cam.ox = clamp(cam.ox, -lim, lim);
  cam.oy = clamp(cam.oy, -lim, lim);
}

/** Put world (x, y) at the view anchor. */
export function centreOn(x: number, y: number): void {
  const r = rotXY(x, y);
  cam.ox = -(r.x - r.y) * (TW / 2) * cam.z;
  cam.oy = -(r.x + r.y - (N - 1)) * (TH / 2) * cam.z;
  clampCam();
}
