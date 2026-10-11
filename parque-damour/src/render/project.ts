// src/render/project.ts
// World to screen, screen to tile, and the hit test (03 7.1 items 2 and 6, 8.2).
// Ported from GV 6382-6384 (sxOf, syOf, screenOf). PORT; the SEAS term is gone (flat ground).
// screenToTile is the closed-form inverse of 03 7.1 item 6, not GV's quad walk (6423-6442).
// TODO(S4): pickAt with the priority people > creatures > props > tile (GV 11231-11250).
import type { XY } from '../core/math.ts';
import { N, inB } from '../world/grid.ts';
import { APRON } from '../world/park.ts';
import { cam, view, TW, TH, EH, VANCH, rotXY, invRot } from './camera.ts';

export function sxOf(rx: number, ry: number): number {
  return view.cw / 2 + (rx - ry) * (TW / 2) * cam.z + cam.ox;
}
export function syOf(rx: number, ry: number, e = 0): number {
  return view.chh * VANCH + (rx + ry - (N - 1)) * (TH / 2) * cam.z - e * EH * cam.z + cam.oy;
}
export function screenOf(x: number, y: number, e = 0): XY {
  const r = rotXY(x, y);
  return { x: sxOf(r.x, r.y), y: syOf(r.x, r.y, e) };
}

/** The tile under a screen point, or null outside the park (or outside the apron when allowed). */
export function screenToTile(sx: number, sy: number, allowApron = false): XY | null {
  const u = (sx - view.cw / 2 - cam.ox) / ((TW / 2) * cam.z);
  const v = (sy - view.chh * VANCH - cam.oy) / ((TH / 2) * cam.z) + (N - 1);
  const w = invRot((u + v) / 2, (v - u) / 2);
  const x = Math.floor(w.x + 0.5), y = Math.floor(w.y + 0.5);
  if (inB(x, y)) return { x, y };
  if (allowApron && x >= -APRON && y >= -APRON && x < N + APRON && y < N + APRON) return { x, y };
  return null;
}

export type Hit = { kind: 'visitor' | 'creature' | 'prop' | 'tile' | 'none'; id: number; tile: XY | null };

export function pickAt(sx: number, sy: number): Hit {
  const tile = screenToTile(sx, sy);
  return tile ? { kind: 'tile', id: 0, tile } : { kind: 'none', id: 0, tile: null };
}
