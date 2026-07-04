import { useRelevance } from "../context/RelevanceContext";

export function TagToggleBar() {
  const { allTags, activeTags, toggleTag } = useRelevance();

  if (allTags.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {allTags.map((tag) => {
        const active = activeTags.includes(tag);
        return (
          <button
            className={
              active
                ? "rounded-full border border-white bg-white px-3 py-1 text-xs font-medium text-black"
                : "rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-400"
            }
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
