import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { civilDate } from '@shared/recurringReferences';
import { instantText } from '@shared/dayLabels';
import { DateTimeWheel } from '../tracking/DateTimeWheel';
import { WheelColumn } from '../tracking/TimeWheel';

export const sleepButton = 'min-h-11 rounded-xl border border-neutral-700 px-3 py-2 text-sm hover:border-indigo-400 disabled:opacity-40';
export const sleepInput = 'min-h-11 min-w-0 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white';
export function SleepFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="mx-auto max-w-xl space-y-6 pb-4"><Link className="inline-block py-2 text-sm text-indigo-300" to="/sleep">Sleep</Link><div><h1 className="text-3xl font-semibold tracking-tight">{title}</h1>{subtitle ? <p className="mt-1 text-sm text-neutral-400">{subtitle}</p> : null}</div>{children}</section>;
}
export function Field({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="min-w-0 space-y-3"><legend className="mb-2 font-medium">{title}</legend>{children}</fieldset>;
}
export function Choices<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <div aria-label={label} className="flex flex-wrap gap-2" role="group">{options.map(option => <button aria-pressed={value === option.value} className={`${sleepButton} ${value === option.value ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'text-neutral-400'}`} key={option.value} type="button" onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
const hours = Array.from({ length: 24 }, (_, value) => ({ value, label: String(value).padStart(2, '0') }));
const minutes = Array.from({ length: 60 }, (_, value) => ({ value, label: String(value).padStart(2, '0') }));
export function ClockField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [hour, minute] = value.split(':').map(Number);
  return <details className="rounded-xl border border-neutral-800 p-3"><summary className="cursor-pointer text-sm">{label}: <span className="font-medium text-indigo-200">{value}</span></summary><div className="relative mt-2 grid grid-cols-2"><div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-20 h-10 rounded-lg bg-neutral-800" /><WheelColumn label={`${label}: hour`} options={hours} value={hour} onChange={h => onChange(`${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)} /><WheelColumn label={`${label}: minute`} options={minutes} value={minute} onChange={m => onChange(`${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`)} /></div></details>;
}
/** A moment, shown as a dated line that opens one wheel for the day, hour and minute. */
export function InstantField({ label, value, timeZone, onChange, max }: { label: string; value: string; timeZone: string; onChange: (value: string) => void; max?: string }) {
  const today = civilDate(new Date(), timeZone);
  return <details className="rounded-xl border border-neutral-800 p-3"><summary className="cursor-pointer text-sm">{label}: <span className="font-medium text-indigo-200">{instantText(value, timeZone, today)}</span></summary><div className="mt-2"><DateTimeWheel label={label} value={value} timeZone={timeZone} onChange={onChange} max={max} /></div></details>;
}
