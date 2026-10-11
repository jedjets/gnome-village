// src/core/weather.ts
// Global weather state machine (kinds clear, fair, cloudy, breeze, rain, shower, mist, snow) and the castable overrides.
// Ported from GV 829-881 (W, updateWeather) in S2. ADAPT: no storm front, no spate, no tookBridge (03 6.2).
// TODO(S2): stepWeather, weatherAt, addOverride, removeOverride, overrides. S0 holds the typed state at calm so ambient.ts can read it.

export type WeatherKind = 'clear' | 'fair' | 'cloudy' | 'breeze' | 'rain' | 'shower' | 'mist' | 'snow';
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'fair', 'cloudy', 'breeze', 'rain', 'shower', 'mist', 'snow'];

export const W: {
  kind: WeatherKind;
  next: number;
  cloud: number;
  rain: number;
  mist: number;
  snow: number;
  wind: number;
  windP: number;
  drift: number;
  wet: number;
} = { kind: 'fair', next: 0, cloud: 0, rain: 0, mist: 0, snow: 0, wind: 0, windP: 0, drift: 0, wet: 0 };

export function stepWeather(_dt: number): void {
  // TODO(S2): eased targets, picks on the sim stream by the per-season weight table of 06.
}
