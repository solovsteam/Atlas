import { useState, type FormEvent } from "react";
import { cleanTag, cleanTags, MAX_TAG_LENGTH } from "@shared/documentationEntries";

/** Optional situation tags: earlier ones as chips, plus a field for a new one. */
export function SituationChips({
  options,
  selected,
  onToggle
}: {
  options: string[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const selectedKeys = new Set(selected.map((tag) => tag.toLowerCase()));
  const chips = cleanTags([...options, ...selected]);

  function add(event: FormEvent) {
    event.preventDefault();
    const tag = cleanTag(text);
    if (tag && !selectedKeys.has(tag.toLowerCase())) {
      onToggle(tag);
    }
    setText("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((tag) => {
        const on = selectedKeys.has(tag.toLowerCase());
        return (
          <button
            aria-pressed={on}
            className={`rounded-full border px-3 py-1 text-sm ${
              on ? "border-indigo-400 bg-indigo-500/20 text-white" : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
            }`}
            key={tag.toLowerCase()}
            type="button"
            onClick={() => onToggle(tag)}
          >
            {tag}
          </button>
        );
      })}
      {adding ? (
        <form className="flex items-center gap-1" onSubmit={add}>
          <input
            aria-label="New situation"
            autoFocus
            className="w-36 rounded-full border border-neutral-600 bg-transparent px-3 py-1 text-white placeholder:text-neutral-600"
            maxLength={MAX_TAG_LENGTH}
            placeholder="for example in bed"
            value={text}
            onBlur={() => {
              if (!text.trim()) {
                setAdding(false);
              }
            }}
            onChange={(event) => setText(event.target.value)}
          />
          <button className="rounded-full border border-neutral-600 px-3 py-1 text-sm text-neutral-200 hover:border-white" type="submit">
            Add
          </button>
        </form>
      ) : (
        <button
          className="rounded-full border border-dashed border-neutral-700 px-3 py-1 text-sm text-neutral-400 hover:border-neutral-500 hover:text-white"
          type="button"
          onClick={() => setAdding(true)}
        >
          + new
        </button>
      )}
    </div>
  );
}
