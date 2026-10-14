// tests/rules.test.ts
// Locks the hard rules of 07 0.7 items 5 and 6 that a linter cannot see: no wall clock or Math.random outside core/loop.ts,
// no colour literal outside render/ambient.ts and styles/tokens.css, no font under 11 px in shell.css (04 5.2 item 7).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(SRC).map((p) => ({ rel: relative(SRC, p), text: p.endsWith('.woff2') ? '' : readFileSync(p, 'utf8') }));

describe('source rules (07 0.7)', () => {
  it('Math.random, Date.now and performance.now appear only in core/loop.ts', () => {
    const bad: string[] = [];
    for (const f of files) {
      if (!f.rel.endsWith('.ts') || f.rel === 'core/loop.ts') continue;
      if (/Math\.random|Date\.now|performance\.now/.test(f.text)) bad.push(f.rel);
    }
    expect(bad).toEqual([]);
  });
  it('colour literals live only in render/ambient.ts and styles/tokens.css', () => {
    const colour = /#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![\w-])|rgba?\(\s*\d/;
    const bad: string[] = [];
    for (const f of files) {
      if (f.rel === 'render/ambient.ts' || f.rel === 'styles/tokens.css' || f.rel.endsWith('.woff2')) continue;
      if (colour.test(f.text)) bad.push(f.rel);
    }
    expect(bad).toEqual([]);
  });
  it('shell.css has no font-size under 11px', () => {
    const css = files.find((f) => f.rel === 'styles/shell.css')?.text ?? '';
    const small: string[] = [];
    for (const m of css.matchAll(/font(?:-size)?:\s*(?:\d+\s+)?([\d.]+)px/g)) if (parseFloat(m[1] as string) < 11) small.push(m[0]);
    expect(small).toEqual([]);
  });
});
