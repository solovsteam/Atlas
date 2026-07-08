import { completionRuleLabel } from "../../shared/completion";
import { parseDocumentationSchema } from "../../shared/documentation";
import type { CompletionRule, Item, ItemPatch, UpdateItemResult } from "../../shared/item";

const RULE_KINDS: CompletionRule["kind"][] = ["manual", "allChildrenDone", "documentation"];

export function CompletionRuleEditor({
  item,
  updateItem
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  if (!item.isTask) {
    return null;
  }

  const rule = item.completionRule ?? { kind: "manual" as const };
  const schema = parseDocumentationSchema(item.documentationSchema);

  async function patchItem(patch: ItemPatch) {
    await updateItem(item.id, JSON.stringify(patch), item.revision);
  }

  async function setKind(kind: CompletionRule["kind"]) {
    if (kind === "manual") {
      await patchItem({ completionRule: { kind: "manual" } });
      return;
    }
    if (kind === "allChildrenDone") {
      await patchItem({ completionRule: { kind: "allChildrenDone" } });
      return;
    }
    const firstField = schema[0]?.key ?? "";
    await patchItem({ completionRule: { kind: "documentation", schemaField: firstField } });
  }

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs text-neutral-500">Completion rule</p>
      <div className="mb-2 flex flex-wrap gap-2">
        {RULE_KINDS.map((kind) => (
          <button
            className={
              rule.kind === kind
                ? "rounded border border-white px-3 py-1 text-xs font-medium"
                : "rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500"
            }
            key={kind}
            type="button"
            onClick={() => void setKind(kind)}
          >
            {kind === "manual" ? "Manual" : kind === "allChildrenDone" ? "All children done" : "Documentation field"}
          </button>
        ))}
      </div>

      {rule.kind === "documentation" ? (
        schema.length === 0 ? (
          <p className="text-xs text-amber-400">Enable Documentation and add schema fields to use this rule.</p>
        ) : (
          <label className="block text-xs text-neutral-400">
            Complete when field is satisfied
            <select
              className="mt-1 w-full border border-neutral-700 bg-black px-2 py-2 text-sm outline-none focus:border-white"
              value={rule.schemaField}
              onChange={(event) =>
                void patchItem({
                  completionRule: { kind: "documentation", schemaField: (event.currentTarget as HTMLSelectElement).value }
                })
              }
            >
              {schema.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
        )
      ) : (
        <p className="text-xs text-neutral-500">Active: {completionRuleLabel(rule)}</p>
      )}
    </div>
  );
}
