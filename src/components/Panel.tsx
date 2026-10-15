import type { ReactNode } from "react";
import { ChevronDownIcon } from "./icons";

/** A titled card that folds away, so secondary tools stay below the main content without taking its room. */
export function Panel({
  title,
  summary,
  defaultOpen = false,
  children
}: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group mb-3 rounded-2xl border border-neutral-800 bg-neutral-950" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium text-neutral-100">{title}</span>
        {summary ? <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{summary}</span> : <span className="flex-1" />}
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}
