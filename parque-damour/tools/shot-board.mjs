// tools/shot-board.mjs
// Screenshots of a board page (style-board.html or music-board.html) from dist/ at the two viewports of tools/shot.mjs:
//   shots/<slice>-phone.png    390x844,  deviceScaleFactor 3
//   shots/<slice>-desktop.png  1280x800, deviceScaleFactor 2
// Dispatches the enabling pointerdown on #banner when the page has one (the Music Gate, 05 6.1 item 4) so the board itself shows.
// Exits 1 on any console error, page error, failed request or system-fallback font, as tools/shot.mjs.
// Usage: node tools/shot-board.mjs --page music-board.html --slice s1-music [--url <server url>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, 'shots');
const CHROMIUM = '/opt/pw-browsers/chromium';
const VIEWPORTS = [
  { name: 'phone', w: 390, h: 844, dpr: 3 },
  { name: 'desktop', w: 1280, h: 800, dpr: 2 },
];
const ARGS = ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--disable-dev-shm-usage', '--hide-scrollbars'];

function parseArgs(argv) {
  const out = { page: 'music-board.html', slice: 's1-music', url: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--page') out.page = argv[++i] ?? out.page;
    else if (a === '--slice') out.slice = argv[++i] ?? out.slice;
    else if (a === '--url') out.url = argv[++i] ?? '';
  }
  if (!/^[A-Za-z0-9_-]+$/.test(out.slice)) throw new Error(`bad slice name "${out.slice}"`);
  if (!/^[A-Za-z0-9_-]+\.html$/.test(out.page)) throw new Error(`bad page "${out.page}"`);
  return out;
}

async function fontsLoaded(page) {
  return page.evaluate(async () => {
    await Promise.all([document.fonts.load('12px Figtree'), document.fonts.load('12px Fraunces')]);
    await document.fonts.ready;
    return document.fonts.check('12px Figtree') && document.fonts.check('12px Fraunces');
  });
}

async function main() {
  const { page: pageName, slice, url } = parseArgs(process.argv.slice(2));
  const file = path.join(DIST, pageName);
  if (!url && !fs.existsSync(file)) throw new Error(`dist/${pageName} is missing: run npm run build first`);
  if (!fs.existsSync(CHROMIUM)) throw new Error(`Chromium not found at ${CHROMIUM}`);
  fs.mkdirSync(SHOTS, { recursive: true });
  const target = url ? `${url.replace(/\/$/, '')}/${pageName}` : pathToFileURL(file).href;
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ARGS });
  const errors = [];
  const written = [];
  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console [${vp.name}]: ${m.text()}`); });
      page.on('pageerror', (e) => errors.push(`page [${vp.name}]: ${e.message}`));
      page.on('requestfailed', (r) => errors.push(`request [${vp.name}]: ${r.url()} ${r.failure()?.errorText ?? ''}`));
      await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr });
      await page.goto(target, { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, 300));
      const hasBanner = await page.evaluate(() => {
        const b = document.getElementById('banner');
        if (!b) return false;
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        return true;
      });
      await new Promise((r) => setTimeout(r, hasBanner ? 600 : 300));
      if (!(await fontsLoaded(page))) errors.push(`fonts [${vp.name}]: Figtree or Fraunces did not load`);
      const out = path.join(SHOTS, `${slice}-${vp.name}.png`);
      await page.screenshot({ path: out });
      written.push(out);
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
