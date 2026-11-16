# Sleep log: task briefs

Status: draft, 16 November 2026. Waiting for Tonio's approval. Nothing is built.

Each task is one piece of work for one coder. Do the tasks in order. Each task ends with a working state that Tonio can use. The specification is [SLEEP.md](SLEEP.md). The specification wins when a brief and the specification disagree. Ask Tonio before you change a decision in section 11 of the specification.

Rules for every task:

- Follow [AGENTS.md](../AGENTS.md): pure logic in `shared/`, data access in `src/services/` and hooks, undo instead of confirmation, `npm run check` before you say that the task works.
- Add new test files to the `test` script in `package.json`. Run time logic in several time zones, like `scripts/documentation-entries.test.ts`.
- Record what you did and what you checked in [HANDOFF.md](../HANDOFF.md).
- No database change is expected. If you need one, stop and ask.

## Task 1: the night record and its logic

Goal: pure logic for one night, with no screens.

- In `shared/sleepLog.ts`: the night record (specification section 5), the settings with their defaults (anchor 07:30, nine hours of sleep, test time 15:00, the six minute values for the buttons), and the derived values: time in bed, estimated sleep, usual sleep, shortfall, shift, early wake, required wake time, target lights out, choice night.
- The sleep log is one item. Mark it through `documentation_schema` (for example `{ sleepLog: { settings } }`). Each night is one row in `documentation_entries`, with the record in `data`. `isTracker` must exclude the sleep log.
- A night belongs to the date of its wake time. Store the time zone with each entry.

Done when: tests cover a normal night, a night across a change of daylight saving time, a missing evening log, a missing morning log, an early wake, a weekday choice night (Extend limited by the required wake time), and a weekend choice night.

## Task 2: the evening log and the morning log

Goal: Tonio can log a normal night with one tap in the evening and one tap in the morning.

- Two addresses: `/sleep/evening` and `/sleep/morning`. iPhone automations will open these addresses directly.
- Fields, defaults and rating texts exactly as in specification section 5. Reuse the time wheel and the tag chips from `src/components/tracking/`.
- The evening log creates the row of the night. The morning log completes the same row. A morning log without an evening log offers to fill the evening "from memory".
- Every save can be undone. Every value can be corrected later from the history.
- The Now page shows "Log last night" while the morning log of today is missing, and "Going to bed" after 21:00 while the evening log is missing.

Done when: both logs work on an iPhone-sized screen with the Atlas test account, including undo and a correction, and `npm run check` passes.

## Task 3: the reminders

Goal: the iPhone reminds Tonio at the right moments.

- Write step-by-step instructions for three iPhone Shortcuts automations: "when an alarm is stopped" opens `/sleep/morning`, a daily time opens `/sleep/evening`, and 15:00 opens the reaction test address of task 4. Write the instructions for Tonio, in plain language.
- Find out whether an automation opens Safari or the Home Screen copy of Atlas, and whether that copy is signed in. Record the answer.
- Show the current target lights out and the matching evening automation time in the sleep settings.

Done when: Tonio has set up the automations on his phone, and each one opens the right screen signed in. This check needs Tonio. Ask him for a time.

## Task 4: the reaction test

Goal: a daily 3-minute reaction test with a sleepiness rating.

- The PVT-B: 3 minutes, a stimulus after a random wait of 1 to 4 seconds, a lapse is a reaction slower than 355 milliseconds or no reaction. A tap before the stimulus counts as a false start. Store every reaction time, the number of lapses and false starts, the device, and the start time.
- After the test: the Karolinska Sleepiness Scale, 1 to 9, with the standard texts.
- Measure reaction times from the moment that the stimulus is drawn (use `requestAnimationFrame` and `performance.now()`). Record the browser and device, because their delay must stay constant.
- Mark the first three tests as practice.
- Store each test as its own entry of the sleep log item, so that a test can exist without a night record.

Done when: tests check lapse counting, false starts and practice marking with recorded reaction times, and one full test runs on an iPhone-sized screen.

## Task 5: the history views

Goal: Tonio sees his rhythm.

- "Nights": one bar per night from lights out to wake time, the anchor wake time as a line, choice nights and early wakes marked.
- "Regularity": the spread of wake times, of lights out and of estimated sleep over 7 and 28 days.
- "The window test": the share of early wakes and how early.
- "Measures": the four measures over time.

Done when: the views show invented sample data correctly, including gaps, and `npm run check` passes.

## Task 6: choice nights

Goal: on a late night, Tonio sees both losses and can let Atlas decide.

- The evening log detects a choice night (logic from task 1) and shows Keep and Extend with the expected shortfall and shift in minutes.
- Three buttons: Keep, Extend, and "decide for me". "Decide for me" picks Keep or Extend with equal chance and stores that the choice was random. The alarm field then shows the chosen time.
- No random choice when Keep was also the result on the two nights before. Then only Extend and his own choice are offered.
- The follow-up window starts with the next day and lasts until the second day with a required wake time.

Done when: tests cover detection, the rule about two earlier Keep nights, and the length of the follow-up window. The random choice uses a source that a test can replace.

## Task 7: the answer

Goal: Atlas answers "duration or timing?" when the data allows an answer.

- The normal level and the loss of each measure (specification section 8).
- After two weeks: the spread of each measure on ordinary days, and the estimated number of randomized choice nights that are needed.
- The straight-line model for each measure, fitted on randomized nights first, with ranges of uncertainty.
- The rules for a suggestion and for silence, exactly as in section 8. The suggestion appears in the evening log of a choice night.
- The monthly comparison with the plain rule (section 9).

Done when: tests with invented data check that Atlas stays silent with too little data, stays silent when measures disagree, and gives the expected suggestion when the invented data contains a clear difference.

## Task 8: supplements and medicine

Goal: Atlas records intake with one tap and runs the supplement trial of specification section 14. Start only after Tonio has answered the open questions of section 14.

- Morning log: methylphenidate taken or not, with its time (prefilled on weekdays), and a coffee button.
- Evening log: sleepiness at lights out (Karolinska scale), and time to fall asleep in minutes in the morning log.
- During the trial, the evening log shows tonight's assignment: what to take, how much and when. One tap confirms "taken as assigned". Another tap records a change.
- Nightly random assignment for fast-acting supplements, independent for each supplement. Random periods of two weeks for slow-acting supplements. A test can replace the random source.
- Normal levels separately for days with and without methylphenidate.
- The weekly estimate and the ending rule of section 14.
- Never a suggestion about the dose or time of methylphenidate. The suggestion to talk to the psychiatrist follows the rule in section 14.

Done when: tests check the assignment (balance, independence, periods), the separate normal levels, and that no output ever contains a methylphenidate dose or time as a suggestion.

## Later, only if Tonio asks

- Real notifications from Atlas (needs a server part).
- A watch or a ring as a data source.
