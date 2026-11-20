import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayHourRows, dayText, instantAt, instantText, shortDate, sleepLogName, sleepLogTitle, splitInstant } from '../shared/dayLabels';

const zone = 'Europe/Berlin';

test('short dates and relative words', () => {
  assert.equal(shortDate('2026-11-19'), 'Thu 19 Nov');
  assert.equal(dayText('2026-11-19', '2026-11-20'), 'Yesterday, Thu 19 Nov');
  assert.equal(dayText('2026-11-17', '2026-11-20'), 'Tue 17 Nov');
});

test('sleep logs are named by the day they belong to', () => {
  assert.equal(sleepLogTitle('evening', '2026-11-19', '2026-11-20'), 'Yesterday’s evening log · Thu 19 Nov');
  assert.equal(sleepLogName('evening', '2026-11-20', '2026-11-20'), 'This evening’s log');
  assert.equal(sleepLogName('morning', '2026-11-20', '2026-11-20'), 'This morning’s log');
  assert.equal(sleepLogName('lights-out', '2026-11-19', '2026-11-20'), 'Last night’s lights out');
  assert.equal(sleepLogName('morning', '2026-11-12', '2026-11-20'), 'Morning log');
});

test('the hour after 23 is 00 of the next day', () => {
  const rows = dayHourRows('2026-11-19', '2026-11-20', zone);
  assert.equal(rows.length, 48);
  const at = rows.findIndex(row => row.date === '2026-11-19' && row.hour === 23);
  assert.deepEqual(rows[at + 1], { date: '2026-11-20', hour: 0 });
  const instant = instantAt(rows[at + 1], 30, zone);
  assert.deepEqual(splitInstant(instant, zone), { date: '2026-11-20', hour: 0, minute: 30 });
  assert.equal(instantText(instant, zone, '2026-11-20'), 'Today, Fri 20 Nov · 00:30');
});

test('clock changes skip or keep hours correctly', () => {
  // 29 March 2026: 02:00 does not exist in Berlin.
  assert.equal(dayHourRows('2026-03-29', '2026-03-29', zone).length, 23);
  // 25 October 2026: 02:00 happens twice; the wheel lists it once.
  assert.equal(dayHourRows('2026-10-25', '2026-10-25', zone).length, 24);
});

test('a tile for one dose ignores another dose of the same substance', async () => {
  const { lastTakenToday, intakeNow, DEFAULT_INTAKE_BUTTONS } = await import('../shared/intake');
  const three = DEFAULT_INTAKE_BUTTONS.find(b => b.id === 'glycine-3')!;
  const five = DEFAULT_INTAKE_BUTTONS.find(b => b.id === 'glycine-5')!;
  const now = new Date('2026-11-20T12:00:00Z');
  const intake = intakeNow(three, new Date('2026-11-20T10:00:00Z'), zone);
  const rows = [{ id: 'a', entry: { id: 'a', data: {}, occurredAt: intake.takenAt } as never, intake, timeKnown: true, doseKnown: true }];
  assert.ok(lastTakenToday(rows, 'glycine', now, zone, three));
  assert.equal(lastTakenToday(rows, 'glycine', now, zone, five), null);
  assert.ok(lastTakenToday(rows, 'glycine', now, zone));
});
