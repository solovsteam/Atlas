import { Link } from 'react-router-dom';
import { localClock, sleepScreenState } from '@shared/sleepScreens';
import { useSleepLog } from '../../hooks/useSleepLog';
import { useSleepClock } from '../../hooks/useSleepClock';

export function SleepNowCards() {
  const { entries, loading, error } = useSleepLog();
  const now = useSleepClock();
  if (loading || error) return null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const state = sleepScreenState(entries, now, timeZone);
  const cards = [
    ...(state.morningMissing ? [{ title: 'Log last night', to: '/sleep/morning' }] : []),
    ...(Number(localClock(now, timeZone).slice(0, 2)) >= 20 && state.eveningMissing ? [{ title: 'Evening log', to: '/sleep/evening' }] : []),
    ...(!state.eveningMissing && state.lightsOutMissing ? [{ title: 'Lights out', to: '/sleep/lights-out' }] : []),
  ];
  return <div className="mt-4 grid gap-2 sm:grid-cols-3">{cards.map(card => <Link className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-4 text-indigo-200 hover:border-indigo-400" key={card.to} to={card.to}>{card.title}</Link>)}</div>;
}
