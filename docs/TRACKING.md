# Trackers: noticing habits

A tracker records each time Tonio notices a habit he wants to break, such as scrolling social media, or does a habit he wants to build, such as reality checks. The design follows his theory that noticing is the most valuable step for avoiding a behaviour, and the research summarised below. Evidence is kept apart from design decisions.

## How it works

- **Two kinds**, set per tracker on its page (stored in the item's `documentation_schema` as `{ tracker: { kind, dailyGoal } }`; without a setting a tracker is a habit to break):
  - **Habit to break** (for example Scrolled). "Urge now" records an urge in one tap. The tracker button opens the time wheel: saving at the present moment records "while doing it", a time moved into the past records "in hindsight". Entries saved before stages existed get their stage from the recording delay (more than 5 minutes after their time means in hindsight).
  - **Habit to build** (for example Reality check). No urge button. Entries can be tagged with what triggered them, and an optional daily aim shows as progress ("1 of 3 today") and as a level in the chart. The aim is a guide, not a pass mark: Tonio's real rule is "whenever event X happens, do it", so a day without the event is not a failure.
- **Plan or rule.** One per tracker, stored as the item's body: what to do when noticing a habit to break, or when to do a habit to build. It is shown right after each saved entry.
- **Tags.** Optional situations (habit to break) or triggers (habit to build), offered from earlier entries, most frequent first. They can be added in the sheet or after saving.
- **History.** A habit to break shows counts by stage and the share caught at the urge; a habit to build shows counts against the aim. Both show tags, time of day and every entry.
- **Storage.** Entries are rows in `documentation_entries` (migration 015). Stage and tags live in the entry's `data` as `stage` and `tags`.

## Evidence (read from abstracts and summaries, October 2026)

- Recording a behaviour changes it by itself ("reactivity"). Effects are usually small, vary between people, and can fade within weeks.
- Monitoring progress helps goal attainment, more when it is physically recorded (Harkin and others 2016, 138 randomized studies).
- Self-monitoring combined with another self-regulation technique, such as feedback or a plan, beat other interventions (Michie and others 2009).
- For strong habits, watching for slips was the most effective everyday strategy. For strong temptations, removing the trigger was better (Quinn, Pascoe, Wood and Neal 2010).
- Habit reversal training: awareness training alone helped some people in small studies; a prepared replacement action adds benefit. Awareness training includes noticing early warning signs.
- If-then plans that name a replacement action can override habits. Plans of the form "then I don't" did not work, and several plans for one habit weakened each other.
- A pause before opening an app reduced attempts to open it (one sec, Grüning and others 2023).
- Pauses in self-tracking are normal (Epstein and others 2015), so nothing here punishes a gap.

## Design reasons

- **Stages come from the time, not from a choice** (Tonio, 29 October): fewer decisions while recording, and "in hindsight" is exactly "recorded later".
- **The count alone is ambiguous.** Noticing more often can raise the count while the behaviour itself falls. The stage separates the two, so the share caught at the urge is the main measure. This is a hypothesis built from the evidence, not a tested finding.
- **One plan, phrased as an action**, because of the if-then plan findings above.
- **The plan appears at the moment of noticing**, because that is when a replacement action has to happen.
- **Situations are optional**, so that recording stays one tap.

## Not built

- Timed routines (next step): a routine is a bundle of written or unwritten tasks; each task's time is recorded with a stopwatch; tasks run one after another and their times do not depend on earlier tasks.
- A documentation task completed by typing a value, such as a daily weighing.
- Opening the time wheel automatically when a chosen app opens (an iPhone Shortcuts automation).
