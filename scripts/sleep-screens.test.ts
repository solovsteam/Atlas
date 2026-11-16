import assert from 'node:assert/strict';
import test from 'node:test';
import { requiredWakeForDate, sleepScreenSettings, sleepSettingsSchema, sleepScreenState, activeSleepWakeDate, usualOnset } from '../shared/sleepScreens';
import { atLocalClock } from '../shared/recurringReferences';
import type { DocumentationEntry } from '../shared/documentationEntries';

const settings = sleepScreenSettings(null);
for (const zone of ['Europe/Berlin', 'America/New_York', 'Asia/Kolkata', 'UTC']) {
  test(`required wake in ${zone}: weekday, obligation, weekend and work-only inputs`, () => {
    const monday = '2026-11-16';
    const at = (date: string, clock: string) => atLocalClock(date, `${clock}:00`, zone);
    assert.equal(Date.parse(requiredWakeForDate(monday, zone, settings)!), Date.parse(at(monday, '08:00')));
    assert.equal(Date.parse(requiredWakeForDate(monday, zone, settings, at(monday, '08:30'))!), Date.parse(at(monday, '07:00')));
    assert.equal(Date.parse(requiredWakeForDate(monday, zone, settings, at(monday, '12:00'))!), Date.parse(at(monday, '08:00')));
    assert.equal(requiredWakeForDate('2026-11-21', zone, settings), null);
    assert.equal(Date.parse(requiredWakeForDate('2026-11-21', zone, settings, at('2026-11-21', '10:00'))!), Date.parse(at('2026-11-21', '08:30')));
    assert.equal(Date.parse(requiredWakeForDate(monday, zone, settings, at(monday, '09:00'), [at(monday, '08:00'), at(monday, '10:00')])!), Date.parse(at(monday, '06:30')));
    assert.equal(requiredWakeForDate('2026-11-21', zone, settings, 'bad', [at(monday, '06:00')]), null);
    assert.equal(requiredWakeForDate('2026-11-21', zone, settings, '2026-11-21T06:00:00'), null);
    const edited = { ...settings, weekdayWake: { ...settings.weekdayWake, 1: '07:00' } };
    assert.equal(Date.parse(requiredWakeForDate(monday, zone, edited)!), Date.parse(at(monday, '07:00')));
  });
  test(`active night and card state in ${zone}, including after midnight`, () => {
    const at = (date: string, clock: string) => atLocalClock(date, `${clock}:00`, zone);
    const evening = { id: 'night', occurredAt: at('2026-11-16', '21:00'), data: { kind: 'night', sleepLog: { evening: { timeZone: zone, alarm: '07:30', dayRating: 4 } } } } as DocumentationEntry;
    const eveningNow = new Date(at('2026-11-16', '21:15'));
    assert.equal(activeSleepWakeDate(eveningNow, zone), '2026-11-17');
    assert.equal(sleepScreenState([evening], eveningNow, zone).eveningMissing, false);
    assert.equal(sleepScreenState([evening], eveningNow, zone).lightsOutMissing, true);
    assert.equal(sleepScreenState([evening], new Date(at('2026-11-17', '00:30')), zone).evening?.entry.id, 'night');
    assert.equal(sleepScreenState([evening], new Date(at('2026-11-17', '08:00')), zone, '2026-11-18').eveningMissing, true);
    assert.equal(sleepScreenState([evening], new Date(at('2026-11-17', '08:00')), zone).morningEntry?.id, 'night');
    const complete = { ...evening, data: { kind: 'night', sleepLog: { evening: { lightsOut: at('2026-11-16', '22:30'), timeZone: zone, dayRating: 4 }, morning: { wakeAt: at('2026-11-17', '07:30'), timeZone: zone } } } };
    assert.equal(sleepScreenState([complete], new Date(at('2026-11-17', '08:00')), zone).morningMissing, false);
    assert.equal(sleepScreenState([complete], new Date(at('2026-11-17', '21:00')), zone).eveningMissing, true);
    const lightsOnly = { ...evening, data: { kind: 'night', sleepLog: { evening: { lightsOut: at('2026-11-16', '22:30'), timeZone: zone } } } };
    assert.equal(sleepScreenState([lightsOnly], eveningNow, zone).eveningMissing, true);
  });
}
test('preparation uses elapsed minutes across a daylight-saving transition', () => {
  const value = requiredWakeForDate('2026-03-29', 'Europe/Berlin', settings, '2026-03-29T03:30:00+02:00');
  assert.equal(value, '2026-03-29T00:00:00.000Z');
});
test('defaults, invalid settings and unknown fields survive schema updates', () => {
  assert.deepEqual(settings.usualDoses, { melatonin: 0.5, glycine: 3, magnesium: 200 });
  assert.equal(settings.coffeeTeaspoons, 1);
  assert.equal(sleepScreenSettings({ sleepLog: { settings: { weekdayWake: { 1: '24:00', 2: null }, usualDoses: { glycine: -2 }, coffeeTeaspoons: null } } }).weekdayWake[1], null);
  assert.equal(sleepScreenSettings({ sleepLog: { settings: { weekdayWake: { 2: null } } } }).weekdayWake[2], null);
  const updated = sleepSettingsSchema({ other: 7, sleepLog: { trial: { active: true }, settings: { future: 42 } } }, settings) as any;
  assert.equal(updated.other, 7);
  assert.deepEqual(updated.sleepLog.trial, { active: true });
  assert.equal(updated.sleepLog.settings.future, 42);
});
test('the default onset uses measured minutes and rounds to five', () => {
  assert.equal(usualOnset([]), 15);
  assert.equal(usualOnset([{ morning: { fallAsleepMinutes: 12 } }, { morning: { fallAsleepMinutes: 21 } }, {}]), 15);
  assert.equal(usualOnset([{ morning: { fallAsleepMinutes: -5 } }]), 15);
});


test('weekday obligations use preparation and preserve explicit wake constraints', () => {
  const zone = 'Europe/Berlin';
  const monday = '2026-11-16';
  const clock = (value: string | null) => value && new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
  assert.equal(clock(requiredWakeForDate(monday, zone, settings)), '08:00');
  assert.equal(clock(requiredWakeForDate(monday, zone, { ...settings, preparationMinutes: 60 })), '08:30');
  assert.equal(requiredWakeForDate(monday, zone, { ...settings, weekdayObligation: { ...settings.weekdayObligation, 1: null } }), null);
  const stored = sleepScreenSettings({ sleepLog: { settings: { weekdayWake: { 1: '07:30' } } } });
  assert.equal(clock(requiredWakeForDate(monday, zone, stored)), '07:30');
  assert.equal(settings.weekdayWake[1], null);
  assert.equal(settings.weekdayObligation[0], null);
  assert.equal(settings.weekdayObligation[6], null);
  assert.equal(requiredWakeForDate('2026-11-22', zone, settings), null);
  const parsed = sleepScreenSettings({ sleepLog: { settings: { weekdayObligation: { 1: { start: 'bad', end: '19:30', label: 'Work' }, 2: null, 3: { start: '10:00', end: '18:00', label: 'Appointment' } } } } });
  assert.equal(parsed.weekdayObligation[1]?.start, '09:30');
  assert.equal(parsed.weekdayObligation[2], null);
  assert.equal(parsed.weekdayObligation[3]?.start, '10:00');
});
