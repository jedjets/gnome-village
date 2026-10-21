// tests/mem-storage.ts
// Not a test: the in-memory Storage that tests/save.test.ts and tests/save-profile.test.ts install on globalThis, since Node has no
// localStorage (never in src/).

/** An in-memory Storage that records every key written and can be told to throw, as a full or blocked browser storage does. */
export class MemStorage {
  map = new Map<string, string>();
  writes: string[] = [];
  failGet = false;
  failSet = false;
  failRemove = false;
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    if (this.failGet) throw new Error('SecurityError: the storage is blocked');
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.failSet) throw new Error('QuotaExceededError: the storage is full');
    this.writes.push(k);
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    if (this.failRemove) throw new Error('SecurityError: the storage is blocked');
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

export function install(value: unknown): void {
  Object.defineProperty(globalThis, 'localStorage', { value, configurable: true, writable: true });
}
/** A browser that refuses the storage outright: reading the global throws (blocked site data). */
export function installBlocked(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('SecurityError: access denied');
    },
  });
}
