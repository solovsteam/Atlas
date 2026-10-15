import { useEffect, useRef, useState } from "react";
import {
  DATE_PLACEHOLDER,
  DATE_TIME_PLACEHOLDER,
  formatEuropeanDate,
  formatEuropeanDateTime,
  isoFromEuropeanDate,
  isoFromEuropeanDateTime,
  validateEuropeanDate,
  validateEuropeanDateTime
} from "@shared/locale";
import type { SlotKind } from "@shared/schedule";
import { useAtlasData } from "../../context/AtlasDataContext";
import { trackCreateUndo, useUndo } from "../../context/UndoContext";
import { DateTimeTextInput } from "../DateTimeTextInput";
import { CloseIcon } from "../icons";

/** New-interval form: a bottom sheet on phones, a centred dialog on wider screens. */
export function IntervalSheet({ start, onClose }: { start: Date; onClose: () => void }) {
  const { createItem } = useAtlasData();
  const { push } = useUndo();
  const [kind, setKind] = useState<SlotKind>("fixed");
  const [startsAt, setStartsAt] = useState(() => formatEuropeanDateTime(start));
  const [endsAt, setEndsAt] = useState(() => formatEuropeanDateTime(new Date(start.getTime() + 60 * 60_000)));
  const [day, setDay] = useState(() => formatEuropeanDate(start));
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // On touch screens the keyboard would cover the sheet, so focus only with a mouse.
    if (window.matchMedia("(pointer: fine)").matches) labelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    const problem =
      kind === "allDay" ? validateEuropeanDate(day) : validateEuropeanDateTime(startsAt) || validateEuropeanDateTime(endsAt);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await createItem(label.trim() || "Interval", {
        isInterval: true,
        intervalKind: kind,
        intervalStartsAt: kind === "allDay" ? isoFromEuropeanDate(day) : isoFromEuropeanDateTime(startsAt),
        intervalEndsAt: kind === "allDay" ? isoFromEuropeanDate(day, true) : isoFromEuropeanDateTime(endsAt),
        intervalStatus: "scheduled"
      });
      trackCreateUndo(push, result.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create interval");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center" onClick={onClose}>
      <form
        aria-label="New interval"
        className="w-full max-w-md space-y-4 rounded-t-3xl border border-neutral-800 bg-neutral-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl md:rounded-3xl md:pb-5"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void onCreate(event)}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">New interval</h2>
          <button aria-label="Close" className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white" type="button" onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <input
          className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-indigo-400"
          placeholder="Label (optional)"
          ref={labelRef}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <div className="inline-flex rounded-full bg-neutral-950 p-0.5 text-xs">
          {(["fixed", "allDay"] as SlotKind[]).map((entry) => (
            <button
              className={kind === entry ? "rounded-full bg-neutral-700 px-3 py-1 font-medium text-white" : "rounded-full px-3 py-1 text-neutral-400 hover:text-white"}
              key={entry}
              type="button"
              onClick={() => setKind(entry)}
            >
              {entry === "allDay" ? "All day" : "Timed"}
            </button>
          ))}
        </div>
        {kind === "allDay" ? (
          <DateTimeTextInput label="Date" mode="date" placeholder={DATE_PLACEHOLDER} value={day} onChange={setDay} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <DateTimeTextInput label="Starts" mode="datetime" placeholder={DATE_TIME_PLACEHOLDER} value={startsAt} onChange={setStartsAt} />
            <DateTimeTextInput label="Ends" mode="datetime" placeholder={DATE_TIME_PLACEHOLDER} value={endsAt} onChange={setEndsAt} />
          </div>
        )}
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        <button
          className="w-full bg-indigo-500 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          disabled={busy}
          type="submit"
        >
          Create interval
        </button>
      </form>
    </div>
  );
}
