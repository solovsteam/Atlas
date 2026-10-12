import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Item } from "@shared/item";
import {
  addDays,
  civilDate,
  datesBetween,
  defaultGeneratorRule,
  GENERATED_FIELDS,
  generatorRule,
  occurrenceRule,
  type FieldPolicy,
  type GeneratorRule,
} from "@shared/recurringReferences";
import { useAtlasData } from "../context/AtlasDataContext";
import {
  trackDeleteUndo,
  trackItemPatchUndo,
  useUndo,
} from "../context/UndoContext";
import {
  compileRequestId,
  compileRule,
  readCompileJob,
  type CompileJob,
} from "../services/recurrenceCompiler";
import { includedDates } from "../services/recurrence";

const labels: Record<string, string> = {
  title: "Title",
  body: "Notes",
  isTask: "Task capability",
  isDocumentation: "Documentation capability",
  isInterval: "Interval capability",
  taskStatus: "Task status",
  expectedDurationMinutes: "Duration",
  taskDueAt: "Due time",
  taskFixedStartsAt: "Appointment start",
  taskFixedEndsAt: "Appointment end",
  parentTaskId: "Parent task",
  manualRelevance: "Relevance",
  tags: "Tags",
  completionRule: "Completion rule",
  documentationSchema: "Documentation fields",
  documentationData: "Documentation answers",
  intervalKind: "Interval kind",
  intervalStartsAt: "Interval start",
  intervalEndsAt: "Interval end",
  intervalStatus: "Interval status",
};
export function RecurrenceEditor({ item }: { item: Item }) {
  const { items, updateItem, reviewOccurrence } = useAtlasData();
  const { push } = useUndo();
  const rule = generatorRule(item),
    occurrence = occurrenceRule(item);
  const [text, setText] = useState(rule?.text ?? "");
  const [zone, setZone] = useState(
    rule?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [from, setFrom] = useState(rule?.from ?? civilDate(new Date(), zone));
  const [until, setUntil] = useState(rule?.until ?? "");
  const [job, setJob] = useState<CompileJob | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setText(rule?.text ?? "");
    setZone((previous) => rule?.timeZone ?? previous);
    setFrom((previous) => rule?.from ?? previous);
    setUntil(rule?.until ?? "");
  }, [item.id, rule?.text, rule?.timeZone, rule?.from, rule?.until]);
  useEffect(() => {
    if (!rule?.source || rule.compiledText !== rule.text) return;
    let active = true;
    const start = [rule.from, civilDate(new Date(), rule.timeZone)]
      .sort()
      .at(-1)!;
    void includedDates(item, datesBetween(start, addDays(start, 1825)))
      .then((dates) => {
        if (active) {
          setPreview([...dates].slice(0, 10));
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [item, rule]);

  async function save(next: GeneratorRule) {
    const result = await updateItem(
      item.id,
      JSON.stringify({ recurrenceState: next }),
      item.revision,
    );
    if ("conflict" in result)
      throw new Error("The generator changed elsewhere; reload before saving");
    trackItemPatchUndo(push, item.id, {
      recurrenceState: item.recurrenceState,
    });
  }
  const compilationRef = useRef<{
    item: Item;
    rule: GeneratorRule;
    text: string;
    zone: string;
    from: string;
    until: string;
  } | null>(null);
  const jobId = job?.id,
    jobStatus = job?.status;
  useEffect(() => {
    const pending = compilationRef.current;
    if (
      !jobId ||
      !pending ||
      ["succeeded", "failed", "needs_input"].includes(jobStatus ?? "")
    )
      return;
    const { item, rule, text, zone, from, until } = pending;
    let active = true;
    const timer = window.setInterval(() => {
      void readCompileJob(jobId)
        .then(async (next) => {
          if (!active) return;
          if (next.status === "succeeded" && next.source && rule) {
            window.clearInterval(timer);
            const candidate = {
              ...rule,
              text,
              compiledText: text,
              source: next.source,
              timeZone: zone,
              from,
              until,
              status: "active" as const,
              compilerRef: next.compilerRef,
            };
            const start = [from, civilDate(new Date(), zone)].sort().at(-1)!;
            const dates = await includedDates(
              { ...item, recurrenceState: candidate },
              datesBetween(start, addDays(start, 1825)),
            );
            if (!active) return;
            setPreview([...dates].slice(0, 10));
            const result = await updateItem(
              item.id,
              JSON.stringify({ recurrenceState: candidate }),
              item.revision,
            );
            if ("conflict" in result)
              throw new Error(
                "The generator changed elsewhere; reload before applying the compiled rule",
              );
            trackItemPatchUndo(push, item.id, {
              recurrenceState: item.recurrenceState,
            });
            if (active) {
              setJob(next);
              setBusy(false);
            }
          } else if (["failed", "needs_input"].includes(next.status)) {
            setJob(next);
            setError(next.error ?? "The rule could not be compiled");
            setBusy(false);
          } else setJob(next);
        })
        .catch((e) => {
          if (active) {
            setJob((previous) =>
              previous ? { ...previous, status: "failed" } : null,
            );
            setError(e.message);
            setBusy(false);
          }
        });
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [jobId, jobStatus, updateItem, push]);

  async function compile() {
    setBusy(true);
    setError("");
    try {
      if (!rule) throw new Error("Create a generator first");
      compilationRef.current = { item, rule, text, zone, from, until };
      if (
        rule?.source &&
        rule.compiledText === text
      ) {
        // Timezone selects civil inputs and clocks outside the pure predicate;
        // only changed repetition text warrants another subscription call.
        await save({ ...rule, timeZone:zone, from, until, status: "active" });
        setBusy(false);
        return;
      }
      const next = await compileRule(
        await compileRequestId(item.id, text, zone),
        text,
        zone,
      );
      // A cached result follows the same polling path after a tab reload.
      setJob({
        ...next,
        status: next.status === "succeeded" ? "queued" : next.status,
      });
      if (next.status === "uncertain") {
        setError(
          "Compilation dispatch is uncertain. Brain retains its receipt; do not start a duplicate job.",
        );
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not compile");
      setBusy(false);
    }
  }
  async function review(choice: "new" | "old" | "detach") {
    setBusy(true);
    setError("");
    try {
      await reviewOccurrence(item.id, choice);
      trackDeleteUndo(push, item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review");
    } finally {
      setBusy(false);
    }
  }
  const panel = "mb-6 rounded border border-neutral-700 p-4";
  const button =
    "rounded border border-neutral-600 px-3 py-1.5 text-sm hover:border-white disabled:opacity-40";
  if (occurrence)
    return (
      <section className={panel}>
        <p className="text-sm">
          Occurrence on {item.occurrenceKey} ·{" "}
          <Link className="underline" to={`/item/${item.generatedFromId}`}>
            Open generator
          </Link>
        </p>
        {occurrence.frozen ? (
          <p className="mt-2 text-sm text-neutral-400">
            Completed — this version stays unchanged.
          </p>
        ) : null}
        {occurrence.held ? (
          <p className="mt-2 text-sm text-neutral-400">
            Keeping the earlier generator version.
          </p>
        ) : null}
        {item.recurrenceView?.needsReview ? (
          <div className="mt-3 text-amber-200" role="status">
            <p>
              The generator changed. This occurrence still uses its earlier
              version.
            </p>
            <ul className="my-2 text-sm">
              {item.recurrenceView.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                className={button}
                onClick={() => void review("new")}
              >
                Take new version
              </button>
              <button
                disabled={busy}
                className={button}
                onClick={() => void review("old")}
              >
                Keep old version
              </button>
              <button
                disabled={busy}
                className={button}
                onClick={() => void review("detach")}
              >
                Detach as standalone
              </button>
            </div>
          </div>
        ) : !occurrence.frozen ? (
          <label className="mt-3 block text-sm">
            <input
              type="checkbox"
              checked={occurrence.started}
              onChange={(e) => {
                void updateItem(
                  item.id,
                  JSON.stringify({
                    occurrenceStarted: e.target.checked,
                  }),
                  item.revision,
                )
                  .then(() =>
                    trackItemPatchUndo(push, item.id, {
                      recurrenceState: item.recurrenceState,
                    }),
                  )
                  .catch((e) => setError(e.message));
              }}
            />{" "}
            Started working on this occurrence
          </label>
        ) : null}
        {error ? (
          <p className="mt-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  if (!rule)
    return (
      <section className={panel}>
        <button
          className={button}
          onClick={() =>
            void save(defaultGeneratorRule(zone, from)).catch((e) =>
              setError(e.message),
            )
          }
        >
          Make this a recurring generator
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </section>
    );
  const reviews = items.filter(
    (i) => i.generatedFromId === item.id && i.recurrenceView?.needsReview,
  );
  // Restore the archived source itself: replacing it would split the identities
  // that completed and individually changed occurrences still reference.
  return (
    <section className={panel}>
      <h2 className="mb-3 font-medium">Recurring generator</h2>
      {rule.status === "deleted" ? (
        <p className="mb-3 text-sm text-amber-200">
          Archived generator. Completed and changed occurrences still reference
          it.
        </p>
      ) : null}
      <p className="mb-3 text-sm text-neutral-400">
        Open occurrences stay live from the start date through the next 90 days.
        Completed and changed occurrences are preserved.
      </p>
      <label className="mb-3 block text-sm">
        Repetition rule
        <textarea
          disabled={busy}
          className="mt-1 block w-full rounded border border-neutral-700 bg-black p-2"
          placeholder="First Monday each month, except when it is the 3rd"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        <label>
          From{" "}
          <input
            disabled={busy}
            type="date"
            className="bg-black"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Until (optional){" "}
          <input
            disabled={busy}
            type="date"
            className="bg-black"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        <label>
          Time zone{" "}
          <input
            disabled={busy}
            className="border border-neutral-700 bg-black p-1"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          className={button}
          disabled={busy || !text.trim()}
          onClick={() => void compile()}
        >
          {busy ? "Compiling…" : "Compile and apply rule"}
        </button>
        <button
          disabled={busy || !rule.source}
          className={button}
          onClick={() =>
            void save({
              ...rule,
              status: rule.status === "active" ? "paused" : "active",
            }).catch((e) => setError(e.message))
          }
        >
          {rule.status === "active"
            ? "Pause"
            : rule.status === "deleted"
              ? "Restore generator"
              : "Resume"}
        </button>
      </div>
      {job && busy ? (
        <p className="mt-2 text-sm text-neutral-400" role="status">
          Brain: {job.status}. Compilation uses your subscription once; the
          saved rule runs offline.
        </p>
      ) : null}
      {preview.length ? (
        <p className="mt-3 text-sm">Next dates: {preview.join(", ")}</p>
      ) : rule.source ? (
        <p className="mt-3 text-sm">
          No matching dates in the next five years.
        </p>
      ) : null}
      {reviews.length ? (
        <div className="mt-3 text-sm text-amber-200">
          <p>
            {reviews.length}{" "}
            {reviews.length === 1 ? "occurrence needs" : "occurrences need"}{" "}
            review:
          </p>
          {reviews.map((i) => (
            <Link className="mr-3 underline" key={i.id} to={`/item/${i.id}`}>
              {i.occurrenceKey}
            </Link>
          ))}
        </div>
      ) : null}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm">Field ownership</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {GENERATED_FIELDS.map((field) => (
            <label
              key={field}
              className="flex items-center justify-between gap-2 text-sm"
            >
              {labels[field]}
              <select
                className="border border-neutral-700 bg-black p-1"
                value={rule.policies[field] ?? "default"}
                onChange={(e) =>
                  void save({
                    ...rule,
                    policies: {
                      ...rule.policies,
                      [field]: e.target.value as FieldPolicy,
                    },
                  }).catch((e) => setError(e.message))
                }
              >
                <option value="strict">Generator defines</option>
                <option value="default">Default, can override</option>
                <option value="owned">Occurrence owns</option>
              </select>
            </label>
          ))}
        </div>
      </details>
      {error || item.recurrenceError ? (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error || item.recurrenceError}
        </p>
      ) : null}
    </section>
  );
}
