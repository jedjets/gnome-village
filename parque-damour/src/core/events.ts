// src/core/events.ts
// The event bus: emit delivers at once to sim listeners (on) and queues for frame listeners (watch); drain(lite) after the frame's steps (03 2.3).
// NEW (GV logEv 10717 is the nearest thing). Payloads carry ids and i18n params, never records or sentences.
// Lite bits (03 4.5): bit 1 drops `fx` events and bit 2 drops `cue` events that were emitted after the first 8 steps of a frame. Nothing
// else is ever dropped, and the queue is not part of the state hash, so no bit can change a hashed value.
// The queue is capped (QUEUE_CAP) so a caller that steps without ever draining (a test, the harness) cannot grow it without bound.

export type EventKind =
  | 'newday' | 'season' | 'formed' | 'stage' | 'happily' | 'parted' | 'embarrassed' | 'backfired' | 'cast' | 'unlock'
  | 'fx' | 'cue' | 'rejected' | 'applied' | 'avatarStatus' | 'mode' | 'warn' | 'step' | 'sit' | 'stand' | 'chat' | 'laugh'
  | 'linger' | 'watch' | 'proposal' | 'bouquet' | 'peck' | 'scatter' | 'fly' | 'swoop' | 'bark' | 'snatch' | 'wall' | 'eat'
  | 'arrive' | 'leave' | 'lampsLit' | 'sing';

/** i18n parameters: a value starting with `@` is itself a key (03 12 item 6). */
export type Params = Record<string, string | number>;

export type GameEvent = { kind: EventKind; tick: number; x?: number; y?: number; params?: Params; ids?: number[] };
export type EventFn = (ev: GameEvent) => void;

export const QUEUE_CAP = 4096;
/** Steps of one frame that always deliver their `fx` and `cue` events (03 4.5). */
export const LITE_FREE_STEPS = 8;

const simListeners = new Map<EventKind, EventFn[]>();
const frameListeners = new Map<EventKind, EventFn[]>();
let queue: Array<{ ev: GameEvent; step: number }> = [];
let stepIdx = 0;

function add(map: Map<EventKind, EventFn[]>, kind: EventKind, fn: EventFn): void {
  const list = map.get(kind);
  if (list) list.push(fn);
  else map.set(kind, [fn]);
}

/** A sim listener: runs inside `emit`, in registration order. It may change sim state; it must never touch the DOM. */
export function on(kind: EventKind, fn: EventFn): void {
  add(simListeners, kind, fn);
}

/** A frame listener (ui, audio, effects): runs at `drain`, after the frame's steps. */
export function watch(kind: EventKind, fn: EventFn): void {
  add(frameListeners, kind, fn);
}

export function emit(ev: GameEvent): void {
  const sl = simListeners.get(ev.kind);
  if (sl) for (const fn of sl) fn(ev);
  if (!frameListeners.has(ev.kind)) return; // nobody watches this kind: do not queue it
  if (queue.length >= QUEUE_CAP) queue = queue.slice(queue.length - QUEUE_CAP + 1);
  queue.push({ ev, step: stepIdx });
}

/** Called once at the end of every sim step so `drain` knows which step an event came from. */
export function markStep(): void {
  stepIdx++;
}

/** Deliver the queued events to frame listeners in emission order, then empty the queue. */
export function drain(lite: number): void {
  const q = queue;
  queue = [];
  stepIdx = 0;
  const dropFx = (lite & 1) !== 0;
  const dropCue = (lite & 2) !== 0;
  for (const { ev, step } of q) {
    if (step >= LITE_FREE_STEPS && ((dropFx && ev.kind === 'fx') || (dropCue && ev.kind === 'cue'))) continue;
    const fl = frameListeners.get(ev.kind);
    if (fl) for (const fn of fl) fn(ev);
  }
}

/** A new park or a restore: the queued events belong to the old timeline. Listeners stay registered. */
export function clearEvents(): void {
  queue = [];
  stepIdx = 0;
}

/** Events waiting for the next drain (tests and the perf overlay). */
export function queued(): number {
  return queue.length;
}

/** Remove every listener (tests only; the game registers its listeners once at boot). */
export function clearListeners(): void {
  simListeners.clear();
  frameListeners.clear();
}
