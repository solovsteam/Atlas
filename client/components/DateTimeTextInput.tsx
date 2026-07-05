import { useState } from "preact/hooks";
import {
  DATE_PLACEHOLDER,
  DATE_TIME_PLACEHOLDER,
  europeanDateFromIso,
  europeanDateTimeFromIso,
  isoFromEuropeanDate,
  isoFromEuropeanDateTime,
  parseEuropeanDate,
  parseEuropeanDateTime,
  validateEuropeanDate,
  validateEuropeanDateTime
} from "../../shared/locale";

type DateTimeTextInputProps = {
  value: string;
  onChange: (value: string) => void;
  mode: "date" | "datetime";
  className?: string;
  inputClassName?: string;
  onValidIso?: (iso: string) => void;
  endOfDay?: boolean;
};

export function DateTimeTextInput({
  value,
  onChange,
  mode,
  className = "block text-sm",
  inputClassName = "w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white",
  onValidIso,
  endOfDay = false
}: DateTimeTextInputProps) {
  const [error, setError] = useState("");

  function commit(nextValue: string) {
    onChange(nextValue);
    if (!onValidIso) {
      setError("");
      return;
    }

    if (!nextValue.trim()) {
      setError("");
      onValidIso("");
      return;
    }

    if (mode === "date") {
      const validationError = validateEuropeanDate(nextValue);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError("");
      onValidIso(isoFromEuropeanDate(nextValue, endOfDay));
      return;
    }

    const validationError = validateEuropeanDateTime(nextValue);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    onValidIso(isoFromEuropeanDateTime(nextValue));
  }

  return (
    <label className={className}>
      <input
        className={inputClassName}
        placeholder={mode === "date" ? DATE_PLACEHOLDER : DATE_TIME_PLACEHOLDER}
        spellCheck={false}
        type="text"
        value={value}
        onBlur={(event) => commit((event.currentTarget as HTMLInputElement).value)}
        onInput={(event) => {
          setError("");
          onChange((event.currentTarget as HTMLInputElement).value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit((event.currentTarget as HTMLInputElement).value);
          }
        }}
      />
      {error ? <span className="mt-1 block text-xs text-red-400">{error}</span> : null}
    </label>
  );
}

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
    setText(nextValue);
    if (!nextValue.trim()) {
      setError("");
      onSave("");
      return;
    }

    const parsed = mode === "date" ? parseEuropeanDate(nextValue) : parseEuropeanDateTime(nextValue);
    if (!parsed) {
      setError(mode === "date" ? `Use ${DATE_PLACEHOLDER}` : `Use ${DATE_TIME_PLACEHOLDER}`);
      return;
    }

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
        onBlur={(event) => commit((event.currentTarget as HTMLInputElement).value)}
        onInput={(event) => {
          setError("");
          setText((event.currentTarget as HTMLInputElement).value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit((event.currentTarget as HTMLInputElement).value);
          }
        }}
      />
      {error ? <span className="mt-1 block text-xs text-red-400">{error}</span> : null}
    </label>
  );
}
