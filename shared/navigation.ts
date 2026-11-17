export const TAB_IDS = ["/", "/tasks", "/items", "/calendar", "/track", "/sleep", "/intake", "/archive"] as const;
export const DEFAULT_BAR = ["/", "/calendar", "/track", "/intake", "/sleep"];
export const NAVIGATION_METADATA_KEY = "atlas_phone_navigation";

/** Empty arrays are valid: every tab can be reached through More. */
export function normalizeNavigation(value: unknown, available: readonly string[] = TAB_IDS): string[] {
  if (!Array.isArray(value)) return DEFAULT_BAR.filter(id => available.includes(id));
  const ids = [...new Set(value.filter((id): id is string => typeof id === "string" && available.includes(id)))].slice(0, 5);
  return ids.length || value.length === 0 ? ids : DEFAULT_BAR.filter(id => available.includes(id));
}

export function splitNavigation(value: unknown, available: readonly string[] = TAB_IDS) {
  const bar = normalizeNavigation(value, available);
  return { bar, more: available.filter(id => !bar.includes(id)) };
}

export function tabIsActive(pathname: string, tab: string) {
  return pathname === tab || (tab !== "/" && pathname.startsWith(tab + "/"));
}
