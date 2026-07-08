import { useMemo } from "preact/hooks";
import {
  mergeDocumentationData,
  parseDocumentationSchema,
  type DocField,
  type DocumentationSchema
} from "../../shared/documentation";
import type { Item, ItemPatch, UpdateItemResult } from "../../shared/item";
import { DocumentationFieldInput } from "./DocumentationFieldInput";

export function TrackedDataForm({
  item,
  updateItem,
  readOnlySchema = false
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
  readOnlySchema?: boolean;
}) {
  const schema = useMemo(() => parseDocumentationSchema(item.documentationSchema), [item.documentationSchema]);
  const data = useMemo(
    () => mergeDocumentationData(schema, (item.documentationData ?? null) as Record<string, unknown> | null),
    [schema, item.documentationData]
  );

  if (schema.length === 0) {
    return null;
  }

  async function saveData(nextData: Record<string, unknown>) {
    await updateItem(item.id, JSON.stringify({ documentationData: nextData }), item.revision);
  }

  return (
    <div className="mb-6 rounded border border-neutral-800 p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">
        {readOnlySchema ? "Input data" : "Tracked state"}
      </p>
      {readOnlySchema ? (
        <p className="mb-3 text-xs text-neutral-500">Values are shared with linked documentation items.</p>
      ) : null}
      <div className="space-y-3">
        {schema.map((field) => (
          <DocumentationFieldInput
            data={data}
            field={field}
            key={field.key}
            onChange={(next) => void saveData(next)}
          />
        ))}
      </div>
    </div>
  );
}

export type { DocField, DocumentationSchema };
