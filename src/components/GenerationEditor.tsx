import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  defaultGeneratorSpec,
  generatorSpecLabel,
  parseGeneratorSpec,
  resolveGeneratorEntries,
  templateVariablesForSource,
  type GeneratorItemTemplate,
  type GeneratorSource,
  type GeneratorSourceKind,
  type GeneratorSpec
} from "@shared/generation";
import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";

const SOURCE_KINDS: GeneratorSourceKind[] = ["range", "dates", "strings", "items"];

function todayIsoDate(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function sourceKindLabel(kind: GeneratorSourceKind): string {
  switch (kind) {
    case "range":
      return "Range";
    case "dates":
      return "Dates";
    case "strings":
      return "Strings";
    case "items":
      return "Items";
  }
}

function buildSpec(
  item: Item,
  current: GeneratorSpec | null,
  updates: Omit<Partial<GeneratorSpec>, "template"> & { source?: GeneratorSource; template?: Partial<GeneratorItemTemplate> }
): GeneratorSpec {
  const base = current ?? defaultGeneratorSpec(item);
  return {
    ...base,
    ...updates,
    source: updates.source ?? base.source,
    template: {
      ...base.template,
      ...updates.template
    }
  };
}

export function GenerationEditor({
  item,
  items,
  occurrences,
  updateItem
}: {
  item: Item;
  items: Item[];
  occurrences: Item[];
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const spec = useMemo(() => parseGeneratorSpec(item.recurrenceRule, item), [item.recurrenceRule, item]);
  const isTemplate = !item.generatedFromId;
  const [datesText, setDatesText] = useState(() => (spec?.source.kind === "dates" ? spec.source.dates.join("\n") : ""));
  const [stringsText, setStringsText] = useState(() => (spec?.source.kind === "strings" ? spec.source.values.join("\n") : ""));
  const [itemTagsText, setItemTagsText] = useState(() => (spec?.source.kind === "items" ? spec.source.tags.join(", ") : ""));

  const previewEntries = useMemo(
    () => (spec && isTemplate ? resolveGeneratorEntries(spec, item.id, items) : []),
    [spec, isTemplate, item.id, items]
  );

  async function patchItem(patch: ItemPatch) {
    await updateItem(item.id, JSON.stringify(patch), item.revision);
  }

  async function saveSpec(next: GeneratorSpec | null) {
    await patchItem({ recurrenceRule: next });
  }

  async function setSourceKind(kind: GeneratorSourceKind) {
    let source: GeneratorSource;
    switch (kind) {
      case "range":
        source = { kind: "range", count: 5 };
        break;
      case "dates":
        source = { kind: "dates", dates: [todayIsoDate()] };
        setDatesText(todayIsoDate());
        break;
      case "strings":
        source = { kind: "strings", values: ["example"] };
        setStringsText("example");
        break;
      case "items":
        source = { kind: "items", tags: ["example"] };
        setItemTagsText("example");
        break;
    }
    await saveSpec(buildSpec(item, spec, { source }));
  }

  async function saveTemplate(patch: Partial<GeneratorItemTemplate>) {
    if (!spec) {
      await saveSpec(buildSpec(item, null, { template: patch }));
      return;
    }
    await saveSpec(buildSpec(item, spec, { template: patch }));
  }

  async function saveDatesText(value: string) {
    if (!spec || spec.source.kind !== "dates") {
      return;
    }
    const dates = [...new Set(value.split(/\n+/).map((line) => line.trim()).filter((line) => /^\d{4}-\d{2}-\d{2}$/.test(line)))].sort();
    setDatesText(dates.join("\n"));
    await saveSpec(buildSpec(item, spec, { source: { kind: "dates", dates } }));
  }

  async function saveStringsText(value: string) {
    if (!spec || spec.source.kind !== "strings") {
      return;
    }
    const values = [...new Set(value.split(/\n+/).map((line) => line.trim()).filter(Boolean))];
    setStringsText(values.join("\n"));
    await saveSpec(buildSpec(item, spec, { source: { kind: "strings", values } }));
  }

  async function saveItemTagsText(value: string) {
    if (!spec || spec.source.kind !== "items") {
      return;
    }
    const tags = [...new Set(value.split(/[,\n]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
    setItemTagsText(tags.join(", "));
    await saveSpec(buildSpec(item, spec, { source: { kind: "items", tags } }));
  }

  if (!isTemplate) {
    return (
      <div className="mb-6 rounded border border-neutral-800 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Generator</p>
        <p className="text-sm text-neutral-400">Generated item from a generator template.</p>
        {item.overriddenFields.length > 0 ? (
          <p className="mt-2 text-xs text-amber-200/80">
            Local overrides: {item.overriddenFields.join(", ")}. Future rule changes will not overwrite these fields.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-6 rounded border border-neutral-800 p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Generator</p>
      <p className="mb-4 text-sm text-neutral-400">
        Iterate over a list and materialize one item per entry. Use {"{item.title}"}, {"{value}"}, {"{date}"}, or{" "}
        {"{index}"} in templates.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          className={
            !spec
              ? "rounded border border-white bg-white px-3 py-1 text-xs font-medium text-black"
              : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
          }
          type="button"
          onClick={() => void saveSpec(null)}
        >
          None
        </button>
        {SOURCE_KINDS.map((kind) => (
          <button
            className={
              spec?.source.kind === kind
                ? "rounded border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
            }
            key={kind}
            type="button"
            onClick={() => void (spec?.source.kind === kind ? undefined : setSourceKind(kind))}
          >
            {sourceKindLabel(kind)}
          </button>
        ))}
        <button
          className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
          type="button"
          onClick={() => void saveSpec(defaultGeneratorSpec(item))}
        >
          Reset example
        </button>
      </div>

      {spec ? (
        <>
          {spec.source.kind === "range" ? (
            <label className="mb-4 block text-xs text-neutral-400">
              Count — range(n)
              <input
                className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                min={1}
                type="number"
                value={spec.source.count}
                onChange={(event) =>
                  void saveSpec(
                    buildSpec(item, spec, {
                      source: { kind: "range", count: Math.max(1, Number(event.target.value) || 1) }
                    })
                  )
                }
              />
            </label>
          ) : null}

          {spec.source.kind === "dates" ? (
            <label className="mb-4 block text-xs text-neutral-400">
              Dates (YYYY-MM-DD, one per line)
              <textarea
                className="mt-1 min-h-28 w-full border border-neutral-700 bg-black px-3 py-2 font-mono text-sm outline-none focus:border-white"
                value={datesText}
                onBlur={(event) => void saveDatesText(event.target.value)}
                onChange={(event) => setDatesText(event.target.value)}
              />
            </label>
          ) : null}

          {spec.source.kind === "strings" ? (
            <label className="mb-4 block text-xs text-neutral-400">
              Strings (one per line)
              <textarea
                className="mt-1 min-h-28 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                value={stringsText}
                onBlur={(event) => void saveStringsText(event.target.value)}
                onChange={(event) => setStringsText(event.target.value)}
              />
            </label>
          ) : null}

          {spec.source.kind === "items" ? (
            <label className="mb-4 block text-xs text-neutral-400">
              Item tags (comma-separated — item must have all listed tags)
              <input
                className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                placeholder="missing feature"
                value={itemTagsText}
                onBlur={(event) => void saveItemTagsText(event.target.value)}
                onChange={(event) => setItemTagsText(event.target.value)}
              />
              <span className="mt-1 block text-neutral-500">
                {previewEntries.length} matching item(s) right now.
              </span>
            </label>
          ) : null}

          <p className="mb-3 text-xs text-neutral-500">
            Variables: {templateVariablesForSource(spec.source.kind).join(", ")}
          </p>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-neutral-400 sm:col-span-2">
              Title template
              <input
                className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                placeholder="implement {item.title}"
                value={spec.template.title}
                onBlur={(event) => void saveTemplate({ title: event.target.value })}
              />
            </label>

            <label className="text-xs text-neutral-400 sm:col-span-2">
              Notes template
              <textarea
                className="mt-1 min-h-20 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                value={spec.template.body}
                onBlur={(event) => void saveTemplate({ body: event.target.value })}
              />
            </label>

            <label className="text-xs text-neutral-400 sm:col-span-2">
              Tags (comma-separated, supports {"{item.title}"} etc.)
              <input
                className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                value={spec.template.tags.join(", ")}
                onBlur={(event) =>
                  void saveTemplate({
                    tags: event.target.value
                      .split(/[,\n]+/)
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                  })
                }
              />
            </label>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs text-neutral-400">Generated item capabilities</p>
            <div className="flex flex-wrap gap-2">
              <CapabilityChip
                active={spec.template.isTask}
                label="Task"
                onToggle={() => void saveTemplate({ isTask: !spec.template.isTask })}
              />
              <CapabilityChip
                active={spec.template.isDocumentation}
                label="Documentation"
                onToggle={() => void saveTemplate({ isDocumentation: !spec.template.isDocumentation })}
              />
              <CapabilityChip
                active={spec.template.isInterval}
                label="Interval"
                onToggle={() => void saveTemplate({ isInterval: !spec.template.isInterval })}
              />
            </div>
          </div>

          <p className="mb-3 text-xs text-neutral-500">
            {generatorSpecLabel(spec)} · {previewEntries.length} item(s) will be materialized.
          </p>

          {occurrences.length > 0 ? (
            <ul className="space-y-1 text-sm text-neutral-400">
              {occurrences.slice(0, 8).map((occurrence) => (
                <li className="flex items-center justify-between gap-2" key={occurrence.id}>
                  <Link className="truncate hover:text-white" to={`/item/${occurrence.id}`}>
                    {occurrence.title}
                  </Link>
                  <span className="shrink-0 text-xs text-neutral-600">
                    {occurrence.overriddenFields.length > 0 ? "overridden" : occurrence.taskStatus ?? "note"}
                  </span>
                </li>
              ))}
              {occurrences.length > 8 ? <li className="text-neutral-600">+{occurrences.length - 8} more</li> : null}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No generated items yet.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-500">Pick a list type to configure this generator.</p>
      )}
    </div>
  );
}

function CapabilityChip({
  active,
  label,
  onToggle
}: {
  active: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      className={
        active
          ? "rounded border border-white bg-white px-3 py-1 text-xs font-medium text-black"
          : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
      }
      type="button"
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
