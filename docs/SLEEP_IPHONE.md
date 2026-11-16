# Sleep reminders on the iPhone

Written 16 November 2026 for Tonio. These steps set up the reminders of the sleep log with the Shortcuts app. Nothing here was tested on a real iPhone yet. Step 5 is the test.

## 1. Sign in to Atlas in Safari once

The automations open Atlas in Safari. An Atlas icon on the Home Screen has its own sign-in, and an automation cannot open that icon. Open https://atlas-lovat-nine.vercel.app in Safari and sign in.

## 2. Morning: when you stop the alarm

1. Open the Shortcuts app and tap "Automation" at the bottom.
2. Tap "+" (or "New Automation").
3. Choose "Alarm". Choose "Is Stopped" and "Any Alarm".
4. Choose "Run Immediately". Then tap "Next".
5. Choose "New Blank Automation". Tap "Add Action", search for "Open URLs" and choose it.
6. Tap "URL" and type: https://atlas-lovat-nine.vercel.app/sleep/morning
7. Tap "Done".

## 3. Evening log: 21:00

The evening log comes before your supplements, so it runs about 75 minutes before lights out.

1. In "Automation", tap "+".
2. Choose "Time of Day". Set 21:00 and "Daily".
3. Choose "Run Immediately", then "Next".
4. "New Blank Automation", then "Add Action", then "Open URLs".
5. URL: https://atlas-lovat-nine.vercel.app/sleep/evening
6. Tap "Done".

## 4. Reaction test: 15:00

Same steps as for the evening log, with the time 15:00 and the URL https://atlas-lovat-nine.vercel.app/sleep/test

Lights out needs no automation. After the evening log, the Now page and the Sleep tab show a "Lights out" card.

## 5. Test the reminders

1. Set an alarm one minute from now. Stop it when it rings. Safari should open the morning log, signed in.
2. Change the time of the evening automation to two minutes from now and wait, once with the phone unlocked and once locked. Note what happens in each case. Then set the time back to 21:00.
3. Tell the agent what happened. Write down whether Atlas opened, whether you were signed in, and whether a locked phone showed anything.

## If something goes wrong

- Atlas opens, but you are signed out: sign in again in Safari (step 1).
- Nothing happens when the phone is locked: the iPhone may wait until you unlock it. The Now page cards still remind you inside Atlas.
- The target lights out moves: the Sleep tab shows the new target time. The evening automation should then run about 75 minutes before that time.
