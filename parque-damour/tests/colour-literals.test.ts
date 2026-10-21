// tests/colour-literals.test.ts
// The grep of 07 S1.7 item 3 as a test (04 4.5 item 3): no colour literal (hex, rgb(, rgba(, hsl() in any src/**/*.ts
// outside src/render/ambient.ts. The raw grep matches a hex-shaped word such as "#debug" and the template `rgb(${` of
// core/math.ts: this test counts a hex only when a word character does not follow it, and rgb/rgba/hsl only when a digit
// opens the call, which is what a colour literal looks like.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');
const LITERAL = /#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![\w-])|\brgba?\(\s*\d|\bhsla?\(\s*\d/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('07 S1.7 item 3: colour literals live only in render/ambient.ts (and tokens.css)', () => {
  it('no src/**/*.ts outside render/ambient.ts holds a hex, rgb(, rgba( or hsl( literal', () => {
    const bad: string[] = [];
    for (const f of walk(SRC)) {
      const rel = relative(SRC, f);
      if (rel === 'render/ambient.ts') continue;
      const lines = readFileSync(f, 'utf8').split('\n');
      for (const [i, line] of lines.entries()) if (LITERAL.test(line)) bad.push(rel + ':' + (i + 1) + ': ' + line.trim());
    }
    expect(bad).toEqual([]);
  });
  it('render/ambient.ts does hold the palettes (the rule has one home)', () => {
    const text = readFileSync(join(SRC, 'render', 'ambient.ts'), 'utf8');
    expect((text.match(/#[0-9A-F]{6}/g) ?? []).length).toBeGreaterThan(100);
  });
});
