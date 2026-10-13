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
// Exits 1 on any console error, page error, failed request or system-fallback font (08 4.1 item 5).
// Usage: npm run shot -- <slice> [--url <url>] [--days <n>] [--smoke]
//   <slice>   default s0; letters, digits, - and _ only
//   --url     a dev server (scenes) or a dev or preview server (smoke) instead of the built-in one or dist/index.html
//   --days    smoke only: set #spdR to 8 and wait <n> sim days by polling body[data-day] (07 S0.7 item 3)
//   --smoke   run the smoke mode even for a slice that has a scene set
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

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
  // (spring buds), then summer day 4 at midday at zoom 1.3 on g_south_w's pavement, from the default side (the south faces the camera:
  // see-through crowns, low blocks) and from the opposite one (full crowns and facades), and the overview at f 0.90 with the lamps lit
  bv: [
    { name: 'fit', turn: 0, fit: true },
    { name: 'overview-0', turn: 0, z: 0.8, ox: -60, oy: 130 },
    { name: 'overview-2', turn: 2, z: 0.8, ox: 120, oy: 120 },
    { name: 'street-13', turn: 0, z: 1.3, at: [12.5, 49], abs: 3.5 },
    { name: 'street-13-far', turn: 2, z: 1.3, at: [12.5, 49], abs: 3.5 },
    { name: 'night', turn: 0, z: 0.8, ox: -60, oy: 130, abs: 3.9 },
  ],
};

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
  const page = await browser.newPage();
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
    await page.close();
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
      await frame(page, sc);
      await page.evaluate((seed) => {
        const pd = window.__PD;
        pd.seedVisual(seed);
        pd.fxStep(1 / 60, 120);
        pd.draw();
      }, SEED);
      // the HUD repaints the chips every 0.35 s: wait past one repaint so the clock chip shows this scene's time; the live loop's frames
      // in between draw the same picture (paused, particles still)
      await new Promise((r) => setTimeout(r, 450));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
      const file = path.join(SHOTS, `${slice}-${sc.name}.png`);
      await page.screenshot({ path: file });
      written.push(file);
    }
    await page.close();
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
