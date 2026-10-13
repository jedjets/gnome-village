// src/render/figure-garments.ts
// The picked figure rig 2 Tailored dressed (register section 4, Figure rig and Crowd palette, 2026-10-13): filled garments after ref2
// (tapered trousers, an A-line skirt, shorts, a jacket with a hem and, close up, lapels, buttons and cuffs; pointed flats), a fine ink rim
// behind every piece, hair that keeps the face clear, berets, flat caps, sunhats, the artist's floppy hat and the jogger's headband, the
// faces of 04 7.5, and the scarves: a single's signature scarf (04 7.3) drawn 1.2x with a light `paper` rim outside its ink rim that
// fades from zoom 1.3 to 0.4 at 2.4, a couple's matching scarf in its crowd hue with no rim (the rim always means "single"). The top and
// the lower garment take their own colours from the crowd palette A Parisian chic (figure-look.ts); a Breton's stripes show at the close
// tier. LOD by drawn height (figure-rig.ts LOD): body from 3 px, signifiers from 4, eyes and shoes from 8, the face from 12, close from 18.
// Ported from GV 8395-8414 (the fringe, eyes, nose and cheeks: `eye` dots at +-0.34 hr, a `rose` blush at 0.42) and 8435-8440 (the
// soft contact shadow), by way of the options pages the owner picked from (scratch/s4-options-figure.ts buildV2, s4-crowd-figure.ts).
// Verdict: ADAPT. Changes: garments instead of GV's tunic stroke; the 04 7.5 expression table; hats are berets, caps, sunhats, a floppy hat
// and a headband only (04 7.1 rule 10). Dropped from the range: GV's beard, pointed hat, sleeping eyes, the page's variants 1 and 3.
import { type Pt } from './ambient.ts';
import {
  FH, LOD, P2, drawShapes, ellPath, inkOf, lerpP, linePath, polyPath, rotAbout, softPath, solveH, taperPath, type Expr, type Ink, type Opts,
  type RigLook, type Shape, type Skel,
} from './figure-rig.ts';
import { apronHex, itemShapes, strangerCoat } from './figure-props.ts';

/** How a single's signature scarf is drawn in palette A (the crowd page's cue): a fifth larger, a paper rim of 0.55 line widths. */
export const SCARF_CUE = { k: 1.2, paper: 0.55 } as const;
/** The paper rim's alpha by zoom: full up to 1.3, fading to 0.4 by 2.4, where the scarf's size and hue carry it (the crowd page). */
export const rimAlpha = (z: number): number => (z <= 1.3 ? 1 : Math.max(0.4, 1 - (0.6 * (z - 1.3)) / 1.1));

/** A garment point: above the waist it turns with the lean; below it hangs straight down from the waist (an apron, a hem). */
const garment = (S: Skel) => (x: number, y: number): Pt => {
  if (y <= 0) return S.up(x, y);
  const q = S.up(x, 0);
  return P2(q.x, q.y + y);
};

/** Draw a person whose feet stand at p in the Tailored rig; returns the skeleton in local px (facing frame), or null under 3 px. */
export function drawRigPerson(c: Ink, p: Pt, look: RigLook, o: Opts): Skel | null {
  const { ctx, z } = c.pen;
  const h = FH * z * look.scale;
  if (h < LOD.body) return null; // 04 7.1 rule 5: nothing below 3 px
  const S = solveH(look, o, h);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(o.face, 1);
  if (!S.sitting) {
    // a soft contact shadow (GV 8240 recipe: ink at 0.16)
    ctx.fillStyle = inkOf(c, c.pen.spec.palette.ink, 0.16);
    ctx.beginPath();
    ctx.ellipse((S.footF.x + S.footB.x) / 2, 0.5, Math.max(1.4, 0.2 * h), Math.max(0.6, 0.06 * h), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const parts = build(c, S, look, o);
  drawShapes(c, parts.pre);
  if (h >= LOD.eyes) features(c, S, o);
  if (parts.post.length) drawShapes(c, parts.post);
  ctx.restore();
  return S;
}

const holdsOverHead = (S: Skel): boolean => S.items.F === 'camera-up' || S.items.F === 'icecream';

/** The two hands' items, sorted into the draw slots: the tote hangs behind the body; a palette or crumbs bag sits in front of it. */
function items(c: Ink, S: Skel, look: RigLook): { b0: Shape[]; b1: Shape[]; f0: Shape[]; f1: Shape[] } {
  const bi = itemShapes(c.pen, S, S.items.B, S.haB, S.elB, false, look.balloon);
  const fi = itemShapes(c.pen, S, S.items.F, S.haF, S.elF, true, look.balloon);
  const bOver = S.items.B === 'palette' || S.items.B === 'crumbs';
  return { b0: bOver ? [] : [...bi.back, ...bi.fore], b1: bOver ? [...bi.back, ...bi.fore] : [], f0: fi.back, f1: fi.fore };
}

function build(c: Ink, S: Skel, look: RigLook, o: Opts): { pre: Shape[]; post: Shape[] } {
  const pen = c.pen, P = pen.spec.palette;
  const skin = P.skin[look.skin % P.skin.length] as string;
  const hair = look.hair < 0 ? P.elderHair : (P.hair[look.hair % P.hair.length] as string);
  const coat = look.long ? strangerCoat(pen) : look.top, low = look.low;
  const sig = look.sig >= 0 ? (P.signature[look.sig % P.signature.length] as string) : null;
  const h = S.h, lw = S.lw, hr = S.hr;
  const rim = lw * 0.85, ra = 1;
  const pre: Shape[] = [], post: Shape[] = [];
  const it = items(c, S, look);
  const G = garment(S);
  const close = h >= LOD.close;
  // a Breton top (close tier): stripes across the body and sleeves, inside each piece
  const breton = close && !look.long && look.stripe ? look.stripe : '';
  const stripes = (clip: Path2D, y0: number, y1: number, body: boolean, light = 1): Shape => {
    const gap = Math.max(1.5, 0.048 * h), path = new Path2D();
    for (let y = y0 + gap * 0.55; y < y1; y += gap) {
      const a = body ? S.up(-0.14 * h, y) : P2(-0.4 * h, y), b = body ? S.up(0.14 * h, y) : P2(0.4 * h, y);
      path.moveTo(a.x, a.y);
      path.lineTo(b.x, b.y);
    }
    return { path, hex: breton, stroke: Math.max(0.55, 0.021 * h), cap: 'butt', clip, light };
  };
  const gr = (k0: number, k1: number): Shape['grad'] => {
    const a = S.up(-0.09 * h, -0.32 * h), b = S.up(0.09 * h, 0.05 * h);
    return { x0: a.x * o.face, y0: a.y, x1: b.x * o.face, y1: b.y, k0, k1 };
  };
  // legs: tapered trousers, or slim legs under a skirt, or shorts over bare legs; pointed flats (ref2)
  const shoe = (foot0: Pt, pitch: number, light: number): Shape => {
    const foot = P2(foot0.x, foot0.y - 0.02 * h); // the sole's rim ends at the ground
    const toe = P2(foot.x + 0.06 * h, foot.y), heel = P2(foot.x - 0.025 * h, foot.y);
    const pts = [P2(heel.x, heel.y - 0.028 * h), P2(foot.x + 0.02 * h, foot.y - 0.03 * h), toe, P2(heel.x + 0.005 * h, heel.y + 0.004 * h)];
    const piv = P2(foot.x + 0.045 * h, foot.y);
    return { path: softPath(pts.map((q) => rotAbout(piv, q, pitch))), hex: P.ink, light, rim: rim * 0.6, rimAlpha: 0.6 };
  };
  const legs = (hip: Pt, knee: Pt, foot: Pt, light: number, pitch: number): void => {
    const ankle = P2(foot.x, foot.y - 0.04 * h);
    const top = P2(hip.x, hip.y - 0.03 * h);
    if (look.lower === 'skirt') {
      pre.push({ path: taperPath([top, knee, ankle], 0.03 * h, 0.017 * h), hex: skin, light, rim, rimAlpha: ra });
    } else if (look.lower === 'shorts') {
      pre.push({ path: taperPath([top, knee, ankle], 0.03 * h, 0.018 * h), hex: skin, light, rim, rimAlpha: ra });
      pre.push({ path: taperPath([top, lerpP(hip, knee, 0.82)], 0.05 * h, 0.042 * h, false), hex: low, light, rim, rimAlpha: ra });
    } else {
      const cropped = look.lower === 'cropped';
      const end = cropped ? lerpP(knee, ankle, 0.8) : ankle;
      if (cropped) pre.push({ path: taperPath([lerpP(knee, ankle, 0.6), ankle], 0.017 * h, 0.016 * h), hex: skin, light, rim, rimAlpha: ra });
      pre.push({ path: taperPath([top, knee, end], 0.046 * h, cropped ? 0.03 * h : 0.026 * h, false), hex: low, light, rim, rimAlpha: ra });
    }
    if (h >= LOD.eyes) pre.push(shoe(foot, pitch, light > 0.95 ? 1.25 : 1.1));
  };
  legs(S.hipB, S.kneeB, S.footB, 0.88, S.toeB);
  legs(S.hipF, S.kneeF, S.footF, 1.0, S.toeF);
  // the skirt, in the lower colour: A-line from the waist to the knee with a curved hem, a paler hem band close up
  if (look.lower === 'skirt') {
    const sw = S.swing * 0.02 * h;
    const sk = [G(-0.055 * h, -0.11 * h), G(0.055 * h, -0.11 * h), G(0.12 * h + sw, 0.16 * h), G(0, 0.18 * h), G(-0.12 * h + sw, 0.155 * h)] as const;
    pre.push({ path: softPath([sk[0], sk[1], lerpP(sk[1], sk[2], 0.5), sk[2], sk[3], sk[4], lerpP(sk[4], sk[0], 0.5)]), hex: low, light: 0.95, rim, rimAlpha: ra, grad: gr(1.05, 0.86) });
    if (close) pre.push({ path: linePath([G(-0.11 * h + sw, 0.135 * h), G(0, 0.155 * h), G(0.11 * h + sw, 0.14 * h)]), hex: low, stroke: Math.max(0.6, 0.012 * h), light: 1.18 });
  }
  pre.push(...it.b0);
  // sleeves: tapered, a cuff close up; the hand a small oval
  const sleeve = (sh: Pt, el: Pt, ha: Pt, light: number): Shape[] => {
    const sp = taperPath([sh, el, ha], 0.037 * h, 0.023 * h);
    const out: Shape[] = [{ path: sp, hex: coat, light, rim, rimAlpha: ra }];
    if (breton) out.push(stripes(sp, Math.min(sh.y, el.y, ha.y) + 0.02 * h, Math.max(sh.y, el.y, ha.y) - 0.01 * h, false, light));
    if (close) {
      out.push({ path: linePath([lerpP(el, ha, 0.78), lerpP(el, ha, 0.92)]), hex: coat, stroke: 0.05 * h, light: light * 0.86, cap: 'butt' });
      const d = P2(ha.x - el.x, ha.y - el.y), l = Math.hypot(d.x, d.y) || 1;
      out.push({ path: ellPath(ha.x + (d.x / l) * 0.012 * h, ha.y + (d.y / l) * 0.012 * h, 0.022 * h, 0.026 * h, Math.atan2(d.y, d.x)), hex: skin, rim: rim * 0.8, rimAlpha: ra });
    }
    return out;
  };
  pre.push(...sleeve(S.shB, S.elB, S.haB, 0.86));
  // the jacket or top: shoulders, waist, a hem that flares; long to the knee for the stranger
  const hemY = look.long ? 0.2 * h : look.lower === 'skirt' ? -0.08 * h : 0.035 * h;
  const hemW = look.long ? 0.1 * h : look.lower === 'skirt' ? 0.058 * h : 0.074 * h;
  const jp = softPath([
    S.up(-0.088 * h, -0.296 * h), S.up(-0.06 * h, -0.326 * h), S.up(-0.015 * h, -0.338 * h), S.up(0.035 * h, -0.334 * h),
    S.up(0.072 * h, -0.324 * h), S.up(0.092 * h, -0.296 * h), S.up(0.08 * h, -0.215 * h), S.up(0.058 * h, -0.11 * h),
    G(hemW, hemY), G(-hemW, hemY + 0.004 * h), S.up(-0.06 * h, -0.11 * h), S.up(-0.078 * h, -0.215 * h),
  ]);
  pre.push({ path: jp, hex: coat, rim, rimAlpha: ra, grad: gr(1.08, 0.88) });
  if (breton) pre.push(stripes(jp, -0.34 * h, hemY + 0.01 * h, true));
  if (close) {
    if (breton || (look.lower === 'skirt' && !look.long)) {
      // a jersey or a fitted top: a boat neck (and a belt with a skirt)
      if (look.lower === 'skirt') pre.push({ path: linePath([S.up(-0.058 * h, -0.105 * h), S.up(0.06 * h, -0.105 * h)]), hex: P.ink, stroke: 0.018 * h, alpha: 0.65 });
      pre.push({ path: linePath([S.up(-0.035 * h, -0.326 * h), S.up(0, -0.318 * h), S.up(0.04 * h, -0.324 * h)]), hex: coat, stroke: 0.012 * h, light: 1.2 });
    } else {
      // lapels, two buttons, the hem band
      const lapel = [S.up(-0.005 * h, -0.335 * h), S.up(0.03 * h, -0.2 * h), S.up(0.045 * h, -0.332 * h)];
      pre.push({ path: polyPath(lapel), hex: coat, light: 1.2 });
      pre.push({ path: linePath(lapel), hex: coat, stroke: Math.max(0.5, 0.01 * h), light: 0.72, alpha: 0.9 });
      for (const y of look.long ? [-0.16, -0.07, 0.02] : [-0.15, -0.07]) {
        const b = G(0.036 * h, y * h);
        pre.push({ path: ellPath(b.x, b.y, 0.009 * h, 0.009 * h), hex: P.ink, alpha: 0.75 });
      }
      pre.push({ path: linePath([G(-hemW * 0.95, hemY - 0.012 * h), G(hemW * 0.95, hemY - 0.014 * h)]), hex: coat, stroke: Math.max(0.6, 0.011 * h), light: 0.8 });
      if (look.long) pre.push({ path: linePath([S.up(0.03 * h, -0.2 * h), G(0.04 * h, 0), G(0.04 * h, hemY)]), hex: coat, stroke: Math.max(0.5, 0.01 * h), light: 0.7 });
    }
  }
  const apron = apronHex(pen, look.arche);
  if (apron && h >= LOD.signifier) {
    const ap = [G(-0.03 * h, -0.27 * h), G(0.055 * h, -0.27 * h), G(0.06 * h, -0.13 * h), G(0.065 * h, 0), G(0.085 * h, 0.15 * h), G(-0.055 * h, 0.155 * h), G(-0.05 * h, 0), G(-0.045 * h, -0.13 * h)];
    pre.push({ path: softPath(ap), hex: apron, rim, rimAlpha: ra, grad: gr(1.06, 0.9) });
    if (close) {
      pre.push({ path: polyPath([G(0, 0), G(0.06 * h, 0), G(0.06 * h, 0.06 * h), G(0, 0.06 * h)]), hex: apron, light: 0.88 });
      pre.push({ path: linePath([S.up(-0.03 * h, -0.27 * h), S.up(-0.02 * h, -0.33 * h)]), hex: apron, stroke: 0.012 * h, light: 0.85 });
    }
  }
  if (look.arche === 'jogger' && h >= LOD.signifier) pre.push({ path: taperPath([S.up(-0.07 * h, -0.3 * h), S.up(0.065 * h, -0.05 * h)], 0.022 * h, 0.022 * h), hex: P.sky, rim: rim * 0.7, rimAlpha: ra });
  const H = S.head;
  pre.push({ path: taperPath([S.neck, P2(H.x, H.y + hr * 0.7)], 0.019 * h, 0.018 * h), hex: skin, light: 0.93, rim, rimAlpha: ra });
  const scarf = scarfShapes(S, sig, look.pairScarf, rim, P.paper, pen.z);
  pre.push(...it.b1);
  const armOver = holdsOverHead(S);
  const sleeveF = sleeve(S.shF, S.elF, S.haF, 1.02);
  if (!armOver) pre.push(...it.f0, ...sleeveF, ...scarf, ...it.f1);
  else pre.push(...scarf);
  // the head (with a profile nose close up, ref2), the hair and the hat
  if (close) {
    const nose = rotAbout(H, P2(H.x + hr * 0.95, H.y + hr * 0.1), S.tilt);
    pre.push({ path: ellPath(nose.x, nose.y, hr * 0.17, hr * 0.15), hex: skin, rim, rimAlpha: ra });
  }
  const hatted = look.hat === 'cap' || look.hat === 'sunhat' || look.hat === 'floppy';
  const hs = look.hairStyle;
  const hp = hatted ? (hs === 'bob' || hs === 'bun' || hs === 'curls' ? 'nape' : null) : hs === 'bob' ? 'bob3q' : hs;
  const hpath = hp ? hairPath(S, hp) : null;
  if (hpath) pre.push({ path: hpath, hex: P.ink, stroke: rim, alpha: 0.85 * 0.9 });
  pre.push({ path: ellPath(H.x, H.y, hr, hr * 1.03), hex: skin, rim, rimAlpha: ra });
  if (hpath) pre.push({ path: hpath, hex: hair });
  if (hp && close && hs !== 'elder' && hs !== 'none') {
    // a sheen on the hair
    const a = rotAbout(H, P2(H.x - hr * 0.45, H.y - hr * 0.8), S.tilt), b = rotAbout(H, P2(H.x + hr * 0.25, H.y - hr * 0.95), S.tilt);
    pre.push({ path: linePath([a, b]), hex: hair, stroke: Math.max(0.5, hr * 0.12), light: 1.35, alpha: 0.7 });
  }
  pre.push(...hatShapes(S, look, P.ink, P.paper, P.sky));
  if (armOver) post.push(...it.f0, ...sleeveF, ...it.f1);
  return { pre, post };
}

/**
 * The scarf (04 7.2, 7.3: the eye finds the singles): a chunky wrap round the neck, 0.08 h deep and 0.16 h across, and a tail 0.04 h wide
 * on the facing side that swings with the walk, fringed close up; drawn after the front sleeve so the arm never hides it. Below h 12 it is
 * one stroke across the shoulders, so it still reads at Fit. A single's (sig) is scaled by SCARF_CUE.k about the neck and ringed by
 * SCARF_CUE.paper line widths of `paper` outside its ink rim at rimAlpha(z); a couple's (pair) is the rig's own, with no rim.
 */
function scarfShapes(S: Skel, sig: string | null, pair: string, rim: number, paper: string, z: number): Shape[] {
  const h = S.h, lw = S.lw;
  const hex = sig ?? pair;
  if (!hex || h < LOD.signifier) return [];
  const k = sig ? SCARF_CUE.k : 1, cue = sig ? SCARF_CUE.paper : 0;
  const U = (x: number, y: number): Pt => S.up(x * k, -0.31 * h + (y + 0.31 * h) * k); // the rig's points, scaled about the neck
  const halo = cue > 0 ? rim + 2 * cue * lw : 0;
  const pa = rimAlpha(z);
  const ringOf = (path: Path2D, w: number): Shape => ({ path, hex: paper, stroke: w, light: 1.04, cap: 'round', alpha: pa });
  const out: Shape[] = [], ring: Shape[] = [];
  if (h < LOD.expression) {
    const bar = linePath([U(-0.085 * h, -0.29 * h), U(0.085 * h, -0.31 * h)]);
    const w = Math.max(1, lw * 1.5) * (sig ? Math.max(1, k * 0.95) : 1);
    if (halo) ring.push(ringOf(bar, w + Math.max(1, cue * lw * 1.4)));
    out.push({ path: bar, hex, stroke: w });
    return [...ring, ...out];
  }
  const close = h >= LOD.close;
  const wrap = softPath([U(-0.08 * h, -0.345 * h), U(0, -0.36 * h), U(0.08 * h, -0.35 * h), U(0.088 * h, -0.295 * h), U(0, -0.262 * h), U(-0.084 * h, -0.28 * h)]);
  out.push({ path: wrap, hex, rim, rimAlpha: 1 });
  if (halo) ring.push(ringOf(wrap, halo));
  const sw = -S.swing * 0.03 * h - (S.sitting ? 0 : 0.008 * h);
  const tw = Math.max(0.6, 0.02 * h) * k;
  const t0 = U(0.045 * h, -0.3 * h), t1 = S.up(0.058 * h * k + sw, -0.31 * h + 0.18 * h * k);
  const tail = taperPath([t0, lerpP(t0, t1, 0.5), t1], tw, tw * 1.1, false);
  out.push({ path: tail, hex, light: 0.94, rim, rimAlpha: 1 });
  if (halo) ring.push(ringOf(tail, halo));
  if (close) {
    // a fold across the wrap and the fringe
    out.push({ path: linePath([U(-0.06 * h, -0.3 * h), U(0, -0.288 * h), U(0.06 * h, -0.31 * h)]), hex, stroke: Math.max(0.5, 0.01 * h), light: 0.82 });
    const fr = new Path2D();
    for (let i = -1; i <= 1; i++) {
      fr.moveTo(t1.x + i * 0.013 * h * k, t1.y);
      fr.lineTo(t1.x + i * 0.015 * h * k, t1.y + 0.028 * h);
    }
    out.push({ path: fr, hex, stroke: Math.max(0.5, 0.009 * h), light: 0.9 });
    if (halo) ring.push(ringOf(fr, Math.max(0.5, 0.009 * h) + 2 * cue * lw));
  }
  return [...ring, ...out];
}

/* ---------- hair and hats (facing frame, about the head centre, nodding with the head) ---------- */
/** Every style keeps the face clear: the back hair's inner edge at x <= -0.5 r, the hairline at y <= -0.62 r over the eyes. */
const HAIR: Record<string, ReadonlyArray<readonly [number, number]>> = {
  bob3q: [[-0.5, 0.6], [-1.05, 0.55], [-1.1, -0.3], [-0.85, -0.95], [0, -1.16], [0.82, -0.96], [1.04, -0.55], [0.9, -0.46], [0.55, -0.7], [0.15, -0.72], [-0.25, -0.64], [-0.55, -0.36], [-0.52, 0.3]],
  bun: [[-0.55, 0.1], [-1.0, -0.1], [-1.3, -0.7], [-0.9, -1.25], [-0.45, -1.15], [0.1, -1.12], [0.9, -0.92], [1.0, -0.52], [0.6, -0.68], [0.1, -0.72], [-0.3, -0.62], [-0.52, -0.36]],
  nape: [[-0.6, 0.5], [-1.04, 0.3], [-1.02, -0.45], [-0.7, -0.55], [-0.56, 0.2]],
  slick: [[-0.65, 0.15], [-1.04, -0.05], [-0.98, -0.62], [-0.55, -1.02], [0.2, -1.12], [0.85, -0.85], [0.98, -0.6], [0.45, -0.72], [-0.2, -0.68], [-0.52, -0.42], [-0.55, 0.1]],
  elder: [[-0.6, 0.2], [-1.03, 0], [-0.98, -0.45], [-0.75, -0.62], [-0.52, -0.3]],
  crop: [[-0.7, 0.05], [-1.02, -0.2], [-0.85, -0.88], [0, -1.08], [0.85, -0.85], [0.97, -0.56], [0.5, -0.7], [-0.1, -0.68], [-0.52, -0.42]],
  curls: [[-0.8, 0.5], [-1.18, 0.15], [-1.15, -0.55], [-0.75, -1.12], [0.05, -1.22], [0.85, -1.0], [1.08, -0.5], [0.75, -0.62], [0.2, -0.74], [-0.3, -0.64], [-0.52, -0.32], [-0.56, 0.45]],
  short: [[-0.6, 0.15], [-1.02, -0.05], [-1.0, -0.55], [-0.75, -0.95], [0, -1.12], [0.82, -0.88], [0.99, -0.56], [0.62, -0.7], [0.15, -0.72], [-0.3, -0.62], [-0.52, -0.36], [-0.55, 0.1]],
};
export function hairPath(S: Skel, style: string): Path2D {
  const pts = HAIR[style];
  if (!pts) return new Path2D(); // 'none': the measurement's bald head
  const H = S.head, r = S.hr, sw = style === 'bob3q' ? -S.swing * 0.12 : 0; // a bob swings with the walk
  return softPath(pts.map(([x, y], i) => rotAbout(H, P2(H.x + (x + (i < 2 ? sw : 0)) * r, H.y + y * r), S.tilt)));
}

function hatShapes(S: Skel, look: RigLook, ink: string, paper: string, sky: string): Shape[] {
  const H = S.head, r = S.hr, lw = S.lw;
  const q = (x: number, y: number): Pt => rotAbout(H, P2(H.x + x * r, H.y + y * r), S.tilt);
  const hex = look.hatHex || ink;
  const out: Shape[] = [];
  const ring = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 10, tilt = 0): Pt[] => {
    const pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      pts.push(q(cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)));
    }
    return pts;
  };
  switch (look.hat) {
    case 'beret':
      // a soft disc slumped to the back, a stalk
      out.push({ path: softPath(ring(-0.15, -0.95, 1.15, 0.5, 0, Math.PI * 2, 14, -0.18)), hex, rim: lw });
      out.push({ path: linePath([q(-0.2, -1.4), q(-0.2, -1.62)]), hex, stroke: Math.max(0.8, lw * 0.6) });
      break;
    case 'cap':
      out.push({ path: polyPath(ring(0.08, -0.62, 1.08, 0.5, Math.PI, Math.PI * 2, 8)), hex, rim: lw });
      out.push({ path: polyPath([q(0.4, -0.64), q(1.5, -0.5), q(1.4, -0.36), q(0.4, -0.5)]), hex, light: 0.8, rim: lw });
      if (S.h >= LOD.close) out.push({ path: linePath([q(-0.95, -0.66), q(1.0, -0.66)]), hex, stroke: Math.max(0.5, r * 0.12), light: 0.75 });
      break;
    case 'sunhat': {
      const c = q(0, -0.55);
      out.push({ path: ellPath(c.x, c.y, r * 1.6, r * 0.42, S.tilt), hex, rim: lw });
      out.push({ path: polyPath(ring(0, -0.6, 0.95, 0.85, Math.PI, Math.PI * 2, 8)), hex, light: 1.02, rim: lw });
      // the hat band (a close-tier detail, 04 7.1 rule 5): paper a shade down, no accent (7.3 rule 1; 7.2: the tourist's hat is paper)
      if (S.h >= LOD.close) out.push({ path: linePath([q(-0.9, -0.72), q(0.9, -0.72)]), hex: paper, light: 0.82, stroke: Math.max(0.8, lw * 0.7) });
      break;
    }
    case 'floppy': {
      // the artist's floppy hat: a wide brim that droops at the sides, a soft crown
      const brim = new Path2D();
      const a = q(-1.75, -0.2), b = q(0, -0.78), d = q(1.8, -0.25), e = q(0, -0.42);
      const c1 = q(-0.9, -0.85), c2 = q(0.95, -0.85), c3 = q(0.9, -0.38), c4 = q(-0.9, -0.36);
      brim.moveTo(a.x, a.y);
      brim.quadraticCurveTo(c1.x, c1.y, b.x, b.y);
      brim.quadraticCurveTo(c2.x, c2.y, d.x, d.y);
      brim.quadraticCurveTo(c3.x, c3.y, e.x, e.y);
      brim.quadraticCurveTo(c4.x, c4.y, a.x, a.y);
      brim.closePath();
      out.push({ path: softPath(ring(-0.05, -0.68, 0.92, 0.72, Math.PI, Math.PI * 2, 8, -0.12)), hex, light: 1.02, rim: lw });
      out.push({ path: brim, hex, rim: lw });
      break;
    }
    case 'headband':
      // sky, as the band across the shirt (04 7.2 allows awningRed or sky; red would pass for a signature scarf, 7.3 rule 1)
      out.push({ path: linePath(ring(0, -0.05, 1.0, 1.0, Math.PI * 1.05, Math.PI * 1.85, 8)), hex: sky, stroke: Math.max(1, r * 0.34) });
      break;
    default:
      break;
  }
  return out;
}

/* ---------- faces (04 7.5): eyes from h 8; brows (0.3 hr), mouth (0.5 hr) and the blush from 12; the expression table of 7.5 item 3 ---------- */
type Brow = 'flat' | 'raised' | 'together' | 'angled' | 'one';
type Mouth = 'flat' | 'small' | 'arc' | 'o' | 'wavy' | 'down' | 'wide';
/** 04 7.5 item 3: brows, mouth and blush per row (blush 1 both, 1.3 both larger, -1 the near cheek only); `closed` eyes at Kiss. */
const FACE: Record<Expr, readonly [Brow, Mouth, number]> = {
  idle: ['flat', 'flat', 0], chat: ['raised', 'small', 1], bench: ['flat', 'arc', 1], kiss: ['flat', 'arc', 1.3], propose: ['raised', 'o', 1],
  receive: ['raised', 'o', 1.3], huddle: ['together', 'wavy', 0], stumble: ['raised', 'o', 0], distracted: ['one', 'small', -1],
  baffled: ['one', 'flat', 0], lost: ['together', 'flat', 0], huff: ['angled', 'down', 0], laugh: ['raised', 'wide', 1], watch: ['raised', 'o', 0],
};

function features(c: Ink, S: Skel, o: Opts): void {
  const { ctx } = c.pen;
  const P = c.pen.spec.palette;
  const h = S.h, hr = S.hr;
  ctx.save();
  ctx.translate(S.head.x, S.head.y);
  ctx.rotate(S.tilt);
  const [brow, mouth, blush] = FACE[S.expr];
  const eo = hr * 0.34, ey = -hr * 0.12 + (S.tilt > 0.15 ? hr * 0.08 : 0);
  const shift = o.lookAt === 0 || o.lookAt === o.face ? hr * 0.06 : -hr * 0.06;
  const er = Math.max(0.55, hr * 0.16);
  const ex1 = eo + shift, ex2 = eo * 0.05 + shift; // the near eye, and the far eye at 0.05 hr in profile (7.5 rule 1)
  if (S.expr === 'kiss') {
    // closed eyes: two short lines
    ctx.strokeStyle = inkOf(c, P.eye);
    ctx.lineWidth = Math.max(0.6, er * 0.9);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const x of [ex1, ex2]) {
      ctx.moveTo(x - er, ey + er * 0.3);
      ctx.lineTo(x + er, ey - er * 0.2);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = inkOf(c, P.eye);
    ctx.beginPath();
    if (h >= LOD.close) {
      ctx.ellipse(ex1, ey, er * 0.9, er * 1.15, 0, 0, Math.PI * 2);
      ctx.moveTo(ex2 + er, ey);
      ctx.ellipse(ex2, ey, er * 0.85, er * 1.1, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(ex1, ey, er, 0, Math.PI * 2);
      ctx.moveTo(ex2 + er, ey);
      ctx.arc(ex2, ey, er, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  if (h >= LOD.expression) {
    // brows: two 0.3 hr strokes; raised 0.1 hr; drawn together; together and angled (huff); one raised (the far one)
    ctx.strokeStyle = inkOf(c, P.ink, 0.9);
    ctx.lineWidth = Math.max(0.6, hr * 0.12);
    ctx.lineCap = 'round';
    const by = ey - hr * 0.32, bw = hr * 0.15;
    ctx.beginPath();
    for (const bx of [ex2, ex1]) {
      const inner = bx === ex2 ? 1 : -1; // the end toward the other eye
      const up = brow === 'raised' || (brow === 'one' && bx === ex2) ? hr * 0.1 : 0;
      const dIn = brow === 'angled' ? hr * 0.1 : brow === 'together' ? hr * 0.06 : 0;
      const dOut = brow === 'angled' ? -hr * 0.07 : brow === 'together' ? -hr * 0.03 : 0;
      ctx.moveTo(bx + inner * bw, by - up + dIn);
      ctx.lineTo(bx - inner * bw, by - up + dOut);
    }
    ctx.stroke();
    // the mouth: one 0.5 hr stroke, or the row's arc, O or wave
    const mx = hr * 0.3, my = hr * 0.38, mw = hr * 0.25;
    ctx.strokeStyle = inkOf(c, P.ink, 0.9);
    ctx.lineWidth = Math.max(0.6, hr * 0.11);
    ctx.beginPath();
    if (mouth === 'small') ctx.arc(mx, my - hr * 0.12, hr * 0.27, 0.38, Math.PI - 0.38);
    else if (mouth === 'arc') ctx.arc(mx, my - hr * 0.16, hr * 0.3, 0.25, Math.PI - 0.25);
    else if (mouth === 'wide') ctx.arc(mx, my - hr * 0.14, hr * 0.32, 0.05, Math.PI - 0.05);
    else if (mouth === 'down') ctx.arc(mx, my + hr * 0.26, hr * 0.27, Math.PI + 0.38, Math.PI * 2 - 0.38);
    else if (mouth === 'o') ctx.ellipse(mx, my, hr * 0.11, hr * 0.14, 0, 0, Math.PI * 2);
    else if (mouth === 'wavy') {
      ctx.moveTo(mx - mw, my);
      ctx.quadraticCurveTo(mx - mw / 2, my - hr * 0.08, mx, my);
      ctx.quadraticCurveTo(mx + mw / 2, my + hr * 0.08, mx + mw, my);
    } else {
      ctx.moveTo(mx - mw, my);
      ctx.lineTo(mx + mw, my);
    }
    ctx.stroke();
    // blush: two rose discs at alpha 0.42 (GV 8414), x1.3 at Kiss and Proposal, the near one only when distracted
    if (blush !== 0) {
      const k = Math.abs(blush);
      ctx.fillStyle = inkOf(c, P.rose, 0.42);
      ctx.beginPath();
      ctx.arc(ex1 + hr * 0.08, hr * 0.2, Math.max(0.5, hr * 0.17 * k), 0, Math.PI * 2);
      if (blush > 0) {
        ctx.moveTo(ex2 - hr * 0.1 + hr * 0.14 * k, hr * 0.22);
        ctx.arc(ex2 - hr * 0.1, hr * 0.22, Math.max(0.45, hr * 0.14 * k), 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  ctx.restore();
}
