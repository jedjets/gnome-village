// tests/peak.test.ts
// 05 8.2 item 6 and 07 S8.7 item 2 (optional; run once and the value recorded): the game in the pre-installed Chromium through puppeteer-core with
// --autoplay-policy=no-user-gesture-required, on a Vite dev server (the harness __PD is the dev build's). An AnalyserNode is hung on the
// compressor output (the last node before the speaker) by wrapping AudioContext before the page's own script runs, so nothing in src/ is touched.
// Nobody can hear here, so this measures what a speaker would be given:
//   1. over 20 s of the Sound check at 8x (motif B rising, then C rising, every cue, burst and bird button pressed in turn) the compressor output
//      peaks at or below -6 dBFS (05 8.2 item 6; 05 7.2 item 2);
//   2. the real switch (05 8.1 items 1 and 11 as far as a machine can check them): the game starts C after Begin; with the clock held at f 0.79 and
//      then put to 0.81 the conductor switches to B at C's next phrase start, the output never goes quiet across the 2 s crossfade (the loudest
//      400 ms window from T - 1 s to T + 4 s stays above 0.0005, -66 dBFS), and the switch log shows the 2 s linear ramps.
// It needs `npm run build` for nothing (it serves the sources) but it takes about a minute and a Chromium, so it is off in `npm test`: run it with
//   PEAK_RUN=1 npx vitest run tests/peak.test.ts
// and the peak, the window levels and the switch log are printed. (A skipped suite is not a weakened test: the environment variable is the gate.)
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { createServer, type ViteDevServer } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROMIUM = '/opt/pw-browsers/chromium';
const RUN = process.env.PEAK_RUN === '1' && fs.existsSync(CHROMIUM);
const ARGS = ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--hide-scrollbars'];
const dbfs = (x: number): number => +(20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Wrap AudioContext so the compressor output is tapped: window.tapProbe = { peak, series: [[ctxTime, rms, peak], ...] }, sampled every 25 ms. */
const TAP = (): void => {
  const w = window as unknown as Record<string, unknown>;
  const Base = (w.AudioContext || w.webkitAudioContext) as typeof AudioContext;
  const tap = { peak: 0, series: [] as number[][], ctx: null as AudioContext | null };
  w.tapProbe = tap;
  w.AudioContext = class extends Base {
    constructor(...a: ConstructorParameters<typeof AudioContext>) {
      super(...a);
      tap.ctx = this;
      const make = this.createDynamicsCompressor.bind(this);
      this.createDynamicsCompressor = (): DynamicsCompressorNode => {
        const c = make();
        const an = this.createAnalyser();
        an.fftSize = 2048;
        c.connect(an);
        const buf = new Float32Array(an.fftSize);
        setInterval(() => {
          an.getFloatTimeDomainData(buf);
          let s = 0, pk = 0;
          for (const v of buf) {
            s += v * v;
            pk = Math.max(pk, Math.abs(v));
          }
          tap.peak = Math.max(tap.peak, pk);
          tap.series.push([this.currentTime, Math.sqrt(s / buf.length), pk]);
        }, 25);
        return c;
      };
    }
  };
};

async function startGame(browser: Browser, base: string, errors: string[]): Promise<Page> {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`page: ${String(e)}`));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(TAP);
  await page.goto(`${base}#s=101&dev`, { waitUntil: 'load' });
  await page.waitForSelector('#begin', { visible: true, timeout: 20_000 });
  await page.click('#begin');
  await page.waitForSelector('#intro', { hidden: true, timeout: 5_000 });
  await page.waitForFunction(() => typeof (window as unknown as { __PD?: unknown }).__PD !== 'undefined', { timeout: 10_000 });
  return page;
}
async function openSoundCheck(page: Page): Promise<void> {
  await page.click('#bOptions');
  await page.waitForFunction(() => document.getElementById('options')?.classList.contains('on'), { timeout: 5_000 });
  await page.click('#optionsList [data-k="soundcheck"]');
  await page.waitForFunction(() => document.querySelectorAll('#sndRow button').length > 50, { timeout: 5_000 });
}

describe.skipIf(!RUN)('the compressor output of the real game in Chromium (05 8.2 item 6; 07 S8.7 item 2)', () => {
  it('20 s of the Sound check at 8x peaks at or below -6 dBFS at the speaker, and the C to B switch never goes quiet', async () => {
    const server: ViteDevServer = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5198, strictPort: false } });
    await server.listen();
    const base = (server.resolvedUrls?.local?.[0] ?? 'http://localhost:5198/').replace(/\/?$/, '/');
    const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ARGS });
    const errors: string[] = [];
    try {
      // 1. the Sound check at 8x
      const page = await startGame(browser, base, errors);
      await page.evaluate(() => (window as unknown as { __PD: { setSpeed(n: number): void } }).__PD.setSpeed(8));
      await openSoundCheck(page);
      const keys: string[] = await page.$$eval('#sndRow button', (bs) => bs.map((b) => (b as HTMLElement).dataset.k ?? ''));
      expect(keys.length).toBeGreaterThanOrEqual(59);
      await page.click('#sndRow [data-k="mus:B:rising"]');
      const started = Date.now();
      let i = 0;
      let c = false;
      while (Date.now() - started < 20_000) {
        if (!c && Date.now() - started > 8_000) {
          c = true;
          await page.click('#sndRow [data-k="mus:C:rising"]'); // the second bed, 8 s in
        }
        const k = keys[i++ % keys.length] as string;
        if (k && k !== 'mus:stop') await page.click(`#sndRow [data-k="${k}"]`);
        await sleep(240);
      }
      const peak = await page.evaluate(() => (window as unknown as { tapProbe: { peak: number } }).tapProbe.peak);
      process.stdout.write(`\npeak.test: compressor output peak over 20 s of the Sound check at 8x: ${peak.toFixed(4)} = ${dbfs(peak)} dBFS (limit -6 dBFS)\n`);
      expect(peak).toBeGreaterThan(0.01); // it sounded
      expect(peak).toBeLessThanOrEqual(0.5);
      await page.browserContext().close();

      // 2. the real switch
      const g = await startGame(browser, base, errors);
      type Row = { t: number; kind: string; motif: string; other?: string; target?: string; from?: number; to?: number; t1?: number };
      type PD = { setSpeed(n: number): void; T: { f: number }; audio: { music: { state(): string; log(): Row[] } } };
      const state = (): Promise<string> => g.evaluate(() => (window as unknown as { __PD: PD }).__PD.audio.music.state());
      const setF = (f: number): Promise<void> => g.evaluate((v) => { (window as unknown as { __PD: PD }).__PD.T.f = v; }, f);
      await g.evaluate(() => (window as unknown as { __PD: PD }).__PD.setSpeed(0)); // paused: the clock holds what we set
      await g.waitForFunction(() => (window as unknown as { __PD: PD }).__PD.audio.music.state().startsWith('C '), { timeout: 15_000 });
      process.stdout.write(`\npeak.test: after Begin the game says "${await state()}"\n`);
      await sleep(5000); // C plays; the fade-in is 4 s
      await setF(0.79);
      await sleep(5000);
      expect(await state()).toMatch(/^C /); // still C at 0.79
      await setF(0.81);
      await g.waitForFunction(() => (window as unknown as { __PD: PD }).__PD.audio.music.log().some((r) => r.kind === 'halt'), { timeout: 30_000 });
      const rows: Row[] = await g.evaluate(() => (window as unknown as { __PD: PD }).__PD.audio.music.log().filter((r) => r.kind === 'switch' || r.kind === 'ramp' || r.kind === 'halt'));
      const sw = rows.find((r) => r.kind === 'switch') as Row;
      process.stdout.write(`peak.test: switch log ${JSON.stringify(rows)}\n`);
      expect([sw.motif, sw.other]).toEqual(['C', 'B']);
      const ramps = rows.filter((r) => r.kind === 'ramp');
      expect(ramps.map((r) => [r.target, r.motif, r.from, r.to, +((r.t1 as number) - r.t).toFixed(6)])).toEqual([['gain', 'B', 0, 1, 2], ['gain', 'C', 1, 0, 2], ['room', 'B', 0.3, 0.45, 2]]);
      expect(await state()).toMatch(/^B /);
      // the output across the crossfade: in every sliding 400 ms window from T - 1 s to T + 4 s take the loudest rms; the quietest of those must not be silence
      const series: number[][] = await g.evaluate(() => (window as unknown as { tapProbe: { series: number[][] } }).tapProbe.series);
      const win = series.filter(([t]) => (t as number) >= sw.t - 1 && (t as number) <= sw.t + 4);
      let quietest = Infinity;
      for (const [from] of win) {
        if ((from as number) + 0.4 > sw.t + 4) break;
        const inWin = win.filter(([t]) => (t as number) >= (from as number) && (t as number) <= (from as number) + 0.4);
        quietest = Math.min(quietest, Math.max(...inWin.map((r) => r[1] as number)));
      }
      const loudest = Math.max(...win.map((r) => r[2] as number));
      process.stdout.write(`peak.test: across T-1..T+4 (${win.length} samples) the quietest 400 ms window (its loudest rms) is ${quietest.toFixed(4)} (${dbfs(quietest)} dBFS), the peak is ${loudest.toFixed(4)} (${dbfs(loudest)} dBFS)\n`);
      expect(win.length).toBeGreaterThan(40); // the page's timer runs at about 17 Hz in headless Chromium
      expect(quietest).toBeGreaterThan(0.0005);
      expect(loudest).toBeLessThanOrEqual(0.5);
      await g.browserContext().close();
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await server.close();
    }
  }, 240_000);
});
