// src/render/ambient.ts
// The scene palettes (the only file in src/ with a scene colour literal, 04 4.5), the three StyleSpecs of the Style Gate,
// the per-frame ambient light (AM, AT, AA, FOGA, lit, GC, shade, mix, faceLight, lampGlow), the season-tint hook, the sky keyframes and the
// per-direction brush: how a shape is filled and lined in A Storybook (soft contour, faceLight), B Pastel Postcard (flat two-tone, no
// line) and C Line and Wash (jittered ink from nzAt, a misregistered wash, hatching) (04 3.2, 3.3).
// Ported from GV 6445-6478 (C, computeAmbient, lit, GC), 6450 (SUNL), 6494 (nightW), 6539 (the grey of a clouded sky), 6630-6638
// (NZ, nzAt, grain), 6959-6965 (faceLight, shade, h01), 6480-6488 (SKYR), 10774 (WCOLD).
// Verdict: PORT. Changes: the golden-hour windows follow the register (peaks 0.24 and 0.76, half-widths 0.08 and 0.10, 03 7.3 item 2;
// GV 0.26 and 0.74 +- 0.11); the storm cover of GV 6458 is dropped (no storm front); the GC key carries a separator and the warm tint
// (GV 6472 could collide and reused a dawn colour at dusk); nightW mixes toward the palette's `night` (GV recomputed NIGHTC from the
// ramp each epoch: the same colour at night); nzAt lives here instead of ground.ts (03 2.7) because the brush needs it.
// The Style Gate passed with A Storybook (register section 4, 2026-10-12): style() returns STYLES.A whatever profile.stylePick holds
// (04 3.4 item 4, 4.5 item 1); the style board passes each column's own StyleSpec, and the B and C branches below are frozen for it.
// Dropped from the range: the storm cover (6458), seaPlaneCol and wRGBA (6495-6523: no sea).
// TODO(S9): lamp warmth on figures (03 7.3 item 5); snow cover on the season tint (04 10.3 winter).
import { clamp01, css, hx, mixc, type RGB } from '../core/math.ts';
import { SEASON_DAYS, T, type Season } from '../core/clock.ts';
import { W } from '../core/weather.ts';
import { rotVec } from './camera.ts';

export type StyleId = 'A' | 'B' | 'C';
export const STYLE_IDS: readonly StyleId[] = ['A', 'B', 'C'];

export interface Palette {
  // primary (04 3.1, first table): the board's palette strip
  lawn: string; gravel: string; flagstone: string; bedEarth: string; water: string;
  foliageSpring: string; foliageSummer: string; foliageAutumn: string;
  stone: string; zinc: string; awningRed: string; ink: string; paper: string;
  rose: string; sky: string; lamp: string;
  // secondary (04 3.1, second table): vary by direction
  fog: string; night: string; ice: string; iceHi: string; snow: string;
  winterLawn: string; lawnAutumn: string; bedLavender: string; bedMarigold: string;
  trunk: [string, string, string]; trunkPatch: string;
  limeSpring: string; chestnutAutumn: string; limeAutumn: string;
  halo: string; rain: string; snowflake: string;
  // secondary (04 3.1, third table): the same in every direction
  teal: string; crumbs: string; skin: string[]; hair: string[]; elderHair: string; eye: string;
  coat: string[]; signature: string[];
  dust: string; splash: string; waspStripe: string;
  pigeon: string; beak: string; pomeranian: [string, string, string];
  matchmakerBlue: string; baguette: string; straw: string; wicker: string;
}
export interface StyleSpec {
  id: StyleId;
  palette: Palette;
  line: 'soft' | 'none' | 'ink'; // 04 3.2 row Line
  shading: 'gradient' | 'flat' | 'wash'; // 04 3.2 row Shading
  grain: 'gv' | 'none' | 'paper'; // 04 3.2 row Texture
  themeColor: string; // 04 3.2 last row
}

/** The 16 primary token names in the order of 04 3.1 (the palette strip, tile 1). */
export const PRIMARY_KEYS = [
  'lawn', 'gravel', 'flagstone', 'bedEarth', 'water', 'foliageSpring', 'foliageSummer', 'foliageAutumn',
  'stone', 'zinc', 'awningRed', 'ink', 'paper', 'rose', 'sky', 'lamp',
] as const;

/** The tokens that are the same in every direction (04 3.1, third table). */
const SHARED = {
  teal: '#86BBB3',
  crumbs: '#E7D7B0',
  skin: ['#F0DCCB', '#E8C9A8', '#C9A07C', '#8E6B4E'],
  hair: ['#3A3440', '#5C4634', '#8B6748', '#C2703E', '#E0BE7C', '#B7AFA3'],
  elderHair: '#E4E1EA',
  eye: '#5A5468',
  coat: ['#B9B7C6', '#C7B8A6', '#A6B4C2', '#B5C2A8', '#C9B2B8', '#9E9AAE', '#D1C3A2', '#8F9AA8'],
  signature: ['#E25B5F', '#F2C14E', '#5FA8D3', '#7DBF7A', '#EDA9C4', '#B9A6E0', '#F08A4B', '#4A4458'],
  dust: '#CFC6C0',
  splash: '#A9D3E6',
  waspStripe: '#E8C64A',
  pigeon: '#8E8AA0',
  beak: '#E7B97A',
  pomeranian: ['#F2C98A', '#F7DFB0', '#E8B06C'] as [string, string, string],
  matchmakerBlue: '#3F7FC4',
  baguette: '#E0A85C',
  straw: '#E9D7AE',
  wicker: '#C98F4C',
};

export const PALETTES: Record<StyleId, Palette> = {
  A: {
    lawn: '#9CCB92', gravel: '#D9CBAE', flagstone: '#CBC4B6', bedEarth: '#BE9C7C', water: '#6FB8DC',
    foliageSpring: '#B9DEAE', foliageSummer: '#A5CF97', foliageAutumn: '#D9A441',
    stone: '#EADFCB', zinc: '#9FA6B4', awningRed: '#D9636A', ink: '#736C82', paper: '#F1EDF5',
    rose: '#EDA9C4', sky: '#A9CEE7', lamp: '#F0BE6A',
    fog: '#E2E8EE', night: '#2C3252', ice: '#DCE9F1', iceHi: '#EEF5F9', snow: '#EEF2F6',
    winterLawn: '#C6CCC4', lawnAutumn: '#C9CB8E', bedLavender: '#B9A6E0', bedMarigold: '#F2C14E',
    trunk: ['#C9B9A3', '#9A8470', '#A99683'], trunkPatch: '#E2D8C8',
    limeSpring: '#DAE8AE', chestnutAutumn: '#C8763F', limeAutumn: '#E3B94A',
    halo: '#FFD696', rain: '#CEE0F0', snowflake: '#F8FAFF',
    ...SHARED,
  },
  B: {
    lawn: '#A8D8A2', gravel: '#EFDFBF', flagstone: '#DDD6C8', bedEarth: '#CFA883', water: '#9DD4E9',
    foliageSpring: '#C2E5AC', foliageSummer: '#7DBD79', foliageAutumn: '#E9A43F',
    stone: '#F5EBD8', zinc: '#A9B5C3', awningRed: '#E6555F', ink: '#5A5468', paper: '#FBF7F0',
    rose: '#F2A7BD', sky: '#C2E2F3', lamp: '#F6C96A',
    fog: '#EAF1F6', night: '#34405E', ice: '#E4F0F7', iceHi: '#F3F9FC', snow: '#F4F7FA',
    winterLawn: '#CFD6CD', lawnAutumn: '#D4D18F', bedLavender: '#C3B0E8', bedMarigold: '#F6C85A',
    trunk: ['#D2C3AE', '#A58F7A', '#B3A08D'], trunkPatch: '#EAE2D4',
    limeSpring: '#DFEDB2', chestnutAutumn: '#D97E42', limeAutumn: '#EDC24F',
    halo: '#FFDCA0', rain: '#D6E6F4', snowflake: '#FAFCFF',
    ...SHARED,
  },
  C: {
    lawn: '#D3E3BC', gravel: '#F0E6CF', flagstone: '#E6E0D3', bedEarth: '#DAB890', water: '#BFDDE7',
    foliageSpring: '#DAE8AE', foliageSummer: '#A3CB92', foliageAutumn: '#EAA74C',
    stone: '#F2DFBB', zinc: '#B7C0C9', awningRed: '#DA535B', ink: '#2B2832', paper: '#F7F3EA',
    rose: '#EFA9BD', sky: '#D2E5EF', lamp: '#F2C66E',
    fog: '#F1EEE6', night: '#3A3A4C', ice: '#E9EEF0', iceHi: '#F5F6F4', snow: '#F7F6F2',
    winterLawn: '#DCDFD3', lawnAutumn: '#DCD9A6', bedLavender: '#C6B6E0', bedMarigold: '#EFBE57',
    trunk: ['#D8CCB8', '#A89584', '#B8A894'], trunkPatch: '#EFE8DB',
    limeSpring: '#E4EEC0', chestnutAutumn: '#CF7A45', limeAutumn: '#E6BC55',
    halo: '#FBD79A', rain: '#D5DEE6', snowflake: '#FAF9F6',
    ...SHARED,
  },
};

export const STYLES: Record<StyleId, StyleSpec> = {
  A: { id: 'A', palette: PALETTES.A, line: 'soft', shading: 'gradient', grain: 'gv', themeColor: '#DCE6EC' },
  B: { id: 'B', palette: PALETTES.B, line: 'none', shading: 'flat', grain: 'none', themeColor: '#C2E2F3' },
  C: { id: 'C', palette: PALETTES.C, line: 'ink', shading: 'wash', grain: 'paper', themeColor: '#F7F3EA' },
};

/** The direction picked at the Style Gate: A Storybook (register section 4, 2026-10-12; 04 4.4 item 4). */
export const DEFAULT_STYLE: StyleId = 'A';

export function isStyleId(v: unknown): v is StyleId {
  return v === 'A' || v === 'B' || v === 'C';
}

/** The game's direction: always A, whatever profile.stylePick holds (04 3.4 item 4, 4.5 item 1); the board passes its own specs. */
export function style(): StyleSpec {
  return STYLES[DEFAULT_STYLE];
}

/* ---------- the season-tint hook (03 7.3 item 6; 04 10.3) ---------- */
/** Days over which a season change blends, centred on the change (03 7.3 item 6: half a day). */
export const SEASON_BLEND = 0.5;
export type SeasonMix = { from: Season; to: Season; k: number };
const SMIX: SeasonMix = { from: 0, to: 0, k: 0 };
/**
 * The season a tint is drawn in at day count `abs` (T.abs): `from`, blended toward `to` by k over the half day centred on a season
 * change. A park's first season has no change before it, so a new park (abs 0.30) draws pure spring. Reused object: copy it to keep it.
 */
export function seasonMix(abs: number = T.abs): SeasonMix {
  const s = (Math.floor(Math.floor(abs) / SEASON_DAYS) % 4) as Season;
  const edge = Math.round(abs / SEASON_DAYS) * SEASON_DAYS; // the nearest season change, in days
  const d = abs - edge;
  SMIX.from = s;
  SMIX.to = s;
  SMIX.k = 0;
  if (edge > 0 && Math.abs(d) < SEASON_BLEND / 2) {
    const before = (((edge / SEASON_DAYS - 1) % 4) + 4) % 4, after = (edge / SEASON_DAYS) % 4;
    SMIX.from = before as Season;
    SMIX.to = after as Season;
    SMIX.k = (d + SEASON_BLEND / 2) / SEASON_BLEND;
  }
  return SMIX;
}
/** A hex tinted by season through the hook: `bySeason` gives the hex of one season, blended across a change. */
export function seasonHex(bySeason: (s: Season) => string, abs: number = T.abs): string {
  const m = seasonMix(abs);
  return m.k <= 0 ? bySeason(m.from) : mix(bySeason(m.from), bySeason(m.to), m.k);
}

/* ---------- sky keyframes (04 10.1 item 2, direction A values; GV SKYR 6480-6488 re-keyed to the bands) ---------- */
export type SkyKey = { f: number; t: string; b: string };
export const SKYR: readonly SkyKey[] = [
  { f: 0.0, t: '#2C3252', b: '#4A5170' },
  { f: 0.2, t: '#4A5075', b: '#8C87A8' },
  { f: 0.25, t: '#7C8CBA', b: '#F2C8B0' },
  { f: 0.32, t: '#A5C4DE', b: '#F7DFCB' },
  { f: 0.5, t: '#A9CEE7', b: '#E7F0F3' }, // the top is `sky` and, in B and C, the bottom is `paper` (04 10.1 item 2)
  { f: 0.7, t: '#9BB9DC', b: '#F2D6C0' },
  { f: 0.76, t: '#7A85B4', b: '#F0BFAC' },
  { f: 0.84, t: '#3D4467', b: '#5C6389' },
  { f: 1.0, t: '#2C3252', b: '#4A5170' },
];
/** Sun and moon bodies and the sun's halo (GV paintSky 6555-6557). */
export const SUN = '#FFEBC6';
export const MOON = '#EDF0FA';
/** Weather dots of the clock chip (04 10.5; GV WCOLD 10774 plus `shower`). */
export const WCOLD = {
  clear: '#F3D9A8', fair: '#DCE9F2', cloudy: '#C8CCDA', breeze: '#CDE3D8',
  rain: '#9FBCD4', shower: '#B7CCDE', mist: '#DDE2E8', snow: '#EFF4FA',
} as const;
/** The warm tint targets before and after noon (GV 6462). */
const AT_AM: RGB = [255, 204, 162];
const AT_PM: RGB = [255, 186, 158];
export const WHITE: RGB = [255, 255, 255];
/** The grey a clouded sky turns toward, top and bottom (GV paintSky 6539). */
export const SKY_GREY: readonly [string, string] = ['#848CA0', '#B2B8C6'];

/* ---------- ambient light (GV 6450-6478) ---------- */
export let AM: RGB = [1, 1, 1];
export let AT: RGB = AT_AM;
export let AA = 0;
export let FOGA = 0;
let gkey = '|100,100,100,0a'; // the GC memo's ambient key
/** The sun direction, normalised (GV 6450). */
export const SUNL: RGB = (() => {
  const v: RGB = [-0.5, -0.3, 0.82];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/** The ambient state for a day fraction and light, with the weather fractions (03 7.3 items 1-3; 04 10.1 item 1). */
export function computeAmbientAt(f: number, light: number, cloud = 0, mist = 0, rain = 0, snow = 0): void {
  AM = mixc([0.46, 0.5, 0.72], [1, 1, 1], Math.pow(clamp01(light), 0.7));
  const dim = cloud * 0.12;
  AM = [AM[0] * (1 - dim), AM[1] * (1 - dim), AM[2] * (1 - dim * 0.92)];
  const warm = clamp01(1 - Math.abs(f - 0.76) / 0.1) + clamp01(1 - Math.abs(f - 0.24) / 0.08);
  AA = clamp01(warm) * 0.22 * Math.max(0.25, light);
  AT = f < 0.5 ? AT_AM : AT_PM;
  FOGA = clamp01(mist * 0.3 + rain * 0.03 + snow * 0.14);
  // the memo key holds all of AM, AA and the warm tint (09 2.6 row ambient.ts; notes 13 12.5: GV keyed AM[0] and AA only)
  gkey = '|' + ((AM[0] * 100) | 0) + ',' + ((AM[1] * 100) | 0) + ',' + ((AM[2] * 100) | 0) + ',' + ((AA * 100) | 0) + (f < 0.5 ? 'a' : 'p');
}

/** Once per frame: the ambient state from the clock and the weather (03 7.3). */
export function computeAmbient(): void {
  computeAmbientAt(T.f, T.light, W.cloud, W.mist, W.rain, W.snow);
}

/**
 * How lit the lamps and night windows look, 0 to 1 (04 10.1 item 4): lamps burn from f 0.80 to 0.28 (02 3.2) and fade in over the first
 * 0.02 of a day and out over the last, so a glow never pops.
 */
export function lampGlow(f: number = T.f): number {
  if (f >= 0.8) return clamp01((f - 0.8) / 0.02);
  return f < 0.28 ? clamp01((0.28 - f) / 0.02) : 0;
}

/** Apply the time of day to an rgb triple (GV 6465-6469). */
export function lit(c: RGB): RGB {
  let r = c[0] * AM[0], g = c[1] * AM[1], b = c[2] * AM[2];
  if (AA > 0) {
    r += (AT[0] - r) * AA;
    g += (AT[1] - g) * AA;
    b += (AT[2] - b) * AA;
  }
  return [r, g, b];
}

const gcache = new Map<string, string>();
/** A lit CSS colour for a hex, memoised on the ambient state; flushed at 900 keys (GV 6470-6478). */
export function GC(h: string, a?: number): string {
  const k = h + '|' + (a === undefined ? '' : a) + gkey;
  const v = gcache.get(k);
  if (v) return v;
  const s = css(lit(hx(h)), a);
  if (gcache.size > 900) gcache.clear();
  gcache.set(k, s);
  return s;
}

/** A lit CSS colour for a hex darkened (or lightened) by L (GV `shade` 6960). */
export function shade(h: string, L: number, a?: number): string {
  const c = hx(h);
  return css(lit([c[0] * L, c[1] * L, c[2] * L]), a);
}

function hex2(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  return (n < 16 ? '0' : '') + n.toString(16).toUpperCase();
}
/** An rgb triple back to '#RRGGBB'. */
export function toHex(c: RGB): string {
  return '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
}
/** Water and sky give the night back: a lit colour mixed toward the palette's `night` as the light goes (GV nightW 6494). */
export function nightW(c: RGB, spec: StyleSpec = style()): RGB {
  const k = (1 - T.light) * 0.52;
  return k < 0.012 ? c : mixc(c, hx(spec.palette.night), k);
}

/** Two hexes mixed by t, as a hex (so the result can go through GC). */
export function mix(a: string, b: string, t: number): string {
  return toHex(mixc(hx(a), hx(b), t));
}
/** A hex scaled per channel, as a hex (season tints such as lawn x [0.94, 1.0, 0.90]). */
export function scaleHex(h: string, k: RGB): string {
  const c = hx(h);
  return toHex([c[0] * k[0], c[1] * k[1], c[2] * k[2]]);
}

/** Face brightness 0.74 to 1.04 for a face whose outward normal is (nx, ny) in tiles (GV 6959). */
export function faceLight(nx: number, ny: number): number {
  const r = rotVec(nx, ny);
  const l = Math.hypot(r.x, r.y) || 1;
  return 0.74 + 0.3 * clamp01(0.55 + 0.6 * ((r.x / l) * SUNL[0] + (r.y / l) * SUNL[1]));
}

/** The sky ramp colours (top, bottom) for a day fraction (GV rampSky 6501-6507 over the re-keyed table). */
export function skyRamp(spec: StyleSpec, f: number): [RGB, RGB] {
  let a = SKYR[0] as SkyKey, b = SKYR[SKYR.length - 1] as SkyKey;
  for (let i = 0; i < SKYR.length - 1; i++) {
    const p = SKYR[i] as SkyKey, q = SKYR[i + 1] as SkyKey;
    if (f >= p.f && f <= q.f) {
      a = p;
      b = q;
      break;
    }
  }
  const k = (f - a.f) / Math.max(1e-6, b.f - a.f);
  const keyTop = (s: SkyKey): RGB => hx(s.f === 0.5 ? spec.palette.sky : s.t);
  const keyBot = (s: SkyKey): RGB => hx(s.f === 0.5 && spec.id !== 'A' ? spec.palette.paper : s.b);
  return [mixc(keyTop(a), keyTop(b), k), mixc(keyBot(a), keyBot(b), k)];
}

/** The flat sky colour for the current light (draw.ts fills the canvas with it before S2's sky pass). */
export function skyColour(): string {
  const [t, b] = skyRamp(style(), T.f);
  return css(mixc(t, b, 0.4));
}

/* ---------- grain, hashes (GV 6630-6638, 6965) ---------- */
const NZN = 32;
const NZ = new Float32Array(NZN * NZN);
{
  let s = 1337;
  const r = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let k = 0; k < NZ.length; k++) NZ[k] = r();
}
/** Tiling value noise over the 32 x 32 lattice seeded with the fixed LCG 1337 (GV nzAt 6631). */
export function nzAt(u: number, v: number): number {
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (p: number, q: number): number => NZ[(((q % NZN) + NZN) % NZN) * NZN + (((p % NZN) + NZN) % NZN)] as number;
  const t = w(x0, y0) + (w(x0 + 1, y0) - w(x0, y0)) * sx, u2 = w(x0, y0 + 1) + (w(x0 + 1, y0 + 1) - w(x0, y0 + 1)) * sx;
  return t + (u2 - t) * sy;
}
/** The slow unevenness of paint over the ground, two octaves (GV grain 6638). */
export function grain(x: number, y: number): number {
  return (nzAt(x * 0.16, y * 0.16) - 0.5) * 0.72 + (nzAt(x * 0.46 + 11.3, y * 0.46 + 7.7) - 0.5) * 0.28;
}
/** A hash to [0, 1) for the little irregularities that make a thing look hand-made (GV h01 6965). */
export function h01(a: number, b: number, c = 0): number {
  let n = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  n = (n ^ (n >>> 13)) * 1274126177;
  n = (n ^ (n >>> 16)) >>> 0;
  return (n % 10000) / 10000;
}

/* ---------- the brush: one shape, three treatments (04 3.2) ---------- */
export type Pt = { x: number; y: number };
/** What every primitive draws with: the context, the direction and the zoom. */
export type Pen = { ctx: CanvasRenderingContext2D; spec: StyleSpec; z: number };
/** World (x, y, e) to screen; `screenOf` in the game, a local iso projection on the board. */
export type Proj = (x: number, y: number, e?: number) => Pt;

export type ShapeOpts = {
  alpha?: number; // fill alpha (1)
  light?: number; // a faceLight multiplier on the colour (1)
  seed?: number; // the ink jitter's seed (0)
  open?: boolean; // an open polyline: no closing edge
  contour?: boolean; // A: draw the soft ink contour (figures only, 04 3.2); B: the 1 px rim when `rim` is on
  rim?: boolean; // B: the 1 px rim shade(base, 0.82) (figures at zoom >= 1.3)
  lineW?: number; // the contour width in px (the ink width by default)
  away?: boolean; // an away face: B shade 0.82, C hatching at zoom >= 1.0
  noInk?: boolean; // C: wash only (ground washes, water, sky clouds)
  inkAlpha?: number; // C: the ink alpha (1)
  grad?: { from: Pt; to: Pt; k0: number; k1: number }; // A: a pan-invariant gradient between two brightness factors
  gapless?: boolean; // C: no gaps in the ink (small shapes such as eyes and globes)
  jitterK?: number; // C: scales the ink jitter and overshoot (1); small shapes take 0.3 to 0.5
};

function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[], close: boolean, dx = 0, dy = 0): void {
  ctx.beginPath();
  const p0 = pts[0];
  if (!p0) return;
  ctx.moveTo(p0.x + dx, p0.y + dy);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as Pt;
    ctx.lineTo(p.x + dx, p.y + dy);
  }
  if (close) ctx.closePath();
}

/** n points round an ellipse (rotation `rot`), for the brush. */
export function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 20, rot = 0): Pt[] {
  const out: Pt[] = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push({ x: cx + x * cr - y * sr, y: cy + x * sr + y * cr });
  }
  return out;
}

/** The ink width of a direction at this zoom (04 3.2 row Line). */
export function inkWidth(pen: Pen): number {
  return Math.max(0.8, 0.9 * pen.z);
}

/**
 * The loose ink line of direction C (04 3.2): width max(0.8, 0.9 z), jittered +-0.6 z px by nzAt along its length,
 * 8 % of the segments left as gaps, corners overshooting 1.5 z px. Direction A draws its soft contour here too
 * (one steady stroke); direction B draws nothing unless `rim`.
 */
export function inkLine(pen: Pen, pts: Pt[], o: ShapeOpts = {}): void {
  const { ctx, spec, z } = pen;
  const close = !o.open;
  const n = pts.length;
  if (n < 2) return;
  if (spec.line === 'none') return;
  const w = o.lineW ?? inkWidth(pen);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (spec.line === 'soft') {
    ctx.strokeStyle = GC(spec.palette.ink, (o.inkAlpha ?? 1) * 0.85);
    ctx.lineWidth = w;
    tracePath(ctx, pts, close);
    ctx.stroke();
    return;
  }
  const seed = o.seed ?? 0;
  const segs = close ? n : n - 1;
  const jit = 0.6 * z * (o.jitterK ?? 1);
  const over = 1.5 * z * (o.jitterK ?? 1);
  ctx.strokeStyle = GC(spec.palette.ink, o.inkAlpha ?? 1);
  ctx.lineWidth = w;
  ctx.beginPath();
  for (let s = 0; s < segs; s++) {
    const a = pts[s] as Pt, b = pts[(s + 1) % n] as Pt;
    if (!o.gapless && h01(seed + 11, s, 3) < 0.08) continue; // a gap
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const ux = dx / len, uy = dy / len;
    const steps = Math.max(1, Math.min(24, Math.round(len / (3 * z))));
    const ovA = h01(seed + 5, s, 1) < 0.5 ? over : 0; // overshoot at some corners, both ends
    const ovB = h01(seed + 7, s, 2) < 0.5 ? over : 0;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const wob = (nzAt(seed * 0.37 + s * 1.7 + t * 5.3, s * 0.11 + seed * 0.05) - 0.5) * 2 * jit;
      const ext = k === 0 ? -ovA : k === steps ? ovB : 0;
      const x = a.x + dx * t + ux * ext - uy * wob, y = a.y + dy * t + uy * ext + ux * wob;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

/** Hatching for an away face in direction C: 3 ink lines per quarter tile at 45 degrees, at zoom >= 1.0 (04 3.2). */
function hatch(pen: Pen, pts: Pt[], seed: number): void {
  const { ctx, spec, z } = pen;
  if (z < 1.0) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  const gap = (26 * z) / 12; // a quarter tile (TW / 4) holds 3 lines
  ctx.save();
  tracePath(ctx, pts, true);
  ctx.clip();
  ctx.strokeStyle = GC(spec.palette.ink, 0.32);
  ctx.lineWidth = Math.max(0.6, 0.6 * z);
  ctx.beginPath();
  const span = x1 - x0 + (y1 - y0);
  for (let d = 0, k = 0; d <= span; d += gap, k++) {
    const j = (h01(seed, k, 9) - 0.5) * gap * 0.5;
    ctx.moveTo(x0 + d + j, y0);
    ctx.lineTo(x0 + d + j - (y1 - y0), y1);
  }
  ctx.stroke();
  ctx.restore();
}

/** Fill a polygon (screen px) in the direction's manner, then its line (04 3.2 rows Line, Shading, Edges, Texture). */
export function fillPoly(pen: Pen, pts: Pt[], hex: string, o: ShapeOpts = {}): void {
  const { ctx, spec, z } = pen;
  if (pts.length < 3) return;
  const light = (o.light ?? 1) * (spec.shading === 'flat' && o.away ? 0.82 : 1);
  const alpha = o.alpha ?? 1;
  if (spec.shading === 'wash') {
    // C: the wash sits off the line by (+0.6 z, +0.4 z), alpha 0.85, feathered 1.5 z, mottled +-5 %
    const a = alpha * 0.85;
    ctx.save();
    tracePath(ctx, pts, true, 0.6 * z, 0.4 * z);
    ctx.fillStyle = shade(hex, light, a);
    ctx.fill();
    ctx.strokeStyle = shade(hex, light, a * 0.4);
    ctx.lineWidth = 1.5 * z;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.clip();
    const seed = o.seed ?? 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const w = x1 - x0, h = y1 - y0;
    if (w > 4 && h > 4) {
      for (let k = 0; k < 3; k++) {
        const dark = h01(seed, k, 21) < 0.5;
        ctx.fillStyle = shade(hex, dark ? light * 0.9 : light * 1.08, a * 0.35);
        const cx = x0 + w * h01(seed, k, 22), cy = y0 + h * h01(seed, k, 23);
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * (0.2 + 0.25 * h01(seed, k, 24)), h * (0.2 + 0.25 * h01(seed, k, 25)), h01(seed, k, 26) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    if (o.away) hatch(pen, pts, seed);
    if (!o.noInk) inkLine(pen, pts, o);
    return;
  }
  tracePath(ctx, pts, true);
  if (spec.shading === 'gradient' && o.grad) {
    const g = o.grad;
    const gr = ctx.createLinearGradient(g.from.x, g.from.y, g.to.x, g.to.y);
    gr.addColorStop(0, shade(hex, light * g.k0, alpha));
    gr.addColorStop(1, shade(hex, light * g.k1, alpha));
    ctx.fillStyle = gr;
  } else ctx.fillStyle = shade(hex, light, alpha);
  ctx.fill();
  if (spec.shading === 'flat') {
    // B: the same colour over the edge rounds the corners (0.08 tile) and hides the seams; a small shape (a beak, an eye)
    // takes a thinner edge so the rounding never inflates it
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    ctx.strokeStyle = shade(hex, light, alpha);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.8, Math.min(2 * z, 0.2 * Math.min(x1 - x0, y1 - y0)));
    ctx.stroke();
    if (o.rim && z >= 1.3) {
      ctx.strokeStyle = shade(hex, light * 0.82, alpha);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    return;
  }
  if (o.contour) inkLine(pen, pts, o);
}

/** A line (iron, twigs, limbs) in the direction's manner: A a soft stroke in `hex`, B a flat stroke, C ink over a wash stroke. */
export function strokeLine(pen: Pen, pts: Pt[], hex: string, width: number, o: ShapeOpts = {}): void {
  const { ctx, spec } = pen;
  if (pts.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const light = o.light ?? 1;
  if (spec.shading === 'wash') {
    // C: a wide stroke (a trunk) gets an ink line along each edge; anything thinner is one ink line over its wash
    if (width > inkWidth(pen) * 3) {
      ctx.strokeStyle = shade(hex, light, (o.alpha ?? 1) * 0.85);
      ctx.lineWidth = width;
      tracePath(ctx, pts, false, 0.6 * pen.z, 0.4 * pen.z);
      ctx.stroke();
      if (!o.noInk) {
        // an ink line along each edge of a wide stroke, a single line along a thin one
        const half = width / 2;
        for (const side of [-1, 1]) {
          const edge: Pt[] = [];
          for (let i = 0; i < pts.length; i++) {
            const a = pts[Math.max(0, i - 1)] as Pt, b = pts[Math.min(pts.length - 1, i + 1)] as Pt, p = pts[i] as Pt;
            const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
            edge.push({ x: p.x - (dy / l) * half * side, y: p.y + (dx / l) * half * side });
          }
          inkLine(pen, edge, { ...o, open: true, seed: (o.seed ?? 0) + side * 3 });
        }
      }
    } else {
      ctx.strokeStyle = shade(hex, light, (o.alpha ?? 1) * 0.85);
      ctx.lineWidth = Math.max(width, 1.2 * pen.z);
      tracePath(ctx, pts, false, 0.6 * pen.z, 0.4 * pen.z);
      ctx.stroke();
      if (!o.noInk) inkLine(pen, pts, { ...o, open: true, lineW: o.lineW ?? Math.min(inkWidth(pen) * 1.3, Math.max(inkWidth(pen), width * 0.6)) });
    }
    return;
  }
  ctx.strokeStyle = shade(hex, light, o.alpha ?? 1);
  ctx.lineWidth = width;
  tracePath(ctx, pts, o.open === false);
  ctx.stroke();
}

/** A disc or ellipse through the brush (an ellipse path for A and B, a polygon for C's wobble). */
export function fillEllipse(pen: Pen, cx: number, cy: number, rx: number, ry: number, hex: string, o: ShapeOpts = {}): void {
  const { ctx, spec, z } = pen;
  if (spec.shading === 'wash') {
    const n = rx + ry > 12 * z ? 22 : 12;
    fillPoly(pen, ellipsePts(cx, cy, rx, ry, n), hex, { ...o, gapless: o.gapless ?? rx + ry < 8 * z });
    return;
  }
  const light = (o.light ?? 1) * (spec.shading === 'flat' && o.away ? 0.82 : 1);
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(hex, light, o.alpha ?? 1);
  ctx.fill();
  if (spec.shading === 'flat' && o.rim && z >= 1.3) {
    ctx.strokeStyle = shade(hex, light * 0.82, o.alpha ?? 1);
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (spec.line === 'soft' && o.contour) {
    ctx.strokeStyle = GC(spec.palette.ink, (o.inkAlpha ?? 1) * 0.85);
    ctx.lineWidth = o.lineW ?? inkWidth(pen);
    ctx.stroke();
  }
}
