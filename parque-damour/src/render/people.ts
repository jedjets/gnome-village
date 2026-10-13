// src/render/people.ts
// The people and the creatures on the ground, as phase 6 drawables (03 7.9): where each is drawn (the anchor the pick, the follow and the
// selection ring share), which way it faces on screen, its depth in the painter order (03 7.2), and the lists pickAt reads (03 8.2).
// NEW in S4 part C, beside figures.ts and creatures.ts (which keep the drawing) and props.ts (at its size limit, AGENTS rule 9): the 03 2.7
// module map has no row for it yet (`peopleDrawables(): Drawable[]; anchorOf(v, out): Anchor; pickPeople(); pickCreatures(); followPos`).
// Ported from GV 1641-1642 (the facing: the sign of the heading's screen x, here worked out each frame in render because the sim never
// reads the camera, 03 7.6 item 7, A5), 8172 (a facing toward something on screen is a drawing choice, never written back), 8169-8175
// (drawGnome at screenOf of the feet), 9578-9600 (the people and critters sorted with the props by depth). ADAPT: GV kept g.face and
// walkPh on the record; here the record's `face` is the facing at camera angle 0 only, so the facing at any angle comes from the
// heading in world units (the next waypoint, a creature's target, a seat's front), remembered per id while it stands; a sitter is drawn
// on its seat's height (bench 0.2 EH, a cafe chair 0.3, a blanket on the ground) with its hips on the seat as the style board's bench
// tile does, after its seat in the painter order (03 16 risk 8: never behind the bench); a perched pigeon after its perch; a flying one at
// its ground point's depth (03 7.2 item 2). A walker's dog wears the 1 px ink lead of 04 7.2 from its collar to the walker's hand.
// A figure drawn under 12 px (the tiers below the expression's, 04 7.1 item 5; zoom under 0.55 for a grown visitor) is blitted from a
// sprite of drawFigure's own output, keyed by its look, pose, facing, one of 8 walk frames, the zoom to 1/64 and the light (the tree
// sprite cache's idiom, GV 6782-6790; 03 15.2): 30 figures at Fit cost 30 blits instead of 30 rigs (S4 part C perf, 03 7.9).
// Dropped from the range: GV's crews, riders, boats and balloons, the inside skip, the wary and blink timers.
import { DAYLEN, T } from '../core/clock.ts';
import { TAU } from '../core/math.ts';
import type { XY } from '../core/math.ts';
import { propById, type Prop } from '../world/grid.ts';
import { byId, visitors, type Visitor } from '../entities/visitor.ts';
import { creatureById, creatures, type Creature } from '../entities/creatures.ts';
import { NO_TARGET } from '../entities/move.ts';
import { AA, AM, GC, style } from './ambient.ts';
import { EH, cam, view, type FollowPos } from './camera.ts';
import { screenInto, type PickCreature, type PickPerson } from './project.ts';
import { depthOf, footprintDepth, type Drawable } from './order.ts';
import { gamePen } from './flora.ts';
import { FH, drawVisitor, figureScale, lookOf, poseOf, type Look, type Pose } from './figures.ts';
import { DOG_EH, drawDogOf, drawPigeonOf } from './creatures.ts';

/** A seat's height in EH units (props-park.ts drawBench seatE 0.2; props.ts drawBistroTable's chair seat 0.3; a blanket on the ground). */
export const SEAT_E: Readonly<Partial<Record<Prop['kind'], number>>> = { bench: 0.2, table: 0.3, picnic: 0 };
/** A sitter's hips sit on the seat: drawFigure crouches 0.24 h with the hip at -0.38 h, so the drawn point is 0.14 h under the seat. */
const SIT_DROP = 0.14;
/** A sitter or a perched pigeon paints this far (in tiles of depth) after its seat or perch: two of order.ts's 1/64 buckets. */
const AFTER = 2 / 64;

/** Where a visitor is drawn: the point drawFigure stands it on, the ground under it, its drawn height h and its seat's height e (EH). */
export type Anchor = { x: number; y: number; gx: number; gy: number; h: number; e: number; sit: boolean };

/** The seat a visitor sits on, or undefined. */
function seatOf(v: Visitor): Prop | undefined {
  return v.sitPropId !== 0 ? propById(v.sitPropId) : undefined;
}

/** The anchor of `v` at the current camera, written into `out` (no allocation). */
export function anchorOf(v: Visitor, out: Anchor): Anchor {
  const seat = seatOf(v);
  const e = seat ? (SEAT_E[seat.kind] ?? 0) : 0;
  const h = FH * cam.z * figureScale(v);
  screenInto(v.x, v.y, 0, P0);
  out.gx = P0.x;
  out.gy = P0.y;
  out.x = P0.x;
  out.y = P0.y - e * EH * cam.z + (seat ? SIT_DROP * h : 0);
  out.h = h;
  out.e = e;
  out.sit = v.sitPropId !== 0;
  return out;
}

/** The followed thing's position for camera.ts setFollowLookup: a visitor at its seat's height, a pigeon at its flight height. */
export function followPos(kind: 'visitor' | 'creature', id: number, out: FollowPos): boolean {
  if (kind === 'visitor') {
    const v = byId(id);
    if (!v) return false;
    const seat = seatOf(v);
    out.x = v.x;
    out.y = v.y;
    out.e = seat ? (SEAT_E[seat.kind] ?? 0) : 0;
    return true;
  }
  const c = creatureById(id);
  if (!c || c.outside) return false;
  out.x = c.x;
  out.y = c.y;
  out.e = c.kind === 'pigeon' ? c.z : 0;
  return true;
}

/* ---------- the facing on screen (GV 1641-1642, 8172) ---------- */

type Heading = { x: number; y: number; f: 1 | -1 };
const V_HEAD = new Map<number, Heading>();
const C_HEAD = new Map<number, Heading>();
let rc = 1, rs = 0; // the frame's camera rotation

/**
 * The facing on screen of `id` heading (hx, hy) in world units; a heading too short to read (standing still) keeps the last one, and an
 * actor never seen moving faces `dflt` (the record's facing at camera angle 0). A heading straight up or down the screen keeps the facing.
 */
function faceOf(mem: Map<number, Heading>, id: number, hx: number, hy: number, dflt: 1 | -1): 1 | -1 {
  let m = mem.get(id);
  if (!m) {
    m = { x: dflt * 0.5, y: -dflt * 0.5, f: dflt };
    mem.set(id, m);
  }
  if (hx * hx + hy * hy > 1e-6) {
    m.x = hx;
    m.y = hy;
  }
  // screen x of the rotated heading: (rx - ry) with rx = x cos - y sin, ry = x sin + y cos (camera.ts rotVec, sxOf)
  const sx = m.x * (rc - rs) - m.y * (rs + rc), len = Math.hypot(m.x, m.y);
  if (Math.abs(sx) > 0.05 * len) m.f = sx < 0 ? -1 : 1;
  return m.f;
}

/** The world heading a visitor faces: its next waypoint while walking, its seat's front (a bench) or middle (a table, a blanket). */
function headingOf(v: Visitor, out: XY): XY {
  out.x = 0;
  out.y = 0;
  const seat = seatOf(v);
  if (seat) {
    if (seat.kind === 'bench') {
      const q = (Math.PI / 2) * ((seat.rot + 2) % 4); // props.ts draws a bench with rot (r + 2) % 4; its front is local +v
      out.x = -Math.sin(q);
      out.y = Math.cos(q);
    } else {
      out.x = seat.x + (seat.w - 1) / 2 - v.x;
      out.y = seat.y + (seat.h - 1) / 2 - v.y;
    }
    return out;
  }
  if (v.path) {
    const wp = v.path[v.pi];
    const tx = wp ? wp.x : v.ptx, ty = wp ? wp.y : v.pty;
    if (tx !== NO_TARGET) {
      out.x = tx - v.x;
      out.y = ty - v.y;
    }
  }
  return out;
}

/** Forget the facings of actors that have left (a few hundred ids a session at most; swept when the map outgrows the lists). */
function sweep(): void {
  if (V_HEAD.size > visitors.length + 64) for (const id of V_HEAD.keys()) if (!byId(id)) V_HEAD.delete(id);
  if (C_HEAD.size > creatures.length + 64) for (const id of C_HEAD.keys()) if (!creatureById(id)) C_HEAD.delete(id);
}

/* ---------- the drawables (03 7.2, 7.9 phase 6) ---------- */

type PersonDrawable = Drawable & { v: Visitor | null; c: Creature | null; face: 1 | -1; sx: number; sy: number; h: number };

const OUT: PersonDrawable[] = [];
const POOL: PersonDrawable[] = [];
const P0: XY = { x: 0, y: 0 }, HD: XY = { x: 0, y: 0 };
const A0: Anchor = { x: 0, y: 0, gx: 0, gy: 0, h: 0, e: 0, sit: false };
const LOOK: Look = { seed: 0, sex: 'f', skin: 0, hair: 0, coat: 0, signature: -1, hat: 'none' };
const POSE: Pose = { state: 'idle', face: 1, expr: 'idle' };

function tSim(): number {
  return T.abs * DAYLEN;
}

function drawPerson(d: Drawable, c: CanvasRenderingContext2D): void {
  const pd = d as PersonDrawable, v = pd.v;
  if (!v) return;
  const pen = gamePen(c);
  lookOf(v, pen.spec.palette, LOOK);
  poseOf(v, pd.face, tSim(), POSE);
  if (pd.h < SPRITE_H && typeof document !== 'undefined') {
    const sp = figureSprite(v, pd.h);
    const k = cam.z / sp.zq;
    c.drawImage(sp.c, pd.sx - sp.ax * k, pd.sy - sp.ay * k, sp.w * k, sp.hh * k);
    return;
  }
  P0.x = pd.sx;
  P0.y = pd.sy;
  drawVisitor(pen, P0, LOOK, POSE);
}

/* ---------- small figures from sprites (03 15.2; the tree sprite cache's idiom, GV 6782-6790) ---------- */

/** Figures drawn under this height (px) come from sprites: below the expression tier of 04 7.1 item 5 (eyes only from 8 px). */
export const SPRITE_H = 12;
/** Walk frames a sprite stride holds; sprites kept before the cache is cleared. */
const WALK_FRAMES = 8;
const SPRITE_CAP = 600;
type FigureSprite = { c: HTMLCanvasElement; w: number; hh: number; ax: number; ay: number; zq: number };
const SPRITES = new Map<string, FigureSprite>();

/**
 * The sprite of `v` in LOOK and POSE (set by the caller) at drawn height h: drawFigure's output at the zoom rounded to 1/64, with the walk
 * phase snapped to one of 8 frames a stride; keyed by the look (lookSeed, archetype, hat), the pose, the facing, the frame, the zoom,
 * the dpr and the light (as flora.ts treeSpriteOf keys it). The anchor (ax, ay) is the figure's drawn point inside the sprite.
 */
function figureSprite(v: Visitor, h: number): FigureSprite {
  const zq = Math.max(1, Math.round(cam.z * 64)) / 64, dpr = view.dpr;
  const walking = POSE.state === 'walk';
  const frame = walking ? Math.floor((((POSE.walkPh ?? 0) % TAU) + TAU) % TAU / (TAU / WALK_FRAMES)) % WALK_FRAMES : 0;
  const key = v.lookSeed + '|' + v.archetype + '|' + LOOK.hat + '|' + POSE.state + '|' + POSE.face + '|' + frame + '|' + zq + '|' + dpr + '|' +
    Math.round(T.light * 16) + '|' + Math.round(AA * 16) + '|' + Math.round(AM[2] * 32);
  const hit = SPRITES.get(key);
  if (hit) return hit;
  const hq = (h * zq) / cam.z;
  const w = Math.ceil(hq * 1.4) + 4, ay = Math.ceil(hq * 1.25) + 3, hh = ay + Math.ceil(hq * 0.35) + 3, ax = w / 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(hh * dpr));
  const g = c.getContext('2d');
  if (g) {
    g.scale(dpr, dpr);
    if (walking) POSE.walkPh = (frame + 0.5) * (TAU / WALK_FRAMES);
    drawVisitor({ ctx: g, spec: style(), z: zq }, { x: ax, y: ay }, LOOK, POSE);
  }
  const sp: FigureSprite = { c, w, hh, ax, ay, zq };
  if (SPRITES.size >= SPRITE_CAP) SPRITES.clear();
  SPRITES.set(key, sp);
  return sp;
}

function drawCreature(d: Drawable, c: CanvasRenderingContext2D): void {
  const pd = d as PersonDrawable, cr = pd.c;
  if (!cr) return;
  const pen = gamePen(c);
  P0.x = pd.sx;
  P0.y = pd.sy;
  if (cr.kind === 'pigeon') {
    drawPigeonOf(pen, P0, cr.st, pd.face, cr.id, tSim());
    return;
  }
  drawDogOf(pen, P0, pd.face, cr.st === 'walk', cr.id, tSim());
  const o = byId(cr.ownerId);
  if (o) drawLead(c, pd, o);
}

/**
 * The lead (04 7.2 dog walker: a 1 px ink line) from the dog's collar (the pomeranian shape's neck at the dog's size) to the walker's hand
 * on the dog's side, sagging a little.
 */
function drawLead(c: CanvasRenderingContext2D, pd: PersonDrawable, o: Visitor): void {
  anchorOf(o, A0);
  const s = DOG_EH * EH * cam.z;
  if (s < 2) return;
  const cx = pd.sx + pd.face * 0.55 * s, cy = pd.sy - 0.42 * s;
  const side = cx < A0.x ? -1 : 1;
  const hx = A0.x + side * 0.1 * A0.h, hy = A0.y - 0.42 * A0.h;
  const mx = (cx + hx) / 2, my = Math.max(cy, hy) + 0.12 * Math.hypot(hx - cx, hy - cy);
  c.strokeStyle = GC(style().palette.ink, 0.9);
  c.lineWidth = 1;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx, cy);
  c.quadraticCurveTo(mx, my, hx, hy);
  c.stroke();
}

function take(): PersonDrawable {
  let d = POOL[OUT.length];
  if (!d) {
    d = { depth: 0, kind: '', id: 0, x: 0, y: 0, z: 0, draw: drawPerson, v: null, c: null, face: 1, sx: 0, sy: 0, h: 0 };
    POOL.push(d);
  }
  OUT.push(d);
  return d;
}

/** On screen, with a margin of the figure's height (a figure's head and a dog's lead reach above its point). */
function onScreen(x: number, y: number, h: number): boolean {
  const m = h + 12;
  return x > -m && x < view.cw + m && y > -8 && y < view.chh + m * 2;
}

/**
 * Phase 6's people and creatures (03 7.9): every visitor, every pigeon and every walker's dog in the park (the pomeranian waiting outside
 * is neither drawn nor picked: S6 brings it in), culled to the screen, with their depth (03 7.2), facing and drawn point. The returned
 * list and its items are reused next frame; draw.ts copies them into its own list.
 */
export function peopleDrawables(): Drawable[] {
  OUT.length = 0;
  rc = Math.cos(cam.ang);
  rs = Math.sin(cam.ang);
  for (const v of visitors) {
    anchorOf(v, A0);
    if (!onScreen(A0.x, A0.y, A0.h) || A0.h < 3) continue; // 04 7.1 item 5: under 3 px nothing is drawn
    const d = take();
    const seat = seatOf(v);
    headingOf(v, HD);
    d.kind = 'visitor';
    d.id = v.id;
    d.x = v.x;
    d.y = v.y;
    d.z = A0.e;
    d.depth = seat ? Math.max(depthOf(v.x, v.y), footprintDepth(seat.x, seat.y, seat.w, seat.h)) + AFTER : depthOf(v.x, v.y);
    d.draw = drawPerson;
    d.v = v;
    d.c = null;
    d.face = faceOf(V_HEAD, v.id, HD.x, HD.y, v.face);
    d.sx = A0.x;
    d.sy = A0.y;
    d.h = A0.h;
  }
  for (const c of creatures) {
    if (c.outside || c.kind === 'pomeranian') continue; // S6 brings the pomeranian into the park
    const pigeon = c.kind === 'pigeon';
    screenInto(c.x, c.y, pigeon ? c.z : 0, P0);
    const s = (pigeon ? 0.18 : DOG_EH) * EH * cam.z;
    if (!onScreen(P0.x, P0.y, s) || s < 1.6) continue;
    const d = take();
    const moving = c.st === 'walk' || c.st === 'fly' || c.st === 'scatter';
    const perch = pigeon && c.perchPropId !== 0 && c.st === 'perch' ? propById(c.perchPropId) : undefined;
    d.kind = c.kind;
    d.id = c.id;
    d.x = c.x;
    d.y = c.y;
    d.z = pigeon ? c.z : 0;
    d.depth = perch ? Math.max(depthOf(c.x, c.y), footprintDepth(perch.x, perch.y, perch.w, perch.h)) + AFTER : depthOf(c.x, c.y);
    d.draw = drawCreature;
    d.v = null;
    d.c = c;
    d.face = faceOf(C_HEAD, c.id, moving ? c.tx - c.x : 0, moving ? c.ty - c.y : 0, c.face);
    d.sx = P0.x;
    d.sy = P0.y;
    d.h = s;
  }
  sweep();
  return OUT;
}

/* ---------- the lists pickAt reads (03 8.2 items 1, 2) ---------- */

type PickP = { id: number; x: number; y: number; e: number };
type PickC = { id: number; kind: PickCreature['kind']; x: number; y: number; z: number };
const PEOPLE: PickP[] = [];
const BEASTS: PickC[] = [];

/** Every visitor as pickAt's people list: its ground point and its seat's height (a sitter is picked where it is drawn). Reused. */
export function pickPeople(): readonly PickPerson[] {
  let n = 0;
  for (const v of visitors) {
    const p = PEOPLE[n] ?? (PEOPLE[n] = { id: 0, x: 0, y: 0, e: 0 });
    const seat = seatOf(v);
    p.id = v.id;
    p.x = v.x;
    p.y = v.y;
    p.e = seat ? (SEAT_E[seat.kind] ?? 0) : 0;
    n++;
  }
  PEOPLE.length = n;
  return PEOPLE;
}

/** Every creature in the park as pickAt's creature list (the pomeranian waiting outside is not in the park). Reused. */
export function pickCreatures(): readonly PickCreature[] {
  let n = 0;
  for (const c of creatures) {
    if (c.outside) continue;
    const p = BEASTS[n] ?? (BEASTS[n] = { id: 0, kind: 'pigeon', x: 0, y: 0, z: 0 });
    p.id = c.id;
    p.kind = c.kind;
    p.x = c.x;
    p.y = c.y;
    p.z = c.z;
    n++;
  }
  BEASTS.length = n;
  return BEASTS;
}
