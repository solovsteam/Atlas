import type { Item } from "../../shared/item";
import { itemKindLabel } from "../../shared/item";

const KIND_STYLES: Record<string, string> = {
  note: "border-neutral-700 text-neutral-400",
  task: "border-sky-900 text-sky-400",
  documentation: "border-violet-900 text-violet-400"
};

function styleForItem(item: Item): string {
  if (item.isDocumentation) {
    return KIND_STYLES.documentation;
  }
  if (item.isTask) {
    return KIND_STYLES.task;
  }
  return KIND_STYLES.note;
}

export function ItemKindBadge({ item }: { item: Item }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${styleForItem(item)}`}>
      {itemKindLabel(item)}
    </span>
  );
}
