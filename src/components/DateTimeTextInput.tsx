import { useState } from "react";
import {
  DATE_PLACEHOLDER,
  DATE_TIME_PLACEHOLDER,
  europeanDateFromIso,
  europeanDateTimeFromIso,
  formatEuropeanDate,
  formatEuropeanDateTime,
  parseFlexibleDate,
  parseFlexibleDateTime
} from "@shared/locale";

type EditableSlotTimeProps = {
  iso: string | null;
  label: string;
  mode: "date" | "datetime";
  onSave: (iso: string) => void;
};

export function EditableSlotTime({ iso, label, mode, onSave }: EditableSlotTimeProps) {
  const [text, setText] = useState(() => (mode === "date" ? europeanDateFromIso(iso) : europeanDateTimeFromIso(iso)));
  const [error, setError] = useState("");

  function commit(nextValue: string) {
    if (!nextValue.trim()) {
      setText("");
      setError("");
      onSave("");
      return;
    }

    const parsed = mode === "date" ? parseFlexibleDate(nextValue) : parseFlexibleDateTime(nextValue);
    if (!parsed) {
      setText(nextValue);
      setError(mode === "date" ? `Use ${DATE_PLACEHOLDER}` : `Use ${DATE_TIME_PLACEHOLDER}`);
      return;
    }

    const normalized = mode === "date" ? formatEuropeanDate(parsed) : formatEuropeanDateTime(parsed);
    setText(normalized);
    setError("");
    onSave(parsed.toISOString());
  }

  return (
    <label className="text-xs text-neutral-500">
      {label}
      <input
        className="mt-1 w-full border border-neutral-700 bg-black px-2 py-1 text-sm outline-none focus:border-white"
        placeholder={mode === "date" ? DATE_PLACEHOLDER : DATE_TIME_PLACEHOLDER}
        spellCheck={false}
        type="text"
        value={text}
        onBlur={(event) => commit(event.target.value)}
        onChange={(event) => {
          setError("");
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget.value);
          }
        }}
      />
      {error ? <span className="mt-1 block text-xs text-red-400">{error}</span> : null}
    </label>
  );
}
