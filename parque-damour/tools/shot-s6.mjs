// tools/shot-s6.mjs
// The 's6' scene set of tools/shot.mjs (07 S6.7 item 5; the UI stage of S6), split out so shot.mjs does not grow past its 771 lines. Every
// step is a real tap or click (puppeteer's mouse at __PD.screenOf of a tile or a head point, the rail's and the chip's buttons); the
// harness is read, and sets only the two things a player earns by playing: the visitors' time of day (simulate) and the points of the
// Progress shot (setProgress, as the det-s6 fixture does).
//   cupid-strip      the Cupid group at the start: c_petals and c_bouquet open (a swatch in --berry), nothing armed, row 2 "Pick an ability"
//   cupid-strip-mid  the same strip scrolled 150 px: the T1 and T2 pills dimmed with their tier badges
//   locked           a tap on the locked Musician pill: the toast "Unlocks at Cupid T1" (the one shot with #hint shown)
//   cupid-strip-end  the strip scrolled to its end: the T3 and T4 badges
//   cooldown         day 1 at midday with the 22 visitors of the s4 crowd: the Mischief group, m_pigeon armed and tapped on an adult, applied by
//                    a real unpause, five sim seconds on: the chip with its name, the ring a fifth gone and the seconds left
//   petals           the Cupid group, c_petals armed and tapped on a free lawn tile, applied by a real unpause: PETALS = 1 on the 3 x 3 tints the
//                    ground and the square (alpha 0.25, rose) stands over it. The petals themselves are not drawn: that waits for the owner's pick
//                    of the petal art (07 S6.9; register row 26), so this shot shows the tint and the square only
//   progress         the Points chip at 14 | 23 and the Progress sheet: both ladders, the ticks, the next unlock
//   progress-table   the same sheet scrolled to the unlock table
//   rail-320, progress-320   a 320 x 568 phone: the Mischief group with m_pigeon armed (the tallest rail), then the Progress sheet capped between
//                    the chips and the rail
//   rail-320-es, progress-320-es   the same two in Spanish (ES tapped in the Options sheet): "En pausa" is wider than "Paused", and the rail
//                    must still be two lines in row 3 and under 40 % of the screen (the layout check of shot.mjs fails the run otherwise)
export const S6_SCENES = [
  { name: 'cupid-strip', turn: 0, z: 1.3, act: 's6Cupid' },
  { name: 'cupid-strip-mid', keep: true, act: 's6StripMid' },
  { name: 'locked', keep: true, act: 's6Locked' },
  { name: 'cupid-strip-end', keep: true, act: 's6StripEnd' },
  { name: 'cooldown', turn: 0, z: 1.8, at: [22.5, 25.2], abs: 0.552, pre: 'callCrowd', act: 's6Pigeon' },
  { name: 'petals', turn: 0, z: 2.4, at: [25, 33], act: 's6Petals' },
  { name: 'progress', keep: true, act: 's6Progress' },
  { name: 'progress-table', keep: true, act: 's6ProgressTable' },
  { name: 'rail-320', vp: [320, 568], turn: 0, z: 1.3, act: 's6Small' },
  { name: 'progress-320', keep: true, act: 's6SmallProgress' },
  { name: 'rail-320-es', keep: true, act: 's6SmallEs' },
  { name: 'progress-320-es', keep: true, act: 's6SmallProgress' },
];

/** `h`: the helpers shot.mjs owns (tapTile, runBriefly, sleep). Returns the scene actions of the set. */
export function s6Actions(h) {
  const { tapTile, runBriefly, sleep } = h;
  const group = async (page, g) => {
    await page.click(`#groups [data-group="${g}"]`);
    await page.waitForFunction((k) => document.querySelector(`#groups [data-group="${k}"]`)?.getAttribute('aria-pressed') === 'true', { timeout: 5_000 }, g);
  };
  const hideHint = (page) => page.evaluate(() => (document.getElementById('hint').style.visibility = 'hidden'));
  const closeSheet = async (page, id) => {
    if (await page.$eval('#' + id, (el) => el.classList.contains('on'))) await page.click(`#${id} .x`);
  };
  return {
    /** The player's view (body.dev off), the Cupid group: 9 pills, the first two open and the rest locked. */
    async s6Cupid(page) {
      await page.evaluate(() => document.body.classList.remove('dev'));
      await group(page, 'cupid');
      const st = await page.$$eval('#tools .tool', (els) => els.map((b) => b.dataset.id + (b.classList.contains('locked') ? ':locked' : '')));
      const want = ['c_petals', 'c_bouquet', 'c_musician:locked', 'c_sunbeam:locked', 'c_umbrella:locked', 'c_lamplight:locked', 'c_picnic:locked', 'c_rowboat:locked', 'c_fireworks:locked'];
      if (JSON.stringify(st) !== JSON.stringify(want)) throw new Error(`s6 cupid strip: want ${JSON.stringify(want)}, got ${JSON.stringify(st)}`);
    },
    async s6StripMid(page) {
      await page.$eval('#tools', (el) => {
        el.scrollLeft = 150;
        el.dispatchEvent(new Event('scroll'));
      });
      await sleep(300);
    },
    async s6StripEnd(page) {
      await hideHint(page);
      await page.$eval('#tools', (el) => {
        el.scrollLeft = el.scrollWidth;
        el.dispatchEvent(new Event('scroll'));
      });
      await sleep(300);
    },
    /** A real tap on the locked Musician pill: the toast, nothing armed. */
    async s6Locked(page) {
      await page.evaluate(() => (document.getElementById('hint').style.visibility = ''));
      await page.click('.tool[data-id="c_musician"]');
      await page.waitForFunction(() => document.getElementById('hint').textContent === 'Unlocks at Cupid T1' && document.getElementById('hint').classList.contains('on'), { timeout: 5_000 });
      if (await page.evaluate(() => document.querySelector('#tools .tool[aria-pressed="true"]') !== null)) throw new Error('s6 locked: a locked pill armed');
      await sleep(400); // the toast fades in over .3 s
    },
    /** m_pigeon armed, a real tap on an adult with no one close by, applied by a real unpause, five sim seconds on: the chip counts down. */
    async s6Pigeon(page) {
      await hideHint(page);
      await group(page, 'mischief');
      await page.click('.tool[data-id="m_pigeon"]');
      const p = await page.evaluate(() => {
        const pd = window.__PD, z = pd.cam.z;
        const pts = pd.visitors
          .filter((v) => v.archetype !== 'child' && v.archetype !== 'cameo')
          .map((v) => {
            const seat = v.sitPropId ? pd.props.find((q) => q.id === v.sitPropId) : null;
            const e = seat ? ({ bench: 0.2, table: 0.3 })[seat.kind] ?? 0 : 0;
            const s = pd.screenOf(v.x, v.y, e);
            return { x: s.x, y: s.y - 8 * z, id: v.id };
          })
          .filter((s) => s.y > 190 && s.y < 540 && s.x > 50 && s.x < 340);
        let best = null, bd = Infinity;
        for (const s of pts) {
          const alone = pd.visitors.every((v) => {
            if (v.id === s.id) return true;
            const o = pd.screenOf(v.x, v.y);
            return Math.hypot(o.x - s.x, o.y + 8 * z - s.y) > 70;
          });
          const d = Math.hypot(s.x - 195, s.y - 380);
          if (alone && d < bd) {
            bd = d;
            best = s;
          }
        }
        return best;
      });
      if (!p) throw new Error('s6 cooldown: no adult alone on screen to tap');
      await page.mouse.click(p.x, p.y);
      await runBriefly(page, 300);
      await page.evaluate(() => window.__PD.simulate(300)); // five sim seconds on, paused again
      await page.waitForFunction(() => /^\d+ s$/.test(document.querySelector('#cdChip .cd')?.textContent ?? ''), { timeout: 5_000 });
      const chip = await page.evaluate(() => ({ nm: document.querySelector('#cdChip .nm').textContent, cd: document.querySelector('#cdChip .cd').textContent }));
      if (chip.nm !== 'Pigeon') throw new Error('s6 cooldown: the chip names ' + chip.nm);
      await sleep(300);
    },
    /** c_petals armed and tapped on a free lawn tile near (25, 33), applied by a real unpause: PETALS on the 3 x 3 and the rose square. */
    async s6Petals(page) {
      await group(page, 'cupid');
      await page.click('.tool[data-id="c_petals"]');
      const t = await page.evaluate(async () => {
        const pd = window.__PD, G = await import('/src/world/grid.ts');
        for (const [x, y] of [[25, 33], [26, 33], [24, 33], [25, 34], [27, 34], [23, 34], [28, 33]]) {
          if (G.KIND[G.I(x, y)] !== G.Kind.lawn) continue;
          const clear = pd.visitors.every((v) => Math.hypot(v.x - x, v.y - y) > 3);
          if (clear) return { x, y };
        }
        return null;
      });
      if (!t) throw new Error('s6 petals: no free lawn tile near (25, 33)');
      await tapTile(page, t.x, t.y);
      await runBriefly(page, 300);
      await page.waitForFunction((x, y) => window.__PD.layers.PETALS[y * 48 + x] > 0.5, { timeout: 5_000 }, t.x, t.y);
      const aim = await page.evaluate(async () => {
        const m = (await import('/src/render/ghost.ts')).aimMark();
        return m ? { x: m.x, y: m.y, r: m.r, side: m.side } : null;
      });
      if (!aim || aim.r !== 1 || aim.side !== 'cupid') throw new Error('s6 petals: no rose square ' + JSON.stringify(aim));
    },
    /** The Points chip at 14 | 23 (a fixture, as det-s6 sets them), then the chip is tapped: the Progress sheet. */
    async s6Progress(page) {
      await page.evaluate(() => window.__PD.setProgress(14, 23));
      await page.waitForFunction(() => document.getElementById('tCP').textContent === '14' && document.getElementById('tMP').textContent === '23', { timeout: 5_000 });
      await page.click('#hudPoints');
      await page.waitForFunction(
        () => document.getElementById('progress').classList.contains('on') && document.querySelectorAll('#progressList .ladder').length === 2,
        { timeout: 5_000 },
      );
      await sleep(500); // the Points chip's flash is over
    },
    async s6ProgressTable(page) {
      await page.$eval('#progress', (el) => (el.scrollTop = el.scrollHeight));
      await sleep(300);
    },
    /** 320 x 568: the sheet closed, the Mischief group with m_pigeon armed: row 2 holds the chip, the tallest rail. */
    async s6Small(page) {
      await closeSheet(page, 'progress');
      await hideHint(page);
      await group(page, 'mischief');
      await page.click('.tool[data-id="m_pigeon"]');
      await page.waitForFunction(() => !document.getElementById('cdChip').hidden, { timeout: 5_000 });
    },
    /** Spanish by a real tap in the Options sheet, then the same Mischief group with m_pigeon armed. */
    async s6SmallEs(page) {
      await closeSheet(page, 'progress');
      await hideHint(page);
      await page.click('#bOptions');
      await page.waitForFunction(() => document.getElementById('options').classList.contains('on'), { timeout: 5_000 });
      await page.click('#optionsList [data-k="lang:es"]');
      await page.waitForFunction(() => document.documentElement.lang === 'es' && document.getElementById('bOptions').textContent === 'Opciones', { timeout: 5_000 });
      await closeSheet(page, 'options');
      await group(page, 'mischief');
      // the pigeon is still armed from rail-320 (a second tap would disarm it): tap it only when it is not
      if (await page.$eval('.tool[data-id="m_pigeon"]', (b) => b.getAttribute('aria-pressed') !== 'true')) await page.click('.tool[data-id="m_pigeon"]');
      await page.waitForFunction(() => !document.getElementById('cdChip').hidden && document.querySelector('#cdChip .nm').textContent === 'Paloma', { timeout: 5_000 });
    },
    async s6SmallProgress(page) {
      await page.click('#hudPoints');
      await page.waitForFunction(() => document.getElementById('progress').classList.contains('on'), { timeout: 5_000 });
    },
  };
}
