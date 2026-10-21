// src/ui/soundcheck.ts
// The Sound check sheet (#snd of 03 10.1, reached from the Options sheet under the dev flag; 05 2.6; 07 S8.6 step 11).
// Ported from GV 10777-10790 (SND_CUES, midG, openSoundCheck). ADAPT. Changes: the buttons are the 38 cue ids of 05 3.2 in table order
// (labelled with the id, a code identifier, not translated: 05 9 item 12), then the two recipes each of `kiss` and `splat` (07 S8.6 step 13),
// the ambience bursts (fountain x6, rain x10, crickets, owl, bells, boulevard), the six bird voices by name (pan 0, volume 0.024 as GV's list),
// and the five music buttons B rising, B parted, C rising, C parted and stop music; the heading words and the muted toast go through t();
// every button unlocks the context and resumes it (a suspended one included, 05 7.5 item 4), plays at the tile under the view (midG
// becomes viewCentreTile(), so the audibility is near 1) and toasts "Sound is muted" when muted (GV 10788). There is no long press
// (05 2.6). The five music buttons call the music hooks main.ts hands in: until the Music stage moves motifs B and C into the game they
// reach the board's code through __PD.audio.music (the dev build), and in a build without the harness they say so in a toast.
// Dropped from the range: sfxThud, sfxRumble, sfxFall, sfxCrash, sfxBurner and the stream, fire and tree-fall entries (05 2.1 last row).
// Layers (03 2.1): ui/ may import audio/ and render/; the hooks keep it free of debug/.
import { isMuted, unlockAudio } from '../audio/engine.ts';
import { CUE_IDS, cue, type CueId } from '../audio/cues.ts';
import { playAlt, type Alt, type AltCue } from '../audio/cues-alts.ts';
import { BURSTS, burst, type Burst } from '../audio/ambience.ts';
import { VOICE_NAMES, singVoice } from '../audio/birds.ts';
import { viewCentreTile } from '../render/camera.ts';
import { $, toast } from './dom.ts';
import { t } from './i18n.ts';

export type Motif = 'B' | 'C';
export type Variant = 'rising' | 'parted';
/** What main.ts hands over: the music buttons' two calls (the dev harness today, the game's music from the Music stage on). */
export type MusicHooks = { play(motif: Motif, variant: Variant): void; stop(): void };
let musicHooks: () => MusicHooks | undefined = () => undefined;
let wired = false;

const BURST_LABEL: Record<Burst, string> = {
  fountain: 'fountain ×6', rain: 'rain ×10', crickets: 'crickets', owl: 'owl', bells: 'bells', boulevard: 'boulevard',
};
const ALTS: ReadonlyArray<readonly [AltCue, Alt]> = [['kiss', 'A'], ['kiss', 'B'], ['splat', 'A'], ['splat', 'B']];
const MUSIC: ReadonlyArray<readonly [Motif, Variant]> = [['B', 'rising'], ['B', 'parted'], ['C', 'rising'], ['C', 'parted']];

export function setMusicHooks(get: () => MusicHooks | undefined): void {
  musicHooks = get;
}

function pill(label: string, k: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.dataset.k = k;
  return b;
}
function heading(text: string): HTMLElement {
  const h = document.createElement('div');
  h.textContent = text;
  h.className = 'snd-h';
  // the row is a wrapping flex line (shell.css #snd .row): a heading takes the whole line
  h.style.cssText = 'flex:0 0 100%;font-size:11px;color:var(--ink-soft);margin-top:4px';
  return h;
}

/** Fill #sndRow: cues, the two recipes of kiss and splat, ambience bursts, bird voices, music (05 2.6 item 2). */
export function renderSoundCheck(): void {
  const row = $('sndRow');
  const parts: HTMLElement[] = [heading(t('sheet.sound.cues'))];
  for (const id of CUE_IDS) parts.push(pill(id, 'cue:' + id));
  parts.push(heading(t('sheet.sound.alts')));
  for (const [id, alt] of ALTS) parts.push(pill(id + ' ' + alt, `alt:${id}:${alt}`));
  parts.push(heading(t('sheet.sound.ambience')));
  for (const b of BURSTS) parts.push(pill(BURST_LABEL[b], 'amb:' + b));
  parts.push(heading(t('sheet.sound.birds')));
  VOICE_NAMES.forEach((n, i) => parts.push(pill(n, 'bird:' + i)));
  parts.push(heading(t('sheet.sound.music')));
  for (const [m, v] of MUSIC) parts.push(pill(`${m} ${v}`, `mus:${m}:${v}`));
  parts.push(pill(t('sheet.sound.stop_music'), 'mus:stop'));
  row.replaceChildren(...parts);
}

let flip = false; // the voice-like cues alternate f and m on each press, so both pitches are heard

/** One press: unlock and resume the context, then play (or toast when muted). Exported for the tests. */
export function press(k: string): void {
  unlockAudio();
  if (isMuted()) {
    toast('sheet.sound.muted');
    return;
  }
  const c = viewCentreTile();
  const [kind, a, b] = k.split(':');
  if (kind === 'cue') {
    flip = !flip;
    cue(a as CueId, c.x, c.y, { voice: flip ? 'f' : 'm' });
  } else if (kind === 'alt') playAlt(a as AltCue, b as Alt, c.x, c.y);
  else if (kind === 'amb') burst(a as Burst);
  else if (kind === 'bird') singVoice(Number(a), 0, 0.024);
  else if (kind === 'mus') {
    const h = musicHooks();
    if (!h) toast('toast.sound_music_dev');
    else if (a === 'stop') h.stop();
    else h.play(a as Motif, b as Variant);
  }
}

/** Wire the sheet's one delegated click (once). */
export function initSoundCheck(): void {
  if (wired) return;
  wired = true;
  $('sndRow').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-k]');
    if (b?.dataset.k) press(b.dataset.k);
  });
}
