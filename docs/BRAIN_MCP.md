# Brain tools for Atlas

Atlas provides a local MCP server so Brain agents running in Codex can read Atlas cloud data and prepare reviewed schedule changes. The server uses the same Supabase URL and public anon key as Atlas, signs in as the Atlas user with Google OAuth, and relies on Atlas row-level security. It never uses a service-role key and never makes model API calls.

## One-time setup

1. Resume the Atlas Supabase project if it is paused. Keep Atlas's existing local .env.local configuration.
2. In Supabase Auth URL Configuration, add this exact Additional Redirect URL: http://127.0.0.1:43149/callback
3. Apply supabase/migrations/009_schema_schedule_runs.sql. The read tools work without this table, but previews cannot be applied and schedule-run feedback cannot be saved until it exists.
4. From the Atlas folder, sign in with: npm run atlas:brain -- login

   This opens Google sign-in and stores the refreshed Supabase session under ~/.config/atlas/brain-tools-session.json, with owner-only file permissions. Sign out with npm run atlas:brain -- logout.
5. Register the local MCP server with Codex from the Atlas folder:

   codex mcp add atlas -- "$PWD/node_modules/.bin/tsx" --tsconfig "$PWD/tsconfig.brain-mcp.json" "$PWD/scripts/brain-atlas-mcp.ts" serve

   Reload Codex's MCP tools or restart Codex if atlas_* tools do not appear immediately. This registration is local to the Codex installation.

## Available tools

- atlas_identity checks the signed-in Atlas account.
- atlas_list_items and atlas_get_item read notes, tasks, intervals and documentation items.
- atlas_get_schedule_context reads active/later tasks, calendar intervals and scheduled_in links.
- atlas_preview_schema_schedule runs the existing Atlas scheduler against a Brain schedule plan without writing data.
- atlas_apply_schedule_preview creates only the plan's deterministic tasks and their scheduled_in links after the human explicitly approves that exact preview in the Codex conversation. Existing tasks and placements are not moved or deleted.
- atlas_list_schedule_runs and atlas_get_schedule_feedback read saved run receipts and compare them with the current schedule.

Schedule previews last ten minutes and are held in the local MCP process. A changed schedule or a Codex/MCP restart requires a new preview. A partially completed apply can be retried from a fresh preview; deterministic task IDs prevent duplicate tasks. If Atlas reports that schema_schedule_runs is missing from its schema cache, apply migration 009 in the Supabase project and retry.

The tools are intentionally bounded: there is no arbitrary SQL, unrestricted item mutation or service-role access. The current schedule apply operation only creates new plan tasks and placements. Use Atlas itself to edit or remove existing calendar data.
