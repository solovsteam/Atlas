import { useEffect, useState } from "preact/hooks";
import type { DocField } from "../../shared/documentation";

export function DocumentationFieldInput({
  field,
  data,
  onChange
}: {
  field: DocField;
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={data[field.key] === true}
          type="checkbox"
          onChange={(event) => onChange({ ...data, [field.key]: (event.currentTarget as HTMLInputElement).checked })}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "number") {
    const value = typeof data[field.key] === "number" && Number.isFinite(data[field.key]) ? String(data[field.key]) : "";
    return (
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-400">{field.label}</span>
        <input
          className="w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
          type="number"
          value={value}
          onInput={(event) => {
            const raw = (event.currentTarget as HTMLInputElement).value;
            if (!raw.trim()) {
              onChange({ ...data, [field.key]: null });
              return;
            }
            const parsed = Number(raw);
            onChange({ ...data, [field.key]: Number.isFinite(parsed) ? parsed : null });
          }}
        />
      </label>
    );
  }

  if (field.type === "text") {
    return <TextDocField data={data} field={field} onChange={onChange} />;
  }

  return null;
}

function TextDocField({
  field,
  data,
  onChange
}: {
  field: DocField;
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(String(typeof data[field.key] === "string" ? data[field.key] : ""));

  useEffect(() => {
    setText(String(typeof data[field.key] === "string" ? data[field.key] : ""));
  }, [field.key, data]);

  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-400">{field.label}</span>
      <input
        className="w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
        value={text}
        onBlur={() => onChange({ ...data, [field.key]: text })}
        onInput={(event) => setText((event.currentTarget as HTMLInputElement).value)}
      />
    </label>
  );
}
