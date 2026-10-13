// tools/det.mjs
// The browser half of the determinism check (08 3.4): a fixture (tests/fixtures/<name>.json, det-s2 by default) through window.__PD in the
// pre-installed Chromium, against a DEV server (the harness is not in the production build, 03 section 13).
//   1. page 1: open <url>#s=<seed>&halt&dev, press Begin, wait for __PD, run the fixture with __PD.simulate in chunks of 2000 steps
//      (each command enqueued while the tick is one before its own), read hash, rngN and tick;
//   2. page 2: the same in a fresh page; it must give the same three numbers;
//   3. page 3: the same park run by the real loop at speed 8: the commands are queued at their ticks with __PD.replay(cmds, 0), the page is
//      left to run, and the fixture's last command (speed 0 at the final step) stops it exactly there (poll until tick() === steps and
//      T.speed === 0); its numbers must equal page 1's;
//   4. zero console errors and page errors on every page; rngN and the state hash equal to the fixture's (the Vitest values); from S8 on,
//      when __PD.audio exists, __PD.audio.log.length === 200 on page 1 (05 8.3).
// Exit code 1 on any mismatch, printing both hashes and, between pages 1 and 2, the first differing 600-step window (08 3.3).
// Usage: node tools/det.mjs [<fixture>] [--url <dev server url>] [--days <n>] [--no-real]
//   <fixture>  the fixture's name in tests/fixtures (det-s2, det-s3, ...; `.json` optional, `--fixture <name>` also works), default det-s2
//   --url      default http://localhost:5173/ (start it with `npm run dev`)
//   --days     sim days to run, default 3 (64,800 steps); fewer cuts the fixture and stops with a speed 0 at that step
//   --no-real  skip page 3 (the real-time run takes days * 360 / 8 seconds at speed 8, 135 s for 3 days)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROMIUM = '/opt/pw-browsers/chromium';
const CHROMIUM_ARGS = ['--no-sandbox', '--font-render-hinting=none', '--disable-lcd-text', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--disable-dev-shm-usage', '--hide-scrollbars'];
const STEPS_PER_DAY = 21600;
const CHUNK = 2000;
const WINDOW = 600;

function parseArgs(argv) {
  const out = { url: 'http://localhost:5173/', days: 3, real: true, fixture: 'det-s2' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i] ?? out.url;
    else if (a === '--days') out.days = parseInt(argv[++i] ?? '3', 10) || 3;
    else if (a === '--no-real') out.real = false;
    else if (a === '--fixture') out.fixture = argv[++i] ?? out.fixture;
    else if (!a.startsWith('--')) out.fixture = a;
  }
  out.fixture = out.fixture.replace(/\.json$/, '');
  if (!/^[\w-]+$/.test(out.fixture)) throw new Error(`bad fixture name ${out.fixture}`);
  return out;
}

/** The fixture cut to `steps`: later commands dropped, and a speed 0 at the last step when it was cut. */
function commandsFor(fixture, steps) {
  const cmds = fixture.commands.filter((c) => c.tick <= steps);
  if (!cmds.some((c) => c.kind === 'speed' && c.tick === steps && c.payload.speed === 0)) cmds.push({ tick: steps, side: 'park', kind: 'speed', payload: { speed: 0 } });
  return cmds;
}

async function openPage(browser, url, seed, errors, label) {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console [${label}]: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`page [${label}]: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`request [${label}]: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(`${url}#s=${seed}&halt&dev`, { waitUntil: 'load' });
  await page.waitForSelector('#begin', { visible: true, timeout: 20_000 });
  await page.click('#begin');
  await page.waitForFunction(() => typeof window.__PD !== 'undefined', { timeout: 10_000 });
  await page.evaluate((s) => {
    const pd = window.__PD;
    pd.newPark(s);
    pd.setSpeed(0);
    if (pd.audio && pd.audio.dryRun) pd.audio.dryRun(true);
  }, seed);
  return page;
}

/** Steps `from` + 1 to `to` through __PD.simulate, commands enqueued one tick ahead; every `every` steps (when set) its hash goes in `trace`. */
function chunk(page, cmds, from, to, every = 0) {
  return page.evaluate(
    (list, first, last, gap) => {
      const pd = window.__PD;
      const byTick = {};
      for (const c of list) (byTick[c.tick] ||= []).push(c);
      const trace = [];
      for (let s = first + 1; s <= last; s++) {
        for (const c of byTick[s] || []) pd.enqueue({ side: c.side, kind: c.kind, payload: c.payload });
        pd.simulate(1);
        if (gap && s % gap === 0) trace.push(pd.hash());
      }
      pd.setSpeed(0); // a speed command in the chunk would start the page's own loop between two chunks
      const audioLog = pd.audio && pd.audio.log ? pd.audio.log.length : -1; // -1: no audio harness yet (before S8)
      return { tick: pd.tick(), rngN: pd.rngN(), hash: pd.hash(), trace, audioLog };
    },
    cmds,
    from,
    to,
    every,
  );
}

async function directRun(page, cmds, steps, every = 0) {
  let r = { tick: 0, rngN: 0, hash: 0, trace: [], audioLog: -1 };
  const trace = [];
  for (let from = 0; from < steps; from += CHUNK) {
    r = await chunk(page, cmds, from, Math.min(steps, from + CHUNK), every);
    trace.push(...r.trace);
  }
  return { tick: r.tick, rngN: r.rngN, hash: r.hash, trace, audioLog: r.audioLog };
}

async function realRun(page, cmds, steps) {
  await page.evaluate((list) => {
    const pd = window.__PD;
    pd.replay(
      list.map((c, i) => ({ tick: c.tick, seq: i + 1, side: c.side, kind: c.kind, payload: c.payload })),
      0, // already past: only queue them at their own ticks
    );
    pd.setSpeed(8);
  }, cmds);
  const limitMs = (steps / (8 * 60)) * 1000 * 2.5 + 30_000;
  // the fixture's speed 0 at the last step stops the loop exactly there; a tick past it would mean the stop failed
  await page.waitForFunction((n) => window.__PD.tick() >= n && window.__PD.T.speed === 0, { timeout: limitMs, polling: 500 }, steps);
  return page.evaluate(() => ({ tick: window.__PD.tick(), rngN: window.__PD.rngN(), hash: window.__PD.hash(), speed: window.__PD.T.speed }));
}

function firstWindow(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `steps ${i * WINDOW + 1}-${(i + 1) * WINDOW}`;
  return 'none';
}

async function main() {
  const { url, days, real, fixture: name } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(CHROMIUM)) throw new Error(`Chromium not found at ${CHROMIUM}`);
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', name + '.json'), 'utf8'));
  console.log(`fixture ${name}: seed ${fixture.seed}, ${fixture.commands.length} commands`);
  const steps = days * STEPS_PER_DAY;
  const cmds = commandsFor(fixture, steps);
  const errors = [];
  const problems = [];
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: CHROMIUM_ARGS });
  try {
    const t0 = Date.now();
    const p1 = await openPage(browser, url, fixture.seed, errors, 'run 1');
    const r1 = await directRun(p1, cmds, steps, WINDOW);
    await p1.close();
    const p2 = await openPage(browser, url, fixture.seed, errors, 'run 2');
    const r2 = await directRun(p2, cmds, steps, WINDOW);
    await p2.close();
    console.log(`run 1: seed ${fixture.seed} steps ${r1.tick} rngN ${r1.rngN} hash ${r1.hash} (0x${r1.hash.toString(16)})`);
    console.log(`run 2: seed ${fixture.seed} steps ${r2.tick} rngN ${r2.rngN} hash ${r2.hash}`);
    if (r1.tick !== steps) problems.push(`run 1 stopped at tick ${r1.tick}, not ${steps}`);
    if (r1.hash !== r2.hash || r1.rngN !== r2.rngN || r1.tick !== r2.tick) problems.push(`run 1 and run 2 differ; first differing window: ${firstWindow(r1.trace, r2.trace)}`);
    if (days === 3 && r1.rngN !== fixture.expect.rngN) problems.push(`rngN ${r1.rngN} is not the fixture's ${fixture.expect.rngN} (the Vitest value)`);
    if (days === 3 && r1.hash !== fixture.expect.stateHash) problems.push(`stateHash ${r1.hash} is not the fixture's ${fixture.expect.stateHash} (the Vitest value)`);
    if (r1.audioLog >= 0 && r1.audioLog !== 200) problems.push(`__PD.audio.log.length is ${r1.audioLog}, not 200 (05 8.3)`);
    if (r1.audioLog < 0) console.log('audio: no __PD.audio yet (before S8); the audio.log check is skipped');
    if (real) {
      const p3 = await openPage(browser, url, fixture.seed, errors, 'run 3 (real loop, 8x)');
      const t3 = Date.now();
      const r3 = await realRun(p3, cmds, steps);
      await p3.close();
      console.log(`run 3 (real loop): steps ${r3.tick} rngN ${r3.rngN} hash ${r3.hash} speed ${r3.speed} in ${((Date.now() - t3) / 1000).toFixed(1)} s`);
      if (r3.tick !== steps) problems.push(`run 3 stopped at tick ${r3.tick}, not ${steps}`);
      if (r3.hash !== r1.hash || r3.rngN !== r1.rngN) problems.push(`the real-time run differs from run 1: hash ${r3.hash} vs ${r1.hash}, rngN ${r3.rngN} vs ${r1.rngN}`);
    }
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    await browser.close();
  }
  for (const e of errors) problems.push(e);
  if (problems.length) {
    for (const p of problems) console.error('FAIL', p);
    process.exit(1);
  }
  console.log(`PASS ${name}: identical hash, rngN and tick on every run; no console errors`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
