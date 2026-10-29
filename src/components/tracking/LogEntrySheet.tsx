import { useEffect, useMemo, useState } from "react";
import {
  dateFromWheel,
  describeAgo,
  formatClock,
  isWheelInFuture,
  stageFromWheel,
  toggleTag,
  WHEEL_DAYS_BACK,
  WHEEL_MINUTE_STEP,
  wheelDayLabel,
  wheelSelectionForNow,
  type EntryStage,
  type WheelSelection
} from "@shared/documentationEntries";
import { pad2 } from "@shared/locale";
import { SituationChips } from "./SituationChips";
import { WHEEL_ROW_HEIGHT, WheelColumn, type WheelOption } from "./TimeWheel";

/**
 * Bottom sheet that asks "when?". It opens at the current time, so saving
 * straight away records "now"; scrolling the wheels moves the entry into the
 * past. The stage follows from that: the present moment means "while doing
 * it", an earlier time means "in hindsight". The chips are optional.
 */
export function LogEntrySheet({
  title,
  chipsLabel,
  chips,
  onSave,
  onClose
}: {
  title: string;
  chipsLabel: string;
  chips: string[];
  onSave: (occurredAt: Date, stage: EntryStage, tags: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [openedAt] = useState(() => new Date());
  const [selection, setSelection] = useState<WheelSelection>(() => wheelSelectionForNow(openedAt));
  const [touched, setTouched] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayOptions = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: WHEEL_DAYS_BACK + 1 }, (_, index) => {
        const offset = WHEEL_DAYS_BACK - index;
        return { value: offset, label: wheelDayLabel(offset, openedAt) };
      }),
    [openedAt]
  );
  const hourOptions = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: 24 }, (_, hour) => ({
        value: hour,
        label: pad2(hour),
        disabled: isWheelInFuture({ dayOffset: selection.dayOffset, hour, minute: 0 }, openedAt)
      })),
    [openedAt, selection.dayOffset]
  );
  const minuteOptions = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: 60 / WHEEL_MINUTE_STEP }, (_, index) => {
        const minute = index * WHEEL_MINUTE_STEP;
        return {
          value: minute,
          label: pad2(minute),
          disabled: isWheelInFuture({ ...selection, minute }, openedAt)
        };
      }),
    [openedAt, selection]
  );

  const chosen = dateFromWheel(selection, openedAt);
  const inFuture = isWheelInFuture(selection, openedAt);

  function change(patch: Partial<WheelSelection>) {
    setTouched(true);
    setSelection((current) => ({ ...current, ...patch }));
  }

  async function save() {
    if (inFuture || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Untouched wheels mean "now", to the second.
      const stage = stageFromWheel(touched, chosen, dateFromWheel(wheelSelectionForNow(openedAt), openedAt));
      await onSave(touched ? chosen : new Date(), stage, tags);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const summary = !touched
    ? "Now"
    : inFuture
      ? "That time is in the future."
      : `${wheelDayLabel(selection.dayOffset, openedAt)} ${formatClock(chosen)} · ${describeAgo(chosen, openedAt)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={`${title}: when?`}>
      <button aria-label="Close" className="absolute inset-0 bg-black/70" type="button" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-t-2xl border border-neutral-800 bg-neutral-900 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-2xl md:rounded-2xl md:pb-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className={`text-sm ${inFuture ? "text-amber-300" : "text-neutral-400"}`} role="status">
            {summary}
          </p>
        </div>
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 rounded-lg bg-neutral-800"
            style={{ top: 2 * WHEEL_ROW_HEIGHT, height: WHEEL_ROW_HEIGHT }}
          />
          <div className="relative grid grid-cols-[1.6fr_1fr_1fr] gap-1">
            <WheelColumn label="Day" options={dayOptions} value={selection.dayOffset} onChange={(dayOffset) => change({ dayOffset })} />
            <WheelColumn label="Hour" options={hourOptions} value={selection.hour} onChange={(hour) => change({ hour })} />
            <WheelColumn label="Minute" options={minuteOptions} value={selection.minute} onChange={(minute) => change({ minute })} />
          </div>
        </div>
        <p className="mb-2 mt-4 text-xs text-neutral-400">{chipsLabel}</p>
        <SituationChips options={chips} selected={tags} onToggle={(tag) => setTags((current) => toggleTag(current, tag))} />
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
          <button
            className="rounded-xl border border-neutral-700 px-4 py-3 text-sm text-neutral-300 hover:border-neutral-500"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
            disabled={inFuture || saving}
            type="button"
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
