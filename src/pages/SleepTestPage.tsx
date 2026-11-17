import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { civilDate } from '@shared/recurringReferences';
import type { ReactionTestResult } from '@shared/reactionTest';
import { ReactionTest } from '../components/sleep/ReactionTest';
import { useSleepLog } from '../hooks/useSleepLog';

export function SleepTestPage() {
  const { tests, loading, error, saveReactionTest } = useSleepLog();
  const [params] = useSearchParams();
  const requestedDate = params.get('date');
  const navigate = useNavigate();
  const completed = useRef(false);
  const [status, setStatus] = useState<'ready' | 'saving' | 'saved' | 'failed'>('ready');
  const [result, setResult] = useState<ReactionTestResult | null>(null);
  const [saveError, setSaveError] = useState('');
  // Freeze metadata before the test so a clock-zone change cannot relabel the session.
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  async function complete(result: ReactionTestResult) {
    if (completed.current) return;
    completed.current = true;
    setResult(result);
    setStatus('saving');
    try {
      await saveReactionTest(result, timeZone);
      setStatus('saved');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not save the test.');
      setStatus('failed');
    }
  }
  if (loading && !result) return <p role="status">Loading the sleep log…</p>;
  if (error && !result) return <section className="space-y-3"><p role="alert">{error}</p><Link className="underline" to="/">Back to Now</Link></section>;
  if (requestedDate && requestedDate !== civilDate(new Date(), timeZone)) return <section className="space-y-4"><h1 className="text-3xl font-semibold">Reaction test: {requestedDate}</h1><p>This test was missed. A test today cannot replace the missed test.</p><Link className="text-indigo-300 underline" to="/sleep#missing">Back to Missing</Link></section>;
  return <section className="max-w-2xl space-y-4">
    {result ? <>
      <h1 className="text-3xl font-semibold">{result.practice ? 'Practice test complete' : 'Test complete'}</h1>
      <p>{result.summary.lapses} {result.summary.lapses === 1 ? 'lapse' : 'lapses'}. Sleepiness: {result.sleepiness} of 9.</p>
    </> : <ReactionTest previousTestCount={tests.length} onComplete={value => void complete(value)} onCancel={() => navigate('/')} />}
    {status === 'saving' ? <p role="status">Saving the test…</p> : null}
    {status === 'saved' ? <p role="status">The test was saved. You can undo the save.</p> : null}
    {status === 'failed' ? <p role="alert">{saveError} The save was not confirmed. The result is shown above.</p> : null}
    {status !== 'saving' ? <Link className="inline-block py-2 text-sm underline" to="/">Back to Now</Link> : null}
  </section>;
}
