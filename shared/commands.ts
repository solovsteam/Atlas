import type { Item, ItemPatch, TaskStatus } from "./item";
import type { ScheduleLinkChange } from "./scheduling/types";

export type UndoOp =
  | { kind: "updateItem"; id: string; before: ItemPatch }
  | { kind: "setTaskStatus"; id: string; before: TaskStatus | null }
  | { kind: "createItem"; id: string }
  | { kind: "deleteItem"; snapshot: Item }
  | { kind: "scheduleLinks"; changes: ScheduleLinkChange[] };
