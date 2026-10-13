// src/core/commands.ts
// The Command union {tick, side, kind, payload}, enqueue, applyPending, applyCommand with rejection reasons, the log, replay (03 section 5).
// NEW (GV applies from the UI directly, review section 4). Every player action is a Command; this file is the only place one is applied.
// S2 applies `speed`, `park.new` and `debug.weather` (registered by core/loop.ts); every other kind is rejected `reason.not_here` until the
// slice that owns it registers a handler with registerHandler (visitor.call S4, ability S6, avatar.* S7). S3: play/tools.ts registers `tool`
// (applyTool) and play/undo.ts registers `undo` (an empty stack is `reason.nothing_to_undo`); both pass the side and mode rules below first
// (park side only, `reason.not_in_avatar` in avatar mode, 03 5.3). A new park clears the undo stack through onResetCommands (03 5.6 item 5),
// and a restore clears it through onRestoreCommands (the undo history is not saved, so a load clears it: register 3.11, owner 2026-10-13).
// Layering (03 2.1): this file is core, so it cannot import the conductor or the tools. The tick it stamps (setTickSource), the step
// `replay` drives (setStepper) and the handlers are handed in by the layers above. It reads play/mode.ts, a leaf with no imports, for
// the mode rules of 03 5.3: the second named exception of 03 2.1 (L0 row).
import type { XY } from './math.ts';
import type { GateId, PairId, Side, VisitorId } from './ids.ts';
import { emit } from './events.ts';
import type { WeatherKind } from './weather.ts';
import { getAvatar, getMode, type AvatarId } from '../play/mode.ts';

export const LOG_CAP = 600; // 03 3.11

export const ABILITY_IDS = [
  'c_petals', 'c_bouquet', 'c_musician', 'c_sunbeam', 'c_umbrella', 'c_lamplight', 'c_picnic', 'c_rowboat', 'c_fireworks',
  'm_pigeon', 'm_sprinkler', 'm_peel', 'm_pomeranian', 'm_wasp', 'm_raincloud', 'm_rival', 'm_mime', 'm_fog', 'm_flock',
] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];

/** The side each avatar plays for (register 3.8). */
export const AVATAR_SIDE: Readonly<Record<AvatarId, 'cupid' | 'mischief'>> = {
  a_pigeon: 'mischief',
  a_pomeranian: 'mischief',
  a_mime: 'mischief',
  a_florist: 'cupid',
  a_busker: 'cupid',
  a_matchmaker: 'cupid',
};

/** What a tap resolved to when the UI picked it (the same shape as render/project.ts Hit; core cannot import render). */
export type Hit = { kind: 'visitor' | 'creature' | 'prop' | 'tile' | 'none'; id: number; tile: XY | null };
export type Target = { kind: 'tile'; x: number; y: number } | { kind: 'visitor'; id: VisitorId } | { kind: 'pair'; id: PairId } | { kind: 'park' };

export type ToolPayload =
  | { tool: 'path' | 'lawn' | 'pond'; at: XY; size: 1 | 2 | 3; stroke: number } // one command per painted centre; stroke groups them for undo
  | { tool: 'bed' | 'tree' | 'bench' | 'lamp' | 'remove'; at: XY }
  | { tool: 'picnic' | 'fountain' | 'kiosk' | 'bandstand'; at: XY } // at = north-west tile
  | { tool: 'bridge'; at: XY } // a water tile; the sim finds the crossing
  | { tool: 'hedge' | 'canal'; tiles: XY[] }; // the finished run, at most 14 tiles

export type Command = { tick: number; seq: number } & (
  | { side: 'park'; kind: 'tool'; payload: ToolPayload }
  | { side: 'park'; kind: 'undo'; payload: Record<string, never> }
  | { side: 'cupid' | 'mischief'; kind: 'ability'; payload: { id: AbilityId; target: Target } }
  | { side: 'cupid' | 'mischief'; kind: 'avatar.enter'; payload: { avatar: AvatarId } }
  | { side: 'cupid' | 'mischief'; kind: 'avatar.leave'; payload: Record<string, never> }
  | { side: 'cupid' | 'mischief'; kind: 'avatar.tap'; payload: { tile: XY; hit: Hit } }
  | { side: 'park'; kind: 'speed'; payload: { speed: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 } }
  | { side: 'park'; kind: 'park.new'; payload: { seed: number } }
  | { side: 'park'; kind: 'visitor.call'; payload: { gate: GateId | null } }
  | { side: 'park'; kind: 'debug.weather'; payload: { kind: WeatherKind } } // DEV builds and tests only
);
export type CommandKind = Command['kind'];

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A command as the UI builds it; enqueue stamps the tick and the sequence number. */
export type CommandInput = DistOmit<Command, 'tick' | 'seq'>;

export type ReasonKey = `reason.${string}`;
export type Result = { ok: true } | { ok: false; reason: ReasonKey };
export const OK: Result = { ok: true };
export function fail(reason: ReasonKey): Result {
  return { ok: false, reason };
}

const SIDE_ORDER: Readonly<Record<Side, number>> = { park: 0, cupid: 1, mischief: 2 };

let pending: Command[] = [];
let logList: Command[] = [];
let seqCounter = 0;
let generation = 0; // bumped by clearPending, so applyPending notices a new park in the middle of a batch
let tickSource: () => number = () => 0;
let stepper: (() => void) | null = null;
const handlers = new Map<CommandKind, (c: never) => Result>();
const resetHooks: Array<() => void> = [];
const restoreHooks: Array<() => void> = [];

/** The loop hands in the current tick: enqueue stamps tickSource() + 1 (03 5.2 item 1). */
export function setTickSource(fn: () => number): void {
  tickSource = fn;
}
/** The loop hands in one fixed step, which `replay` calls until the tick is reached. */
export function setStepper(fn: () => void): void {
  stepper = fn;
}
/** The module that owns a command kind registers how to apply it. A later registration replaces an earlier one. */
export function registerHandler<K extends CommandKind>(kind: K, fn: (c: Extract<Command, { kind: K }>) => Result): void {
  handlers.set(kind, fn as (c: never) => Result);
}

/** Stamp and queue a command for the next step. The UI calls this and nothing else (P2). */
export function enqueue(c: CommandInput): Command {
  const cmd = { ...c, tick: tickSource() + 1, seq: ++seqCounter } as Command;
  pending.push(cmd);
  return cmd;
}

/** Apply a command at the current tick at once and log it (the harness `apply`). */
export function applyNow(c: CommandInput): Result {
  return applyCommand({ ...c, tick: tickSource(), seq: ++seqCounter } as Command);
}

/**
 * Apply every pending command with tick <= `tick`, ordered by (tick, side park < cupid < mischief, seq) (03 5.2 item 2).
 * With `only`, apply just the commands of those kinds and leave the rest queued: a paused frame applies `speed` and `park.new` (03 4.6;
 * owner 2026-10-13), so the dial can unpause and a confirmed New starts the fresh park at once, while every other command waits for the
 * first step and the live order always equals the replay order (a `park.new` starts a new log, so it is never replayed).
 */
export function applyPending(tick: number, only?: ReadonlySet<CommandKind>): void {
  if (pending.length === 0) return;
  pending.sort((a, b) => a.tick - b.tick || SIDE_ORDER[a.side] - SIDE_ORDER[b.side] || a.seq - b.seq);
  const batch: Command[] = [];
  const keep: Command[] = [];
  for (const c of pending) (c.tick <= tick && (only === undefined || only.has(c.kind)) ? batch : keep).push(c);
  if (batch.length === 0) return;
  pending = keep;
  const g = generation;
  for (const c of batch) {
    if (g !== generation) break; // a park.new in this batch dropped the rest: they belonged to the old park
    applyCommand(c);
  }
}

/** The side and mode rules of 03 5.3; null when the command may go on to its handler. */
function validate(c: Command): ReasonKey | null {
  const side: Side = c.side;
  switch (c.kind) {
    case 'tool':
    case 'undo':
      if (side !== 'park') return 'reason.wrong_side';
      return getMode() === 'avatar' ? 'reason.not_in_avatar' : null;
    case 'ability': {
      const own = c.payload.id.startsWith('c_') ? 'cupid' : 'mischief';
      if (side !== own) return 'reason.wrong_side';
      return getMode() === 'avatar' ? 'reason.not_in_avatar' : null;
    }
    case 'avatar.enter':
      if (side !== AVATAR_SIDE[c.payload.avatar]) return 'reason.wrong_side';
      return getMode() === 'avatar' ? 'reason.wrong_mode' : null;
    case 'avatar.leave':
    case 'avatar.tap': {
      const av = getAvatar();
      if (getMode() !== 'avatar' || av === null) return 'reason.wrong_mode';
      return side === AVATAR_SIDE[av] ? null : 'reason.wrong_side';
    }
    case 'speed':
    case 'park.new':
    case 'visitor.call':
      return side === 'park' ? null : 'reason.wrong_side';
    case 'debug.weather':
      if (side !== 'park') return 'reason.wrong_side';
      return import.meta.env.DEV ? null : 'reason.not_here';
  }
}

function reject(c: Command, reason: ReasonKey): Result {
  emit({ kind: 'rejected', tick: c.tick, params: { reason, side: c.side, kind: c.kind } });
  return fail(reason);
}

/**
 * The only writer (03 5.2 item 3): validate, then hand to the kind's handler; on success log (the last 600) and emit `applied`, on failure
 * emit `rejected` and change nothing. It never toasts and never reads the camera or the DOM. `park.new` starts a new log, so it is not
 * logged itself.
 */
export function applyCommand(c: Command): Result {
  const why = validate(c);
  if (why) return reject(c, why);
  const h = handlers.get(c.kind);
  if (!h) return reject(c, 'reason.not_here');
  const res = h(c as never);
  if (!res.ok) return reject(c, res.reason);
  if (c.kind !== 'park.new') {
    logList.push(c);
    if (logList.length > LOG_CAP) logList.splice(0, logList.length - LOG_CAP);
  }
  emit({ kind: 'applied', tick: c.tick, params: { kind: c.kind, side: c.side } });
  return OK;
}

/** The applied commands, oldest first, at most 600. */
export function log(): readonly Command[] {
  return logList;
}

/**
 * A restore (save/store.ts restore, after the layers, ids and props are in place): the saved log comes back, the sequence counter stays
 * above every number in it, and the hooks of onRestoreCommands run.
 */
export function setLog(cmds: readonly Command[]): void {
  logList = cmds.map((c) => ({ ...c }) as Command);
  for (const c of logList) if (c.seq > seqCounter) seqCounter = c.seq;
  for (const fn of restoreHooks) fn();
}

/**
 * Run `fn` whenever setLog brings a saved log back (a restore). play/undo.ts empties its stack here, because the undo history is not saved
 * and a load clears it (register 3.11; owner 2026-10-13), and play/tools.ts re-derives its tree cycle from the restored props. Like
 * onResetCommands, this keeps this core module from importing play/ (03 2.1).
 */
export function onRestoreCommands(fn: () => void): void {
  restoreHooks.push(fn);
}

/** Drop everything queued: a new park or a restore makes the queued commands meaningless. */
export function clearPending(): void {
  pending = [];
  generation++;
}

/**
 * Run `fn` whenever resetCommands runs (a new park: core/loop.ts newPark, the `park.new` command included). play/undo.ts clears its stack
 * here (03 5.6 item 5), so this core module never imports play/ (03 2.1).
 */
export function onResetCommands(fn: () => void): void {
  resetHooks.push(fn);
}

/** A new park: nothing queued, an empty log, the sequence from 1, and the hooks of onResetCommands (the undo stack empties). */
export function resetCommands(): void {
  clearPending();
  logList = [];
  seqCounter = 0;
  for (const fn of resetHooks) fn();
}

export function pendingCount(): number {
  return pending.length;
}

/**
 * Re-enqueue `cmds` at their original ticks (and sequence numbers), then run steps until the tick reaches `upToTick`.
 * With an `upToTick` the clock has already passed, it only queues them (a real-time loop then applies them at those ticks).
 */
export function replay(cmds: readonly Command[], upToTick: number): void {
  for (const c of cmds) {
    pending.push({ ...c } as Command);
    if (c.seq > seqCounter) seqCounter = c.seq;
  }
  if (stepper) while (tickSource() < upToTick) stepper();
}
