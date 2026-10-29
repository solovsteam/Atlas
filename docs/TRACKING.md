# Trackers: noticing habits

A tracker records each time Tonio notices a habit he wants to break, such as scrolling social media. The design follows his theory that noticing is the most valuable step for avoiding a behaviour, and the research summarised below. Evidence is kept apart from design decisions.

## How it works

- **Three stages.** Each entry records when he noticed: at the urge (before starting), while doing it, or only afterwards. The time-wheel sheet has one button per stage, so choosing the stage also saves.
- **Urge now.** One tap records "noticed the urge, right now".
- **Plan.** One "when I notice, I will" plan per tracker, stored as the tracker item's body. It is shown right after each saved entry.
- **Situations.** Optional tags, such as "in bed". Atlas offers the tags used before, most frequent first. They can be added in the sheet or after a one-tap save.
- **History.** Columns per day, week or month split by stage, with a trailing average of the total. A second chart shows the share caught at the urge over the trailing window. Situations, time of day and every entry follow.
- **Storage.** Entries are rows in `documentation_entries` (migration 015). Stage and situations live in the entry's `data` as `stage` and `tags`. Entries from before this design have no stage and show as "Not recorded".

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

- **The count alone is ambiguous.** Noticing more often can raise the count while the behaviour itself falls. The stage separates the two, so the share caught at the urge is the main measure. This is a hypothesis built from the evidence, not a tested finding.
- **One plan, phrased as an action**, because of the if-then plan findings above.
- **The plan appears at the moment of noticing**, because that is when a replacement action has to happen.
- **Situations are optional**, so that recording stays one tap.

## Not built

- A documentation task completed by typing a value, such as a daily weighing.
- Opening the time wheel automatically when a chosen app opens (an iPhone Shortcuts automation).
