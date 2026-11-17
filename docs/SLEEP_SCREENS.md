# Sleep screens

The screens use the stored history and trial. The storage contract remains in [REACTION_TEST.md](REACTION_TEST.md).

The Sleep tab is one entry in `NAV` in `src/App.tsx`. Routes are `/sleep`, `/sleep/evening`, `/sleep/lights-out` and `/sleep/morning`. The overview links to the existing `/sleep/test` route. Sleep pages and Intake hide the general capture bar.

All three log routes accept `?entry=<documentation-entry-id>` for corrections. The overview also lists saved nights with correction links. The history views can use these addresses. A morning without an evening can be saved first. Its link then opens the evening on the same entry, marked `fromMemory`.

The default day rating is 4. The default quality is good. The default waking cause is the alarm. The onset picker uses the median of the latest 28 available onset values, rounded to five minutes, or 15 minutes without values. The Intake tab at `/intake` saves each tap immediately. Save on a sleep screen stores the complete part. An untouched wake time records the moment of Save.

Direct bedtime routes and Now cards treat midnight to noon as the preceding evening's night. The overview always shows the coming night and tomorrow's alarm. Its `?for=YYYY-MM-DD` links preserve that selection before noon. Historical corrections retain the recorded time zone for the edited part.

## Settings and intake

`useSleepLog().saveSettings` uses the existing item service and records item undo. Settings live under `documentation_schema.sleepLog.settings`. Unknown fields and sibling markers are preserved.

Intake buttons live in `intakeButtons`. Each button has `id`, `substance`, `label`, `dose`, `unit` and `hidden`. Array order is display order. `substance` keeps its identity when the label changes. Old `usualDoses` and `coffeeTeaspoons` settings supply defaults until button settings are saved. Other settings include `weekdayObligation`. Each obligation stores `start`, `end` and `label`. Weekday keys use Sunday 0 through Saturday 6. A null value means no obligation. Monday to Friday default to 09:30 to 19:30 for work, travel and groceries. `weekdayWake` remains an optional explicit wake constraint, with null defaults. Preparation remains `preparationMinutes`. The required wake time is the earliest candidate, including the obligation start minus preparation.

Each intake is a separate documentation entry with `kind: 'intake'` and
`intake: { substance, label, dose, unit, takenAt, timeZone }`. Its `occurred_at`
is the taken time. Editing updates both the data and the entry time. Undo restores
both. The same form handles late entries and corrections, using the existing time
wheel. Dates in the daily list use the viewer’s time zone.

Old `morning.methylphenidate`, `morning.coffee` and `evening.supplements` are read
through `readIntakes`. Unknown old times and doses stay labelled as unknown.
Corrections to an old intake create an intake entry with `replacesLegacy`.
Deletion creates a `kind: 'intakeCorrection'` marker with the same legacy key.
The newest correction wins. Undo removes the new entry or restores its snapshot.
No old night is automatically rewritten.

The morning screen has no medicine or coffee controls. The evening screen has no
manual supplement controls. `TrialSupplements` still shows the assignment.
“Taken as assigned” immediately saves one intake per assigned supplement at the
current time and records the assignment. One undo reverses the complete action.
A partial write failure leaves the successful entries available for review and
undo. Atlas never automatically repeats the action.

Trial adherence reads intakes from four hours before target lights out through
actual lights out, including both boundaries. Daytime glycine falls outside that
window. Existing dose and timing checks still apply. Approximate timing remains
unknown when no tolerance is configured. Old self-report confirmations remain
evidence unless an actual intake contradicts them. A new confirmation uses intake
entries as evidence. `earlyObligationAt` remains an appointment’s start instant.

The Start action saves `settings.trial = { seed, normalLevelStartDate }` through
the existing settings service and undo. The seed comes from `crypto.getRandomValues`
and has no editable field. Dates refer to wake dates. The normal level lasts
14 dates. The trial starts on the next date and has no fixed end in this screen.

Choice nights show both expected losses and use `randomSleepChoice` for the
random option and the two-Keep refusal. A separate `settings.choiceSeed` is saved
before the first draw so choice nights also work before the supplement trial.
The two outcomes come from the immediately preceding calendar nights, including
own choices. A missing night breaks the sequence. Selecting an outcome changes
the draft alarm. Saving records `evening.choice` with the outcome, random flag,
wake date, alarm instant and follow-up window. A manual alarm or obligation edit
clears the draft choice. Shortfall uses measured usual sleep. With no measured
value, the screen labels its fallback to the sleep-duration setting.

The Sleep overview supplies `SleepHistory` with stored nights and reaction tests,
today's local date, and context from `sleepHistoryContext`. The context contains
recorded choices, required wake times, saved follow-up windows and normalized intakes. History classifies a day without a methylphenidate intake as without the medicine. The Now card
for the reaction test appears from the configured test time until local midnight
while today's completed test is missing. A practice test also completes that day.

## Required wake time

`requiredWakeForDate` chooses the earliest weekday wake time or appointment start minus preparation. The weekday setting already includes preparation, so preparation is not subtracted twice. The pure function also accepts explicitly classified work appointment instants for later integration.

There is no reliable work marker in the item model. Tags are free text. Interval kinds describe fixed, due or all-day timing. Titles are also free text. Therefore, the screens use weekday settings and the manually entered early obligation. Atlas appointments are not included. A reserved `work` tag on fixed appointments and intervals, or a dedicated work field, would make that integration reliable.
