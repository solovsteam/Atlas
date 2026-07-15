import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { cleanFieldKey } from "@shared/documentation";
import {
  defaultChildSpec,
  formatOccurrenceKey,
  FREQUENCIES,
  generationSpecLabel,
  needsCalendarSchedule,
  parseGenerationSpec,
  type GenerationSpec,
  type OccurrenceMode
} from "@shared/generation";
import type { RecurrenceFrequency } from "@shared/recurrence";
import type { Item, ItemPatch, UpdateItemResult } from "@shared/item";

function defaultRange(item: Item) {
  const anchor = item.createdAt ? new Date(item.createdAt) : new Date();
  return {
    startDate: formatOccurrenceKey(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())),
    count: 10,
    stepDays: 1
  };
}

function buildSpec(
  item: Item,
  current: GenerationSpec | null,
  updates: Omit<Partial<GenerationSpec>, "child"> & { child?: Partial<GenerationSpec["child"]> }
): GenerationSpec {
  const base = current ?? {
    kind: "schedule_tasks" as const,
    occurrenceMode: "recurrence" as const,
    frequency: "daily" as const,
    interval: 1,
    horizonDays: 90,
    range: defaultRange(item),
    dates: [formatOccurrenceKey(new Date())],
    exclusions: [],
    child: defaultChildSpec(item)
  };

  return {
    ...base,
    ...updates,
    kind: "schedule_tasks",
    child: {
      ...base.child,
      ...updates.child
    }
  };
}

export function GenerationEditor({
  item,
  occurrences,
  updateItem
}: {
  item: Item;
  occurrences: Item[];
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const spec = useMemo(() => parseGenerationSpec(item.recurrenceRule, item), [item.recurrenceRule, item]);
  const isTemplate = !item.generatedFromId;
  const numberField = spec?.child.inputSchema.find((field) => field.type === "number") ?? null;
  const [datesText, setDatesText] = useState(() => (spec?.dates ?? []).join("\n"));

  async function patchItem(patch: ItemPatch) {
    await updateItem(item.id, JSON.stringify(patch), item.revision);
  }

  async function saveSpec(next: GenerationSpec | null) {
    await patchItem({ recurrenceRule: next });
  }

  async function saveChildTitle(value: string) {
    if (!spec) return;
    await saveSpec(buildSpec(item, spec, { child: { title: value } }));
  }

  async function saveScheduleTime(value: string) {
    if (!spec) return;
    await saveSpec(
      buildSpec(item, spec, {
        child: { schedule: { ...spec.child.schedule, time: value } }
      })
    );
  }

  async function saveNumberField(label: string) {
    if (!spec) return;
    if (!label.trim()) {
      await saveSpec(
        buildSpec(item, spec, {
          child: { inputSchema: [], completionRule: spec.child.isTask ? { kind: "manual" } : null }
        })
      );
      return;
    }
    const key = cleanFieldKey(label);
    await saveSpec(
      buildSpec(item, spec, {
        child: {
          inputSchema: [{ key, label, type: "number" }],
          completionRule: spec.child.isTask ? { kind: "documentation", schemaField: key } : null
        }
      })
    );
  }

  async function toggleChildCapability(capability: "isTask" | "isDocumentation" | "isInterval") {
    if (!spec) return;
    const next = !spec.child[capability];
    const child: Partial<GenerationSpec["child"]> = { [capability]: next };
    if (capability === "isTask" && !next) {
      child.completionRule = null;
    }
    if (capability === "isTask" && next && !spec.child.completionRule) {
      child.completionRule = { kind: "manual" };
    }
    await saveSpec(buildSpec(item, spec, { child }));
  }

  async function setOccurrenceMode(mode: OccurrenceMode) {
    if (!spec) {
      await saveSpec(
        buildSpec(item, null, {
          occurrenceMode: mode,
          dates: mode === "dates" ? [formatOccurrenceKey(new Date())] : undefined
        })
      );
      return;
    }
    const updates: Partial<GenerationSpec> = { occurrenceMode: mode };
    if (mode === "dates" && spec.dates.length === 0) {
      updates.dates = [formatOccurrenceKey(new Date())];
      setDatesText(updates.dates.join("\n"));
    }
    await saveSpec(buildSpec(item, spec, updates));
  }

  async function saveDatesText(value: string) {
    if (!spec) return;
    const dates = [...new Set(value.split(/\n+/).map((line) => line.trim()).filter(Boolean))].sort();
    setDatesText(dates.join("\n"));
    await saveSpec(buildSpec(item, spec, { dates }));
  }

  if (!isTemplate) {
    return (
      <div className="mb-6 rounded border border-neutral-800 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Generator</p>
        <p className="text-sm text-neutral-400">
          Generated occurrence{item.occurrenceKey ? ` · ${item.occurrenceKey}` : ""}.
        </p>
        {item.overriddenFields.length > 0 ? (
          <p className="mt-2 text-xs text-amber-200/80">
            Local overrides: {item.overriddenFields.join(", ")}. Future rule changes will not overwrite these fields.
          </p>
        ) : (
          <p className="mt-2 text-xs text-neutral-500">Still follows the generator rule for all fields.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6 rounded border border-neutral-800 p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">Generator</p>
      <p className="mb-4 text-sm text-neutral-400">
        Materializes items from this template. Choose how occurrences are produced, then set each generated item&apos;s
        capabilities.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
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
        {(["recurrence", "range", "dates"] as OccurrenceMode[]).map((mode) => (
          <button
            className={
              spec?.occurrenceMode === mode
                ? "rounded border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
            }
            key={mode}
            type="button"
            onClick={() =>
              void (spec
                ? setOccurrenceMode(mode)
                : saveSpec(
                    buildSpec(item, null, {
                      occurrenceMode: mode,
                      dates: mode === "dates" ? [formatOccurrenceKey(new Date())] : undefined
                    })
                  ))
            }
          >
            {mode === "recurrence" ? "Recurrence" : mode === "range" ? "Range" : "Dates"}
          </button>
        ))}
      </div>

      {spec ? (
        <>
          {spec.occurrenceMode === "recurrence" ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {FREQUENCIES.map((frequency) => (
                <button
                  className={
                    spec.frequency === frequency
                      ? "rounded border border-neutral-500 px-3 py-1 text-xs text-white"
                      : "rounded border border-neutral-800 px-3 py-1 text-xs text-neutral-500 hover:border-neutral-600"
                  }
                  key={frequency}
                  type="button"
                  onClick={() => void saveSpec(buildSpec(item, spec, { frequency: frequency as RecurrenceFrequency }))}
                >
                  {frequency}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            {spec.occurrenceMode === "recurrence" ? (
              <>
                <label className="text-xs text-neutral-400">
                  Every
                  <input
                    className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                    min={1}
                    type="number"
                    value={spec.interval}
                    onChange={(event) =>
                      void saveSpec(
                        buildSpec(item, spec, {
                          interval: Math.max(1, Number(event.target.value) || 1)
                        })
                      )
                    }
                  />
                </label>
                <label className="text-xs text-neutral-400">
                  Horizon (days)
                  <input
                    className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                    min={1}
                    type="number"
                    value={spec.horizonDays}
                    onChange={(event) =>
                      void saveSpec(
                        buildSpec(item, spec, {
                          horizonDays: Math.max(1, Number(event.target.value) || 90)
                        })
                      )
                    }
                  />
                </label>
              </>
            ) : null}

            {spec.occurrenceMode === "range" ? (
              <>
                <label className="text-xs text-neutral-400 sm:col-span-2">
                  Start date (YYYY-MM-DD)
                  <input
                    className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                    value={spec.range.startDate}
                    onBlur={(event) =>
                      void saveSpec(
                        buildSpec(item, spec, {
                          range: { ...spec.range, startDate: event.target.value.trim() }
                        })
                      )
                    }
                  />
                </label>
                <label className="text-xs text-neutral-400">
                  Count
                  <input
                    className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                    min={1}
                    type="number"
                    value={spec.range.count}
                    onChange={(event) =>
                      void saveSpec(
                        buildSpec(item, spec, {
                          range: {
                            ...spec.range,
                            count: Math.max(1, Number(event.target.value) || 1)
                          }
                        })
                      )
                    }
                  />
                </label>
                <label className="text-xs text-neutral-400">
                  Step (days)
                  <input
                    className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                    min={1}
                    type="number"
                    value={spec.range.stepDays}
                    onChange={(event) =>
                      void saveSpec(
                        buildSpec(item, spec, {
                          range: {
                            ...spec.range,
                            stepDays: Math.max(1, Number(event.target.value) || 1)
                          }
                        })
                      )
                    }
                  />
                </label>
              </>
            ) : null}

            {spec.occurrenceMode === "dates" ? (
              <label className="text-xs text-neutral-400 sm:col-span-2">
                Explicit dates (one YYYY-MM-DD per line)
                <textarea
                  className="mt-1 min-h-28 w-full border border-neutral-700 bg-black px-3 py-2 font-mono text-sm outline-none focus:border-white"
                  value={datesText}
                  onBlur={(event) => void saveDatesText(event.target.value)}
                  onChange={(event) => setDatesText(event.target.value)}
                />
              </label>
            ) : null}

            <label className="text-xs text-neutral-400 sm:col-span-2">
              Item title template
              <input
                className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                placeholder="Weigh in · {date}"
                value={spec.child.title}
                onBlur={(event) => void saveChildTitle(event.target.value)}
              />
            </label>

            <div className="sm:col-span-2">
              <p className="mb-2 text-xs text-neutral-400">Generated item capabilities</p>
              <div className="flex flex-wrap gap-2">
                <CapabilityChip active={spec.child.isTask} label="Task" onToggle={() => void toggleChildCapability("isTask")} />
                <CapabilityChip
                  active={spec.child.isDocumentation}
                  label="Documentation"
                  onToggle={() => void toggleChildCapability("isDocumentation")}
                />
                <CapabilityChip
                  active={spec.child.isInterval}
                  label="Interval"
                  onToggle={() => void toggleChildCapability("isInterval")}
                />
              </div>
              {!spec.child.isTask && !spec.child.isDocumentation && !spec.child.isInterval ? (
                <p className="mt-2 text-xs text-amber-200/80">Pick at least one capability for generated items.</p>
              ) : null}
            </div>

            {needsCalendarSchedule(spec.child) ? (
              <>
                <label className="text-xs text-neutral-400">
                  Schedule time
                  <input
                    className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                    pattern="[0-9]{2}:[0-9]{2}"
                    placeholder="10:00"
                    value={spec.child.schedule.time}
                    onBlur={(event) => void saveScheduleTime(event.target.value)}
                  />
                </label>
                <label className="text-xs text-neutral-400">
                  Duration (minutes)
                  <input
                    className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                    min={1}
                    type="number"
                    value={spec.child.schedule.durationMinutes}
                    onChange={(event) =>
                      void saveSpec(
                        buildSpec(item, spec, {
                          child: {
                            schedule: {
                              ...spec.child.schedule,
                              durationMinutes: Math.max(1, Number(event.target.value) || 30)
                            }
                          }
                        })
                      )
                    }
                  />
                </label>
              </>
            ) : null}

            <label className="text-xs text-neutral-400 sm:col-span-2">
              Input data field (optional, for tasks reporting values)
              <input
                className="mt-1 w-full border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
                placeholder="e.g. weight (kg)"
                value={numberField?.label ?? ""}
                onBlur={(event) => void saveNumberField(event.target.value)}
              />
            </label>
          </div>

          <p className="mb-3 text-xs text-neutral-500">
            {generationSpecLabel(spec)} · updates future occurrences automatically.
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
            <p className="text-sm text-neutral-500">No occurrences materialized yet.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-500">No generator rule on this item yet.</p>
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
