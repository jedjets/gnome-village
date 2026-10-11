// src/ui/i18n.ts
// t(key, params), plural, gender, the language switch and <html lang> (03 section 12, register 3.12).
// Nothing ported: GV had only the intro's `langs` table (12200-12213). NEW.
// TODO(S3): the choice persists in profile.settings.lang through save/store.ts.
import { en } from './strings/en.ts';
import { es } from './strings/es.ts';

export type Lang = 'en' | 'es';
export type Params = Record<string, string | number>;

const TABLES: Record<Lang, Record<string, string>> = { en, es };
let cur: Lang = 'en';
const warned = new Set<string>();
const listeners: Array<() => void> = [];

function fmtNum(v: number): string {
  const s = String(Math.round(v * 10) / 10);
  return cur === 'es' ? s.replace('.', ',') : s;
}

/** Look a key up in the active table and fill {name} placeholders; a value starting with '@' is itself a key. */
export function t(key: string, params?: Params): string {
  const s = TABLES[cur][key];
  if (s === undefined) {
    if (import.meta.env.DEV && !warned.has(key)) {
      warned.add(key);
      console.warn('i18n: missing key', key);
    }
    return key;
  }
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k];
    if (v === undefined) return m;
    if (typeof v === 'number') return fmtNum(v);
    return v.startsWith('@') ? t(v.slice(1)) : v;
  });
}

export function plural(key: string, n: number, params?: Params): string {
  return t(n === 1 ? key + '.one' : key + '.other', { n, ...params });
}

export function gender(key: string, sex: 'f' | 'm', params?: Params): string {
  return t(key + '.' + sex, params);
}

export function setLang(l: Lang): void {
  cur = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  for (const fn of listeners) fn();
}

export function lang(): Lang {
  return cur;
}

export function hasKey(key: string): boolean {
  return TABLES[cur][key] !== undefined;
}

/** Called after every setLang so static text can repaint. */
export function onLang(fn: () => void): void {
  listeners.push(fn);
}
