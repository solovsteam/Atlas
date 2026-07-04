import { TASK_STATUSES } from "../../shared/item";
import { useRelevance } from "../context/RelevanceContext";

export function StatusBoostBar() {
  const { activeStatusBoosts, toggleStatusBoost } = useRelevance();

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Boost task status</p>
      <div className="flex flex-wrap gap-2">
        {TASK_STATUSES.map((status) => {
          const active = activeStatusBoosts.includes(status);
          return (
            <button
              className={
                active
                  ? "rounded-full border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                  : "rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-400"
              }
              key={status}
              type="button"
              onClick={() => toggleStatusBoost(status)}
            >
              {status}
            </button>
          );
        })}
      </div>
    </div>
  );
}
