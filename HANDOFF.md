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

Next: final contract/undo checks, commit and main integration, then apply migration
011 and install the idle compiler service from the main checkout. Deployment and
live schema availability are not yet claimed. Portable note:
`.handoff/recurring-generators-20261012.md` in that thread's Atlas worktree.
Guide and limits: `docs/RECURRING_GENERATORS.md`.

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
