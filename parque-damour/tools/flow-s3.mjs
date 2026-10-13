// tools/flow-s3.mjs
// The by-hand check of 07 S3.7 item 6, scripted: puppeteer-core with the pre-installed Chromium on a DEV server (Vite's createServer, as
// tools/shot.mjs scenes; the __PD harness is read to check, never to act), 390 x 844, one fresh browser context (an empty localStorage).
//   1. Begin; arm the path brush; drag a stroke over six lawn tiles; the tiles turn to gravel.
//   2. Reload (pagehide autosaves); the intro offers Continue; tap Continue: the path is there, no toast shows (Continue is silent,
//      03 11), and Undo is disabled (the undo history is not saved, owner 2026-10-13).
//   3. Pause with the rail's button; arm the lamp; tap a lawn tile: nothing appears while paused (03 4.6: the command waits); unpause:
//      the lamp appears.
//   4. Tap New: the confirm appears; Yes: a fresh park (the stroke's tiles are not the restored park's), the #s= hash changes, the park
//      key is gone and the profile counts one more park; Undo is disabled.
//   5. Reload: Continue is offered again (the new park autosaved on pagehide); Begin asks the New confirm first; No keeps the intro.
// Every action is a real tap or click (puppeteer's mouse at __PD.screenOf of a tile, or the DOM control). Exits 1 on any failed check,
// console error, page error or failed request.
// Usage: node tools/flow-s3.mjs [--url <dev server url>]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROMIUM = '/opt/pw-browsers/chromium';
const SEED = 101;
const GRAVEL = 1; // world/grid.ts Kind.gravel
const STROKE = { y: 33, x0: 23, x1: 28 }; // open lawn on seed 101, south of the inner loop, on screen at the start view
const LAMP_AT = { x: 32, y: 34 }; // open lawn on seed 101, away from the stroke
const ARGS = ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text', '--use-gl=swiftshader', '--disable-dev-shm-usage', '--hide-scrollbars'];

const errors = [];
const passed = [];
function check(ok, what) {
  if (ok) passed.push(what);
  else errors.push('FAIL: ' + what);
  console.log((ok ? 'ok   ' : 'FAIL ') + what);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function introReady(page) {
  await page.waitForSelector('#begin', { visible: true, timeout: 30_000 });
  await page.waitForFunction(() => document.getElementById('iP').children.length > 0, { timeout: 60_000 }); // the intro script ran
}
async function painted(page) {
  await page.waitForSelector('#intro', { hidden: true, timeout: 10_000 });
  await page.waitForFunction(() => !!document.body.dataset.day && typeof window.__PD !== 'undefined', { timeout: 10_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
}
async function screenOfTile(page, x, y) {
  return page.evaluate((tx, ty) => window.__PD.screenOf(tx, ty), x, y);
}
/** The stroke's tiles that are gravel now. */
async function gravelOnStroke(page) {
  return page.evaluate(
    (s, g) => {
      const K = window.__PD.layers.KIND;
      const out = [];
      for (let x = s.x0; x <= s.x1; x++) if (K[s.y * 48 + x] === g) out.push(x);
      return out;
    },
    STROKE,
    GRAVEL,
  );
}
async function occAt(page, t) {
  return page.evaluate((x, y) => window.__PD.layers.OCC[y * 48 + x], t.x, t.y);
}

async function run(base) {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ARGS });
  const ctx = await browser.createBrowserContext();
  try {
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push('console: ' + m.text());
    });
    page.on('pageerror', (e) => errors.push('page: ' + e.message));
    page.on('requestfailed', (r) => errors.push(`request: ${r.url()} ${r.failure()?.errorText ?? ''}`));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

    // 1. Begin and paint a path
    await page.goto(`${base}#s=${SEED}&dev`, { waitUntil: 'load' });
    await introReady(page);
    check(await page.$eval('#bContinue', (b) => b.hidden), 'a fresh profile: the intro offers no Continue');
    await page.click('#begin');
    await painted(page);
    const before = await gravelOnStroke(page);
    await page.click('.tool[data-id="path"]');
    const from = await screenOfTile(page, STROKE.x0, STROKE.y), to = await screenOfTile(page, STROKE.x1, STROKE.y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let k = 1; k <= 16; k++) {
      await sleep(70);
      await page.mouse.move(from.x + ((to.x - from.x) * k) / 16, from.y + ((to.y - from.y) * k) / 16);
    }
    await page.mouse.up();
    await page.waitForFunction((n) => window.__PD.log().length >= n, { timeout: 5_000 }, 1);
    await sleep(300);
    const painted1 = await gravelOnStroke(page);
    check(before.length === 0 && painted1.length >= 4, `the stroke painted gravel on lawn (${painted1.length} of ${STROKE.x1 - STROKE.x0 + 1} tiles)`);
    check(!(await page.$eval('#bUndo', (b) => b.disabled)), 'Undo is enabled after the stroke');
    const seed1 = await page.evaluate(() => /s=(\d+)/.exec(location.hash)?.[1]);

    // 2. Reload, Continue
    await page.reload({ waitUntil: 'load' });
    await introReady(page);
    check(!(await page.$eval('#bContinue', (b) => b.hidden)), 'after the reload the intro offers Continue');
    await page.evaluate(() => {
      window.pdToasts = 0;
      const h = document.getElementById('hint');
      new MutationObserver(() => {
        if (h.classList.contains('on')) window.pdToasts++;
      }).observe(h, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
    });
    await page.click('#bContinue');
    await painted(page);
    await sleep(1200);
    const painted2 = await gravelOnStroke(page);
    check(JSON.stringify(painted2) === JSON.stringify(painted1), `Continue: the path is there (${painted2.length} gravel tiles on the stroke)`);
    const toasts = await page.evaluate(() => window.pdToasts);
    const hintOn = await page.$eval('#hint', (h) => h.classList.contains('on'));
    check(toasts === 0 && !hintOn, `Continue is silent: ${toasts} toasts`);
    check(await page.$eval('#bUndo', (b) => b.disabled), 'Undo is disabled after the reload (the undo history is not saved)');
    check((await page.evaluate(() => /s=(\d+)/.exec(location.hash)?.[1])) === seed1, 'Continue keeps the park seed in the hash');

    // 3. A stamp while paused waits for the unpause (03 4.6; owner 2026-10-13)
    await page.click('#bHalt');
    await page.waitForFunction(() => window.__PD.T.speed === 0, { timeout: 5_000 });
    const props0 = await page.evaluate(() => window.__PD.props.length);
    await page.click('.tool[data-id="lamp"]');
    const l = await screenOfTile(page, LAMP_AT.x, LAMP_AT.y);
    await page.mouse.click(l.x, l.y);
    await sleep(600);
    check((await occAt(page, LAMP_AT)) === 0 && (await page.evaluate(() => window.__PD.props.length)) === props0, 'paused: the lamp has not appeared');
    await page.click('#bHalt');
    await page.waitForFunction((x, y) => window.__PD.layers.OCC[y * 48 + x] !== 0, { timeout: 5_000 }, LAMP_AT.x, LAMP_AT.y).catch(() => {});
    const occ = await occAt(page, LAMP_AT);
    const kind = await page.evaluate((id) => window.__PD.props.find((p) => p.id === id)?.kind, occ);
    check(occ !== 0 && kind === 'lamp', 'unpaused: the lamp appears');

    // 4. New: the confirm, Yes, a fresh park and a new hash
    const world0 = await page.evaluate(() => window.__PD.worldHash());
    const parks0 = await page.evaluate(() => JSON.parse(localStorage.getItem('parque:profile-v1') || '{}').parksPlayed ?? 0);
    await page.click('#bNew');
    await page.waitForFunction(() => !document.getElementById('confirm').hidden, { timeout: 5_000 });
    check(await page.evaluate(() => document.activeElement?.id === 'confirmYes'), 'New: the confirm appears with focus on Yes');
    await page.click('#confirmYes');
    await page.waitForFunction((s) => /s=(\d+)/.exec(location.hash)?.[1] !== s, { timeout: 5_000 }, seed1).catch(() => {});
    const seed2 = await page.evaluate(() => /s=(\d+)/.exec(location.hash)?.[1]);
    check(!!seed2 && seed2 !== seed1, `Yes: the hash names a new seed (#s=${seed1} to #s=${seed2})`);
    check(await page.$eval('#confirm', (c) => c.hidden), 'Yes closes the confirm');
    const fresh = await page.evaluate(() => ({ tick: window.__PD.tick(), world: window.__PD.worldHash() }));
    check(fresh.tick < 600 && fresh.world !== world0, `a fresh park: tick ${fresh.tick}, another world`);
    check(await page.evaluate(() => localStorage.getItem('parque:park-v1') === null), 'New clears the park key');
    const parks1 = await page.evaluate(() => JSON.parse(localStorage.getItem('parque:profile-v1') || '{}').parksPlayed ?? 0);
    check(parks1 === parks0 + 1, `the profile counts one more park (${parks0} to ${parks1})`);
    check(await page.$eval('#bUndo', (b) => b.disabled), 'Undo is disabled in the new park');

    // 5. Reload: Continue again, and Begin asks first
    await page.reload({ waitUntil: 'load' });
    await introReady(page);
    check(!(await page.$eval('#bContinue', (b) => b.hidden)), 'the new park was autosaved on pagehide: Continue is offered');
    await page.click('#begin');
    await page.waitForFunction(() => !document.getElementById('confirm').hidden, { timeout: 5_000 }).catch(() => {});
    check(await page.$eval('#confirm', (c) => !c.hidden), 'Begin with a saved park asks the New confirm');
    await page.click('#confirmNo');
    await sleep(300);
    check(await page.$eval('#intro', (i) => !i.classList.contains('gone')), 'No keeps the intro');
  } finally {
    await browser.close();
  }
}

async function main() {
  const i = process.argv.indexOf('--url');
  let base = i >= 0 ? process.argv[i + 1] : '';
  let server = null;
  if (!base) {
    const { createServer } = await import('vite');
    server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5198, strictPort: false } });
    await server.listen();
    base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5198/';
  }
  try {
    await run(base.replace(/\/?$/, '/'));
  } finally {
    if (server) await server.close();
  }
  console.log(`${passed.length} checks passed, ${errors.length} problems`);
  if (errors.length) {
    for (const e of errors) console.error(e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
