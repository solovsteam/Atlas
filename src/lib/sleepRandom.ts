/** Generate once at the action boundary. Never use Math.random for stored seeds. */
export function newSleepSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('');
}
