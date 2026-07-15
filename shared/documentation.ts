export type DocFieldType = "boolean" | "number" | "text";

export type DocField = {
  key: string;
  label: string;
  type: DocFieldType;
};

export type DocumentationSchema = DocField[];

export function cleanFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function parseDocumentationSchema(value: unknown): DocumentationSchema {
  if (!Array.isArray(value)) {
    return [];
  }

  const fields: DocField[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const key = cleanFieldKey(String(raw.key ?? raw.label ?? ""));
    if (!key || seen.has(key)) {
      continue;
    }
    const type = raw.type === "boolean" || raw.type === "number" || raw.type === "text" ? raw.type : "text";
    const label = String(raw.label ?? key).trim().slice(0, 80) || key;
    seen.add(key);
    fields.push({ key, label, type });
  }

  return fields;
}

export function defaultDocumentationData(schema: DocumentationSchema): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of schema) {
    if (field.type === "boolean") {
      data[field.key] = false;
    } else if (field.type === "number") {
      data[field.key] = null;
    } else {
      data[field.key] = "";
    }
  }
  return data;
}

export function mergeDocumentationData(
  schema: DocumentationSchema,
  existing: Record<string, unknown> | null
): Record<string, unknown> {
  const base = defaultDocumentationData(schema);
  if (!existing) {
    return base;
  }
  for (const field of schema) {
    const value = existing[field.key];
    if (field.type === "boolean" && typeof value === "boolean") {
      base[field.key] = value;
    } else if (field.type === "number" && typeof value === "number" && Number.isFinite(value)) {
      base[field.key] = value;
    } else if (field.type === "text" && typeof value === "string") {
      base[field.key] = value;
    }
  }
  return base;
}

export function isDocumentationFieldComplete(field: DocField, data: Record<string, unknown>): boolean {
  const value = data[field.key];
  if (field.type === "boolean") {
    return value === true;
  }
  if (field.type === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  return typeof value === "string" && value.trim().length > 0;
}

export function schemaFieldLabels(schema: DocumentationSchema): Map<string, string> {
  return new Map(schema.map((field) => [field.key, field.label]));
}
