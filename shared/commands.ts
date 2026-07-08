import type { ItemPatch, TaskStatus } from "./item";

export type UndoOp =
  | { kind: "updateItem"; id: string; before: ItemPatch; revision: number }
  | { kind: "linkItems"; fromId: string; toId: string; linkKind?: string }
  | { kind: "unlinkItems"; fromId: string; toId: string; linkKind?: string }
  | { kind: "setTaskStatus"; id: string; before: TaskStatus | null; revision: number };
