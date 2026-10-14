// src/entities/move.ts
// Walking along a path at the speeds of 02 5.4; arrival and waypoint radii; replan cooldown; blocked memory; crowd separation (03 2.5).
// Ported from GV 1511-1512 (blockTarget, blockedFor), 1516-1524 (giveUp), 1559-1568 (openNear), 1569-1582 (goTo, route reuse),
// 1600-1643 (moveGnome), 1646 (enterTile, as the hook: wearAt), 5586 (NO_SPACE), 5592-5598 (SEP_RX, SEP_RY, nudge), 5599-5621 (spaceOut).
// Verdict: PORT. Changes: the speeds of 02 5.4 by archetype and state (adult 3.0, child 2.6, elder 2.0, jogger 5.0, a pair strolling
// 2.4, chasing or fleeing 4.0); arrival 0.7, waypoint 0.44 (GV 0.35*S, 0.22*S), replan cooldown 0.6 s; a blocked step replans only when
// the cooldown has run out, counts one blocked step per such replan and gives up after 6 (GV replanned every frame and stopped after
// 6 frames); giving up remembers the target 60 s, at most 8 (02 5.5; GV 0.7 day), matched within 3.2 tiles (GV 1.6*S); a reached
// waypoint hands over to the next in the same step (GV 1621 stood still for a step at each, about 3 % of the speed, which the 08 2.3
// speed rows forbid); the Visitor record of 03 3.3 holds the walk: ptx, pty are the target (-99 none), `path` null means arrived or no
// errand, `blocked` counts blocked steps, `blockedList` holds [x, y, untilAbs] triples; partial is read off the path's last tile, not kept
// (GV g.partial); route reuse needs a new target on the tile of the walk's target, which then becomes ptx, pty and the path's last
// waypoint (GV kept the route for any target within 0.6*S = 1.2 tiles for 4 s, remembered the new one in g.tx and replanned toward it
// at the path's end; the 03 3.3 record holds only ptx, pty, so a target on another tile replans at once; the 4 s path age is dropped:
// the record has no field for it, and each tile entered is checked against the world); goTo's false means "partial", which a budget
// run out on a long detour to a reachable target also gives (astar.ts), so moveStep replans from the path's end before it gives up;
// positions are not clamped to 1..N-2 (the boundary is walkable, a gate's outside tile is the walker's own, 02 2.3); openNear searches
// the boundary ring too and jitters by 0.3 tile (GV 0.3*S rounds into the next tile); `face` is the sign of the screen x of the heading
// at camera angle 0 (the sim never reads the camera, 03 A5); spaceOut works on the unrotated iso axes with TW/2 and TH/2 (03 6.3 item 5,
// A5; GV read rotC, rotS: 09 4 row 32) and nudge refuses a blocked tile, the apron and a bridge edge. wearAt is called on every step
// that moved (02 11.1 item 1).
// Dropped from the range: 1518-1521 (gorgeSpan and the gorges), 1522 (clearMarks), 1573's 4 s path age, 1575 (PF_SWIM), 1581
// (detourCheck), 1583-1597 (detourCheck), 1599 (bridgeAt), 1602-1606 (float, swept, boat, adventure, inside, swim blend), 1624-1629
// (ride, cart, swim, wade, climb and slope speed factors), 1640 (walkPh: the renderer's), 1641-1642 (screenOf facing), 1647-1672 (the
// body of enterTile: ledges, splashes, sweeps, marks, climb counts, bridge uses), 5594-5596 (tileH, wetD tests: the ground is flat).
import type { XY } from '../core/math.ts';
import { clamp, TAU } from '../core/math.ts';
import { DAYLEN, T } from '../core/clock.ts';
import { rnd } from '../core/rng.ts';
import { BLOCK, I, KIND, Kind, N, inB, rebuildBlock } from '../world/grid.ts';
import { wearAt } from '../world/wear.ts';
import { findPath, ownOutside, walkable } from './astar.ts';
import type { Visitor } from './visitor.ts';

/* ---------- 02 5.4, 06 1.5, 06 1.6 ---------- */
export const SPD_ADULT = 3.0;
export const SPD_CHILD = 2.6;
export const SPD_ELDER = 2.0;
export const SPD_JOGGER = 5.0;
export const SPD_PAIR = 2.4;
export const SPD_CHASE = 4.0;
export const R_ARRIVE = 0.7;
export const R_WAYPOINT = 0.44;
export const REPLAN_T = 0.6; // s
export const GIVE_UP_STEPS = 6;
export const BLOCKED_MEMORY_T = 60; // s
export const CAP_BLOCKED_MEMORY = 8;
export const R_OPEN_NEAR = 3;
/** GV 1.6*S: a remembered target blocks any target within this box. */
export const BLOCKED_NEAR = 3.2;
/** GV 1.5*S: a walker whose replanned path is empty this far from its target gives up rather than counting as arrived. */
export const GIVE_UP_FAR = 3;
/** The jitter openNear adds so walkers sent to one blocked spot do not all stand on one point (GV 1566). */
export const OPEN_NEAR_JITTER = 0.3;
/** No target: GV's -99. */
export const NO_TARGET = -99;

/** The crowd's clear ellipse in px at zoom 1 (GV SEP_RX, SEP_RY 5592; 06 1.6). */
export const SEP_RX = 10;
export const SEP_RY = 8;
/** Register 3.1 TW and TH: render/camera.ts owns them; the sim may not import render (03 2.1), so the separation keeps its own copy. */
export const ISO_TW = 26;
export const ISO_TH = 13;

/** States spaceOut leaves alone (02 5.3 NO_SPACE: sit, chat, picnic, kiss, proposal, boat, shelter, chess and every reaction state of
 * 02 6.4 with the backfire laugh). brain.ts re-exports the set (03 2.5). */
export const NO_SPACE: Readonly<Record<string, true>> = {
  sit: true, chat: true, picnic: true, kiss: true, proposal: true, boat: true, shelter: true, chess: true,
  wipe: true, shake: true, stumble: true, chase: true, huff: true, flap: true, huddle: true, distracted: true, baffled: true, lost: true,
  duck: true, laugh: true,
};

/** Tiles per second for `v` now (02 5.4). */
export function speedOf(v: Visitor): number {
  if (v.st === 'chase' || v.st === 'flap') return SPD_CHASE; // chasing the pomeranian, fleeing a wasp
  // a pair strolling as one unit: the romance stage, or a couple's own loop between stages (06 1.5 SPD_PAIR, couples included)
  if ((v.st === 'stroll' && v.pairId !== 0) || (v.st === 'strollLoop' && v.coupleOf !== 0)) return SPD_PAIR;
  switch (v.archetype) {
    case 'child':
      return SPD_CHILD;
    case 'elder':
      return SPD_ELDER;
    case 'jogger':
      return SPD_JOGGER;
    default:
      return SPD_ADULT;
  }
}

function dist(v: XY, x: number, y: number): number {
  return Math.hypot(x - v.x, y - v.y);
}

/** Bridge-ness of a tile: water that a bridge opened (GV BRIDGE[i] > 0). Off the park: never. */
function onBridge(x: number, y: number): boolean {
  if (!inB(x, y)) return false;
  const k = KIND[I(x, y)];
  return (k === Kind.pond || k === Kind.canal) && BLOCK[I(x, y)] === 0;
}

/* ---------- blocked targets (GV 1511-1512) ---------- */

/** Remember a target `v` could not reach for 60 s; at most 8 (02 5.5). */
export function blockTarget(v: Visitor, x: number, y: number): void {
  v.blockedList.push(x, y, T.abs + BLOCKED_MEMORY_T / DAYLEN);
  while (v.blockedList.length > CAP_BLOCKED_MEMORY * 3) v.blockedList.splice(0, 3);
}

/** True while a remembered target lies within 3.2 tiles of (x, y); expired entries are dropped (GV blockedFor 1512). */
export function blockedFor(v: Visitor, x: number, y: number): boolean {
  const b = v.blockedList;
  for (let k = b.length - 3; k >= 0; k -= 3) {
    if ((b[k + 2] as number) < T.abs) {
      b.splice(k, 3);
      continue;
    }
    if (Math.abs((b[k] as number) - x) < BLOCKED_NEAR && Math.abs((b[k + 1] as number) - y) < BLOCKED_NEAR) return true;
  }
  return false;
}

/** The errand is given up: the target is remembered, the walker goes idle and decides again soon (GV giveUp 1516). */
export function giveUp(v: Visitor): void {
  blockTarget(v, v.ptx, v.pty);
  v.path = null;
  v.pi = 0;
  v.ptx = NO_TARGET;
  v.pty = NO_TARGET;
  v.blocked = 0;
  v.job = {};
  v.st = 'idle';
  v.t = 0;
  v.decideT = rnd(0.4, 1.2);
}

/* ---------- targets and paths (GV 1559-1582) ---------- */

/**
 * (x, y) itself when its tile is open; else the first open tile on the rings 1 to `r` around it (GV openNear 1559, ring order dy then
 * dx), jittered by up to 0.3 tile (two draws, x then y); null when none is open.
 */
export function openNear(x: number, y: number, r: number = R_OPEN_NEAR): XY | null {
  rebuildBlock();
  const rx = Math.round(x), ry = Math.round(y);
  if (inB(rx, ry) && BLOCK[I(rx, ry)] === 0) return { x, y };
  for (let k = 1; k <= r; k++)
    for (let dy = -k; dy <= k; dy++)
      for (let dx = -k; dx <= k; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== k) continue;
        const tx = rx + dx, ty = ry + dy;
        if (!inB(tx, ty) || BLOCK[I(tx, ty)] === 1) continue;
        const ox = tx + rnd(-OPEN_NEAR_JITTER, OPEN_NEAR_JITTER);
        return { x: ox, y: ty + rnd(-OPEN_NEAR_JITTER, OPEN_NEAR_JITTER) };
      }
  return null;
}

/** True when the walk ends short of its target: the last waypoint's tile (or the walker's, with no waypoint) is not the target's. */
function partial(v: Visitor): boolean {
  const p = v.path;
  const last = p && p.length > 0 ? (p[p.length - 1] as XY) : v;
  return Math.round(last.x) !== Math.round(v.ptx) || Math.round(last.y) !== Math.round(v.pty);
}

/**
 * Send `v` toward (tx, ty) (GV goTo 1569): the target is clamped into the park (unless it is the walker's own gate's outside tile) and
 * moved off a blocked tile (openNear); a new target on the tile of the walk's target keeps the route unless `force` (the new target
 * becomes ptx, pty and, when the path reaches that tile, its last waypoint); otherwise A* from the walker's tile, the last waypoint
 * snapped to the exact target. True when the path reaches the target, false when it is partial. False does not mean unreachable: the
 * 2600-node budget can run out on a long detour to a reachable target (findPath), and moveStep then replans from the path's end, so a
 * caller must not give the errand up (blockTarget) on false alone; moveStep gives up when a replan from there is still short.
 */
export function goTo(v: Visitor, tx: number, ty: number, force = false): boolean {
  let x = tx, y = ty;
  if (!ownOutside(Math.round(x), Math.round(y), v)) {
    x = clamp(x, 0, N - 1);
    y = clamp(y, 0, N - 1);
    const o = openNear(x, y);
    if (o) {
      x = o.x;
      y = o.y;
    }
  }
  if (!force && v.path && Math.round(x) === Math.round(v.ptx) && Math.round(y) === Math.round(v.pty)) {
    // the same errand: keep the route, but walk to the new target (GV kept it in g.tx, 1572; the record holds only ptx, pty)
    const p = v.path, last = p[p.length - 1];
    if (last && Math.round(last.x) === Math.round(x) && Math.round(last.y) === Math.round(y)) p[p.length - 1] = { x, y };
    v.ptx = x;
    v.pty = y;
    return !partial(v);
  }
  const r = findPath(v.x, v.y, x, y, v);
  const last = r.path[r.path.length - 1];
  if (last && last.x === Math.round(x) && last.y === Math.round(y)) r.path[r.path.length - 1] = { x, y };
  v.path = r.path;
  v.pi = 0;
  v.ptx = x;
  v.pty = y;
  return !r.partial;
}

/** Arrived: no path, the target kept for a later reuse. */
function arrive(v: Visitor): void {
  v.path = null;
  v.pi = 0;
  v.blocked = 0;
}

/**
 * One step of walking for `dt` sim seconds (GV moveGnome 1600-1643). Returns true when the walker moved. A path that ran out short of its
 * target is replanned once the cooldown allows, and given up when the target is still out of reach; a step into a tile that became
 * blocked replans (cooldown 0.6 s) and counts a blocked step, and the 7th in a row gives up (02 5.4).
 */
export function moveStep(v: Visitor, dt: number): boolean {
  if (v.replanT > 0) v.replanT = Math.max(0, v.replanT - dt);
  if (!v.path) return false;
  let wp = v.path[v.pi];
  while (wp && dist(v, wp.x, wp.y) < R_WAYPOINT) wp = v.path[++v.pi]; // a waypoint reached hands over to the next in the same step
  if (!wp) {
    if (dist(v, v.ptx, v.pty) < R_ARRIVE) {
      arrive(v);
      return false;
    }
    if (v.replanT > 0) return false;
    // the way ran out short of the target: try once more from here, and if it is still out of reach give the errand up
    const wasPartial = partial(v);
    goTo(v, v.ptx, v.pty, true);
    v.replanT = REPLAN_T;
    const p = v.path as XY[];
    const nowPartial = partial(v);
    if (p.length === 0 || (wasPartial && nowPartial && p.length <= 1)) {
      if (nowPartial || (p.length === 0 && dist(v, v.ptx, v.pty) > GIVE_UP_FAR)) giveUp(v);
      else arrive(v);
      return false;
    }
    wp = p[0] as XY;
  }
  const dx = wp.x - v.x, dy = wp.y - v.y, d = Math.hypot(dx, dy);
  const ux = dx / d, uy = dy / d;
  const step = Math.min(d, speedOf(v) * dt);
  const nx = v.x + ux * step, ny = v.y + uy * step;
  const ntx = Math.round(nx), nty = Math.round(ny);
  if (ntx !== Math.round(v.x) || nty !== Math.round(v.y)) {
    // the world may have changed under the plan: check the step is still allowed (GV 1635)
    if (!walkable(ntx, nty, v)) {
      if (v.replanT <= 0) {
        v.blocked++;
        if (v.blocked > GIVE_UP_STEPS) {
          giveUp(v);
          return false;
        }
        goTo(v, v.ptx, v.pty, true);
        v.replanT = REPLAN_T;
      }
      return false;
    }
    v.blocked = 0; // a new tile entered (GV enterTile 1646: the hook)
  }
  v.x = nx;
  v.y = ny;
  v.face = ux - uy < 0 ? -1 : 1; // screen x grows with x - y at camera angle 0
  wearAt(v, dt);
  return true;
}

/* ---------- personal space (GV 5592-5621) ---------- */

/** Move `v` by (dx, dy) unless that crosses into a blocked tile, off the park, or on or off a bridge (GV nudge 5593). */
export function nudge(v: Visitor, dx: number, dy: number): boolean {
  const nx = v.x + dx, ny = v.y + dy;
  const cx = Math.round(v.x), cy = Math.round(v.y), tx = Math.round(nx), ty = Math.round(ny);
  if (tx !== cx || ty !== cy) {
    if (!inB(tx, ty) || BLOCK[I(tx, ty)] === 1 || onBridge(tx, ty) !== onBridge(cx, cy)) return false;
  }
  v.x = nx;
  v.y = ny;
  return true;
}

/**
 * Ease apart every two visitors closer than the 10 x 8 px ellipse at zoom 1, measured on the unrotated iso axes (03 6.3 item 5, A5):
 * sideways across the screen, half the push each, quicker when one walks; NO_SPACE states are left alone (GV spaceOut 5599).
 */
export function spaceOut(list: readonly Visitor[], dt: number): void {
  rebuildBlock();
  const HX = ISO_TW / 2, HY = ISO_TH / 2;
  const n = list.length;
  for (let a = 0; a < n; a++) {
    const g = list[a] as Visitor;
    if (NO_SPACE[g.st]) continue;
    for (let b = a + 1; b < n; b++) {
      const o = list[b] as Visitor;
      if (NO_SPACE[o.st]) continue;
      let dx = o.x - g.x, dy = o.y - g.y;
      if (dx * dx + dy * dy > 2.5 * 2.5) continue; // nowhere near
      if (dx * dx + dy * dy < 1e-6) {
        const an = (g.id * 2.399) % TAU;
        dx = Math.cos(an) * 0.01;
        dy = Math.sin(an) * 0.01;
      }
      const sx = (dx - dy) * HX, sy = (dx + dy) * HY; // px at zoom 1, camera angle 0
      if ((sx * sx) / (SEP_RX * SEP_RX) + (sy * sy) / (SEP_RY * SEP_RY) >= 1) continue;
      const sg = Math.abs(sx) > 0.3 ? Math.sign(sx) : (g.id + o.id) & 1 ? 1 : -1; // which way, the pair decides once
      const gx = 0.7071 * sg, gy = -0.7071 * sg; // the world direction that runs across the screen
      const k = dt * (g.path || o.path ? 2.6 : 1.4) * 0.5; // half the push each; a walking pair parts quicker
      let a1 = nudge(g, -gx * k, -gy * k);
      let a2 = nudge(o, gx * k, gy * k);
      if (!a1 && !a2) {
        // hemmed in that way: try the other
        a1 = nudge(g, gx * k, gy * k);
        a2 = nudge(o, -gx * k, -gy * k);
        if (a1 && !a2) nudge(g, gx * k, gy * k);
        else if (a2 && !a1) nudge(o, -gx * k, -gy * k);
      } else if (a1 && !a2) nudge(g, -gx * k, -gy * k); // one of them is hemmed in: the other takes the whole step
      else if (a2 && !a1) nudge(o, gx * k, gy * k);
    }
  }
}
