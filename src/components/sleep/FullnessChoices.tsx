import { BEDTIME_FULLNESS, type SleepRating } from '@shared/sleepLog';
import { sleepButton } from './SleepFields';

export function FullnessChoices({ value, disabled, onChange }: { value?: SleepRating; disabled: boolean; onChange: (value: SleepRating | undefined) => void }) {
  return <div aria-label="Fullness at lights out" role="group" className="space-y-2">
    {BEDTIME_FULLNESS.map(option => <button key={option.value} type="button" disabled={disabled} aria-pressed={value === option.value} className={`${sleepButton} w-full text-left ${value === option.value ? 'border-indigo-400 bg-indigo-500/20' : ''}`} onClick={() => onChange(option.value)}>{option.value}. {option.label}</button>)}
    {value !== undefined ? <button className={`${sleepButton} text-neutral-400`} type="button" disabled={disabled} onClick={() => onChange(undefined)}>Leave fullness unrecorded</button> : null}
  </div>;
}
