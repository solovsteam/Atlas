# Sleep screens

The screens are connected to the stored history and trial in the local `sleep/integrate` branch. The storage contract remains in [REACTION_TEST.md](REACTION_TEST.md).

The Sleep tab is one entry in `NAV` in `src/App.tsx`. Routes are `/sleep`, `/sleep/evening`, `/sleep/lights-out` and `/sleep/morning`. The overview links to the existing `/sleep/test` route. Sleep pages hide the general capture bar.

All three log routes accept `?entry=<documentation-entry-id>` for corrections. The overview also lists saved nights with correction links. The history views can use these addresses. A morning without an evening can be saved first. Its link then opens the evening on the same entry, marked `fromMemory`.

The default day rating is 4. The default quality is good. The default waking cause is the alarm. The onset picker uses the median of the latest 28 available onset values, rounded to five minutes, or 15 minutes without values. Intake buttons record a draft at the time of the tap. Save stores the complete part. An untouched wake time records the moment of Save.

Direct bedtime routes and Now cards treat midnight to noon as the preceding evening's night. The overview always shows the coming night and tomorrow's alarm. Its `?for=YYYY-MM-DD` links preserve that selection before noon. Historical corrections retain the recorded time zone for the edited part.

## Settings and intake

`useSleepLog().saveSettings` uses the existing item service and records item undo. Settings live under `documentation_schema.sleepLog.settings`. Unknown fields and sibling markers are preserved.

Additional settings are `usualDoses` with `melatonin`, `glycine` and `magnesium`, `coffeeTeaspoons`, and `weekdayWake`. Weekday keys use Sunday 0 through Saturday 6. A null value means no required wake time. Preparation remains `preparationMinutes`.

`SleepEvening.supplements` is an array of `{ supplement, dose, takenAt, timeZone }`. Units come from `SUPPLEMENTS` in `shared/sleepScreens.ts`. `earlyObligationAt` is an appointment's start instant. It is not a wake time.

`TrialSupplements` uses the manual `SupplementsTonight` controls for changes.
Before a trial starts, the controls keep their usual behavior. The normal-level
phase shows the instruction to take no evening supplements. The trial phase
uses `sleepTrialTonight`. The stored assignment takes precedence during corrections.
The confirmation is an explicit self-report, not an inferred dose or intake time.
A changed intake is marked as a deviation. An unconfirmed assignment stays unknown.

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
recorded choices, required wake times, and saved follow-up windows. The Now card
for the reaction test appears from the configured test time until local midnight
while today's completed test is missing. A practice test also completes that day.

## Required wake time

`requiredWakeForDate` chooses the earliest weekday wake time or appointment start minus preparation. The weekday setting already includes preparation, so preparation is not subtracted twice. The pure function also accepts explicitly classified work appointment instants for later integration.

There is no reliable work marker in the item model. Tags are free text. Interval kinds describe fixed, due or all-day timing. Titles are also free text. Therefore, the screens use weekday settings and the manually entered early obligation. Atlas appointments are not included. A reserved `work` tag on fixed appointments and intervals, or a dedicated work field, would make that integration reliable.
