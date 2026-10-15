import { Link } from "react-router-dom";
import { useMemo } from "react";
import { buildReview } from "@shared/review";
import { useAtlasData } from "../context/AtlasDataContext";
import { Panel } from "./Panel";

const PREVIEW = 5;

export function ReviewPanel() {
  const { items, links } = useAtlasData();
  const review = useMemo(() => buildReview(items, links, new Date()), [items, links]);
  const empty = review.overdue.length + review.unscheduled.length + review.later.length === 0;
  if (empty) {
    return null;
  }

  return (
    <Panel
      defaultOpen={review.overdue.length > 0}
      summary={`${review.overdue.length} overdue · ${review.unscheduled.length} unscheduled · ${review.later.length} later`}
      title="Weekly look"
    >
      <p className="mb-4 text-sm text-neutral-400">
        Dates that slipped, next actions not on the calendar, and parked later items.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Bucket
          href="/tasks"
          items={review.overdue}
          title="Overdue"
          empty="None"
        />
        <Bucket
          href="/tasks"
          items={review.unscheduled}
          title="Unscheduled"
          empty="All placed or waiting on Now"
        />
        <Bucket href="/items" items={review.later} title="Later" empty="None parked" />
      </div>
    </Panel>
  );
}

function Bucket({
  title,
  items,
  empty,
  href
}: {
  title: string;
  items: { id: string; title: string }[];
  empty: string;
  href: string;
}) {
  const shown = items.slice(0, PREVIEW);
  const rest = items.length - shown.length;
  return (
    <div>
      <p className={`text-xs font-medium ${title === "Overdue" && items.length > 0 ? "text-rose-300" : "text-neutral-500"}`}>
        {title} · {items.length}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-600">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {shown.map((item) => (
            <li key={item.id}>
              <Link className="text-sm hover:underline" to={`/item/${item.id}`}>
                {item.title || "Untitled"}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rest > 0 ? (
        <Link className="mt-2 inline-block text-[11px] text-neutral-500 hover:text-white" to={href}>
          {rest} more
        </Link>
      ) : null}
    </div>
  );
}
