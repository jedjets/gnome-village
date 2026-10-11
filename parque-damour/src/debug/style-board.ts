// src/debug/style-board.ts
// The Style Gate board (04 section 4): the 13 tiles of 4.2 drawn by one renderTile(n, spec, canvas) with the real primitives
// of src/render/*, for A Storybook, B Pastel Postcard and C Line and Wash; the phone switch and 2-column grid, the desktop
// three 400 px columns with aligned rows (4.3); the Choose buttons writing profile.stylePick through save/store.ts (4.4).
// NEW. Nothing here is the game: a dev page built as its own single file (vite.config.ts BOARDS).
import { lightOf } from '../core/clock.ts';
import { Kind } from '../world/grid.ts';
import { EH, TH, TW } from '../render/camera.ts';
import {
  PALETTES, PRIMARY_KEYS, STYLES, STYLE_IDS, computeAmbientAt, isStyleId,
  type Pen, type Proj, type StyleId, type StyleSpec,
} from '../render/ambient.ts';
import { drawTilePatch, type Patch, type TileSample } from '../render/ground.ts';
import { drawTree, treeShape } from '../render/flora.ts';
import { drawBench, drawFacadeBay, drawFountain, drawLamp, drawLampPool } from '../render/props.ts';
import { FH, drawFigure, type Look } from '../render/figures.ts';
import { drawPigeon, drawPomeranian } from '../render/creatures.ts';
import { paintSkyBand } from '../render/backdrop.ts';
import { drawChatBubble, drawHeart, paperGrain } from '../render/effects.ts';
import { getProfile, setStylePick } from '../save/store.ts';
import { setLang, t, type Lang } from '../ui/i18n.ts';

type TileSpec = { n: number; w: number; h: number; zoom: number };
/** The 13 tiles of 04 4.2: canvas size in CSS px and zoom (0 for the DOM tiles 1 and 13 and the sky strip). Tiles 2, 4, 6, 9 and 10
 * are framed closer than 04 4.2 lists (1.6, 2.6, 2.0, 3.0, 3.0) and tile 7 is cropped to 120 px so the subject fills the tile; 7 keeps
 * the default zoom 1.3 because it exists to judge readability there (hand-back S1a, framing round). */
const TILES: readonly TileSpec[] = [
  { n: 1, w: 320, h: 72, zoom: 0 },
  { n: 2, w: 300, h: 180, zoom: 1.6 },
  { n: 3, w: 320, h: 160, zoom: 1.2 },
  { n: 4, w: 160, h: 160, zoom: 2.6 },
  { n: 5, w: 200, h: 160, zoom: 1.6 },
  { n: 6, w: 200, h: 160, zoom: 2.0 },
  { n: 7, w: 200, h: 120, zoom: 1.3 },
  { n: 8, w: 200, h: 160, zoom: 2.4 },
  { n: 9, w: 160, h: 120, zoom: 3.0 },
  { n: 10, w: 160, h: 120, zoom: 3.0 },
  { n: 11, w: 320, h: 200, zoom: 1.0 },
  { n: 12, w: 320, h: 60, zoom: 0 },
  { n: 13, w: 320, h: 200, zoom: 0 },
];

/* ---------- scene helpers ---------- */

/** A local iso projection: world (x, y, e) to canvas px with world (0, 0) at (ox, oy) (03 7.1 item 2 at angle 0). */
function isoProj(ox: number, oy: number, z: number): Proj {
  return (x, y, e = 0) => ({ x: ox + (x - y) * (TW / 2) * z, y: oy + (x + y) * (TH / 2) * z - e * EH * z });
}

/** A lawn patch large enough to cover the canvas, with world (cx, cy) at canvas (px, py); `at` overrides tiles. */
type Scene = { proj: Proj; projP: Proj; patch: Patch; sx: number; sy: number };
function scenePatch(pen: Pen, w: number, h: number, cx: number, cy: number, px: number, py: number, season: 0 | 1 | 2 | 3, at?: (x: number, y: number) => TileSample | null): Scene {
  const z = pen.z;
  const tw = Math.ceil(w / (TW * z)) + 3, th = Math.ceil(h / (TH * z)) + 3;
  // the patch spans world tiles (cx - tw, cy - th) to (cx + tw, cy + th); projP takes the patch's own coordinates from (0, 0)
  const sx = Math.floor(cx) - tw, sy = Math.floor(cy) - th;
  const proj = isoProj(px - (cx - cy) * (TW / 2) * z, py - (cx + cy) * (TH / 2) * z, z);
  const projP: Proj = (x, y, e = 0) => proj(x + sx, y + sy, e);
  const patch: Patch = {
    w: tw * 2 + 1,
    h: th * 2 + 1,
    season,
    at: (x, y) => (at && at(x + sx, y + sy)) || { kind: Kind.lawn },
  };
  return { proj, projP, patch, sx, sy };
}

const DAY = 0.5;
function ambient(f: number): void {
  computeAmbientAt(f, lightOf(f), f === DAY ? 0.1 : 0.2);
}

const SHE: Look = { seed: 11, sex: 'f', skin: 0, hair: 1, coat: 4, signature: 0, hat: 'beret', skirt: true };
const HE: Look = { seed: 23, sex: 'm', skin: 1, hair: 0, coat: 2, signature: 2, hat: 'cap' };

/** The pair at stage Chat, facing, two hearts rising, a chat bubble (04 4.2 tiles 7 and 8; 7.5). */
function lovers(pen: Pen, spec: StyleSpec, w: number, h: number): void {
  const z = pen.z;
  const gap = z >= 2 ? 0.9 : 1.1;
  // the pair's feet sit so the figures, the hearts and the bubble share the height evenly
  const groundY = h / 2 + FH * z * 0.62;
  const { proj, projP, patch } = scenePatch(pen, w, h, 0, 0, w / 2, groundY, 0, (_x, y) => (y === 1 ? { kind: Kind.gravel } : null));
  drawTilePatch(pen, projP, patch);
  const she = proj(-gap / 2, 0), he = proj(gap / 2, 0);
  const hair = spec.palette;
  drawFigure(pen, she, { ...SHE, hatColour: hair.ink }, { state: 'idle', face: 1, expr: 'chat', lookAt: 1 });
  drawFigure(pen, he, { ...HE, hatColour: hair.coat[7] as string }, { state: 'idle', face: -1, expr: 'chat', lookAt: -1 });
  const fh = FH * z;
  const mid = (she.x + he.x) / 2;
  drawHeart(pen, mid + 1 * z, she.y - fh * 1.0, 8 * z, 0.95, spec.palette.rose);
  drawHeart(pen, mid + 8 * z, she.y - fh * 1.32, 6.5 * z, 0.7, spec.palette.rose);
  drawChatBubble(pen, she.x - fh * 0.22, she.y - fh * 1.16, fh * 0.1, 1);
}

/** One function draws every tile of every direction (04 4.2 "Done when"). */
export function renderTile(n: number, spec: StyleSpec, canvas: HTMLCanvasElement): void {
  const tile = TILES[n - 1] as TileSpec;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(tile.w * dpr);
  canvas.height = Math.round(tile.h * dpr);
  canvas.style.width = tile.w + 'px';
  canvas.style.height = tile.h + 'px';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = tile.w, h = tile.h, z = tile.zoom;
  const pen: Pen = { ctx, spec, z };
  const P = spec.palette;
  ambient(DAY);
  switch (n) {
    case 2: {
      // the ground sampler: a 6 x 6 patch on a lawn: gravel 2 wide, a flagstone ring round a 2 x 2 rose bed, a desire path, a puddle
      const { projP, patch, sx, sy } = scenePatch(pen, w, h, 2.5, 2.5, w / 2, h / 2, 0, (x, y) => {
        if (x < 0 || y < 0 || x > 5 || y > 5) return null;
        if (x <= 1) return { kind: Kind.gravel };
        if (x >= 3 && x <= 4 && y >= 2 && y <= 3) return { kind: Kind.bed, bedc: 0 };
        if (x >= 2 && y >= 1 && y <= 4) return { kind: Kind.flagstone };
        if (x === 4 && y === 0) return { kind: Kind.lawn, wet: 0.9 };
        return { kind: Kind.lawn };
      });
      // the worn path is given in the content's tiles; the patch's own origin shifts it
      const worn = { pts: [{ x: 1.6, y: 5.1 }, { x: 3.2, y: 5.0 }, { x: 4.4, y: 5.1 }, { x: 5.8, y: 5.0 }], wear: [1.6, 1.6, 2.6, 2.6] };
      patch.worn = [{ wear: worn.wear, pts: worn.pts.map((p) => ({ x: p.x - sx, y: p.y - sy })) }];
      drawTilePatch(pen, projP, patch);
      break;
    }
    case 3: {
      // one plane tree at spring blossom, summer, autumn; a small winter one at half size
      const { projP, patch } = scenePatch(pen, w, h, 0, 0, w / 2, h * 0.86, 1);
      drawTilePatch(pen, projP, patch);
      const shape = treeShape(0, 7);
      const groundY = h * 0.86;
      const xs = [w * 0.17, w * 0.42, w * 0.67, w * 0.88];
      const seasons: Array<[number, number, number]> = [[0, 1.5, 1], [1, 1, 1], [2, 1.5, 1], [3, 1, 0.5]];
      for (let i = 0; i < 4; i++) {
        const [season, day, scale] = seasons[i] as [number, number, number];
        drawTree(pen, { x: xs[i] as number, y: groundY }, shape, season, day, { scale });
      }
      break;
    }
    case 4: {
      // a bench facing the camera with a sitter
      const { proj, projP, patch } = scenePatch(pen, w, h, 0, 0, w / 2, h * 0.7, 0, (_x, y) => (y === 1 ? { kind: Kind.gravel } : null));
      drawTilePatch(pen, projP, patch);
      drawBench(pen, proj, 0, 0, 0);
      const seat = proj(0.02, 0.02, 0.2);
      const hh = FH * z;
      drawFigure(pen, { x: seat.x, y: seat.y + 0.14 * hh }, { ...HE, seed: 31, coat: 1, signature: 3, hat: 'none' }, { state: 'sit', face: 1, expr: 'bench' });
      break;
    }
    case 5: {
      // one lamp unlit at f 0.50, one lit at f 0.85 with its ground glow
      for (const [k, f] of [[0, 0.5], [1, 0.85]] as const) {
        ambient(f);
        ctx.save();
        ctx.beginPath();
        ctx.rect(k * (w / 2), 0, w / 2, h);
        ctx.clip();
        const { proj, projP, patch } = scenePatch(pen, w, h, 0, 0, w * (0.25 + 0.5 * k), h * 0.86, 0, (x, y) => (x === 0 && y === 0 ? { kind: Kind.gravel } : null));
        drawTilePatch(pen, projP, patch);
        const p = proj(0, 0);
        drawLampPool(pen, p, { lit: k === 1 });
        drawLamp(pen, p, { lit: k === 1 });
        ctx.restore();
      }
      break;
    }
    case 6: {
      // the 2 x 2 fountain with spray and ripples on a flagstone ring
      const { proj, projP, patch } = scenePatch(pen, w, h, 0.5, 0.5, w / 2, h * 0.7, 1, (x, y) => (x >= -1 && x <= 2 && y >= -1 && y <= 2 ? { kind: Kind.flagstone } : null));
      drawTilePatch(pen, projP, patch);
      drawFountain(pen, proj, 0, 0, { phase: 0.3 });
      break;
    }
    case 7:
    case 8:
      lovers(pen, spec, w, h);
      break;
    case 9: {
      // a pigeon walking and one flying
      const { proj, projP, patch } = scenePatch(pen, w, h, 0, 0, w * 0.4, h * 0.72, 0, (_x, y) => (y === 0 ? { kind: Kind.gravel } : null));
      drawTilePatch(pen, projP, patch);
      drawPigeon(pen, proj(0, 0.05), { face: 1, mode: 'walk', phase: 0.15 });
      const fly = proj(0.55, -0.35, 0.55);
      drawPigeon(pen, fly, { face: -1, mode: 'fly', phase: 0.2 });
      break;
    }
    case 10: {
      // the pomeranian running with a snatched hat
      const { proj, projP, patch } = scenePatch(pen, w, h, 0, 0, w / 2, h * 0.68, 0, (_x, y) => (y === 0 ? { kind: Kind.gravel } : null));
      drawTilePatch(pen, projP, patch);
      drawPomeranian(pen, proj(-0.1, 0.1), { face: 1, running: true, phase: 0.3, hatHex: P.coat[1] });
      break;
    }
    case 11: {
      // one Haussmann bay with the cafe at f 0.50 and f 0.90, plus the near-side cutaway
      const thirds: Array<[number, boolean]> = [[0.5, false], [0.9, false], [0.5, true]];
      for (let k = 0; k < 3; k++) {
        const [f, cutaway] = thirds[k] as [number, boolean];
        ambient(f);
        ctx.save();
        ctx.beginPath();
        ctx.rect(k * (w / 3), 0, w / 3, h);
        ctx.clip();
        const { proj, projP, patch } = scenePatch(pen, w, h, 1, 1.9, w * (1 / 6 + k / 3) - 4, h * 0.93, 0, (_x, y) => (y >= 1.9 - 0.5 && y <= 4 ? { kind: Kind.flagstone } : null));
        drawTilePatch(pen, projP, patch);
        drawFacadeBay(pen, proj, 0, 0, { f, cutaway, cafe: true, seed: 5, tables: true });
        ctx.restore();
      }
      break;
    }
    case 12: {
      // the sky at f 0.30, 0.76 and 0.90 as three bands
      const fs = [0.3, 0.76, 0.9];
      for (let k = 0; k < 3; k++) {
        const f = fs[k] as number;
        ambient(f);
        paintSkyBand(pen, f, lightOf(f), k * (w / 3), 0, w / 3, h, 0.25);
      }
      break;
    }
    default:
      break;
  }
  if (n >= 2 && n <= 12) paperGrain(ctx, spec, w, h);
}

/* ---------- the DOM tiles: the palette strip (1) and the HUD sample (13) ---------- */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function paletteStrip(spec: StyleSpec): HTMLElement {
  const wrap = el('div', 'swatches');
  const grid = el('div', 'swgrid');
  const legend = el('div', 'swlegend');
  for (const key of PRIMARY_KEYS) {
    const hex = spec.palette[key];
    const s = el('div', 'sw');
    s.style.background = hex;
    s.title = key + ' ' + hex;
    grid.appendChild(s);
    const row = el('div', 'swrow');
    const dot = el('i');
    dot.style.background = hex;
    row.appendChild(dot);
    row.appendChild(el('b', undefined, key));
    row.appendChild(el('span', undefined, hex));
    legend.appendChild(row);
  }
  wrap.appendChild(grid);
  wrap.appendChild(legend);
  return wrap;
}

function hudSample(spec: StyleSpec): HTMLElement {
  const wrap = el('div', 'hudwrap');
  wrap.style.background = spec.themeColor;
  const clock = el('button', 'chip');
  clock.type = 'button';
  clock.appendChild(el('span', 'dotm'));
  clock.appendChild(el('span', undefined, t('hud.phase.morning')));
  clock.appendChild(el('span', 'sep'));
  clock.appendChild(el('span', undefined, t('hud.day', { n: 1, season: '@hud.season.spring' })));
  const visitors = el('div', 'chip');
  visitors.appendChild(el('b', undefined, t('hud.visitors', { n: 12 })));
  const plus = el('button', 'plus', '+');
  plus.type = 'button';
  visitors.appendChild(plus);
  const row1 = el('div', 'hudrow');
  row1.appendChild(clock);
  row1.appendChild(visitors);
  const tool = el('button', 'tool');
  tool.type = 'button';
  tool.setAttribute('aria-pressed', 'true');
  const sw = el('span', 'sw');
  sw.style.background = spec.palette.bedEarth;
  tool.appendChild(sw);
  tool.appendChild(el('span', undefined, t('gate.sample.tool')));
  const cd = el('span', 'chip cd', t('gate.sample.cooldown'));
  const row2 = el('div', 'hudrow r2');
  row2.appendChild(tool);
  row2.appendChild(cd);
  const card = el('div', 'card');
  card.appendChild(el('h3', undefined, t('gate.sample.name')));
  card.appendChild(el('div', 'sub', t('gate.sample.sub')));
  for (const [key, pct, heart] of [['card.bar.mood', 72, false], ['card.bar.rested', 48, false], ['card.bar.heart', 35, true]] as const) {
    const bar = el('div', 'bar' + (heart ? ' heart' : ''));
    bar.appendChild(el('span', undefined, t(key)));
    const i = el('i');
    const u = el('u');
    u.style.width = pct + '%';
    i.appendChild(u);
    bar.appendChild(i);
    card.appendChild(bar);
  }
  card.appendChild(el('div', 'doing', t('gate.sample.doing')));
  wrap.appendChild(row1);
  wrap.appendChild(row2);
  wrap.appendChild(card);
  return wrap;
}

/* ---------- the page ---------- */
function makeTile(spec: StyleSpec, tile: TileSpec): HTMLElement {
  const fig = el('figure', 'tile' + (tile.w > 200 ? ' wide' : ''));
  fig.dataset.dir = spec.id;
  fig.dataset.n = String(tile.n);
  fig.style.setProperty('--row', String(tile.n + 1));
  const body = el('div', 'tilebody');
  body.style.width = tile.w + 'px';
  if (tile.n === 1) body.appendChild(paletteStrip(spec));
  else if (tile.n === 13) body.appendChild(hudSample(spec));
  else {
    const canvas = el('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    body.appendChild(canvas);
    renderTile(tile.n, spec, canvas);
  }
  fig.appendChild(body);
  fig.appendChild(el('figcaption', undefined, tile.n + ' · ' + t('gate.tile.' + tile.n)));
  return fig;
}

function detectLang(): Lang {
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

let toastTimer = 0;
function toast(text: string): void {
  const hint = document.getElementById('hint');
  if (!hint) return;
  hint.textContent = text;
  hint.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => hint.classList.remove('on'), 3400);
}

function markPick(pick: string | null): void {
  document.querySelectorAll<HTMLButtonElement>('button.choose').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.dir === pick));
  });
}

function choose(id: StyleId): void {
  setStylePick(id);
  markPick(id);
  toast(t('gate.picked.style', { name: '@gate.style.name.' + id }));
}

function chooseButton(id: StyleId): HTMLButtonElement {
  const b = el('button', 'choose', t('gate.choose', { letter: id }));
  b.type = 'button';
  b.dataset.dir = id;
  b.addEventListener('click', () => choose(id));
  return b;
}

function showDir(id: StyleId): void {
  document.body.dataset.dir = id;
  document.querySelectorAll<HTMLButtonElement>('#switch .gb').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dir === id)));
  const phoneChoose = document.getElementById('choosePhone');
  if (phoneChoose) {
    phoneChoose.replaceChildren(chooseButton(id));
    markPick(getProfile().stylePick);
  }
}

function boot(): void {
  setLang(detectLang());
  document.title = t('gate.style.title');
  const h1 = document.getElementById('title');
  if (h1) h1.textContent = t('gate.style.title');
  const board = document.getElementById('board');
  const sw = document.getElementById('switch');
  if (!board || !sw) return;
  for (const id of STYLE_IDS) {
    const spec = STYLES[id];
    const head = el('header', 'colhead');
    head.dataset.dir = id;
    head.appendChild(el('h2', undefined, t('gate.style.col', { letter: id, name: '@gate.style.name.' + id })));
    head.appendChild(chooseButton(id));
    board.appendChild(head);
    for (const tile of TILES) board.appendChild(makeTile(spec, tile));
    const b = el('button', 'gb', id);
    b.type = 'button';
    b.dataset.dir = id;
    b.setAttribute('aria-label', t('gate.aria.switch', { letter: id }));
    b.addEventListener('click', () => showDir(id));
    sw.appendChild(b);
  }
  const pick = getProfile().stylePick;
  showDir(isStyleId(pick) ? pick : 'A');
  markPick(pick);
  // the palette count the owner can read off the page (04 4.5 item 1)
  document.body.dataset.palettes = String(Object.keys(PALETTES).length);
}

boot();
