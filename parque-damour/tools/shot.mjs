// tools/shot.mjs
// The screenshot script of 03 section 14 and 08 section 4.1: opens dist/index.html from file:// (or --url <dev server url>)
// in the pre-installed Chromium through puppeteer-core, clicks #begin, and captures
//   shots/<slice>-phone.png    390x844,  deviceScaleFactor 3
//   shots/<slice>-desktop.png  1280x800, deviceScaleFactor 2
// Exits 1 on any console error, page error, failed request or system-fallback font (08 4.1 item 5).
// Usage: npm run shot -- <slice> [--url <url>] [--days <n>]
//   <slice>   default s0; letters, digits, - and _ only
//   --url     open a dev or preview server URL instead of dist/index.html
//   --days    set #spdR to 8 and wait <n> sim days by polling the data-day attribute on body (07 S0.7 item 3); S0 needs none
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

function parseArgs(argv) {
  const out = { slice: 's0', url: '', days: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i] ?? '';
    else if (a === '--days') out.days = parseInt(argv[++i] ?? '0', 10) || 0;
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

/** True when both bundled families answer, so no shot is taken with a system fallback (08 4.1 item 5). */
async function fontsLoaded(page) {
  return page.evaluate(async () => {
    await Promise.all([document.fonts.load('12px Figtree'), document.fonts.load('12px Fraunces')]);
    await document.fonts.ready;
    return document.fonts.check('12px Figtree') && document.fonts.check('12px Fraunces');
  });
}

async function main() {
  const { slice, url, days } = parseArgs(process.argv.slice(2));
  const index = path.join(DIST, 'index.html');
  if (!url && !fs.existsSync(index)) throw new Error('dist/index.html is missing: run npm run build first');
  if (!fs.existsSync(CHROMIUM)) throw new Error(`Chromium not found at ${CHROMIUM}`);
  fs.mkdirSync(SHOTS, { recursive: true });
  const target = `${url || pathToFileURL(index).href}#s=${SEED}`;
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: CHROMIUM_ARGS });
  const errors = [];
  const written = [];
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console [${vp.name}]: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`page [${vp.name}]: ${e.message}`));
      page.on('requestfailed', (r) => errors.push(`request [${vp.name}]: ${r.url()} ${r.failure()?.errorText ?? ''}`));
      await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr });
      await page.goto(target, { waitUntil: 'load' });
      await page.waitForSelector('#begin', { visible: true, timeout: 15_000 });
      await page.click('#begin');
      await page.waitForSelector('#intro', { hidden: true, timeout: 5_000 });
      if (days > 0) await waitDays(page, days);
      else await new Promise((r) => setTimeout(r, 500));
      if (!(await fontsLoaded(page))) errors.push(`fonts [${vp.name}]: Figtree or Fraunces did not load; a fallback-font shot is invalid`);
      const file = path.join(SHOTS, `${slice}-${vp.name}.png`);
      await page.screenshot({ path: file });
      written.push(file);
      await page.close();
    }
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
