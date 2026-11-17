import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_DRINKS, caffeineMg, drinkAmountMl, parseDrinks, withAmountMl } from '../shared/drinks';
import { DEFAULT_INTAKE_BUTTONS, intakeData, readIntakes, sleepIntake } from '../shared/intake';
import { localNow, parseQuickLogLocally, resolveQuickLog, validQuickLogOutput, type QuickLogContext, type QuickLogOutput } from '../shared/quickLog';
import { atLocalClock } from '../shared/recurringReferences';
import { sleepScreenSettings } from '../shared/sleepScreens';
import { QUICK_LOG_SCHEMA, quickLogUserMessage, validQuickLogRequest } from '../supabase/functions/quick-log/prompt';

const drinks = parseDrinks(undefined);
const trackers = [{ id: 'scrolled', title: 'Scrolled', kind: 'break' as const }, { id: 'reality', title: 'Reality check', kind: 'build' as const }];
function context(zone: string, date = '2026-11-17', time = '16:00'): QuickLogContext {
  return { now: new Date(atLocalClock(date, `${time}:00`, zone)), timeZone: zone, buttons: DEFAULT_INTAKE_BUTTONS.map(b => ({ ...b })), drinks, trackers };
}
function run(text: string, ctx: QuickLogContext) {
  const output = parseQuickLogLocally(text, ctx);
  assert.ok(output, `local parser should handle “${text}”`);
  return resolveQuickLog(output, ctx);
}

test('drink amounts convert from ml, l and servings and stay within bounds', () => {
  const cola = drinks.find(d => d.id === 'coca-cola')!;
  assert.equal(drinkAmountMl(cola, 250, 'ml'), 250);
  assert.equal(drinkAmountMl(cola, 0.5, 'l'), 500);
  assert.equal(drinkAmountMl(cola, 2, 'cans'), 660);
  assert.equal(drinkAmountMl(cola, 1, 'shot'), null, 'cola has no shot serving');
  assert.equal(drinkAmountMl(cola, 6, 'l'), null, 'more than 5 litres is refused');
  assert.equal(caffeineMg({ amountMl: 250, caffeineMgPer100Ml: 10 }), 25);
  assert.equal(caffeineMg({ amountMl: 60, caffeineMgPer100Ml: 133 }), 79.8);
});

test('an invalid stored drink list falls back to the defaults, and a valid list is kept', () => {
  assert.deepEqual(parseDrinks([{ id: 'x' }]).map(d => d.id), DEFAULT_DRINKS.map(d => d.id));
  const custom = [{ ...DEFAULT_DRINKS[0], id: 'my-coffee', name: 'My coffee', caffeineMgPer100Ml: 60 }];
  assert.deepEqual(parseDrinks(custom), custom);
  assert.deepEqual(sleepScreenSettings({ sleepLog: { settings: { drinks: custom } } }).drinks, custom);
});

for (const zone of ['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Auckland']) {
  const at = (date: string, time: string) => atLocalClock(date, `${time}:00`, zone);

  test(`${zone}: "cola 250ml at 15:00" records 25 mg caffeine with its conversion and time`, () => {
    const ctx = context(zone);
    const result = run('cola 250ml at 15:00', ctx);
    assert.ok(result.ok);
    const [record] = result.records;
    assert.equal(record.type, 'intake');
    if (record.type !== 'intake') return;
    assert.equal(record.intake.substance, 'caffeine');
    assert.equal(record.intake.dose, 25);
    assert.equal(record.intake.unit, 'mg');
    assert.equal(record.intake.takenAt, at('2026-11-17', '15:00'));
    assert.equal(record.intake.drink?.amountMl, 250);
    assert.equal(record.intake.drink?.estimate, true);
    assert.match(record.summary, /Coca-Cola · 250 ml · 25 mg caffeine \(estimate\) · 15:00/);
    // The stored entry reads back with the same conversion.
    const row = { id: 'e', ownerId: 'o', itemId: 'i', occurredAt: record.intake.takenAt, createdAt: record.intake.takenAt, data: intakeData(record.intake) };
    assert.deepEqual(sleepIntake(row), record.intake);
    assert.equal(readIntakes([row])[0].intake.drink?.drinkId, 'coca-cola');
  });

  test(`${zone}: servings, decimal commas, minutes ago and evening times after midnight`, () => {
    const ctx = context(zone);
    const can = run('a can of red bull 30 min ago', ctx);
    assert.ok(can.ok && can.records[0].type === 'intake');
    if (can.ok && can.records[0].type === 'intake') {
      assert.equal(can.records[0].intake.dose, 80);
      assert.equal(can.records[0].intake.takenAt, new Date(Date.parse(at('2026-11-17', '15:30'))).toISOString());
      assert.equal(can.records[0].intake.drink?.amountText, '1 can');
    }
    const half = run('0,5 l club mate', ctx);
    assert.ok(half.ok && half.records[0].type === 'intake' && half.records[0].intake.dose === 100);
    const late = run('espresso 1 shot at 23:00', context(zone, '2026-11-18', '00:30'));
    assert.ok(late.ok && late.records[0].type === 'intake' && late.records[0].intake.takenAt === at('2026-11-17', '23:00'), 'a later clock means yesterday');
  });

  test(`${zone}: intake buttons keep their label and pick the button with the same dose`, () => {
    const ctx = context(zone);
    const glycine = run('glycine 5g at 21:30', context(zone, '2026-11-17', '22:00'));
    assert.ok(glycine.ok && glycine.records[0].type === 'intake');
    if (glycine.ok && glycine.records[0].type === 'intake') {
      assert.equal(glycine.records[0].intake.dose, 5);
      assert.equal(glycine.records[0].intake.takenAt, at('2026-11-17', '21:30'));
    }
    const question = parseQuickLogLocally('glycine', ctx);
    assert.match(question?.question ?? '', /Which dose of Glycine\? 3 g or 5 g/);
    assert.equal(resolveQuickLog(question!, ctx).ok, false, 'a question saves nothing');
    const methylphenidate = run('methylphenidate', ctx);
    assert.ok(methylphenidate.ok && methylphenidate.records[0].type === 'intake' && methylphenidate.records[0].intake.dose === 36);
    const wrongUnit = run('melatonin 2 g', ctx);
    assert.equal(wrongUnit.ok, false);
  });

  test(`${zone}: tracker entries get their stage from the time`, () => {
    const ctx = context(zone);
    const now = run('scrolled', ctx);
    assert.ok(now.ok && now.records[0].type === 'tracker' && now.records[0].stage === 'during');
    const later = run('scrolled 20 min ago', ctx);
    assert.ok(later.ok && later.records[0].type === 'tracker' && later.records[0].stage === 'after');
    const build = run('reality check at 15:00', ctx);
    assert.ok(build.ok && build.records[0].type === 'tracker' && build.records[0].stage === null);
  });
}

test('the local parser leaves anything uncertain to the model', () => {
  const ctx = context('Europe/Berlin');
  for (const text of ['cola 250ml and melatonin', 'coffee with milk', 'cola yesterday', 'headache 4 of 10', 'scrolled 2 times', 'cola 250ml 330ml', '']) {
    assert.equal(parseQuickLogLocally(text, ctx), null, text);
  }
  assert.match(parseQuickLogLocally('cola', ctx)?.question ?? '', /How much Coca-Cola/);
  assert.match(parseQuickLogLocally('a coke', ctx)?.question ?? '', /How much Coca-Cola/, 'a can and a glass differ, so Atlas asks');
  const espresso = resolveQuickLog(parseQuickLogLocally('ein Espresso um 9', ctx)!, ctx);
  assert.ok(espresso.ok && espresso.records[0].type === 'intake' && espresso.records[0].intake.dose === 79.8, 'every espresso serving has the same size');
});

test('model proposals are checked: unknown options, future and old times and missing amounts are refused', () => {
  const ctx = context('Europe/Berlin');
  const base = { kind: 'drink' as const, optionId: 'coca-cola', amount: 330, unit: 'ml', localTime: null, stage: 'none' as const };
  const out = (records: QuickLogOutput['records'], extra: Partial<QuickLogOutput> = {}): QuickLogOutput => ({ records, unmatched: null, question: null, ...extra });
  assert.ok(resolveQuickLog(out([base]), ctx).ok);
  assert.equal(resolveQuickLog(out([{ ...base, optionId: 'pepsi' }]), ctx).ok, false);
  assert.equal(resolveQuickLog(out([{ ...base, localTime: '2026-11-17T18:00' }]), ctx).ok, false, 'future');
  assert.equal(resolveQuickLog(out([{ ...base, localTime: '2026-10-01T18:00' }]), ctx).ok, false, 'too old');
  assert.equal(resolveQuickLog(out([{ ...base, amount: null, unit: null }]), ctx).ok, false);
  assert.equal(resolveQuickLog(out([{ ...base, localTime: '2026-03-29T02:30' }]), context('Europe/Berlin', '2026-03-29', '12:00')).ok, false, 'a clock that does not exist');
  const two = resolveQuickLog(out([base, { kind: 'tracker', optionId: 'scrolled', amount: null, unit: null, localTime: null, stage: 'urge' }], { unmatched: 'headache' }), ctx);
  assert.ok(two.ok && two.records.length === 2 && two.unmatched === 'headache');
  if (two.ok && two.records[1].type === 'tracker') assert.equal(two.records[1].stage, 'urge');
  assert.equal(resolveQuickLog(out([], { unmatched: 'headache' }), ctx).ok, false);
  assert.equal(validQuickLogOutput({ records: [{ ...base, kind: 'note' }], unmatched: null, question: null }), false);
  assert.equal(validQuickLogOutput({ records: [{ ...base, localTime: '15:00' }], unmatched: null, question: null }), false);
  assert.equal(validQuickLogOutput(out([base])), true);
  const listed = resolveQuickLog(out([{ ...base, amount: 1, unit: 'can (330 ml)' }]), ctx);
  assert.ok(listed.ok && listed.records[0].type === 'intake' && listed.records[0].intake.dose === 33, 'a serving copied with its size still converts');
});

test('a proposed task becomes a task record, and a task without a title is refused', () => {
  const ctx = context('Europe/Berlin');
  const task = { kind: 'task' as const, optionId: 'task', amount: null, unit: null, localTime: null, stage: 'none' as const, taskTitle: ' buy milk tomorrow ' };
  const out = (records: QuickLogOutput['records']): QuickLogOutput => ({ records, unmatched: null, question: null });
  assert.equal(validQuickLogOutput(out([task])), true);
  assert.equal(validQuickLogOutput(out([{ ...task, taskTitle: 5 as unknown as string }])), false);
  const result = resolveQuickLog(out([task, { kind: 'drink', optionId: 'coca-cola', amount: 330, unit: 'ml', localTime: null, stage: 'none', taskTitle: null }]), ctx);
  assert.ok(result.ok && result.records[0].type === 'task' && result.records[0].title === 'buy milk tomorrow' && result.records[1].type === 'intake');
  assert.equal(resolveQuickLog(out([{ ...task, taskTitle: '  ' }]), ctx).ok, false);
  assert.equal(parseQuickLogLocally('buy milk tomorrow', ctx), null, 'tasks always go to the model');
});

test('a drink correction keeps the original conversion values', () => {
  const ctx = context('UTC');
  const result = run('cola 250 ml', ctx);
  assert.ok(result.ok && result.records[0].type === 'intake');
  if (!result.ok || result.records[0].type !== 'intake') return;
  const changed = withAmountMl(result.records[0].intake.drink!, 500)!;
  assert.equal(changed.caffeineMgPer100Ml, 10);
  assert.equal(caffeineMg(changed), 50);
  assert.throws(() => intakeData({ ...result.records[0].intake, drink: changed }), /does not match/, 'the dose must follow the amount');
});

test('the server request is bounded and the schema requires every field', () => {
  const ctx = context('Europe/Berlin');
  const request = { text: 'cola', localNow: localNow(ctx), timeZone: ctx.timeZone, options: { drinks: [], intakes: [], trackers: [] } };
  assert.ok(validQuickLogRequest(request));
  assert.equal(validQuickLogRequest({ ...request, text: 'x'.repeat(501) }), false);
  assert.equal(validQuickLogRequest({ ...request, timeZone: 'Mars/Base' }), false);
  assert.match(quickLogUserMessage(request), /"sentence": "cola"/);
  const item = QUICK_LOG_SCHEMA.properties.records.items;
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
  assert.equal(item.additionalProperties, false);
});
