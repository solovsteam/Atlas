import { useEffect, useState } from 'react';
import { validDrink, type Drink } from '@shared/drinks';
import type { useSleepLog } from '../hooks/useSleepLog';
import { useSleepSave } from '../hooks/useSleepSave';
import { sleepButton, sleepInput } from './sleep/SleepFields';

type Store = ReturnType<typeof useSleepLog>;
type Row = { id: string; name: string; aliases: string; caffeine: string; servings: string; source: string; estimate: boolean; hidden: boolean };

const toRow = (d: Drink): Row => ({ id: d.id, name: d.name, aliases: d.aliases.join(', '), caffeine: String(d.caffeineMgPer100Ml),
  servings: d.servings.map(s => `${s.name} ${s.ml}`).join(', '), source: d.source, estimate: d.estimate, hidden: d.hidden });

/** "can 330, bottle 500" becomes two servings. Returns null for a part that is not "name ml". */
function servings(text: string): Drink['servings'] | null {
  const parts = text.split(',').map(p => p.trim()).filter(Boolean);
  const parsed = parts.map(p => p.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:ml)?$/i));
  if (parsed.some(m => !m)) return null;
  return parsed.map(m => ({ name: m![1].trim().toLowerCase(), ml: Number(m![2].replace(',', '.')) }));
}
function toDrink(row: Row): Drink | string {
  const list = servings(row.servings);
  if (!list) return `${row.name || 'A drink'}: write servings as “can 330, bottle 500”.`;
  const drink: Drink = { id: row.id, name: row.name.trim(), aliases: row.aliases.split(',').map(a => a.trim()).filter(Boolean),
    caffeineMgPer100Ml: Number(row.caffeine.replace(',', '.')), servings: list, source: row.source.trim(), estimate: row.estimate, hidden: row.hidden };
  return validDrink(drink) ? drink : `${row.name || 'A drink'}: enter a name and caffeine between 0 and 2000 mg per 100 ml.`;
}

/** The drink list converts amounts into caffeine. Past entries keep their own values. */
export function DrinkSettings({ store }: { store: Store }) {
  const [rows, setRows] = useState(() => store.settings.drinks.map(toRow));
  useEffect(() => setRows(store.settings.drinks.map(toRow)), [store.settings.drinks]);
  const save = useSleepSave();
  const patch = (id: string, value: Partial<Row>) => setRows(current => current.map(r => r.id === id ? { ...r, ...value } : r));
  const field = (row: Row, key: 'name' | 'aliases' | 'caffeine' | 'servings' | 'source', label: string, hint?: string) =>
    <label className="block space-y-1 text-sm"><span className="block">{label}</span>
      <input aria-label={`${row.name || 'New drink'}: ${label}`} className={`${sleepInput} w-full`} inputMode={key === 'caffeine' ? 'decimal' : undefined}
        value={row[key]} onChange={e => patch(row.id, { [key]: e.target.value })} />
      {hint ? <span className="block text-xs text-neutral-500">{hint}</span> : null}</label>;
  return <details className="rounded-xl border border-neutral-800 p-4"><summary className="cursor-pointer font-medium">Drinks and caffeine</summary><div className="mt-4 space-y-4">
    <p className="text-sm text-neutral-400">The Log box uses this list to convert a drink into caffeine. Changes apply to new entries only. Check the label of your product: values marked as estimates are typical values from other sources.</p>
    {rows.map(row => <fieldset className="space-y-3 rounded-xl border border-neutral-800 p-3" key={row.id}><legend className="px-1 text-sm">{row.name || 'New drink'}</legend>
      {field(row, 'name', 'Name')}
      {field(row, 'aliases', 'Other names', 'Separate names with commas, for example “coke, cola”.')}
      {field(row, 'caffeine', 'Caffeine in mg per 100 ml')}
      {field(row, 'servings', 'Servings in ml', 'For example “can 330, bottle 500”.')}
      {field(row, 'source', 'Source of the caffeine value')}
      <div className="flex flex-wrap gap-4">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={row.estimate} onChange={e => patch(row.id, { estimate: e.target.checked })} />Estimate</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={row.hidden} onChange={e => patch(row.id, { hidden: e.target.checked })} />Hide</label>
      </div>
    </fieldset>)}
    <button className={sleepButton} type="button" onClick={() => setRows(current => [...current, { id: `drink-${crypto.randomUUID()}`, name: '', aliases: '', caffeine: '', servings: '', source: '', estimate: true, hidden: false }])}>Add a drink</button>
    <button className={`${sleepButton} w-full bg-indigo-500`} type="button" disabled={save.busy} onClick={() => void save.run(async () => {
      const drinks = rows.map(toDrink);
      const problem = drinks.find(d => typeof d === 'string');
      if (problem) throw new Error(problem as string);
      await store.saveSettings({ ...store.settings, drinks: drinks as Drink[] });
    }, 'The drink list was saved.')}>Save the drink list</button>{save.feedback}
  </div></details>;
}
