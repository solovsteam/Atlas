# Scientific Atlas experiment

Branch: `experiment/scientific-atlas` from `origin/main` (`35eb93c`). **Do not merge to `main`.**

This branch tests how far a scientifically grounded Atlas can go without inheriting the uncommitted calendar/scheduling WIP on `main`. Product architecture still follows [ROADMAP.md](ROADMAP.md): one Item model, graph links, undo-not-confirm, `shared/` + `src/services/`.

## Intentional ROADMAP exception

ROADMAP auto-schedule v1 is **greedy assign by decreasing relevance into the earliest feasible interval**. This experiment does **not** use that as the default engine.

Placement default is **`delta_cost_switch`**: for each interval in time order, assign the feasible task with the highest *benefit of taking this slot rather than waiting*, minus a switching penalty. `earliest_fit` remains in the engine only as a baseline for fixtures.

## Two problems, two objectives

| Surface | Question | Objective |
|---------|----------|-----------|
| **Now** (`/`) | What should I start in this moment? | Tiny choice set (Hick). Appointments and already-committed work beat equally “important” unplaced work (implementation intentions). |
| **Tasks** (`/tasks`) | What is still open? | Working set only. Done leaves immediately. |
| **Items** (`/items`) | What exists? | Catalog. Notes and tasks stay, including done/cancelled. Archive is a filter, not a hide. |
| **Calendar scheduler** | Where should work sit this week? | Minimize postponement cost under hard constraints; prefer contiguous same-context batches (attention residue). |

## Principles that change code

### Temporal Motivation Theory (Steel & König, 2006)

\[
\mathrm{Motivation}=\frac{\mathrm{Expectancy}\times\mathrm{Value}}{1+\Gamma\times\mathrm{Delay}}
\]

- **Value** = user importance (slider 0–10 → 0–100). Not mixed into a `createdAt` growth rate.
- **Expectancy** = 1 until we have a field (no fake confidence).
- **Delay** = days until due (deadline tasks) or days until a candidate slot (flexible tasks).
- Flexible tasks do **not** become urgent merely because they are old. That was the linear-from-`createdAt` failure mode: leftover junk saturates at 100.

**Postponement cost** at time \(t\) is how costly it is to still be undone then. **Delta** is cost at a later slot minus cost at this slot — the quantity earliest-fit throws away.

### Implementation intentions (Gollwitzer)

A `scheduled_in` link is the if-then plan. Now prefers clock-true appointments, then work already placed in the current interval / today, before suggesting new work.

### Attention residue (Leroy, 2009)

Switching from an unfinished task leaves residue. The scheduler penalizes consecutive assignments in the same interval that do not share a parent task or a tag. We do not split one task across intervals (one block per run).

### Hick’s law

Now shows **one primary**, a short committed queue, and at most **one** suggestion. Capture lives on Tasks; the library lives on Items.

### Planning fallacy (Kahneman & Tversky)

Placement uses duration × **1.25** so packing is less optimistic than the user’s estimate. The stored estimate is unchanged.

### Operations research

- Intervals are a scarce resource. Fixed appointments **consume overlapping capacity**.
- Benefit of an early slot ≈ postponement saved vs waiting until the horizon (or the due date).
- Smith’s WSPT (`value / buffered minutes`) is a secondary term so a 15-minute high-value task can beat a 3-hour medium task for a small remaining hole.
- Deadline feasibility is a hard filter (interval must end by `dueAt`).

## What we rejected

- **Eisenhower 2×2 as UI policy** (do / schedule / delegate / drop). Two axes exist (derived urgency × importance) but Atlas is a personal system with no delegate/drop workflow yet.
- **Linear `0.6 × urgency + 0.4 × importance` with urgency grown from `createdAt`.** Importance was double-counted on flexible tasks; age is not delay-to-reward.
- **Earliest-fit after a global sort.** Rank decides *who* is important; the slot should still be chosen by *marginal delay cost* and fit.

## Formulas (as implemented)

See `shared/scheduling/`. Defaults: \(\Gamma=1\), horizon 21 days, buffer 1.25, switch penalty 12, default duration 30 minutes.

Deadline postponement at \(t\): hyperbolic urgency \(100/(1+\Gamma\cdot d)\) where \(d=\max(0,\text{days until due from }t)\), 100 if \(t\) is past due; mixed with value as \(0.6u+0.4v\) **only after** urgency is computed (value does not change the curve shape).

Flexible postponement at slot \(t\): \(v\cdot(1-1/(1+\Gamma\cdot d/7))\) where \(d\) is days from *now* to \(t\) — later slots cost more for important work; creating the task last year does not.

Now motivation: TMT with delay = days until due (0 if overdue); flexible tasks score as value only.

## Engine strategies (for evaluation)

| id | Behavior |
|----|----------|
| `earliest_fit` | Sort by Now motivation, assign each to the earliest feasible interval (ROADMAP v1 analogue). |
| `delta_cost` | Walk intervals in time; pick max placement benefit, ignore switching. |
| `delta_cost_switch` | Same, minus switch penalty (default). |

Metrics: total postponement of the resulting assignment (unassigned tasks cost postponement at horizon), context-switch count inside intervals, assigned count.

Metrics from `npm run test:scheduling` (after last-chance deadline bonus): see fixture names in `shared/scheduling/fixtures.ts`. Last-chance rule: if no later interval can fit a task, a deadline gets +500 and a flexible task +80, so due-tonight work wins a single morning block over high-importance open work.

## Out of scope

Circadian energy, LLM enricher, web push, local-first sync, documentation items, recurrence materialization, assignment-lock UI.
