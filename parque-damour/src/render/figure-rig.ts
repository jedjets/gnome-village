// src/render/figure-rig.ts
// The skeleton of the picked figure rig, 2 Tailored (register section 4, Figure rig, 2026-10-13): FH 22 and the 04 7.1 proportions
// (hip -0.38, shoulder -0.66, head centre -0.82, head r 0.10, upper arm 0.16 and forearm 0.14, leg 0.38 as thigh and shin 0.19, shoulder
// width 0.16, line max(0.9, 0.06 h)), the LOD tiers by drawn height (7.1 item 5), the walk (item 3), the idle weight shift and breathing
// (item 4), the sitting pose keyed to the seat (item 6), and the body language of the 14 states (07 S4.6 step 12), solved once per figure
// into a Skel that figure-garments.ts dresses; the shape list both draw through, with the soft ink rim behind each piece, and the colours
// through the palette and the lamp warmth (03 7.3 item 5).
// Ported from GV 8169-8260 (drawGnome: the facing frame, the lean, bob and crouch, the sitting legs, the walk swing) and 8331-8340 (the
// arm angles, the back arm first), by way of the options page the owner picked from (scratch/s4-options-rig.ts, variant 2).
// Verdict: ADAPT. Changes: the 04 7.1 anchors instead of GV 8240's (hip -0.30, shoulder -0.56, head -0.72, r 0.135); two-bone legs and
// arms solved by IK (knees and elbows), a heel-and-toe walk, filled garments instead of GV's tunic stroke; the 14 states of 02 4.3 instead
// of GV's jobs; colours only from style().palette. Dropped from the range: GV's swim, boat, ride, carry and tool-swing poses, the pointed
// hat, the beard; the page's variants 1 (stick) and 3 (gouache).
import { AT, GC, mix, shade, toHex, type Pen, type Pt } from './ambient.ts';

/** A grown visitor's height in px at zoom 1 (0.85 EH; 04 7.1 rule 1). */
export const FH = 22;
/** The LOD tiers by drawn height h in px (04 7.1 item 5): nothing under `body`. */
export const LOD = { body: 3, signifier: 4, eyes: 8, expression: 12, close: 18 } as const;
/** The tier a drawn height falls in: 0 nothing, 1 body, 2 signifier, 3 eyes, 4 expression (brows, mouth, blush), 5 close detail. */
export function tierOf(h: number): 0 | 1 | 2 | 3 | 4 | 5 {
  return h < LOD.body ? 0 : h < LOD.signifier ? 1 : h < LOD.eyes ? 2 : h < LOD.expression ? 3 : h < LOD.close ? 4 : 5;
}

export type Arche =
  | 'single' | 'couple' | 'parent' | 'child' | 'elder' | 'tourist' | 'jogger' | 'artist' | 'busker' | 'walker' | 'gardener' | 'vendor'
  | 'stranger' | 'plain';
/** The body-language states (07 S4.6 step 12; 02 4.3). */
export type State =
  | 'walk' | 'idle' | 'sit' | 'read' | 'feed' | 'eat' | 'photo' | 'paint' | 'play' | 'pave' | 'tidy' | 'serve' | 'shelter' | 'chase';
export const STATES: readonly State[] = [
  'walk', 'idle', 'sit', 'read', 'feed', 'eat', 'photo', 'paint', 'play', 'pave', 'tidy', 'serve', 'shelter', 'chase',
];
export type Hat = 'none' | 'beret' | 'cap' | 'sunhat' | 'floppy' | 'headband';
export type HairStyle = 'bob' | 'bun' | 'short' | 'crop' | 'slick' | 'elder' | 'curls' | 'none';
export type Lower = 'trousers' | 'skirt' | 'shorts' | 'cropped';
/** The faces of 04 7.5's table (7.5 item 3), one per row group. */
export type Expr =
  | 'idle' | 'chat' | 'bench' | 'kiss' | 'propose' | 'receive' | 'huddle' | 'stumble' | 'distracted' | 'baffled' | 'lost' | 'huff' | 'laugh'
  | 'watch';
/** A held thing (03 7.6 item 4 itemFor; 04 7.2 signifiers). */
export type Item =
  | 'none' | 'book' | 'crumbs' | 'icecream' | 'camera-up' | 'brush' | 'rake-down' | 'trowel' | 'cone-serve' | 'balloon' | 'lead'
  | 'cane' | 'bouquet' | 'tote' | 'palette' | 'accordion' | 'rake-shoulder' | 'camera-chest';

/** A visitor's look in the rig: who it is (archetype, sex, skin, hair, hat) and what it wears (the crowd palette, figure-look.ts). */
export type RigLook = {
  seed: number;
  sex: 'f' | 'm';
  arche: Arche;
  skin: number; // index into palette.skin
  hair: number; // index into palette.hair; -1 for elderHair
  hairStyle: HairStyle;
  sig: number; // signature index for a single's scarf, -1 none (04 7.3)
  hat: Hat;
  hatHex: string;
  lower: Lower;
  top: string; // the top's hex (crowdTop)
  low: string; // the lower garment's hex (crowdLow)
  stripe: string; // a Breton's stripe hex, '' for a plain top
  pairScarf: string; // a couple's shared scarf hue (crowdPair), '' for none
  carry: Item; // a child's balloon or ice cream (04 7.2; register: Figure rig)
  balloon: string; // the balloon's hex: rose or sky (04 7.2)
  long: boolean; // the charming stranger's long coat (04 7.2)
  scale: number; // 1 grown, 0.65 child, 0.95 elder (04 7.1 rule 1)
};

export type Opts = {
  face: 1 | -1;
  state: State;
  ph: number; // the walk phase (mid-stride is PI / 2)
  seatPx: number; // sitting: the seat's height above the ground in px
  slope: number; // sitting: how far the screen drops per px forward along the seat's front (0.5 in iso facing the camera)
  warm: number; // the lamp warmth 0 to 0.18 (03 7.3 item 5)
  lookAt: 1 | -1 | 0; // eyes toward +1 or -1 on screen (a glance, a partner); 0 the facing
  breath: number; // the idle breathing on the arms, rad (04 7.1 item 4)
  neutral: boolean; // the plain standing skeleton: no weight shift, no hold (the measurement)
  expr: Expr;
};
export const opts = (o: Partial<Opts> = {}): Opts => ({
  face: 1, state: 'idle', ph: Math.PI / 2, seatPx: 0, slope: 0.5, warm: 0, lookAt: 0, breath: 0, neutral: false, expr: 'idle', ...o,
});

/* ---------- small vector helpers ---------- */
export const P2 = (x: number, y: number): Pt => ({ x, y });
const add = (a: Pt, b: Pt): Pt => P2(a.x + b.x, a.y + b.y);
const sub = (a: Pt, b: Pt): Pt => P2(a.x - b.x, a.y - b.y);
const len = (a: Pt): number => Math.hypot(a.x, a.y);
export const lerpP = (a: Pt, b: Pt, t: number): Pt => P2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const rotAbout = (c: Pt, q: Pt, a: number): Pt => {
  const dx = q.x - c.x, dy = q.y - c.y;
  return P2(c.x + dx * Math.cos(a) - dy * Math.sin(a), c.y + dx * Math.sin(a) + dy * Math.cos(a));
};

/** Two-bone IK: the joint between root and tip with bone lengths l1 and l2, bending toward `hint` (a direction). */
export function ik(root: Pt, tip: Pt, l1: number, l2: number, hint: Pt): { joint: Pt; tip: Pt } {
  const d0 = sub(tip, root);
  let d = len(d0);
  const maxD = (l1 + l2) * 0.999, minD = Math.abs(l1 - l2) + 1e-4;
  let t = tip;
  if (d > maxD) {
    t = add(root, P2((d0.x / d) * maxD, (d0.y / d) * maxD));
    d = maxD;
  } else if (d < minD) d = minD;
  const u = d > 1e-6 ? P2((t.x - root.x) / d, (t.y - root.y) / d) : P2(0, 1);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const n1 = P2(-u.y, u.x), n2 = P2(u.y, -u.x);
  const n = n1.x * hint.x + n1.y * hint.y >= n2.x * hint.x + n2.y * hint.y ? n1 : n2;
  return { joint: P2(root.x + u.x * a + n.x * hh, root.y + u.y * a + n.y * hh), tip: t };
}

/* ---------- the skeleton ---------- */
/** Every point is in local px with the feet anchor at (0, 0), +x toward the way the figure faces, y down. */
export type Skel = {
  h: number; hr: number; lw: number;
  lean: number; // upper body about the pelvis, + forward
  pelvis: Pt; hipF: Pt; hipB: Pt; kneeF: Pt; kneeB: Pt; footF: Pt; footB: Pt;
  toeF: number; toeB: number; // foot pitch: + toe down (heel lifted)
  shF: Pt; shB: Pt; // arm roots
  shoulderL: Pt; shoulderR: Pt; // the torso's top corners (back, front)
  shoulder: Pt; // the shoulder line's centre (04 7.1: -0.66 h standing)
  elF: Pt; elB: Pt; haF: Pt; haB: Pt;
  neck: Pt; // the neck base
  head: Pt; // the head centre
  tilt: number; // head nod, + forward
  up: (x: number, y: number) => Pt; // a body-frame offset (from the pelvis, upright) to local px, leaning
  sitting: boolean;
  items: { F: Item; B: Item };
  expr: Expr;
  swing: number; // the walk phase's sine (hair, skirt and scarf swing)
};

/** How lively the Tailored rig moves on top of 04 7.1's numbers (swing 0.15 h, arms 0.55 rad, bob 0.02 h): the page's variant 2. */
const K = 0.55, ELBOW = 0.32, LEAN = 0.035, HEEL = 0.35;

type ArmSpec = { mode: 'angle'; a: number; bend: number } | { mode: 'reach'; x: number; y: number; hint: Pt; abs?: boolean };
const reach = (x: number, y: number, hx: number, hy: number, abs = false): ArmSpec => ({ mode: 'reach', x, y, hint: P2(hx, hy), abs });

/** The pose of one state for one look at drawn height h (04 7.1 rules 2 to 6; 02 4.3). */
export function solveH(look: RigLook, o: Opts, h: number): Skel {
  const st = o.state;
  const hr = 0.1 * h;
  const lw = Math.max(0.9, 0.06 * h);
  let lean = 0, crouch = 0, bob = 0, tilt = 0;
  let footF = P2(0.03 * h, 0), footB = P2(-0.03 * h, 0);
  let toeF = 0, toeB = 0;
  let armF: ArmSpec = { mode: 'angle', a: 0.12, bend: 0.12 + 0.1 * K }, armB: ArmSpec = { mode: 'angle', a: -0.1, bend: 0.1 };
  let itemF: Item = 'none', itemB: Item = 'none';
  let expr: Expr = o.expr;
  let sitting = false, swing = 0, kneeLift: Pt | null = null;
  const a = look.arche;
  // the walk (04 7.1 rule 3): sw = sin(ph) 0.15 h, arms +-0.55 rad, bob 0.02 h at twice the stride, the heel and toe
  const walkLike = (ph: number): void => {
    const s = Math.sin(ph);
    swing = s;
    const sw = s * 0.15 * h;
    footF = P2(sw * 0.9 + 0.03 * h, 0);
    footB = P2(-sw * 0.9 - 0.03 * h, 0);
    bob = -Math.abs(Math.sin(ph * 2)) * 0.02 * h;
    lean = LEAN;
    if (s >= 0) {
      footB = P2(footB.x + 0.02 * h * HEEL, -0.05 * h * HEEL);
      toeB = 0.55 * HEEL + 0.25;
      toeF = -0.18 * K;
    } else {
      footF = P2(footF.x - 0.02 * h * HEEL, -0.05 * h * HEEL);
      toeF = 0.55 * HEEL + 0.25;
      toeB = -0.18 * K;
    }
    const run = a === 'jogger' ? 1.25 : 0; // the jogger's arms bent at the elbow (04 7.2: a run on the outer loop)
    armF = { mode: 'angle', a: -s * 0.55, bend: run || ELBOW * (0.5 + 0.5 * Math.max(0, s)) };
    armB = { mode: 'angle', a: s * 0.55, bend: run || ELBOW * (0.5 + 0.5 * Math.max(0, -s)) };
  };
  switch (st) {
    case 'walk':
      walkLike(o.ph);
      break;
    case 'idle':
      if (o.neutral) break;
      // a weight shift: the back hip sits, the front knee eases
      footF = P2(0.05 * h, 0);
      footB = P2(-0.02 * h, 0);
      toeF = -0.1 * K;
      break;
    case 'sit':
    case 'read':
    case 'feed': {
      sitting = true;
      crouch = 0.24 * h;
      lean = st === 'read' ? 0.08 * (0.5 + K) : st === 'feed' ? 0.1 + 0.08 * K : -0.04 * K;
      const seat = o.seatPx - 0.14 * h; // the ground below the pelvis, from the anchor
      // the seat (0.2 EH) stands higher than the 0.19 h shin, so the thigh slopes a little and the shin comes down to the ground
      const fx = 0.165 * h;
      footF = P2(fx + 0.01 * h, seat + (fx + 0.01 * h) * o.slope - 0.005 * h);
      footB = P2(fx - 0.035 * h, seat + (fx - 0.035 * h) * o.slope - 0.012 * h);
      if (st === 'sit') {
        armF = reach(0.13 * h, 0.235 * h, -0.3, 1);
        armB = reach(0.08 * h, 0.25 * h, -0.5, 1);
      } else if (st === 'read') {
        armF = reach(0.14 * h, 0.15 * h, -0.2, 1);
        armB = reach(0.11 * h, 0.17 * h, -0.5, 1);
        tilt = 0.12 + 0.18 * K;
        itemF = 'book';
      } else {
        armF = reach(0.25 * h, 0.1 * h + 0.04 * h * K, -0.2, 1);
        armB = reach(0.12 * h, 0.21 * h, -0.4, 1);
        tilt = 0.08 + 0.12 * K;
        itemB = 'crumbs';
      }
      break;
    }
    case 'eat':
      footF = P2(0.05 * h, 0);
      footB = P2(-0.03 * h, 0);
      armF = reach(0.13 * h, -0.07 * h, 0.1, 1);
      itemF = 'icecream';
      break;
    case 'photo':
      footF = P2(0.07 * h, 0);
      footB = P2(-0.05 * h, 0);
      lean = -0.03 - 0.05 * K;
      armF = reach(0.12 * h, -0.15 * h, 0.3, 1);
      armB = reach(0.09 * h, -0.13 * h, -0.6, 1);
      itemF = 'camera-up';
      break;
    case 'paint':
      footF = P2(0.07 * h, 0);
      footB = P2(-0.06 * h, 0);
      lean = 0.04 + 0.05 * K;
      armF = reach(0.27 * h, -0.04 * K * h, -0.2, 1);
      armB = reach(0.06 * h, 0.2 * h, -1, 0.6);
      itemF = 'brush';
      itemB = 'palette';
      break;
    case 'play':
      // the child skips: one knee up, arms flung out and up
      bob = -0.04 * h * (0.5 + K);
      footB = P2(-0.03 * h, 0);
      footF = P2(0.1 * h, -0.13 * h - 0.04 * h * K);
      kneeLift = P2(1, -0.3);
      toeF = 0.5;
      armF = reach(0.25 * h, -0.15 * h - 0.05 * h * K, 0, 1);
      armB = reach(-0.24 * h, -0.13 * h - 0.05 * h * K, 0, 1);
      tilt = -0.12 * (0.5 + K);
      break;
    case 'chase':
      // the child runs at the pigeons: a long stride, a forward lean, arms out
      lean = 0.16 + 0.1 * K;
      bob = -0.03 * h;
      footF = P2(0.2 * h, -0.02 * h);
      footB = P2(-0.17 * h, -0.09 * h - 0.04 * h * K);
      toeB = 0.9;
      toeF = -0.2;
      armF = reach(0.26 * h, 0.02 * h, 0, 1);
      armB = reach(-0.16 * h, 0.16 * h, -0.2, 1);
      tilt = -0.1;
      break;
    case 'pave':
      // the gardener rakes gravel along: leaning in, both hands down the handle, knees soft
      lean = 0.18 + 0.08 * K;
      crouch = 0.025 * h;
      footF = P2(0.11 * h, 0);
      footB = P2(-0.09 * h, 0);
      toeB = 0.15 * K;
      armF = reach(0.24 * h, 0.18 * h, -0.3, 1);
      armB = reach(0.1 * h, 0.08 * h, -0.6, 1);
      itemF = 'rake-down';
      break;
    case 'tidy':
      // bent at a bed, one hand among the flowers, the other on the knee
      lean = 0.42 + 0.12 * K;
      crouch = 0.03 * h + 0.03 * h * K;
      footF = P2(0.08 * h, 0);
      footB = P2(-0.07 * h, 0);
      armF = reach(0.26 * h, -0.02 * h, 0, 1, true);
      armB = reach(0.09 * h, -0.17 * h, -1, 0, true);
      itemF = 'trowel';
      tilt = 0.15;
      break;
    case 'serve':
      armF = reach(0.25 * h, 0.03 * h, -0.2, 1);
      armB = reach(0.15 * h, 0.15 * h, -0.6, 1);
      lean = 0.04 + 0.04 * K;
      itemF = 'cone-serve';
      break;
    case 'shelter':
      // huddled under the awning: shoulders up, arms wrapped, head down (02 5.3 SHELTERED; 04 7.5 row huddle)
      crouch = 0.015 * h;
      lean = 0.04;
      tilt = 0.14 + 0.08 * K;
      footF = P2(0.02 * h, 0);
      footB = P2(-0.03 * h, 0);
      armF = reach(0.065 * h, 0.11 * h, -0.4, 1);
      armB = reach(0.075 * h, 0.085 * h, -1, 0.5);
      expr = 'huddle';
      break;
  }
  // the archetype holds (04 7.2) standing, as the page's lineup holds them; walking, the holds that need a hand keep it (the cane, the
  // rake, the accordion, the bouquet, a child's balloon or cone), the swinging hand carries the tote and the palette, the walker the lead
  const walking = st === 'walk';
  if ((st === 'idle' && !o.neutral) || walking) {
    if (a === 'elder') {
      if (!walking) lean = 0.05 + 0.03 * K;
      armF = reach(0.15 * h, 0.255 * h, -0.6, 1);
      itemF = 'cane';
    } else if (a === 'tourist') itemF = 'camera-chest';
    else if (a === 'jogger' && !walking) {
      armF = reach(0.12 * h, 0.2 * h, -1, 0.3);
      armB = reach(0.02 * h, 0.21 * h, -1, 0.3);
    } else if (a === 'artist') {
      if (!walking) {
        armB = reach(0.03 * h, 0.22 * h, -1, 0.6);
        armF = reach(0.14 * h, 0.1 * h - 0.04 * K * h, -0.3, 1);
        itemF = 'brush';
      }
      itemB = 'palette';
    } else if (a === 'busker') {
      armF = reach(0.13 * h, 0.135 * h, -0.4, 1);
      armB = reach(-0.01 * h, 0.14 * h, -1, 0.6);
      itemF = 'accordion';
    } else if (a === 'walker') {
      if (!walking) armF = reach(0.11 * h, 0.25 * h, -0.4, 1);
      itemF = 'lead';
    } else if (a === 'gardener') {
      armF = reach(0.035 * h, -0.005 * h, 0.1, 1);
      itemF = 'rake-shoulder';
    } else if (a === 'vendor' && !walking) {
      armF = reach(0.06 * h, 0.235 * h, -0.5, 1);
      armB = reach(0.045 * h, 0.245 * h, -0.8, 1);
    } else if (a === 'stranger') {
      armF = reach(0.13 * h, 0.17 * h, -0.4, 1);
      itemF = 'bouquet';
    } else if (a === 'parent') {
      itemB = 'tote';
      if (!walking) armB = { mode: 'angle', a: -0.05, bend: 0.06 };
    } else if (a === 'child' && look.carry !== 'none') {
      itemF = look.carry;
      armF = look.carry === 'icecream' ? reach(0.13 * h, -0.07 * h, 0.1, 1) : reach(0.07 * h, -0.02 * h, -0.2, 1);
    }
  }
  // idle breathing, +-0.07 rad on the arms (04 7.1 item 4; GV 8331): an angle arm turns, a reaching hand rises and falls
  if (o.breath !== 0 && !walking) {
    for (const arm of [armF, armB]) {
      if (arm.mode === 'angle') arm.a += o.breath;
      else if (!arm.abs) arm.y -= o.breath * 0.16 * h;
    }
  }

  // ---- build the joints ----
  const pelvis0 = P2(0, -0.38 * h + crouch + bob);
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const up0 = (x: number, y: number): Pt => P2(pelvis0.x + x * cl - y * sl, pelvis0.y + x * sl + y * cl);
  // legs: from hips at +-0.03 h; the knee bends forward (04 7.1 rule 2: leg 0.38 as thigh 0.19 and shin 0.19)
  const hipF0 = P2(0.03 * h * cl, pelvis0.y), hipB0 = P2(-0.03 * h * cl, pelvis0.y);
  const thigh = 0.19 * h, shin = 0.19 * h;
  // a walking or standing body sinks so that the longer leg just reaches (no stretched legs)
  let dy = 0;
  if (!sitting) {
    const need = Math.max(len(sub(footF, hipF0)), len(sub(footB, hipB0)));
    if (need > thigh + shin) dy = need - (thigh + shin) * 0.999;
  }
  const pelvis = P2(pelvis0.x, pelvis0.y + dy);
  const up = (x: number, y: number): Pt => {
    const q = up0(x, y);
    return P2(q.x, q.y + dy);
  };
  const hipF = P2(hipF0.x, hipF0.y + dy), hipB = P2(hipB0.x, hipB0.y + dy);
  const kf = ik(hipF, footF, thigh, shin, kneeLift ?? P2(1, 0));
  const kb = ik(hipB, footB, thigh, shin, P2(1, 0));
  // shoulders and arms: the arm roots at +-0.9 of the half shoulder width, 0.02 h under the shoulder line
  const shW = 0.08 * h;
  const shF = up(shW * 0.9, -0.26 * h), shB = up(-shW * 0.9, -0.26 * h);
  const tiltX = Math.sin(tilt) * 0.06 * h;
  const ua = 0.16 * h, fa = 0.14 * h;
  const arm = (spec: ArmSpec, root: Pt, side: 1 | -1): { el: Pt; ha: Pt } => {
    if (spec.mode === 'angle') {
      // a: the upper arm from hanging, + forward; bend: the forearm further forward; a little splay off the body
      const a0 = spec.a + lean, b = a0 + spec.bend, sp = 0.03 * side;
      const el = add(root, P2(Math.sin(a0 + sp) * ua, Math.cos(a0 + sp) * ua));
      return { el, ha: add(el, P2(Math.sin(b + sp * 0.6) * fa, Math.cos(b + sp * 0.6) * fa)) };
    }
    const target = spec.abs ? P2(spec.x, spec.y) : up(spec.x, spec.y - 0.26 * h);
    const r = ik(root, target, ua, fa, spec.hint);
    return { el: r.joint, ha: r.tip };
  };
  const aF = arm(armF, shF, 1), aB = arm(armB, shB, -1);
  return {
    h, hr, lw, lean, pelvis, hipF, hipB, kneeF: kf.joint, kneeB: kb.joint, footF: kf.tip, footB: kb.tip, toeF, toeB, shF, shB,
    shoulderL: up(-shW, -0.31 * h), shoulderR: up(shW, -0.31 * h), shoulder: up(0, -0.28 * h),
    elF: aF.el, elB: aB.el, haF: aF.ha, haB: aB.ha, neck: up(0, -0.31 * h), head: up(0.01 * h + tiltX, -0.44 * h + Math.abs(tiltX) * 0.4),
    tilt, up, sitting, items: { F: itemF, B: itemB }, expr, swing,
  };
}

/* ---------- colour: the palette through the lamp warmth (03 7.3 item 5) and the ambient light ---------- */
export type Ink = { pen: Pen; warm: number };
/** The warm tints of this light (hex|warm to the tinted hex), cleared when the ambient's warm target AT moves (a perf memo only). */
const TINT = new Map<string, string>();
let tintAT: readonly number[] = AT;
/** A palette hex mixed toward the warm tint AT by `warm` (the figure's lamp warmth). */
export function tint(c: Ink, hex: string): string {
  if (c.warm <= 0) return hex;
  if (tintAT !== AT || TINT.size > 2000) {
    TINT.clear();
    tintAT = AT;
  }
  const key = hex + c.warm;
  let t = TINT.get(key);
  if (t === undefined) {
    t = mix(hex, toHex(AT), c.warm);
    TINT.set(key, t);
  }
  return t;
}
export function fillOf(c: Ink, hex: string, k = 1, a?: number): string {
  return shade(tint(c, hex), k, a);
}
export function inkOf(c: Ink, hex: string, a?: number): string {
  return GC(tint(c, hex), a);
}

/* ---------- shapes: what the garments build, each with its soft ink rim behind it ---------- */
export type Grad = { x0: number; y0: number; x1: number; y1: number; k0: number; k1: number };
export type Shape = {
  path: Path2D;
  hex: string;
  stroke?: number; // fill (default) or a stroke of this width
  light?: number;
  alpha?: number;
  grad?: Grad;
  rim?: number; // an ink line of this width under the piece (a rim of half of it shows) ...
  over?: number; // ... or over it, centred
  rimAlpha?: number;
  cap?: CanvasLineCap;
  clip?: Path2D; // drawn inside this clip (a Breton's stripes inside the top and the sleeves)
};

/** Draw shapes in order, each with its own rim (the Tailored rig's "fine rim behind each piece"). */
export function drawShapes(c: Ink, shapes: readonly Shape[]): void {
  const { ctx } = c.pen;
  const ink = c.pen.spec.palette.ink;
  // the canvas parses every colour it is handed: set the rim's once a run, and a cap or width only when it changes
  let rimA = -1, rimStyle = '', cap: CanvasLineCap | '' = '';
  const rimOf = (a: number): string => {
    if (a !== rimA) {
      rimA = a;
      rimStyle = inkOf(c, ink, a * 0.85);
    }
    return rimStyle;
  };
  ctx.lineJoin = 'round';
  for (const s of shapes) {
    if (s.clip) {
      ctx.save();
      ctx.clip(s.clip);
    }
    const k = s.light ?? 1;
    const sc = s.cap ?? 'round';
    if (sc !== cap || s.clip) {
      ctx.lineCap = sc;
      cap = s.clip ? '' : sc;
    }
    if (s.rim) {
      ctx.strokeStyle = rimOf(s.rimAlpha ?? 1);
      ctx.lineWidth = s.stroke !== undefined ? s.stroke + s.rim : s.rim;
      ctx.stroke(s.path);
    }
    let style: string | CanvasGradient = '';
    if (s.grad) {
      const g = ctx.createLinearGradient(s.grad.x0, s.grad.y0, s.grad.x1, s.grad.y1);
      g.addColorStop(0, fillOf(c, s.hex, k * s.grad.k0, s.alpha));
      g.addColorStop(1, fillOf(c, s.hex, k * s.grad.k1, s.alpha));
      style = g;
    } else style = fillOf(c, s.hex, k, s.alpha);
    if (s.stroke !== undefined) {
      ctx.strokeStyle = style;
      ctx.lineWidth = s.stroke;
      ctx.stroke(s.path);
    } else {
      ctx.fillStyle = style;
      ctx.fill(s.path);
    }
    if (s.over) {
      ctx.strokeStyle = rimOf(s.rimAlpha ?? 1);
      ctx.lineWidth = s.over;
      ctx.stroke(s.path);
    }
    if (s.clip) ctx.restore();
  }
}

/* ---------- path builders ---------- */
export function polyPath(pts: readonly Pt[], close = true): Path2D {
  const p = new Path2D();
  pts.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
  if (close) p.closePath();
  return p;
}
/** A closed shape through the points with rounded corners (quadratic midpoints): soft garments. */
export function softPath(pts: readonly Pt[]): Path2D {
  const p = new Path2D();
  const n = pts.length;
  const m0 = lerpP(pts[n - 1] as Pt, pts[0] as Pt, 0.5);
  p.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const q = pts[i] as Pt, m = lerpP(q, pts[(i + 1) % n] as Pt, 0.5);
    p.quadraticCurveTo(q.x, q.y, m.x, m.y);
  }
  p.closePath();
  return p;
}
export const linePath = (pts: readonly Pt[]): Path2D => polyPath(pts, false);
export function ellPath(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
  return p;
}
/** A tapered limb along a polyline: half-widths w0 at the first point to w1 at the last, round ends. */
export function taperPath(pts: readonly Pt[], w0: number, w1: number, roundEnds = true): Path2D {
  const n = pts.length;
  const L: Pt[] = [], R: Pt[] = [];
  let total = 0;
  const acc: number[] = [0];
  for (let i = 1; i < n; i++) {
    total += len(sub(pts[i] as Pt, pts[i - 1] as Pt));
    acc.push(total);
  }
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)] as Pt, b = pts[Math.min(n - 1, i + 1)] as Pt, p = pts[i] as Pt;
    const d = sub(b, a), l = len(d) || 1;
    const nx = -d.y / l, ny = d.x / l;
    const w = w0 + (w1 - w0) * ((acc[i] as number) / (total || 1));
    L.push(P2(p.x + nx * w, p.y + ny * w));
    R.push(P2(p.x - nx * w, p.y - ny * w));
  }
  const p = new Path2D();
  p.moveTo((L[0] as Pt).x, (L[0] as Pt).y);
  for (let i = 1; i < n; i++) p.lineTo((L[i] as Pt).x, (L[i] as Pt).y);
  const e = pts[n - 1] as Pt, s0 = pts[0] as Pt;
  const de = sub(e, pts[n - 2] as Pt), ae = Math.atan2(de.y, de.x);
  if (roundEnds) p.arc(e.x, e.y, w1, ae - Math.PI / 2, ae + Math.PI / 2);
  for (let i = n - 1; i >= 0; i--) p.lineTo((R[i] as Pt).x, (R[i] as Pt).y);
  const ds = sub(pts[1] as Pt, s0), as = Math.atan2(ds.y, ds.x);
  if (roundEnds) p.arc(s0.x, s0.y, w0, as + Math.PI / 2, as + Math.PI * 1.5);
  p.closePath();
  return p;
}
