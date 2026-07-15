import type { Item } from "./item";

export function subtasksOf(parentId: string, items: Item[]): Item[] {
  return items
    .filter((entry) => entry.parentTaskId === parentId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function parentTaskOf(item: Item, items: Item[]): Item | null {
  if (!item.parentTaskId) {
    return null;
  }
  const parent = items.find((entry) => entry.id === item.parentTaskId);
  if (!parent?.isTask) {
    return null;
  }
  return parent;
}

export function wouldCreateSubtaskCycle(itemId: string, parentTaskId: string, items: Item[]): boolean {
  let current: string | null = parentTaskId;
  const visited = new Set<string>();

  while (current) {
    if (current === itemId) {
      return true;
    }
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);
    const node = items.find((entry) => entry.id === current);
    current = node?.parentTaskId ? node.parentTaskId : null;
  }

  return false;
}

export function validateParentTaskAssignment(itemId: string, parentTaskId: string | null, items: Item[]): string | null {
  if (!parentTaskId) {
    return null;
  }

  if (parentTaskId === itemId) {
    return "A task cannot be its own parent";
  }

  const parent = items.find((entry) => entry.id === parentTaskId);
  if (!parent) {
    return "Parent task not found";
  }
  if (!parent.isTask) {
    return "Parent must be a task";
  }

  const child = items.find((entry) => entry.id === itemId);
  if (child && !child.isTask) {
    return "Only tasks can be subtasks";
  }

  if (wouldCreateSubtaskCycle(itemId, parentTaskId, items)) {
    return "That would create a circular subtask chain";
  }

  return null;
}

export function taskParentCandidates(item: Item, items: Item[], query: string): Item[] {
  const normalized = query.trim().toLowerCase();
  return items.filter((entry) => {
    if (entry.id === item.id) {
      return false;
    }
    if (!entry.isTask) {
      return false;
    }
    if (entry.parentTaskId === item.id) {
      return false;
    }
    if (wouldCreateSubtaskCycle(item.id, entry.id, items)) {
      return false;
    }
    if (!normalized) {
      return true;
    }
    return entry.title.toLowerCase().includes(normalized);
  });
}
