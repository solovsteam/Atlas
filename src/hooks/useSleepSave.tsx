import { useState } from 'react';
import { useUndo } from '../context/UndoContext';

export function useSleepSave() {
  const { undo, canUndo } = useUndo();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function run(action: () => Promise<unknown>, success = 'Saved.') {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(success); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save.'); }
    finally { setBusy(false); }
  }
  const feedback = <div aria-live="polite">{message ? <p className="text-sm text-indigo-200" role="status">{message} {canUndo ? <button className="ml-2 min-h-11 underline" type="button" disabled={busy} onClick={() => void run(async () => { await undo(); }, 'Undone.')}>Undo</button> : null}</p> : null}{error ? <p className="break-words text-sm text-red-300" role="alert">{error}</p> : null}</div>;
  return { busy, message, error, run, feedback };
}
