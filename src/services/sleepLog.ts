import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { itemFromDbRow, type Item } from '@shared/item';
import type { DocumentationEntry } from '@shared/documentationEntries';
import { DEFAULT_SLEEP_SETTINGS, isSleepLog, morningWithLightsOut, matchingSleepNight, sleepNight, type SleepEvening, type SleepMorning } from '@shared/sleepLog';
import { intakeData, sleepIntake, type Intake } from '@shared/intake';
import { sleepReactionTest } from '@shared/sleepReactionTest';
import type { ReactionTestResult } from '@shared/reactionTest';
import type { Database, DbItemRow } from '../types/database';
import { createItem } from './items';
import { createEntry, deleteEntry, fetchEntries, updateEntryData } from './documentationEntries';

type Client = SupabaseClient<Database>;
export type SleepEntryWriter = {
  createEntry: (itemId: string, at: Date, data: Record<string, unknown>) => Promise<DocumentationEntry>;
  updateEntry: (entry: DocumentationEntry, data: Record<string, unknown>, at?: Date) => Promise<DocumentationEntry>;
  deleteEntry: (entry: DocumentationEntry) => Promise<void>;
};
export type SleepEntryChange = { entry: DocumentationEntry; before?: DocumentationEntry };

/** A stable owner-specific id prevents concurrent first-use creates on different devices. */
export function sleepLogItemId(userId: string): string {
  const hex = bytesToHex(sha256(utf8ToBytes(`atlas-sleep-log-v1:${userId}`))).slice(0, 32).split('');
  hex[12] = '8';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
export async function findSleepLog(client: Client, userId: string): Promise<Item | null> {
  const items: Item[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from('items').select('*').eq('owner_id', userId)
      .eq('is_documentation', true).order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    items.push(...((data ?? []) as DbItemRow[]).map(itemFromDbRow).filter(isSleepLog));
    if (!data || data.length < 1000) break;
  }
  if (items.length > 1) throw new Error('More than one sleep log exists. Resolve the duplicate before saving.');
  return items[0] ?? null;
}
export async function findOrCreateSleepLog(client: Client, userId: string): Promise<Item> {
  const found = await findSleepLog(client, userId);
  if (found) return found;
  try {
    await createItem(client, userId, 'Sleep', {
      id: sleepLogItemId(userId), isDocumentation: true,
      documentationSchema: { sleepLog: { settings: DEFAULT_SLEEP_SETTINGS } },
    });
  } catch (error) {
    // Another device may have created the same id. Read once, never replay the write.
    const concurrent = await findSleepLog(client, userId);
    if (concurrent) return concurrent;
    throw error;
  }
  const created = await findSleepLog(client, userId);
  if (!created) throw new Error('Could not read the new sleep log.');
  return created;
}

/** The hook supplies the normal writers so mutations also update other views in this tab. */
export function sleepLogStore(client: Client, userId: string, writer: SleepEntryWriter = {
  createEntry: (itemId, at, data) => createEntry(client, userId, itemId, at, data),
  updateEntry: (entry, data, at) => updateEntryData(client, userId, entry.id, data, at),
  deleteEntry: entry => deleteEntry(client, userId, entry.id),
}) {
  async function current(itemId: string, id: string) {
    const entry = (await fetchEntries(client, userId, itemId)).find(row => row.id === id);
    if (!entry) throw new Error('The sleep entry no longer exists.');
    return entry;
  }
  async function savePart(itemId: string, part: 'evening' | 'morning', value: SleepEvening | SleepMorning, at: Date, entryId?: string, lightsOut?: string): Promise<SleepEntryChange> {
    if (!value.timeZone) throw new Error('A time zone is required.');
    new Intl.DateTimeFormat('en', { timeZone: value.timeZone });
    const before = entryId ? await current(itemId, entryId) : part === 'morning'
      ? matchingSleepNight(await fetchEntries(client, userId, itemId), at.toISOString()) : null;
    const night = before ? sleepNight(before) : {};
    if (!night) throw new Error('This entry is not a night.');
    const data = { ...before?.data, kind: 'night', sleepLog: part === 'morning' ? morningWithLightsOut(night, value as SleepMorning, lightsOut) : { ...night, [part]: value } };
    return before ? { entry: await writer.updateEntry(before, data), before }
      : { entry: await writer.createEntry(itemId, at, data) };
  }
  return {
    readEntries: (itemId: string) => fetchEntries(client, userId, itemId),
    saveEvening: (itemId: string, evening: SleepEvening, at: Date, entryId?: string) => savePart(itemId, 'evening', evening, at, entryId),
    saveMorning: (itemId: string, morning: SleepMorning, at: Date, entryId?: string, lightsOut?: string) => savePart(itemId, 'morning', morning, at, entryId, lightsOut),
    async saveIntake(itemId: string, intake: Intake, entryId?: string, legacyKey?: string): Promise<SleepEntryChange> {
      const before = entryId ? await current(itemId, entryId) : undefined;
      if (before && !sleepIntake(before)) throw new Error('This entry is not an intake.');
      const data = intakeData(intake, legacyKey ?? (typeof before?.data.replacesLegacy === 'string' ? before.data.replacesLegacy : undefined));
      return before ? { entry: await writer.updateEntry(before, data, new Date(intake.takenAt)), before }
        : { entry: await writer.createEntry(itemId, new Date(intake.takenAt), data) };
    },
    async hideLegacyIntake(itemId: string, legacyKey: string, at: Date): Promise<SleepEntryChange> {
      return { entry: await writer.createEntry(itemId, at, { kind: 'intakeCorrection', replacesLegacy: legacyKey }) };
    },
    async saveReactionTest(itemId: string, result: ReactionTestResult, timeZone: string): Promise<SleepEntryChange> {
      const data = { kind: 'reactionTest', reactionTest: { ...result, timeZone } };
      if (!sleepReactionTest({ data })) throw new Error('The reaction test result is invalid.');
      return { entry: await writer.createEntry(itemId, new Date(result.startedAt), data) };
    },
    async deleteEntry(itemId: string, id: string) {
      const before = await current(itemId, id);
      await writer.deleteEntry(before);
      return before;
    },
  };
}
