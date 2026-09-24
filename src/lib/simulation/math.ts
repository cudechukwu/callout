/** Clamps `value` into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Linear interpolation: t=0 -> a, t=1 -> b. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
