# Reaction test component

`src/components/sleep/ReactionTest.tsx` exports `ReactionTest`. The component owns
one test session. The host supplies `previousTestCount`, `onComplete(result)`, and
`onCancel()`. Count completed tests, including practice tests. Cancelled and
interrupted tests do not count. The first three completed tests are practice.

The component calls `onComplete` once, immediately after the sleepiness selection.
The component then shows the result until the host closes it. The host can retain
the result screen by keeping the component mounted. `onCancel` also closes the
result through its Done button. The host owns storage, errors, undo, and routing.
`ReactionTestResult` is a JSON-safe object that can be assigned directly to an
entry's `data`. No night record is required.

## Protocol decisions

- The protocol version is `atlas-pvt-b-v1`. The duration is exactly 180 seconds.
- Each stimulus follows a new random wait between 1 and 4 seconds. The schedule
  generator accepts a random source. Each yield is a delay, not a timestamp.
- A response or false start gives one second of feedback before the next wait.
  Every primary tap without a visible stimulus counts as a false start. A false
  start restarts the feedback and wait. Other fingers and mouse buttons are ignored.
- A reaction strictly greater than 355 ms is a lapse. Exactly 355 ms is not.
  The Atlas specification sets this boundary. A missing response is also a lapse.
- An unanswered stimulus expires after 30 seconds. The next trial starts after
  feedback and a fresh random wait. A tap at or after the timeout is a miss.
  An unanswered dot at the 180-second deadline is a miss even if 30 seconds have
  not passed. A waiting period at that deadline adds no stimulus.
- A miss has a null reaction time. The event records whether the cause was the
  timeout or the end of the test. Missing responses are excluded from RT summaries.
- The median and both decile means use measured responses. Each decile uses
  `ceil(response count * 0.1)` responses. The reciprocal mean is the mean of
  `1000 / RT_ms`, in reciprocal seconds. An empty sample gives null summaries.
  A zero RT is preserved, but makes the reciprocal mean null.
- KSS version B supplies published English labels on all nine levels. Version A
  labels only odd levels. The rating asks about the preceding five minutes.

The dot is made visible directly inside `requestAnimationFrame`. The start time
comes from `performance.now()` in the same frame. The response time comes from
`performance.now()` in the `pointerdown` handler. Browser and display delays are
not laboratory calibration. Keep the same device and browser for comparisons.
The result records the user agent, platform, and touch capability.

Scrolling and touch gestures are blocked during the test. The previous body
styles and event listeners are restored on cancellation, completion, or unmount.
If the document becomes hidden, the component discards the incomplete test and
returns to Start with an explanation. It does not resume or complete that run.

## Sources

- [Basner, Mollicone and Dinges, 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3197786/)
  describes the brief PVT.
- [Yang and others, 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6289239/)
  describes the 30-second timeout and one-second feedback used in a PVT-B study.
  Atlas uses the fixed timeout to advance after a missing response.
- [Åkerstedt Miley, Kecklund and Åkerstedt, 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5511283/)
  compares the two KSS versions and gives the nine labels.
