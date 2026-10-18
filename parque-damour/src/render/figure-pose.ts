// src/render/figure-pose.ts
// The romance poses' solver (register section 4 row "Romance art", owner 2026-10-18; 04 9.2): a Skel built from free numbers (lean,
// crouch, feet, knees, arm targets in the body frame or at a local point) with the same anchors, IK and body frame as figure-rig.ts
// solveH, drawn through figure-garments.ts drawRigPerson with the solved Skel, so the garments, faces and props are the rig's own; and a
// hand drawn on top (a hand round a partner, or raised to the face, which the rig's draw order would hide).
// NEW, ported from the owner-approved options page scratch/s5-options-pose.ts (2026-10-18) with the imports moved to src/render.
// Split out of figures.ts along 03 2.7 (AGENTS rule 9).
import { GC, shade, type Pt } from './ambient.ts';
import { LOD, P2, ik, type Expr, type Ink, type Item, type RigLook, type Skel, opts } from './figure-rig.ts';
import { drawRigPerson } from './figure-garments.ts';

/** An arm: an angle from hanging (+ forward) and an elbow bend, or a hand target in the body frame (from the shoulder line), or a local px point. */
export type Arm = { a: number; bend: number } | { x: number; y: number; hx: number; hy: number } | { at: Pt; hx: number; hy: number };
export type Pose = {
  lean?: number; crouch?: number; bob?: number; tilt?: number;
  footF?: Pt; footB?: Pt; // in units of h, local (x forward, y down)
  toeF?: number; toeB?: number;
  kneeF?: Pt; kneeB?: Pt; // IK hints
  armF?: Arm; armB?: Arm;
  sit?: { seatPx: number; slope: number };
  expr?: Expr; itemF?: Item; itemB?: Item; swing?: number;
};

const sub = (a: Pt, b: Pt): Pt => P2(a.x - b.x, a.y - b.y);
const len = (a: Pt): number => Math.hypot(a.x, a.y);

/** The skeleton of a pose at drawn height h (the joints solveH builds, from free numbers). */
export function skel(h: number, s: Pose): Skel {
  const hr = 0.1 * h, lw = Math.max(0.9, 0.06 * h);
  const lean = s.lean ?? 0, bob = s.bob ?? 0, tilt = s.tilt ?? 0;
  let crouch = s.crouch ?? 0;
  let footF = P2(0.03 * h, 0), footB = P2(-0.03 * h, 0);
  const sitting = !!s.sit;
  if (s.sit) {
    crouch = 0.24 * h;
    const seat = s.sit.seatPx - 0.14 * h, fx = 0.165 * h;
    footF = P2(fx + 0.01 * h, seat + (fx + 0.01 * h) * s.sit.slope - 0.005 * h);
    footB = P2(fx - 0.035 * h, seat + (fx - 0.035 * h) * s.sit.slope - 0.012 * h);
  }
  if (s.footF) footF = P2(s.footF.x * h, s.footF.y * h);
  if (s.footB) footB = P2(s.footB.x * h, s.footB.y * h);
  const pelvis0 = P2(0, -0.38 * h + (s.sit ? crouch : crouch * h) + bob * h);
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const up0 = (x: number, y: number): Pt => P2(pelvis0.x + x * cl - y * sl, pelvis0.y + x * sl + y * cl);
  const hipF0 = P2(0.03 * h * cl, pelvis0.y), hipB0 = P2(-0.03 * h * cl, pelvis0.y);
  const thigh = 0.19 * h, shin = 0.19 * h;
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
  const kf = ik(hipF, footF, thigh, shin, s.kneeF ?? P2(1, 0));
  const kb = ik(hipB, footB, thigh, shin, s.kneeB ?? P2(1, 0));
  const shW = 0.08 * h;
  const shF = up(shW * 0.9, -0.26 * h), shB = up(-shW * 0.9, -0.26 * h);
  const tiltX = Math.sin(tilt) * 0.06 * h;
  const ua = 0.16 * h, fa = 0.14 * h;
  const arm = (spec: Arm, root: Pt, side: 1 | -1): { el: Pt; ha: Pt } => {
    if ('a' in spec) {
      const a0 = spec.a + lean, b = a0 + spec.bend, sp = 0.03 * side;
      const el = P2(root.x + Math.sin(a0 + sp) * ua, root.y + Math.cos(a0 + sp) * ua);
      return { el, ha: P2(el.x + Math.sin(b + sp * 0.6) * fa, el.y + Math.cos(b + sp * 0.6) * fa) };
    }
    const target = 'at' in spec ? spec.at : up(spec.x * h, spec.y * h - 0.26 * h);
    const r = ik(root, target, ua, fa, P2(spec.hx, spec.hy));
    return { el: r.joint, ha: r.tip };
  };
  const aF = arm(s.armF ?? { a: 0.12, bend: 0.17 }, shF, 1), aB = arm(s.armB ?? { a: -0.1, bend: 0.1 }, shB, -1);
  return {
    h, hr, lw, lean, pelvis, hipF, hipB, kneeF: kf.joint, kneeB: kb.joint, footF: kf.tip, footB: kb.tip, toeF: s.toeF ?? 0, toeB: s.toeB ?? 0,
    shF, shB, shoulderL: up(-shW, -0.31 * h), shoulderR: up(shW, -0.31 * h), shoulder: up(0, -0.28 * h),
    elF: aF.el, elB: aB.el, haF: aF.ha, haB: aB.ha, neck: up(0, -0.31 * h), head: up(0.01 * h + tiltX, -0.44 * h + Math.abs(tiltX) * 0.4),
    tilt, up, sitting, items: { F: s.itemF ?? 'none', B: s.itemB ?? 'none' }, expr: s.expr ?? 'idle', swing: s.swing ?? 0,
  };
}

/** A figure on screen: its feet anchor, facing, look and the drawn height. */
export type Fig = { p: Pt; face: 1 | -1; look: RigLook; h: number };
/** A screen point into a figure's local frame, and back. */
export const toLocal = (f: Fig, q: Pt): Pt => P2((q.x - f.p.x) * f.face, q.y - f.p.y);
export const toScreen = (f: Fig, q: Pt): Pt => P2(f.p.x + q.x * f.face, f.p.y + q.y);

/** Draw a posed figure; `lookAt` turns the eyes (0 the facing). */
export function drawPose(c: Ink, f: Fig, S: Skel, lookAt: 1 | -1 | 0 = 0): Skel | null {
  return drawRigPerson(c, f.p, f.look, opts({ face: f.face, expr: S.expr, lookAt }), S);
}

/** A hand drawn on top (a hand round a partner's back that the partner's body would otherwise hide): a skin oval with the ink rim. */
export function handOver(c: Ink, f: Fig, S: Skel, front: boolean, cuff = true, k = 1): void {
  const { ctx } = c.pen;
  const P = c.pen.spec.palette;
  if (S.h < LOD.expression) return;
  const ha = toScreen(f, front ? S.haF : S.haB), el = toScreen(f, front ? S.elF : S.elB);
  const ang = Math.atan2(ha.y - el.y, ha.x - el.x);
  const skin = P.skin[f.look.skin % P.skin.length] as string;
  ctx.save();
  // the cuff, then the hand: as the sleeve ends, so it reads as the same arm come round
  const cuff_ = P2(ha.x - Math.cos(ang) * 0.035 * S.h, ha.y - Math.sin(ang) * 0.035 * S.h);
  ctx.lineCap = 'round';
  if (cuff) {
    ctx.strokeStyle = GC(P.ink);
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 0.05 * S.h + S.lw * 0.85;
    ctx.beginPath();
    ctx.moveTo(cuff_.x - Math.cos(ang) * 0.02 * S.h, cuff_.y - Math.sin(ang) * 0.02 * S.h);
    ctx.lineTo(cuff_.x, cuff_.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = shade(f.look.top, 1);
    ctx.lineWidth = 0.05 * S.h;
    ctx.stroke();
  }
  ctx.fillStyle = shade(skin, 0.97);
  ctx.strokeStyle = GC(P.ink);
  ctx.lineWidth = S.lw * 0.6;
  ctx.beginPath();
  ctx.ellipse(ha.x, ha.y, 0.026 * S.h * k, 0.03 * S.h * k, ang, 0, Math.PI * 2);
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fill();
  ctx.restore();
}

/** Where B's feet go so that the two heads sit `gap` px apart (A faces +1 at pA, B faces -1), with B's ground `dy` px lower. */
export function placeB(pA: Pt, SA: Skel, SB: Skel, gap: number, dy = 0): Pt {
  return P2(pA.x + SA.head.x + SB.head.x + gap, pA.y + dy);
}
