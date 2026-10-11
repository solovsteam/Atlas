import type { ItemLink } from "./links";

/** Counts scheduled links per interval, including duplicate links. */
export function indexTaskCountsByInterval(links: ItemLink[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const link of links) {
    if (link.kind !== "scheduled_in") continue;
    counts.set(link.toId, (counts.get(link.toId) ?? 0) + 1);
  }
  return counts;
}
