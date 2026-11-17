/**
 * Evaluates the Log box interpreter on realistic sentences through the deployed server function.
 * Uses the Brain tools sign-in (npm run atlas:brain -- login). Each sentence costs one model call.
 *
 *   npx tsx --tsconfig tsconfig.brain-mcp.json scripts/quick-log-eval.ts [--all] [--only=N]
 *
 * By default only sentences that the local parser cannot read go to the model, as in the app.
 * --all sends every sentence to the model, which measures the model alone.
 */
import { writeFile } from 'node:fs/promises';
import { DEFAULT_INTAKE_BUTTONS } from '../shared/intake';
import { parseDrinks } from '../shared/drinks';
import { parseQuickLogLocally, resolveQuickLog, type QuickLogContext, type QuickLogResult } from '../shared/quickLog';
import { addDays, atLocalClock, civilDate } from '../shared/recurringReferences';
import { interpretWithModel } from '../src/services/quickLog';
import { createAtlasClient } from './brain-atlas-mcp';

const zone = 'Europe/Berlin';
const ctx: QuickLogContext = {
  now: new Date(atLocalClock('2026-11-17', '16:00:00', zone)), timeZone: zone,
  buttons: DEFAULT_INTAKE_BUTTONS.map(b => ({ ...b })), drinks: parseDrinks(undefined),
  trackers: [{ id: 'scrolled', title: 'Scrolled', kind: 'break' }, { id: 'reality', title: 'Reality check', kind: 'build' }],
};

/** Each case lists every acceptable outcome. "question" and "refused" save nothing. */
const CASES: [string, string[][]][] = [
  ['cola 250ml at 15:00', [['coca-cola 25mg @15:00']]],
  ['had a coke an hour ago', [['question'], ['coca-cola 33mg @15:00']]],
  ['2 Dosen Cola Zero heute Mittag um 12', [['coca-cola-zero 66mg @12:00']]],
  ['ein Espresso um 9', [['espresso 79.8mg @09:00'], ['question']]],
  ['took my methylphenidate at 8:15', [['methylphenidate 36mg @08:15']]],
  ['melatonin 1mg and glycine 3g yesterday at 22:30', [['melatonin 1mg @-1d 22:30', 'glycine 3g @-1d 22:30']]],
  ['caught myself scrolling 10 minutes ago', [['scrolled after @15:50']]],
  ['had the urge to scroll but didn’t', [['scrolled urge @16:00']]],
  ['reality check', [['reality @16:00']]],
  ['half a liter of club mate this morning at 10', [['club-mate 100mg @10:00']]],
  ['headache 4/10', [['refused']]],
  ['cola 0.5l and a headache', [['coca-cola 50mg @16:00', 'unmatched']]],
  ['a pepsi 330ml', [['refused']]],
  ['filterkaffee 300ml um 7:30', [['filter-coffee 135mg @07:30']]],
  ['magnesium', [['magnesium 200mg @16:00']]],
  ['vitamins after breakfast at 8', [['vitamins 1usual dose @08:00']]],
  ['glycine', [['question']]],
  ['mate 500 ml', [['club-mate 100mg @16:00']]],
  ['Red Bull vor 2 Stunden', [['question'], ['red-bull 80mg @14:00']]],
  ['drank 1.5 cans of coke at 13:45', [['coca-cola 49.5mg @13:45']]],
  ['espresso doppio at 11', [['question'], ['espresso 159.6mg @11:00']]],
  ['cola 250 ml at 18:00', [['coca-cola 25mg @-1d 18:00']]],
  ['scrolled at 3pm and again at 3:30pm', [['scrolled after @15:00', 'scrolled after @15:30']]],
  ['kaffee', [['coffee 1teaspoon @16:00'], ['question']]],
  ['buy milk tomorrow', [['task buy milk tomorrow']]],
  ['cola 0,33 l und morgen Zahnarzt anrufen', [['coca-cola 33mg @16:00', 'task morgen zahnarzt anrufen'], ['coca-cola 33mg @16:00', 'task zahnarzt anrufen morgen']]],
  ['called the dentist', [['refused']]],
  ['cola zero 33cl', [['coca-cola-zero 33mg @16:00']]],
  ['2 tsp coffee at 7', [['coffee 2teaspoon @07:00']]],
  ['red bull 250', [['question'], ['red-bull 80mg @16:00']]],
  ['I just drank a can of Coke Zero and took 0.5 mg melatonin', [['coca-cola-zero 33mg @16:00', 'melatonin 0.5mg @16:00']]],
  ['noticed i wanted to open instagram, put the phone away', [['scrolled urge @16:00'], ['question'], ['refused']]],
];

function when(at: string): string {
  const date = civilDate(new Date(at), zone);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
  const today = civilDate(ctx.now, zone);
  return date === today ? `@${clock}` : date === addDays(today, -1) ? `@-1d ${clock}` : `@${date} ${clock}`;
}
function outcome(result: QuickLogResult, question: boolean): string[] {
  if (!result.ok) return [question ? 'question' : 'refused'];
  const lines = result.records.map(r => r.type === 'task' ? `task ${r.title.toLowerCase()}` : r.type === 'intake'
    ? `${r.intake.drink?.drinkId ?? r.intake.substance} ${r.intake.dose}${r.intake.unit} ${when(r.intake.takenAt)}`
    : `${r.trackerId}${r.stage && r.trackerId === 'scrolled' ? ` ${r.stage}` : ''} ${when(r.occurredAt)}`);
  return result.unmatched ? [...lines, 'unmatched'] : lines;
}
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

const all = process.argv.includes('--all');
const only = Number(process.argv.find(a => a.startsWith('--only='))?.slice(7) ?? NaN);
const client = createAtlasClient();
const rows: { text: string; method: string; got: string[]; pass: boolean; ms: number; model?: string; error?: string }[] = [];
for (const [index, [text, accepted]] of CASES.entries()) {
  if (Number.isFinite(only) && index !== only) continue;
  const local = all ? null : parseQuickLogLocally(text, ctx);
  try {
    const started = Date.now();
    const answer = local ? { output: local, model: 'local', ms: 0 } : await interpretWithModel(client, text, ctx);
    const got = outcome(resolveQuickLog(answer.output, ctx), !!answer.output.question);
    const pass = accepted.some(a => same(a, got));
    rows.push({ text, method: local ? 'local' : 'model', got, pass, ms: local ? 0 : Date.now() - started, model: answer.model });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${local ? 'local' : `${Date.now() - started} ms`.padStart(8)}  ${text}  ->  ${got.join(' | ')}${pass ? '' : `   expected ${accepted.map(a => a.join(' | ')).join(' OR ')}`}${answer.output.question ? `  (asked: ${answer.output.question})` : ''}`);
  } catch (error) {
    rows.push({ text, method: 'model', got: [], pass: false, ms: 0, error: error instanceof Error ? error.message : String(error) });
    console.log(`ERROR  ${text}: ${error instanceof Error ? error.message : error}`);
  }
}
const model = rows.filter(r => r.method === 'model' && !r.error);
const times = model.map(r => r.ms).sort((a, b) => a - b);
console.log(`\n${rows.filter(r => r.pass).length} of ${rows.length} passed. ${rows.filter(r => r.method === 'local').length} read locally.`
  + (times.length ? ` Model calls: median ${times[Math.floor(times.length / 2)]} ms, slowest ${times.at(-1)} ms.` : ''));
await writeFile(`.handoff/quick-log-eval-${all ? 'all' : 'app'}-${new Date().toISOString().slice(0, 16).replace(/:/g, '')}.json`, JSON.stringify(rows, null, 1));
