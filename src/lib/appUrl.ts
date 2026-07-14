const DEFAULT_APP_ORIGIN = "http://localhost:5173";

/** OAuth and bookmarks need a stable origin with an explicit scheme and port. */
export function getAppOrigin(): string {
  const fromEnv = import.meta.env.VITE_APP_URL?.trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeOrigin(window.location.origin);
  }

  return DEFAULT_APP_ORIGIN;
}

function normalizeOrigin(value: string): string {
  let trimmed = value.trim().replace(/\/$/, "");

  // Supabase or Safari sometimes omit the scheme (e.g. "localhost:5173").
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  // Catch common typos like http://localhost5173 (missing ":" before port).
  if (/^https?:\/\/localhost\d/i.test(trimmed)) {
    console.warn(
      `App URL "${trimmed}" looks malformed (missing ":" before port). Using ${DEFAULT_APP_ORIGIN} instead.`
    );
    return DEFAULT_APP_ORIGIN;
  }

  return trimmed;
}
