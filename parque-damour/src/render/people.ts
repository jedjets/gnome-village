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
// tile does, after its bench or blanket in the painter order (03 16 risk 8: never behind the bench), and at a cafe table at its own
// depth, so the far sitter paints between the far chair and the top and the near one after the near chair (props.ts splits the table);
// a perched pigeon after its perch (on a bench's back rail: before the sitters, or after them when the back faces the camera); a flying
// one at its ground point's depth (03 7.2 item 2). A walker's dog wears the 1 px ink lead of 04 7.2 from its collar to the walker's hand.
// A figure drawn under 12 px (the tiers below the expression's, 04 7.1 item 5; zoom under 0.55 for a grown visitor) is blitted from a
// sprite of drawFigure's own output, keyed by its look, pose, facing, one of 8 walk frames and the zoom to 1/64, and repainted in place
// when the light moves (figure-sprites.ts; the tree sprite cache's idiom, GV 6782-6790; 03 15.2): 30 figures at Fit cost 30 blits instead
// of 30 rigs (S4 part C perf, 03 7.9).
// S4 rig stage (register section 4, Figure rig and Crowd palette): each figure is the Tailored rig (figures.ts), with its seat's height
// and the slope of the seat's front on screen (04 7.1 item 6), and the lamp warmth of 03 7.3 item 5 (its colours toward AT by
// 0.18 (1 - d / 3) for the nearest lit lamp, park or street, within 3 tiles); a dog is its walker's terrier or poodle (figure-look.ts
// breedOf) on a lead from the walker's hand on the dog's side, taut while it trots and slack while it stands; a pigeon on a bench perches
// on the bench's back rail. Static figures (idle, seated) at any zoom and every figure under 12 px come from sprites (perf, 03 7.9).
// Dropped from the range: GV's crews, riders, boats and balloons, the inside skip, the wary and blink timers.
import { DAYLEN, T } from '../core/clock.ts';
import { TAU } from '../core/math.ts';
import type { XY } from '../core/math.ts';
import { propById, props, type Prop } from '../world/grid.ts';
import { byId, visitors, type Visitor } from '../entities/visitor.ts';
import { creatureById, creatures, type Creature } from '../entities/creatures.ts';
import { NO_TARGET } from '../entities/move.ts';
import { AA, AM, AT, lampGlow, style } from './ambient.ts';
import { EH, TH, TW, cam, view, type FollowPos } from './camera.ts';
import { screenInto, type PickCreature, type PickPerson } from './project.ts';
import { depthOf, footprintDepth, type Drawable } from './order.ts';
import { gamePen } from './flora.ts';
import { streetLamps } from '../world/park.ts';
import { lampOn } from './props.ts';
import { BREATH_RAD, FH, drawVisitor, figureScale, handOf, poseOf } from './figures.ts';
import { opts, type Ink, type Opts, type RigLook } from './figure-rig.ts';
import { breedOf, lookOf, newLook } from './figure-look.ts';
import { DOG_EH, DOG_TROT_HZ, PIGEON_FLAP_HZ, PIGEON_WALK_HZ, drawDog, drawDogOf, drawLead, drawPigeonOf, drawPigeonState, pigeonStateOf } from './creatures.ts';
import { blit, spriteFor, spriteFrame, type Sprite, type SpriteLight } from './figure-sprites.ts';
import { SEATS, seatPos } from '../entities/staff.ts';

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
  const easel = v.st === 'paint' ? propById(v.job.propId ?? 0) : undefined;
  if (easel) {
    out.x = easel.x - v.x; // the artist faces the easel (02 4.3 artist)
    out.y = easel.y - v.y;
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

type PersonDrawable = Drawable & {
  v: Visitor | null; c: Creature | null; face: 1 | -1; sx: number; sy: number; h: number; e: number; slope: number; warm: number;
};

const OUT: PersonDrawable[] = [];
const POOL: PersonDrawable[] = [];
const P0: XY = { x: 0, y: 0 }, P1: XY = { x: 0, y: 0 }, C1: XY = { x: 0, y: 0 }, HD: XY = { x: 0, y: 0 };
const A0: Anchor = { x: 0, y: 0, gx: 0, gy: 0, h: 0, e: 0, sit: false };
const LOOK: RigLook = newLook();
const POSE: Opts = opts();
const INK: Ink = { pen: { ctx: null as unknown as CanvasRenderingContext2D, spec: style(), z: 1 }, warm: 0 };

function tSim(): number {
  return T.abs * DAYLEN;
}

/** The look and options of a drawable's visitor into LOOK and POSE: its seat, slope and lamp warmth from the drawable. */
function prepare(pd: PersonDrawable, v: Visitor): void {
  lookOf(v, style().palette, figureScale(v), LOOK);
  poseOf(v, pd.face, tSim(), POSE);
  POSE.seatPx = pd.e * EH * cam.z;
  POSE.slope = pd.slope;
  POSE.warm = pd.warm;
}

function drawPerson(d: Drawable, c: CanvasRenderingContext2D): void {
  const pd = d as PersonDrawable, v = pd.v;
  if (!v) return;
  prepare(pd, v);
  // from sprites, except while the zoom moves (figures from 12 px) and for a walker in a lamp's warmth (it changes at every step)
  const sprite = (pd.h < SPRITE_H || !zooming) && !(POSE.state === 'walk' && POSE.warm > 0);
  if (sprite && typeof document !== 'undefined') {
    blit(c, figureSprite(v, pd.h), pd.sx, pd.sy, cam.z, view.dpr);
    return;
  }
  INK.pen = gamePen(c);
  INK.warm = pd.warm;
  P0.x = pd.sx;
  P0.y = pd.sy;
  drawVisitor(INK, P0, LOOK, POSE);
}

/* ---------- figures and creatures from sprites (figure-sprites.ts; 03 15.2, 7.9) ---------- */

/** Under this drawn height (px) a stride holds 8 sprite frames, from it 16 (below the expression tier of 04 7.1 item 5 eyes only). */
export const SPRITE_H = 12;
const WALK_FRAMES_FAR = 8, WALK_FRAMES = 16, BEAST_FRAMES = 8;
/** Breathing levels a still figure's sprites hold: -1, 0 and 1 steps of BREATH_RAD (the hand's 0.6 px either way at zoom 1.3). */
const BREATH_STEPS = 1;
/** Is the zoom moving this frame (a pinch, the follow's zoom-in)? Then figures from 12 px draw straight, not one sprite per frame. */
let zooming = false, lastZ = 0;
/** The frame's pixel ratio in a sprite key. */
let LK = '';
/**
 * The frame's light for the sprites (figure-sprites.ts repaints a sprite a step away): what lit() reads, the ambient's red multiplier
 * AM[0] in 24ths (AM's channels move together with the light and the cloud dim), the warm mix AA in 16ths and the warm target AT.
 */
const LIGHT: SpriteLight = { l: 0, a: 0, t: 0 };
const zqOf = (h: number): number => (h < SPRITE_H ? Math.max(1, Math.round(cam.z * 64)) / 64 : cam.z);
const frameOf = (t: number, n: number): number => Math.floor((((t % 1) + 1) % 1) * n) % n;

/**
 * The sprite of `v` in LOOK and POSE (set by the caller) at drawn height h: the rig's own drawing at this zoom, the walk phase snapped to
 * one of 16 frames a stride (8 under 12 px), the breathing to one of 3 levels (none under 12 px, nor the glance: below a pixel there) and
 * the lamp warmth to 0.01; keyed by everything the drawing reads (lookSeed, archetype, carried things, state, face, frame, glance, seat,
 * warmth, zoom, light).
 */
function figureSprite(v: Visitor, h: number): Sprite {
  const zq = zqOf(h), far = h < SPRITE_H;
  const walking = POSE.state === 'walk', nf = far ? WALK_FRAMES_FAR : WALK_FRAMES;
  const frame = walking ? frameOf(POSE.ph / TAU, nf) : 0;
  if (far) POSE.lookAt = 0;
  // a glance holds the arms at the breath's middle, so a still figure keeps four sprites: three breaths and the glance
  const br = far || POSE.lookAt !== 0 ? 0 : Math.round((POSE.breath / BREATH_RAD) * BREATH_STEPS);
  const warm = Math.round(POSE.warm * 100);
  const key = v.lookSeed + '|' + v.archetype + '|' + LOOK.hat + LOOK.carry + LOOK.top + LOOK.pairScarf + '|' + POSE.state + POSE.expr + '|' +
    POSE.face + POSE.lookAt + '|' + nf + ':' + frame + '|' + br + '|' + Math.round(POSE.seatPx * 8) + '|' + Math.round(POSE.slope * 16) + '|' +
    warm + '|' + zq + LK;
  const hq = (h * zq) / cam.z;
  const w = Math.ceil(hq * 1.6) + 6, ay = Math.ceil(hq * 1.3) + 4;
  return spriteFor(key, LIGHT, zq, view.dpr, w, ay + Math.ceil(hq * 0.35) + 3, w / 2, ay, (g, at) => {
    if (walking) POSE.ph = ((frame + 0.5) / nf) * TAU;
    POSE.breath = (br / BREATH_STEPS) * BREATH_RAD;
    POSE.warm = warm / 100;
    drawVisitor({ pen: { ctx: g, spec: style(), z: zq }, warm: POSE.warm }, at, LOOK, POSE);
    return null;
  });
}

function drawCreature(d: Drawable, c: CanvasRenderingContext2D): void {
  const pd = d as PersonDrawable, cr = pd.c;
  if (!cr) return;
  INK.pen = gamePen(c);
  INK.warm = pd.warm;
  P0.x = pd.sx;
  P0.y = pd.sy;
  const z = cam.z, zq = cam.z, dpr = view.dpr, still = !zooming && typeof document !== 'undefined';
  if (cr.kind === 'pigeon') {
    // a pigeon from a sprite: its bob (3 Hz) or flap (5 Hz) in 8 frames; peck and perch hold still
    const st = cr.st, fl = st === 'fly' || st === 'scatter', walk = st === 'walk';
    const ph = fl ? tSim() * PIGEON_FLAP_HZ + cr.id * 0.37 : tSim() * PIGEON_WALK_HZ + cr.id * 0.37;
    const fr = fl ? frameOf(ph, BEAST_FRAMES) : walk ? frameOf(ph * 3, BEAST_FRAMES) : 0;
    if (!still) return drawPigeonOf(INK, P0, st, pd.face, cr.id, tSim());
    const s = pd.h, w = Math.ceil(2.8 * s) + 6, ay = Math.ceil(1.8 * s) + 4;
    blit(c, spriteFor('pg|' + st + pd.face + fr + '|' + zq + LK, LIGHT, zq, dpr, w, ay + Math.ceil(0.8 * s) + 4, w / 2, ay, (g, at) => {
      const phase = fl ? (fr + 0.5) / BEAST_FRAMES : walk ? (fr + 0.5) / BEAST_FRAMES / 3 : 0.15;
      drawPigeonState({ pen: { ctx: g, spec: style(), z: zq }, warm: 0 }, at, pd.face, pigeonStateOf(st), phase);
      return null;
    }), pd.sx, pd.sy, z, dpr);
    return;
  }
  const o = byId(cr.ownerId);
  const trot = cr.st === 'walk', breed = breedOf(o ? o.lookSeed : cr.id);
  let collar: XY;
  if (still && !(trot && pd.warm > 0)) {
    // a dog from a sprite: its trot in 8 frames, its warmth to 0.01 (a trotting dog in a lamp's warmth is drawn straight)
    const fr = trot ? frameOf(tSim() * DOG_TROT_HZ + cr.id * 0.29, BEAST_FRAMES) : 0, warm = Math.round(pd.warm * 100);
    const s = pd.h, w = Math.ceil(1.5 * s) + 6, ay = Math.ceil(1.2 * s) + 4;
    const sp = spriteFor('dg|' + breed + pd.face + trot + fr + '|' + warm + '|' + zq + LK, LIGHT, zq, dpr, w, ay + Math.ceil(0.3 * s) + 4, w / 2, ay, (g, at) =>
      drawDog({ pen: { ctx: g, spec: style(), z: zq }, warm: warm / 100 }, at, pd.face, breed, trot, (fr + 0.5) / BEAST_FRAMES));
    blit(c, sp, pd.sx, pd.sy, z, dpr);
    const k = z / sp.zq;
    C1.x = pd.sx + sp.ox * k;
    C1.y = pd.sy + sp.oy * k;
    collar = C1;
  } else collar = drawDogOf(INK, P0, pd.face, breed, trot, cr.id, tSim());
  if (o) lead(collar, o, trot);
}

/**
 * The lead (04 7.2 dog walker: a 1 px ink line) from the dog's collar to the walker's hand on the dog's side (the front hand when the dog
 * is ahead of the walker on screen, else the back one): taut (a 1 px sag) while the dog trots, slack (4 px at zoom 1.3) while it stands.
 */
function lead(collar: XY, o: Visitor, trot: boolean): void {
  anchorOf(o, A0);
  const face = faceOf(V_HEAD, o.id, 0, 0, o.face);
  const pd: PersonDrawable = { ...LEAD_PD, face, e: A0.e, slope: 0.5, warm: INK.warm };
  prepare(pd, o);
  P0.x = A0.x;
  P0.y = A0.y;
  handOf(P0, LOOK, POSE, cam.z, (collar.x - A0.x) * face > 0, P1);
  drawLead(INK, P1, collar, trot ? 1 : (4 * cam.z) / 1.3);
}
const LEAD_PD: PersonDrawable = { depth: 0, kind: '', id: 0, x: 0, y: 0, z: 0, draw: drawPerson, v: null, c: null, face: 1, sx: 0, sy: 0, h: 0, e: 0, slope: 0.5, warm: 0 };

/* ---------- the lamp warmth (03 7.3 item 5) ---------- */
const LIT: number[] = []; // x, y, on, for the lit lamps of this frame
/** Gather this frame's lit lamps: the park's (lampOn: the hours with their fade, or a c_lamplight) and the street's (lampGlow). */
function litLamps(): void {
  LIT.length = 0;
  for (const p of props) {
    if (p.kind !== 'lamp') continue;
    const on = lampOn(p);
    if (on > 0) LIT.push(p.x, p.y, on);
  }
  const g = lampGlow();
  if (g > 0) for (const l of streetLamps()) LIT.push(l.x, l.y, g);
}
/** A figure's warmth: 0.18 (1 - d / 3) toward AT for the nearest lit lamp within 3 tiles (03 7.3 item 5), by how far that lamp is on. */
export function warmthAt(x: number, y: number): number {
  let best = 0;
  for (let i = 0; i < LIT.length; i += 3) {
    const d = Math.hypot((LIT[i] as number) - x, (LIT[i + 1] as number) - y);
    if (d < 3) best = Math.max(best, 0.18 * (1 - d / 3) * (LIT[i + 2] as number));
  }
  return best;
}

/**
 * The depth of a pigeon on a bench's back rail (04 7.4 perch). Its sim point is near the bench's middle, between the two seats, so its own
 * depth would sort it between the sitters (the S4 rig review). The rail is behind the sitters while the bench faces the camera: the
 * pigeon paints after the bench and before every sitter (each paints at least AFTER after the bench); while the bench's back faces the
 * camera the rail is in front of them, and the pigeon paints after both seats' sitters (staff.ts seatPos, where act.ts seats them).
 */
function benchPerchDepth(b: Prop): number {
  const fp = footprintDepth(b.x, b.y, b.w, b.h);
  const q = (Math.PI / 2) * ((b.rot + 2) % 4), fx = -Math.sin(q), fy = Math.cos(q); // the front, local +v (headingOf)
  if (depthOf(b.x + fx * 0.2, b.y + fy * 0.2) >= depthOf(b.x - fx * 0.2, b.y - fy * 0.2)) return fp + AFTER / 2;
  let d = fp;
  for (let k = 0; k < SEATS; k++) {
    const at = seatPos(b, k);
    d = Math.max(d, depthOf(at.x, at.y));
  }
  return d + AFTER + 1 / 64;
}

/** How far the screen drops per px forward along a heading (hx, hy) in world units: 0.5 straight down a tile axis toward the camera. */
function slopeOf(hx: number, hy: number): number {
  const rx = hx * rc - hy * rs, ry = hx * rs + hy * rc;
  const sx = (rx - ry) * (TW / 2), sy = (rx + ry) * (TH / 2);
  return Math.max(-0.6, Math.min(0.6, sy / Math.max(1e-6, Math.abs(sx))));
}

function take(): PersonDrawable {
  let d = POOL[OUT.length];
  if (!d) {
    d = { depth: 0, kind: '', id: 0, x: 0, y: 0, z: 0, draw: drawPerson, v: null, c: null, face: 1, sx: 0, sy: 0, h: 0, e: 0, slope: 0.5, warm: 0 };
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
  zooming = cam.z !== lastZ;
  lastZ = cam.z;
  LK = '|' + view.dpr;
  LIGHT.l = Math.round(AM[0] * 24);
  LIGHT.a = Math.round(AA * 16);
  LIGHT.t = AT[1];
  spriteFrame();
  litLamps();
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
    // after its bench or blanket; at a cafe table at its own depth, between the table's two halves or after both (props.ts)
    d.depth = seat && seat.kind !== 'table' ? Math.max(depthOf(v.x, v.y), footprintDepth(seat.x, seat.y, seat.w, seat.h)) + AFTER : depthOf(v.x, v.y);
    d.draw = drawPerson;
    d.v = v;
    d.c = null;
    d.face = faceOf(V_HEAD, v.id, HD.x, HD.y, v.face);
    d.sx = A0.x;
    d.sy = A0.y;
    d.h = A0.h;
    d.e = A0.e;
    d.slope = seat ? slopeOf(HD.x, HD.y) : 0.5; // the sitting pose keyed to the seat's front on screen (04 7.1 item 6)
    d.warm = warmthAt(v.x, v.y);
  }
  for (const c of creatures) {
    if (c.outside || c.kind === 'pomeranian') continue; // S6 brings the pomeranian into the park
    const pigeon = c.kind === 'pigeon';
    const perch = pigeon && c.perchPropId !== 0 && c.st === 'perch' ? propById(c.perchPropId) : undefined;
    if (perch?.kind === 'bench') {
      // on the bench's back rail (props-park.ts drawBench: the back at local v -0.215, drawn with rot (r + 2) % 4), spread along it
      const q = (Math.PI / 2) * ((perch.rot + 2) % 4), u = ((c.id * 0.37) % 1) * 0.6 - 0.3, bv = -0.215;
      screenInto(perch.x + u * Math.cos(q) - bv * Math.sin(q), perch.y + u * Math.sin(q) + bv * Math.cos(q), c.z, P0);
    } else screenInto(c.x, c.y, pigeon ? c.z : 0, P0);
    const s = (pigeon ? 0.18 : DOG_EH) * EH * cam.z;
    if (!onScreen(P0.x, P0.y, s) || s < 1.6) continue;
    const d = take();
    const moving = c.st === 'walk' || c.st === 'fly' || c.st === 'scatter';
    d.kind = c.kind;
    d.id = c.id;
    d.x = c.x;
    d.y = c.y;
    d.z = pigeon ? c.z : 0;
    d.depth = perch?.kind === 'bench' ? benchPerchDepth(perch)
      : perch ? Math.max(depthOf(c.x, c.y), footprintDepth(perch.x, perch.y, perch.w, perch.h)) + AFTER : depthOf(c.x, c.y);
    d.draw = drawCreature;
    d.v = null;
    d.c = c;
    d.face = faceOf(C_HEAD, c.id, moving ? c.tx - c.x : 0, moving ? c.ty - c.y : 0, c.face);
    d.sx = P0.x;
    d.sy = P0.y;
    d.h = s;
    d.e = 0;
    d.warm = pigeon ? 0 : warmthAt(c.x, c.y); // the dogs warm by the lamps as the crowd page draws them; the pigeons do not
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
