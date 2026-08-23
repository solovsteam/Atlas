# Atlas experiment: time-management practice + a novel scheduler

Branch: `experiment/scientific-atlas` from `origin/main` (`35eb93c`). **Do not merge to `main`.**

This branch tests how far Atlas can go by following widely established time-management advice where it is congruent, and by taking Atlas’s side where the product is deliberately new (intervals as capacity, Now as one thing). It does not inherit the uncommitted calendar/scheduling WIP on `main`. Product architecture still follows [ROADMAP.md](ROADMAP.md): one Item model, graph links, undo-not-confirm, `shared/` + `src/services/`.

## Intentional ROADMAP exception

ROADMAP auto-schedule v1 is **greedy assign by decreasing relevance into the earliest feasible interval**. This experiment does **not** use that as the default engine.

Placement default is **`delta_cost_switch`**: for each interval in time order, assign the feasible task with the highest *benefit of taking this slot rather than waiting*, minus a switching penalty. `earliest_fit` remains in the engine only as a baseline for fixtures.

## Two problems, two objectives

| Surface | Question | Objective |
|---------|----------|-----------|
| **Now** (`/`) | What should I start in this moment? | Tiny choice set (Hick). Appointments and already-committed work beat equally “important” unplaced work (implementation intentions). |
| **Tasks** (`/tasks`) | What is still open? | Working set. Done stays on screen until you refresh the list. |
| **Items** (`/items`) | What exists? | Library of notes and open work. Done stays until you refresh this list, then it lives in Archive. |
| **Calendar scheduler** | Where should work sit this week? | Minimize postponement cost under hard constraints; prefer contiguous same-context batches (attention residue). |

## Time-management map (what Atlas follows, what it refuses)

Widely repeated advice is mostly a **hybrid**, not one school. Capture and close open loops (Allen / GTD). Decide *when* in actual clock time (time blocking, “what gets scheduled gets done”). Protect one stretch of attention (Newport / Leroy). Keep the engage list tiny (MIT / The One Thing / Hick).

| Advice | Congruent? | Atlas |
|--------|------------|-------|
| Capture everything out of your head | Yes | Tasks is the inbox. Unlimited on purpose. |
| Someday/maybe so the working set stays honest | Yes | Status **later** — leaves Tasks/Now/scheduler; stays on Items. Not cancelled. |
| 2-minute rule | Yes, **only when idle** | Duration ≤2 min is not auto-scheduled. Now offers it only if you are not already in a block or appointment. |
| Time-block the day | Yes | Intervals = capacity. **Block morning/afternoon** creates today’s 09–12 / 13–17 (remaining time). |
| Don’t put next actions on the calendar (classic GTD) | **Atlas disagrees** | GTD meant: don’t fake a due date. Atlas intervals are “I intend to work,” not a deadline. Scheduler fills capacity. That’s the hybrid the literature already recommends. |
| Todo lists cause anxiety (Newport) | Split | Anxiety is an unbounded *engage* list. Now is one thing. Tasks can be long because it is capture, not Now. |
| Eat the frog first thing in the morning | **Rejected** | Chronotype evidence is mixed. We rank by importance and deadlines, not clock hour. |
| Eisenhower do/schedule/delegate/drop | Rejected as UI | Personal app has no delegate. Two axes still feed the scheduler. |
| Pomodoro timer | Not in-app | Atlas chooses *what* and *which block*. A kitchen timer is a different tool. |
| Limit WIP (kanban) | Split | Now WIP = 1. Tasks unbounded. **later** parks overflow without deleting it. |
| Planning fallacy | Yes | 1.25× duration buffer on placement. |
| Implementation intentions | Yes | `scheduled_in` is the if-then. Now prefers already-placed work. |
| Weekly review (GTD) | Yes, compressed | Calendar **Weekly look**: overdue, unscheduled next actions, later. |
| Hard dates only on the calendar (GTD) | Split | **Due today / this week** on Tasks are real deadlines for TMT. Intervals are capacity, not fake dues. |

When Atlas and a slogan conflict, the test is: **does the slogan assume a calendar of appointments, or a list with no capacity?** Atlas has both. Capacity wins over “never calendar tasks.” Focus wins over “do the 2-minute thing in the middle of deep work.”

## The open-the-app problem

A ranking engine cannot make you open Atlas. Opening the app is itself a task: low expectancy (“I’ll just feel guilty”), delayed value, easy to skip. That is why a phone Reminders list dies — it is **pull-only**, and opening it is aversive.

What actually works for time-true events is the OS calendar: it interrupts you. Atlas now does three things that borrow that, and refuses the thing that makes Reminders worse:

1. **Clock-true pings** (opt-in): 10 minutes before an appointment or work block, at the start, and once at 08:50 if today has no morning block. Never “you have 12 tasks.”
2. **`.ics` export** on Calendar: put the next 7 days into Apple/Google Calendar so the phone you already glance at does the interrupting.
3. **Capture in the header** so a visit can dump a thought without navigating.

**Hard wall:** if the browser is fully quit, the laptop is asleep, or iOS has not installed the PWA *and* Atlas is not open, a web app cannot wake you. That needs server web push (ROADMAP v2) plus you allowing it. No task app can create the *value* of the underlying work; if looking at obligations is itself the aversive thing, notifications get disabled and we are done. The app can only fail less at “I forgot this exists” and “opening this is punishment.”

Pin the tab or add Atlas to the dock/Home Screen, turn on pings, or import the calendar file. Those are the realistic habits. A prettier inbox is not.

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

- **Eat the frog at 09:00.** Importance and due dates already pull hard work forward; morning-only bias would punish night schedules.
- **Eisenhower 2×2 as UI policy** (do / schedule / delegate / drop). Two axes exist (derived urgency × importance) but Atlas is a personal system with no delegate/drop workflow.
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

Circadian energy, LLM enricher, **server** web push (app fully closed / iPhone without a worker), local-first sync, documentation items, recurrence materialization, assignment-lock UI.
