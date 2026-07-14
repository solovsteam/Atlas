import type { ItemPatch, TaskStatus } from "./item";

export type UndoOp =
  | { kind: "updateItem"; id: string; before: ItemPatch; revision: number }
  | { kind: "setTaskStatus"; id: string; before: TaskStatus | null; revision: number };
