# Log box: typed sentences become records

The Log box on the Now page turns one typed sentence into Atlas records. It is the one text box on Now and replaces the task capture bar there. Examples: “cola 250 ml at 15:00”, “2 Dosen Cola Zero um 12”, “melatonin 1 mg and glycine 3 g yesterday at 22:30”, “caught myself scrolling 10 minutes ago”, “buy milk tomorrow”. The iPhone keyboard microphone gives spoken input through the same box.

The feature is an experiment. It should show whether typing is faster than buttons and forms, and whether it lets Tonio record more kinds of things.

## How a sentence is handled

1. **The local parser** (`shared/quickLog.ts`) reads one simple record on the device without delay: a name from the lists, an optional amount and an optional time. A drink without an amount produces a question.
2. **The interpreter** reads every other sentence. It is the server function `supabase/functions/quick-log`, which calls Claude with a strict JSON schema. The model only chooses options from the lists that Atlas sends and copies amounts and times from the sentence.
3. **Atlas code checks every proposal** (`resolveQuickLog`). It refuses unknown options, wrong units, missing drink amounts, times in the future, and times more than 14 days ago. If one part fails, nothing is saved.
4. **Atlas saves at once.** All records from one sentence share one Undo. The result lists each record with a link to correct it. “Undo and edit the sentence” puts the sentence back in the box.
5. **Unrecognised parts are never guessed.** A question from the interpreter or a refusal keeps the sentence in the box. A part with no record type, such as “headache”, can be saved as a task or as a note in Items with one tap.

## What it records

| Kind | Options sent | Stored as |
|---|---|---|
| Drink | Drinks list in Intake settings | Intake with substance `caffeine`, the dose in mg, and the conversion in `intake.drink` |
| Intake | Visible intake buttons | Intake with the button's substance, label and unit. A stated dose replaces the usual dose. |
| Tracker | Every tracker | Tracker entry. The stage follows the tracker rule: recorded later than 5 minutes means in hindsight. |
| Task | Nothing. The model copies the task in the person's words. | A task item created now. A day such as “tomorrow” stays in the title. Atlas does not set due dates from the sentence yet. |

Every saved drink, intake and tracker entry has `quickLog: { text, method, model?, ms?, savedAt }` in its data, so later evaluation can count sentences, methods and waiting times.

## Drinks and caffeine

- The drinks list lives in the sleep settings as `settings.drinks` (`shared/drinks.ts`). Each drink has caffeine in mg per 100 ml, servings such as “can 330”, a source and an estimate flag.
- The defaults are Coca-Cola, Coca-Cola Zero, Red Bull, Club-Mate, espresso and filter coffee. Coca-Cola, Coca-Cola Zero, espresso and filter coffee are estimates. Tonio should check the values against his own products.
- A drink entry keeps its own conversion. Changing the list later does not change past entries. Correcting the amount of an entry recalculates the mg from that entry's stored conversion.
- The Coffee button (teaspoons) is not converted into caffeine yet. Tonio's coffee is Nescafé Gold. Nestlé states 50 to 90 mg caffeine per 2 g serving, depending on the variety. The conversion waits for the value on his label.

## Server function setup

Secrets in the Supabase project (Dashboard, Edge Functions, Secrets, or `supabase secrets set`):

- `ANTHROPIC_API_KEY`: required. Without it the function answers `not_configured`, and only the local parser works.
- `QUICK_LOG_ALLOWED_USERS`: comma-separated Atlas user IDs that may spend the key. Set to Tonio's account.
- `QUICK_LOG_MODEL`: optional. Default `claude-haiku-5-5` at low effort, chosen by Tonio on 17 November 2026. Raise the model or the effort only after the evaluation shows a failure.

Deploy with `supabase functions deploy quick-log --use-api`. The function requires a signed-in Atlas session and refuses other accounts. The browser never sees the API key.

## Evaluation

`npx tsx --tsconfig tsconfig.brain-mcp.json scripts/quick-log-eval.ts` sends 30 realistic sentences through the deployed function with the Brain tools sign-in. `--all` also sends sentences that the local parser could read. Results go to `.handoff/quick-log-eval-*.json`. Each model call costs money.

Result on 17 November 2026 with Haiku 5.5 at low effort: the first run passed 26 of 32. Fixes: a serving copied with its size, such as “can (330 ml)”, now converts; servings of the same size never cause a question; “caught myself scrolling” is not an urge; a sentence about the past is never a task. After the fixes, two runs with every sentence sent to the model, and one run as in the app, each passed 32 of 32. Model calls took about 2.3 s in the middle of the range and at most 5 s, including the network.

Planned judgement after about two weeks of use: the share of sentences saved without correction, the waiting time compared with buttons, the share of sentences with no record type, and whether the box is still used.
