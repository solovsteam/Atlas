import type { Item, TaskStatus } from "./item";

export type UndoOp =
  | { kind: "updateItem"; id: string; before: Partial<Item>; after: Partial<Item> }
  | { kind: "linkItems"; fromId: string; toId: string }
  | { kind: "unlinkItems"; fromId: string; toId: string }
  | { kind: "setTaskStatus"; id: string; before: TaskStatus | null; after: TaskStatus | null };
