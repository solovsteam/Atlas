import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import type { Database } from "../src/types/database";
import { buildAtlasScheduleFeedback, applyAtlasSchedulePreview, findSchemaScheduleRun, getAtlasScheduleContext, listAtlasItems, listAtlasScheduleRuns, previewAtlasSchedule, type AtlasSchedulePreview } from "../src/services/brainTools";
import { fetchOwnedItems } from "../src/services/items";
import { fetchOwnedLinks } from "../src/services/links";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const callbackUrl = "http://127.0.0.1:43149/callback";
const sessionFile = join(homedir(), ".config", "atlas", "brain-tools-session.json");

type AuthValues = Record<string, string>;

class FileAuthStorage {
  private async read(): Promise<AuthValues> {
    try {
      const raw = await readFile(sessionFile, "utf8");
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as AuthValues : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error("Could not read the Atlas sign-in file. Run the Atlas tools logout command, then sign in again.");
    }
  }

  private async write(values: AuthValues): Promise<void> {
    const directory = dirname(sessionFile);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const temporary = sessionFile + "." + process.pid + ".tmp";
    await writeFile(temporary, JSON.stringify(values), { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, sessionFile);
    await chmod(sessionFile, 0o600);
  }

  async getItem(key: string): Promise<string | null> {
    return (await this.read())[key] ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const values = await this.read();
    values[key] = value;
    await this.write(values);
  }

  async removeItem(key: string): Promise<void> {
    const values = await this.read();
    delete values[key];
    await this.write(values);
  }

  async clear(): Promise<void> {
    await this.write({});
  }
}

function loadEnvironment(): { url: string; anonKey: string } {
  const file = join(root, ".env.local");
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    throw new Error("Atlas is missing .env.local. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY using Atlas's existing setup.");
  }
  const values: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2] ?? "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    values[match[1]!] = value.trim();
  }
  if (!values.VITE_SUPABASE_URL || !values.VITE_SUPABASE_ANON_KEY) {
    throw new Error("Atlas .env.local must define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return { url: values.VITE_SUPABASE_URL, anonKey: values.VITE_SUPABASE_ANON_KEY };
}

function createAtlasClient(): SupabaseClient<Database> {
  const { url, anonKey } = loadEnvironment();
  return createClient<Database>(url, anonKey, {
    auth: {
      storage: new FileAuthStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  });
}

async function openBrowser(url: string): Promise<void> {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.once("error", rejectPromise);
    child.once("spawn", () => {
      child.unref();
      resolvePromise();
    });
  });
}

async function login(): Promise<void> {
  const client = createAtlasClient();
  let resolveCallback!: (error: Error | null) => void;
  const callbackResult = new Promise<Error | null>((resolvePromise) => {
    resolveCallback = resolvePromise;
  });
  const server = createHttpServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? "/", callbackUrl);
      if (requestUrl.pathname !== "/callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      const providerError = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");
      let error: Error | null = null;
      if (providerError) {
        error = new Error("Atlas sign-in was not completed: " + providerError);
      } else if (!code) {
        error = new Error("The Supabase callback did not include an authorization code.");
      } else {
        const exchange = await client.auth.exchangeCodeForSession(code);
        if (exchange.error) error = exchange.error;
      }
      response.writeHead(error ? 400 : 200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(error
        ? "<!doctype html><title>Atlas sign-in failed</title><p>Sign-in failed. Return to Codex for details.</p>"
        : "<!doctype html><title>Atlas connected</title><p>Atlas is connected. You can return to Codex.</p>");
      resolveCallback(error);
    })().catch((error: unknown) => resolveCallback(error instanceof Error ? error : new Error("Atlas sign-in failed.")));
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(43149, "127.0.0.1", resolvePromise);
  });
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl, skipBrowserRedirect: true }
    });
    if (error) throw error;
    if (!data.url) throw new Error("Supabase did not return a sign-in URL.");
    await openBrowser(data.url);
    console.error("Complete Atlas sign-in in the browser. Waiting up to 3 minutes for the local callback.");
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Error>((resolvePromise) => {
      timeoutId = setTimeout(() => resolvePromise(new Error("Atlas sign-in timed out. Run the login command again.")), 180_000);
    });
    try {
      const result = await Promise.race([callbackResult, timeout]);
      if (result) throw result;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    const { data: userResult, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    console.error("Atlas connected" + (userResult.user.email ? " as " + userResult.user.email : "") + ".");
  } finally {
    server.close();
  }
}

function itemForTool(item: Awaited<ReturnType<typeof listAtlasItems>>[number], fullRecord = false) {
  const result = { ...item } as Record<string, unknown>;
  delete result.ownerId;
  if (!fullRecord) {
    result.body = item.body.slice(0, 1200);
    if (item.body.length > 1200) result.bodyTruncated = true;
    delete result.documentationData;
  }
  return result;
}

function linkForTool(link: Awaited<ReturnType<typeof getAtlasScheduleContext>>["scheduledIn"][number]) {
  const result = { ...link } as Record<string, unknown>;
  delete result.ownerId;
  return result;
}

function toolResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

async function requireUser(client: SupabaseClient<Database>) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    const message = error?.message.toLowerCase() ?? "";
    if (message.includes("future")) {
      throw new Error("Atlas's Supabase token is dated in the future. Check this Mac's date and time, then run Atlas sign-in again.");
    }
    throw new Error("Atlas is not connected. Run the Atlas login command first.");
  }
  return data.user;
}

function scheduleTableHelp(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/schema_schedule_runs|schema cache|PGRST205/i.test(message)) {
    return new Error("Atlas schedule-run history is not installed in Supabase. Apply supabase/migrations/009_schema_schedule_runs.sql, then retry. No schedule changes were made.");
  }
  return error instanceof Error ? error : new Error(message);
}

export function createServer(client: SupabaseClient<Database>): McpServer {
  const server = new McpServer(
    { name: "atlas-cloud", version: "0.1.0" },
    { instructions: "These tools read the signed-in user's Atlas account through its normal Supabase session and row-level security. Read items or schedule context as needed. For a Brain schedule plan, create a preview, explain its placements and unassigned actions to the human, and call atlas_apply_schedule_preview only after the human explicitly approves that exact preview. The approval flag is a record of the conversation decision, not a substitute for asking. Applying creates only the plan's deterministic tasks and scheduled_in links; it does not move existing tasks or change unrelated Atlas data. A preview expires after ten minutes and is tied to the schedule snapshot; if Atlas changes, preview again. Never request, expose, or use a service-role key." }
  );
  const previews = new Map<string, { ownerId: string; preview: AtlasSchedulePreview; expiresAt: number }>();

  server.registerTool("atlas_identity", {
    title: "Atlas connection",
    description: "Check which Atlas account is connected. This does not read schedule contents.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => {
    const user = await requireUser(client);
    return toolResult({ id: user.id, email: user.email ?? null, connected: true });
  });

  server.registerTool("atlas_list_items", {
    title: "Find Atlas items",
    description: "List or search the signed-in user's Atlas items. Results are capped at 100; use atlas_get_item for the full record of one item.",
    inputSchema: z.object({
      kind: z.enum(["all", "tasks", "intervals", "notes"]).default("all"),
      query: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(100).default(50)
    }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ kind, query, limit }) => {
    const user = await requireUser(client);
    const items = await listAtlasItems(client, user.id, { kind, query, limit });
    return toolResult({ count: items.length, items: items.map((item) => itemForTool(item)) });
  });

  server.registerTool("atlas_get_item", {
    title: "Read an Atlas item",
    description: "Read one item by its Atlas UUID, including task, interval, recurrence, and documentation fields.",
    inputSchema: z.object({ itemId: z.string().uuid() }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ itemId }) => {
    const user = await requireUser(client);
    const items = await listAtlasItems(client, user.id, { kind: "all", limit: 100_000 });
    const item = items.find((entry) => entry.id === itemId);
    if (!item) throw new Error("Atlas item not found.");
    return toolResult(itemForTool(item, true));
  });

  server.registerTool("atlas_get_schedule_context", {
    title: "Read Atlas schedule context",
    description: "Read active/later tasks, calendar intervals, and their scheduled_in links for schedule reasoning.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => {
    const user = await requireUser(client);
    const context = await getAtlasScheduleContext(client, user.id);
    return toolResult({
      generatedAt: context.generatedAt,
      timeZone: context.timeZone,
      tasks: context.tasks.map((item) => itemForTool(item)),
      intervals: context.intervals.map((item) => itemForTool(item)),
      scheduledIn: context.scheduledIn.map(linkForTool)
    });
  });

  server.registerTool("atlas_preview_schema_schedule", {
    title: "Preview a Brain schedule plan",
    description: "Run Atlas's existing scheduler against the user's current tasks and calendar without writing anything. Returns a short-lived preview ID and exact placements.",
    inputSchema: z.object({ plan: z.unknown() }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ plan }) => {
    const user = await requireUser(client);
    const preview = await previewAtlasSchedule(client, user.id, plan);
    const previewId = randomUUID();
    const expiresAt = Date.now() + 10 * 60_000;
    for (const [id, entry] of previews) if (entry.expiresAt <= Date.now()) previews.delete(id);
    previews.set(previewId, { ownerId: user.id, preview, expiresAt });
    return toolResult({
      previewId,
      expiresAt: new Date(expiresAt).toISOString(),
      schemaRunId: preview.plan.schemaRunId,
      planDigest: preview.planDigest,
      generatedAt: preview.generatedAt,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      horizonDays: preview.horizonDays,
      assignments: preview.assignments
    });
  });

  server.registerTool("atlas_apply_schedule_preview", {
    title: "Apply an approved schedule preview",
    description: "Create the previewed tasks and scheduled_in links in Atlas. Only call after the human explicitly approves this exact preview in the Codex conversation; set humanApproved to true only then. Does not move or edit existing tasks.",
    inputSchema: z.object({
      previewId: z.string().uuid(),
      humanApproved: z.boolean()
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
  }, async ({ previewId, humanApproved }) => {
    if (!humanApproved) throw new Error("The human has not approved this schedule preview.");
    const user = await requireUser(client);
    const entry = previews.get(previewId);
    if (!entry || entry.expiresAt <= Date.now()) {
      previews.delete(previewId);
      throw new Error("Schedule preview expired or was lost when the MCP process restarted. Create a fresh preview.");
    }
    if (entry.ownerId !== user.id) throw new Error("This preview belongs to a different Atlas account.");
    try {
      const result = await applyAtlasSchedulePreview(client, user.id, entry.preview);
      return toolResult({
        previewId,
        alreadyApplied: result.alreadyApplied,
        run: result.run,
        placedCount: result.placedCount,
        actionCount: entry.preview.plan.actions.length
      });
    } catch (error) {
      throw scheduleTableHelp(error);
    }
  });

  server.registerTool("atlas_list_schedule_runs", {
    title: "List Brain schedule runs",
    description: "Read up to 20 recent Brain-generated Atlas schedule run receipts. Requires Atlas migration 009.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10) }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ limit }) => {
    const user = await requireUser(client);
    try {
      const runs = await listAtlasScheduleRuns(client, user.id);
      return toolResult(runs.slice(0, limit));
    } catch (error) {
      throw scheduleTableHelp(error);
    }
  });

  server.registerTool("atlas_get_schedule_feedback", {
    title: "Read schedule feedback",
    description: "Compare a saved Brain schedule run with the current Atlas tasks and placements, including moves and edits made afterward.",
    inputSchema: z.object({ schemaRunId: z.string().regex(/^R-[a-f0-9]{32}$/) }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async ({ schemaRunId }) => {
    const user = await requireUser(client);
    try {
      const run = await findSchemaScheduleRun(client, user.id, schemaRunId);
      if (!run) throw new Error("Atlas schedule run not found.");
      const [items, links] = await Promise.all([fetchOwnedItems(client, user.id), fetchOwnedLinks(client, user.id)]);
      return toolResult(buildAtlasScheduleFeedback(run, items, links));
    } catch (error) {
      throw scheduleTableHelp(error);
    }
  });

  return server;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "login") return login();
  const client = createAtlasClient();
  if (command === "logout") {
    await client.auth.signOut();
    await new FileAuthStorage().clear();
    console.error("Atlas sign-in was cleared from this Mac.");
    return;
  }
  if (command !== "serve") {
    throw new Error("Use one of: login, logout, serve.");
  }
  await serveStdio(() => createServer(client));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
