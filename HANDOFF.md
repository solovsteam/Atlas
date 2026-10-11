# Handoff

Last updated 2026-10-11.

## Scheduling capacity fixes (11 Oct)

- Implemented and verified on `atlas-scheduling-20261011`; leave the branch unmerged for the new experimental batch workflow recorded in Brain's CONSTRUCT.md, *Overnight coding on an experimental branch*. The overnight-coding thread's brief names this as Atlas's first batch content.
- Previews use only time remaining between now and the bounded horizon, count overlapping appointments once, and share duplicate-free active-task reservations with the Brain decision handoff. Linked appointments are not charged twice; completed tasks release capacity. Handoffs sort different UTC offsets by actual time. Unassigned metrics count each task once; all-day capacity follows actual elapsed time, including daylight-saving changes.
- `npm run check` passed: lint/build/MCP typecheck, 17 scheduling fixtures, actual MCP effect-layer/feedback checks, Brain adapter contract, 26 capacity/decision tests and 3 web-handoff tests. Of the first 19 capacity regressions, 16 failed against the original implementation. Two older fixtures were moved to future blocks so they still test appointment capacity/overflow after elapsed time is excluded. Existing lint and bundle-size warnings remain.
- No UI, migration, routine rule, background job, effect-layer contract or cloud data changed. Scheduling remains interval-level capacity allocation; it does not produce minute-by-minute placements or implement the recurring compiler.
- Portable task note is local to the worktree at `.handoff/atlas-scheduling-20261011.md`. Next: bring the verified commit into the single Atlas experimental branch, run combined checks, then include it in the human-reviewed batch. The existing main MCP process has not been restarted onto these branch-only changes.

## State

- Main now includes the already-promoted scientific Atlas and Brain surface contract (d17545b). The checkout started clean on `experiment/scientific-atlas`; `origin/main` already held the promotion (46628ec), and local main was fast-forwarded to the existing experiment tip before this work.
- Tonio's 5 Oct effect-layer decision implemented: his request for a schedule change in the current conversation authorizes fresh preview then apply, without a second confirmation. `humanApproved` records the request. Create-only task/link writes, own-account binding, ten-minute expiry and changed-snapshot refusal remain enforced.
- `npm run check` passes: lint (existing warnings), build, Brain MCP typecheck and all tests. New tests exercise actual MCP handlers and services with inert data: unchanged existing items/links, only task/scheduled_in creation, foreign/expired/lost/stale-preview refusal before writes, exact saved plan and duplicate-free retry. No live calendar writes made in this task.
- `scripts/brain-contract.test.ts` and Brain's companion adapter comments distinguish human-admin action-pulse issuance/undo from the conversational MCP path. Brain companion work: `/Users/tonio/.t3/worktrees/Brain/effect-layer`, branch `feature/effect-layer`.
- The 29 Sep real action-pulse demonstration remains historical; no replay or deletion performed.

## Next step

The effect-layer contract/tests are already committed on main (`17b8aca`). Integrate the scheduling-capacity branch through the experimental batch as above. Brain's earlier companion branch is tracked separately. Do not apply or replay calendar data as part of code integration.

## Decisions for the user

Atlas credential isolation from shell-capable hosts is undecided and was not built. `origin` is public; no personal data or credentials added.
