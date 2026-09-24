import type { SupabaseClient } from "@supabase/supabase-js";
import { schemaScheduleRunFromRow, type SchemaSchedulePlan, type SchemaScheduleRun, type ScheduleRunBaseline } from "@shared/schemaSchedule";
import type { Database, DbSchemaScheduleRunRow } from "../types/database";

type Client = SupabaseClient<Database>;

export async function fetchSchemaScheduleRuns(client: Client, userId: string): Promise<SchemaScheduleRun[]> {
  const { data, error } = await client
    .from("schema_schedule_runs")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => schemaScheduleRunFromRow(row as DbSchemaScheduleRunRow));
}

export async function findSchemaScheduleRun(client: Client, userId: string, schemaRunId: string): Promise<SchemaScheduleRun | null> {
  const { data, error } = await client
    .from("schema_schedule_runs")
    .select("*")
    .eq("owner_id", userId)
    .eq("schema_run_id", schemaRunId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? schemaScheduleRunFromRow(data as DbSchemaScheduleRunRow) : null;
}

export async function createSchemaScheduleRun(
  client: Client,
  userId: string,
  input: { schemaRunId: string; planDigest: string; plan: SchemaSchedulePlan }
): Promise<SchemaScheduleRun> {
  const { data, error } = await client.from("schema_schedule_runs").insert({
    owner_id: userId,
    schema_run_id: input.schemaRunId,
    plan_digest: input.planDigest,
    plan: input.plan,
    baseline: { actions: [], appliedAt: new Date().toISOString() },
    status: "applying"
  }).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create schedule run.");
  return schemaScheduleRunFromRow(data as DbSchemaScheduleRunRow);
}

export async function updateSchemaScheduleRun(
  client: Client,
  userId: string,
  runId: string,
  update: { baseline: ScheduleRunBaseline; status: "applied" | "failed" }
): Promise<SchemaScheduleRun> {
  const { data, error } = await client.from("schema_schedule_runs").update({
    baseline: update.baseline,
    status: update.status,
    updated_at: new Date().toISOString()
  }).eq("owner_id", userId).eq("id", runId).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Could not update schedule run.");
  return schemaScheduleRunFromRow(data as DbSchemaScheduleRunRow);
}

export async function deleteSchemaScheduleRun(client: Client, userId: string, runId: string): Promise<void> {
  const { data, error } = await client.from("schema_schedule_runs").delete().eq("owner_id", userId).eq("id", runId).select("id");
  if (error || !data?.length) throw new Error(error?.message ?? "Could not delete schedule run.");
}
