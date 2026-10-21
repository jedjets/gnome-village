// @vitest-environment jsdom
// tests/mute.test.ts
// Locks 05 7.3 and 7.5 item 4 and 08 2.8 (mute.test.ts): `muted` is a profile setting (register 3.11) restored at boot before the context
// exists, the Sound button and the Options sheet's Sound row are one setting, mute is a hard cut on master (a 20 ms ramp to the floor, then
// the scheduling gate, then a suspend after 2 s), unmute resumes and ramps back, and tone(), grain() and cue() schedule nothing while muted.
// The engine runs for real over tests/audio-fake.ts, a stand-in AudioContext, so the graph code is exercised and no device is needed.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newPark } from '../src/core/loop.ts';
import { PROFILE_KEY, getProfile, loadProfile, profileMuted, setProfileMuted } from '../src/save/store.ts';
import { setMuted as setEngineMuted, isMuted as engineMuted } from '../src/audio/engine.ts';
import { buildRail } from '../src/ui/rail.ts';
import { closeSheets, initSheets, openSheet } from '../src/ui/sheets.ts';
import { $, applyDom } from '../src/ui/dom.ts';
import { setLang } from '../src/ui/i18n.ts';
import { en } from '../src/ui/strings/en.ts';
import { installFakeAudio, type FakeAudio } from './audio-fake.ts';

const ROOT = join(import.meta.dirname, '..');
const stored = (): { muted?: boolean } => JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}').settings ?? {};

describe('muted persists in the profile through a reload (register 3.11; 05 7.3 item 1)', () => {
  beforeEach(() => {
    localStorage.clear();
    loadProfile();
  });

  it('a new player is not muted; setProfileMuted writes settings.muted, and a fresh read of the storage gives it back', () => {
    expect(profileMuted()).toBe(false);
    setProfileMuted(true);
    expect(stored().muted).toBe(true);
    // the reload: the in-memory profile is gone, the storage is read again
    loadProfile();
    expect(getProfile().settings.muted).toBe(true);
    expect(profileMuted()).toBe(true);
    setProfileMuted(false);
    loadProfile();
    expect(profileMuted()).toBe(false);
    expect(stored().muted).toBe(false);
  });

  it('the profile\'s setting goes to the engine at boot, before any context exists', () => {
    setProfileMuted(true);
    loadProfile();
    setEngineMuted(profileMuted()); // main.ts boot()
    expect(engineMuted()).toBe(true);
    setProfileMuted(false);
    loadProfile();
    setEngineMuted(profileMuted());
    expect(engineMuted()).toBe(false);
  });
});

describe('the Sound button and the Options sound row are one setting (05 7.3 item 4; GV 12164-12165)', () => {
  beforeAll(() => {
    localStorage.clear();
    setProfileMuted(true); // a muted player's reload
    loadProfile();
    setEngineMuted(profileMuted());
    const doc = new DOMParser().parseFromString(readFileSync(join(ROOT, 'index.html'), 'utf8'), 'text/html');
    document.body.innerHTML = doc.body.innerHTML;
    const style = document.createElement('style');
    style.textContent = readFileSync(join(ROOT, 'src', 'styles', 'shell.css'), 'utf8');
    document.head.appendChild(style);
    setLang('en');
    applyDom();
    initSheets();
    newPark(101);
    buildRail({ onNew: () => undefined });
  });

  it('a muted profile builds the rail pressed, reading "Muted" (aria-pressed, through t())', () => {
    expect($('bMute').getAttribute('aria-pressed')).toBe('true');
    expect($('bMute').textContent).toBe(en['rail.sound_off']);
    expect(engineMuted()).toBe(true);
  });

  it('a tap unmutes the engine, writes the profile and reads "Sound"; the next tap mutes again', () => {
    $('bMute').click();
    expect(engineMuted()).toBe(false);
    expect($('bMute').getAttribute('aria-pressed')).toBe('false');
    expect($('bMute').textContent).toBe(en['rail.sound_on']);
    expect(stored().muted).toBe(false);
    $('bMute').click();
    expect(engineMuted()).toBe(true);
    expect($('bMute').getAttribute('aria-pressed')).toBe('true');
    expect($('bMute').textContent).toBe(en['rail.sound_off']);
    expect(stored().muted).toBe(true);
  });

  it('the Options sheet\'s Sound on | off presses the same button: Off mutes, On unmutes, and the sheet shows the engine\'s state', () => {
    openSheet('options');
    const pressed = (k: string): boolean => document.querySelector(`#optionsList [data-k="${k}"]`)?.getAttribute('aria-pressed') === 'true';
    const tap = (k: string): void => (document.querySelector(`#optionsList [data-k="${k}"]`) as HTMLElement).click();
    expect(pressed('sound:off')).toBe(true); // muted from the test before
    tap('sound:on');
    expect(engineMuted()).toBe(false);
    expect(stored().muted).toBe(false);
    expect(pressed('sound:on')).toBe(true);
    expect($('bMute').getAttribute('aria-pressed')).toBe('false');
    tap('sound:off');
    expect(engineMuted()).toBe(true);
    expect(stored().muted).toBe(true);
    expect($('bMute').getAttribute('aria-pressed')).toBe('true');
    closeSheets();
  });
});

describe('tone() schedules nothing while muted; mute is a hard cut (05 7.3 items 2 and 3)', () => {
  let fake: FakeAudio;
  type Engine = typeof import('../src/audio/engine.ts');
  type Cues = typeof import('../src/audio/cues.ts');
  let E: Engine;
  let C: Cues;
  beforeEach(async () => {
    vi.resetModules(); // a fresh engine: no context from an earlier test
    vi.useFakeTimers();
    fake = installFakeAudio();
    E = await import('../src/audio/engine.ts');
    C = await import('../src/audio/cues.ts');
  });
  afterEach(() => {
    fake.uninstall();
    vi.useRealTimers();
  });

  it('muted, tone(), toneAt(), grain(), a cue and a duck make no node; unmuted they do', () => {
    E.initAudio();
    expect(E.isOn()).toBe(true);
    E.tone(440, 0.1, { gain: 0.01 });
    E.grain(0.05, { f0: 900, f1: 400, gain: 0.01 });
    expect(fake.made).toEqual({ osc: 1, src: 1 });
    E.setMuted(true);
    E.tone(440, 0.1, { gain: 0.01 });
    E.tone(440, 0.1, { gain: 0.01, delay: 0.5, bus: 'amb' });
    E.grain(0.05, { f0: 900, f1: 400, gain: 0.01 });
    expect(C.cue('ui_tap', NaN, NaN)).toBe(false);
    expect(C.cue('laugh', NaN, NaN)).toBe(false);
    expect(fake.made).toEqual({ osc: 1, src: 1 });
    expect(E.auditLog().at(-1)).toMatchObject({ id: 'laugh', played: false, why: 'muted' });
    E.setMuted(false);
    E.tone(440, 0.1, { gain: 0.01 });
    expect(fake.made.osc).toBe(2);
    expect(C.cue('ui_tap', NaN, NaN)).toBe(true);
    expect(fake.made.osc).toBe(3);
  });

  it('the cut is a 20 ms ramp of master to the floor; the return is a 40 ms ramp to 0.84; the context suspends 2 s after the cut and resumes with the return', () => {
    E.initAudio();
    const ramps = (): Array<unknown[]> => fake.calls.filter((c) => c.call === 'setTargetAtTime').map((c) => c.args);
    E.setMuted(true);
    expect(ramps()).toContainEqual([0.0001, 0, 0.02]);
    expect(fake.ctx()?.state).toBe('running');
    vi.advanceTimersByTime(1999);
    expect(fake.ctx()?.state).toBe('running');
    vi.advanceTimersByTime(1);
    expect(fake.ctx()?.state).toBe('suspended');
    expect(E.ctxState()).toBe('suspended');
    E.setMuted(false);
    expect(ramps()).toContainEqual([0.84, 0, 0.04]);
    expect(fake.ctx()?.state).toBe('running');
    // a mute and an unmute within 2 s never suspend
    E.setMuted(true);
    vi.advanceTimersByTime(1000);
    E.setMuted(false);
    vi.advanceTimersByTime(5000);
    expect(fake.ctx()?.state).toBe('running');
  });

  it('muted before the context exists (the profile says so): the graph is built with master closed, and it suspends after 2 s', () => {
    E.setMuted(true);
    E.initAudio();
    const master = fake.nodes.find((n) => n.kind === 'gain') as { gain: { value: number } };
    expect(master.gain.value).toBe(0.0001);
    E.tone(440, 0.1, { gain: 0.01 });
    expect(fake.made.osc).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(fake.ctx()?.state).toBe('suspended');
    E.setMuted(false);
    E.tone(440, 0.1, { gain: 0.01 });
    expect(fake.made.osc).toBe(1);
  });

  it('the dry run obeys mute too: muted, nothing is counted', () => {
    E.setDryRun(true);
    E.tone(440, 0.1, { gain: 0.01 });
    E.grain(0.05, { f0: 900, f1: 400, gain: 0.01 });
    expect(E.dryCalls()).toEqual({ tone: 1, grain: 1 });
    E.setMuted(true);
    E.tone(440, 0.1, { gain: 0.01 });
    E.grain(0.05, { f0: 900, f1: 400, gain: 0.01 });
    expect(E.dryCalls()).toEqual({ tone: 1, grain: 1 });
  });

  it('a gesture unlocks and resumes a suspended context unless muted; resume() recovers an interrupted one (05 7.5 item 4)', () => {
    E.unlockAudio();
    const ctx = fake.ctx() as { state: string };
    ctx.state = 'suspended';
    E.resume();
    expect(ctx.state).toBe('running');
    ctx.state = 'interrupted';
    E.unlockAudio();
    expect(ctx.state).toBe('running');
    E.setMuted(true);
    ctx.state = 'suspended';
    E.unlockAudio();
    expect(ctx.state).toBe('suspended'); // muted: left asleep
  });
});
