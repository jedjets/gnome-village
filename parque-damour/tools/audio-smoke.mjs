// tools/audio-smoke.mjs
// Automated sound verification for music-board.html (05 6.5 item 4, 8.2 item 6): puppeteer cannot hear, so it measures.
// Serves dist/ over HTTP, opens music-board.html#debug in the pre-installed Chromium with autoplay allowed, dispatches the
// enabling pointerdown, then for each of the six Play buttons: click, wait 2.5 s, sample globalThis['__PDAUDIO'].rms() eight times and
// require the loudest sample above RMS_ON and the peak above PEAK_ON; click Stop and require rms() below 0.002 within 0.5 s.
// S8 part B (07 S8.6 step 12): B and C on the board are the game's own (src/audio/music.ts) and A the retired waltz (src/debug/motifs.ts).
// B rising and C rising must each peak between -22 and -18 dBFS at master (05 5.5 item 5, 7.2 item 3; MUSIC_MAKEUP and TINE_MAKEUP in
// src/audio/music.ts) and within 2 dB of each other, and with the cue bed (each cue-bed button once) over B rising and over C rising the
// compressor output must stay under -10 dBFS and master under -6 dBFS. Each cue must raise the cue bus.
// Exits 1 on any failed assertion, console error, page error or failed request.
// Usage: npm run audio-smoke [-- --keep]   (--keep leaves the browser's server up for 60 s after the run)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CHROMIUM = '/opt/pw-browsers/chromium';
const PAGE = 'music-board.html';
// Presence while playing. Rising variants: the mean of the rms samples above RMS_MEAN_ON (the brief's 0.01). Parted variants are
// sparse by design (one beat of the left hand, density 0.5, 05 5.6), so a 170 ms rms window regularly lands in a rest and the mean is
// not a presence test for them: they must reach PEAK_ON at master and RMS_ON in their loudest sample instead.
const RMS_MEAN_ON = 0.01; // rising: mean rms over the samples
const RMS_ON = 0.004; // parted: the loudest rms sample (the silence criterion is 0.002)
const PEAK_ON = 0.008; // parted: the time-domain peak at master (-42 dBFS; silence peaks under 0.0002)
const PEAK_LO = Math.pow(10, -22 / 20), PEAK_HI = Math.pow(10, -18 / 20); // 0.079 .. 0.126: B rising and C rising at master
const PEAK_APART_DB = 2; // B rising and C rising within this many dB of each other
const OUT_MAX = Math.pow(10, -10 / 20); // 0.316 at the compressor output
const RMS_OFF = 0.002; // rms falls under this within STOP_MS after Stop
const SAMPLES = 8; // rms samples, 250 ms apart: two seconds, more than a bar of the slowest variant
const STOP_MS = 500;
const PEAK_MAX = 0.5; // -6 dBFS at master
const CUE_RISE = 0.0015; // the cue bus must rise at least this far above its baseline
const MOTIFS = ['A', 'B', 'C'];
const VARIANTS = ['rising', 'parted'];
const CUES = ['laugh', 'kiss', 'gasp', 'fireworks', 'splat'];
const ARGS = ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--hide-scrollbars'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbfs = (x) => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1);

function serve(dir) {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const file = path.join(dir, path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

async function main() {
  const keep = process.argv.includes('--keep');
  if (!fs.existsSync(path.join(DIST, PAGE))) throw new Error(`dist/${PAGE} is missing: run npm run build first`);
  if (!fs.existsSync(CHROMIUM)) throw new Error(`Chromium not found at ${CHROMIUM}`);
  const srv = await serve(DIST);
  const port = srv.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ARGS });
  const errors = [];
  const fails = [];
  const rows = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); };
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
    page.on('requestfailed', (r) => errors.push(`request: ${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`response ${r.status()}: ${r.url()}`); });
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/${PAGE}#debug`, { waitUntil: 'load' });
    await page.waitForSelector('#banner', { timeout: 10_000 });
    await page.evaluate(() => document.getElementById('banner').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await page.waitForFunction(() => globalThis['__PDAUDIO'] && globalThis['__PDAUDIO'].state().ctx === 'running', { timeout: 5000 });
    const st = await page.evaluate(() => globalThis['__PDAUDIO'].state());
    console.log('context', st.ctx, 'audioOn', st.on);
    const rms = () => page.evaluate(() => globalThis['__PDAUDIO'].rms());
    const cueRms = () => page.evaluate(() => globalThis['__PDAUDIO'].cueRms());
    const peakHold = () => page.evaluate(() => globalThis['__PDAUDIO'].peakHold());
    const resetPeak = () => page.evaluate(() => globalThis['__PDAUDIO'].resetPeak());

    // silence before anything plays
    await sleep(300);
    const quiet = await rms();
    check(quiet < RMS_OFF, `silence before play: rms ${quiet.toFixed(5)} >= ${RMS_OFF}`);

    for (const m of MOTIFS) {
      for (const v of VARIANTS) {
        await resetPeak();
        await page.click(`#play-${m}-${v}`);
        await sleep(2500);
        const samples = [];
        for (let i = 0; i < SAMPLES; i++) {
          samples.push(await rms());
          await sleep(250);
        }
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        const peak = await peakHold();
        const music = await page.evaluate(() => globalThis['__PDAUDIO'].state());
        if (v === 'rising') check(mean > RMS_MEAN_ON, `${m} ${v}: mean rms ${mean.toFixed(5)} <= ${RMS_MEAN_ON}`);
        else {
          check(Math.max(...samples) > RMS_ON, `${m} ${v}: loudest rms sample ${Math.max(...samples).toFixed(5)} <= ${RMS_ON}`);
          check(peak > PEAK_ON, `${m} ${v}: peak ${peak.toFixed(4)} <= ${PEAK_ON}`);
        }
        if (v === 'rising' && m !== 'A') {
          check(peak >= PEAK_LO && peak <= PEAK_HI, `${m} rising: master peak ${peak.toFixed(4)} (${dbfs(peak)} dBFS) outside -22..-18 dBFS`);
        }
        check(peak < PEAK_MAX, `${m} ${v}: peak ${peak.toFixed(3)} >= ${PEAK_MAX} (-6 dBFS)`);
        check(music.playing[m] === v, `${m} ${v}: board reports playing=${JSON.stringify(music.playing)}`);
        await page.click(`#stop-${m}`);
        const t0 = Date.now();
        let after = Infinity, ms = 0;
        while (Date.now() - t0 < STOP_MS + 60) {
          await sleep(50);
          after = await rms();
          ms = Date.now() - t0;
          if (after < RMS_OFF) break;
        }
        check(after < RMS_OFF, `${m} ${v}: rms ${after.toFixed(5)} still >= ${RMS_OFF} ${ms} ms after Stop`);
        rows.push({ motif: m, variant: v, meanRms: +mean.toFixed(4), rmsDbfs: dbfs(mean), minRms: +Math.min(...samples).toFixed(4), maxRms: +Math.max(...samples).toFixed(4), peak: +peak.toFixed(3), peakDbfs: dbfs(peak), stopMs: ms, stopRms: +after.toFixed(5), state: m === 'A' ? `${music.waltz.state} ${music.waltz.tempo}bpm ${music.waltz.key}` : `${music.music.state} ${music.music.tempo}bpm` });
        await sleep(400);
      }
    }

    // the cue bed over playing music (B rising, then C rising): a transient on the cue bus for every cue, master under -6 dBFS and the
    // compressor output under -10 dBFS (05 7.2 items 2 and 3)
    const cueRows = [];
    const bed = {};
    for (const m of ['B', 'C']) {
      await page.click('#stopAll');
      await sleep(STOP_MS + 600);
      await resetPeak();
      await page.click(`#play-${m}-rising`);
      await sleep(1800);
      for (const id of CUES) {
        const base = [];
        for (let i = 0; i < 3; i++) { base.push(await rms()); await sleep(60); }
        const baseMean = base.reduce((a, b) => a + b, 0) / base.length;
        const cueBase = await cueRms();
        await page.click(`#cue-${id}`);
        let cueMax = 0, masterMin = Infinity;
        const t0 = Date.now();
        while (Date.now() - t0 < 450) {
          await sleep(40);
          cueMax = Math.max(cueMax, await cueRms());
          masterMin = Math.min(masterMin, await rms());
        }
        check(cueMax - cueBase > CUE_RISE, `${m} + cue ${id}: cue bus rose only ${(cueMax - cueBase).toFixed(5)} (< ${CUE_RISE})`);
        cueRows.push({ over: m + ' rising', cue: id, cueBase: +cueBase.toFixed(5), cueMax: +cueMax.toFixed(4), masterBefore: +baseMean.toFixed(4), masterMinDuring: +masterMin.toFixed(4), duckDb: +(20 * Math.log10(Math.max(1e-6, masterMin) / Math.max(1e-6, baseMean))).toFixed(1) });
        await sleep(1300);
      }
      const peakAll = await peakHold();
      const outPeak = await page.evaluate(() => globalThis['__PDAUDIO'].outPeakHold());
      bed[m] = { peakAll, outPeak };
      check(peakAll < PEAK_MAX, `cue bed over ${m} rising: peak ${peakAll.toFixed(3)} >= ${PEAK_MAX}`);
      check(outPeak < OUT_MAX, `cue bed over ${m} rising: compressor output peak ${outPeak.toFixed(3)} (${dbfs(outPeak)} dBFS) >= -10 dBFS`);
    }

    // a knob must change its motif audibly (05 6.5 item 4): level 0.8 against 0.2 on the playing C
    const setKnob = (motif, knob, value) => page.evaluate((m, k, v) => {
      const input = document.querySelector(`#panel-${m} input[aria-label="${k}"]`);
      input.value = String(v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, motif, knob, value);
    const loudest = async (ms) => {
      let mx = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { await sleep(100); mx = Math.max(mx, await rms()); }
      return mx;
    };
    await setKnob('C', 'level', 0.8);
    await sleep(400);
    const loud = await loudest(1500);
    await setKnob('C', 'level', 0.2);
    await sleep(400);
    const soft = await loudest(1500);
    await setKnob('C', 'level', 0.5);
    check(loud > soft * 2, `level knob: rms at 0.8 (${loud.toFixed(4)}) is not clearly above rms at 0.2 (${soft.toFixed(4)})`);
    for (const m of MOTIFS) {
      const readout = await page.evaluate((id) => JSON.parse(document.getElementById(`readout-${id}`).textContent), m);
      check(readout.knobs && readout.knobs.level === 0.5 && Object.keys(readout.knobs).length === 9, `readout-${m} does not parse to the nine knob values: ${JSON.stringify(readout.knobs)}`);
    }
    console.log('level knob on C: rms at 0.8 =', loud.toFixed(4), ' at 0.2 =', soft.toFixed(4), ' the three readouts parse');
    await sleep(2500); // let the cue reverb tails die before the silence test
    await page.click('#stopAll');
    await sleep(STOP_MS);
    const end = await rms();
    check(end < RMS_OFF, `Stop all: rms ${end.toFixed(5)} >= ${RMS_OFF} after ${STOP_MS} ms`);

    console.table(rows);
    console.table(cueRows);
    const byMotif = Object.fromEntries(rows.map((r) => [r.motif + ' ' + r.variant, r.peak]));
    const apart = 20 * Math.log10(byMotif['B rising'] / byMotif['C rising']);
    console.log('B rising peak at master:', byMotif['B rising'], `(${dbfs(byMotif['B rising'])} dBFS)`, ' C rising:', byMotif['C rising'], `(${dbfs(byMotif['C rising'])} dBFS)`, ' B minus C:', apart.toFixed(1), 'dB (limit', PEAK_APART_DB, ')');
    for (const m of ['B', 'C']) {
      console.log(`cue bed over ${m} rising: master peak`, bed[m].peakAll.toFixed(3), `(${dbfs(bed[m].peakAll)} dBFS, limit -6), compressor output peak`, bed[m].outPeak.toFixed(3), `(${dbfs(bed[m].outPeak)} dBFS, limit -10)`);
    }
    check(Math.abs(apart) <= PEAK_APART_DB, `B rising and C rising peaks are ${apart.toFixed(1)} dB apart (limit ${PEAK_APART_DB})`);
    if (keep) await sleep(60_000);
  } finally {
    await browser.close();
    srv.close();
  }
  for (const e of errors) console.error(e);
  for (const f of fails) console.error('FAIL', f);
  if (errors.length || fails.length) process.exit(1);
  console.log('audio-smoke: all checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
