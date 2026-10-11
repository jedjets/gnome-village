// tests/strings.test.ts
// Locks register 3.12 and 03 section 12 item 8: EN and ES hold the same keys; every key the code and the DOM ask for exists.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../src/ui/strings/en.ts';
import { es } from '../src/ui/strings/es.ts';
import { t, plural, setLang } from '../src/ui/i18n.ts';

const ROOT = join(import.meta.dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('string tables', () => {
  it('en and es have identical key sets', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });
  it('no empty values', () => {
    for (const [k, v] of Object.entries(en)) expect(v.length, k).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(es)) expect(v.length, k).toBeGreaterThan(0);
  });
  it('every t(\'literal\') and plural(\'literal\') in src/ and every data-t in index.html exists in en', () => {
    const missing: string[] = [];
    for (const f of walk(join(ROOT, 'src'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([^']+)'[,)]/g)) if (!(m[1] as string in en)) missing.push(m[1] as string);
      for (const m of src.matchAll(/\bplural\('([^']+)'/g)) {
        for (const suffix of ['.one', '.other']) if (!(m[1] + suffix in en)) missing.push(m[1] + suffix);
      }
    }
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    for (const m of html.matchAll(/data-t(?:-aria)?="([^"]+)"/g)) if (!(m[1] as string in en)) missing.push(m[1] as string);
    expect(missing).toEqual([]);
  });
  it('t fills params, formats numbers per language, resolves @keys, returns the key when missing', () => {
    setLang('en');
    expect(t('hud.day', { n: 3, season: '@hud.season.autumn' })).toBe('Day 3 · Autumn');
    expect(plural('sheet.census.room', 1)).toBe('room for 1 more');
    expect(plural('sheet.census.room', 2)).toBe('room for 2 more');
    expect(t('nope.missing')).toBe('nope.missing');
    setLang('es');
    expect(t('hud.day', { n: 3, season: '@hud.season.autumn' })).toBe('Día 3 · Otoño');
    expect(t('rail.speed', { n: 2.5 })).toBe('2,5×');
    setLang('en');
  });
});
