import { addDays } from './recurringReferences';
import type { DayRecall, RecallState } from './dayEvidence';

/** Only explicit, single-subject recollections can bypass the time-based interpreter. */
export function parseQuickRecall(text: string, buttons: readonly { substance: string; label: string }[], today: string, timeZone: string): DayRecall | { question: string } | null {
  const normalized = text.toLowerCase().replace(/’/g, "'").replace(/\bi'm\b/g, 'i am').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/\b(?:remember|unsure|not sure|forgot|forget|unknown|don't know|do not know|maybe|might|possibly|not when)\b/.test(normalized)) return null;
  const unsure = "(?:i )?(?:can't remember|cannot remember|don't remember|do not remember|forget|forgot|don't know|do not know|am unsure|am not sure|not sure|unsure)";
  const when = new RegExp('^' + unsure + ' (when|if|whether) i (?:took|ate|had) (.+)$');
  const date = /\byesterday\b/.test(normalized) ? addDays(today, -1) : today;
  const phrase = normalized.replace(/^(today|yesterday) /, '').replace(/ (today|yesterday)$/, '')
    .replace(/^i (?:only )?remember (?:that )?i /, 'i ');
  const match = when.exec(phrase);
  const known = /^(?:i )?(?:took|ate|had) (.+?) (?:today |yesterday )?(?:but )?(?:i )?(?:can't remember|don't remember|don't know|do not remember|forget|forgot|not) (?:when|what time)$/.exec(phrase);
  const name = (match?.[2] ?? known?.[1] ?? '').replace(/^(?:my|the) /, '');
  const state: RecallState = known || match?.[1] === 'when' ? 'happened' : 'unsure';
  if (name === 'dinner' || name === 'evening meal') return { date, timeZone, state, subject: 'meal:dinner', label: 'Dinner' };
  const matches = buttons.filter(button => [button.substance, button.label].some(value => value.toLowerCase() === name));
  if (matches.length && new Set(matches.map(button => button.substance)).size === 1) {
    return { date, timeZone, state, subject: 'intake:' + matches[0].substance, label: matches[0].label };
  }
  if (!/\b(?:took|taken|ate|dinner|intake|supplement)\b/.test(normalized)) return null;
  return { question: 'Which intake or meal, and which day? For example, “Yesterday I can’t remember whether I took magnesium”. For another date, choose the day in Intake.' };
}
