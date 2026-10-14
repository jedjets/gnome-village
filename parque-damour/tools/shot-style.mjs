// tools/shot-style.mjs
// Screenshots of the Style Gate board (07 S1.6 step 7): opens dist/style-board.html from file:// (or --url <server url>) in the
// pre-installed Chromium through puppeteer-core and writes
//   shots/s1-style-A.png, s1-style-B.png, s1-style-C.png   the phone view (390x844, deviceScaleFactor 3) switched to each direction,
//                                                           captured as the full page so every tile of the direction is in the file
//   shots/s1-style-all.png                                  the desktop view (1280x800, deviceScaleFactor 2), three columns, full page
// With --tiles it also writes one crop per tile into scratch/board/<dir>-<n>.png (never committed) for a close look.
// Exits 1 on any console error, page error, failed request, horizontal scroll or system-fallback font (08 4.1 item 5).
// (tools/shot-board.mjs is the generic board shot of S1b; this one knows the A | B | C switch.)
// Usage: npm run shot:style [-- --url <url>] [--tiles]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, 'shots');
const SCRATCH = path.join(ROOT, 'scratch', 'board');
const CHROMIUM = '/opt/pw-browsers/chromium';
const DIRS = ['A', 'B', 'C'];
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--use-gl=swiftshader',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
];

function parseArgs(argv) {
  const out = { url: '', tiles: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i] ?? '';
    else if (a === '--tiles') out.tiles = true;
  }
  return out;
}

/** True when both bundled families answer, so no shot is taken with a system fallback (08 4.1 item 5). */
async function fontsLoaded(page) {
  return page.evaluate(async () => {
    await Promise.all([document.fonts.load('12px Figtree'), document.fonts.load('12px Fraunces')]);
    await document.fonts.ready;
    return document.fonts.check('12px Figtree') && document.fonts.check('12px Fraunces');
  });
}

function watch(page, errors, name) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console [${name}]: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`page [${name}]: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`request [${name}]: ${r.url()} ${r.failure()?.errorText ?? ''}`));
}

async function main() {
  const { url, tiles } = parseArgs(process.argv.slice(2));
  const file = path.join(DIST, 'style-board.html');
  if (!url && !fs.existsSync(file)) throw new Error('dist/style-board.html is missing: run npm run build first');
  if (!fs.existsSync(CHROMIUM)) throw new Error(`Chromium not found at ${CHROMIUM}`);
  fs.mkdirSync(SHOTS, { recursive: true });
  if (tiles) fs.mkdirSync(SCRATCH, { recursive: true });
  const target = url || pathToFileURL(file).href;
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: CHROMIUM_ARGS });
  const errors = [];
  const written = [];
  try {
    // the phone view, one full-page capture per direction
    const phone = await browser.newPage();
    watch(phone, errors, 'phone');
    await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 3 });
    await phone.goto(target, { waitUntil: 'load' });
    await phone.waitForSelector('#switch .gb', { visible: true, timeout: 15_000 });
    if (!(await fontsLoaded(phone))) errors.push('fonts [phone]: Figtree or Fraunces did not load; a fallback-font shot is invalid');
    for (const dir of DIRS) {
      await phone.click(`#switch .gb[data-dir="${dir}"]`);
      await phone.waitForFunction((d) => document.body.dataset.dir === d, { timeout: 5_000 }, dir);
      // the click may scroll the sticky header's page; a full-page capture wants the header at the top
      await phone.evaluate(() => window.scrollTo(0, 0));
      await new Promise((r) => setTimeout(r, 300));
      const wide = await phone.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      if (wide) errors.push(`layout [phone ${dir}]: the page scrolls horizontally`);
      const out = path.join(SHOTS, `s1-style-${dir}.png`);
      await phone.screenshot({ path: out, fullPage: true });
      written.push(out);
      if (tiles) {
        const handles = await phone.$$(`.tile[data-dir="${dir}"]`);
        for (const h of handles) {
          const n = await h.evaluate((e) => e.dataset.n);
          const crop = path.join(SCRATCH, `${dir}-${n}.png`);
          await h.screenshot({ path: crop });
          written.push(crop);
        }
      }
    }
    await phone.close();
    // the desktop view, three columns, full page
    const desk = await browser.newPage();
    watch(desk, errors, 'desktop');
    await desk.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await desk.goto(target, { waitUntil: 'load' });
    await desk.waitForSelector('.colhead h2', { visible: true, timeout: 15_000 });
    if (!(await fontsLoaded(desk))) errors.push('fonts [desktop]: Figtree or Fraunces did not load; a fallback-font shot is invalid');
    await new Promise((r) => setTimeout(r, 300));
    const out = path.join(SHOTS, 's1-style-all.png');
    await desk.screenshot({ path: out, fullPage: true });
    written.push(out);
    await desk.close();
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
