import { Link } from "lakebed/client";
import type { Item } from "../../shared/item";

export function GeneratorBadge({ item, generator }: { item: Item; generator: Item | null }) {
  if (!item.generatedFromId || !generator) {
    return null;
  }

  return (
    <div className="mb-4 rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
      Generated from{" "}
      <Link className="font-medium text-white hover:underline" to={`/item/${generator.id}`}>
        {generator.title}
      </Link>
    </div>
  );
}
