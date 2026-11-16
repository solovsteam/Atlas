export const muted = 'text-[var(--sleep-muted)]';
export function minutes(value: number | null): string { return value === null ? 'Not recorded' : `${Math.round(value)} min`; }
export function duration(value: number | null): string {
  if (value === null) return 'Not recorded';
  const rounded = Math.round(value);
  return `${Math.floor(rounded / 60)} h ${rounded % 60} min`;
}
export function shortDate(date: string): string { return `${Number(date.slice(8))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(date.slice(5, 7)) - 1]}`; }
