# Handoff

## Recurring generators (12 Oct 2026)

Implemented in reviewed thread `recurring-generators-20261012`, from main
17b8aca; the unapproved `brain-experimental` batch stays separate. Lazy live
references, universal field ownership, completed snapshots, visible clash
resolution, pause/delete/undo, fixed/flexible scheduling and the subscription
compiler are implemented. New recurrence state is distinct from legacy metadata.
`npm run check` passes, including real PostgreSQL migration/RLS/history and
runtime/transport tests. A live Luna/Medium worker compilation succeeded
(IR-7dcb2c14, two calls, zero schema changes); browser fixture review preserved
the old version on a real click. No calendar items were created.

Deployed: commit b206f05 was checked, fast-forwarded into main and pushed to
origin; Vercel completed the initial b206f05 deployment and its hosted bundle contains
the generator editor. The archive-restoration retry aadf781 and final timezone-reuse fix 8335d03
also deployed successfully; the hosted bundle confirms both. The earlier
37fd45b deployment failure was recovered without needing user sign-in. Migration 011 was applied transactionally through the Supabase
Management API and recorded in migration history. Live metadata confirms the
reference column, history RLS, invoker RPC and restrict FK; no recurring/history
rows were created. `local.atlas.recurrence-compiler` is installed from main with
the exact hosted Atlas origin allowed. Browser fetch from the hosted page to the
local bridge health endpoint returned 200/ready. A separate phone cannot reach it.
Temporary compiler/Vite fixture processes stopped. Keep-old and actual Undo
clicks passed on inert browser data. The full recurring scheduling/feedback loop
is still a separate unfinished Brain feature. Portable note:
`.handoff/recurring-generators-20261012.md` in that thread's Atlas worktree.
Guide and limits: `docs/RECURRING_GENERATORS.md`. Task complete; no user answer
or approval is pending. Timezone-only changes reuse the saved predicate, verified
with a browser fixture showing zero compiler requests. All temporary services stopped.

Last updated 2026-10-06.

## State

- Main now includes the already-promoted scientific Atlas and Brain surface contract (d17545b). The checkout started clean on `experiment/scientific-atlas`; `origin/main` already held the promotion (46628ec), and local main was fast-forwarded to the existing experiment tip before this work.
- Tonio's 5 Oct effect-layer decision implemented: his request for a schedule change in the current conversation authorizes fresh preview then apply, without a second confirmation. `humanApproved` records the request. Create-only task/link writes, own-account binding, ten-minute expiry and changed-snapshot refusal remain enforced.
- `npm run check` passes: lint (existing warnings), build, Brain MCP typecheck and all tests. New tests exercise actual MCP handlers and services with inert data: unchanged existing items/links, only task/scheduled_in creation, foreign/expired/lost/stale-preview refusal before writes, exact saved plan and duplicate-free retry. No live calendar writes made in this task.
- `scripts/brain-contract.test.ts` and Brain's companion adapter comments distinguish human-admin action-pulse issuance/undo from the conversational MCP path. Brain companion work: `/Users/tonio/.t3/worktrees/Brain/effect-layer`, branch `feature/effect-layer`.
- The 29 Sep real action-pulse demonstration remains historical; no replay or deletion performed.

## Next step

Commit and push the effect-layer contract/tests on main per Atlas rules. Brain integrates/deploys its companion tests and docs separately. Reload an existing Atlas MCP process to receive the new conversational contract.

## Decisions for the user

Atlas credential isolation from shell-capable hosts is undecided and was not built. `origin` is public; no personal data or credentials added.
