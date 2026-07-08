import { useMemo, useState } from "preact/hooks";
import {
  cleanFieldKey,
  mergeDocumentationData,
  parseDocumentationSchema,
  type DocField,
  type DocFieldType,
  type DocumentationSchema
} from "../../shared/documentation";
import type { Item, ItemPatch, UpdateItemResult } from "../../shared/item";
import { DocumentationFieldInput } from "./DocumentationFieldInput";

export function DocumentationEditor({
  item,
  updateItem
}: {
  item: Item;
  updateItem: (id: string, patchJson: string, expectedRevision: number) => Promise<UpdateItemResult>;
}) {
  const schema = useMemo(() => parseDocumentationSchema(item.documentationSchema), [item.documentationSchema]);
  const data = useMemo(
    () => mergeDocumentationData(schema, (item.documentationData ?? null) as Record<string, unknown> | null),
    [schema, item.documentationData]
  );
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<DocFieldType>("boolean");

  async function patchItem(patch: ItemPatch) {
    await updateItem(item.id, JSON.stringify(patch), item.revision);
  }

  async function saveSchema(nextSchema: DocumentationSchema) {
    const nextData = mergeDocumentationData(nextSchema, data);
    await patchItem({ documentationSchema: nextSchema, documentationData: nextData });
  }

  async function saveData(nextData: Record<string, unknown>) {
    await patchItem({ documentationData: nextData });
  }

  async function addField() {
    const label = newLabel.trim();
    if (!label) {
      return;
    }
    const key = cleanFieldKey(label);
    if (!key || schema.some((field) => field.key === key)) {
      return;
    }
    const field: DocField = { key, label, type: newType };
    await saveSchema([...schema, field]);
    setNewLabel("");
  }

  async function removeField(key: string) {
    await saveSchema(schema.filter((field) => field.key !== key));
  }

  if (!item.isDocumentation) {
    return null;
  }

  return (
    <div className="mb-6 rounded border border-violet-900/40 bg-violet-950/20 p-4">
      <p className="mb-3 text-xs uppercase tracking-wide text-violet-300">Documentation</p>

      <div className="mb-4">
        <p className="mb-2 text-xs text-neutral-400">Schema fields</p>
        {schema.length === 0 ? (
          <p className="text-sm text-neutral-500">No fields yet.</p>
        ) : (
          <ul className="mb-3 space-y-2">
            {schema.map((field) => (
              <li className="flex items-center justify-between gap-2 rounded border border-neutral-800 px-3 py-2 text-sm" key={field.key}>
                <span>
                  {field.label} <span className="text-neutral-500">({field.type})</span>
                </span>
                <button className="text-xs text-neutral-400 hover:text-white" type="button" onClick={() => void removeField(field.key)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-0 flex-1 border border-neutral-700 bg-black px-3 py-2 text-sm outline-none focus:border-white"
            placeholder="Field label"
            value={newLabel}
            onInput={(event) => setNewLabel((event.currentTarget as HTMLInputElement).value)}
          />
          <select
            className="border border-neutral-700 bg-black px-2 py-2 text-sm outline-none focus:border-white"
            value={newType}
            onChange={(event) => setNewType((event.currentTarget as HTMLSelectElement).value as DocFieldType)}
          >
            <option value="boolean">Boolean</option>
            <option value="number">Number</option>
            <option value="text">Text</option>
          </select>
          <button className="border border-neutral-600 px-3 py-2 text-xs hover:border-white" type="button" onClick={() => void addField()}>
            Add field
          </button>
        </div>
      </div>

      {schema.length > 0 ? (
        <div>
          <p className="mb-2 text-xs text-neutral-400">Tracked state</p>
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
      ) : (
        <p className="text-sm text-neutral-500">Add schema fields to track structured state on this item.</p>
      )}
    </div>
  );
}

export function emptyDocumentationData(schema: DocumentationSchema) {
  return mergeDocumentationData(schema, null);
}
