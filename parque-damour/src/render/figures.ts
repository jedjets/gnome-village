// src/render/figures.ts
// The visitor rig with the ref2 proportions (04 7.1), the LOD tiers, the expressions (7.5), the signature scarf (7.3), hats,
// and the three treatments: GV stick rig with a soft contour (A), capsule bodies with no line (B), ink contour with washes (C).
// Ported from GV 8045-8047 (SKIN, LINE, GH idea), 8169-8260 (drawGnome: the lean, bob and crouch frame, the sitting legs,
// the walk swing, the body line, the tunic stroke), 8331-8340 (arm angles and the back arm first), 8395-8414 (fringe, eyes,
// nose, cheeks), 8435-8440 (the selection ring recipe). ADAPT: hip -0.38, shoulder -0.66, head -0.82, head r 0.10,
// two-segment arms, FH 22; the hat is a beret, a flat cap or a sunhat, never GV's pointed hat.
// S4 part C (07 S4.6 steps 14-16; owner 2026-10-13: the rig variants are on their own options page, so this stage draws only the art
// already approved): lookOf, poseOf and drawVisitor adapt a Visitor record to drawFigure as it is: the Look from lookSeed through
// style().palette (skin, hair, coat, the hat and the skirt from the bits above the signature's, 04 7.1 rule 8), the signature scarf for
// singles only (04 7.3 item 2), child 0.65 and elder 0.95 (rule 1), idle, walk or sit from the record (`path`, `sitPropId`), the walk
// phase from sim seconds and move.ts speedOf (rule 3: walkPh grows at speed x 2.1 a second), the facing handed in by render/people.ts.
// The rig's own work waits for the owner's pick of a rig variant (07 S4.6 step 12); each piece has one TODO(S4-rig) line below.
// The selection ring is ghost.ts drawSelection; the featured pair's rose ring is S5's.
import { GC, ellipsePts, fillEllipse, fillPoly, inkLine, mix, shade, strokeLine, type Palette, type Pen, type Pt } from './ambient.ts';
import { signatureOf, type Visitor } from '../entities/visitor.ts';
import { speedOf } from '../entities/move.ts';

/** A grown visitor's height in px at zoom 1 (0.85 EH; 04 7.1 rule 1). */
export const FH = 22;

export type Hat = 'none' | 'beret' | 'cap' | 'sunhat';
export type Expr = 'idle' | 'chat' | 'bench' | 'kiss' | 'huff' | 'laugh';
export type Look = {
  seed: number;
  sex: 'f' | 'm';
  skin: number; // index into palette.skin
  hair: number; // index into palette.hair
  coat: number; // index into palette.coat
  signature: number; // index into palette.signature, -1 for none (the scarf, 04 7.3)
  hat: Hat;
  hatColour?: string; // a hex from the palette (the caller picks it)
  skirt?: boolean;
  scale?: number; // 1 grown, 0.65 child, 0.95 elder
};
export type Pose = {
  state: 'idle' | 'walk' | 'sit';
  face: 1 | -1;
  walkPh?: number;
  expr: Expr;
  lookAt?: 1 | -1; // eyes toward the partner
  blushK?: number; // 1, or 1.3 at Kiss and Proposal
};

/** Draw a visitor standing (or sitting) at ground point p in the direction's manner. */
export function drawFigure(pen: Pen, p: Pt, look: Look, pose: Pose): void {
  const { ctx, spec, z } = pen;
  const P = spec.palette;
  const h = FH * z * (look.scale ?? 1);
  if (h < 3) return;
  const face = pose.face;
  const skin = P.skin[look.skin % P.skin.length] as string;
  const hair = P.hair[look.hair % P.hair.length] as string;
  const coat = P.coat[look.coat % P.coat.length] as string;
  const trousers = mix(coat, P.ink, spec.line === 'ink' ? 0.25 : 0.45);
  const sig = look.signature >= 0 ? (P.signature[look.signature % P.signature.length] as string) : null;
  const lw = Math.max(0.9, 0.06 * h);
  // the contour: GV's max(0.9, 0.06 h) in A; ref2's thin pencil line in C
  const cw = spec.line === 'ink' ? Math.max(0.7, 0.5 * z) : lw;
  const jitterK = 0.45;
  const sitting = pose.state === 'sit';
  const walking = pose.state === 'walk';
  const ph = pose.walkPh ?? 0;
  const sw = walking ? Math.sin(ph) * 0.15 * h : 0;
  const bob = walking ? Math.abs(Math.sin(ph * 2)) * 0.02 * h : 0;
  const crouch = sitting ? 0.24 * h : 0;
  ctx.save();
  ctx.translate(p.x, p.y - bob + crouch);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the rig (fractions of h, up from the feet)
  const hipY = -0.38 * h, shY = -0.66 * h, headY = -0.82 * h, hr = 0.1 * h;
  const shW = 0.08 * h;
  const ink = spec.line === 'ink';
  const softLine = spec.line === 'soft';
  const seed = look.seed;
  const C = (x: number, y: number): Pt => ({ x, y });
  // a limb: a line in the garment colour with the direction's contour under or over it
  const limb = (pts: Pt[], hex: string, w: number, s: number): void => {
    if (softLine) strokeLine(pen, pts, P.ink, w + lw * 1.1, { open: true, alpha: 0.85 });
    strokeLine(pen, pts, hex, w, { open: true, seed: s, lineW: cw, jitterK });
  };
  // legs
  const legW = spec.id === 'B' ? lw * 1.9 : lw * 1.5;
  if (sitting) {
    const kneeF = C(face * 0.2 * h, hipY + 0.1 * h), footF = C(face * 0.16 * h, hipY + 0.34 * h);
    const kneeB = C(face * 0.12 * h, hipY + 0.12 * h), footB = C(face * 0.08 * h, hipY + 0.34 * h);
    limb([C(-face * 0.02 * h, hipY), kneeB, footB], trousers, legW * 0.95, seed + 1);
    limb([C(face * 0.02 * h, hipY), kneeF, footF], trousers, legW, seed + 2);
  } else {
    limb([C(-0.03 * h, hipY), C(-sw * 0.9 - 0.03 * h, -0.5)], trousers, legW * 0.95, seed + 1);
    limb([C(0.03 * h, hipY), C(sw * 0.9 + 0.03 * h, -0.5)], trousers, legW, seed + 2);
  }
  // shoes at the close tier
  if (h >= 18 && !sitting) {
    ctx.fillStyle = GC(P.ink, 0.9);
    for (const fx of [-sw * 0.9 - 0.03 * h, sw * 0.9 + 0.03 * h]) {
      ctx.beginPath();
      ctx.ellipse(fx + face * lw * 0.5, -lw * 0.4, lw * 1.2, lw * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // the skirt, when worn: an A-line from the hip
  if (look.skirt) {
    const skirt: Pt[] = [C(-0.07 * h, hipY - 0.02 * h), C(0.07 * h, hipY - 0.02 * h), C(0.14 * h, hipY + 0.17 * h), C(-0.14 * h, hipY + 0.17 * h)];
    fillPoly(pen, skirt, coat, { seed: seed + 3, contour: true, lineW: cw, rim: true, light: 0.92, jitterK });
  }
  // the back arm first, so the torso and the front arm lie over it (GV 8340)
  const armSwing = walking ? Math.sin(ph) * 0.55 : Math.sin(seed) * 0.07;
  const aF = -1.25 + armSwing, aB = -1.25 - armSwing;
  const up = 0.16 * h, fore = 0.14 * h;
  const armPts = (a: number, side: 1 | -1): Pt[] => {
    const sx = side * shW * 0.9, sy = shY + 0.02 * h;
    const ex = sx + side * Math.cos(a) * up * (sitting ? 0.6 : 1), ey = sy - Math.sin(a) * up;
    const bendA = a + (sitting ? 0.9 : 0.35) * side * face;
    const hx0 = ex + side * Math.cos(bendA) * fore * (sitting ? 0.9 : 1), hy0 = ey - Math.sin(bendA) * fore;
    return [C(sx, sy), C(ex, ey), C(hx0, hy0)];
  };
  const backArm = armPts(aB, -face as 1 | -1), frontArm = armPts(aF, face);
  const sleeveW = spec.id === 'B' ? lw * 1.9 : lw * 1.4;
  limb(backArm, coat, sleeveW, seed + 4);
  // the torso: a capsule from the hip to the shoulders in the coat colour, contoured by the direction
  const torso: Pt[] = [C(-0.065 * h, hipY + 0.01 * h), C(0.065 * h, hipY + 0.01 * h), C(shW, shY - 0.03 * h), C(0, shY - 0.055 * h), C(-shW, shY - 0.03 * h)];
  fillPoly(pen, torso, coat, { seed: seed + 5, contour: true, lineW: cw, rim: true, jitterK, grad: { from: C(-shW, shY), to: C(shW, hipY), k0: 1.06, k1: 0.9 } });
  if (spec.id === 'B') {
    // B: one rounded capsule, no gradient: a stroke of the same colour rounds it
    ctx.strokeStyle = shade(coat, 1);
    ctx.lineWidth = lw * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, hipY);
    ctx.lineTo(0, shY - 0.02 * h);
    ctx.stroke();
  }
  // the scarf in the signature colour (04 7.3), a tail hanging on the facing side at the close tier
  if (sig && h >= 4) {
    strokeLine(pen, [C(-shW * 1.05, shY - 0.01 * h), C(shW * 1.05, shY - 0.03 * h)], sig, Math.max(1, lw * 1.5), { open: true, seed: seed + 6, noInk: !ink });
    if (h >= 18) strokeLine(pen, [C(face * shW * 0.6, shY - 0.01 * h), C(face * shW * 0.9, shY + 0.14 * h)], sig, Math.max(1, lw * 1.2), { open: true, seed: seed + 7, noInk: !ink });
  }
  // the front arm and the hands
  limb(frontArm, coat, sleeveW, seed + 8);
  if (h >= 18) {
    for (const arm of [backArm, frontArm]) {
      const hp = arm[2] as Pt;
      fillEllipse(pen, hp.x, hp.y, lw * 0.8, lw * 0.8, skin, { gapless: true, seed: seed + 9, noInk: true });
    }
  }
  // the neck and the head
  strokeLine(pen, [C(0, shY - 0.03 * h), C(0, headY + hr * 0.6)], skin, lw * 1.2, { open: true, noInk: true });
  const hx0 = face * 0.01 * h, hy0 = headY;
  const headLight = spec.id === 'A' ? 1 : 1;
  fillEllipse(pen, hx0, hy0, hr, hr * 1.04, skin, { seed: seed + 10, contour: true, lineW: cw, rim: true, light: headLight, gapless: true, jitterK });
  // hair: a fringe cap (GV 8398-8404); longer at the nape for a bob; a scribble in C
  const bobCut = look.sex === 'f' && look.hat !== 'sunhat';
  const hairPts: Pt[] = [
    C(hx0 - hr * 0.98, hy0 - hr * 0.5), C(hx0 - hr * 0.9, hy0 - hr * 0.95), C(hx0, hy0 - hr * 1.12), C(hx0 + hr * 0.9, hy0 - hr * 0.95),
    C(hx0 + hr * 0.98, hy0 - hr * 0.5), C(hx0 + face * hr * 0.55, hy0 - hr * 0.42), C(hx0 + face * hr * 0.15, hy0 - hr * 0.58),
    C(hx0 - face * hr * 0.35, hy0 - hr * 0.38),
  ];
  if (bobCut) {
    hairPts.splice(5, 0, C(hx0 + hr * 1.02, hy0 + hr * 0.25), C(hx0 + hr * 0.7, hy0 + hr * 0.4));
    hairPts.splice(0, 0, C(hx0 - hr * 0.7, hy0 + hr * 0.4), C(hx0 - hr * 1.02, hy0 + hr * 0.25));
  }
  if (look.hat !== 'cap' && look.hat !== 'sunhat') fillPoly(pen, hairPts, hair, { seed: seed + 11, contour: false, rim: true, noInk: true, gapless: true, alpha: ink ? 0.6 : 1 });
  if (ink && look.hat !== 'cap' && look.hat !== 'sunhat') {
    for (let k = 0; k < 2; k++) {
      const a0 = -2.5 + k * 0.7, a1 = a0 + 0.9;
      const arc: Pt[] = [];
      for (let i = 0; i <= 4; i++) {
        const a = a0 + ((a1 - a0) * i) / 4;
        arc.push(C(hx0 + Math.cos(a) * hr * (0.98 + k * 0.04), hy0 + Math.sin(a) * hr * (1.0 + k * 0.04)));
      }
      inkLine(pen, arc, { open: true, seed: seed + 20 + k, inkAlpha: 0.6, gapless: true, lineW: cw, jitterK });
    }
  }
  // the face (04 7.5): eyes from h 8, brows, mouth and blush from h 12, nose at the close tier
  if (h >= 8) {
    const eo = hr * 0.34, ey = hy0 - hr * 0.12;
    const look2 = pose.lookAt ?? face;
    const shift = look2 === face ? hr * 0.06 : -hr * 0.06;
    const er = Math.max(0.55, hr * 0.16);
    ctx.fillStyle = GC(P.eye);
    if (pose.expr === 'kiss') {
      ctx.strokeStyle = GC(P.eye);
      ctx.lineWidth = Math.max(0.6, er * 0.9);
      ctx.beginPath();
      ctx.moveTo(hx0 + face * eo - er, ey + er * 0.3);
      ctx.lineTo(hx0 + face * eo + er, ey - er * 0.2);
      ctx.moveTo(hx0 + face * eo * 0.05 - er, ey + er * 0.3);
      ctx.lineTo(hx0 + face * eo * 0.05 + er, ey - er * 0.2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(hx0 + face * eo + shift, ey, er, 0, Math.PI * 2);
      ctx.arc(hx0 + face * eo * 0.05 + shift, ey, er, 0, Math.PI * 2);
      ctx.fill();
    }
    if (h >= 12) {
      const e = pose.expr;
      // brows
      ctx.strokeStyle = GC(P.ink, 0.9);
      ctx.lineWidth = Math.max(0.6, hr * 0.12);
      const raise = e === 'chat' || e === 'laugh' ? hr * 0.1 : 0;
      const by = ey - hr * 0.32 - raise;
      ctx.beginPath();
      for (const bx of [hx0 + face * eo + shift, hx0 + face * eo * 0.05 + shift]) {
        if (e === 'huff') {
          ctx.moveTo(bx - hr * 0.15, by - hr * 0.05 * face);
          ctx.lineTo(bx + hr * 0.15, by + hr * 0.08 * face);
        } else {
          ctx.moveTo(bx - hr * 0.15, by);
          ctx.lineTo(bx + hr * 0.15, by);
        }
      }
      ctx.stroke();
      // the mouth
      const mx = hx0 + face * hr * 0.3, my = hy0 + hr * 0.38;
      ctx.strokeStyle = GC(P.ink, 0.9);
      ctx.lineWidth = Math.max(0.6, hr * 0.11);
      ctx.beginPath();
      if (e === 'chat') ctx.arc(mx, my - hr * 0.08, hr * 0.2, 0.3, Math.PI - 0.3);
      else if (e === 'bench') ctx.arc(mx, my - hr * 0.1, hr * 0.26, 0.2, Math.PI - 0.2);
      else if (e === 'laugh') ctx.arc(mx, my - hr * 0.12, hr * 0.3, 0, Math.PI);
      else if (e === 'kiss') ctx.arc(mx, my - hr * 0.1, hr * 0.22, 0.3, Math.PI - 0.3);
      else if (e === 'huff') ctx.arc(mx, my + hr * 0.2, hr * 0.22, Math.PI + 0.4, Math.PI * 2 - 0.4);
      else {
        ctx.moveTo(mx - hr * 0.22, my);
        ctx.lineTo(mx + hr * 0.22, my);
      }
      ctx.stroke();
      // blush: two rose discs at alpha 0.42 (GV 8414), x1.3 at Kiss
      if (e === 'chat' || e === 'bench' || e === 'kiss' || e === 'laugh') {
        const k = (pose.blushK ?? 1) * (e === 'kiss' ? 1.3 : 1);
        ctx.fillStyle = GC(P.rose, 0.42);
        ctx.beginPath();
        ctx.arc(hx0 + face * eo * 1.1, hy0 + hr * 0.2, hr * 0.17 * k, 0, Math.PI * 2);
        ctx.arc(hx0 - face * eo * 0.3, hy0 + hr * 0.22, hr * 0.14 * k, 0, Math.PI * 2);
        ctx.fill();
      }
      if (h >= 18) {
        ctx.fillStyle = shade(skin, 0.92);
        ctx.beginPath();
        ctx.arc(hx0 + face * hr * 0.6, hy0 + hr * 0.02, hr * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  drawHat(pen, look, hx0, hy0, hr, face, lw, seed);
  ctx.restore();
}

/** Berets, flat caps and sunhats only (04 7.1 rule 10). */
function drawHat(pen: Pen, look: Look, hx0: number, hy0: number, hr: number, face: number, lw0: number, seed: number): void {
  const { spec } = pen;
  const P = spec.palette;
  const lw = spec.line === 'ink' ? Math.max(0.7, 0.5 * pen.z) / 0.8 : lw0;
  const hex = look.hatColour ?? P.ink;
  if (look.hat === 'beret') {
    // a soft disc slumped to one side, with a stalk
    const pts = ellipsePts(hx0 - face * hr * 0.15, hy0 - hr * 0.95, hr * 1.15, hr * 0.5, 14, -face * 0.18);
    fillPoly(pen, pts, hex, { seed: seed + 30, contour: true, lineW: lw * 0.8, rim: true, gapless: true });
    strokeLine(pen, [{ x: hx0 - face * hr * 0.2, y: hy0 - hr * 1.4 }, { x: hx0 - face * hr * 0.2, y: hy0 - hr * 1.62 }], hex, Math.max(0.8, lw * 0.6), { open: true, noInk: true });
  } else if (look.hat === 'cap') {
    // a flat cap: a low crown pulled forward and a short peak on the facing side
    const crown: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      crown.push({ x: hx0 + face * hr * 0.08 + Math.cos(a) * hr * 1.08, y: hy0 - hr * 0.62 + Math.sin(a) * hr * 0.46 });
    }
    fillPoly(pen, crown, hex, { seed: seed + 31, contour: true, lineW: lw * 0.8, rim: true, gapless: true });
    fillPoly(pen, [{ x: hx0 + face * hr * 0.4, y: hy0 - hr * 0.64 }, { x: hx0 + face * hr * 1.5, y: hy0 - hr * 0.5 }, { x: hx0 + face * hr * 1.4, y: hy0 - hr * 0.36 }, { x: hx0 + face * hr * 0.4, y: hy0 - hr * 0.5 }], mix(hex, P.ink, 0.25), { seed: seed + 32, contour: true, lineW: lw * 0.8, gapless: true });
  } else if (look.hat === 'sunhat') {
    fillEllipse(pen, hx0, hy0 - hr * 0.55, hr * 1.6, hr * 0.42, hex, { seed: seed + 33, contour: true, lineW: lw * 0.8, rim: true, gapless: true });
    const dome: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      dome.push({ x: hx0 + Math.cos(a) * hr * 0.95, y: hy0 - hr * 0.6 + Math.sin(a) * hr * 0.85 });
    }
    fillPoly(pen, dome, hex, { seed: seed + 34, contour: true, lineW: lw * 0.8, rim: true, gapless: true });
    strokeLine(pen, [{ x: hx0 - hr * 0.9, y: hy0 - hr * 0.72 }, { x: hx0 + hr * 0.9, y: hy0 - hr * 0.72 }], P.rose, Math.max(0.8, lw * 0.7), { open: true, noInk: true });
  }
}

/* ---------- the Visitor record to drawFigure (S4 part C, interim: the approved art only) ---------- */

/** Drawn scale (04 7.1 rule 1): a family's child 0.65 FH, an elder 0.95 FH, everyone else 1. */
export const SCALE_CHILD = 0.65;
export const SCALE_ELDER = 0.95;
/** The walk phase grows at speed x 2.1 radians a sim second: one stride every 0.46 s at 3.0 tiles/s (04 7.1 rule 3). */
export const WALK_K = 2.1;
/** The palette's grey hair tone (`hair[5]`), worn by elders until the rig draws `elderHair` (04 7.2 elder row). */
const ELDER_HAIR = 5;

export function figureScale(v: Pick<Visitor, 'archetype' | 'ageWord'>): number {
  return v.archetype === 'child' ? SCALE_CHILD : v.ageWord === 'elder' ? SCALE_ELDER : 1;
}

/** How far above the ground point drawFigure puts the head's centre for drawn height h: 0.82 h, less the 0.24 h crouch when sitting. */
export function headRise(h: number, sitting: boolean): number {
  return 0.82 * h - (sitting ? 0.24 * h : 0);
}

/**
 * The hat from the existing set (berets, flat caps, sunhats; 04 7.1 rule 10): none without `items.hat` (a hat in a pomeranian's mouth
 * is not on the head) and never on a child, the gardener or a jogger; a flat cap for an elder and a vendor, a sunhat for a tourist, a
 * beret for the artist (04 7.2's hat halves that the set already draws); anyone else wearing one takes a beret or a sunhat (f) or a
 * flat cap or a beret (m) by `bit`.
 */
function hatOf(v: Visitor, bit: number): Hat {
  if (!v.items.hat) return 'none';
  switch (v.archetype) {
    case 'child':
    case 'gardener':
    case 'jogger':
      return 'none';
    case 'elder':
    case 'vendor':
      return 'cap';
    case 'tourist':
      return 'sunhat';
    case 'artist':
      return 'beret'; // TODO(S4-rig): the artist's floppy hat (04 7.2)
    default:
      return v.sex === 'f' ? (bit ? 'beret' : 'sunhat') : bit ? 'cap' : 'beret';
  }
}

/**
 * The Look of a visitor, written into `out` (04 7.1 rule 8, 7.3 item 2): lookSeed's low 3 bits are the signature colour
 * (visitor.ts signatureOf) and bits 3 and 4 the hat and purse that spawnVisitor reads into `items`; the rest, r = lookSeed >>> 5,
 * picks the skin (of 4), the hair (of 6), the coat (of 8), then a skirt, the hat's kind and its colour. The scarf in the signature
 * colour is for singles only (04 7.3 item 2); a tourist's sunhat and a vendor's cap are `paper` (04 7.2); an elder's hair is grey.
 */
export function lookOf(v: Visitor, P: Palette, out: Look): Look {
  let r = v.lookSeed >>> 5;
  out.seed = (r % 9973) + 1;
  out.sex = v.sex;
  out.skin = r % P.skin.length;
  r = Math.floor(r / P.skin.length);
  const hair = r % P.hair.length;
  r = Math.floor(r / P.hair.length);
  out.hair = v.ageWord === 'elder' ? ELDER_HAIR : hair;
  out.coat = r % P.coat.length;
  r = Math.floor(r / P.coat.length);
  out.skirt = v.sex === 'f' && v.archetype !== 'jogger' && (r & 1) === 1;
  out.hat = hatOf(v, (r >>> 1) & 1);
  const hats = [P.ink, P.coat[5] as string, P.coat[7] as string, P.bedEarth];
  out.hatColour = v.archetype === 'tourist' || v.archetype === 'vendor' ? P.paper : (hats[(r >>> 2) % hats.length] as string);
  out.signature = v.archetype === 'single' ? signatureOf(v.lookSeed) : -1;
  out.scale = figureScale(v);
  // TODO(S4-rig): the archetype signifiers of 04 7.2 (the couple's matching scarves, the parent's tote, the elder's cane, the tourist's
  // camera, the jogger's headband, band and shorts, the artist's palette, the busker's accordion, the gardener's apron and rake, the
  // vendor's apron) and the crowd palette the owner asked for (register section 4, Figure rig row: colourful crowd, options pending)
  return out;
}

/**
 * The Pose of a visitor, written into `out`: sitting while it holds a seat (`sitPropId`), walking while it has a path, else standing;
 * the walk phase from sim seconds `tSim` at the visitor's own speed (move.ts speedOf), offset by its id so a crowd does not march in
 * step; `face` is the facing on screen (render/people.ts faceOf). The expression stays flat until S5's romance stages.
 */
export function poseOf(v: Visitor, face: 1 | -1, tSim: number, out: Pose): Pose {
  out.state = v.sitPropId !== 0 ? 'sit' : v.path !== null ? 'walk' : 'idle';
  out.face = face;
  out.walkPh = tSim * speedOf(v) * WALK_K + v.id * 1.7;
  out.expr = 'idle';
  out.lookAt = undefined;
  out.blushK = undefined;
  // TODO(S4-rig): the body-language table of the 14 states (walk, idle, sit, read, feed, eat, photo, paint, play, pave, tidy, serve,
  // shelter, chase), idle breathing and the glance (04 7.1 items 3, 4), and the sitting pose keyed to the seat's rotation (item 6)
  return out;
}

/** A visitor at ground point p with its Look and Pose (lookOf, poseOf): drawFigure as approved at the Style Gate. */
export function drawVisitor(pen: Pen, p: Pt, look: Look, pose: Pose): void {
  // TODO(S4-rig): itemFor(v) in the hand (GV toolFor 8050: book, baguette, bouquet, umbrella, camera, brush, ice cream, hat in hand; 03 7.6 item 4)
  // TODO(S4-rig): the close tier at h >= 18 (clothing stripes, hands, hat band, basket weave, buttons; 04 7.1 item 5)
  drawFigure(pen, p, look, pose);
}
