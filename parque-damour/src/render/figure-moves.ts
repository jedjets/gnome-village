// src/render/figure-moves.ts
// The single-figure poses of the romance stages and the reactions that nobody had picked before S6 (04 9.2 and 9.3, 7.5 item 3): the
// Notice 2 shy glance, the Bench 2 head on the shoulder, the Parted and snatched huff 1 (arms folded, a foot tapping), the backfire laugh 1
// (head back 0.15 rad, a bob at 2 Hz), the poop `wipe` 1 (the hat off in her hand, the paper dollop on it), the soaked `shake` 3 (the dog
// shake), the trip `stumble` 3 (plop and grin) and the snatched `chase` 1 (both arms up). Each is a figure-pose.ts Pose per frame, from the
// visitor's state and its clock, drawn through drawRigPerson with the solved Skel; the extras that ride on the body (the hat in the hand,
// the dollop, the drops, the puddle, the dust poof) are drawn after it from the same Skel.
// NEW (S6 art, register section 4 "S6 art and S5 poses": picked by Claude on the owner's delegation, 2026-10-20, "make your own judgement
// calls on style"); ported from the options page scratch/s6-options-poses.ts, s6-options-pigeon.ts, s6-options-water.ts, s6-options-peel.ts
// and s6-options-pom.ts, the picked variants only. Changes: the pairs are told apart by sex (the page's him and her; a Pair is always one
// woman and one man since 2026-10-20), the lean toward a seated partner follows the partner's side on screen (both sit facing one way),
// the page's single frames became timelines from the reaction's clock (04 9.3: a trip's lean 0.3 s, down 0.3 to 1.2 s, up by 2.0 s, brushing
// to 3 s; a wipe's hand 0 to 1 s, hat off 1 to 2.5 s, hat on 2.5 to 4 s), colours only through the palette.
import { TAU } from '../core/math.ts';
import { byId, type Visitor } from '../entities/visitor.ts';
import { pairById } from '../entities/romance.ts';
import { GC, mix, shade, type Pen, type Pt } from './ambient.ts';
import { cam } from './camera.ts';
import { P2, type Ink, type RigLook, type Skel } from './figure-rig.ts';
import type { Arm, Pose } from './figure-pose.ts';
import { dropDot, poof, splat } from './fx-play.ts';

export type MoveKind = 'notice' | 'bench' | 'huff' | 'laugh' | 'wipe' | 'shake' | 'stumble' | 'chase';
/** What a figure is doing with its whole body this frame: the Pose, and what rides on it. */
export type Move = {
  kind: MoveKind;
  pose: Pose;
  t: number; // seconds into the reaction (0 for a state that has no clock)
  hatOff: boolean; // the wipe's hat is in her hand
  hatHand: boolean; // ... and the hand holding it is the front one
  splat: number; // the paper dollop's size on the head or the hat, 0 to 1
  poof: number; // the stumble's dust poof, 0 to 1 through its life, -1 none
  wet: boolean; // the shake: clothes darkened, drops on and off
  shake: number; // the shake's phase value, -0.25 to 0.25 rad
  k: number; // the bench's lean toward the partner in the figure's own frame, +1 ahead, -1 behind, 0 for anything else
  her: boolean; // the bench's woman (she leans 0.2 rad toward him), false for the man (he sits up)
};

/** The reactions' lengths (02 6.4, brain.ts REACTION; tests/rig-moves.test.ts keeps them equal): what `v.t` counts down from. */
export const WIPE_T = 4, SHAKE_T = 3, STUMBLE_T = 3, CHASE_T = 8, HUFF_PARTED_T = 6, HUFF_SNATCHED_T = 3;

const smooth = (u: number): number => {
  const k = Math.max(0, Math.min(1, u));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const lerpP = (a: Pt, b: Pt, u: number): Pt => P2(lerp(a.x, b.x, u), lerp(a.y, b.y, u));
/** The span of `t` inside [a, b] as 0 to 1, eased. */
const seg = (t: number, a: number, b: number): number => smooth((t - a) / (b - a));

/** Blend two arms: both of one mode move between them, else the nearer one holds. */
function blendArm(a: Arm, b: Arm, u: number): Arm {
  if ('a' in a && 'a' in b) return { a: lerp(a.a, b.a, u), bend: lerp(a.bend, b.bend, u) };
  if ('x' in a && 'x' in b) return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), hx: lerp(a.hx, b.hx, u), hy: lerp(a.hy, b.hy, u) };
  return u < 0.5 ? a : b;
}
/** Blend two poses (numbers between, feet and knees by point, the arms by blendArm, the face and the rest from the nearer). */
function blend(a: Pose, b: Pose, u: number): Pose {
  const n = (x: number | undefined, y: number | undefined): number => lerp(x ?? 0, y ?? 0, u);
  const pt = (x: Pt | undefined, y: Pt | undefined): Pt | undefined => (x && y ? lerpP(x, y, u) : u < 0.5 ? x : y);
  const o: Pose = { lean: n(a.lean, b.lean), crouch: n(a.crouch, b.crouch), bob: n(a.bob, b.bob), tilt: n(a.tilt, b.tilt), toeF: n(a.toeF, b.toeF), toeB: n(a.toeB, b.toeB), expr: (u < 0.5 ? a : b).expr };
  const footF = pt(a.footF, b.footF), footB = pt(a.footB, b.footB), kneeF = pt(a.kneeF, b.kneeF), kneeB = pt(a.kneeB, b.kneeB);
  if (footF) o.footF = footF;
  if (footB) o.footB = footB;
  if (kneeF) o.kneeF = kneeF;
  if (kneeB) o.kneeB = kneeB;
  o.armF = blendArm(a.armF ?? { a: 0.12, bend: 0.17 }, b.armF ?? { a: 0.12, bend: 0.17 }, u);
  o.armB = blendArm(a.armB ?? { a: -0.1, bend: 0.1 }, b.armB ?? { a: -0.1, bend: 0.1 }, u);
  return o;
}

/* ---------- the poses (the picked variants of scratch/s6-options-poses.ts, -pigeon, -water, -peel, -pom) ---------- */

/** Notice 2, the shy glance: he stops mid-step, his head turned (tilt 0.2); her hands clasped, her chin down. */
const NOTICE_HIM: Pose = { lean: 0.03, tilt: 0.2, footF: P2(0.13, 0), footB: P2(-0.12, -0.02), toeB: 0.5, expr: 'chat', armF: { a: -0.35, bend: 0.4 }, armB: { a: 0.3, bend: 0.3 } };
const NOTICE_HER: Pose = { lean: 0.02, tilt: 0.16, expr: 'bench', armF: { x: 0.07, y: 0.14, hx: 0.4, hy: 1 }, armB: { x: 0.06, y: 0.15, hx: -0.2, hy: 1 } };
/** Bench 2, head on his shoulder: she leans 0.2 rad toward him and tips her head 0.25; he sits up, a hand at the seat's edge. */
const BENCH_HIM: Pose = { lean: 0.02, expr: 'bench', armF: { x: 0.14, y: 0.22, hx: -0.2, hy: 1 } };
/** Huff 1: arms folded, the chin up (tilt -0.08); her foot taps at 1 Hz (04 9.3). */
const FOLDED: Pose = { lean: -0.03, tilt: -0.08, expr: 'huff', armF: { x: 0.075, y: 0.1, hx: 0.3, hy: 1 }, armB: { x: 0.085, y: 0.075, hx: 0.1, hy: 1 } };
/** Laugh 1: heads back 0.15 rad, he mirrors her (04 9.3). */
const LAUGH_HIM: Pose = { lean: -0.06, tilt: -0.15, expr: 'laugh', armF: { x: 0.07, y: 0.12, hx: 0.3, hy: 1 }, armB: { a: -0.2, bend: 0.3 } };
const LAUGH_HER: Pose = { lean: -0.04, tilt: -0.15, expr: 'laugh', armF: { x: 0.06, y: -0.13, hx: 0.5, hy: 1 } };

/** The stumble's frames (plop and grin): the step, the slip, down sitting with her legs out, up with a hand on the ground, standing. */
const STEP: Pose = { lean: 0.035, footF: P2(0.14, 0), footB: P2(-0.13, -0.03), toeB: 0.6, expr: 'stumble', armF: { a: -0.5, bend: 0.4 }, armB: { a: 0.5, bend: 0.3 } };
const SLIP: Pose = { lean: -0.25, crouch: 0.16, footF: P2(0.34, -0.06), kneeF: P2(1, -0.3), footB: P2(0.28, -0.02), kneeB: P2(1, -0.3), expr: 'stumble', armF: { a: 1.6, bend: 0.1 }, armB: { a: -1.5, bend: 0.1 } };
const PLOP: Pose = { lean: -0.06, crouch: 0.34, footF: P2(0.37, 0), kneeF: P2(1, -0.2), footB: P2(0.35, 0.005), kneeB: P2(1, -0.2), expr: 'bench', armF: { x: 0.0, y: 0.3, hx: 0.5, hy: 1 }, armB: { x: -0.12, y: 0.31, hx: -0.3, hy: 1 } };
const PUSH: Pose = { lean: 0.16, crouch: 0.18, footF: P2(0.14, 0), kneeF: P2(1, -0.5), footB: P2(-0.1, 0), kneeB: P2(0.5, 1), expr: 'bench', armF: { x: 0.2, y: 0.4, hx: 1, hy: 0.3 }, armB: { x: 0.06, y: 0.42, hx: 0.3, hy: 1 } };
const STAND: Pose = { lean: 0.04, footF: P2(0.05, 0), footB: P2(-0.02, 0), expr: 'bench', armF: { x: 0.13, y: 0.3, hx: -0.2, hy: 1 }, armB: { x: 0.04, y: 0.28, hx: -0.4, hy: 1 } };

/** The wipe's reach: the hand at her head (the body frame, above the shoulder line) or at rest. */
const reachRest = (x = 0.04, y = 0.17): Arm => ({ x, y, hx: -0.4, hy: 1 });
const reachHead: Arm = { x: 0.0, y: -0.34, hx: -1, hy: -0.3 };
const reachHat: Arm = { x: 0.24, y: 0.07, hx: 0.5, hy: 1 };

/** The side of the screen a partner is on, in the figure's own facing frame: +1 ahead of it, -1 behind. */
function partnerSide(v: Visitor, face: 1 | -1): 1 | -1 {
  const p = pairById(v.job.pairId ?? v.pairId), o = p ? byId(p.a === v.id ? p.b : p.a) : undefined;
  if (!o) return 1;
  const c = Math.cos(cam.ang), s = Math.sin(cam.ang), dx = o.x - v.x, dy = o.y - v.y;
  const sx = dx * (c - s) - dy * (s + c);
  return sx * face >= 0 ? 1 : -1;
}

const wipePose = (t: number, hasHat: boolean): { pose: Pose; hatOff: boolean } => {
  // 0 to 1 s the back hand comes up to her hair; 1 to 1.4 the front hand takes the hat off; 1.4 to 2.1 it comes down in her hand; held to 2.5;
  // 2.5 to 3.0 it goes back up; on at 3.0; both hands down by 4 s (04 9.3 row poop)
  const back = t < 1 ? blendArm(reachRest(), reachHead, seg(t, 0, 1)) : t < 3.4 ? { ...reachHead, x: reachHead.x + 0.015 * Math.sin(t * 9) } : blendArm(reachHead, reachRest(), seg(t, 3.4, 4));
  let front: Arm = reachRest(0.07, 0.15), hatOff = false;
  if (hasHat) {
    if (t < 1) front = reachRest(0.07, 0.15);
    else if (t < 1.4) front = blendArm(reachRest(0.07, 0.15), reachHead, seg(t, 1, 1.4));
    else if (t < 2.1) {
      front = blendArm(reachHead, reachHat, seg(t, 1.4, 2.1));
      hatOff = true;
    } else if (t < 2.5) {
      front = reachHat;
      hatOff = true;
    } else if (t < 3) {
      front = blendArm(reachHat, reachHead, seg(t, 2.5, 3));
      hatOff = t < 2.95;
    } else front = blendArm(reachHead, reachRest(0.07, 0.15), seg(t, 3, 4));
  }
  return { pose: { lean: 0.02, tilt: 0.08, expr: 'huddle', armF: front, armB: back }, hatOff };
};

/** The trip's four frames across 3 s (04 9.3 row trip), eased between: the step, the slip at 0.3 s, down at 0.9 s, held, up by 2.3, standing. */
function stumblePose(t: number): Pose {
  if (t < 0.3) return blend(STEP, SLIP, seg(t, 0, 0.3));
  if (t < 0.9) return blend(SLIP, PLOP, seg(t, 0.3, 0.9));
  if (t < 1.6) return PLOP;
  if (t < 2.3) return blend(PLOP, PUSH, seg(t, 1.6, 2.3));
  return blend(PUSH, STAND, seg(t, 2.3, 3));
}

/** The snatched chase 1: a run with both arms raised 1.3 rad (04 9.3 row snatched), the legs swinging with the walk phase. */
function chasePose(ph: number): Pose {
  const s = Math.sin(ph), lift = (k: number): number => -0.09 * Math.max(0, k);
  return {
    lean: 0.2, bob: -0.03 - 0.012 * Math.abs(Math.sin(ph * 2)), swing: s, expr: 'stumble',
    footF: P2(0.03 + 0.2 * s, lift(-s)), footB: P2(-0.03 - 0.2 * s, lift(s)), toeB: s > 0 ? 0.9 : 0.1, toeF: s < 0 ? 0.9 : 0.1,
    armF: { a: 1.3, bend: 0.1 }, armB: { a: 1.3, bend: 0.1 },
  };
}

const SELF: Move = { kind: 'notice', pose: {}, t: 0, hatOff: false, hatHand: false, splat: 0, poof: -1, wet: false, shake: 0, k: 0, her: false };

/**
 * The body pose of `v` in a romance stage or a reaction, or null when its state has none (it is drawn by the rig's own state). `face` is
 * its facing on screen, `tSim` sim seconds, `ph` the walk phase poseOf worked out. Written into a shared record, valid until the next call.
 */
export function moveOf(v: Visitor, face: 1 | -1, tSim: number, ph: number): Move | null {
  const m = SELF;
  m.hatOff = false;
  m.hatHand = false;
  m.splat = 0;
  m.poof = -1;
  m.wet = false;
  m.shake = 0;
  m.t = 0;
  m.k = 0;
  m.her = false;
  const f = v.sex === 'f';
  switch (v.st) {
    case 'notice':
      if (v.path) return null;
      m.kind = 'notice';
      m.pose = f ? NOTICE_HER : NOTICE_HIM;
      return m;
    case 'bench': {
      if (v.sitPropId === 0) return null;
      m.kind = 'bench';
      m.k = partnerSide(v, face);
      m.her = f;
      if (!f) m.pose = BENCH_HIM;
      else m.pose = { lean: 0.2 * m.k, tilt: 0.25 * m.k, expr: 'bench' };
      return m;
    }
    case 'huff': {
      m.kind = 'huff';
      const tap = f || v.job.kind !== 'parted' ? Math.max(0, Math.sin(tSim * TAU)) : 0; // her foot taps once a second (04 9.3)
      m.pose = tap > 0 ? { ...FOLDED, footF: P2(0.07, -0.02 * tap), toeF: -0.35 * tap } : FOLDED;
      return m;
    }
    case 'laugh': {
      m.kind = 'laugh';
      const base = f ? LAUGH_HER : LAUGH_HIM;
      m.pose = { ...base, bob: -0.016 * Math.abs(Math.sin(tSim * TAU)) }; // a bob at 2 Hz: the absolute sine has a period of half a second
      return m;
    }
    case 'wipe': {
      m.kind = 'wipe';
      m.t = Math.max(0, Math.min(WIPE_T, WIPE_T - v.t));
      const w = wipePose(m.t, v.items.hat);
      m.pose = w.pose;
      m.hatOff = w.hatOff;
      m.hatHand = true;
      m.splat = m.t < 3 ? 1 : Math.max(0, WIPE_T - m.t);
      return m;
    }
    case 'shake': {
      m.kind = 'shake';
      m.t = Math.max(0, Math.min(SHAKE_T, SHAKE_T - v.t));
      const sh = Math.sin(tSim * TAU * 6) * 0.25; // arms out, shaking +-0.25 rad at 6 Hz (04 9.3 row soaked)
      m.shake = sh;
      m.wet = true;
      m.pose = { lean: 0.06 * Math.sign(sh || 1), tilt: 0.3 * sh, expr: 'huddle', armF: { a: 1.5 + 0.3 * sh, bend: 0 }, armB: { a: -1.45 - 0.3 * sh, bend: 0 } };
      return m;
    }
    case 'stumble': {
      m.kind = 'stumble';
      m.t = Math.max(0, Math.min(STUMBLE_T, STUMBLE_T - v.t));
      m.pose = stumblePose(m.t);
      m.poof = m.t >= 0.3 && m.t < 1.5 ? (m.t - 0.3) / 1.2 : -1;
      return m;
    }
    case 'chase':
      m.kind = 'chase';
      m.pose = chasePose(ph);
      return m;
    default:
      return null;
  }
}

/* ---------- the bench lean at far zoom (owner 2026-10-22: "the bench lean strengthened at Fit") ---------- */

/**
 * Floors of the bench lean, in px of the head's sideways shift, which act only at far zoom like the featured glow's (ghost.ts RING_MIN): at Fit a
 * figure is 6.6 px tall, so her 0.2 rad lean moved her head 0.6 px and a pair on a bench read as two upright figures. Her head now keeps at
 * least BENCH_LEAN_PX of lean toward him (16 degrees at Fit); he, who sits up, leans BENCH_LEAN_HIM_PX toward her at Fit and nothing from 16 px
 * of height up (zoom 0.73), so that the zooms of 1.3 and 2.4 draw both of them exactly as before. (Looked at on a pair at Fit: 1.6 and 0.9 px put the
 * two heads on top of each other and the pair read as one figure, 1.0 and 0.4 nearly; 0.8 and 0.3 keep two heads, tilted together.) Her natural shift
 * is 0.0857 h, which crosses BENCH_LEAN_PX at 9.3 px of height (zoom 0.42): the floor meets her own lean without a step. `h` is the figure's height.
 */
export const BENCH_LEAN_PX = 0.8, BENCH_LEAN_HIM_PX = 0.3;
/** The head's distance from the hips in heights (figure-pose.ts skel with her 0.25 tilt: a lean of a rad moves it 0.427 h sin(a)); the ramp of his floor, in px of height. */
const BENCH_HEAD = 0.427, HIM_FULL_H = 9, HIM_NONE_H = 16, LEAN_EPS = 0.005;
/** The lean (rad, signed toward the partner by `m.k`) the bench pose has at drawn height h, floors included. */
export function benchLeanAt(m: Move, h: number): number {
  const base = m.pose.lean ?? 0;
  const px = m.her ? BENCH_LEAN_PX : BENCH_LEAN_HIM_PX * (1 - seg(h, HIM_FULL_H, HIM_NONE_H));
  if (px <= 0 || h <= 0) return base;
  const need = Math.asin(Math.min(0.95, px / (BENCH_HEAD * h)));
  return need > Math.abs(base) + LEAN_EPS ? m.k * need : base; // the floor's reach is a constant, her own lean's varies a hair: no change under LEAN_EPS
}
/** `m` with the bench lean of its height h: `m` itself when the floor changes nothing (1.3, 2.4), else a copy with the leaning pose. */
export function benchMove(m: Move, h: number): Move {
  if (m.kind !== 'bench') return m;
  const lean = benchLeanAt(m, h);
  return lean === (m.pose.lean ?? 0) ? m : { ...m, pose: { ...m.pose, lean } };
}

/* ---------- what rides on the body ---------- */

/** A hat in the hand `at`, by its kind: a beret's soft disc, a cap's crown and peak, a sunhat's brim; `hr` the head radius in px. */
function hatInHand(pen: Pen, at: Pt, hr: number, look: RigLook, face: 1 | -1): void {
  const { ctx } = pen, P = pen.spec.palette;
  const hex = look.hatHex || P.ink;
  ctx.save();
  ctx.translate(at.x, at.y - 0.8 * hr);
  ctx.rotate(-0.15 * face);
  ctx.fillStyle = shade(hex, 1);
  ctx.strokeStyle = GC(P.ink, 0.8);
  ctx.lineWidth = Math.max(0.8, 0.22 * hr);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (look.hat === 'sunhat') ctx.ellipse(0, 0, 1.6 * hr, 0.5 * hr, 0, 0, TAU);
  else ctx.ellipse(0, 0, 1.15 * hr, 0.5 * hr, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  if (look.hat === 'beret') {
    ctx.beginPath();
    ctx.moveTo(0, -0.45 * hr);
    ctx.lineTo(0, -0.75 * hr);
    ctx.lineWidth = Math.max(0.8, 0.3 * hr);
    ctx.stroke();
  } else if (look.hat === 'cap') {
    ctx.fillStyle = shade(mix(hex, P.ink, 0.25), 1);
    ctx.beginPath();
    ctx.ellipse(face * 1.0 * hr, 0.1 * hr, 0.55 * hr, 0.22 * hr, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw what rides on `mv` after the body `S` stood at `p` facing `face`: the wipe's hat in her hand and the paper dollop on it or on her
 * head; the shake's puddle, drops, motion arcs and the sheen on her shoulders; the stumble's poof of dust.
 */
export function drawMoveExtras(c: Ink, p: Pt, face: 1 | -1, S: Skel, look: RigLook, mv: Move): void {
  const pen = c.pen, { ctx } = pen, h = S.h, hr = S.hr, z = pen.z;
  const at = (q: Pt): Pt => P2(p.x + q.x * face, p.y + q.y);
  if (mv.kind === 'wipe') {
    const hand = at(S.haF);
    if (mv.hatOff) {
      hatInHand(pen, hand, hr, look, face);
      if (mv.splat > 0) splat(pen, P2(hand.x + 0.1 * hr, hand.y - 1.15 * hr), hr * 0.85 * mv.splat, 1);
    } else if (mv.splat > 0) splat(pen, P2(p.x + S.head.x * face + 0.15 * hr, p.y + S.head.y - 1.28 * hr), hr * mv.splat, 1);
    return;
  }
  if (mv.kind === 'shake') {
    const f1 = P2(p.x, p.y);
    ctx.fillStyle = GC(pen.spec.palette.water, 0.5);
    ctx.beginPath();
    ctx.ellipse(f1.x, f1.y + 1, 0.3 * h, 0.09 * h, 0, 0, TAU);
    ctx.fill();
    const pts: Array<[number, number]> = [[-0.5, -0.9], [0.5, -0.86], [-0.62, -0.5], [0.62, -0.46], [-0.3, -1.08], [0.3, -1.06], [-0.34, -0.22], [0.36, -0.2]];
    pts.forEach(([ux, uy], i) => dropDot(pen, P2(p.x + ux * h * 0.55, p.y + uy * h + Math.sin(mv.shake * 12 + i) * 0.02 * h), 8 * z, 0.55, 0.95));
    // the shake's motion: two short arcs outside each hand
    ctx.strokeStyle = GC(pen.spec.palette.paper, 0.85);
    ctx.lineWidth = Math.max(0.8, 0.012 * h);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const hand = at(side > 0 ? S.haF : S.haB);
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, (0.06 + 0.045 * i) * h, side > 0 ? -0.9 : Math.PI - 0.7, side > 0 ? 0.9 : Math.PI + 1.1);
        ctx.stroke();
      }
    }
    // sheen on the shoulders
    ctx.strokeStyle = GC(pen.spec.palette.paper, 0.7);
    ctx.lineWidth = Math.max(0.7, 0.012 * h);
    ctx.beginPath();
    ctx.moveTo(p.x + (S.shoulderL.x + 0.02 * h) * face, p.y + S.shoulderL.y + 0.01 * h);
    ctx.lineTo(p.x + (S.shoulderR.x - 0.03 * h) * face, p.y + S.shoulderR.y + 0.012 * h);
    ctx.stroke();
    return;
  }
  if (mv.kind === 'stumble' && mv.poof >= 0) poof(pen, P2(p.x - 0.3 * h * face, p.y), mv.poof); // the cloud behind her, as the page left it
}

/** A soaked figure's clothes: the top and the lower toward the water by 0.3 (the options page's tint). */
export function wetLook(look: RigLook, P: { water: string }, out: RigLook): RigLook {
  Object.assign(out, look);
  out.top = mix(look.top, P.water, 0.3);
  out.low = mix(look.low, P.water, 0.3);
  return out;
}
