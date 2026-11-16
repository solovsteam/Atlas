# Sleep screens

Implemented in the local `sleep/task2-screens` branch. The storage contract remains in [REACTION_TEST.md](REACTION_TEST.md).

The Sleep tab is one entry in `NAV` in `src/App.tsx`. Routes are `/sleep`, `/sleep/evening`, `/sleep/lights-out` and `/sleep/morning`. The overview links to the existing `/sleep/test` route. Sleep pages hide the general capture bar.

All three log routes accept `?entry=<documentation-entry-id>` for corrections. The overview also lists saved nights with correction links. The history views can use these addresses. A morning without an evening can be saved first. Its link then opens the evening on the same entry, marked `fromMemory`.

The default day rating is 4. The default quality is good. The default waking cause is the alarm. The onset picker uses the median of the latest 28 available onset values, rounded to five minutes, or 15 minutes without values. Intake buttons record a draft at the time of the tap. Save stores the complete part. An untouched wake time records the moment of Save.

Direct bedtime routes and Now cards treat midnight to noon as the preceding evening's night. The overview always shows the coming night and tomorrow's alarm. Its `?for=YYYY-MM-DD` links preserve that selection before noon. Historical corrections retain the recorded time zone for the edited part.

## Settings and intake

`useSleepLog().saveSettings` uses the existing item service and records item undo. Settings live under `documentation_schema.sleepLog.settings`. Unknown fields and sibling markers are preserved.

Additional settings are `usualDoses` with `melatonin`, `glycine` and `magnesium`, `coffeeTeaspoons`, and `weekdayWake`. Weekday keys use Sunday 0 through Saturday 6. A null value means no required wake time. Preparation remains `preparationMinutes`.

`SleepEvening.supplements` is an array of `{ supplement, dose, takenAt, timeZone }`. Units come from `SUPPLEMENTS` in `shared/sleepScreens.ts`. `earlyObligationAt` is an appointment's start instant. It is not a wake time.

`SupplementsTonight` exports an `assignment` prop. A later trial component can provide the assignment and one-tap confirmation through that prop. This branch makes no trial assignments.

## Required wake time

`requiredWakeForDate` chooses the earliest weekday wake time or appointment start minus preparation. The weekday setting already includes preparation, so preparation is not subtracted twice. The pure function also accepts explicitly classified work appointment instants for later integration.

There is no reliable work marker in the item model. Tags are free text. Interval kinds describe fixed, due or all-day timing. Titles are also free text. Therefore, the screens use weekday settings and the manually entered early obligation. Atlas appointments are not included. A reserved `work` tag on fixed appointments and intervals, or a dedicated work field, would make that integration reliable.
