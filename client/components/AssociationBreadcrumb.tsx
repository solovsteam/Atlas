import { Link } from "lakebed/client";
import type { BreadcrumbSegment } from "../../shared/links";

export function AssociationBreadcrumb({ paths }: { paths: BreadcrumbSegment[][] }) {
  if (paths.length === 0) {
    return <p className="text-sm text-neutral-500">No association paths yet.</p>;
  }

  return (
    <div className="space-y-4">
      {paths.map((path, index) => (
        <div className="rounded border border-neutral-800 bg-neutral-950 p-3" key={index}>
          <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Path {index + 1}</p>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            {path.map((segment, segmentIndex) => (
              <span className="flex items-center gap-1" key={segment.id}>
                {segmentIndex > 0 ? <span className="text-neutral-600">/</span> : null}
                <Link className="rounded px-2 py-1 text-neutral-200 hover:bg-neutral-800 hover:text-white" to={`/item/${segment.id}`}>
                  {segment.title || "Untitled"}
                </Link>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
