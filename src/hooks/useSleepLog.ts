import { useCallback, useMemo, useRef, useState } from 'react';
import { type DayEvidence, type MedicineAnswer } from '@shared/dayEvidence';
import { readIntakes, assignedIntakes, nightIntakeAdherence, type Intake, type IntakeRecord } from '@shared/intake';
import type { Item } from '@shared/item';
import { isSleepLog, sleepNight, type SleepEvening, type SleepMorning } from '@shared/sleepLog';
import { sleepScreenSettings, sleepSettingsSchema, type SleepScreenSettings } from '@shared/sleepScreens';
import { sleepReactionTest } from '@shared/sleepReactionTest';
import type { SleepTrialAssignment } from '@shared/sleepTrial';
import type { ReactionTestResult } from '@shared/reactionTest';
import { useAtlasData } from '../context/AtlasDataContext';
import { trackCreateEntryUndo, trackDeleteEntryUndo, trackUpdateEntryUndo, trackItemPatchUndo, useUndo } from '../context/UndoContext';
import { useDocumentationEntries, useEntryMutations } from './useDocumentationEntries';
import { findOrCreateSleepLog, sleepLogStore, type SleepEntryChange } from '../services/sleepLog';
import { supabase } from '../lib/supabase';

/** Reading never creates an item. The first save creates the Sleep container if needed. */
export function useSleepLog() {
  const { items, userId, itemsLoading, itemsError, updateItem } = useAtlasData();
  const { push } = useUndo();
  const [createdItem, setCreatedItem] = useState<Item | null>(null);
  const item = items.find(row => row.isDocumentation && isSleepLog(row))
    ?? (createdItem?.ownerId === userId ? createdItem : null);
  const { entries, loading, error, refresh } = useDocumentationEntries(userId, item?.id);
  const writer = useEntryMutations(userId);
  const store = useMemo(() => userId ? sleepLogStore(supabase, userId, writer) : null, [userId, writer]);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  // Serialize writes from this hook, including two fast morning saves.
  const mutate = useCallback(<T,>(action: (id: string, service: NonNullable<typeof store>, container: Item) => Promise<T>) => {
    const run = chain.current.catch(() => undefined).then(async () => {
      if (!userId || !store) throw new Error('Not signed in');
      if (itemsLoading) throw new Error('The sleep log is still loading.');
      if (itemsError) throw new Error(itemsError);
      const container = await findOrCreateSleepLog(supabase, userId);
      setCreatedItem(container);
      return action(container.id, store, container);
    });
    chain.current = run;
    return run;
  }, [userId, store, itemsLoading, itemsError]);
  const record = useCallback((change: SleepEntryChange) => {
    if (change.before) trackUpdateEntryUndo(push, change.before);
    else trackCreateEntryUndo(push, change.entry);
    return change.entry;
  }, [push]);
  const saveSettings = useCallback((settings: SleepScreenSettings) => mutate(async (_id, _service, container) => {
    const schema = sleepSettingsSchema(container.documentationSchema, settings);
    const result = await updateItem(container.id, JSON.stringify({ documentationSchema: schema }), container.revision);
    if (!('ok' in result)) throw new Error('The settings changed elsewhere. Reload before saving.');
    trackItemPatchUndo(push, container.id, { documentationSchema: container.documentationSchema });
    setCreatedItem({ ...container, documentationSchema: schema, revision: result.revision });
  }), [mutate, updateItem, push]);
  const saveEvening = useCallback((evening: SleepEvening, entryId?: string, at = new Date()) => mutate(async (id, service) =>
    record(await service.saveEvening(id, evening, new Date(evening.lightsOut ?? at), entryId))), [mutate, record]);
  const saveMorning = useCallback((morning: SleepMorning, entryId?: string, at = new Date(), lightsOut?: string) => mutate(async (id, service) =>
    record(await service.saveMorning(id, morning, new Date(morning.wakeAt ?? at), entryId, lightsOut))), [mutate, record]);
  const saveReactionTest = useCallback((result: ReactionTestResult, timeZone: string) => mutate(async (id, service) =>
    record(await service.saveReactionTest(id, result, timeZone))), [mutate, record]);
  const deleteEntry = useCallback((entryId: string) => mutate(async (id, service) => {
    const before = await service.deleteEntry(id, entryId);
    trackDeleteEntryUndo(push, before);
  }), [mutate, push]);

  const saveDayEvidence = useCallback((kind: 'dayConfirmation' | 'medicineAnswer', value: DayEvidence | MedicineAnswer, entryId?: string) => mutate(async (id, service) =>
    record(await service.saveDayEvidence(id, kind, value, entryId))), [mutate, record]);
  const saveIntake = useCallback((intake: Intake, entryId?: string, legacyKey?: string) => mutate(async (id, service) =>
    record(await service.saveIntake(id, intake, entryId, legacyKey))), [mutate, record]);
  const saveAssignedIntakes = useCallback((evening: SleepEvening, assignment: SleepTrialAssignment, targetLightsOutAt: string, entryId?: string) => mutate(async (id, service) => {
    const changes: SleepEntryChange[] = [];
    const now = new Date();
    try {
      for (const intake of assignedIntakes(assignment, now, evening.timeZone!)) {
        changes.push(await service.saveIntake(id, intake));
      }
      const change = await service.saveEvening(id, { ...evening, trial: { assignment, adherence: 'unknown', confirmation: 'self-report',
        confirmedAt: now.toISOString(), targetLightsOutAt, intakeLog: true } }, now, entryId);
      changes.push(change);
      return change.entry;
    } catch (cause) {
      throw new Error(`The assignment was not fully recorded. Review Intake before trying again. ${cause instanceof Error ? cause.message : ''}`);
    } finally {
      if (changes.length) push({ kind: 'batchEntries', changes });
    }
  }), [mutate, push]);
  const deleteIntake = useCallback((row: IntakeRecord) => row.legacyKey
    ? mutate(async (id, service) => record(await service.hideLegacyIntake(id, row.legacyKey!, new Date(row.intake.takenAt))))
    : deleteEntry(row.entry.id), [mutate, record, deleteEntry]);
  const intakes = useMemo(() => readIntakes(entries), [entries]);
  const nights = useMemo(() => entries.flatMap(entry => {
    const night = sleepNight(entry);
    if (night?.evening?.trial && night.evening.lightsOut) {
      const trial = night.evening.trial;
      night.evening = { ...night.evening, trial: { ...trial, adherence: nightIntakeAdherence(night, intakes, entries) } };
    }
    return night ? [{ entry, night }] : [];
  }), [entries, intakes]);
  const tests = useMemo(() => entries.flatMap(entry => {
    const result = sleepReactionTest(entry);
    return result ? [{ entry, result }] : [];
  }), [entries]);
  const settings = useMemo(() => sleepScreenSettings(item?.documentationSchema), [item?.documentationSchema]);
  return {
    item, settings, entries, nights, tests, intakes,
    loading: itemsLoading || (item !== null && loading), error: itemsError ?? error, refresh,
    saveEvening, saveMorning, saveReactionTest, saveSettings, deleteEntry, saveDayEvidence, saveIntake, deleteIntake, saveAssignedIntakes,
  };
}
