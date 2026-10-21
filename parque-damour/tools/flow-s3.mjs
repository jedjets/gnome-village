// tools/flow-s3.mjs
// The by-hand check of 07 S3.7 item 6, scripted: puppeteer-core with the pre-installed Chromium on a DEV server (Vite's createServer, as
// tools/shot.mjs scenes; the __PD harness is read to check, never to act), 390 x 844, one fresh browser context (an empty localStorage).
//   1. Begin; arm the path brush; drag a stroke over six lawn tiles; the tiles turn to gravel.
//   2. Reload (pagehide autosaves); the intro offers Continue; tap Continue: the path is there, no toast shows (Continue is silent,
//      03 11), and Undo is disabled (the undo history is not saved, owner 2026-10-13).
//   3. Pause with the rail's button; arm the lamp; tap a lawn tile: nothing appears while paused (03 4.6: the command waits); unpause:
//      the lamp appears.
//  3b. The path brush: finger 1 paints, a second finger touches and lifts, finger 1 paints on: one stroke id, and one Undo takes it
//      all back (02 8.2, 8.5); the brush tapped on the apron toasts "outside the railings" (02 8.4 item 1).
//  3c. A fast drag leaves no gap (owner 2026-10-13): one drag sample seven tiles on from the first paints all eight tiles, one `tool`
//      command per centre under one stroke id, and one Undo takes them back.
//   4. Tap New: the confirm appears; Yes: a fresh park (the stroke's tiles are not the restored park's), the #s= hash changes, the park
//      key is gone and the profile counts one more park; Undo is disabled.
//  4b. New confirmed while paused gives a fresh park at once and stays paused (03 4.6; owner 2026-10-13): the hash names a new seed and
//      the tick is 0 at once, the pause holds (the tick stays 0), and the unpause runs the new park.
//   5. Reload: Continue is offered again (the new park autosaved on pagehide); Begin asks the New confirm first; No keeps the intro.
//  5b. Continue by the keyboard, Enter pressed twice: the game starts once (one Sound press toggles once, one pause is one command).
//  5c. Options: Calm then reload keeps Calm for the park and the preference (register section 4, Park pace and Options, owner
//      2026-10-14): the park New started is Lively (a new player's profile pace); Options shows it pressed; Calm tapped turns the park
//      calm at the next step and writes the profile; after a reload and Continue the park and the profile are still calm, Calm pressed.
//  5d. Abilities (07 S6.6 steps 6 and 7, 03 8.2 item 2): on the running park, the Cupid group's locked Musician pill toasts "Unlocks at Cupid
//      T1" and arms nothing; the Mischief group's Sprinkler pill arms, a tap on a lawn tile logs one `ability` command and the running sim
//      applies it (the sprinkler prop appears, row 2's chip counts the cooldown down, the pill stays armed); a second tap inside the cooldown
//      toasts "not yet (n s)" and puts no second sprinkler down.
//  5e. Avatar mode (07 S7.7 item 4, the UI stage of S7): on the running park, "Be someone" opens the picker, the Pigeon card possesses a
//      pigeon (body.avatar, three hint chips, the Park strip and the switch hidden, the strip "... · you", the button reads Creator); a tap on
//      a lawn tile logs one `avatar.tap` and the pigeon goes there; Creator logs `avatar.leave` and the pigeon walks off on its own within 2 s
//      (it is no longer driven and no longer waits for a tap), the strips are back and the toast says it "goes on alone".
//   6. A Spanish browser (navigator.language es-ES), a fresh profile: the intro is in Spanish; after Begin and a reload it still is;
//      EN tapped on the intro survives a reload (register 3.12).
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

    // 3b. A brush stroke is one stroke however many fingers join it, and a brush off the park says why (02 8.2, 8.4 item 1)
    await strokeChecks(page);
    // 3c. A fast drag leaves no gap (02 8.2 brush row; owner 2026-10-13)
    await fastDragCheck(page);

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

    // 4b. New confirmed while paused: the fresh park at once, still paused (03 4.6; owner 2026-10-13)
    await pausedNewCheck(page, seed2);

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

    // 5b. Continue by the keyboard, Enter pressed twice: the game starts once, so one press of Sound toggles it once
    await page.focus('#bContinue');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await painted(page);
    await sleep(200);
    check(await page.$eval('#confirm', (c) => c.hidden), 'Enter twice on Continue: no confirm opens over the game');
    await page.click('#bMute');
    check((await page.$eval('#bMute', (b) => b.getAttribute('aria-pressed'))) === 'true', 'Enter twice on Continue: one press of Sound toggles it once');
    const seq0 = await page.evaluate(() => window.__PD.log().reduce((m, c) => Math.max(m, c.seq), 0));
    await page.click('#bHalt');
    await page.waitForFunction(() => window.__PD.T.speed === 0, { timeout: 5_000 });
    await sleep(200);
    const speeds = await page.evaluate((s) => window.__PD.log().filter((c) => c.seq > s && c.kind === 'speed').length, seq0);
    check(speeds === 1, `Enter twice on Continue: one press of pause is one speed command (${speeds})`);

    // 5c. Options: Calm then reload keeps Calm for the park and the preference
    await paceCheck(page);

    // 5d. Abilities
    await abilityCheck(page);

    // 5e. Avatar mode
    await avatarCheck(page);
  } finally {
    await browser.close();
  }
  await langChecks();
}

/**
 * 3b on the running restored park (the Fit view of Continue): (1) the path brush, finger 1 paints two tiles, finger 2 touches and lifts
 * (the start of a pinch), finger 1 paints two more: one stroke id for all of it (02 8.2, 8.5: one undo entry per stroke), and one Undo
 * takes all four tiles back; (2) a tap with the path brush on the apron outside the railings toasts "outside the railings" (02 8.2
 * brush row, 8.4 item 1), as a 1 x 1 stamp's tap there does.
 */
async function strokeChecks(page) {
  await page.click('.tool[data-id="path"]');
  // four lawn tiles in a row, free, away from the stroke and the lamp, on screen
  const row = await page.evaluate((avoid) => {
    const pd = window.__PD, K = pd.layers.KIND, O = pd.layers.OCC;
    for (let y = 8; y < 40; y++) {
      for (let x = 6; x < 38; x++) {
        if (Math.abs(y - avoid.y) < 3) continue;
        let ok = true;
        for (let k = 0; k < 7 && ok; k++) ok = K[y * 48 + x + k] === 0 && O[y * 48 + x + k] === 0 && K[(y - 1) * 48 + x + k] === 0 && K[(y + 1) * 48 + x + k] === 0;
        const a = pd.screenOf(x, y), b = pd.screenOf(x + 6, y);
        if (ok && a.x > 30 && b.x < innerWidth - 30 && a.y > 120 && a.y < innerHeight - 260) return [0, 2, 4, 6].map((k) => ({ x: x + k, y }));
      }
    }
    return null;
  }, { y: 33 });
  check(row !== null, 'a free lawn row for the two-finger stroke');
  if (!row) return;
  const seq0 = await page.evaluate(() => window.__PD.log().reduce((m, c) => Math.max(m, c.seq), 0));
  await page.evaluate(async (tiles) => {
    const cv = document.getElementById('cv'), pd = window.__PD;
    const ev = (type, id, p) =>
      cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: p.x, clientY: p.y, bubbles: true, isPrimary: id === 21, pointerType: 'touch' }));
    const at = (k) => pd.screenOf(tiles[k].x, tiles[k].y);
    const two = { x: at(1).x + 90, y: at(1).y - 160 };
    // [event, pointer, where, then wait ms]: finger 1 paints at once and past the first 0.14 s; a second finger touches (the pinch
    // begins) and lifts while finger 1 stays down; finger 1 paints on and lifts
    const script = [['pointerdown', 21, 0, 200], ['pointermove', 21, 1, 150], ['pointerdown', 22, -1, 80], ['pointerup', 22, -1, 150],
      ['pointermove', 21, 2, 150], ['pointermove', 21, 3, 60], ['pointerup', 21, 3, 0]];
    for (const [type, id, k, ms] of script) {
      ev(type, id, k < 0 ? two : at(k));
      await new Promise((r) => setTimeout(r, ms));
    }
  }, row);
  await sleep(500);
  const strokes = await page.evaluate(
    (s) => [...new Set(window.__PD.log().filter((c) => c.seq > s && c.kind === 'tool' && c.payload.tool === 'path').map((c) => c.payload.stroke))],
    seq0,
  );
  const gravel = async () => page.evaluate((r) => r.filter((t) => window.__PD.layers.KIND[t.y * 48 + t.x] === 1).length, row);
  const g1 = await gravel();
  check(g1 === 4 && strokes.length === 1, `a second finger touching and lifting keeps one stroke (${g1} of 4 tiles, stroke ids ${JSON.stringify(strokes)})`);
  await page.click('#bUndo');
  await sleep(400);
  const g2 = await gravel();
  check(g2 === 0, `one Undo takes the whole two-finger stroke back (${g2} gravel tiles left)`);

  // (2) the brush on the apron, west of the railings
  const apron = await page.evaluate(() => {
    const pd = window.__PD;
    for (let x = -2; x >= -6; x--) {
      const p = pd.screenOf(x, 24), t = pd.screenToTile(p.x, p.y, true);
      if (t && t.x < 0 && p.x > 10 && p.y > 120 && p.y < innerHeight - 260) return p;
    }
    return null;
  });
  check(apron !== null, 'an apron point on screen west of the park');
  if (!apron) return;
  await page.mouse.click(apron.x, apron.y);
  await sleep(150);
  const hint = await page.$eval('#hint', (h) => ({ on: h.classList.contains('on'), text: h.textContent }));
  check(hint.on && hint.text === 'outside the railings', `the path brush off the park toasts "${hint.text}"`);
  await page.click('.tool[data-id="hand"]');
}

/**
 * 3c. A fast drag leaves no gap (02 8.2 brush row; owner 2026-10-13): with the path brush at size 1, the finger goes down on the first of
 * eight free lawn tiles in a row and, past the first 0.14 s, moves to the eighth in a single pointer move. camera.ts paints the line of
 * centres between (Bresenham): all eight tiles turn to gravel, through eight `tool` commands of one stroke id; one Undo takes them back.
 */
async function fastDragCheck(page) {
  await page.click('.tool[data-id="path"]');
  const row = await page.evaluate(() => {
    const pd = window.__PD, K = pd.layers.KIND, O = pd.layers.OCC;
    for (let y = 8; y < 40; y++) {
      if (Math.abs(y - 33) < 3) continue;
      for (let x = 6; x < 38; x++) {
        let ok = true;
        for (let k = 0; k < 8 && ok; k++) ok = K[y * 48 + x + k] === 0 && O[y * 48 + x + k] === 0;
        const a = pd.screenOf(x, y), b = pd.screenOf(x + 7, y);
        if (ok && a.x > 30 && b.x < innerWidth - 30 && a.y > 120 && a.y < innerHeight - 260) return Array.from({ length: 8 }, (_, k) => ({ x: x + k, y }));
      }
    }
    return null;
  });
  check(row !== null, 'a free lawn row of eight tiles for the fast drag');
  if (!row) return;
  check((await page.$eval('#size', (el) => el.value)) === '1', 'the brush is at size 1 for the fast drag');
  const seq0 = await page.evaluate(() => window.__PD.log().reduce((m, c) => Math.max(m, c.seq), 0));
  const a = await screenOfTile(page, row[0].x, row[0].y), b = await screenOfTile(page, row[7].x, row[7].y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await sleep(200); // past the first 0.14 s of the drag-paint throttle
  await page.mouse.move(b.x, b.y); // one pointer move, seven tiles on
  await sleep(60);
  await page.mouse.up();
  await sleep(500);
  const gravel = async () => page.evaluate((r) => r.filter((t) => window.__PD.layers.KIND[t.y * 48 + t.x] === 1).length, row);
  const cmds = await page.evaluate(
    (s) => window.__PD.log().filter((c) => c.seq > s && c.kind === 'tool' && c.payload.tool === 'path').map((c) => c.payload.stroke),
    seq0,
  );
  const g1 = await gravel();
  check(g1 === 8 && cmds.length === 8 && new Set(cmds).size === 1, `a fast drag leaves no gap (${g1} of 8 tiles, ${cmds.length} commands, stroke ids ${JSON.stringify([...new Set(cmds)])})`);
  await page.click('#bUndo');
  await sleep(400);
  check((await gravel()) === 0, 'one Undo takes the fast drag back');
  await page.click('.tool[data-id="hand"]');
}

/**
 * 4b. New confirmed while paused (03 4.6; owner 2026-10-13): the pause, New, Yes: the hash names a new seed and the tick is 0 at once
 * (the paused frame applies `park.new`), the dial still reads the pause and no step runs; the unpause runs the fresh park.
 */
async function pausedNewCheck(page, seedBefore) {
  await page.waitForFunction(() => window.__PD.tick() > 30, { timeout: 5_000 }).catch(() => {});
  const world0 = await page.evaluate(() => window.__PD.worldHash());
  await page.click('#bHalt');
  await page.waitForFunction(() => window.__PD.T.speed === 0, { timeout: 5_000 });
  const tick0 = await page.evaluate(() => window.__PD.tick());
  await page.click('#bNew');
  await page.waitForFunction(() => !document.getElementById('confirm').hidden, { timeout: 5_000 });
  await page.click('#confirmYes');
  await page.waitForFunction((s) => /s=(\d+)/.exec(location.hash)?.[1] !== s, { timeout: 2_000 }, seedBefore).catch(() => {});
  const at = await page.evaluate(() => ({
    seed: /s=(\d+)/.exec(location.hash)?.[1], tick: window.__PD.tick(), speed: window.__PD.T.speed, world: window.__PD.worldHash(),
    halt: document.getElementById('bHalt').getAttribute('aria-pressed'),
  }));
  check(!!at.seed && at.seed !== seedBefore && at.tick === 0 && at.world !== world0,
    `New confirmed while paused gives a fresh park at once (#s=${seedBefore} to #s=${at.seed}, tick ${tick0} to ${at.tick})`);
  await sleep(600);
  const still = await page.evaluate(() => ({ tick: window.__PD.tick(), speed: window.__PD.T.speed }));
  check(at.speed === 0 && at.halt === 'true' && still.tick === 0 && still.speed === 0, `... and stays paused (speed ${still.speed}, tick ${still.tick} after 0.6 s)`);
  check(await page.evaluate(() => localStorage.getItem('parque:park-v1') === null), 'New while paused clears the park key');
  await page.click('#bHalt');
  await page.waitForFunction(() => window.__PD.tick() > 0, { timeout: 5_000 }).catch(() => {});
  check((await page.evaluate(() => window.__PD.tick())) > 0, 'the unpause runs the fresh park');
}

/**
 * 5c. Options: Calm then reload keeps Calm for the park and the preference (register section 4, Park pace and Options; owner
 * 2026-10-14). The restored park is the one New started in 4b, which took the profile's pace with the New (a new player: Lively). The
 * pause lifted, Options opens with Lively pressed; Calm tapped: the logged `park.pace` turns the park calm at the next step and the
 * profile stores calm; a reload (pagehide autosaves) and Continue: the park is calm, the profile still says calm, Calm is pressed.
 */
async function paceCheck(page) {
  const state = () =>
    page.evaluate(() => {
      return {
        park: window.__PD.snapshot().pace,
        stored: JSON.parse(localStorage.getItem('parque:profile-v1') || '{}').settings?.pace ?? null,
        calm: document.querySelector('#optionsList [data-k="pace:calm"]')?.getAttribute('aria-pressed') === 'true',
        lively: document.querySelector('#optionsList [data-k="pace:lively"]')?.getAttribute('aria-pressed') === 'true',
      };
    });
  await page.click('#bHalt'); // 5b ended paused
  await page.waitForFunction(() => window.__PD.T.speed > 0, { timeout: 5_000 });
  await page.click('#bOptions');
  await page.waitForFunction(() => document.getElementById('options').classList.contains('on'), { timeout: 5_000 }).catch(() => {});
  const s0 = await state();
  check(s0.park === 'lively' && s0.lively && !s0.calm, `Options: the park New started is ${s0.park}, Lively pressed (${s0.lively})`);
  const seq0 = await page.evaluate(() => window.__PD.log().reduce((m, c) => Math.max(m, c.seq), 0));
  await page.click('#optionsList [data-k="pace:calm"]');
  await page.waitForFunction(() => window.__PD.snapshot().pace === 'calm', { timeout: 5_000 }).catch(() => {});
  const s1 = await state();
  const logged = await page.evaluate((s) => window.__PD.log().filter((c) => c.seq > s && c.kind === 'park.pace').map((c) => c.payload.pace), seq0);
  check(s1.park === 'calm' && s1.stored === 'calm' && s1.calm && JSON.stringify(logged) === '["calm"]',
    `Options: Calm tapped: the park is ${s1.park}, the profile ${s1.stored}, logged ${JSON.stringify(logged)}`);
  await page.reload({ waitUntil: 'load' });
  await introReady(page);
  await page.click('#bContinue');
  await painted(page);
  await page.click('#bOptions');
  await page.waitForFunction(() => document.getElementById('options').classList.contains('on'), { timeout: 5_000 }).catch(() => {});
  const s2 = await state();
  check(s2.park === 'calm' && s2.stored === 'calm' && s2.calm && !s2.lively,
    `Options: Calm then reload keeps Calm for the park and the preference (park ${s2.park}, profile ${s2.stored}, Calm pressed ${s2.calm})`);
}

/**
 * 5d. The locked pill, then arming, a tap, the applied command, the chip and the refusal inside the cooldown (see the header). The tile is
 * a lawn tile of the park on screen with nothing on it (read from the layers; the tap itself is a real click at its screen point).
 */
async function abilityCheck(page) {
  if (await page.$eval('#options', (el) => el.classList.contains('on'))) await page.click('#options .x');
  await page.click('#groups [data-group="cupid"]');
  await page.click('.tool[data-id="c_musician"]');
  const lock = await page.evaluate(() => ({
    text: document.getElementById('hint').textContent,
    on: document.getElementById('hint').classList.contains('on'),
    armed: document.querySelector('#tools .tool[aria-pressed="true"]') !== null,
  }));
  check(lock.text === 'Unlocks at Cupid T1' && lock.on && !lock.armed, `abilities: a locked pill toasts "${lock.text}" and arms nothing`);
  await page.click('#groups [data-group="mischief"]');
  await page.click('.tool[data-id="m_sprinkler"]');
  const tile = await page.evaluate(() => {
    const pd = window.__PD, K = pd.layers.KIND, O = pd.layers.OCC;
    for (let y = 8; y < 40; y++) {
      for (let x = 8; x < 40; x++) {
        if (K[y * 48 + x] !== 0 || O[y * 48 + x] !== 0) continue; // lawn, nothing on it
        const s = pd.screenOf(x, y);
        if (s.x > 40 && s.x < 350 && s.y > 200 && s.y < 560) return { x, y };
      }
    }
    return null;
  });
  check(tile !== null, 'abilities: a free lawn tile on screen');
  if (!tile) return;
  const seq0 = await page.evaluate(() => window.__PD.log().reduce((m, c) => Math.max(m, c.seq), 0));
  const p = await screenOfTile(page, tile.x, tile.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => window.__PD.props.some((q) => q.kind === 'sprinkler'), { timeout: 5_000 }).catch(() => {});
  const cmds = await page.evaluate((s) => window.__PD.log().filter((c) => c.seq > s && c.kind === 'ability').map((c) => c.payload.id + ':' + c.payload.target.kind), seq0);
  const st = await page.evaluate(() => ({
    sprinklers: window.__PD.props.filter((q) => q.kind === 'sprinkler').length,
    chip: document.querySelector('#cdChip .nm')?.textContent + ' ' + document.querySelector('#cdChip .cd')?.textContent,
    armed: document.querySelector('#tools .tool[aria-pressed="true"]')?.dataset.id,
  }));
  check(cmds.length === 1 && cmds[0] === 'm_sprinkler:tile' && st.sprinklers === 1, `abilities: the tap logged ${JSON.stringify(cmds)} and the sim put ${st.sprinklers} sprinkler down`);
  check(/^Sprinkler \d+ s$/.test(st.chip) && st.armed === 'm_sprinkler', `abilities: the chip counts the cooldown ("${st.chip}") and the pill stays armed (${st.armed})`);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => /^not yet \(\d+ s\)$/.test(document.getElementById('hint').textContent ?? ''), { timeout: 5_000 }).catch(() => {});
  const again = await page.evaluate(() => ({ text: document.getElementById('hint').textContent, sprinklers: window.__PD.props.filter((q) => q.kind === 'sprinkler').length }));
  check(/^not yet \(\d+ s\)$/.test(again.text) && again.sprinklers <= 1, `abilities: a second tap inside the cooldown toasts "${again.text}" (${again.sprinklers} sprinkler)`);
}

/**
 * 5e. The avatar mode on the running park (see the header): the picker by the mode button, the Pigeon card, a tap on the lawn, Creator. Every
 * action is a real click; the harness is read for the pigeon and the log.
 */
async function avatarCheck(page) {
  const me = () =>
    page.evaluate(() => {
      const pd = window.__PD, m = pd.mode(), c = pd.creatures.find((o) => o.id === m.player) ?? pd.creatures.find((o) => o.driven);
      return { mode: m.mode, avatar: m.avatar, x: c?.x ?? 0, y: c?.y ?? 0, st: c?.st ?? '', driven: !!c?.driven, id: c?.id ?? 0 };
    });
  const ui = () =>
    page.evaluate(() => {
      const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
      return {
        avatar: document.body.classList.contains('avatar'),
        chips: document.querySelectorAll('#hints .hc').length,
        tools: shown('tools'), groups: shown('groups'), hints: shown('hints'),
        name: document.getElementById('cName').textContent, doing: document.getElementById('cDo').textContent,
        mode: document.getElementById('bMode').textContent,
      };
    });
  const seq0 = await page.evaluate(() => window.__PD.log().reduce((m, c) => Math.max(m, c.seq), 0));
  await page.click('#bMode');
  await page.waitForFunction(() => document.getElementById('picker').classList.contains('on'), { timeout: 5_000 }).catch(() => {});
  const six = await page.$$eval('#pickerList .pk', (els) => els.length);
  check(six === 6, `avatar: "Be someone" opens the picker with ${six} cards`);
  await page.click('#pickerList .pk[data-id="a_pigeon"]');
  await page.waitForFunction(() => window.__PD.mode().mode === 'avatar' && document.body.classList.contains('avatar'), { timeout: 5_000 }).catch(() => {});
  await sleep(1800); // the follow eases in (k = 1 - 0.02^dt)
  const a = await ui(), m0 = await me();
  check(m0.mode === 'avatar' && m0.avatar === 'a_pigeon' && m0.driven, `avatar: the pigeon is possessed (${JSON.stringify(m0)})`);
  check(a.avatar && a.chips === 3 && a.hints && !a.tools && !a.groups, `avatar: three hint chips, the Park strip and the switch hidden (${JSON.stringify(a)})`);
  check(a.name.endsWith(' · you') && a.mode === 'Creator', `avatar: the strip reads "${a.name}" / "${a.doing}", the button "${a.mode}"`);
  const tile = await page.evaluate((x, y) => {
    const pd = window.__PD, K = pd.layers.KIND, O = pd.layers.OCC;
    let best = null, bd = Infinity;
    for (let ty = 8; ty < 40; ty++)
      for (let tx = 8; tx < 40; tx++) {
        if (K[ty * 48 + tx] !== 0 || O[ty * 48 + tx] !== 0) continue; // lawn, nothing on it
        const s = pd.screenOf(tx, ty), d = Math.hypot(tx - x, ty - y);
        if (s.x > 40 && s.x < 350 && s.y > 200 && s.y < 520 && d > 3 && d < 7 && Math.abs(d - 5) < bd) {
          bd = Math.abs(d - 5);
          best = { x: tx, y: ty };
        }
      }
    return best;
  }, m0.x, m0.y);
  check(tile !== null, 'avatar: a free lawn tile three to seven tiles from the pigeon, on screen');
  if (!tile) return;
  const p = await screenOfTile(page, tile.x, tile.y);
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction((t) => window.__PD.log().some((c) => c.kind === 'avatar.tap' && c.payload.tile.x === t.x && c.payload.tile.y === t.y), { timeout: 5_000 }, tile).catch(() => {});
  await sleep(1500);
  const m1 = await me();
  const taps = await page.evaluate((s) => window.__PD.log().filter((c) => c.seq > s && c.kind === 'avatar.tap').length, seq0);
  const moved = Math.hypot(m1.x - m0.x, m1.y - m0.y);
  check(taps === 1 && moved > 2, `avatar: a tap on the lawn logged ${taps} avatar.tap and the pigeon moved ${moved.toFixed(1)} tiles (now ${m1.st})`);
  await page.click('#bMode'); // Creator
  const t0 = Date.now();
  await page.waitForFunction(() => window.__PD.mode().mode === 'creator', { timeout: 5_000 }).catch(() => {});
  const leaves = await page.evaluate((s) => window.__PD.log().filter((c) => c.seq > s && c.kind === 'avatar.leave').length, seq0);
  let free = false, cur = await me();
  while (Date.now() - t0 < 2000 && !free) {
    cur = await page.evaluate((id) => {
      const c = window.__PD.creatures.find((o) => o.id === id);
      return { x: c.x, y: c.y, st: c.st, driven: !!c.driven, id };
    }, m1.id);
    free = !cur.driven && cur.st !== 'wait';
    if (!free) await sleep(100);
  }
  check(leaves === 1 && free, `avatar: Creator logged ${leaves} avatar.leave and the pigeon is on its own within ${Date.now() - t0} ms (${cur.st})`);
  await sleep(500);
  const z = await ui();
  const toast = await page.evaluate(() => document.getElementById('hint').textContent);
  check(!z.avatar && z.tools && z.groups && !z.hints && z.mode === 'Be someone', `avatar: the strips are back, the button reads "${z.mode}"`);
  check(toast.endsWith('goes on alone'), `avatar: the toast says "${toast}"`);
}

/**
 * 6. The language (register 3.12): on a Spanish browser with no profile the intro is in Spanish; (a) after a Begin and a reload (the
 * autosave writes the profile) it is still Spanish; (b) EN tapped on the intro is kept: after a reload the intro is in English.
 */
async function langChecks() {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ARGS });
  try {
    for (const tapEn of [false, true]) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push('console [lang]: ' + m.text());
      });
      page.on('pageerror', (e) => errors.push('page [lang]: ' + e.message));
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'language', { get: () => 'es-ES' });
      });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await page.goto(`${langBase}#s=${SEED}&dev`, { waitUntil: 'load' });
      await introReady(page);
      check((await page.evaluate(() => document.documentElement.lang)) === 'es', `a Spanish browser, no profile: the intro is in Spanish${tapEn ? ' (b)' : ' (a)'}`);
      if (tapEn) {
        await page.click('#lang button[data-l="en"]');
        check((await page.evaluate(() => document.documentElement.lang)) === 'en', 'EN tapped: <html lang="en">');
      } else {
        await page.click('#begin');
        await painted(page);
      }
      await page.reload({ waitUntil: 'load' });
      await introReady(page);
      const want = tapEn ? 'en' : 'es';
      const got = await page.evaluate(() => ({ lang: document.documentElement.lang, stored: JSON.parse(localStorage.getItem('parque:profile-v1') || '{}').settings?.lang }));
      check(got.lang === want && got.stored === want, `after a reload the language is still ${want} (shown ${got.lang}, stored ${got.stored})`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}
let langBase = '';

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
    langBase = base.replace(/\/?$/, '/');
    await run(langBase);
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
