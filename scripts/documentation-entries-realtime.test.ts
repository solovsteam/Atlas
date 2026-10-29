import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import { subscribeToEntryChanges } from "../src/services/documentationEntries";

// The real realtime client, pointed at a closed local port: no network or
// sign-in is needed to check how channels are named and reused.
test("two views of one tracker can both listen for entry changes", async () => {
  const client = createClient<Database>("http://127.0.0.1:9", "local-test-key");
  try {
    const stopButtons = subscribeToEntryChanges(client, "tracker-1", () => undefined);
    // The tracker page shows the buttons and the history at the same time.
    const stopHistory = subscribeToEntryChanges(client, "tracker-1", () => undefined);
    assert.equal(client.getChannels().length, 2);
    stopButtons();
    stopHistory();
  } finally {
    await client.removeAllChannels();
    client.realtime.disconnect();
  }
});
