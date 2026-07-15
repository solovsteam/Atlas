import type { Item } from "./item";

export const GENERATOR_SPEC_VERSION = 2;

export type GeneratorSourceKind = "range" | "dates" | "strings" | "items";

export type GeneratorSource =
  | { kind: "range"; count: number }
  | { kind: "dates"; dates: string[] }
  | { kind: "strings"; values: string[] }
  | { kind: "items"; tags: string[] };

export type GeneratorItemTemplate = {
  title: string;
  body: string;
  isTask: boolean;
  isDocumentation: boolean;
  isInterval: boolean;
  tags: string[];
};

export type GeneratorSpec = {
  version: typeof GENERATOR_SPEC_VERSION;
  source: GeneratorSource;
  template: GeneratorItemTemplate;
};

export type GeneratorContext = {
  index: number;
  value: string;
  date: string;
  item: Item | null;
};

export type GeneratorEntry = {
  key: string;
  context: GeneratorContext;
};

export type MaterializedGeneratorItem = {
  title: string;
  body: string;
  isTask: boolean;
  isDocumentation: boolean;
  isInterval: boolean;
  tags: string[];
  taskStatus: string | null;
};

export const OVERRIDE_FIELDS = {
  title: "title",
  body: "body",
  isTask: "isTask",
  isDocumentation: "isDocumentation",
  isInterval: "isInterval",
  tags: "tags",
  taskStatus: "taskStatus"
} as const;

export function defaultGeneratorSpec(template?: Item): GeneratorSpec {
  return {
    version: GENERATOR_SPEC_VERSION,
    source: { kind: "range", count: 5 },
    template: {
      title: template?.title ? `${template.title} {index}` : "Item {index}",
      body: "",
      isTask: true,
      isDocumentation: false,
      isInterval: false,
      tags: []
    }
  };
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))];
}

function parseTags(value: unknown): string[] {
  return parseStringList(value).map((tag) => tag.toLowerCase());
}

function parseSource(value: unknown): GeneratorSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;

  if (kind === "range") {
    const count = Number(raw.count ?? 1);
    if (!Number.isFinite(count) || count < 1 || count > 999) {
      return null;
    }
    return { kind: "range", count: Math.floor(count) };
  }

  if (kind === "dates") {
    const dates = parseStringList(raw.dates).filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry));
    if (dates.length === 0) {
      return null;
    }
    return { kind: "dates", dates };
  }

  if (kind === "strings") {
    const values = parseStringList(raw.values);
    if (values.length === 0) {
      return null;
    }
    return { kind: "strings", values };
  }

  if (kind === "items") {
    const tags = parseTags(raw.tags);
    if (tags.length === 0) {
      return null;
    }
    return { kind: "items", tags };
  }

  return null;
}

function parseTemplate(value: unknown, fallbackTitle: string): GeneratorItemTemplate | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const title = String(raw.title ?? fallbackTitle).trim().slice(0, 200);
  if (!title) {
    return null;
  }

  return {
    title,
    body: String(raw.body ?? "").slice(0, 50000),
    isTask: raw.isTask === undefined ? true : Boolean(raw.isTask),
    isDocumentation: Boolean(raw.isDocumentation),
    isInterval: Boolean(raw.isInterval),
    tags: parseTags(raw.tags)
  };
}

export function parseGeneratorSpec(value: unknown, template?: Item): GeneratorSpec | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== GENERATOR_SPEC_VERSION) {
    return null;
  }

  const source = parseSource(raw.source);
  const fallbackTitle = template?.title ? `implement {item.title}` : "Item {index}";
  const itemTemplate = parseTemplate(raw.template, fallbackTitle);
  if (!source || !itemTemplate) {
    return null;
  }

  return {
    version: GENERATOR_SPEC_VERSION,
    source,
    template: itemTemplate
  };
}

export function generatorSpecLabel(spec: GeneratorSpec | null): string {
  if (!spec) {
    return "Not configured";
  }

  switch (spec.source.kind) {
    case "range":
      return `range(${spec.source.count})`;
    case "dates":
      return `${spec.source.dates.length} date(s)`;
    case "strings":
      return `${spec.source.values.length} string(s)`;
    case "items":
      return `items tagged ${spec.source.tags.join(", ")}`;
  }
}

function itemMatchesTags(item: Item, tags: string[]): boolean {
  return tags.every((tag) => item.tags.includes(tag));
}

export function resolveGeneratorEntries(
  spec: GeneratorSpec,
  templateId: string,
  items: Item[]
): GeneratorEntry[] {
  const entries: GeneratorEntry[] = [];

  if (spec.source.kind === "range") {
    for (let index = 0; index < spec.source.count; index += 1) {
      entries.push({
        key: `i:${index}`,
        context: { index, value: String(index), date: "", item: null }
      });
    }
    return entries;
  }

  if (spec.source.kind === "dates") {
    spec.source.dates.forEach((date, index) => {
      entries.push({
        key: `d:${date}`,
        context: { index, value: date, date, item: null }
      });
    });
    return entries;
  }

  if (spec.source.kind === "strings") {
    spec.source.values.forEach((value, index) => {
      entries.push({
        key: `s:${index}:${value}`,
        context: { index, value, date: "", item: null }
      });
    });
    return entries;
  }

  if (spec.source.kind === "items") {
    const source = spec.source;
    const candidates = items.filter(
      (item) =>
        item.id !== templateId &&
        item.generatedFromId !== templateId &&
        itemMatchesTags(item, source.tags)
    );

    candidates.forEach((item, index) => {
      entries.push({
        key: `item:${item.id}`,
        context: { index, value: item.title, date: "", item }
      });
    });
  }

  return entries;
}

function resolveTemplatePath(context: GeneratorContext, path: string): string {
  if (path === "index") {
    return String(context.index);
  }
  if (path === "value") {
    return context.value;
  }
  if (path === "date") {
    return context.date;
  }
  if (path.startsWith("item.")) {
    const field = path.slice("item.".length);
    const source = context.item;
    if (!source) {
      return "";
    }
    if (field === "title") {
      return source.title;
    }
    if (field === "body") {
      return source.body;
    }
    if (field === "id") {
      return source.id;
    }
    if (field === "tags") {
      return source.tags.join(", ");
    }
  }
  return "";
}

export function renderGeneratorTemplate(template: string, context: GeneratorContext): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_match, path: string) => resolveTemplatePath(context, path));
}

export function materializeGeneratorItem(spec: GeneratorSpec, entry: GeneratorEntry): MaterializedGeneratorItem {
  const title = renderGeneratorTemplate(spec.template.title, entry.context).trim().slice(0, 200);
  const body = renderGeneratorTemplate(spec.template.body, entry.context).slice(0, 50000);
  const tags = spec.template.tags.map((tag) => renderGeneratorTemplate(tag, entry.context).trim().toLowerCase()).filter(Boolean);

  return {
    title: title || "Untitled",
    body,
    isTask: spec.template.isTask,
    isDocumentation: spec.template.isDocumentation,
    isInterval: spec.template.isInterval,
    tags,
    taskStatus: spec.template.isTask ? "active" : null
  };
}

export function templateVariablesForSource(kind: GeneratorSourceKind): string[] {
  switch (kind) {
    case "range":
      return ["{index}"];
    case "dates":
      return ["{index}", "{date}"];
    case "strings":
      return ["{index}", "{value}"];
    case "items":
      return ["{index}", "{item.title}", "{item.body}", "{item.id}", "{item.tags}"];
  }
}

export function mergeOverriddenFields(current: string[], additions: string[]): string[] {
  return [...new Set([...current, ...additions])];
}
