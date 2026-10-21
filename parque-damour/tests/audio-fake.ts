// tests/audio-fake.ts
// Not a test: a stand-in AudioContext for tests that want the real graph code of src/audio/engine.ts to run without a device (mute.test.ts).
// Every node is a plain object whose AudioParams record their calls; the counters say how many oscillators and noise sources were made.
// The window must exist (jsdom). Nothing in src/ imports this.

export type FakeCall = { node: string; call: string; args: unknown[] };

export interface FakeAudio {
  calls: FakeCall[];
  nodes: Array<Record<string, unknown>>; // every node made, in order (the first gain is the master)
  made: { osc: number; src: number };
  ctx: () => { state: string; currentTime: number } | null;
  uninstall(): void;
}

export function installFakeAudio(): FakeAudio {
  const calls: FakeCall[] = [];
  const nodes: Array<Record<string, unknown>> = [];
  const made = { osc: 0, src: 0 };
  let last: FakeCtx | null = null;
  const param = (name: string, value = 0): Record<string, unknown> =>
    new Proxy({ value } as Record<string, unknown>, {
      get(t, k: string) {
        if (k in t) return t[k];
        return (...args: unknown[]): void => {
          calls.push({ node: name, call: k, args });
        };
      },
      set(t, k: string, v) {
        t[k] = v;
        return true;
      },
    });
  const node = (kind: string): Record<string, unknown> => {
    const n = mk(kind);
    nodes.push(n);
    return n;
  };
  const mk = (kind: string): Record<string, unknown> => ({
    kind,
    type: '',
    buffer: null,
    connect: (d: unknown) => d,
    disconnect: () => undefined,
    start: () => undefined,
    stop: () => undefined,
    gain: param(kind + '.gain', 1),
    frequency: param(kind + '.frequency', 440),
    Q: param(kind + '.Q'),
    pan: param(kind + '.pan'),
    threshold: param(kind + '.threshold'),
    knee: param(kind + '.knee'),
    ratio: param(kind + '.ratio'),
    attack: param(kind + '.attack'),
    release: param(kind + '.release'),
  });
  const register = (c: FakeCtx): boolean => {
    last = c;
    return true;
  };
  class FakeCtx {
    state = 'running';
    currentTime = 0;
    sampleRate = 8000;
    destination = node('destination');
    registered = register(this);
    createGain = (): Record<string, unknown> => node('gain');
    createBiquadFilter = (): Record<string, unknown> => node('biquad');
    createDynamicsCompressor = (): Record<string, unknown> => node('compressor');
    createConvolver = (): Record<string, unknown> => node('convolver');
    createStereoPanner = (): Record<string, unknown> => node('panner');
    createOscillator = (): Record<string, unknown> => {
      made.osc++;
      return node('osc');
    };
    createBufferSource = (): Record<string, unknown> => {
      made.src++;
      return node('source');
    };
    createBuffer = (_ch: number, n: number): { getChannelData: () => Float32Array } => ({ getChannelData: () => new Float32Array(n) });
    suspend = (): Promise<void> => {
      this.state = 'suspended';
      return Promise.resolve();
    };
    resume = (): Promise<void> => {
      this.state = 'running';
      return Promise.resolve();
    };
  }
  const w = window as unknown as { AudioContext?: unknown };
  const before = w.AudioContext;
  w.AudioContext = FakeCtx;
  return {
    calls,
    nodes,
    made,
    ctx: () => last,
    uninstall: () => {
      w.AudioContext = before;
    },
  };
}
