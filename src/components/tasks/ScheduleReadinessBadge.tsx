import type { TaskScheduleReadiness } from "@shared/scheduling";

export function ScheduleReadinessBadge({ readiness }: { readiness: TaskScheduleReadiness }) {
  const { className, label } = badgeStyle(readiness);

  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

function badgeStyle(readiness: TaskScheduleReadiness): { className: string; label: string } {
  switch (readiness.status) {
    case "ready":
      return { className: "border-neutral-600 text-neutral-400", label: "Ready" };
    case "scheduled":
      return { className: "border-blue-700 text-blue-300", label: "Scheduled" };
    case "missing_info":
      return { className: "border-amber-700 text-amber-300", label: "Needs info" };
    case "no_feasible_interval":
      return { className: "border-orange-800 text-orange-300", label: "No slot" };
    case "excluded":
      if (readiness.reason === "fixed") {
        return { className: "border-neutral-700 text-neutral-500", label: "Fixed" };
      }
      return { className: "border-neutral-800 text-neutral-600", label: readiness.reason };
  }
}
