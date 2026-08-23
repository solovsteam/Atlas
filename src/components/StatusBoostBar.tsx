import type { PropertyFilter } from "@shared/relevance";
import { useRelevance } from "../context/RelevanceContext";

const PROPERTY_FILTERS: { value: PropertyFilter; label: string }[] = [
  { value: "notes", label: "notes" },
  { value: "active", label: "active" }
];

export function StatusBoostBar() {
  const { activePropertyFilter, togglePropertyFilter } = useRelevance();

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Property</p>
      <div className="flex flex-wrap gap-2">
        {PROPERTY_FILTERS.map(({ value, label }) => {
          const active = activePropertyFilter === value;
          return (
            <button
              className={
                active
                  ? "rounded-full border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                  : "rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-400"
              }
              key={value}
              type="button"
              onClick={() => togglePropertyFilter(value)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
