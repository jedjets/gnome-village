// tools/shot.mjs
// The screenshot script of 03 section 14 and 08 section 4.1, in two modes.
//   Smoke: opens dist/index.html from file:// (or --url <server url>) in the pre-installed Chromium through puppeteer-core, clicks #begin,
//     waits for the first painted day (body[data-day] and two frames) and captures
//       shots/<slice>-phone.png    390x844,  deviceScaleFactor 3
//       shots/<slice>-desktop.png  1280x800, deviceScaleFactor 2
//   Scenes (a slice with a scene set below, e.g. s2): a DEV server (started here with Vite's createServer unless --url is given; the
//     harness is not in the production build, 03 section 13) opened with #s=<seed>&halt&dev, Begin, the first painted day, then per scene:
//     the camera set through __PD.cam (angle eased by the frame's turnStep until it settles), the sim stepped with __PD.simulate when the
//     scene asks for a later time, __PD.seedVisual(seed) and __PD.fxStep(1/60, 120) for reproducible particles, #hint and #perf hidden,
//     __PD.draw(), capture shots/<slice>-<name>.png at 390x844, deviceScaleFactor 3 (08 4.1 items 3 and 4).
// Exits 1 on any console error, page error, failed request or system-fallback font (08 4.1 item 5), and in the scene mode on a rail
// taller than 40 % of the viewport or a horizontal scroll (04 5.4 item 8, AGENTS 4 item 4), a rail button under 36 x 36 px (04 5.4 item 7)
// and an open sheet over the HUD chips or the rail; a scene with `vp` = [w, h] resizes the page first (the ui set's small phones).
// Every page opens in its own browser context, so no saved park from an earlier page makes Begin ask the New confirm (S3).
// Usage: npm run shot -- <slice> [--url <url>] [--days <n>] [--smoke]
//   <slice>   default s0; letters, digits, - and _ only
//   --url     a dev server (scenes) or a dev or preview server (smoke) instead of the built-in one or dist/index.html
//   --days    smoke only: set #spdR to 8 and wait <n> sim days by polling body[data-day] (07 S0.7 item 3)
//   --smoke   run the smoke mode even for a slice that has a scene set
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { S6_SCENES, s6Actions } from './shot-s6.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, 'shots');
const CHROMIUM = '/opt/pw-browsers/chromium';
const SEED = 101;
const VIEWPORTS = [
  { name: 'phone', w: 390, h: 844, dpr: 3 },
  { name: 'desktop', w: 1280, h: 800, dpr: 2 },
];
const PHONE = VIEWPORTS[0];
// 08 4.1 item 1 flags, plus the two every headless container needs.
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--autoplay-policy=no-user-gesture-required',
  '--use-gl=swiftshader',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
];
const STEPS_PER_DAY = 21600; // 360 sim seconds x 60 steps
const START_ABS = 0.3; // a new park's T.abs (register 3.2)

/**
 * Scene sets by slice. A scene: `turn` quarter turns (0-3), `z` a zoom centred on the fountain (moved by `ox`, `oy` CSS px when given, or
 * centred on the world point `at` = [x, y]),
 * or `fit` for fitCam() (the Fit button from a moved camera), and `abs` a later T.abs (whole days plus f) to simulate to first. Scenes run in order on one page; a scene with
 * `abs` must come after every scene at an earlier time.
 * s2: 07 S2.7 items 2 to 4, and the deviation of 07 0.3 item 5 recorded in the S2 hand-back: the overview at zoom 0.8 (the river, the
 * railings on three sides and the skyline in one view; the pan per turn puts the horizon about 175 px down and shows the most river and
 * railing, worked out from the projection), a summer view at Fit (day 4, f 0.45: leaves out) and the same day at the default zoom 1.3
 * panned west of the fountain onto five trees of all three species, so the plane, chestnut and lime crowns can be told apart (07 S2.7
 * item 2; on day 1 they are in bud).
 */
const SCENE_SETS = {
  s2: [
    { name: 'park-0', turn: 0, z: 1.3 },
    { name: 'park-1', turn: 1, z: 1.3 },
    { name: 'park-2', turn: 2, z: 1.3 },
    { name: 'park-3', turn: 3, z: 1.3 },
    { name: 'overview-0', turn: 0, z: 0.8, ox: -60, oy: 130 },
    { name: 'overview-1', turn: 1, z: 0.8, ox: -120, oy: 120 },
    { name: 'overview-2', turn: 2, z: 0.8, ox: 120, oy: 120 },
    { name: 'overview-3', turn: 3, z: 0.8, ox: 60, oy: 130 },
    { name: 'fit', turn: 0, fit: true },
    { name: 'zoom-03', turn: 0, z: 0.3 },
    { name: 'zoom-24', turn: 0, z: 2.4 },
    { name: 'summer', turn: 0, fit: true, abs: 3.45 },
    { name: 'summer-13', turn: 0, z: 1.3, ox: 270, oy: -20, abs: 3.45 },
  ],
  // bv: the boulevard round the park, variant 1 of the boulevard gate (register 3.1 and section 4): Fit and the two overviews on day 1
  // (spring buds); the street lamps at night (register section 4 row Street lamps) on spring day 3 at f 0.90 (leafing crowns): zoom 1.3
  // on g_south_w's pavement from the near side and from the far side, and Fit; then summer day 4 at midday at zoom 1.3 on the same
  // pavement, from the default side (the south faces the camera: see-through crowns, low blocks, the lamps unlit) and from the opposite
  // one (full crowns and facades), and the overview at f 0.90 with the lamps lit
  bv: [
    { name: 'fit', turn: 0, fit: true },
    { name: 'overview-0', turn: 0, z: 0.8, ox: -60, oy: 130 },
    { name: 'overview-2', turn: 2, z: 0.8, ox: 120, oy: 120 },
    { name: 'night-street-13', turn: 0, z: 1.3, at: [12.5, 49], abs: 2.9 },
    { name: 'night-street-13-far', turn: 2, z: 1.3, at: [12.5, 49], abs: 2.9 },
    { name: 'night-fit', turn: 0, fit: true, abs: 2.9 },
    { name: 'street-13', turn: 0, z: 1.3, at: [12.5, 49], abs: 3.5 },
    { name: 'street-13-far', turn: 2, z: 1.3, at: [12.5, 49], abs: 3.5 },
    { name: 'night', turn: 0, z: 0.8, ox: -60, oy: 130, abs: 3.9 },
  ],
  // s3: 07 S3.7 item 5 and the rail of S3 part C, driven by real taps and clicks (puppeteer's mouse at __PD.screenOf of a tile, the rail's
  // buttons), never by writing state: the Park strip at the start view; a green bandstand ghost on the open lawn south of the inner
  // loop (24..26, 32..34 on seed 101) with Place enabled; a red one over the starter pond (tapped at (31, 12)) with row 2 reading "not on
  // the water"; row 2 with Undo enabled after a path stroke dragged across that lawn and applied by a real unpause and pause; the New
  // confirm open; the bridge over a pond 5 tiles across, red, with row 2 reading the longest reason whole ("the water is too wide here
  // (4 at most)")
  // s4: 07 S4.7 items 6 and 7 for S4 part C, driven by real clicks and taps: 22 presses of the Visitors chip's "+" while paused at the
  // start (they apply on the first step, as the owner ruled for commands enqueued while paused), then f 0.552 of day 1 round the fountain
  // (twelve sitting, the jogger Léo on the outer loop's west side clear of the trees, pigeons at the crumbs by the bench at (19, 31));
  // the pair at the cafe table (16, 44) at zoom 2.4 at each quarter turn (03 16 risk 8: the far sitter between the far chair and the
  // top, the near one after the near chair); a single's card from a real tap on her head point (zoom 1.8 and the follow, settled); the Census sheet from the chip (the card hidden
  // under it); then (the S4 rig stage, register section 4 rows Figure rig and Crowd palette) the busy midday of day 1 at f 0.5725 at zoom 1.8
  // on the spot that shows the most of the 14 body-language states in real sim time (states), at zoom 2.4 on the busiest spot (close)
  // and at zoom 0.30 (fit); f 0.90 at the fountain, the lamps lit, after Close and a tap on empty ground cleared the selection; and day 2
  // at f 0.6725 at zoom 2.0 between the two walkers' dogs, the poodle trotting on a taut lead and the terrier standing on a slack one (dogs)
  // Since the Options stage (owner 2026-10-14) Begin gives a park the profile's pace, a new player's Lively; these scenes stay on the
  // Calm park they were composed for, by a real tap: while paused at tick 0, Options, Calm and the sheet's close (calmCrowd; that
  // park.pace applies after Begin's at the first step and draws no rng, so the line-up is the one every park had before the stage).
  // The Lively park is the ui set's. The dogs scene fails unless both walkers' dogs, the terrier and the poodle, are in the clear band
  // between the chips and the rail, one trotting and one standing (bothDogs).
  s4: [
    { name: 'crowd', turn: 0, z: 1.3, at: [22.5, 25.2], abs: 0.552, pre: 'calmCrowd' },
    { name: 'table-0', turn: 0, z: 2.4, at: [16, 44] },
    { name: 'table-1', turn: 1, z: 2.4, at: [16, 44] },
    { name: 'table-2', turn: 2, z: 2.4, at: [16, 44] },
    { name: 'table-3', turn: 3, z: 2.4, at: [16, 44] },
    { name: 'card', turn: 0, z: 1.3, at: [22.5, 25.2], act: 'selectSingle' },
    { name: 'census', keep: true, act: 'openCensus' },
    { name: 'states', turn: 0, z: 1.8, abs: 0.5725, act: 'mostStates' },
    { name: 'close', turn: 0, z: 2.4, act: 'busiest' },
    { name: 'fit', turn: 0, z: 0.3 },
    { name: 'night', turn: 0, z: 1.3, at: [22, 25], abs: 0.9, act: 'clearSelection' },
    { name: 'dogs', turn: 0, z: 2.0, at: [33, 28.6], abs: 1.6725, act: 'placeDogs' },
  ],
  // s5: the romance core (07 S5.7 item 5), built through the harness's modules (the sim's own functions, a dev page): a pair seated at
  // Bench by the inner loop, pinned, with the pair card open from its selection (pair-card); the Romance chip naming it with the card
  // cleared (chip); the Romances sheet with it and a second pair at Chat (romances); then day 1 at f 0.76 a pair at Kiss by the fountain,
  // its six hearts 0.5 s into their rise (kiss: `fx` sets the particle steps). The camera is on the pair at zoom 2.0 and 2.4.
  s5: [
    { name: 'pair-card', turn: 0, z: 2.0, at: [21, 28], abs: 0.45, act: 's5Bench' },
    { name: 'chip', keep: true, act: 's5Chip' },
    { name: 'romances', keep: true, act: 's5Romances' },
    { name: 'kiss', turn: 0, z: 3.0, at: [21.5, 26.0], abs: 0.76, act: 's5Kiss', fx: 30 },
    { name: 'proposal', turn: 0, z: 3.0, at: [21.5, 27.5], act: 's5Proposal', fx: 30 },
    { name: 'stroll', turn: 0, z: 3.0, at: [18, 26], act: 's5Stroll', fx: 30 },
  ],
  // ui: the Options stage (register section 4 "Park pace and Options", owner 2026-10-14), driven by real taps: rail row 3 ending with
  // Options at the start view (rail); a real unpause and pause so Begin's profile pace applies (a new player: Lively), then Options
  // opens the sheet with Lively pressed (options); ES tapped in the sheet, the whole shell in Spanish (options-es); EN and then Calm
  // tapped and applied by a real unpause and pause (options-calm); the same sheet with body.dev, its Sound check and perf rows
  // (options-dev). The first four are the player's view: body.dev, which a DEV build always sets (03 10.2), is taken off for them.
  ui: [
    { name: 'rail', turn: 0, z: 1.3, act: 'playerView' },
    { name: 'options', keep: true, act: 'openOptions' },
    { name: 'options-es', keep: true, act: 'optionsEs' },
    { name: 'options-calm', keep: true, act: 'optionsCalm' },
    { name: 'options-dev', keep: true, act: 'optionsDev' },
    // small phones (owner 2026-10-17): the same park at 320 x 568 and 360 x 740 (`vp`), the player's view, the rail alone, then the
    // Options and the Census sheets each capped between the chips and the rail by layoutOverlays (they scroll inside when capped)
    { name: 'rail-320', vp: [320, 568], turn: 0, z: 1.3, act: 'smallRail' },
    { name: 'options-320', keep: true, act: 'smallOptions' },
    { name: 'census-320', keep: true, act: 'smallCensus' },
    { name: 'rail-360', vp: [360, 740], turn: 0, z: 1.3, act: 'smallRail' },
    { name: 'options-360', keep: true, act: 'smallOptions' },
    { name: 'census-360', keep: true, act: 'smallCensus' },
  ],
  // s6: the UI stage of S6 (07 S6.7 item 5): the Cupid strip, the cooldown chip, the petals cast and the Progress sheet, by real taps (tools/shot-s6.mjs)
  s6: S6_SCENES,
  s3: [
    { name: 'rail', turn: 0, z: 1.3 },
    { name: 'ghost-ok', turn: 0, z: 1.3, at: [24, 29], act: 'ghostOk' },
    { name: 'ghost-bad', turn: 0, z: 1.3, at: [29, 15], act: 'ghostBad' },
    { name: 'undo', turn: 0, z: 1.3, at: [24, 29], act: 'pathStroke' },
    { name: 'bridge-wide', turn: 0, z: 1.3, at: [29, 30], act: 'bridgeWide' },
    { name: 'confirm', turn: 0, z: 1.3, act: 'confirmNew' },
  ],
};

/** The tile's screen point in CSS px (the canvas fills the viewport from 0, 0). */
async function screenOfTile(page, x, y) {
  return page.evaluate((tx, ty) => window.__PD.screenOf(tx, ty), x, y);
}
async function tapTile(page, x, y) {
  const p = await screenOfTile(page, x, y);
  await page.mouse.click(p.x, p.y);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A real unpause and pause through the rail's pause button (the `speed` command, 03 4.6): what was enqueued while paused applies. */
async function runBriefly(page, ms = 250) {
  await page.click('#bHalt');
  await page.waitForFunction(() => window.__PD.T.speed > 0, { timeout: 5_000 });
  await sleep(ms);
  await page.click('#bHalt');
  await page.waitForFunction(() => window.__PD.T.speed === 0, { timeout: 5_000 });
}

/**
 * Centre the camera (turn 0, the scene's zoom) on the visitor whose view scores best: `states` the number of distinct body-language states
 * (render/figures.ts stateOf, read from the live sim, nothing poked) among the visitors in the clear band between the chips and the rail,
 * the count of them on a tie; `count` the count alone. The camera only: the sim is not touched.
 */
async function centreBest(page, by) {
  await page.evaluate(async (mode) => {
    const pd = window.__PD, z = pd.cam.z;
    const fg = await import('/src/render/figures.ts');
    const vs = pd.visitors.map((v) => ({ x: v.x, y: v.y, st: fg.stateOf(v) }));
    let best = null, bs = -1;
    for (const c of vs) {
      const seen = new Set();
      let n = 0, mx = 0, my = 0;
      for (const v of vs) {
        const sx = 195 + ((v.x - c.x) - (v.y - c.y)) * 13 * z, sy = 388 + ((v.x - c.x) + (v.y - c.y)) * 6.5 * z;
        if (sx < 40 || sx > 350 || sy < 170 || sy > 580) continue;
        seen.add(v.st);
        n++;
        mx += v.x;
        my += v.y;
      }
      const score = mode === 'states' ? seen.size * 100 + n : n;
      if (score > bs) {
        bs = score;
        best = { x: mx / n, y: my / n }; // the group's middle, so it sits in the middle of the view
      }
    }
    if (!best) return;
    pd.cam.ox = -((best.x - 23.5) - (best.y - 23.5)) * 13 * z;
    pd.cam.oy = -((best.x - 23.5) + (best.y - 23.5)) * 6.5 * z;
  }, by);
}

/** Scene actions (s3, s4), run after the camera is set and before the capture; `pre` actions (s4) run before the scene's simulate. */
/** s5: a pair of two new singles at (x, y) and (x + 1, y), at `stage` with `aff`, its next stage `next` started; returns its id. */
async function s5Pair(page, x, y, stage, aff, next, pin) {
  return page.evaluate(async (x, y, stage, aff, next, pin) => {
    const V = await import('/src/entities/visitor.ts');
    const R = await import('/src/entities/romance.ts');
    const S = await import('/src/entities/romance-stages.ts');
    const mk = (sex, dx) => {
      const v = V.spawnVisitor('single', 'g_west', { sex, seeks: sex === 'f' ? 'm' : 'f' });
      Object.assign(v, { x: x + dx, y, path: null, st: 'idle', t: 0, hunger: 0.2, energy: 0.9, comfort: 0.9, leaveAt: 99, decideT: 5 });
      return v;
    };
    const a = mk('f', 0), b = mk('m', 1);
    const p = R.tryForm(a, b, true);
    Object.assign(p, { stage, affinity: aff, doing: 0, formedDay: 0 });
    for (const v of [a, b]) Object.assign(v, { st: 'idle', job: {}, path: null });
    if (next) S.startStage(p, next, false);
    if (pin) R.setPin(p.id);
    return p.id;
  }, x, y, stage, aff, next, pin);
}
/** s5: step until `ok` holds for the pair (both seated, or both at the kiss with its clock started), then pause. */
async function s5Until(page, id, what) {
  const ok = await page.evaluate(async (id, what) => {
    const pd = window.__PD;
    for (let k = 0; k < 600; k++) {
      const p = pd.pairs.find((q) => q.id === id);
      const a = p && pd.visitors.find((v) => v.id === p.a), b = p && pd.visitors.find((v) => v.id === p.b);
      const still = a && b && !a.path && !b.path;
      if (what === 'bench' && a && b && a.st === 'bench' && b.st === 'bench') return true;
      if (what === 'kiss' && still && a.st === 'kiss' && p.stageT < 9.9) return true;
      if (what === 'proposal' && still && a.st === 'proposal' && p.stageT < 2.5) return true;
      if (what === 'stroll' && a && b && a.st === 'stroll' && p.stageT < 57 && Math.hypot(a.x - b.x, a.y - b.y) <= 0.9) return true;
      pd.simulate(10);
    }
    return false;
  }, id, what);
  if (!ok) throw new Error(`s5: the pair never reached ${what}`);
  await page.evaluate(() => window.__PD.setSpeed(0));
}

const ACTIONS = {
  /** s5: a pair at Bench (a bench by the inner loop), pinned, the pair card from its selection, the follow settled. */
  async s5Bench(page) {
    const id = await s5Pair(page, 20, 27, 2, 0.5, 3, true);
    await s5Until(page, id, 'bench');
    await page.evaluate(async (id) => {
      const C = await import('/src/ui/card.ts');
      const p = window.__PD.pairs.find((q) => q.id === id);
      C.select({ kind: 'visitor', id: p.a, tile: null });
    }, id);
    await page.waitForFunction(() => document.getElementById('card').classList.contains('pair'), { timeout: 5_000 });
    await sleep(1600);
  },
  /** s5: the selection cleared; the Romance chip names the pinned pair. */
  async s5Chip(page) {
    await page.evaluate(async () => (await import('/src/ui/card.ts')).clearSel());
    await sleep(500);
  },
  /** s5: a second pair at Chat, then the Romance chip opens the Romances sheet. */
  async s5Romances(page) {
    await s5Pair(page, 27, 20, 1, 0.35, 0, false);
    await page.click('#hudRomance');
    await page.waitForFunction(() => document.getElementById('romances').classList.contains('on'), { timeout: 5_000 });
    await sleep(400);
  },
  /** s5: Close, then a pair at Kiss beside the fountain at f 0.76 with its six hearts. */
  /** s5 (a look at the picked art): a Proposal by the fountain 12.5 s in, her hands to her mouth; a Stroll arm in arm. */
  async s5Proposal(page) {
    const id = await s5Pair(page, 21, 27.5, 6, 0.96, 7, true);
    await s5Until(page, id, 'proposal');
  },
  async s5Stroll(page) {
    const id = await s5Pair(page, 18, 26, 3, 0.6, 4, true);
    await s5Until(page, id, 'stroll');
    await page.evaluate((id) => {
      const pd = window.__PD, p = pd.pairs.find((q) => q.id === id), a = pd.visitors.find((v) => v.id === p.a);
      const C = pd.cam;
      C.follow = { kind: 'visitor', id: a.id };
    }, id);
    await sleep(1600);
  },
  async s5Kiss(page) {
    if (await page.$eval('#romances', (el) => el.classList.contains('on'))) await page.click('#romances .x');
    const id = await s5Pair(page, 21, 26.2, 5, 0.85, 6, true);
    await s5Until(page, id, 'kiss');
  },
  /** s4: 22 presses of the Visitors chip's "+" while paused: 22 visitor.call commands that the first step applies. */
  async callCrowd(page) {
    for (let k = 0; k < 22; k++) await page.click('#bAdd');
  },
  /** s4: Options, Calm (pressed) and the close, tapped while paused at tick 0 (Calm applies after Begin's Lively), then callCrowd. */
  async calmCrowd(page) {
    await page.click('#bOptions');
    await page.waitForFunction(() => document.getElementById('options').classList.contains('on'), { timeout: 5_000 });
    await page.click('#optionsList [data-k="pace:calm"]');
    await page.waitForFunction(() => document.querySelector('#optionsList [data-k="pace:calm"]')?.getAttribute('aria-pressed') === 'true', { timeout: 5_000 });
    await page.click('#options .x');
    await page.waitForFunction(() => !document.getElementById('options').classList.contains('on'), { timeout: 5_000 });
    await ACTIONS.callCrowd(page);
  },
  /**
   * s4: a real tap on the head point (03 8.2: 8z above the drawn ground, at a sitter's seat) of the single nearest the middle of the
   * clear band, then the follow settles (zoom 1.8; camera.ts followStep eases with k = 1 - 0.02^dt, so a second and a half).
   */
  async selectSingle(page) {
    const p = await page.evaluate(() => {
      const pd = window.__PD, z = pd.cam.z;
      let best = null, bd = Infinity;
      for (const v of pd.visitors) {
        if (v.archetype !== 'single') continue;
        const seat = v.sitPropId ? pd.props.find((q) => q.id === v.sitPropId) : null;
        const e = seat ? ({ bench: 0.2, table: 0.3 })[seat.kind] ?? 0 : 0;
        const s = pd.screenOf(v.x, v.y, e);
        const d = Math.hypot(s.x - 195, s.y - 380);
        if (s.y > 160 && s.y < 560 && d < bd) {
          bd = d;
          best = { x: s.x, y: s.y - 8 * z, id: v.id };
        }
      }
      return best;
    });
    if (!p) throw new Error('s4 card: no single on screen');
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(() => document.getElementById('card').classList.contains('on'), { timeout: 5_000 });
    await sleep(1600);
  },
  /** s4: the Visitors chip opens the Census (02 12.2); the card hides under body.sheet (02 12.3 item 5). */
  async openCensus(page) {
    await page.click('#hudVisitors');
    await page.waitForFunction(() => document.getElementById('census').classList.contains('on') && document.body.classList.contains('sheet'), { timeout: 5_000 });
    await sleep(400);
  },
  /** s4: Close on the sheet, then a tap on empty ground clears the selection and the follow (03 8.2 item 4). */
  async clearSelection(page) {
    if (await page.$eval('#census', (el) => el.classList.contains('on'))) await page.click('#census .x');
    const t = await screenOfTile(page, 21, 27);
    await page.mouse.click(t.x, t.y);
    await page.waitForFunction(() => !document.getElementById('card').classList.contains('on'), { timeout: 5_000 });
  },
  /** s4: the selection cleared, then the camera on the visitor whose view at this zoom holds the most distinct body-language states. */
  async mostStates(page) {
    await ACTIONS.clearSelection(page);
    await centreBest(page, 'states');
  },
  /** s4: the camera on the visitor whose view at this zoom holds the most visitors (a busy spot). */
  async busiest(page) {
    await centreBest(page, 'count');
  },
  /**
   * s4, read only (register section 4 row Figure rig: both dogs, one per dog walker): the park is Calm and the terrier and the poodle
   * are both in the clear band between the chips and the rail, one trotting (a taut lead) and one standing (a slack one).
   */
  /**
   * s4 (since S5): the sim no longer brings the two walkers' dogs together on their own (pairs forming moved the stream), so the scene
   * places them: a terrier's walker standing at (32, 28.6) and a poodle's walking east from (34, 29) (walkers spawned until both breeds
   * are there), then bothDogs checks the picture as before.
   */
  async placeDogs(page) {
    await page.evaluate(async () => {
      const pd = window.__PD;
      const V = await import('/src/entities/visitor.ts');
      const L = await import('/src/render/figure-look.ts');
      const M = await import('/src/entities/move.ts');
      const walkers = () => pd.visitors.filter((v) => v.archetype === 'dogwalker');
      for (let k = 0; k < 60; k++) {
        const br = walkers().map((v) => L.breedOf(v.lookSeed));
        if (br.includes('terrier') && br.includes('poodle')) break;
        if (walkers().length >= 2) V.removeVisitor(walkers()[0].id);
        V.spawnVisitor('dogwalker', 'g_east');
      }
      const t = walkers().find((v) => L.breedOf(v.lookSeed) === 'terrier'), p = walkers().find((v) => L.breedOf(v.lookSeed) === 'poodle');
      Object.assign(t, { x: 32, y: 28.6, path: null, st: 'idle', t: 30, job: {}, leaveAt: 99, decideT: 99 });
      Object.assign(p, { x: 34, y: 29, path: null, st: 'wander', job: { kind: 'wander' }, leaveAt: 99, decideT: 99 });
      pd.simulate(2);
      for (const c of pd.creatures) {
        const o = c.kind === 'dog' && pd.visitors.find((v) => v.id === c.ownerId);
        if (o) Object.assign(c, { x: o.x - 0.6, y: o.y + 0.4, outside: false });
      }
      M.goTo(p, 38, 29);
      pd.simulate(40);
      pd.setSpeed(0);
    });
    await ACTIONS.bothDogs(page);
  },
  async bothDogs(page) {
    const r = await page.evaluate(async () => {
      const pd = window.__PD;
      const { breedOf } = await import('/src/render/figure-look.ts');
      const top = Math.max(...[...document.querySelectorAll('.hud .chip')].map((c) => c.getBoundingClientRect().bottom));
      const bottom = document.getElementById('rail').getBoundingClientRect().top;
      const dogs = pd.creatures.filter((c) => c.kind === 'dog' && !c.outside).map((c) => {
        const o = pd.visitors.find((v) => v.id === c.ownerId), s = pd.screenOf(c.x, c.y);
        const seen = s.x > 0 && s.x < innerWidth && s.y > top && s.y < bottom;
        return { breed: breedOf(o ? o.lookSeed : c.id), st: c.st, seen, at: `${c.x.toFixed(1)},${c.y.toFixed(1)}` };
      });
      return { pace: pd.snapshot().pace ?? 'calm', dogs };
    });
    const seen = r.dogs.filter((d) => d.seen);
    const ok = r.pace === 'calm' && ['terrier', 'poodle'].every((b) => seen.some((d) => d.breed === b)) &&
      seen.some((d) => d.st === 'walk') && seen.some((d) => d.st !== 'walk');
    if (!ok) throw new Error(`s4 dogs: want the Calm park's terrier and poodle in view, one trotting and one standing; got ${JSON.stringify(r)}`);
  },
  /** The bandstand armed and a tap on the lawn tile (25, 33): the 3 x 3 ghost (24..26, 32..34) centred on it, green. */
  async ghostOk(page) {
    await page.click('.tool[data-id="bandstand"]');
    await tapTile(page, 25, 33);
    await page.waitForFunction(() => !document.getElementById('bPlace').hidden && !document.getElementById('bPlace').disabled, { timeout: 5_000 });
  },
  /** The bandstand still armed: a tap on the pond moves the ghost there, red, and row 2 reads the reason. */
  async ghostBad(page) {
    await tapTile(page, 31, 12);
    await page.waitForFunction(() => document.getElementById('depth').classList.contains('no') && document.getElementById('bPlace').disabled, { timeout: 5_000 });
  },
  /** Cancel, the path brush, a stroke dragged along row 33 from x 20 to 27 (the drag-paint throttle paints on the way), a real unpause. */
  async pathStroke(page) {
    await page.click('#bCancel');
    await page.click('.tool[data-id="path"]');
    const a = await screenOfTile(page, 20, 33), b = await screenOfTile(page, 27, 33);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let k = 1; k <= 12; k++) {
      await sleep(60);
      await page.mouse.move(a.x + ((b.x - a.x) * k) / 12, a.y + ((b.y - a.y) * k) / 12);
    }
    await page.mouse.up();
    await runBriefly(page);
    await page.waitForFunction(() => !document.getElementById('bUndo').disabled, { timeout: 5_000 });
  },
  /**
   * The longest ranked reason in row 2 (02 8.4: "the water is too wide here (4 at most)"): the pond brush at size 3 (a click at the
   * slider's right end) tapped at (30, 33) paints a pond 5 tiles across, a real unpause applies it, then the bridge tapped there is red.
   */
  async bridgeWide(page) {
    await page.click('.tool[data-id="pond"]');
    const r = await page.$eval('#size', (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.right - 3, y: b.top + b.height / 2 };
    });
    await page.mouse.click(r.x, r.y);
    await page.waitForFunction(() => document.getElementById('size').value === '3', { timeout: 5_000 });
    await tapTile(page, 30, 33);
    await runBriefly(page);
    await page.waitForFunction(() => window.__PD.layers.WATER[33 * 48 + 28] > 0 && window.__PD.layers.WATER[33 * 48 + 32] > 0, { timeout: 5_000 });
    await page.click('.tool[data-id="bridge"]');
    await tapTile(page, 30, 33);
    await page.waitForFunction(() => document.getElementById('depth').classList.contains('no'), { timeout: 5_000 });
  },
  /** ui: the player's view: body.dev (always on in a DEV build, 03 10.2) off, so the Options sheet shows no dev rows. */
  async playerView(page) {
    await page.evaluate(() => document.body.classList.remove('dev'));
  },
  /** ui: a real unpause and pause applies Begin's park.pace (a new player's Lively), then Options opens the sheet with Lively pressed. */
  async openOptions(page) {
    await runBriefly(page);
    await page.waitForFunction(() => window.__PD.snapshot().pace === 'lively', { timeout: 5_000 });
    await page.click('#bOptions');
    await page.waitForFunction(
      () => document.getElementById('options').classList.contains('on') &&
        document.querySelector('#optionsList [data-k="pace:lively"]')?.getAttribute('aria-pressed') === 'true',
      { timeout: 5_000 },
    );
  },
  /** ui: ES tapped in the sheet: the tables, <html lang> and the profile (intro.ts chooseLang); the sheet repaints in Spanish. */
  async optionsEs(page) {
    await page.click('#optionsList [data-k="lang:es"]');
    await page.waitForFunction(() => document.documentElement.lang === 'es' && document.getElementById('bOptions').textContent === 'Opciones', { timeout: 5_000 });
  },
  /** ui: EN, then Calm tapped and applied by a real unpause and pause; the park and the profile are calm, Calm is pressed. */
  async optionsCalm(page) {
    await page.click('#optionsList [data-k="lang:en"]');
    await page.waitForFunction(() => document.documentElement.lang === 'en', { timeout: 5_000 });
    await page.click('#optionsList [data-k="pace:calm"]');
    await runBriefly(page);
    await page.waitForFunction(
      () => window.__PD.snapshot().pace === 'calm' && JSON.parse(localStorage.getItem('parque:profile-v1') || '{}').settings?.pace === 'calm' &&
        document.querySelector('#optionsList [data-k="pace:calm"]')?.getAttribute('aria-pressed') === 'true',
      { timeout: 5_000 },
    );
  },
  /** ui: body.dev back on: the sheet shows the Sound check and perf rows (03 10.2). */
  async optionsDev(page) {
    await page.evaluate(() => document.body.classList.add('dev'));
  },
  /** ui small phones: every sheet closed by its close button, the player's view (body.dev off). */
  async smallRail(page) {
    for (const id of ['options', 'census']) {
      if (await page.$eval('#' + id, (el) => el.classList.contains('on'))) await page.click(`#${id} .x`);
    }
    await page.evaluate(() => document.body.classList.remove('dev'));
    await page.waitForFunction(() => !document.body.classList.contains('sheet'), { timeout: 5_000 });
  },
  /** ui small phones: Options opens its sheet from row 3. */
  async smallOptions(page) {
    await page.click('#bOptions');
    await page.waitForFunction(() => document.getElementById('options').classList.contains('on'), { timeout: 5_000 });
  },
  /** ui small phones: Options closed, then the Visitors chip opens the Census. */
  async smallCensus(page) {
    await page.click('#options .x');
    await page.click('#hudVisitors');
    await page.waitForFunction(() => document.getElementById('census').classList.contains('on'), { timeout: 5_000 });
  },
  /** Row 3's New: the confirm opens (No is pressed after the capture by the next page load; this is the last scene). */
  async confirmNew(page) {
    await page.click('.tool[data-id="hand"]');
    await page.click('#bNew');
    await page.waitForFunction(() => !document.getElementById('confirm').hidden, { timeout: 5_000 });
  },
};

Object.assign(ACTIONS, s6Actions({ tapTile, runBriefly, sleep }));

function parseArgs(argv) {
  const out = { slice: 's0', url: '', days: 0, smoke: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i] ?? '';
    else if (a === '--days') out.days = parseInt(argv[++i] ?? '0', 10) || 0;
    else if (a === '--smoke') out.smoke = true;
    else if (!a.startsWith('-')) out.slice = a;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(out.slice)) throw new Error(`bad slice name "${out.slice}": use letters, digits, - and _`);
  return out;
}

/** Set the speed dial to 8x and wait until body[data-day] has advanced by `days`. */
async function waitDays(page, days) {
  const start = await page.evaluate(() => parseInt(document.body.dataset.day || '1', 10));
  await page.evaluate(() => {
    const r = document.getElementById('spdR');
    r.value = '8';
    r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(
    (target) => parseInt(document.body.dataset.day || '0', 10) >= target,
    { timeout: 180_000, polling: 250 },
    start + days,
  );
}

/** The first painted day: the HUD has written body[data-day] and the frame loop has drawn at least two frames since. */
async function waitPainted(page) {
  await page.waitForFunction(() => !!document.body.dataset.day, { timeout: 10_000, polling: 50 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
}

/** True when both bundled families answer, so no shot is taken with a system fallback (08 4.1 item 5). */
async function fontsLoaded(page) {
  return page.evaluate(async () => {
    await Promise.all([document.fonts.load('12px Figtree'), document.fonts.load('12px Fraunces')]);
    await document.fonts.ready;
    return document.fonts.check('12px Figtree') && document.fonts.check('12px Fraunces');
  });
}

async function newPage(browser, vp, errors) {
  const ctx = await browser.createBrowserContext(); // its own localStorage: a fresh profile and no saved park
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console [${vp.name}]: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`page [${vp.name}]: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`request [${vp.name}]: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr });
  return page;
}

async function begin(page, target) {
  await page.goto(target, { waitUntil: 'load' });
  await page.waitForSelector('#begin', { visible: true, timeout: 20_000 });
  await page.click('#begin');
  await page.waitForSelector('#intro', { hidden: true, timeout: 5_000 });
  await waitPainted(page);
}

async function smoke(browser, slice, url, days, errors, written) {
  const index = path.join(DIST, 'index.html');
  if (!url && !fs.existsSync(index)) throw new Error('dist/index.html is missing: run npm run build first');
  const target = `${url || pathToFileURL(index).href}#s=${SEED}`;
  for (const vp of VIEWPORTS) {
    const page = await newPage(browser, vp, errors);
    await begin(page, target);
    if (days > 0) await waitDays(page, days);
    else await new Promise((r) => setTimeout(r, 500));
    if (!(await fontsLoaded(page))) errors.push(`fonts [${vp.name}]: Figtree or Fraunces did not load; a fallback-font shot is invalid`);
    const file = path.join(SHOTS, `${slice}-${vp.name}.png`);
    await page.screenshot({ path: file });
    written.push(file);
    await page.browserContext().close();
  }
}

/** Put the camera on a scene: the angle eased by the frame loop until it settles, then the zoom on the fountain or the Fit view. */
async function frame(page, sc) {
  await page.evaluate((turn) => {
    const cam = window.__PD.cam;
    cam.follow = 0;
    cam.turnKeep = null;
    cam.angT = (turn * Math.PI) / 2;
  }, sc.turn ?? 0);
  await page.waitForFunction(() => window.__PD.cam.ang === window.__PD.cam.angT, { timeout: 10_000, polling: 'raf' });
  if (sc.fit) {
    // the Fit button from a moved camera is fitCam() (GV 12151): mark the camera moved, then press it
    await page.evaluate(() => {
      window.__PD.cam.free = true;
      document.getElementById('bFit').click();
    });
  } else {
    // the fountain's centre is the rotation centre (23.5, 23.5): centred on it means no pan at any angle and zoom (03 7.1 item 2); `at`
    // centres a world point instead, by the projection of 03 7.1 item 2 at the scene's quarter turn
    let { ox = 0, oy = 0 } = sc;
    if (sc.at) {
      const a = ((sc.turn ?? 0) * Math.PI) / 2, dx = sc.at[0] - 23.5, dy = sc.at[1] - 23.5;
      const rx = 23.5 + dx * Math.cos(a) - dy * Math.sin(a), ry = 23.5 + dx * Math.sin(a) + dy * Math.cos(a);
      ox = -(rx - ry) * 13 * sc.z;
      oy = -(rx + ry - 47) * 6.5 * sc.z;
    }
    await page.evaluate((z, ox, oy) => {
      const cam = window.__PD.cam;
      cam.z = z;
      cam.ox = ox;
      cam.oy = oy;
      cam.free = true;
    }, sc.z, ox, oy);
  }
}

async function scenes(browser, slice, set, url, errors, written) {
  let server = null;
  let base = url;
  if (!base) {
    const { createServer } = await import('vite');
    server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false } });
    await server.listen();
    base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5199/';
  }
  try {
    const page = await newPage(browser, PHONE, errors);
    await begin(page, `${base.replace(/\/?$/, '/')}#s=${SEED}&halt&dev`);
    await page.waitForFunction(() => typeof window.__PD !== 'undefined', { timeout: 10_000 });
    await page.evaluate(() => {
      for (const id of ['hint', 'perf']) document.getElementById(id).style.visibility = 'hidden';
      window.__PD.setSpeed(0);
    });
    if (!(await fontsLoaded(page))) errors.push('fonts [scenes]: Figtree or Fraunces did not load; a fallback-font shot is invalid');
    for (const sc of set) {
      if (sc.pre) await ACTIONS[sc.pre](page);
      if (sc.abs !== undefined) {
        // one step past the mark: 0.30 + 68040 / 21600 is 3.4499... in floating point, which the clock reads as the band before
        const steps = Math.round((sc.abs - START_ABS) * STEPS_PER_DAY) + 1;
        await page.evaluate(async (target) => {
          const pd = window.__PD;
          while (pd.tick() < target) {
            pd.simulate(Math.min(4000, target - pd.tick()));
            await new Promise((r) => setTimeout(r, 0));
          }
        }, steps);
      }
      if (sc.vp) {
        // a resize: main.ts's listener runs layoutOverlays for the new rail
        await page.setViewport({ width: sc.vp[0], height: sc.vp[1], deviceScaleFactor: PHONE.dpr });
        await sleep(300);
      }
      if (!sc.keep) await frame(page, sc);
      if (sc.act) await ACTIONS[sc.act](page);
      await page.evaluate((seed, fx) => {
        const pd = window.__PD;
        pd.seedVisual(seed);
        pd.fxStep(1 / 60, fx);
        pd.draw();
      }, SEED, sc.fx ?? 120);
      // the HUD repaints the chips every 0.35 s: wait past one repaint so the clock chip shows this scene's time; the live loop's frames
      // in between draw the same picture (paused, particles still)
      await new Promise((r) => setTimeout(r, 450));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
      // 04 5.4 item 8: the rail under 40 % of the viewport; AGENTS 4 item 4: no horizontal scroll
      // and row 2's line (the tool's name or the ranked reason) whole, never cut (02 8.2: row 2 shows the reason)
      const lay = await page.evaluate(() => {
        const d = document.getElementById('depth');
        // a fixed rail never scrolls the page, so a control past the edge shows only here (the Park strip scrolls on purpose)
        const out = [];
        for (const el of document.querySelectorAll('#rail .grp, #rail .gb, #rail .ctx, #rail .chip')) {
          const b = el.getBoundingClientRect();
          if (el.offsetParent !== null && !el.closest('#tools') && (b.left < -0.5 || b.right > innerWidth + 0.5)) out.push(`${el.id || el.className} ${Math.round(b.left)}..${Math.round(b.right)}`);
        }
        // 04 5.4 item 7: every rail button's tap target (its border box) at least 36 x 36 px
        const small = [];
        for (const el of document.querySelectorAll('#rail button')) {
          const b = el.getBoundingClientRect();
          if (el.offsetParent !== null && (b.width < 35.5 || b.height < 35.5)) small.push(`${el.id || el.dataset.group || el.dataset.id || el.className} ${b.width.toFixed(1)}x${b.height.toFixed(1)}`);
        }
        // an open sheet sits between the HUD chips and the rail (no overlap)
        const sh = document.querySelector('div.sheet.on'), sb = sh?.getBoundingClientRect();
        const chips = Math.max(...[...document.querySelectorAll('.hud .chip')].map((c) => c.getBoundingClientRect().bottom));
        const railTop = document.getElementById('rail').getBoundingClientRect().top;
        let sheet = sb && (sb.top < chips || sb.bottom > railTop) ? `${sh.id} ${Math.round(sb.top)}..${Math.round(sb.bottom)}, chips end ${Math.round(chips)}` : '';
        // the Options sheet shows every row without a scroll at 390 x 844 (a census of 30 scrolls on purpose; on a smaller phone a sheet
        // capped between the chips and the rail scrolls inside, owner 2026-10-17)
        if (sh?.id === 'options' && innerHeight >= 844 && sh.scrollHeight > sh.clientHeight + 1) sheet += ` options scrolls ${sh.scrollHeight} > ${sh.clientHeight}`;
        return {
          out,
          small,
          sheet,
          box: sb ? `${sh.id} ${Math.round(sb.top)}..${Math.round(sb.bottom)}, chips end ${Math.round(chips)}, rail top ${Math.round(railTop)}` : '',
          rail: document.getElementById('rail').getBoundingClientRect().height,
          sw: document.documentElement.scrollWidth,
          vw: window.innerWidth,
          vh: window.innerHeight,
          depth: d.offsetParent !== null && d.scrollWidth > d.clientWidth + 1 ? `${d.textContent} (${d.scrollWidth} > ${d.clientWidth})` : '',
        };
      });
      if (lay.rail > 0.4 * lay.vh) errors.push(`layout [${sc.name}]: the rail is ${lay.rail} px, over 40 % of ${lay.vh}`);
      if (lay.sw > lay.vw) errors.push(`layout [${sc.name}]: horizontal scroll ${lay.sw} > ${lay.vw}`);
      if (lay.depth) errors.push(`layout [${sc.name}]: row 2's line is cut: ${lay.depth}`);
      if (lay.out.length) errors.push(`layout [${sc.name}]: rail controls past the edge: ${lay.out.join(', ')}`);
      if (lay.small.length) errors.push(`layout [${sc.name}]: rail buttons under 36 x 36: ${lay.small.join(', ')}`);
      if (lay.sheet) errors.push(`layout [${sc.name}]: the open sheet overlaps the chips or the rail: ${lay.sheet}`);
      const file = path.join(SHOTS, `${slice}-${sc.name}.png`);
      await page.screenshot({ path: file });
      written.push(file);
      console.log(`${slice}-${sc.name}: rail ${Math.round(lay.rail)} px of ${lay.vh} (${Math.round((100 * lay.rail) / lay.vh)} %)${lay.box ? ', sheet ' + lay.box : ''}`);
    }
    await page.browserContext().close();
  } finally {
    if (server) await server.close();
  }
}

async function main() {
  const { slice, url, days, smoke: forceSmoke } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(CHROMIUM)) throw new Error(`Chromium not found at ${CHROMIUM}`);
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: CHROMIUM_ARGS });
  const errors = [];
  const written = [];
  try {
    const set = SCENE_SETS[slice];
    if (set && !forceSmoke) await scenes(browser, slice, set, url, errors, written);
    else await smoke(browser, slice, url, days, errors, written);
  } finally {
    await browser.close();
  }
  for (const f of written) console.log('wrote', path.relative(ROOT, f));
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
