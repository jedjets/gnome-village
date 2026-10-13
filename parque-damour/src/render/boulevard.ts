// src/render/boulevard.ts
// The boulevard on the east, south and west sides (register 3.1, the owner on 2026-10-13: "some trees as a border, then a road, then
// buildings"; 03 7.4 items 3 and 5; 04 6.4): its ground, painted in phase 3 under every drawable (the tree pavement with its joints and
// tree grates, the cobbled road with its dashed centre line, the kerbs, the far pavement, the back pavement behind the blocks and, on the
// sides that face the camera, the cobbled back street past it), and the
// street trees, plane trees in season with the park's, as apron drawables blitted from the tree sprite cache (flora.ts), so the painter
// sorts them with the props. A street tree whose crown would cover park tiles (the sides that face the camera) draws its crown at 35 %
// over a solid trunk, easing over 0.4 s after a turn, so the park stays in view (the see-through canopy of GV 333-334, v9.2.1; the near-side
// blocks are apron.ts's opaque ground floors). This is variant 1 of the boulevard gate (register section 4, picked 2026-10-13);
// BOULEVARD holds its knobs as a parameter table, as props-park.ts's, so a scratch page can show the other variants.
// NEW: nothing ported (GV has no streets); the sprite blit is GV drawTree 6837-6848 through flora.treeSpriteOf.
import type { XY } from '../core/math.ts';
import { now } from '../core/loop.ts';
import { APRON, BACKDROP, bandRects, streetTrees, type StreetTree } from '../world/park.ts';
import { EH, TH, TW, cam, rotVec, screenToWorld, view } from './camera.ts';
import { screenInto } from './project.ts';
import { depthOf, type Drawable } from './order.ts';
import { h01, mix, shade, style } from './ambient.ts';
import { SPECIES_HEIGHT, treeSpriteOf, type SpriteLayer, type TreeSprite } from './flora.ts';
import { viewBounds } from './ground.ts';

/**
 * Variant 1's knobs. seeds: the street trees' shapes, plane forms by seed mod 3 (dome, tall oval: full crowns, no umbrella), one per
 * tree by h01 of its place, so the cache holds four sprites a layer; nearCrown: the alpha of a crown over the park; fadeMs: its ease;
 * floor: a near-side block's ground floor in EH (apron.ts); cobbleZoom, jointZoom: the zooms from which the cobbles and the paving
 * joints draw; dash: the centre line's dash and gap in tiles.
 */
export const BOULEVARD = {
  variant: 1,
  seeds: [300.37, 301.71, 303.29, 304.53] as readonly number[],
  nearCrown: 0.35,
  fadeMs: 400,
  floor: 1.2,
  cobbleZoom: 1,
  jointZoom: 0.7,
  dash: [0.55, 0.45] as readonly number[],
};

/* ---------- the colours: the palette's, mixed (no literal outside ambient.ts, 04 4.5) ---------- */
type Hues = { pave: string; road: string; dab: string; line: string; kerb: string; gutter: string; iron: string; pit: string };
let HUES: Hues | null = null;
function hues(): Hues {
  if (HUES) return HUES;
  const P = style().palette, road = mix(mix(P.zinc, P.bedEarth, 0.38), P.flagstone, 0.2);
  HUES = {
    pave: mix(P.flagstone, P.stone, 0.5), // pale stone
    road, // a warm grey
    dab: mix(road, P.paper, 0.42),
    line: P.paper,
    kerb: mix(P.stone, P.paper, 0.3),
    gutter: mix(road, P.ink, 0.35),
    iron: mix(P.ink, P.zinc, 0.1),
    pit: P.bedEarth,
  };
  return HUES;
}

/* ---------- the ground (phase 3, inside backdrop.apronGround's world transform) ---------- */
/** The polyline `off` tiles out from the park edge round the E, S and W sides: from the quay on the west, round both southern corners,
 *  back up to the quay on the east (a kerb or the centre line). */
function ringLine(t: CanvasPath, off: number): void {
  const lo = -0.5 - off, hi = BACKDROP.quayY + 0.5, far = 47.5 + off;
  t.moveTo(lo, hi);
  t.lineTo(lo, far);
  t.lineTo(far, far);
  t.lineTo(far, hi);
}

type Chunk = { x0: number; y0: number; x1: number; y1: number; p: Path2D; side: number; back: boolean };
/** The outward normals of bandRects' three strips: west, south (with the corners), east. */
const SIDE_N: readonly (readonly [number, number])[] = [[-1, 0], [0, 1], [1, 0]];
/** Does strip k of a band face the camera (a near side)? */
function near(k: number): boolean {
  const [nx, ny] = SIDE_N[k] as readonly [number, number], r = rotVec(nx, ny);
  return r.x + r.y > 0;
}
/** The back street past ring 8 on the sides that face the camera: rings 9-10 a cobbled road with a kerb, so the near side reads as the
 *  city going on (the far sides' are behind their facades and never painted). */
const BACK_ROAD: readonly [number, number] = [APRON, APRON + 2];
let JOINTS: Path2D | null = null;
const COBBLES: Chunk[] = [];

/** The paving joints of the three pavements, built once in world units: a joint across every tile, and the tree pavement's middle seam. */
function joints(): Path2D {
  if (JOINTS) return JOINTS;
  const j = new Path2D(), B = BACKDROP;
  for (const [a, b] of [[B.treePavement[0] - 1, B.treePavement[1]], [B.farPavement - 1, B.farPavement], [B.facadesTo, APRON]] as const)
    for (const [x0, y0, x1, y1] of bandRects(a, b)) {
      const alongX = x1 - x0 > y1 - y0;
      for (let k = Math.ceil(alongX ? x0 : y0) + 0.5; k < (alongX ? x1 : y1); k++) {
        j.moveTo(alongX ? k : x0, alongX ? y0 : k);
        j.lineTo(alongX ? k : x1, alongX ? y1 : k);
      }
    }
  ringLine(j, B.treePavement[0]);
  JOINTS = j;
  return j;
}

/** The cobbles of the road and the back street, built once in world units in chunks of 4 x 2 tiles: six dabs a tile in three staggered
 *  rows, jittered by h01. */
function cobbles(): Chunk[] {
  if (COBBLES.length) return COBBLES;
  for (const [from, to, back] of [[BACKDROP.road[0] - 1, BACKDROP.road[1], false], [BACK_ROAD[0], BACK_ROAD[1], true]] as const)
    bandRects(from, to).forEach(([x0, y0, x1, y1], side) => {
      const alongX = x1 - x0 > y1 - y0;
      for (let a = alongX ? x0 : y0; a < (alongX ? x1 : y1) - 0.01; a += 4) {
        const p = new Path2D(), c: Chunk = alongX ? { x0: a, y0, x1: Math.min(x1, a + 4), y1, p, side, back } : { x0, y0: a, x1, y1: Math.min(y1, a + 4), p, side, back };
        for (let ty = c.y0 + 0.5; ty < c.y1; ty++)
          for (let tx = c.x0 + 0.5; tx < c.x1; tx++)
            for (let r = 0; r < 3; r++)
              for (let k = 0; k < 2; k++) {
                const u = ((k + 0.25 + (r % 2) * 0.5) / 2) % 1, v = (r + 0.5) / 3, j = h01(tx * 7 + r, ty * 5 + k, 31);
                const x = tx - 0.5 + (alongX ? u : v) + (j - 0.5) * 0.08, y = ty - 0.5 + (alongX ? v : u) + (h01(ty, tx, r * 2 + k) - 0.5) * 0.08;
                p.moveTo(x + 0.14, y);
                p.ellipse(x, y, 0.14, 0.1 + 0.03 * j, 0, 0, Math.PI * 2);
              }
        COBBLES.push(c);
      }
    });
  return COBBLES;
}

/**
 * The boulevard's ground in world units (the caller has set the world transform at e = 0): the tree pavement and the far pavement in
 * pale stone, the road in warm grey, the back pavement in ring 8 and the back street past it on the near sides; the joints from zoom 0.7,
 * the cobbles (lighter dabs) from zoom 1, the faint dashed centre line, a kerb with its gutter on each side of each road, and a grate
 * round each street tree from zoom 0.45. The blocks of rings 6-7 stand on the street the caller filled first.
 */
export function boulevardGround(ctx: CanvasRenderingContext2D): void {
  const H = hues(), B = BACKDROP, z = cam.z;
  const band = (a: number, b: number, hex: string, L: number): void => {
    ctx.fillStyle = shade(hex, L);
    for (const [x0, y0, x1, y1] of bandRects(a, b)) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  band(B.treePavement[0] - 1, B.treePavement[1], H.pave, 1);
  band(B.road[0] - 1, B.road[1], H.road, 1);
  band(B.farPavement - 1, B.farPavement, H.pave, 1);
  band(B.facadesTo, APRON, H.pave, 0.97);
  ctx.fillStyle = shade(H.road, 0.97);
  bandRects(BACK_ROAD[0], BACK_ROAD[1]).forEach(([x0, y0, x1, y1], k) => {
    if (near(k)) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  });
  ctx.lineCap = 'butt';
  if (z >= BOULEVARD.jointZoom) {
    ctx.strokeStyle = shade(H.pave, 0.86, 0.5);
    ctx.lineWidth = 0.03;
    ctx.stroke(joints());
  }
  if (z >= BOULEVARD.cobbleZoom) {
    const vb = viewBounds(1);
    ctx.fillStyle = shade(H.dab, 1, 0.5);
    for (const c of cobbles()) if (c.x1 > vb.x0 && c.x0 < vb.x1 && c.y1 > vb.y0 && c.y0 < vb.y1 && (!c.back || near(c.side))) ctx.fill(c.p);
  }
  // the centre line between the two lanes, faint and dashed
  ctx.strokeStyle = shade(H.line, 1, 0.5);
  ctx.lineWidth = 0.07;
  ctx.setLineDash(BOULEVARD.dash as number[]);
  ctx.beginPath();
  ringLine(ctx, (B.road[0] - 1 + B.road[1]) / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // the kerbs: a pale stone edge, its gutter on the road side (and on the street side of the back pavement)
  ctx.lineJoin = 'miter';
  for (const [off, side] of [[B.road[0] - 1, 1], [B.road[1], -1], [APRON, 1], [BACK_ROAD[1], -1]] as const) {
    ctx.strokeStyle = shade(H.gutter, 1, 0.45);
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ringLine(ctx, off + side * 0.075);
    ctx.stroke();
    ctx.strokeStyle = shade(H.kerb, 1.02);
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ringLine(ctx, off);
    ctx.stroke();
  }
  if (z >= 0.45) {
    // a square iron grate round each tree's earth (the grilles of the Paris boulevards)
    ctx.fillStyle = shade(H.iron, 1, 0.42);
    ctx.beginPath();
    for (const t of streetTrees()) ctx.rect(t.x - 0.38, t.y - 0.38, 0.76, 0.76);
    ctx.fill();
    ctx.fillStyle = shade(H.pit, 0.9);
    ctx.beginPath();
    for (const t of streetTrees()) {
      ctx.moveTo(t.x + 0.22, t.y);
      ctx.arc(t.x, t.y, 0.22, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

/* ---------- the street trees (apron drawables through the sprite cache) ---------- */
type TreeItem = Drawable & { t: StreetTree; seed: number; a: number; target: number };
const TREES: TreeItem[] = [];
const SP: XY = { x: 0, y: 0 }, SW: XY = { x: 0, y: 0 };
let fadeAng = NaN, fadeAt = -1e9;

function build(): void {
  for (const t of streetTrees()) {
    const seed = BOULEVARD.seeds[Math.floor(h01(t.x * 2, t.y * 2, 23) * BOULEVARD.seeds.length)] as number;
    TREES.push({ depth: 0, kind: 'tree', id: 51000 + t.id, x: t.x, y: t.y, z: 0, draw: drawStreetTree, t, seed, a: -1, target: 1 });
  }
}

/** Would the crown of a tree at (x, y) cover park tiles? Nine points of the crown (heights 1.4, 2.3 and 3.1 EH, the trunk's line and
 *  1 EH either side on screen) taken back to the ground they hide (screenToWorld); any inside the park says yes. Depends on the angle only. */
function coversPark(x: number, y: number): boolean {
  const ez = EH * cam.z;
  for (const e of [1.4, 2.3, 3.1]) {
    screenInto(x, y, e, SP);
    for (const l of [-1, 0, 1]) {
      screenToWorld(SP.x + l * ez, SP.y, SW);
      if (SW.x > -0.5 && SW.x < 47.5 && SW.y > -0.5 && SW.y < 47.5) return true;
    }
  }
  return false;
}

/** The crowns' alpha: the target set again when the angle moves, eased over BOULEVARD.fadeMs of frame time (a scripted draw snaps). */
function stepFade(): void {
  const t = now(), dt = t - fadeAt, B = BOULEVARD;
  fadeAt = t;
  if (cam.ang !== fadeAng) {
    fadeAng = cam.ang;
    for (const it of TREES) it.target = coversPark(it.x, it.y) ? B.nearCrown : 1;
  }
  const k = ((1 - B.nearCrown) * dt) / B.fadeMs;
  for (const it of TREES) {
    if (it.a < 0 || dt <= 0 || dt > 1000) it.a = it.target;
    else it.a = it.target > it.a ? Math.min(it.target, it.a + k) : Math.max(it.target, it.a - k);
  }
}

/** Phase 6's street trees (apron.ts adds them to its list): culled below 2.5 px tall and off screen, depth at the trunk. */
export function streetTreeDrawables(out: Drawable[]): void {
  if (!TREES.length) build();
  const z = cam.z;
  if ((SPECIES_HEIGHT[0] as number) * EH * z < 2.5) return;
  stepFade();
  const half = 1.9 * TW * z, up = 3.8 * EH * z + 4, dn = TH * z + 4;
  for (const it of TREES) {
    screenInto(it.x, it.y, 0, SP);
    if (SP.x + half < 0 || SP.x - half > view.cw || SP.y + dn < 0 || SP.y - up > view.chh) continue;
    it.depth = depthOf(it.x, it.y);
    out.push(it);
  }
}

function blit(ctx: CanvasRenderingContext2D, t: TreeSprite, s: XY): void {
  const k = cam.z / t.zb;
  ctx.drawImage(t.c, s.x - (t.w * k) / 2, s.y - t.base * k, t.w * k, t.h * k);
}
/** A street tree: the whole sprite, or over the park the solid trunk and the crown at its eased alpha. */
function drawStreetTree(d: Drawable, ctx: CanvasRenderingContext2D): void {
  const it = d as TreeItem, layer: SpriteLayer = it.a >= 0.995 ? 'street' : 'trunk';
  screenInto(it.x, it.y, 0, SP);
  blit(ctx, treeSpriteOf(0, it.seed, layer), SP);
  if (layer === 'street') return;
  ctx.globalAlpha = it.a;
  blit(ctx, treeSpriteOf(0, it.seed, 'crown'), SP);
  ctx.globalAlpha = 1;
}
