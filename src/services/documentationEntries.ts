import type { SupabaseClient } from "@supabase/supabase-js";
import { entryFromDbRow, entryToDbInsert, type DocumentationEntry } from "@shared/documentationEntries";
import type { Database, DbDocumentationEntryRow } from "../types/database";

type Client = SupabaseClient<Database>;

// Supabase returns at most 1000 rows per request; read in pages.
const PAGE_SIZE = 1000;

let channelCount = 0;

/**
 * Calls `onChange` after any insert, update or delete of the tracker's
 * entries, and returns the function that stops listening. Each call gets its
 * own channel name: the realtime client returns an existing channel when the
 * name repeats, and adding listeners to a subscribed channel throws. Two views
 * of one tracker (the buttons and the history page) both listen.
 */
export function subscribeToEntryChanges(client: Client, itemId: string, onChange: () => void): () => void {
  channelCount += 1;
  const channel = client
    .channel(`documentation_entries:${itemId}:${channelCount}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "documentation_entries", filter: `item_id=eq.${itemId}` }, onChange)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "documentation_entries", filter: `item_id=eq.${itemId}` }, onChange)
    // DELETE payloads only carry the id, so a filtered DELETE listener would miss them.
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "documentation_entries" }, onChange)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

/** Newest first; `limit` keeps only the most recent entries. */
export async function fetchEntries(client: Client, userId: string, itemId: string, limit?: number): Promise<DocumentationEntry[]> {
  const rows: DbDocumentationEntryRow[] = [];
  for (let from = 0; limit === undefined || from < limit; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("documentation_entries")
      .select("*")
      .eq("owner_id", userId)
      .eq("item_id", itemId)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, Math.min(from + PAGE_SIZE, limit ?? Number.POSITIVE_INFINITY) - 1);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...((data ?? []) as DbDocumentationEntryRow[]));
    if (!data || data.length < PAGE_SIZE) {
      break;
    }
  }
  return rows.map(entryFromDbRow);
}

export async function createEntry(
  client: Client,
  userId: string,
  itemId: string,
  occurredAt: Date,
  data: Record<string, unknown> = {}
): Promise<DocumentationEntry> {
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new Error("Invalid time");
  }
  const { data: row, error } = await client
    .from("documentation_entries")
    .insert({ owner_id: userId, item_id: itemId, occurred_at: occurredAt.toISOString(), data })
    .select("*")
    .single();
  if (error || !row) {
    throw new Error(error?.message ?? "Could not save the entry");
  }
  return entryFromDbRow(row as DbDocumentationEntryRow);
}

/** Replaces the entry's data (stage, situations); the time and tracker stay. */
export async function updateEntryData(
  client: Client,
  userId: string,
  id: string,
  data: Record<string, unknown>
): Promise<DocumentationEntry> {
  const { data: row, error } = await client
    .from("documentation_entries")
    .update({ data })
    .eq("id", id)
    .eq("owner_id", userId)
    .select("*")
    .single();
  if (error || !row) {
    throw new Error(error?.message ?? "Could not update the entry");
  }
  return entryFromDbRow(row as DbDocumentationEntryRow);
}

export async function deleteEntry(client: Client, userId: string, id: string): Promise<void> {
  const { error } = await client.from("documentation_entries").delete().eq("id", id).eq("owner_id", userId);
  if (error) {
    throw new Error(error.message);
  }
}

/** Puts a deleted entry back with its original id and times (undo). */
export async function restoreEntry(client: Client, userId: string, entry: DocumentationEntry): Promise<void> {
  if (entry.ownerId !== userId) {
    throw new Error("Entry belongs to another account");
  }
  const { error } = await client.from("documentation_entries").insert(entryToDbInsert(entry));
  // 23505: the entry already exists, so it is already restored.
  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }
}
