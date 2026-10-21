// tools/shot-s8.mjs
// The 's8' scene set of tools/shot.mjs (07 S8.6 step 11, S8.7 item 6; 05 2.6): the dev Sound check sheet, opened by real clicks (Options, then
// its Sound check row, under the dev flag of the scene runner's #s=..&dev), and the log of the harness (05 8.3) read after every cue button
// has been pressed once in the real browser context. Nothing can be heard here: the page measures what it can (the sheet's buttons, the
// decisions the engine logged), and the owner listens.
//   soundcheck     the sheet at its top: the 38 cue ids in table order, then the two recipes each of kiss and splat
//   soundcheck-2   the same sheet scrolled to its end: the ambience bursts, the six bird voices and the five music buttons
//   soundcheck-3   every cue button pressed once with a real click: the harness log holds all 38 as played, the context is running
export const S8_SCENES = [
  { name: 'soundcheck', turn: 0, z: 1.3, act: 's8SoundCheck' },
  { name: 'soundcheck-2', keep: true, act: 's8SoundCheckEnd' },
  { name: 'soundcheck-3', keep: true, act: 's8PressAll' },
];

const CUES = [
  'step_gravel', 'step_lawn', 'bench_creak', 'murmur', 'laugh', 'sigh', 'gasp', 'kiss', 'ring', 'happily',
  'parted', 'bouquet', 'coo', 'flutter', 'splat', 'yap', 'snatch', 'wasp', 'sprinkler', 'slip',
  'mime', 'rival_hmm', 'foghorn', 'fireworks', 'clink', 'bell_bike', 'gate_hinge', 'fountain', 'plip', 'hush',
  'lamp_hum', 'petals', 'sunbeam', 'ready', 'unlock', 'ui_tap', 'place', 'refuse',
];
const ALTS = ['kiss A', 'kiss B', 'splat A', 'splat B'];
const BURSTS = ['fountain ×6', 'rain ×10', 'crickets', 'owl', 'bells', 'boulevard'];
const BIRDS = ['robin', 'warbler', 'thrush', 'chiffchaff', 'blackbird', 'wren'];
const MUSIC = ['B rising', 'B parted', 'C rising', 'C parted'];

/** `h`: the helpers shot.mjs owns (sleep). Returns the scene actions of the set. */
export function s8Actions(h) {
  const { sleep } = h;
  const sheetOn = (page, id) => page.$eval('#' + id, (el) => el.classList.contains('on'));
  const labels = (page) => page.$$eval('#sndRow button', (bs) => bs.map((b) => b.textContent));
  return {
    /** Options by a real click, then its Sound check row; the sheet holds every button of 05 2.6 item 2. */
    async s8SoundCheck(page) {
      if (!(await sheetOn(page, 'options'))) await page.click('#bOptions');
      await page.waitForFunction(() => document.getElementById('options').classList.contains('on'), { timeout: 5_000 });
      await page.click('#optionsList [data-k="soundcheck"]');
      await page.waitForFunction(() => document.getElementById('snd').classList.contains('on') && document.querySelectorAll('#sndRow button').length > 50, { timeout: 5_000 });
      const got = await labels(page);
      const want = [...CUES, ...ALTS, ...BURSTS, ...BIRDS, ...MUSIC];
      const missing = want.filter((l) => !got.includes(l));
      if (missing.length) throw new Error(`the Sound check lacks buttons: ${missing.join(', ')}`);
      if (got.length !== want.length + 1) throw new Error(`the Sound check holds ${got.length} buttons, expected ${want.length + 1} (and the stop button)`);
      if (await page.$eval('#snd', (el) => el.scrollWidth > el.clientWidth + 1)) throw new Error('the Sound check scrolls sideways');
      await page.$eval('#snd', (el) => { el.scrollTop = 0; });
      console.log(`s8 sound check: ${got.length} buttons (${CUES.length} cues, ${ALTS.length} recipes, ${BURSTS.length} bursts, ${BIRDS.length} birds, ${MUSIC.length + 1} music)`);
    },
    /** The same sheet scrolled to its end: the bursts, the birds and the music. */
    async s8SoundCheckEnd(page) {
      await page.$eval('#snd', (el) => { el.scrollTop = el.scrollHeight; });
      await sleep(100);
      const bottom = await page.$eval('#snd', (el) => Math.abs(el.scrollTop + el.clientHeight - el.scrollHeight) < 2);
      if (!bottom) throw new Error('the Sound check did not scroll to its end');
    },
    /**
     * Every cue button pressed once with a real click (the engine and the gates of the real browser context), 120 ms apart: the harness log
     * must hold each of the 38 ids as played (05 2.6 item 4), the context must be running, and no console error may come of it (the runner's).
     */
    async s8PressAll(page) {
      await page.$eval('#snd', (el) => { el.scrollTop = 0; });
      await page.evaluate(() => { window.__PD.audio.log.length = 0; });
      for (const id of CUES) {
        await page.click(`#sndRow [data-k="cue:${id}"]`);
        await sleep(120);
      }
      const r = await page.evaluate(() => ({
        state: window.__PD.audio.state(),
        rows: window.__PD.audio.log.map((x) => ({ id: x.id, played: x.played, why: x.why })),
      }));
      const bad = CUES.filter((id) => !r.rows.some((x) => x.id === id && x.played));
      if (bad.length) throw new Error(`cue buttons that logged no played decision: ${bad.map((id) => id + ' ' + (r.rows.find((x) => x.id === id)?.why ?? 'never')).join(', ')}`);
      if (r.state.ctx !== 'running') throw new Error(`the audio context is ${r.state.ctx}, not running`);
      console.log(`s8 press: all ${CUES.length} cue buttons logged a played decision; context ${r.state.ctx}, lowpass ${r.state.lowpass}, verb ${r.state.verb}`);
      await page.$eval('#snd', (el) => { el.scrollTop = 0; });
    },
  };
}
