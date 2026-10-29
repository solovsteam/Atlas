import type { Item, ItemPatch, TaskStatus } from "./item";
import type { ItemLink } from "./links";
import type { DocumentationEntry } from "./documentationEntries";

export type UndoOp =
  | { kind: "updateItem"; id: string; before: ItemPatch }
  | { kind: "setTaskStatus"; id: string; before: TaskStatus | null }
  | { kind: "createItem"; id: string }
  | { kind: "deleteItem"; snapshot: Item }
  | { kind: "createLink"; id: string }
  | { kind: "deleteLink"; snapshot: ItemLink }
  | { kind: "batchLinks"; created: ItemLink[]; deleted: ItemLink[] }
  | { kind: "createEntry"; entry: DocumentationEntry }
  | { kind: "updateEntry"; before: DocumentationEntry }
  | { kind: "deleteEntry"; snapshot: DocumentationEntry };
