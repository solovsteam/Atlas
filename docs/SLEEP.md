# Sleep log: duration or timing?

Status: draft specification, 14 November 2026. Measurement design added 16 November 2026, and Tonio's answers of the same day. Nothing is built. Section 11 lists the decisions that are still open. Written in a Renaissance conversation with Tonio.

## 1. The question

Tonio wants a stable rhythm: the same amount of sleep at the same clock times every day. Some nights break the rhythm, for example a late evening. On such a night he must choose between two losses:

- **Keep.** He wakes at the usual time. He loses sleep duration.
- **Extend.** He sleeps until he has slept enough. He loses sleep timing, because he wakes late.

The feature exists to answer one question with his own data: **on a given night, which loss costs him more?** The feature first collects the data. It gives a recommendation only when the data supports one.

## 2. What Tonio has decided

- Regularity over the long term matters more than one good next day.
- The required wake time is the same on every weekday. Weekends usually have no obligation.
- Nine hours of sleep is his upper limit (decided 16 November). It is the top of the range that the National Sleep Foundation recommends for adults (7 to 9 hours, Hirshkowitz and others 2015). The panel also said that durations outside the range may be appropriate for some people. Nine hours is therefore a setting, not a biological limit.
- Logging must be very easy. That is the design philosophy of Atlas.
- The first need is a reminder each evening and each morning to log the data.
- The alarm and the target wake time are 07:30 on every day, also on weekends. His weekday obligations would allow 08:00.
- Lights out leaves room for nine hours of sleep before 07:30. Lights out is therefore 22:30 minus the time that he usually needs to fall asleep.
- When he wakes by himself before 07:30, he gets up. He does not force himself to stay in bed.
- Reminders come from iPhone automations first.
- Atlas may decide at random between Keep and Extend on a choice night.
- He takes the reaction test every day. The reaction test must not be the only measure.
- No watch or ring records his sleep.

## 3. Terms

Each term has one meaning in this document and in the app.

| Term | Meaning |
|---|---|
| Anchor wake time | The wake time that the rhythm is built on: 07:30 on every day. A setting. |
| Window | The time in bed that leaves room for nine hours of sleep before the anchor wake time: nine hours plus his usual time to fall asleep. A setting. |
| Target lights out | The anchor wake time minus the window. With the default of 15 minutes to fall asleep: 22:15. Atlas recalculates it each Monday from the median time to fall asleep over the last 28 nights, rounded to 5 minutes. |
| Lights out | The moment when he starts trying to sleep. |
| Required wake time | The latest wake time that still lets him reach the first obligation of the day. |
| Choice night | A night when lights out is so late that the full window does not fit before the anchor wake time, and the required wake time allows Extend by at least 30 minutes. On weekdays Extend can therefore last only until the required wake time, usually 08:00. |
| Shortfall | Minutes of sleep below his usual amount on one night. |
| Shift | Minutes by which the wake time is later than the anchor wake time. A wake time before the anchor wake time is an early wake, not a negative shift. |
| Early wake | Waking by himself before the anchor wake time and getting up. Never counted as a failure. |
| Day rating | His rating of how well he functioned during one day. |
| Reaction test | A 3-minute test on the phone. A dot appears at random moments, and he taps as fast as possible. Based on the PVT-B (Basner and others 2011). |
| Lapse | A reaction in the reaction test that takes longer than 355 milliseconds, or a missed dot. |
| Follow-up window | The days after a choice night, up to and including the second day with a required wake time. |
| Ordinary day | A day that is not in any follow-up window and has no tag sick or travel. Ordinary days give his normal level of each measure. |
| Loss | For one measure: the sum over a follow-up window of how much worse each day was than his normal level. |

## 4. What Atlas has today

These facts were checked in the code on 14 November 2026.

- Atlas is a website (React and Supabase). It can be added to the iPhone Home Screen.
- Trackers store one row per observation in the table `documentation_entries`. Each row has a time and free values. The time wheel, tags, undo and history charts exist.
- Timed routines exist. The morning routine records when each step starts and ends.
- Fixed appointments and calendar intervals are stored with start times. Atlas can therefore find the first obligation of tomorrow.
- Atlas has no sleep data and no sleep screen.
- Atlas can show a notification only while it is open in a browser tab. Atlas cannot wake a closed phone. Real notifications need a new part on the server.

## 5. What he logs

The target is under 20 seconds in the evening and under 20 seconds in the morning. Every field has a default, so one tap saves a normal night. Every value can be corrected later. Every save can be undone.

### Evening log (during the evening routine)

Tonio decided (16 November) to keep the evening log apart from the last tap before sleep.

| Field | Input | Required | Why the field is needed |
|---|---|---|---|
| Supplements tonight | During the trial: tonight’s assignment and “Taken as assigned”. Each assigned supplement gets an intake entry at the current time. Other intakes are recorded in the Intake tab. | Yes, when supplements were taken | The trial in section 14 needs the dose and the time. |
| Alarm for tomorrow | Prefilled with the anchor wake time. Choices: a time, or "no alarm". | Yes | Records the choice between Keep and Extend. |
| Day rating for today | Five buttons. | Yes | One of the four measures. |
| Hard night | One tap: "tonight will be hard", for example before an important appointment or when distressed. | No | The trial reports hard nights separately. |
| Early obligation tomorrow | A time, only when tomorrow needs an earlier wake time than the weekday setting. | No | One-off appointments are often not in Atlas. |
| Unusual today | Tags, for example alcohol, nap, late caffeine, sick, travel. | No | Explains nights that should not count as normal. |
| Reason for a late night | Tags, shown only on a late night. | No | A late night with a party differs from a late night with work. |

### Lights out (the last tap before sleep)

One screen with the sleepiness scale (Karolinska, 1 to 9). One tap on a number saves both the sleepiness and lights out at this moment. The time wheel can correct the time afterwards.

Day rating anchors:

1. I could not do what I planned. I fought to stay awake.
2. I was clearly slower than usual and tired for most of the day.
3. I functioned, with some tired periods.
4. A normal good day.
5. Clear and energetic all day.

### Morning log (after he wakes)

| Field | Input | Required | Why the field is needed |
|---|---|---|---|
| Wake time | Prefilled with "now". The time wheel changes the time. | Yes | End of the sleep opportunity. Gives the shift. |
| What woke me | Three buttons: the alarm, I woke by myself, something else. | Yes | Waking by himself before the alarm shows that the window was long enough. |
| Time to fall asleep | Three buttons: under 15 minutes, 15 to 45 minutes, over 45 minutes. | No. Default: under 15 minutes. | A late wake time can delay the next sleep. This field measures that cost. |
| Awake during the night | Three buttons: no, shortly, over 30 minutes in total. | No. Default: no. | Corrects the estimate of sleep duration. |
| Sleep quality | Five buttons: very poor, poor, fair, good, very good. | Yes | His own view of the night. The question comes from the Consensus Sleep Diary, a standard sleep diary in sleep research (Carney and others 2012). |

The morning fields follow the core of the Consensus Sleep Diary, shortened.

### Reaction test (every day)

| Field | Input | Required | Why the field is needed |
|---|---|---|---|
| Reaction test | 3 minutes of tapping. Atlas counts lapses. | Yes | An objective measure of wake quality. |
| Sleepiness now | The Karolinska Sleepiness Scale, 1 (extremely alert) to 9 (very sleepy, fighting sleep). One tap. | Yes | A standard subjective measure, taken together with the test. |

- The test runs at one fixed clock time, by default 15:00. Atlas reminds him at that time. A test in the first hour after waking would mostly measure sleep inertia. Sleep inertia differs between alarm waking and spontaneous waking, so morning tests would distort the comparison.
- He always uses the same phone. The first three tests count as practice and are not used.
- A missed test stays missing. Atlas does not move it to another time.
- The burden: about 4 minutes each day. A daily test gives about 25 ordinary days each month, so his normal level is known sooner.

Out of bed time is not asked. The start of the morning routine already records it.

### Values that Atlas derives

- Time in bed, in minutes: wake time minus lights out.
- Estimated sleep, in minutes: time in bed minus the time to fall asleep minus the time awake during the night. The button choices count as 10, 30 and 60 minutes, and as 0, 10 and 45 minutes. These six numbers are assumptions and settings.
- Usual sleep: the median of estimated sleep over the last 28 logged nights. This is a description of what he does. It is not a claim about what he needs.
- Shortfall and shift, as defined in section 3.
- Required wake time: the obligation start minus the preparation time. Preparation defaults to 90 minutes. The weekday obligation runs from 09:30 to 19:30, Monday to Friday. Its label is “Work, travel and groceries”. The default required wake time is therefore 08:00. Weekends have no obligation. Each weekday obligation can be changed or removed. An explicit wake time saved earlier still counts. An early obligation in the evening log can require an earlier wake time. Atlas uses the earliest resulting wake time. Recorded morning routines are not connected to this calculation yet. Work appointments need a reliable work marker before Atlas can include them automatically.

### Missing data and time zones

- A missing log stays missing. Atlas never invents a value. A gap is never shown as a failure.
- A missing evening log can be filled the next morning with the time wheel. The entry is then marked "from memory".
- Each entry stores its time zone. A day with a change of time zone gets the tag "travel". Such days are shown but are left out of comparisons.
- Nights with the tags sick or travel are left out of comparisons.

## 6. Reminders

Recommended first version: the iPhone gives the reminder, and Atlas provides the screen.

- **Morning.** An iPhone Shortcuts automation runs when the alarm is stopped. The automation opens the morning log in Atlas. The reminder therefore arrives at the exact right moment, and the wake time is already filled in.
- **Evening.** An iPhone Shortcuts automation runs 30 minutes before the target lights out, by default at 21:45. When the target lights out changes, Atlas shows the new time for the automation. The automation opens the evening log.
- **Reaction test.** A third iPhone automation runs at the test time each day and opens the test.
- **Inside Atlas.** The Now page shows a card while a log is missing: "Log last night" in the morning, "Going to bed" in the evening. The card covers mornings without an alarm.

Tonio sets up the three automations once, with written steps. This version needs no new server part.

Later version, only if the first version is not enough: real notifications sent by Atlas. That version needs a server job, stored permission for each device, and Atlas installed on the Home Screen.

## 7. What Atlas shows

- **Nights.** One bar for each night from lights out to wake time, with the anchor wake time as a line. Choice nights are marked.
- **Regularity.** For the last 7 and 28 days: the spread of wake times, the spread of lights out, and the spread of estimated sleep, in minutes.
- **The window test.** The share of mornings with an early wake, and how early. A high share over several weeks suggests that he uses less than the nine hours. Atlas then shows this observation. Atlas does not change the window by itself.
- **Choice nights.** For each one: what he chose, the shortfall, the shift, and the four measures over the follow-up window.

## 8. How the data answers the question

Tonio's measure (16 November 2026): how much sleep and wake quality he loses in total from waking too late, compared with how much he loses from sleeping too short.

### What research says about the shape of each loss

These findings describe groups of healthy adults in laboratories. None of them gives his personal numbers.

- **Short sleep costs mostly in the following days.** Lapses in the reaction test grow with every hour of extra wakefulness, and they add up over consecutive short nights (Van Dongen and others 2003).
- **Feeling is not a reliable measure of short sleep.** In the same study, sleepiness ratings rose after the first short night and then stayed almost flat, while lapses kept rising. A rating alone would therefore understate the cost of short sleep. This is the reason for the reaction test.
- **Waking late costs mostly later, at the next early morning.** Two weekend mornings with a wake time about 3 hours later delayed the body clock by about 42 minutes. Falling asleep on Sunday night took slightly longer, and fatigue and sleepiness were higher on Monday and Tuesday (Taylor, Wright and Lack 2008). Only the abstract was read.
- **Recovery sleep repairs only part of the damage.** After a short week, weekend recovery sleep did not prevent the harm when short nights resumed, and the body clock was delayed (Depner and others 2019). That study tested repeated short sleep, not one late night.

Consequence for the design: the cost of a late wake time appears up to two days later. A comparison that looks only at the next day would always favour sleeping longer. The follow-up window therefore lasts until the second day with a required wake time.

### Four measures

Tonio decided (16 November) that the reaction test must not be the only measure. Atlas therefore computes a loss for each of four measures:

| Measure | What it captures | Taken |
|---|---|---|
| Lapses in the reaction test | Objective alertness | 15:00 each day |
| Sleepiness (Karolinska scale) | How sleepy he feels | 15:00 each day |
| Day rating | How well he functioned | Evening log |
| Sleep quality, plus time to fall asleep | How well he slept on the following nights | Morning log |

For each measure:

    normal level = median of the measure on the ordinary days of the last 28 days
    loss         = sum over the days d in the follow-up window of (how much worse d was than the normal level)

The direction is set so that a higher loss is always worse. A day that is better than normal counts as a negative amount.

### Why Atlas does not add the four losses into one number

Adding the four losses needs a weight for each measure, for example "one point of sleep quality equals three lapses". No research gives such a weight for one person. The weight is a judgment of value, and that judgment belongs to Tonio. Atlas therefore reports the four measures side by side. If Tonio later wants one number, he sets the weights himself, and Atlas shows them as his settings.

### The two costs

When enough choice nights exist, Atlas fits a plain straight-line model for each measure:

    loss = a × (shortfall in hours) + b × (shift in hours) + c × (days in the window) + noise

- `a` is the loss caused by one hour less sleep.
- `b` is the loss caused by one hour later waking.
- `c` takes into account that a Friday night has a longer window than a Saturday night.

On a new choice night, Atlas compares `a × shortfall` under Keep with `b × shift` under Extend, for each measure, with ranges of uncertainty. The proportional form is a hypothesis. After 20 choice nights Atlas checks whether 3 hours cost about three times as much as 1 hour.

### When the measures disagree

- Atlas gives a suggestion only when at least one measure clearly favours one choice and no measure clearly favours the other.
- When the measures disagree, Atlas shows which measure favours which choice. Tonio then decides. Atlas records his decision and the disagreement.
- A disagreement is a finding in itself. Example: he feels better after Extend, but he has more lapses. Research on short sleep predicts this pattern, because feeling understates the cost of short sleep.

### Random choice makes the answer trustworthy

A late night usually has a cause, such as a party, alcohol or stress. He also chooses Keep or Extend for reasons that affect the next days. Without chance, the comparison measures these causes as much as the choice.

Therefore, on a choice night without an obligation, Atlas offers "decide for me" and picks Keep or Extend at random, with equal chance. The model is fitted on the randomized nights first. The other nights are shown separately. Atlas never creates a short night on purpose. The random choice is offered only after the late night has already happened.

### When Atlas stays silent

- Before the model is fitted, Atlas measures the spread of each measure on ordinary days for two weeks (Tonio, 16 November). Atlas then estimates how many randomized choice nights the comparison needs, and shows that number. A first guess is 10 to 20 nights of each kind, which can take several months.
- Atlas gives no suggestion when no measure separates the two choices. Atlas then says: "Your data does not separate the two yet."
- Atlas never suggests Keep when Keep was also chosen on the two nights before. A rule that cuts sleep night after night is not allowed.

### What the data cannot show

- The answer holds for the kind of nights that he has had. It may not hold for much larger shifts or for several short nights in a row.
- A reaction test in a browser has a small, constant delay from the touch screen. The delay affects every test equally, so comparisons stay fair, but the times are not comparable with laboratory values.
- Repeated tests can show learning. The practice tests and the baseline of the last 28 days reduce this problem.

### What rests on what

- Research: the shape of the two losses above. The reaction test, the sleepiness scale and the sleep diary questions are established measures. The day rating is not a validated scale.
- Hypothesis: both losses grow in proportion to their size, and the effect of one choice ends by the second required wake day.
- Settings: anchor wake time, window, the time of the test, the 28-day period for the normal level, and the thresholds for silence.

Sources: Van Dongen and others 2003, Sleep 26(2) 117-126. Taylor, Wright and Lack 2008, Sleep and Biological Rhythms 6, 172-179. Depner and others 2019, Current Biology. Basner, Mollicone and Dinges 2011, PMC3197786. Carney and others 2012, Sleep 35(2) 287-302. Hirshkowitz and others 2015, Sleep Health 1(4) 233-243.

## 9. The baseline

After each month, Atlas compares his real choices with the plain rule "alarm at 07:30 every day, lights out at 22:15". The measures are regularity first and the four measures of section 8 second. The feature is worth keeping only if its suggestions do better than the plain rule, or if the history itself changes what he does.

## 10. Limits

- Atlas never suggests a change to a prescribed medicine. Atlas may suggest that Tonio talks to his psychiatrist, under the condition in section 14.
- No suggestion that restricts sleep night after night.
- No number is presented as medically optimal. Every number is marked as research, hypothesis or setting.

## 11. Decisions

Decided by Tonio on 16 November 2026:

1. The measure: the total loss of sleep and wake quality, measured by four measures (section 8).
2. Reminders through iPhone automations first.
3. Atlas may decide at random on choice nights.
4. No watch or ring today.
5. Alarm and target wake time 07:30 on every day. He gets up when he wakes earlier.
6. The reaction test every day at a fixed time.
7. Nine hours of sleep, not nine hours in bed (decided 16 November).

Still open:

8. Should he buy a watch or a ring? Recommendation: not now (see below).
9. Section 14: all answered on 16 November.
10. Approval of this specification and of the task briefs in [SLEEP_TASKS.md](SLEEP_TASKS.md).

### Recommendation about a watch or a ring

Not now. A device mainly replaces the fields for lights out, time to fall asleep and time awake. The answer to his question comes from the wake time, the choice, the reaction test and the ratings, and a device does not supply any of these. Atlas is a website and cannot read Apple Health directly. A connection through an iPhone automation may be possible, but nobody has checked it. Reconsider after one month if the morning log feels like a burden, or if his estimates of the night seem unreliable. The cost is his decision.

## 12. Build plan

Each part can be built, checked and used before the next part starts.

1. **Record and logic.** The night record and all derived values as pure logic, with tests in several time zones.
2. **Two log screens.** The evening log and the morning log, each reachable by its own address, with defaults, correction and undo. The card on the Now page.
3. **Reminders.** Written steps for the three iPhone automations. A check on the real phone that the automation opens Atlas signed in.
4. **Reaction test.** The 3-minute test and the sleepiness scale. This part comes early, because the normal level needs two weeks of data.
5. **History.** The views "Nights", "Regularity" and "The window test".
6. **Choice nights.** Detection in the evening log, both losses shown, the choice recorded, "decide for me", and the follow-up window.
7. **The answer.** The four losses, the two costs for each measure, the comparison, the rules for silence, and the monthly comparison with the baseline.
8. **Later, if wanted.** Real notifications. A suggested alarm each evening.

Parts 1 to 3 give Tonio the reminders and the log that he asked for first. Part 4 starts the normal level. Parts 5 to 7 can follow while data collects.

## 13. Notes for the builder

These notes are suggestions. The builder decides the implementation.

- A sleep log fits the existing storage without a database change: one item marked as the sleep log through its `documentation_schema`, and one row in `documentation_entries` per night, with the night record in `data`. Timed routines use the same pattern (`shared/timedRoutines.ts`).
- The evening log creates the row. The morning log completes it.
- `isTracker` in `shared/documentationEntries.ts` must exclude the sleep log, as it excludes routines.
- An iPhone automation opens a link in Safari. A Home Screen copy of Atlas has a separate sign-in. Part 3 must check which copy Tonio uses.
- The first obligation of tomorrow can be read from fixed appointments (`taskFixedStartsAt`) and calendar intervals.

## 14. Supplements, caffeine and medicine

Added 16 November 2026. Some points wait for Tonio's answers. They are marked "open".

### His intake on 16 November

| Substance | Dose | Time |
|---|---|---|
| Methylphenidate, slow release, prescribed | 36 mg | Morning on weekdays. On weekends usually not taken. When taken, usually 2 to 4 hours later than on weekdays. |
| Instant coffee | 1 teaspoon | 08:00 to 09:00 |
| Energy drink | 70 to 150 mg caffeine | Stopped from 16 November. |
| Melatonin, sublingual spray | 0.5 mg | 0 to 1 hour before bed |
| Glycine | 8 g | 1 to 2 hours before bed |
| Magnesium bisglycinate | 200 mg | 1 to 2 hours before bed |
| Ashwagandha | 1 pill | 1 to 2 hours before bed |
| Vitamin D, omega-3, selenium, vitamin K2, zinc picolinate | His usual doses | With the evening meal. He may move them to lunch. |

### What Tonio decided

- The purpose of melatonin: to make him sleepy sooner. He struggles to fall asleep only before an important appointment or when he is distressed.
- Atlas may recommend the dose and the timing of supplements "as far as is technically feasible".
- Atlas never touches the methylphenidate. Atlas may recommend that he talks to his psychiatrist about a return to 20 mg pills that release faster, or about another plan, if there is good evidence that the 36 mg pill releases too slowly and disturbs his rhythm.
- The normal level is measured over two weeks, not four.
- He proposed to stop all evening supplements and to test them in a planned way, and he asked for the design that gives the most information per day.

### Methylphenidate in the data

- Slow-release methylphenidate works for about 10 to 12 hours (shown in children; no adult figure was found). A dose taken 2 to 4 hours late can still work at bedtime. This is a hypothesis for him, which Atlas checks.
- The Intake tab records when he takes methylphenidate. A day without an intake counts as a day without the medicine. A missed intake can be added afterwards.
- The 15:00 reaction test measures him with the medicine on weekdays and mostly without it on weekends. Atlas therefore computes the normal level separately for days with and without the medicine. Every comparison takes this into account.
- Evidence for the psychiatrist: Atlas compares the time to fall asleep and the sleepiness at lights out on nights after a late dose, after a normal dose, and after no dose. Atlas suggests a talk with the psychiatrist only when nights after a late or normal dose are clearly worse than nights without the medicine. Atlas then shows the numbers and their limits. These data are observations, not a trial: he chooses when he takes the medicine late.

### Experiment design: why one supplement at a time is slow

Three rules from the theory of experiment design decide how much one night teaches.

1. **Change several things on the same night, at random and independently.** In a factorial design, each night carries information about every supplement at the same time. With two supplements, every night tells something about both. One supplement at a time uses each night for only one supplement. The factorial design therefore needs about half as many nights for two supplements, and about a quarter for four. It also shows whether two supplements work together.
2. **Switch fast-acting supplements every night.** Melatonin and glycine act within hours and leave the body by the next evening. Switching them nightly gives many comparisons in few weeks. Night-to-night changes in his sleep then affect both conditions equally.
3. **Use longer periods for slow-acting supplements.** Magnesium and ashwagandha may act only over weeks. In the ashwagandha studies, the clearest benefit appeared after eight weeks or more. These supplements need periods of at least two weeks, otherwise the effect of one period leaks into the next. This combination of nightly and longer changes is called a split-plot design.

Further rules:

- **Measure the outcome closest to the purpose.** The purpose is "sleepy sooner". The evening log therefore adds sleepiness at lights out (Karolinska scale, one tap). The time to fall asleep is entered in minutes with the time wheel, because three buttons are too coarse to show an effect of a few minutes.
- **Stop when the answer is clear.** After every week, Atlas updates the estimates. A test ends when the effect is clearly present, or clearly too small to matter. That ending rule saves nights compared with a fixed length.
- **First on or off, then dose and timing.** Testing several doses and times at once needs many more nights. Atlas first tests each supplement at one dose and one time. Dose and timing are then tested only for the supplements that showed an effect.
- **Runs alongside the main question.** The random choice between Keep and Extend is one more independent factor. Both experiments share the same nights without spoiling each other.
- **Limit: no blinding.** He knows what he took, and that knowledge alone can change how he feels. The reaction test is less sensitive to expectation than a rating. A helper who prepares identical-looking doses would remove this limit, but that is hard with a spray and a powder.
- **Limit: few hard nights.** He falls asleep easily on most nights. A sleep aid can only show an effect where there is a problem. Atlas therefore reports the effect separately for nights that he marks in advance as hard, for example before an important appointment.

### The plan

Decided by Tonio on 16 November 2026, after the questions above.

1. **Weeks 1 and 2: normal level.** All evening supplements stopped. Coffee in the morning continues. Methylphenidate as prescribed.
2. **Day supplements stay constant.** He also takes glycine for effects that are not related to sleep. The rest of his usual glycine (5 g) moves to breakfast or lunch, every day, also during weeks 1 and 2. The vitamins and minerals move to lunch, because Atlas recommended lunch (a meal with some fat). A constant daily dose does not disturb the trial. This reading of "the other" in his answer is the agent's: "the other" was read as the rest of the glycine.
3. **From week 3: the trial.** Each evening, the evening log tells him what to take tonight:
   - melatonin 0.5 mg, 30 to 60 minutes before lights out, or nothing, at random each night;
   - glycine 3 g, about 1 hour before lights out, or nothing, at random each night and independently of melatonin;
   - magnesium 200 mg in random periods of two weeks on and two weeks off.
4. Ashwagandha stays out for now.
5. After about four to six weeks, Atlas reports which supplements show an effect, and plans tests of dose and timing for those.

### Limit for dose suggestions

Tonio (16 November): "I don't care about the product label, but instead whatever the scientific consensus is on what is safe; the product label is just for what's actually in the product." Atlas therefore never suggests a dose above the scientific consensus on a safe dose. Each suggested dose shows the source of its safe limit.

Sources: Burgess and others 2010, J Clin Endocrinol Metab 95(7) 3325-3331. Gardiner and others 2023, Sleep Medicine Reviews 69. Sateia and others 2017, J Clin Sleep Med 13(2) 307-349. Mah and Pitre 2021, BMC Complementary Medicine and Therapies. Yamadera and others 2007, Sleep and Biological Rhythms 5. Cheah and others 2021, PLoS One. MSD Manual, ashwagandha. Only abstracts and summaries were read.

## 15. The Intake tab

Added 17 November 2026. Tonio: "I'd prefer a separate tab where I have a simple button for every type of supplement/medication and at the dose I usually take. pressing it once means: 'i now took this supplement'." Logging an intake afterwards may take more taps.

### The buttons

- A new tab "Intake" at `/intake`, in the main navigation.
- One large button for each substance, at his usual dose. One tap records "taken now". An "Undo" message appears after each tap.
- Each button shows when he last took the substance today, for example "Taken at 08:12". A second tap records a second intake. This is correct for coffee, and the undo message covers a tap by mistake.
- Default buttons: methylphenidate 36 mg, coffee 1 teaspoon, melatonin 0.5 mg, glycine 3 g, glycine 5 g, magnesium 200 mg, and one button "Vitamins and minerals" for the lunch vitamins. Ashwagandha has no button.
- In the settings of the Intake tab, he can add, rename, hide and reorder buttons, and change the usual dose and its unit.
- During the trial, each button for a trial supplement shows whether tonight's assignment includes it. A tap on a supplement that is not assigned tonight still records it. The trial then counts that night as a deviation.

### Logging afterwards

- Below the buttons: a link "Taken earlier". It opens a form with the substance, the dose (prefilled with the usual dose) and the date and time (time wheel, prefilled with now). The default number of taps is three: the substance, the time, and Save.
- Below that: a list of today's intakes, newest first, with a way to see earlier days. A tap on an intake opens the same form to change its time or dose, or to delete it. Delete has undo.

### One place for intake

- Each intake is its own entry of the sleep log item, like a reaction test. The time of the intake is the time of the entry.
- The Intake tab replaces the methylphenidate and coffee fields of the morning log and the supplement fields of the evening log. Those fields are removed from the screens.
- During the trial, the evening log still shows tonight's assignment. "Taken as assigned" records one intake for each assigned supplement, at the current time.
- Old nights that stored methylphenidate, coffee or supplements inside the night record still count. Atlas reads them as intakes.
- A day without a methylphenidate intake counts as a day without methylphenidate. If he forgets to tap, the data is wrong for that day. He can add the intake afterwards.
- For the trial, a supplement counts for a night when an intake lies between 4 hours before the target lights out and the lights out of that night. The 5 g glycine at breakfast or lunch is therefore not counted as the evening glycine.

### Labels

- The morning log field "Time to fall asleep" gets the hint "From lights out until you fell asleep."
