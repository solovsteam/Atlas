# Handoff

The current state of work, for whichever agent or session comes next. Overwrite sections as they change; history lives in Git. Last updated 2026-09-29.

## State

- Branch `experiment/scientific-atlas`, 11 commits ahead of `main`, is the one with the Brain tools and schema schedule runs. The Git workflow above says to work on `main`; which branch is deployed and whether to merge is the user's decision.
- `npm run check` passes: 3 lint warnings (`react-hooks/exhaustive-deps` in `AtlasDataContext.tsx`, `useAutosaveItem.ts`), build, all tests.
- Brain's action pulse created a real 30-minute run in a new block on Sat 3 Oct 2026 11:00–12:00 (task `dfe01b3a-…`, interval `99c6f843-…`). It is a demonstration; Brain can undo it.
- "Current limits" above may be stale: `008_item_links.sql` and link services exist.

## Next step

None in progress. Parked by the user: publishing interval-specific task lists to Fantastical through Todoist.

## Decisions for the user

- `origin` is a public repository.
