# Brain automatic scheduling edits

The Brain scheduling loop has a separate bounded Atlas effect adapter. The older
schema-plan MCP tools remain create-only; the new adapter also moves existing
active tasks, changes work intervals and adjusts appointment times/durations.
The Brain kernel owns when to invoke it. A planner produces a typed plan; it
does not receive the signed-in session or an apply tool.

Apply `supabase/migrations/012_brain_edits.sql` after migration 011 before enabling
the Brain worker. The adapter uses Atlas's existing `.env.local` and private
`brain-tools-session.json` sign-in. No new credentials or model keys are needed.

Send one JSON object on stdin to `node scripts/brain-edit-adapter.mjs`. Stdout is
one `{ "ok": true, "result": ... }` response, or a nonzero exit and
`{ "ok": false, "uncertain": true|false, "error": "..." }`.

Supported requests:

- `{ "operation": "context" }` returns `ownerId`, `generatedAt`, `timeZone`,
  complete bounded task/interval scheduling fields and `scheduled_in` links in
  Atlas's camelCase domain format, plus the explicit `editContract` and a
  `schedulerPreview` from Atlas's real deterministic engine. Body excerpts stop
  at 2000 characters; unrelated notes and recurring predicate source are omitted.
  Reads page through Supabase and stop with an explicit blocker if row or 2 MiB
  bounds are exceeded.
- `{ "operation": "preview", "plan": ... }` stores a server-authored preview
  containing `previewId`, stable `requestId`, `planDigest`, `contextDigest`,
  `createdAt`, `expiresAt` and exact proposed `changes`. It expires in ten minutes.
  An already-applied request instead returns `{ "alreadyApplied": true,
  "receipt": ... }`.
- `{ "operation": "apply", "previewId": "UUID" }` atomically checks the own
  account, fresh complete item/link snapshot and preview expiry, then applies the
  edits and saves the receipt. Reapplying a committed request returns that receipt.
- `{ "operation": "receipt", "requestId": "stable-ID" }` reads its durable
  receipt or `null`. After a lost response, read this before doing anything else.
  Never replace an uncertain request with a new ID or replay individual writes.
- `{ "operation": "feedback", "requestId": "stable-ID" }` returns the receipt
  alongside current touched item/placement snapshots. These are observations;
  Brain must ask about an ambiguous cause instead of inventing a preference.
- `{ "operation": "undo", "requestId": "original-ID", "undoRequestId":
  "new-stable-ID" }` restores scheduling values only while the post-apply context
  is unchanged. Created tasks become cancelled and created intervals archived;
  their content and history survive. Changed context refuses undo for review.

Plans use `format: "brain-atlas.edits"`, `version: 1`, stable `requestId`, a
human-readable `reason` and 1–64 `operations`. The pure parser in
[`shared/brainEdits.ts`](../shared/brainEdits.ts) defines the exact fields:

| Kind | Required fields | Optional fields |
|---|---|---|
| `create_interval` | `id`, `title`, `startsAt`, `endsAt` | — |
| `update_interval` | `id`, `expectedRevision` | `title`, `startsAt`, `endsAt` (at least one) |
| `create_task` | `id`, `title`, `durationMinutes` | — |
| `update_task` | `id`, `expectedRevision` | `durationMinutes`, `fixedStartsAt`, `fixedEndsAt` (at least one; times nullable) |
| `place_task` | `taskId`, `expectedRevision`, `intervalId` | — |

IDs are UUIDs. A task created and placed in the same plan uses
`expectedRevision: 0` for its placement. An existing task uses its current
revision for every operation in the plan. `intervalId: null` removes its current
placement. A new interval must precede a placement referencing it in the plan.
Only one item edit and one placement per item are allowed. Unknown fields fail.

Times require explicit offsets. New/moved ranges start in the next 90 days,
last at most 24 hours and must not introduce overlapping intervals or fixed
appointments. Tasks have 1–1440 minute durations. Placement reserves the existing
1.25 duration buffer, respects due dates, fixed appointments and interval capacity.
An old nominal-duration routine can move without worsening its pre-existing
buffer deficit; new placements cannot introduce or worsen overbooking.

Recurring generators and occurrences fail closed: their field ownership, first
touch and review rules need a dedicated edit contract. Task deletion, account
changes, status changes and arbitrary content edits are absent from this effect
vocabulary. Existing non-scheduling content is never rewritten by this adapter.

Preview/apply serializes briefly against normal Atlas item/link writes, including
new rows, so freshness is checked in the transaction that commits the effects and
receipt. Receipts keep original/new raw database snapshots (snake_case fields);
the original snapshot of a newly created item is `null`. Existing item history
and the new append-only link history preserve prior values. There is no sequence
of separately committed item writes to repair after a partial apply.
