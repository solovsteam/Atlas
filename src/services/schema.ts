import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

type Client = SupabaseClient<Database>;

let extendedSchemaCached: boolean | null = null;

export async function probeExtendedItemSchema(client: Client): Promise<boolean> {
  if (extendedSchemaCached !== null) {
    return extendedSchemaCached;
  }

  const { error } = await client.from("items").select("is_interval").limit(1);
  if (!error) {
    extendedSchemaCached = true;
    return true;
  }

  const message = error.message.toLowerCase();
  if (message.includes("is_interval") || message.includes("schema cache")) {
    extendedSchemaCached = false;
    return false;
  }

  return false;
}

export function resetExtendedSchemaCache(): void {
  extendedSchemaCached = null;
}
