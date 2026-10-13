# Recurring seven-day preview

`shared/recurringPreview.ts` exports `generateRecurringPreview(spec, horizon, timezone?)`.
It has no I/O, effects, storage or UI. This is the first scheduling slice, separate
from the interval allocator and recurring-item persistence.

Run the example without an Atlas account:

```sh
npx tsx scripts/preview-recurring.ts scripts/fixtures/weekly-routine.json
```

The JSON envelope contains `spec`, `horizon: { startDate: "2026-10-12", days: 7 }`
and an optional labelled `timezone`. Exactly seven **local calendar dates** are
expanded. There is no host-timezone fallback. Repeated or skipped explicit clock
endpoints are reported; this version accepts same-day windows only.

Rules distinguish availability (capacity), fixed commitments (occupied time),
activities and named reserved buffers. Recurrence is either listed weekdays
(Sunday = 0) or a count of base/optional occurrences over the seven-date horizon.
Weekly sessions prefer spread days, at most one occurrence of each rule per day.
The array order is the declared placement priority: required occurrences first,
then optional ones. Availability is merged as a union. Occupied commitments,
activities and buffers block each other. Explicit duration components preserve
preparation, trips including travel, and unpacking separately.

An input is `{ label, value, placeholder? }`. With `value: null`, a supplied
placeholder remains labelled on every affected occurrence. Without one, the
dependent occurrence is unplaceable. Positive integer durations are required;
missing, zero and invalid duration estimates are never silently substituted.
An explicit estimate can use `value` only once it is actually supplied. The
`timezone` provenance key is reserved and cannot be used as a spec-input name.

Every occurrence, including unplaceable and optional ones, carries its source
rule, source reference, content revision, generator version, chosen labelled
inputs and placeholder flag. The revision is a canonical FNV-1a 64-bit UTF-16
content hash (object key order ignored, rule array order retained), not a security
token. Timezone and horizon are retained separately; changing an input in the
spec changes its revision. No current clock or random value affects generation.

Status is `feasible`, `provisional` (placeholder assumptions), `incomplete`
(missing inputs or ambiguous civil endpoints), `infeasible` (conflicting required
rules or required placement failure) or `invalid` (invalid contract/values).
Optional failures are still reported but do not invalidate the base preview.
Placement uses deterministic first/last fit; `no_slot` means this policy failed,
not a proof that every possible arrangement is impossible. It never relaxes a
constraint or discards a requested occurrence. `end_at_window_end` supports a
protocol that ends at eye closing without moving its prescribed endpoint.

The sleep record keeps wake time, target sleep onset, eye closing, and the
1–30-minute latency range distinct. The target must lie within the possible
onset range, which is not a guarantee of falling asleep at that instant. Exercise
and meal cutoffs are derived from target onset independently of eye closing.
The fixture conservatively finishes the whole gym visit, including travel, by
20:00, and dinner by 21:30. Weekday 09:00–18:00 is occupied work with lunch
included; no separate lunch is generated.

The fixture encodes the resolved WEEKLY_CASE rules. Its timezone, eye closing,
preparation/unpacking, meal/protocol durations and daily buffer are **agent
placeholder assumptions**, not new testimony from Tonio. Flexible day/time
choices are preview policy. The grocery trip uses the explicit upper end of
the stated 30–40-minute range. Home exercise counting toward gym is unresolved
and is not assumed. Meal-size proportional spacing, lunch observations,
holidays, application and feedback remain outside this slice.

Behavioral evidence: `tests/constraints/recurring-preview.test.ts`, automatically
included by the unchanged `npm run check`. No protected files or prior tests are
changed to register this module.

## Stage a bounded preview through Brain

Generator version `atlas.recurring-preview/v2` adds optional explicit sourced date
exclusions to availability/commitment windows: `exclusions: {dates: [...], source}`.
Excluded dates are omitted from that named window; other commitments and activities
still run. Invalid civil dates fail. This is a supplied date list, not an inferred
holiday jurisdiction or legal calendar. Keep its coverage current.

`shared/recurringActionPlan.ts` provides `prepareRecurringActions(preview, bindings,
previous)` and `recurringBatchPlan(batch, schemaRunId, createdAt)`. Selection is
explicit by source-rule ID. Capacity is never materialized. Selected placed
activities/buffers/short commitments retain occurrence, rule, content revision,
generator version, component durations and labelled inputs in the bounded action
reason. Existing action-contract size/duration limits are validated before staging.

Stable occurrence identities survive revision changes. Reusing the journal reports
unchanged, changed and retired output, without editing anything already staged;
only genuinely new occurrences are batched. Completed source reports and staged
IDs are saved by Brain's companion `scripts/atlas-recurring-stage.mjs`. It takes
private spec/journal paths as arguments and has no Atlas effect capability. Apply
only with the existing Brain button. Read subsequent Atlas feedback through the
existing receipt/export tools, then classify it in the host `schedule-feedback-review`.

New interface tests use invented routines in
`tests/constraints/recurring-action-plan.test.ts`. Earlier commit `181e8b8` already
contains personal routine values in `scripts/fixtures/weekly-routine.json`,
`tests/constraints/recurring-preview.test.ts` and this guide. This is a privacy
finding about preserved history, not newly supplied personal data. Do not place a
real routine or its generated output in this public repository.
