/**
 * Supabase Auth can issue a fresh token whose "issued at" time is a few seconds
 * ahead of the REST server's clock, typically right after the token refreshes
 * when the app is reopened. PostgREST then refuses the request with
 * "JWT issued at future". The refusal happens before any query runs, so sending
 * the same request again once the clocks agree is safe for reads and writes.
 */
export function retryWhenJwtFromFuture(
  base: typeof fetch,
  delaysMs: number[] = [800, 1600, 3200],
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): typeof fetch {
  return async (input, init) => {
    // Only bodies that can be sent twice; supabase-js sends strings.
    const repeatable = init?.body === undefined || init.body === null || typeof init.body === "string";
    for (let attempt = 0; ; attempt++) {
      const response = await base(input, init);
      if (response.ok || !repeatable || attempt >= delaysMs.length) {
        return response;
      }
      const text = await response.clone().text();
      if (!/issued at future/i.test(text)) {
        return response;
      }
      await sleep(delaysMs[attempt]!);
    }
  };
}
