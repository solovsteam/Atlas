/** Smallest step from 1, 2, 5, 10, 20, 50, … that needs at most four steps to reach `max`. */
export function niceScale(max: number): { top: number; step: number } {
  const target = Math.max(max, 1);
  for (let power = 1; ; power *= 10) {
    for (const base of [1, 2, 5]) {
      const step = base * power;
      if (target / step <= 4) {
        return { top: Math.ceil(target / step) * step, step };
      }
    }
  }
}
