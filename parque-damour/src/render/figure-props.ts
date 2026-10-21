// src/render/figure-props.ts
// The archetype signifiers of 04 7.2 and the held items of 03 7.6 item 4, as shapes in the figure's facing frame (+x forward, y down, the
// feet at 0) for the Tailored rig: filled props with a fine rim and, close up, their seams; the easel prop the artist paints at (02 4.3,
// act.ts puts it in OCC); the aprons and the stranger's coat. Colours only from style().palette: cane and camera `ink`, the tourist's hat
// `paper`, the tote `bedEarth`, the balloon `rose` or `sky`, the book `sky`, the bellows `awningRed` with `paper` keys, the gardener's
// apron `foliageSummer` x 0.8 and the vendor's `paper`, the stranger's coat `ink` x 1.3, ice cream on a `baguette` cone.
// Ported from GV 8050-8160 (toolFor and drawTool: one held thing per state, drawn at the hand along the forearm), by way of the options
// page the owner picked from (scratch/s4-options-props.ts, manner 2 Tailored; register section 4, Figure rig).
// Verdict: ADAPT. Changes: the park's items (book, crumbs, ice cream, camera, brush, palette, rake, trowel, balloon, bouquet, tote,
// accordion, cane) instead of GV's tools; no swing curve (nothing here strikes). Dropped from the range: SWING_P, swingCurve, hatPath
// (GV's pointed hat), every gnome tool; the page's manners 1 and 3.
// S6 art (register section 4 "S6 art and S5 poses", picked by Claude on the owner's delegation, 2026-10-20): the purse on her arm, the
// baguette in the back hand or sticking out of a parent's tote (visitor.ts items: what Pompon takes is what was seen), and the flower
// seller's basket of blooms (florist 1, the basket seller; scratch/s6-options-cameos.ts basket()); all in palette A through P.
import { scaleHex, type Pen, type Pt } from './ambient.ts';
import { FH, LOD, P2, drawShapes, ellPath, lerpP, linePath, polyPath, softPath, type Item, type Shape, type Skel } from './figure-rig.ts';

const rot = (q: Pt, a: number): Pt => P2(q.x * Math.cos(a) - q.y * Math.sin(a), q.x * Math.sin(a) + q.y * Math.cos(a));
const addP = (a: Pt, b: Pt): Pt => P2(a.x + b.x, a.y + b.y);

/** A rounded rectangle centred at c, w x h, turned by a. */
function box(c: Pt, w: number, h: number, a = 0): Path2D {
  return softPath([P2(-w / 2, -h / 2), P2(w / 2, -h / 2), P2(w / 2, h / 2), P2(-w / 2, h / 2)].map((q) => addP(c, rot(q, a))));
}

/** A baguette of length len and width w from `at` along angle a (from the facing axis, - up), starting `from` behind `at`: a rounded loaf. */
function loaf(at: Pt, len: number, w: number, a: number, from: number): Path2D {
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, s0 = -from, s1 = len - from;
  const q = (s: number, k: number): Pt => P2(at.x + ux * s + nx * k, at.y + uy * s + ny * k);
  return softPath([q(s0, -w / 2), q(s0 + w * 0.35, -w * 0.62), q(s1 - w * 0.5, -w * 0.62), q(s1, -w * 0.1), q(s1, w * 0.1), q(s1 - w * 0.5, w * 0.62), q(s0 + w * 0.35, w * 0.62), q(s0, w / 2)]);
}
/** Four diagonal slashes across a loaf (a close-up detail). */
function slashes(at: Pt, len: number, w: number, a: number, from: number): Path2D {
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, p = new Path2D();
  for (let i = 0; i < 4; i++) {
    const s = -from + len * (0.2 + i * 0.19);
    p.moveTo(at.x + ux * (s - w * 0.2) + nx * -w * 0.22, at.y + uy * (s - w * 0.2) + ny * -w * 0.22);
    p.lineTo(at.x + ux * (s + w * 0.2) + nx * w * 0.22, at.y + uy * (s + w * 0.2) + ny * w * 0.22);
  }
  return p;
}

/** The item in one hand, as shapes behind (under the hand) and in front; `balloon` is the balloon's hex (04 7.2: rose or sky). */
export function itemShapes(pen: Pen, S: Skel, item: Item, hand: Pt, elbow: Pt, front: boolean, balloon: string): { back: Shape[]; fore: Shape[] } {
  const P = pen.spec.palette;
  const h = S.h, lw = S.lw;
  const thin = Math.max(0.6, lw * 0.5);
  const back: Shape[] = [], fore: Shape[] = [];
  const rimK = lw * 0.75;
  const put = (s: Shape, toBack = false): void => void (toBack ? back : fore).push(s);
  const dir = P2(hand.x - elbow.x, hand.y - elbow.y);
  const dl = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / dl, uy = dir.y / dl;
  switch (item) {
    case 'cane': {
      // a walking cane from the hand to the ground ahead, with a crook (04 7.2: cane `ink`)
      const crook = new Path2D();
      crook.moveTo(hand.x + 0.035 * h, 0);
      crook.lineTo(hand.x + 0.004 * h, hand.y - 0.02 * h);
      crook.quadraticCurveTo(hand.x, hand.y - 0.065 * h, hand.x - 0.045 * h, hand.y - 0.035 * h);
      put({ path: crook, hex: P.ink, stroke: lw * 0.6, light: 1.25 });
      break;
    }
    case 'camera-chest':
    case 'camera-up': {
      // a camera, `ink`, with a `paper` lens ring; at the chest on a strap, or up at the eye
      const up = item === 'camera-up';
      const c = up ? P2(S.head.x + 0.115 * h, S.head.y + 0.01 * h) : P2(S.neck.x + 0.06 * h, S.neck.y + 0.12 * h);
      const cw = 0.095 * h, ch = 0.062 * h;
      if (!up) put({ path: linePath([P2(S.neck.x - 0.03 * h, S.neck.y - 0.005 * h), P2(c.x - cw * 0.35, c.y - ch * 0.4)]), hex: P.ink, stroke: Math.max(0.5, lw * 0.32) }, true);
      put({ path: box(c, cw, ch, up ? 0 : 0.05), hex: P.ink, light: 1.15, rim: lw * 0.5 });
      if (h >= LOD.eyes) {
        const lens = P2(c.x + (up ? cw * 0.42 : cw * 0.08), c.y + (up ? 0 : ch * 0.08));
        put({ path: ellPath(lens.x, lens.y, ch * 0.34, ch * 0.34), hex: P.paper, light: 0.95 });
        put({ path: ellPath(lens.x, lens.y, ch * 0.18, ch * 0.18), hex: P.ink, light: 1.2 });
        put({ path: box(P2(c.x - cw * 0.22, c.y - ch * 0.62), cw * 0.3, ch * 0.3), hex: P.ink, light: 1.35 });
      }
      break;
    }
    case 'book': {
      // an open book held up in both hands at the chest: a `sky` cover (no saturated accent beside a signature scarf, 04 7.3 rule 1)
      // and two `paper` pages in a shallow V, a spine and, close up, lines of print
      const c = P2((S.haF.x + S.haB.x) / 2 + 0.005 * h, (S.haF.y + S.haB.y) / 2 - 0.04 * h);
      const bw = 0.16 * h, bh = 0.1 * h;
      const at = (x: number, y: number): Pt => addP(c, rot(P2(x, y), -0.22));
      put({ path: polyPath([at(-bw * 0.54, -bh * 0.44), at(0, -bh * 0.56), at(bw * 0.54, -bh * 0.44), at(bw * 0.54, bh * 0.56), at(0, bh * 0.46), at(-bw * 0.54, bh * 0.56)]), hex: P.sky, light: 0.86, rim: rimK * 0.8 });
      put({ path: polyPath([at(-bw * 0.48, -bh * 0.42), at(0, -bh * 0.5), at(bw * 0.48, -bh * 0.42), at(bw * 0.48, bh * 0.44), at(0, bh * 0.36), at(-bw * 0.48, bh * 0.44)]), hex: P.paper });
      if (h >= LOD.expression) put({ path: linePath([at(0, -bh * 0.5), at(0, bh * 0.36)]), hex: P.ink, stroke: thin * 0.8, alpha: 0.45 });
      if (h >= LOD.close) {
        const print = new Path2D();
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            const y = -bh * 0.22 + i * bh * 0.2;
            const p0 = at(side * bw * 0.08, y - bh * 0.06), p1 = at(side * bw * 0.4, y);
            print.moveTo(p0.x, p0.y);
            print.lineTo(p1.x, p1.y);
          }
        }
        put({ path: print, hex: P.ink, stroke: Math.max(0.4, lw * 0.18), alpha: 0.32 });
      }
      break;
    }
    case 'crumbs':
      // a small paper bag of crumbs in the lap hand
      put({ path: box(P2(hand.x + 0.01 * h, hand.y - 0.02 * h), 0.06 * h, 0.075 * h, 0.1), hex: P.paper, light: 0.95, rim: rimK * 0.8 }, true);
      break;
    case 'icecream':
    case 'cone-serve': {
      // a cone (`baguette`, 0.1 h) and a scoop (`rose`, 0.1 h across): held up before the mouth when eating, the scoop tipped toward it
      const a = item === 'icecream' ? -0.5 : -0.05;
      const at = (x: number, y: number): Pt => addP(hand, rot(P2(x * h, y * h), a));
      put({ path: polyPath([at(-0.034, -0.07), at(0.034, -0.07), at(0, 0.03)]), hex: P.baguette, rim: rimK * 0.7 });
      if (h >= LOD.close) put({ path: linePath([at(-0.02, -0.045), at(0.022, -0.02)]), hex: P.baguette, stroke: Math.max(0.4, lw * 0.2), light: 0.78 });
      const sc = at(0, -0.1);
      put({ path: ellPath(sc.x, sc.y, 0.05 * h, 0.045 * h), hex: P.rose, light: 1.02, rim: rimK * 0.7 });
      if (h >= LOD.close) put({ path: ellPath(sc.x - 0.015 * h, sc.y - 0.015 * h, 0.013 * h, 0.01 * h), hex: P.paper, alpha: 0.7 });
      break;
    }
    case 'brush': {
      // a long brush with a loaded tip
      const tip = P2(hand.x + ux * 0.1 * h + 0.03 * h, hand.y + uy * 0.1 * h - 0.04 * h);
      const tail = P2(hand.x - ux * 0.03 * h, hand.y - uy * 0.03 * h + 0.01 * h);
      put({ path: linePath([tail, tip]), hex: P.trunk[1], stroke: Math.max(0.6, lw * 0.45), rim: lw * 0.35 });
      put({ path: ellPath(tip.x, tip.y, Math.max(0.6, lw * 0.5), Math.max(0.6, lw * 0.5)), hex: P.signature[2] as string });
      break;
    }
    case 'palette': {
      // a `paper` palette with 4 paint dots (04 7.2)
      const c = P2(hand.x + 0.01 * h, hand.y - 0.012 * h);
      const pw = 0.088 * h, ph = 0.045 * h;
      put({ path: ellPath(c.x, c.y, pw / 2, ph / 2, -0.25), hex: P.paper, rim: rimK * 0.8 }, !front);
      if (h >= LOD.eyes) {
        [P.awningRed, P.bedMarigold, P.sky, P.foliageSummer].forEach((d, i) => {
          const q = addP(c, rot(P2((i - 1.5) * pw * 0.2, -ph * 0.06 + (i % 2) * ph * 0.12), -0.25));
          put({ path: ellPath(q.x, q.y, Math.max(0.5, ph * 0.16), Math.max(0.5, ph * 0.16)), hex: d }, !front);
        });
      }
      break;
    }
    case 'rake-down':
    case 'rake-shoulder': {
      // a wooden rake: handle `trunk`, head `zinc` with tines; down at the gravel, or over the shoulder
      const shoulder = item === 'rake-shoulder';
      let a0: Pt, a1: Pt;
      if (!shoulder) {
        a1 = P2(hand.x + 0.2 * h, -0.005 * h);
        const d = P2(a1.x - hand.x, a1.y - hand.y), l = Math.hypot(d.x, d.y);
        a0 = P2(hand.x - (d.x / l) * 0.2 * h, hand.y - (d.y / l) * 0.2 * h);
      } else {
        a0 = P2(hand.x + 0.13 * h, hand.y + 0.16 * h);
        a1 = P2(hand.x - 0.22 * h, hand.y - 0.2 * h);
      }
      put({ path: linePath([a0, a1]), hex: P.trunk[1], stroke: Math.max(0.6, lw * 0.5), rim: lw * 0.4 }, shoulder);
      const d = P2(a1.x - a0.x, a1.y - a0.y), l = Math.hypot(d.x, d.y);
      const nx = -d.y / l, ny = d.x / l, hl = 0.06 * h;
      const hA = P2(a1.x + nx * hl, a1.y + ny * hl), hB = P2(a1.x - nx * hl, a1.y - ny * hl);
      put({ path: linePath([hA, hB]), hex: P.zinc, stroke: Math.max(0.7, lw * 0.6), rim: lw * 0.35 }, shoulder);
      if (h >= LOD.expression) {
        const tines = new Path2D();
        for (let i = 0; i <= 4; i++) {
          const q = lerpP(hA, hB, i / 4);
          tines.moveTo(q.x, q.y);
          tines.lineTo(q.x + (d.x / l) * 0.03 * h, q.y + (d.y / l) * 0.03 * h);
        }
        put({ path: tines, hex: P.zinc, stroke: Math.max(0.5, lw * 0.3), light: 0.85 }, shoulder);
      }
      break;
    }
    case 'trowel':
      put({ path: linePath([P2(hand.x - 0.01 * h, hand.y - 0.01 * h), P2(hand.x + 0.04 * h, hand.y + 0.03 * h)]), hex: P.zinc, stroke: Math.max(0.7, lw * 0.6) });
      break;
    case 'balloon': {
      // a balloon on a string, high over the child (04 7.2)
      const top = P2(hand.x + 0.08 * h, hand.y - 0.62 * h);
      const string = new Path2D();
      string.moveTo(hand.x, hand.y);
      string.bezierCurveTo(hand.x + 0.06 * h, hand.y - 0.2 * h, top.x - 0.06 * h, top.y + 0.3 * h, top.x, top.y + 0.13 * h);
      put({ path: string, hex: P.ink, stroke: Math.max(0.5, lw * 0.3), alpha: 0.8 }, true);
      const r = 0.13 * h;
      put({ path: ellPath(top.x, top.y, r * 0.9, r), hex: balloon, rim: lw * 0.55 }, true);
      put({ path: polyPath([P2(top.x - r * 0.15, top.y + r * 1.15), P2(top.x + r * 0.15, top.y + r * 1.15), P2(top.x, top.y + r * 0.95)]), hex: balloon, light: 0.9 }, true);
      if (h >= LOD.eyes) put({ path: ellPath(top.x - r * 0.35, top.y - r * 0.35, r * 0.22, r * 0.3, 0.5), hex: P.paper, alpha: 0.65 }, true);
      break;
    }
    case 'bouquet': {
      // a bouquet wrapped in `paper`, three blooms (`rose`, `bedMarigold`, `bedLavender`) on leaves
      const c = P2(hand.x + 0.02 * h, hand.y - 0.035 * h);
      put({ path: ellPath(c.x + 0.005 * h, c.y - 0.06 * h, 0.06 * h, 0.035 * h, -0.4), hex: P.foliageSummer, light: 0.82, rim: rimK * 0.6 });
      const blooms: Array<[string, number, number]> = [[P.rose, -0.025, -0.085], [P.bedMarigold, 0.025, -0.095], [P.bedLavender, 0, -0.06], [P.rose, 0.045, -0.06]];
      for (const [hex, dx, dy] of blooms) put({ path: ellPath(c.x + dx * h, c.y + dy * h, 0.024 * h, 0.024 * h), hex, light: 1.02, rim: rimK * 0.5 });
      put({ path: polyPath([P2(hand.x - 0.005 * h, hand.y + 0.05 * h), P2(c.x + 0.055 * h, c.y - 0.04 * h), P2(c.x - 0.04 * h, c.y - 0.055 * h)]), hex: P.paper, light: 0.98, rim: rimK * 0.7 });
      break;
    }
    case 'tote':
    case 'tote-bread': {
      // a tote bag (`bedEarth`) hanging from the hand by its straps; a baguette sticks out of its top slanting forward (S6 art)
      const c = P2(hand.x + 0.005 * h, hand.y + 0.075 * h);
      if (item === 'tote-bread') put({ path: loaf(P2(c.x + 0.01 * h, c.y - 0.05 * h), 0.36 * h, 0.05 * h, -1.2, 0.15 * h), hex: P.baguette, rim: rimK * 0.7 }, true);
      const bw = 0.085 * h, bh = 0.09 * h;
      const strap = new Path2D();
      strap.moveTo(c.x - bw * 0.3, c.y - bh * 0.45);
      strap.quadraticCurveTo(hand.x, hand.y - 0.03 * h, c.x + bw * 0.3, c.y - bh * 0.45);
      put({ path: strap, hex: P.bedEarth, stroke: Math.max(0.6, lw * 0.4), light: 0.8 }, true);
      put({ path: softPath([P2(c.x - bw * 0.45, c.y - bh / 2), P2(c.x + bw * 0.45, c.y - bh / 2), P2(c.x + bw * 0.55, c.y + bh / 2), P2(c.x - bw * 0.55, c.y + bh / 2)]), hex: P.bedEarth, rim: rimK * 0.8 }, true);
      if (h >= LOD.close) put({ path: linePath([P2(c.x - bw * 0.45, c.y - bh * 0.18), P2(c.x + bw * 0.45, c.y - bh * 0.18)]), hex: P.bedEarth, stroke: Math.max(0.5, lw * 0.3), light: 0.78 }, true);
      break;
    }
    case 'purse': {
      // a little handbag on a strap from the back hand (S6 art): `crowdTop[9]` cognac with a `lamp` clasp, hanging at her hip
      const c = P2(hand.x + 0.005 * h, hand.y + 0.06 * h), hex = P.crowdTop[9] as string;
      const bw = 0.1 * h, bh = 0.068 * h;
      const strap = new Path2D();
      strap.moveTo(c.x - bw * 0.3, c.y - bh * 0.5);
      strap.quadraticCurveTo(hand.x, hand.y - 0.025 * h, c.x + bw * 0.3, c.y - bh * 0.5);
      put({ path: strap, hex, stroke: Math.max(0.5, lw * 0.34), light: 0.82 });
      put({ path: softPath([P2(c.x - bw / 2, c.y - bh / 2), P2(c.x + bw / 2, c.y - bh / 2), P2(c.x + bw * 0.55, c.y + bh / 2), P2(c.x - bw * 0.55, c.y + bh / 2)]), hex, rim: rimK * 0.8 });
      if (h >= LOD.eyes) put({ path: ellPath(c.x, c.y - bh * 0.18, Math.max(0.5, bw * 0.07), Math.max(0.5, bw * 0.07)), hex: P.lamp, light: 1.05 });
      break;
    }
    case 'baguette': {
      // a baguette carried in the back hand, slanting up and forward across her: `baguette`, a rim, four slashes close up
      put({ path: loaf(hand, 0.37 * h, 0.05 * h, -0.95, 0.1 * h), hex: P.baguette, rim: rimK * 0.7 });
      if (h >= LOD.expression) put({ path: slashes(hand, 0.37 * h, 0.05 * h, -0.95, 0.1 * h), hex: P.baguette, stroke: Math.max(0.4, lw * 0.22), light: 1.3 });
      break;
    }
    case 'basket': {
      // the flower seller's wicker basket on her arm, its blooms up over the rim, the handle over the top (florist 1, the basket seller)
      const w = 0.26 * h, c = P2(hand.x - 0.02 * h, hand.y);
      const stems = new Path2D(), dots: Array<[number, number, string]> = [];
      const blooms = [P.rose, P.bedMarigold, P.bedLavender];
      for (let i = 0; i < 5; i++) {
        const x = c.x + (i / 4 - 0.5) * w * 0.9, y = c.y - w * 0.34 - 0.18 * w * 0.9 * Math.sin(i * 1.7 + 1);
        stems.moveTo(c.x + (x - c.x) * 0.4, c.y);
        stems.lineTo(x, y);
        dots.push([x, y, blooms[i % 3] as string]);
      }
      put({ path: stems, hex: scaleHex(P.foliageSummer, [0.75, 0.75, 0.75]), stroke: Math.max(0.5, w * 0.04) });
      for (const [x, y, hex] of dots) {
        put({ path: ellPath(x, y, Math.max(1.1, w * 0.13), Math.max(1.1, w * 0.13)), hex, light: 1.02, rim: rimK * 0.4 });
        if (h >= LOD.eyes) put({ path: ellPath(x, y, Math.max(0.4, w * 0.04), Math.max(0.4, w * 0.04)), hex: P.lamp });
      }
      put({ path: polyPath([P2(c.x - w * 0.5, c.y), P2(c.x - w * 0.36, c.y + w * 0.42), P2(c.x + w * 0.36, c.y + w * 0.42), P2(c.x + w * 0.5, c.y)]), hex: P.wicker, light: 0.92, rim: rimK * 0.8 });
      if (h >= LOD.expression) {
        const weave = new Path2D();
        for (let i = -2; i <= 2; i++) {
          weave.moveTo(c.x + i * w * 0.2, c.y + w * 0.04);
          weave.lineTo(c.x + i * w * 0.15, c.y + w * 0.4);
        }
        put({ path: weave, hex: P.wicker, stroke: Math.max(0.4, w * 0.03), light: 0.7 });
      }
      put({ path: ellPath(c.x, c.y, w * 0.5, w * 0.13), hex: P.wicker, light: 1.12, rim: rimK * 0.8 });
      const handle = new Path2D();
      handle.arc(c.x, c.y, w * 0.45, Math.PI * 1.1, Math.PI * 1.9);
      put({ path: handle, hex: P.wicker, stroke: Math.max(0.5, w * 0.05), light: 0.85, rim: rimK * 0.5 });
      break;
    }
    case 'accordion': {
      // the busker's accordion at the chest: `awningRed` bellows with `paper` pleats, `paper` keys at the near end (04 7.2)
      const c = P2(S.neck.x + 0.05 * h, S.neck.y + 0.13 * h);
      const aw = 0.13 * h, ah = 0.11 * h;
      put({ path: box(c, aw, ah), hex: P.awningRed, rim: rimK * 0.8 });
      if (h >= LOD.eyes) {
        const pleats = new Path2D();
        const n = h >= LOD.close ? 5 : 3;
        for (let i = 1; i <= n; i++) {
          const x = c.x - aw / 2 + (aw * 0.72 * i) / (n + 1);
          pleats.moveTo(x, c.y - ah * 0.42);
          pleats.lineTo(x, c.y + ah * 0.42);
        }
        put({ path: pleats, hex: P.paper, stroke: Math.max(0.5, lw * 0.32), alpha: 0.75 });
      }
      put({ path: polyPath([P2(c.x + aw * 0.3, c.y - ah * 0.52), P2(c.x + aw * 0.5, c.y - ah * 0.52), P2(c.x + aw * 0.5, c.y + ah * 0.52), P2(c.x + aw * 0.3, c.y + ah * 0.52)]), hex: P.paper, light: 0.98, rim: lw * 0.4 });
      if (h >= LOD.close) {
        const keys = new Path2D();
        for (let i = 0; i < 4; i++) {
          const y = c.y - ah * 0.35 + (ah * 0.7 * i) / 3;
          keys.moveTo(c.x + aw * 0.33, y);
          keys.lineTo(c.x + aw * 0.47, y);
        }
        put({ path: keys, hex: P.ink, stroke: Math.max(0.4, lw * 0.22), alpha: 0.6 });
      }
      break;
    }
    default:
      break; // 'none', and 'lead': the dog's lead is drawn from the hand by people.ts (04 7.2 dog walker)
  }
  return { back, fore };
}

/** The easel prop (02 4.3 artist; 04 7.2): three `trunk` legs, a crossbar, a `paper` canvas with a little park painted on it. */
export function easelShapes(pen: Pen, base: Pt, h: number, lw: number): Shape[] {
  const P = pen.spec.palette;
  const out: Shape[] = [];
  const top = P2(base.x, base.y - 0.98 * h);
  const legW = Math.max(0.6, lw * 0.55), wood = P.trunk[1], rim = lw * 0.4;
  out.push({ path: linePath([P2(base.x + 0.04 * h, base.y - 0.02 * h), P2(top.x + 0.06 * h, top.y + 0.12 * h)]), hex: wood, stroke: legW, light: 0.8, rim });
  out.push({ path: linePath([P2(base.x - 0.14 * h, base.y), top]), hex: wood, stroke: legW, rim });
  out.push({ path: linePath([P2(base.x + 0.14 * h, base.y + 0.01 * h), top]), hex: wood, stroke: legW, rim });
  const shelfY = base.y - 0.42 * h;
  out.push({ path: linePath([P2(base.x - 0.11 * h, shelfY), P2(base.x + 0.11 * h, shelfY)]), hex: wood, stroke: legW * 1.2, rim });
  // the canvas, and on it sky, lawn, a tree and a rose dab (drawn, never text)
  const cw = 0.32 * h, ch = 0.26 * h;
  const cc = P2(base.x, shelfY - ch / 2 - 0.005 * h);
  out.push({ path: polyPath([P2(cc.x - cw / 2, cc.y - ch / 2), P2(cc.x + cw / 2, cc.y - ch / 2 + 0.01 * h), P2(cc.x + cw / 2, cc.y + ch / 2), P2(cc.x - cw / 2, cc.y + ch / 2)]), hex: P.paper, rim: lw * 0.8 });
  const inner = (x: number, y: number): Pt => P2(cc.x - cw / 2 + cw * x, cc.y - ch / 2 + ch * y);
  const ins = 0.1;
  out.push({ path: polyPath([inner(ins, ins + 0.02), inner(1 - ins, ins + 0.04), inner(1 - ins, 0.58), inner(ins, 0.6)]), hex: P.sky, light: 1.02 });
  out.push({ path: polyPath([inner(ins, 0.58), inner(1 - ins, 0.56), inner(1 - ins, 1 - ins), inner(ins, 1 - ins)]), hex: P.lawn });
  if (h >= LOD.expression) {
    const t = inner(0.62, 0.42);
    out.push({ path: ellPath(t.x, t.y, cw * 0.13, ch * 0.18), hex: P.foliageSummer, light: 0.86 });
    out.push({ path: linePath([inner(0.62, 0.52), inner(0.62, 0.66)]), hex: P.trunk[0], stroke: Math.max(0.5, cw * 0.03) });
    const r = inner(0.3, 0.72);
    out.push({ path: ellPath(r.x, r.y, cw * 0.05, cw * 0.04), hex: P.rose });
  }
  return out;
}

/** The easel at its tile's centre on screen `s` (props.ts drawProp), sized against a grown visitor at this zoom (FH). */
export function drawEasel(pen: Pen, s: Pt): void {
  const h = FH * pen.z;
  if (h < LOD.body) return;
  const lw = Math.max(0.9, 0.06 * h);
  drawShapes({ pen, warm: 0 }, easelShapes(pen, P2(s.x, s.y - 1), h, lw));
}

/** The aprons: the gardener's green (`foliageSummer` x 0.8) and the vendor's white (`paper`), a bib from the chest to the knee. */
export function apronHex(pen: Pen, arche: string): string | null {
  const P = pen.spec.palette;
  if (arche === 'gardener' || arche === 'florist') return scaleHex(P.foliageSummer, [0.8, 0.8, 0.8]);
  return arche === 'vendor' ? P.paper : null;
}
/** The stranger's long coat: `ink` x 1.3 (04 7.2). */
export function strangerCoat(pen: Pen): string {
  return scaleHex(pen.spec.palette.ink, [1.3, 1.3, 1.3]);
}
