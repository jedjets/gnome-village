// src/audio/cues-bind.ts
// bindCues(bus): every trigger of 05 3.2 on the event bus, and updateCueSources(dtr): the triggers the simulation leaves to be read from its
// state (footsteps by stride, the wasp and the sprinkler while they last, the Chat's murmur every 3 s of sim time, `ready` when a cooldown
// runs out with a charge left or the charges come back at f = 0). The proposal's ring is the sim's own `fx` spark, 8 s into the kneel.
// NEW (the cue table is 05 3.2; the event kinds are core/events.ts). Split from cues.ts (AGENTS rule 9, 03 2.8).
// Audio reads and never writes: this file subscribes with `watch` (frame listeners, delivered after the frame's steps), looks at the
// visitors, the creatures, the effects and the clock, and calls cue(). The simulation emits no `step` per stride (the `step` kind carries
// the gardener's paving and the stage steps of the feed, events.ts), so a footstep is a visitor moving 0.55 tile (STEP_STRIDE, 05 9 item 1)
// in the frame, read from `visitors`; a tile of gravel or flagstone sounds step_gravel, anything else step_lawn (05 3.2 rows 1 and 2).
// The triggers 05 names that no module emits yet are bound all the same and wait for their emitter: `watch` (S10 fireworks), `swoop`,
// `cue` (a generic carrier: params.id is a cue id), and the m_rival arrival (S10); `laugh` has the backfire's emitter only today.
import { log } from '../core/commands.ts';
import { watch, type EventFn, type EventKind, type GameEvent } from '../core/events.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { tick } from '../core/loop.ts';
import { I, KIND, Kind } from '../world/grid.ts';
import { byId, visitors } from '../entities/visitor.ts';
import { pairById } from '../entities/romance.ts';
import { chargesLeft, cooldownLeft, effects } from '../play/abilities.ts';
import { CUES, STEP_STRIDE, cue, type CueId, type CueParams } from './cues.ts';
import { audibleGain } from './engine.ts';
import { fireworksBurst, humLamps, later } from './ambience.ts';

/** The part of the event module bindCues needs, so a test hands in a spy. */
export interface EventBus {
  watch(kind: EventKind, fn: EventFn): void;
}

const NOWHERE = NaN; // an unpositioned cue (pan 0, a 1)
/** The talk bubble's turn in sim seconds, render/people.ts CHAT_TURN_S (a test keeps the two equal): the murmur follows the bubble. */
export const CHAT_TURN_S = 3;
const MURMUR_RETRY_S = 0.3; // a murmur another voice kept waiting (the 110 ms voice gate) tries again for this long into its turn
const BACKFIRE_GAP_S = 0.4; // the second member laughs 0.4 s after the first (05 3.3 item 5)
const BEAT_WASP = 30; // ticks: one `wasp` per 0.5 s (05 3.2 row 18)
const BEAT_SPRINKLER = 60; // ticks: one `sprinkler` per 1 s while it is up (row 19)

/** The voice of a visitor for a voice-like cue: its sex; a child laughs higher (05 3.3 item 3). */
export function voiceParams(id: number): CueParams {
  const v = byId(id);
  return v ? { voice: v.sex, child: v.archetype === 'child' || undefined } : {};
}
/** Where a visitor stands now, else the event's own place. */
function where(id: number | undefined, ev: GameEvent): { x: number; y: number } {
  const v = id ? byId(id) : undefined;
  return v ? { x: v.x, y: v.y } : { x: ev.x ?? NOWHERE, y: ev.y ?? NOWHERE };
}

/** The Sound check and the table: the cue an embarrassment kind sounds besides the victim's gasp (05 3.3 item 4). */
export const EMB_CUE: Readonly<Record<string, CueId>> = {
  poop: 'splat', soaked: 'sprinkler', trip: 'slip', snatched: 'snatch', wasp: 'wasp', rival: 'rival_hmm', mime: 'mime',
  drenched: 'plip', fog: 'foghorn', flock: 'flutter',
};

/* ---------- state read each frame (reset with the park) ---------- */
const strides = new Map<number, { x: number; y: number; d: number }>();
const beats = new Map<number, number>();
type Cooling = { side: 'cupid' | 'mischief'; id: string };
const cooling: Cooling[] = []; // casts whose cooldown has not run out yet
const awaitingDay: Cooling[] = []; // cooldown out but no charge left: `ready` waits for f = 0 (05 3.2 row 34)
const chatTurn = new Map<number, number>(); // pair id -> the 3 s turn its murmur last sounded for
let lastTick = 0;

function forgetSources(): void {
  strides.clear();
  beats.clear();
  cooling.length = 0;
  awaitingDay.length = 0;
  chatTurn.clear();
}
export function resetCueSources(): void {
  forgetSources();
  lastTick = 0;
}

/** The tile of the tool command a `applied` event stands for: the log's entry of that tick (05 3.2 row 37; the event carries no place). */
function toolAt(tk: number): { x: number; y: number } | null {
  const l = log();
  for (let i = l.length - 1; i >= 0 && (l[i] as { tick: number }).tick >= tk; i--) {
    const c = l[i] as (typeof l)[number];
    if (c.tick !== tk || c.kind !== 'tool') continue;
    const p = c.payload;
    if ('at' in p) return { x: p.at.x, y: p.at.y };
    const t = p.tiles[p.tiles.length - 1];
    return t ? { x: t.x, y: t.y } : null;
  }
  return null;
}

/** An embarrassment landed (05 3.3 item 4): the victim's gasp and the kind's own cue. Children are never embarrassed (02 13 T3). */
function embarrassed(ev: GameEvent): void {
  if (!ev.params?.landed) return;
  const vid = ev.ids?.[0], at = { x: ev.x ?? NOWHERE, y: ev.y ?? NOWHERE }, kind = String(ev.params.kind ?? ''); // the event holds the place it landed
  cue('gasp', at.x, at.y, { actor: vid, ...voiceParams(vid ?? 0) });
  const id = EMB_CUE[kind];
  if (!id) return;
  if (kind === 'drenched') for (let i = 0; i < 6; i++) cue('plip', at.x, at.y, { pan: (i % 2 ? 1 : -1) * (0.2 + 0.1 * i), delay: i * 0.08 });
  else if (kind === 'flock') for (let i = 0; i < 4; i++) later(i * 0.2, () => cue('flutter', at.x + (i - 1.5), at.y + (i % 2 ? 1 : -1)));
  else cue(id, at.x, at.y);
}

function cast(ev: GameEvent): void {
  const id = String(ev.params?.id ?? ''), x = ev.x ?? NOWHERE, y = ev.y ?? NOWHERE;
  cue('place', x, y); // any ability cast that passes validation, at its target (row 37)
  if (id === 'c_petals') cue('petals', x, y);
  else if (id === 'c_sunbeam') cue('sunbeam', x, y);
  else if (id === 'c_lamplight') humLamps();
  else if (id === 'm_sprinkler') cue('sprinkler', x, y);
  else if (id === 'm_wasp') cue('wasp', x, y);
  else if (id === 'm_rival') cue('rival_hmm', x, y);
  const side = ev.params?.side;
  if (id && (side === 'cupid' || side === 'mischief') && cooling.length < 16 && !cooling.some((c) => c.id === id)) cooling.push({ side, id });
}

/** An event's place as the (x, y) a cue takes. */
const at = (ev: GameEvent): [number, number] => [ev.x ?? NOWHERE, ev.y ?? NOWHERE];

/** Subscribe every trigger of 05 3.2. Called once at boot (main.ts); `bus` is the events module, or a spy in a test. */
export function bindCues(bus: EventBus = { watch }): void {
  const on = (kind: EventKind, fn: EventFn): void => bus.watch(kind, fn);

  on('sit', (ev) => ev.params?.prop === 'bench' && cue('bench_creak', ...at(ev)));
  on('stand', (ev) => ev.params?.prop === 'bench' && cue('bench_creak', ...at(ev)));
  on('laugh', (ev) => {
    (ev.ids ?? []).slice(0, 2).forEach((id, i) => {
      const go = (): void => {
        const w = where(id, ev);
        cue('laugh', w.x, w.y, { actor: id, ...voiceParams(id) });
      };
      if (i === 0) go();
      else later(BACKFIRE_GAP_S, go); // the backfire: both members, 0.4 s apart, no gasp (05 3.3 item 5)
    });
  });
  on('stage', (ev) => {
    const s = ev.params?.stage;
    if (s === '@stage.notice') cue('sigh', ...at(ev), { actor: ev.ids?.[0], ...voiceParams(ev.ids?.[0] ?? 0) });
    else if (s === '@stage.kiss') cue('kiss', ...at(ev));
  });
  on('linger', (ev) => cue('sigh', ...at(ev), { actor: ev.ids?.[0], ...voiceParams(ev.ids?.[0] ?? 0) }));
  on('embarrassed', embarrassed);
  on('watch', (ev) => cue('gasp', ...at(ev), { actor: ev.ids?.[0], ...voiceParams(ev.ids?.[0] ?? 0) })); // S10: at fireworks
  // the ring: the sparkle the sim puts 8 s into the kneel, at the pair (act-romance.ts HEARTS.ringAt; 05 3.2 row 9, "the kneeler")
  on('fx', (ev) => ev.params?.fx === 'spark' && ev.params.romance && cue('ring', ...at(ev)));
  on('newday', () => {
    // the charges are back at f = 0: an ability whose cooldown ran out with none left is ready now (row 34)
    for (const c of awaitingDay.splice(0)) if (chargesLeft(c.side, c.id) > 0) cue('ready', NOWHERE, NOWHERE);
  });
  on('happily', (ev) => {
    cue('happily', ...at(ev));
    fireworksBurst(ev.x ?? NOWHERE, ev.y ?? NOWHERE); // three bursts at the pair (05 4.9)
  });
  on('parted', (ev) => cue('parted', ...at(ev)));
  on('bouquet', (ev) => {
    const w = where(ev.ids?.[1], ev);
    cue('bouquet', w.x, w.y);
  });
  on('peck', (ev) => cue('coo', ...at(ev)));
  for (const k of ['scatter', 'fly', 'swoop'] as const) on(k, (ev) => cue('flutter', ...at(ev)));
  on('bark', (ev) => cue('yap', ...at(ev), { actor: ev.ids?.[0] }));
  on('snatch', (ev) => !ev.params?.drop && cue('yap', ...at(ev), { actor: ev.ids?.[0], pitch: 1.25 }));
  on('wall', (ev) => cue('mime', ...at(ev)));
  on('eat', (ev) => ev.params?.at === 'kiosk' && cue('clink', ...at(ev)));
  on('arrive', (ev) => cue('gate_hinge', ...at(ev)));
  on('leave', (ev) => cue('gate_hinge', ...at(ev)));
  on('lampsLit', () => humLamps());
  on('cast', cast);
  on('unlock', () => cue('unlock', NOWHERE, NOWHERE));
  on('rejected', (ev) => {
    // every refusal hud.ts toasts, with a sound: it keeps silent only for an avatar command that finds the mode already as asked (hud.ts watchResults)
    const r = ev.params?.reason;
    if (typeof r !== 'string' || !r.startsWith('reason.')) return;
    if (r === 'reason.wrong_mode' && String(ev.params?.kind ?? '').startsWith('avatar.')) return;
    cue('refuse', NOWHERE, NOWHERE);
  });
  on('applied', (ev) => {
    if (ev.params?.kind !== 'tool') return;
    const p = toolAt(ev.tick);
    cue('place', p?.x ?? NOWHERE, p?.y ?? NOWHERE);
  });
  on('step', (ev) => ev.params?.surface === 'gravel' && cue('step_gravel', ...at(ev))); // the gardener's paving rides on a gravel step
  on('cue', (ev) => {
    const id = ev.params?.id;
    if (typeof id === 'string') cue(id as CueId, ...at(ev));
  });
}

/** The tile kinds that sound as gravel underfoot (05 3.2 row 1); lawn, mulch, bed and a bridge sound as lawn (row 2). */
function hard(x: number, y: number): boolean {
  const k = KIND[I(Math.round(x), Math.round(y))];
  return k === Kind.gravel || k === Kind.flagstone;
}

/** Footsteps: a visitor that moved a whole stride this frame steps once (05 9 item 1). A jump of 3 tiles or more (a spawn, a gate) is no walking. */
function footsteps(): void {
  let seen = 0;
  for (const v of visitors) {
    seen++;
    const s = strides.get(v.id);
    if (!s) {
      strides.set(v.id, { x: v.x, y: v.y, d: 0 });
      continue;
    }
    const dist = Math.hypot(v.x - s.x, v.y - s.y);
    s.x = v.x;
    s.y = v.y;
    if (dist >= 3) {
      s.d = 0;
      continue;
    }
    s.d += dist;
    if (s.d < STEP_STRIDE) continue;
    s.d %= STEP_STRIDE;
    cue(hard(v.x, v.y) ? 'step_gravel' : 'step_lawn', v.x, v.y, { actor: v.id });
  }
  if (strides.size > seen + 8) for (const id of strides.keys()) if (!byId(id)) strides.delete(id);
}

/**
 * The Chat's murmur (05 3.2 row 4: every 3 s, the speaker alternates). The sim emits `chat` once, at the stage start, so the turns are read
 * as the talk bubbles are drawn (render/people.ts chatBubble): in place, the turn floor(sim s / 3 + pair id) % 2 names the speaker, and the
 * speaker murmurs once when his or her turn begins, in his or her own voice.
 */
function murmurs(): void {
  const s = T.abs * DAYLEN, talking = new Set<number>();
  for (const v of visitors) {
    if (v.st !== 'chat' || v.path) continue;
    const p = pairById(v.job.pairId ?? 0);
    if (!p) continue;
    talking.add(p.id);
    const clock = s / CHAT_TURN_S + p.id, turn = Math.floor(clock);
    if ((turn % 2 === 0 ? p.a : p.b) !== v.id || chatTurn.get(p.id) === turn) continue;
    // a second pair's speaker turns at the same instant: the voice gate holds it back a few frames, so it asks again early in its turn
    const heard = audibleGain(v.x, v.y) >= CUES.murmur.thresh;
    if (!cue('murmur', v.x, v.y, { actor: v.id, ...voiceParams(v.id) }) && heard && (clock - turn) * CHAT_TURN_S < MURMUR_RETRY_S) continue;
    chatTurn.set(p.id, turn);
  }
  if (chatTurn.size > talking.size + 8) for (const id of chatTurn.keys()) if (!talking.has(id)) chatTurn.delete(id);
}

/** The wasp every 0.5 s and the sprinkler every 1 s while their effect is up (rows 18 and 19), by the effect's age in ticks. */
function abilityLoops(): void {
  const now = tick(), live = new Set<number>();
  for (const e of effects) {
    const beat = e.ability === 'm_wasp' ? BEAT_WASP : e.ability === 'm_sprinkler' ? BEAT_SPRINKLER : 0;
    if (!beat) continue;
    live.add(e.id);
    const n = Math.floor((now - e.startTick) / beat), was = beats.get(e.id);
    beats.set(e.id, n);
    if (was !== undefined && n > was) cue(e.ability === 'm_wasp' ? 'wasp' : 'sprinkler', e.x, e.y);
  }
  if (beats.size > live.size) for (const id of beats.keys()) if (!live.has(id)) beats.delete(id);
}

/** Once per frame after the events: the triggers read from state (05 3.2 rows 1, 2, 4, 18, 19 and 34). */
export function updateCueSources(_dtr: number): void {
  const now = tick();
  if (now < lastTick) forgetSources(); // a New or a restore: the old timeline's strides, beats and cooldowns are not this park's
  lastTick = now;
  footsteps();
  murmurs();
  abilityLoops();
  for (let i = cooling.length - 1; i >= 0; i--) {
    const c = cooling[i] as Cooling;
    if (cooldownLeft(c.side, c.id) > 0) continue;
    cooling.splice(i, 1);
    if (chargesLeft(c.side, c.id) > 0) cue('ready', NOWHERE, NOWHERE); // a cooldown reached 0 with a use left (row 34)
    else if (awaitingDay.length < 16) awaitingDay.push(c); // a spent charge: the day's first moment (f = 0) is the ready moment
  }
}
