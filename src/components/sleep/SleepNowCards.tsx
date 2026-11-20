import { missingData } from '@shared/missingData';
import { Link } from 'react-router-dom';
import { addDays } from '@shared/recurringReferences';
import { sleepLogTitle } from '@shared/dayLabels';
import { localClock, sleepScreenState } from '@shared/sleepScreens';
import { reactionTestCardDue } from '@shared/sleepIntegration';
import { useSleepLog } from '../../hooks/useSleepLog';
import { useSleepClock } from '../../hooks/useSleepClock';

export function SleepNowCards() {
  const { entries, tests, settings, loading, error } = useSleepLog();
  const now = useSleepClock();
  if (loading || error) return null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const state = sleepScreenState(entries, now, timeZone);
  const missing = missingData(entries, now, timeZone, settings);
  const cards = [
    ...(missing.length ? [{ title: `Missing data: ${missing.length}`, to: '/sleep#missing' }] : []),
    ...(reactionTestCardDue(now, timeZone, settings.testTime, tests.map(row => row.result)) ? [{ title: 'Reaction test', to: '/sleep/test' }] : []),
    ...(state.morningMissing ? [{ title: sleepLogTitle('morning', state.today, state.today), to: '/sleep/morning' }] : []),
    ...(Number(localClock(now, timeZone).slice(0, 2)) >= 20 && state.eveningMissing ? [{ title: sleepLogTitle('evening', addDays(state.wakeDate, -1), state.today), to: '/sleep/evening' }] : []),
    ...(!state.eveningMissing && state.lightsOutMissing ? [{ title: sleepLogTitle('lights-out', addDays(state.wakeDate, -1), state.today), to: '/sleep/lights-out' }] : []),
  ];
  return <div className="mt-4 grid gap-2 sm:grid-cols-3">{cards.map(card => <Link className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-4 text-indigo-200 hover:border-indigo-400" key={card.to} to={card.to}>{card.title}</Link>)}</div>;
}
