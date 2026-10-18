// src/render/romance-art.ts
// The romance poses as the owner picked them on 2026-10-18 (register section 4 row "Romance art"; 04 9.2): kiss 1 (a gentle lean-in,
// eyes closed, the left one's hand at the other's waist, the other's hand on that one's arm), proposal 1 (the initiator on one knee
// holding an open ring box, the ring sparkle at 8 s, the other's hands to her mouth from 12 s; both stand and embrace in the last second),
// and the Stroll arm in arm (the follower's near arm through the leader's crooked arm, her hand on his forearm, in step). The two of a
// pair in one of these are drawn together, at the initiator's drawable (the other's is skipped), from the sim's places and timers.
// NEW, ported from the approved options page scratch/s5-options-scenes.ts (kissPoses/drawKissAt variant 1, proposal variant 1 with the
// KNEEL pose, strollScene) through figure-pose.ts. Changes: the figure on the left of the screen takes the page's left role whatever the
// sex; a Proposal whose initiator stands on the right is drawn mirrored about the pair's middle; the lean of the Kiss eases in over its
// first second and out over its last (04 9.2); the kneel crouches 0.20 h as the page did, not 04 7.1's 0.30 h (a deviation the owner's
// pick carries); the embrace (the page's beat 15) shows from 14 s, since Happily follows the 15th second at once.
import { DAYLEN, T } from '../core/clock.ts';
import { byId, type Visitor } from '../entities/visitor.ts';
import { pairById, type Pair } from '../entities/romance.ts';
import { depthOf } from './order.ts';
import { view } from './camera.ts';
import { style, type Pt } from './ambient.ts';
import { P2, type Ink, type RigLook, type Skel } from './figure-rig.ts';
import { lookOf, newLook } from './figure-look.ts';
import { figureScale } from './figures.ts';
import { drawPose, handOver, placeB, skel, toLocal, toScreen, type Fig, type Pose } from './figure-pose.ts';
import { ringBox } from './romance-fx.ts';
import { anchorOf, type Anchor } from './people.ts';

export type PairArt = 'kiss' | 'proposal' | 'embrace' | 'stroll';
/** The most the two of a Stroll may be apart (tiles) to be drawn arm in arm (assumption S5-A10). */
export const ARM_IN_ARM = 0.9;

/** The pair pose `v` is drawn in now, with its pair; null when it draws on its own (04 9.2). */
export function pairArtOf(v: Visitor): { art: PairArt; p: Pair; o: Visitor } | null {
  const p = pairById(v.job.pairId ?? 0);
  if (!p || p.doing === 0) return null;
  const o = byId(v.id === p.a ? p.b : p.a);
  if (!o || o.job.pairId !== p.id || o.st !== v.st) return null;
  // arm in arm only while close enough to link (the follower can trail after a corner): apart, each walks on its own
  if (v.st === 'stroll') return Math.hypot(o.x - v.x, o.y - v.y) <= ARM_IN_ARM ? { art: 'stroll', p, o } : null;
  if (v.path || o.path) return null;
  if (v.st === 'kiss') return { art: 'kiss', p, o };
  if (v.st === 'proposal') return { art: 15 - p.stageT >= 14 ? 'embrace' : 'proposal', p, o };
  return null;
}

const AA: Anchor = { x: 0, y: 0, gx: 0, gy: 0, h: 0, e: 0, sit: false };
const AB: Anchor = { x: 0, y: 0, gx: 0, gy: 0, h: 0, e: 0, sit: false };
const LA = newLook(), LB = newLook();
function newLookFor(v: Visitor, out: RigLook): RigLook {
  return lookOf(v, style().palette, figureScale(v), out);
}
const fig = (p: Pt, face: 1 | -1, look: RigLook, h: number): Fig => ({ p, face, look, h });
const bodyAt = (f: Fig, S: Skel, h: number, ux: number, uy: number): Pt => toScreen(f, S.up(ux * h, uy * h));

/** Kiss 1 (scenes kissPoses/drawKissAt variant 1): both lean in, the left one's hand at the other's waist, the other's on its arm. */
function kiss(c: Ink, lv: Visitor, rv: Visitor, mid: Pt, h: number, p: Pair): void {
  const el = 10 - p.stageT, lean = 0.25 * Math.max(0, Math.min(1, el, 10 - el));
  const a: Pose = { lean, expr: 'kiss' }, b: Pose = { lean, expr: 'kiss' };
  let SA = skel(h, a), SB = skel(h, b);
  const pA = P2(mid.x - 0.22 * h, mid.y), pB = placeB(pA, SA, SB, 0.17 * h);
  const A = fig(pA, 1, newLookFor(lv, LA), h), B = fig(pB, -1, newLookFor(rv, LB), h);
  SA = skel(h, { ...a, armF: { at: toLocal(A, bodyAt(B, SB, h, -0.02, -0.12)), hx: 0, hy: 1 } });
  SB = skel(h, { ...b, armF: { at: toLocal(B, bodyAt(A, SA, h, 0.05, -0.27)), hx: 0, hy: 1 } });
  drawPose(c, A, SA);
  drawPose(c, B, SB);
}

/** One knee down (scenes KNEEL): the front knee up, the back knee on the ground, the back foot on its toes; crouch 0.20 h. */
const KNEEL: Pose = { crouch: 0.2, lean: 0.06, footF: P2(0.17, 0), kneeF: P2(0.3, -1), footB: P2(-0.2, -0.005), kneeB: P2(0, 1), toeB: 1.15, expr: 'propose' };

/** Proposal 1 (scenes proposal variant 1): the kneeler `kv` with the open box, the other `ov` surprised, hands to her mouth from 12 s. */
function proposal(c: Ink, kv: Visitor, ov: Visitor, mid: Pt, h: number, p: Pair, mirror: boolean): void {
  const ctx = c.pen.ctx, el = 15 - p.stageT;
  ctx.save();
  if (mirror) {
    ctx.translate(mid.x * 2, 0);
    ctx.scale(-1, 1);
  }
  const pA = P2(mid.x - 0.3 * h, mid.y + 0.02 * h), pB = P2(mid.x + 0.22 * h, mid.y);
  const A = fig(pA, 1, newLookFor(kv, LA), h), B = fig(pB, -1, newLookFor(ov, LB), h);
  const hands = el >= 12;
  const faceHands: Pose = { lean: -0.05, tilt: -0.04, expr: 'receive', armF: { x: 0.105, y: -0.1, hx: 0.5, hy: 1 }, armB: { x: 0.085, y: -0.095, hx: 0.3, hy: 1 } };
  const surprised: Pose = { lean: -0.03, expr: 'receive', armF: { a: 0.35, bend: 0.5 }, armB: { a: 0.15, bend: 0.4 } };
  let SA = skel(h, { ...KNEEL, armF: { x: 0.25, y: 0.02, hx: 0, hy: 1 } });
  SA = skel(h, { ...KNEEL, armF: { x: 0.25, y: 0.02, hx: 0, hy: 1 }, armB: { at: P2(SA.kneeF.x - 0.01 * h, SA.kneeF.y - 0.025 * h), hx: 0, hy: 1 } });
  const SB = skel(h, hands ? faceHands : surprised);
  drawPose(c, A, SA);
  ringBox(c.pen, toScreen(A, SA.haF), h, 1, el >= 8 && el < 9);
  drawPose(c, B, SB);
  if (hands) {
    // her hands at her face sit under her head in the rig's draw order: drawn over it (the owner's note)
    handOver(c, B, SB, false, false, 0.85);
    handOver(c, B, SB, true, false, 0.85);
  }
  ctx.restore();
}

/** The embrace (scenes proposal beat 15): both standing, arms round each other, eyes closed. */
function embrace(c: Ink, lv: Visitor, rv: Visitor, mid: Pt, h: number): void {
  const pA = P2(mid.x - 0.2 * h, mid.y);
  let SA = skel(h, { lean: 0.08, expr: 'bench' }), SB = skel(h, { lean: 0.04, tilt: -0.08, expr: 'receive' });
  const pB = placeB(pA, SA, SB, 0.22 * h);
  const A = fig(pA, 1, newLookFor(lv, LA), h), B = fig(pB, -1, newLookFor(rv, LB), h);
  SA = skel(h, { lean: 0.08, expr: 'kiss', armF: { at: toLocal(A, bodyAt(B, SB, h, -0.075, -0.16)), hx: 0.2, hy: 1 }, armB: { at: toLocal(A, bodyAt(B, SB, h, -0.06, -0.22)), hx: 0, hy: 1 } });
  SB = skel(h, { lean: 0.04, tilt: -0.1, expr: 'kiss', armF: { at: toLocal(B, bodyAt(A, SA, h, -0.07, -0.3)), hx: 0, hy: 1 }, armB: { at: toLocal(B, bodyAt(A, SA, h, -0.06, -0.27)), hx: 0, hy: 1 } });
  drawPose(c, A, SA);
  drawPose(c, B, SB);
  handOver(c, A, SA, true);
}

/** A walking pose at phase s (scenes strollScene walk): the feet swinging, a small bob, in step. */
function walk(s: number, lean = 0.035): Pose {
  const sw = Math.sin(s) * 0.15;
  return { lean, footF: P2(sw * 0.9 + 0.03, 0), footB: P2(-sw * 0.9 - 0.03, 0), swing: Math.sin(s), bob: -Math.abs(Math.sin(s * 2)) * 0.02, toeB: Math.sin(s) > 0 ? 0.4 : 0, toeF: Math.sin(s) < 0 ? 0.4 : 0 };
}

/** Arm in arm (scenes strollScene): the leader's near arm crooked at the waist, the follower's near arm through it, one walk phase. */
function stroll(c: Ink, lead: Visitor, fol: Visitor, face: 1 | -1, h: number): void {
  const ph = T.abs * DAYLEN * 2.4 * 1.7 + lead.id * 1.7;
  const A = fig(P2(AA.x, AA.y), face, newLookFor(lead, LA), h), B = fig(P2(AB.x, AB.y), face, newLookFor(fol, LB), h);
  const SA = skel(h, { ...walk(ph), expr: 'bench', armB: { x: 0.04, y: 0.13, hx: -1, hy: 0.2 } });
  const crook = toScreen(A, SA.elB);
  const SB = skel(h, { ...walk(ph), expr: 'bench', lean: 0.06, armF: { at: toLocal(B, P2(crook.x + face * 0.04 * h, crook.y + 0.035 * h)), hx: 0, hy: 1 } });
  const behind = depthOf(fol.x, fol.y) <= depthOf(lead.x, lead.y);
  if (behind) {
    drawPose(c, B, SB);
    drawPose(c, A, SA);
  } else {
    drawPose(c, A, SA);
    drawPose(c, B, SB);
  }
  handOver(c, B, SB, true);
}

/**
 * Draw `v` as part of its pair's pose (people.ts drawPerson calls this first). 'skip' for the member the other draws, 'drawn' when both
 * were drawn here, 'none' when `v` draws on its own. `face` is the facing people.ts worked out for `v` (the leader's, for a stroll).
 */
export function drawPairArt(c: Ink, v: Visitor, face: 1 | -1): 'drawn' | 'skip' | 'none' {
  const r = pairArtOf(v);
  if (!r) return 'none';
  if (v.id !== r.p.a) return 'skip';
  anchorOf(v, AA);
  anchorOf(r.o, AB);
  const h = AA.h;
  if (h < 3 || view.cw === 0) return 'drawn';
  if (r.art === 'stroll') {
    stroll(c, v, r.o, face, h);
    return 'drawn';
  }
  const mid = P2((AA.x + AB.x) / 2, (AA.y + AB.y) / 2);
  const vLeft = AA.x <= AB.x, lv = vLeft ? v : r.o, rv = vLeft ? r.o : v;
  if (r.art === 'kiss') kiss(c, lv, rv, mid, h, r.p);
  else if (r.art === 'embrace') embrace(c, lv, rv, mid, h);
  else proposal(c, v, r.o, mid, h, r.p, !vLeft);
  return 'drawn';
}
